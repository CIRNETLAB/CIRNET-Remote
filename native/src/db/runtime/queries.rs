//! Indexed runtime reads and owner-scoped history.
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use serde_json::{Value, json};
use sqlx::types::Json;

use super::{
    ExperimentRepository, ExperimentRow, LEASE_FIELDS, LeaseRow, MAX_REVISION, RuntimeError,
};
use crate::db::{Db, DbError, Pool};

#[derive(Debug, sqlx::FromRow)]
pub struct ActiveExperiment {
    pub experiment_id: String,
    pub owner_id: String,
    pub control_session_id: Option<String>,
    pub control_client_id: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum RecoveryKind {
    Queued,
    LegacyCapture,
}

#[derive(Debug)]
pub struct ExperimentPage {
    pub items: Vec<Value>,
    pub next_cursor: Option<String>,
}

#[derive(sqlx::FromRow)]
struct HistoryRow {
    sequence: i64,
    priority: i32,
    #[sqlx(json)]
    payload: Value,
}

impl ExperimentRepository {
    pub async fn has_active_owner(&self, owner: &str) -> Result<bool, RuntimeError> {
        let (found,): (bool,) = read_rows!(
            self.db.reads(),
            fetch_one,
            "SELECT EXISTS (
                 SELECT 1 FROM lab_experiment_runtime r JOIN lab_experiments e
                 ON e.experiment_id = r.experiment_id WHERE r.active = TRUE AND e.owner_id = $1
             )",
            owner,
        )?;
        Ok(found)
    }

    pub async fn active_page(
        &self,
        owner: Option<&str>,
        session: Option<&str>,
        client: Option<&str>,
        after: &str,
        limit: usize,
    ) -> Result<Vec<ActiveExperiment>, RuntimeError> {
        Ok(read_rows!(
            self.db.reads(),
            fetch_all,
            "SELECT r.experiment_id, e.owner_id, r.control_session_id, r.control_client_id
             FROM lab_experiment_runtime r JOIN lab_experiments e
                  ON e.experiment_id = r.experiment_id
             WHERE r.active = TRUE AND r.experiment_id > $1
               AND ($2 IS NULL OR e.owner_id = $2)
               AND ($3 IS NULL OR r.control_session_id = $3)
               AND ($4 IS NULL OR r.control_client_id = $4)
             ORDER BY r.experiment_id LIMIT $5",
            after,
            owner,
            session,
            client,
            page_limit(limit)?,
        )?)
    }

    pub async fn lease(&self, id: &str) -> Result<Option<LeaseRow>, RuntimeError> {
        let sql = format!("SELECT {LEASE_FIELDS} FROM lab_leases WHERE experiment_id = $1");
        Ok(read_rows!(self.db.reads(), fetch_optional, &sql, id)?)
    }

    pub async fn leases_page(
        &self,
        after: &str,
        limit: usize,
    ) -> Result<Vec<LeaseRow>, RuntimeError> {
        let sql = format!(
            "SELECT {LEASE_FIELDS} FROM lab_leases WHERE experiment_id > $1
             ORDER BY experiment_id LIMIT $2"
        );
        Ok(read_rows!(
            self.db.reads(),
            fetch_all,
            &sql,
            after,
            page_limit(limit)?
        )?)
    }

    pub async fn admission_sequence(&self) -> Result<i64, RuntimeError> {
        const SQL: &str = "SELECT COALESCE(MAX(queue_sequence), 0) FROM lab_experiment_runtime";
        let db = self.db.reads();
        let sequence = match &db.pool {
            Pool::Postgres(pool) => sqlx::query_scalar(SQL).fetch_one(pool).await?,
            Pool::Sqlite(pool) => sqlx::query_scalar(SQL).fetch_one(pool).await?,
        };
        Ok(sequence)
    }

    pub async fn recovery_page(
        &self,
        kind: RecoveryKind,
        after: &str,
        limit: usize,
    ) -> Result<Vec<ExperimentRow>, RuntimeError> {
        let predicate = match kind {
            RecoveryKind::Queued => "r.state = 'QUEUED'",
            RecoveryKind::LegacyCapture => "r.legacy_capture = TRUE",
        };
        let sql = format!(
            "SELECT e.owner_id, e.payload FROM lab_experiment_runtime r
             JOIN lab_experiments e ON e.experiment_id = r.experiment_id
             WHERE {predicate} AND r.experiment_id > $1 ORDER BY r.experiment_id LIMIT $2"
        );
        Ok(read_rows!(
            self.db.reads(),
            fetch_all,
            &sql,
            after,
            page_limit(limit)?
        )?)
    }

    pub async fn list_owner(&self, owner: &str) -> Result<Vec<ExperimentRow>, RuntimeError> {
        Ok(read_rows!(
            self.db.reads(),
            fetch_all,
            "SELECT owner_id, payload FROM lab_experiments WHERE owner_id = $1 ORDER BY sequence",
            owner,
        )?)
    }

    pub async fn page(
        &self,
        owner: &str,
        limit: usize,
        cursor: Option<&str>,
        active: bool,
    ) -> Result<ExperimentPage, RuntimeError> {
        let limit_sql = page_limit(limit)? + 1;
        let kind = if active { "active" } else { "history" };
        let (sequence, priority) = parse_cursor(cursor, owner, kind)?
            .map_or((None, None), |(sequence, priority)| {
                (Some(sequence), Some(priority))
            });
        let held = "EXISTS (SELECT 1 FROM lab_leases l WHERE l.experiment_id = e.experiment_id)";
        let (priority_sql, active_sql) = if active {
            (
                format!("CASE WHEN r.state = 'CREATED' AND NOT {held} THEN 0 ELSE 1 END"),
                format!("AND (r.state NOT IN ('COMPLETE', 'FAULT') OR {held})"),
            )
        } else {
            ("1".to_owned(), String::new())
        };
        let sql = format!(
            "SELECT sequence, priority, payload FROM (
                 SELECT CAST(e.sequence AS BIGINT) AS sequence, e.payload, {priority_sql} AS priority
                 FROM lab_experiments e JOIN lab_experiment_runtime r
                      ON r.experiment_id = e.experiment_id
                 WHERE e.owner_id = $1 {active_sql}
             ) AS page
             WHERE ($2 IS NULL OR priority < $2 OR (priority = $2 AND sequence < $3))
             ORDER BY priority DESC, sequence DESC LIMIT $4"
        );
        let rows: Vec<HistoryRow> = read_rows!(
            self.db.reads(),
            fetch_all,
            &sql,
            owner,
            priority,
            sequence,
            limit_sql
        )?;
        let next_cursor = (rows.len() > limit).then(|| {
            let last = &rows[limit - 1];
            URL_SAFE_NO_PAD.encode(
                json!({"v":1, "kind":kind, "owner":owner, "after":last.sequence,
                       "priority":last.priority})
                .to_string(),
            )
        });
        Ok(ExperimentPage {
            items: rows
                .into_iter()
                .take(limit)
                .map(|row| row.payload)
                .collect(),
            next_cursor,
        })
    }
}

impl Db {
    pub(crate) async fn assignment_feedback_allowed(
        &self,
        owner: &str,
        assignment: &str,
    ) -> Result<bool, DbError> {
        let (allowed,): (bool,) = read_rows!(
            self,
            fetch_one,
            "SELECT EXISTS (
                 SELECT 1 FROM auth_users u WHERE u.principal_id = $1 AND u.active = TRUE
                   AND (u.role = 'ADMIN' OR (u.role = 'INSTRUCTOR' AND EXISTS (
                       SELECT 1 FROM lab_assignment_access a
                       WHERE a.assignment_id = $2 AND a.owner_id = $1
                   )))
             ) OR EXISTS (
                 SELECT 1 FROM lab_assignment_access a
                 WHERE a.assignment_id = $2 AND a.feedback_policy = 'detailed'
             )",
            owner,
            assignment,
        )?;
        Ok(allowed)
    }

    pub(crate) async fn legacy_assignment_value(&self, id: &str) -> Result<Option<Value>, DbError> {
        let row: Option<(Json<Value>,)> = read_rows!(
            self,
            fetch_optional,
            "SELECT payload FROM lab_assignments WHERE assignment_id = $1",
            id,
        )?;
        Ok(row.map(|(Json(value),)| value))
    }
}

fn page_limit(limit: usize) -> Result<i64, RuntimeError> {
    if !(1..=100).contains(&limit) {
        return Err(RuntimeError::InvalidPageLimit);
    }
    Ok(limit as i64)
}

fn parse_cursor(
    cursor: Option<&str>,
    owner: &str,
    kind: &str,
) -> Result<Option<(i64, i32)>, RuntimeError> {
    let Some(cursor) = cursor else {
        return Ok(None);
    };
    if cursor.is_empty() || cursor.len() > 1024 {
        return Err(RuntimeError::InvalidCursor);
    }
    let mut encoded = cursor.replace('-', "+").replace('_', "/");
    let padding = (4 - encoded.len() % 4) % 4;
    encoded.extend(std::iter::repeat_n('=', padding));
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| RuntimeError::InvalidCursor)?;
    let cursor: Value = serde_json::from_slice(&bytes).map_err(|_| RuntimeError::InvalidCursor)?;
    if cursor.as_object().is_none_or(|object| object.len() != 5)
        || cursor["v"].as_i64() != Some(1)
        || cursor["owner"].as_str() != Some(owner)
        || cursor["kind"].as_str() != Some(kind)
    {
        return Err(RuntimeError::InvalidCursor);
    }
    let after = cursor["after"]
        .as_i64()
        .filter(|value| (1..=MAX_REVISION).contains(value))
        .ok_or(RuntimeError::InvalidCursor)?;
    let priority = match (kind, cursor["priority"].as_i64()) {
        (_, Some(1)) => 1,
        ("active", Some(0)) => 0,
        _ => return Err(RuntimeError::InvalidCursor),
    };
    Ok(Some((after, priority)))
}
