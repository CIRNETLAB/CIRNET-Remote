//! Ownership-scoped capture catalog and durable tombstones.
use serde_json::{Value, json};
use sqlx::types::Json;

use super::{
    ExperimentRepository, MAX_REVISION, RuntimeError, complete, lock_experiment, now, tombstone,
    write_projection,
};
use crate::db::write::{Tx, tx_execute, tx_query};
use crate::db::{DbError, Pool, WriteTx};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CaptureReference {
    pub capture_id: String,
    pub experiment_id: String,
    pub owner_id: String,
    #[sqlx(json)]
    pub metadata: Value,
    pub created_at: f64,
    pub available: bool,
    pub cleanup_pending: bool,
}

#[derive(Debug)]
pub struct CaptureRetirement {
    pub reference: CaptureReference,
    pub changed: bool,
}

const CAPTURE_SELECT: &str = "SELECT c.capture_id, c.experiment_id, e.owner_id, c.metadata,
    c.created_at, c.available, c.cleanup_pending FROM lab_captures c
    JOIN lab_experiments e ON e.experiment_id = c.experiment_id";

impl ExperimentRepository {
    pub async fn capture_reference(
        &self,
        id: &str,
        owner: Option<&str>,
    ) -> Result<CaptureReference, RuntimeError> {
        let sql = format!("{CAPTURE_SELECT} WHERE c.capture_id = $1");
        let row: Option<CaptureReference> = read_rows!(self.db.reads(), fetch_optional, &sql, id)?;
        let row = row.ok_or(RuntimeError::CaptureNotFound)?;
        if owner.is_some_and(|owner| owner != row.owner_id) {
            return Err(RuntimeError::Forbidden);
        }
        Ok(row)
    }

    /// The caller holds any required session fence on this transaction and
    /// rolls back on error. Delete the exact payload bytes only after commit.
    pub async fn retire_capture_in(
        &self,
        tx: &mut WriteTx,
        id: &str,
        owner: &str,
        reason: &str,
        actor: Option<&str>,
    ) -> Result<CaptureRetirement, RuntimeError> {
        let experiment_id: Option<String> = tx_query!(
            tx,
            query_scalar,
            fetch_optional,
            "SELECT experiment_id FROM lab_captures WHERE capture_id = $1",
            id,
        )?;
        let experiment_id = experiment_id.ok_or(RuntimeError::CaptureNotFound)?;
        let parent = lock_experiment(tx, &experiment_id)
            .await?
            .ok_or(RuntimeError::CaptureNotFound)?;
        if parent.owner_id != owner {
            return Err(RuntimeError::Forbidden);
        }
        let suffix = match &tx.inner {
            Tx::Postgres(_) => " FOR UPDATE OF c",
            Tx::Sqlite(_) => "",
        };
        let sql =
            format!("{CAPTURE_SELECT} WHERE c.capture_id = $1 AND c.experiment_id = $2{suffix}");
        let reference: Option<CaptureReference> =
            tx_query!(tx, query_as, fetch_optional, &sql, id, &experiment_id,)?;
        let mut reference = reference.ok_or(RuntimeError::CaptureNotFound)?;
        let leased: bool = tx_query!(
            tx,
            query_scalar,
            fetch_one,
            "SELECT EXISTS (SELECT 1 FROM lab_leases WHERE experiment_id = $1)",
            &experiment_id,
        )?;
        if leased || !matches!(parent.payload["state"].as_str(), Some("COMPLETE" | "FAULT")) {
            return Err(RuntimeError::CaptureActive);
        }
        if !reference.available {
            return Ok(CaptureRetirement {
                reference,
                changed: false,
            });
        }

        let value = tombstone(&reference.metadata)?;
        let value = self
            .registry
            .validate("CaptureMetadata", "transport", &value)
            .map_err(|_| RuntimeError::InvalidCapture)?;
        let mut payload = parent.payload;
        if payload
            .pointer("/capture/capture_id")
            .and_then(Value::as_str)
            == Some(id)
        {
            let revision = match payload.get("revision") {
                None => Some(0),
                Some(value) => crate::numeric::bounded_integer(value, 0, MAX_REVISION - 1),
            }
            .ok_or(RuntimeError::RevisionLimit)?;
            payload["revision"] = json!(revision + 1);
            payload["capture"] = value.clone();
            let changed = tx_execute!(
                tx,
                "UPDATE lab_experiments SET payload = $1 WHERE experiment_id = $2",
                Json(&payload),
                &experiment_id,
            )?;
            if changed != 1 {
                return Err(RuntimeError::InvalidRecord);
            }
            write_projection(tx, &experiment_id, &payload, false).await?;
        }
        let changed = tx_execute!(
            tx,
            "UPDATE lab_captures SET metadata = $1, available = FALSE, cleanup_pending = TRUE
             WHERE capture_id = $2 AND available = TRUE",
            Json(&value),
            id,
        )?;
        if changed != 1 {
            return Err(RuntimeError::CaptureIdentityConflict);
        }
        let action = format!("CAPTURE_{}", reason.chars().take(64).collect::<String>());
        tx_execute!(
            tx,
            "INSERT INTO auth_audit (occurred_at, actor_id, action, subject_id) VALUES ($1, $2, $3, $4)",
            now()?,
            actor,
            action,
            id,
        )?;
        reference.metadata = value;
        reference.available = false;
        reference.cleanup_pending = true;
        Ok(CaptureRetirement {
            reference,
            changed: true,
        })
    }

    pub async fn finish_capture_cleanup(&self, id: &str) -> Result<bool, RuntimeError> {
        let mut tx = self.begin().await?;
        let result = tx_execute!(
            &mut tx,
            "UPDATE lab_captures SET cleanup_pending = FALSE
             WHERE capture_id = $1 AND available = FALSE",
            id,
        )
        .map(|rows| rows > 0)
        .map_err(RuntimeError::from);
        complete(tx, result).await
    }

    pub async fn expired_captures(
        &self,
        cutoff: Option<f64>,
        limit: usize,
    ) -> Result<Vec<CaptureReference>, RuntimeError> {
        if !(1..=1000).contains(&limit) || cutoff.is_some_and(|time| !time.is_finite()) {
            return Err(RuntimeError::InvalidRetentionQuery);
        }
        let db = self.db.reads();
        let state = match &db.pool {
            Pool::Postgres(_) => "e.payload->>'state'",
            Pool::Sqlite(_) => "json_extract(e.payload, '$.state')",
        };
        let sql = format!(
            "{CAPTURE_SELECT}
             WHERE (c.cleanup_pending = TRUE OR
                    ($1 IS NOT NULL AND c.available = TRUE AND c.created_at <= $1))
               AND ({state}) IN ('COMPLETE', 'FAULT')
               AND NOT EXISTS (SELECT 1 FROM lab_leases l WHERE l.experiment_id = e.experiment_id)
             ORDER BY c.created_at, c.capture_id LIMIT $2"
        );
        Ok(read_rows!(db, fetch_all, &sql, cutoff, limit as i64)?)
    }
}
