//! Durable experiment, lease and capture compare-and-swap operations.
use std::sync::Arc;

use cirnet_contracts_native::validation::Registry;
use serde_json::{Value, json};
use sqlx::types::Json;

use super::migrations::{capture_time, sealed_capture};
use super::write::{Tx, tx_execute, tx_query};
use super::{Db, DbError, Pool, WriteDb, WriteTx};

#[derive(Debug, thiserror::Error)]
pub enum RuntimeError {
    #[error(transparent)]
    Database(#[from] DbError),
    #[error("Invalid experiment record")]
    InvalidRecord,
    #[error("The experiment is not available to this principal")]
    Forbidden,
    #[error("Capture identity conflict")]
    CaptureIdentityConflict,
    #[error("Capture retired")]
    CaptureRetired,
    #[error("Invalid capture metadata")]
    InvalidCapture,
    #[error("Invalid recovery state")]
    InvalidRecoveryState,
    #[error("Invalid page limit")]
    InvalidPageLimit,
    #[error("Invalid page cursor")]
    InvalidCursor,
    #[error("Experiment document unavailable")]
    DocumentUnavailable,
    #[error("Operation identity already exists")]
    OperationConflict,
    #[error("Invalid operation record")]
    InvalidOperation,
    #[error("Experiment identity already exists")]
    ExperimentConflict,
    #[error("Capture not found")]
    CaptureNotFound,
    #[error("Capture is active or leased")]
    CaptureActive,
    #[error("Revision limit reached")]
    RevisionLimit,
    #[error("Invalid capture retention query")]
    InvalidRetentionQuery,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ExperimentRow {
    pub owner_id: String,
    #[sqlx(json)]
    pub payload: Value,
}

#[derive(Debug, Clone, PartialEq, sqlx::FromRow)]
pub struct LeaseRow {
    pub station_id: String,
    pub slot: i64,
    pub experiment_id: String,
    pub expires_at: f64,
    pub quarantined: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cas {
    Applied,
    Missing,
    Stale,
    Occupied,
    Quarantined,
}

#[derive(Debug, Clone, Copy)]
pub struct Expected<'a> {
    pub id: &'a str,
    pub revision: i64,
    pub generation: Option<&'a str>,
}

#[derive(Debug, Clone, Copy)]
pub struct Update<'a> {
    pub expected: Expected<'a>,
    pub payload: &'a Value,
}

#[derive(Debug, Clone, Copy)]
pub struct Reserve<'a> {
    pub expected: Expected<'a>,
    pub station_id: &'a str,
    pub slot: i64,
    pub expires_at: f64,
    pub payload: &'a Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LeaseOutcome {
    Release,
    Quarantine,
}

#[derive(Debug, Clone, Copy)]
pub struct Settle<'a> {
    pub expected: Expected<'a>,
    pub payload: &'a Value,
    pub lease: LeaseOutcome,
    pub recovery: bool,
}

const LEASE_FIELDS: &str =
    "station_id, CAST(slot AS BIGINT) AS slot, experiment_id, expires_at, quarantined";
const MAX_REVISION: i64 = 9_007_199_254_740_991;
const STATION_LOCK_NAMESPACE: i32 = 0x4349_524e;

impl From<sqlx::Error> for RuntimeError {
    fn from(_: sqlx::Error) -> Self {
        DbError::QueryFailed.into()
    }
}

#[derive(sqlx::FromRow)]
struct CaptureCatalog {
    experiment_id: String,
    #[sqlx(json)]
    metadata: Value,
    available: bool,
}

#[derive(Clone)]
pub struct ExperimentRepository {
    db: WriteDb,
    registry: Arc<Registry>,
}

impl ExperimentRepository {
    pub fn new(db: WriteDb, registry: Arc<Registry>) -> Self {
        Self { db, registry }
    }

    pub fn reads(&self) -> Db {
        self.db.reads()
    }

    pub async fn begin(&self) -> Result<WriteTx, RuntimeError> {
        Ok(self.db.begin().await?)
    }

    pub async fn get(&self, id: &str) -> Result<Option<ExperimentRow>, RuntimeError> {
        Ok(read_rows!(
            self.db.reads(),
            fetch_optional,
            "SELECT owner_id, payload FROM lab_experiments WHERE experiment_id = $1",
            id,
        )?)
    }

    pub async fn station_leases(&self, station: &str) -> Result<Vec<LeaseRow>, RuntimeError> {
        let sql =
            format!("SELECT {LEASE_FIELDS} FROM lab_leases WHERE station_id = $1 ORDER BY slot");
        Ok(read_rows!(self.db.reads(), fetch_all, &sql, station)?)
    }

    pub async fn update(&self, update: Update<'_>) -> Result<Cas, RuntimeError> {
        let mut tx = self.begin().await?;
        let result = self.update_in(&mut tx, update).await;
        complete(tx, result).await
    }

    /// The caller must roll back the enclosing transaction if this returns
    /// an error. Session authorization and command intent share this transaction.
    pub async fn update_in(
        &self,
        tx: &mut WriteTx,
        update: Update<'_>,
    ) -> Result<Cas, RuntimeError> {
        self.update_checked(tx, None, update).await
    }

    /// Like update_in, with ownership rechecked on the locked parent row
    /// after the caller has obtained the session fence.
    pub async fn update_owned_in(
        &self,
        tx: &mut WriteTx,
        owner: &str,
        update: Update<'_>,
    ) -> Result<Cas, RuntimeError> {
        self.update_checked(tx, Some(owner), update).await
    }

    async fn update_checked(
        &self,
        tx: &mut WriteTx,
        owner: Option<&str>,
        update: Update<'_>,
    ) -> Result<Cas, RuntimeError> {
        let Some(row) = lock_experiment(tx, update.expected.id).await? else {
            return Ok(Cas::Missing);
        };
        if owner.is_some_and(|owner| owner != row.owner_id) {
            return Err(RuntimeError::Forbidden);
        }
        if !matches_expected(&row, update.expected)? {
            return Ok(Cas::Stale);
        }
        validate_next(&row.payload, update, update.expected.generation)?;
        self.persist(tx, update.expected.id, update.payload).await?;
        Ok(Cas::Applied)
    }

    pub async fn reserve(&self, request: Reserve<'_>) -> Result<Cas, RuntimeError> {
        let mut tx = self.begin().await?;
        let result = self.reserve_in(&mut tx, request).await;
        complete(tx, result).await
    }

    async fn reserve_in(
        &self,
        tx: &mut WriteTx,
        request: Reserve<'_>,
    ) -> Result<Cas, RuntimeError> {
        let Some(row) = lock_experiment(tx, request.expected.id).await? else {
            return Ok(Cas::Missing);
        };
        if !matches_expected(&row, request.expected)?
            || row.payload["state"] != "QUEUED"
            || row.payload["station_id"].as_str() != Some(request.station_id)
        {
            return Ok(Cas::Stale);
        }
        let next_generation = generation(request.payload)?.ok_or(RuntimeError::InvalidRecord)?;
        let slot = i32::try_from(request.slot).map_err(|_| RuntimeError::InvalidRecord)?;
        if request.expected.generation == Some(next_generation)
            || request.payload["state"] != "RESERVED"
            || slot < 0
            || !request.expires_at.is_finite()
            || request.payload["lease_expires_at"].as_f64() != Some(request.expires_at)
        {
            return Err(RuntimeError::InvalidRecord);
        }
        validate_next(
            &row.payload,
            Update {
                expected: request.expected,
                payload: request.payload,
            },
            Some(next_generation),
        )?;

        // All native lease changes on a station take this lock after the
        // experiment parent. No transaction waits for another parent.
        lock_station(tx, request.station_id).await?;
        let quarantined: bool = tx_query!(
            tx,
            query_scalar,
            fetch_one,
            "SELECT EXISTS (
                 SELECT 1 FROM lab_leases WHERE station_id = $1 AND quarantined = TRUE
             )",
            request.station_id,
        )?;
        if quarantined {
            return Ok(Cas::Quarantined);
        }
        let inserted = tx_execute!(
            tx,
            "INSERT INTO lab_leases (station_id, slot, experiment_id, expires_at, quarantined)
             VALUES ($1, $2, $3, $4, FALSE) ON CONFLICT DO NOTHING",
            request.station_id,
            slot,
            request.expected.id,
            request.expires_at,
        )?;
        if inserted == 0 {
            return Ok(Cas::Occupied);
        }
        self.persist(tx, request.expected.id, request.payload)
            .await?;
        Ok(Cas::Applied)
    }

    /// Release is only for the worker that has proved safe cleanup of
    /// this exact reservation. Quarantine retains the durable lease.
    pub async fn settle(&self, request: Settle<'_>) -> Result<Cas, RuntimeError> {
        let mut tx = self.begin().await?;
        let result = self.settle_in(&mut tx, request).await;
        complete(tx, result).await
    }

    async fn settle_in(&self, tx: &mut WriteTx, request: Settle<'_>) -> Result<Cas, RuntimeError> {
        let Some(row) = lock_experiment(tx, request.expected.id).await? else {
            return Ok(Cas::Missing);
        };
        if !matches_expected(&row, request.expected)? {
            return Ok(Cas::Stale);
        }
        validate_next(
            &row.payload,
            Update {
                expected: request.expected,
                payload: request.payload,
            },
            if request.recovery {
                None
            } else {
                request.expected.generation
            },
        )?;
        let state = request.payload["state"].as_str();
        if request.recovery
            && (state != Some("FAULT") || request.payload["error_code"] != "RESTART_RECOVERY")
        {
            return Err(RuntimeError::InvalidRecoveryState);
        }
        if !matches!(state, Some("COMPLETE" | "FAULT"))
            || (request.lease == LeaseOutcome::Quarantine && state != Some("FAULT"))
            || request
                .payload
                .get("lease_expires_at")
                .is_some_and(|value| !value.is_null())
        {
            return Err(RuntimeError::InvalidRecord);
        }
        let station: Option<String> = tx_query!(
            tx,
            query_scalar,
            fetch_optional,
            "SELECT station_id FROM lab_leases WHERE experiment_id = $1",
            request.expected.id,
        )?;
        let Some(station) = station else {
            return Ok(Cas::Stale);
        };
        lock_station(tx, &station).await?;
        self.persist(tx, request.expected.id, request.payload)
            .await?;
        let affected = match request.lease {
            LeaseOutcome::Release => tx_execute!(
                tx,
                "DELETE FROM lab_leases WHERE experiment_id = $1",
                request.expected.id,
            )?,
            LeaseOutcome::Quarantine => tx_execute!(
                tx,
                "UPDATE lab_leases SET quarantined = TRUE WHERE experiment_id = $1",
                request.expected.id,
            )?,
        };
        if affected != 1 {
            return Err(RuntimeError::InvalidRecord);
        }
        if request.recovery {
            let action = match request.lease {
                LeaseOutcome::Release => "EXPERIMENT_RESTART_RECOVERED",
                LeaseOutcome::Quarantine => "EXPERIMENT_RESTART_QUARANTINED",
            };
            tx_execute!(
                tx,
                "INSERT INTO auth_audit (occurred_at, actor_id, action, subject_id)
                     VALUES ($1, NULL, $2, $3)",
                now()?,
                action,
                request.expected.id,
            )?;
        }
        Ok(Cas::Applied)
    }

    async fn persist(
        &self,
        tx: &mut WriteTx,
        id: &str,
        payload: &Value,
    ) -> Result<(), RuntimeError> {
        let changed = tx_execute!(
            tx,
            "UPDATE lab_experiments SET payload = $1 WHERE experiment_id = $2",
            Json(payload),
            id,
        )?;
        if changed != 1 {
            return Err(RuntimeError::InvalidRecord);
        }
        write_projection(tx, id, payload, false).await?;
        self.sync_capture(tx, id, payload.get("capture")).await
    }

    async fn sync_capture(
        &self,
        tx: &mut WriteTx,
        id: &str,
        metadata: Option<&Value>,
    ) -> Result<(), RuntimeError> {
        let Some(value) = metadata else {
            return Ok(());
        };
        let Some(capture_id) = value.get("capture_id").and_then(Value::as_str) else {
            return Ok(());
        };
        let suffix = match &tx.inner {
            Tx::Postgres(_) => " FOR UPDATE",
            Tx::Sqlite(_) => "",
        };
        let sql = format!(
            "SELECT experiment_id, metadata, available
             FROM lab_captures WHERE capture_id = $1{suffix}"
        );
        let existing: Option<CaptureCatalog> =
            tx_query!(tx, query_as, fetch_optional, &sql, capture_id)?;
        let Some((_, available)) = sealed_capture(value) else {
            return if existing.is_some() {
                Err(RuntimeError::CaptureIdentityConflict)
            } else {
                Ok(())
            };
        };
        let metadata = self
            .registry
            .validate("CaptureMetadata", "transport", value)
            .map_err(|_| RuntimeError::InvalidCapture)?;
        let Some(existing) = existing else {
            tx_execute!(
                tx,
                "INSERT INTO lab_captures
                     (capture_id, experiment_id, metadata, created_at, available, cleanup_pending)
                 VALUES ($1, $2, $3, $4, $5, FALSE)",
                capture_id,
                id,
                Json(&metadata),
                capture_time(&metadata, now()?),
                available,
            )
            .map_err(|error| {
                if error
                    .as_database_error()
                    .is_some_and(|error| error.is_unique_violation())
                {
                    RuntimeError::CaptureIdentityConflict
                } else {
                    error.into()
                }
            })?;
            return Ok(());
        };
        if existing.experiment_id != id {
            return Err(RuntimeError::CaptureIdentityConflict);
        }
        if !existing.available && available {
            return Err(RuntimeError::CaptureRetired);
        }
        if existing.metadata == metadata {
            return Ok(());
        }
        if existing.available && tombstone(&existing.metadata)? == metadata {
            tx_execute!(
                tx,
                "UPDATE lab_captures SET metadata = $1, available = FALSE, cleanup_pending = TRUE
                 WHERE capture_id = $2",
                Json(&metadata),
                capture_id,
            )?;
            return Ok(());
        }
        Err(RuntimeError::CaptureIdentityConflict)
    }
}

async fn write_projection(
    tx: &mut WriteTx,
    id: &str,
    payload: &Value,
    insert: bool,
) -> Result<(), RuntimeError> {
    let state = payload["state"]
        .as_str()
        .ok_or(RuntimeError::InvalidRecord)?;
    let active = !matches!(state, "COMPLETE" | "FAULT" | "CREATED");
    let legacy_capture = payload
        .get("capture")
        .and_then(Value::as_object)
        .is_some_and(|capture| capture.contains_key("samples"));
    let queue_sequence = match payload.get("_queue_sequence") {
        None => 0,
        Some(value) => value.as_i64().ok_or(RuntimeError::InvalidRecord)?,
    };
    let sql = if insert {
        "INSERT INTO lab_experiment_runtime
             (state, active, station_id, control_session_id, control_client_id,
              queue_sequence, legacy_capture, experiment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"
    } else {
        "UPDATE lab_experiment_runtime
         SET state = $1, active = $2, station_id = $3, control_session_id = $4,
             control_client_id = $5, queue_sequence = $6, legacy_capture = $7
         WHERE experiment_id = $8"
    };
    let rows = tx_execute!(
        tx,
        sql,
        state,
        active,
        optional_text(payload, "station_id")?,
        optional_text(payload, "_control_session_id")?,
        optional_text(payload, "_control_client_id")?,
        queue_sequence,
        legacy_capture,
        id,
    )?;
    if rows != 1 {
        return Err(RuntimeError::InvalidRecord);
    }
    Ok(())
}

async fn lock_experiment(
    tx: &mut WriteTx,
    id: &str,
) -> Result<Option<ExperimentRow>, RuntimeError> {
    let suffix = match &tx.inner {
        Tx::Postgres(_) => " FOR NO KEY UPDATE",
        Tx::Sqlite(_) => "",
    };
    let sql =
        format!("SELECT owner_id, payload FROM lab_experiments WHERE experiment_id = $1{suffix}");
    Ok(tx_query!(tx, query_as, fetch_optional, &sql, id)?)
}

async fn lock_station(tx: &mut WriteTx, station: &str) -> Result<(), RuntimeError> {
    if let Tx::Postgres(connection) = &mut tx.inner {
        sqlx::query("SELECT pg_advisory_xact_lock($1, hashtext($2))")
            .bind(STATION_LOCK_NAMESPACE)
            .bind(station)
            .execute(&mut **connection)
            .await?;
    }
    Ok(())
}

fn revision(payload: &Value) -> Result<i64, RuntimeError> {
    match payload.get("revision") {
        None => Ok(0),
        Some(value) => value
            .as_i64()
            .filter(|value| (0..=MAX_REVISION).contains(value))
            .ok_or(RuntimeError::InvalidRecord),
    }
}

fn optional_text<'a>(payload: &'a Value, key: &str) -> Result<Option<&'a str>, RuntimeError> {
    match payload.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value)),
        _ => Err(RuntimeError::InvalidRecord),
    }
}

fn generation(payload: &Value) -> Result<Option<&str>, RuntimeError> {
    optional_text(payload, "_reservation_generation")
}

fn matches_expected(row: &ExperimentRow, expected: Expected<'_>) -> Result<bool, RuntimeError> {
    Ok(revision(&row.payload)? == expected.revision
        && generation(&row.payload)? == expected.generation)
}

fn validate_next(
    current: &Value,
    update: Update<'_>,
    expected_generation: Option<&str>,
) -> Result<(), RuntimeError> {
    let next = update.payload;
    if next["experiment_id"].as_str() != Some(update.expected.id)
        || next["state"].as_str().is_none_or(str::is_empty)
        || revision(next)? <= update.expected.revision
        || generation(next)? != expected_generation
        || optional_text(next, "station_id")? != optional_text(current, "station_id")?
    {
        return Err(RuntimeError::InvalidRecord);
    }
    Ok(())
}

fn tombstone(metadata: &Value) -> Result<Value, RuntimeError> {
    let mut retired = metadata
        .as_object()
        .cloned()
        .ok_or(RuntimeError::InvalidCapture)?;
    retired.insert("available".into(), json!(false));
    retired.insert("payload_ref".into(), Value::Null);
    retired.insert("payload_byte_count".into(), json!(0));
    retired.insert("sha256".into(), Value::Null);
    Ok(Value::Object(retired))
}

fn now() -> Result<f64, RuntimeError> {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|time| time.as_secs_f64())
        .map_err(|_| DbError::QueryFailed.into())
}

async fn complete<T>(tx: WriteTx, result: Result<T, RuntimeError>) -> Result<T, RuntimeError> {
    match result {
        Ok(value) => {
            tx.commit().await?;
            Ok(value)
        }
        Err(error) => {
            tx.rollback().await?;
            Err(error)
        }
    }
}

mod operations;
mod queries;
pub use operations::{Create, OperationInsert, OperationKey, OperationRow, OperationUpdate};
pub use queries::{ActiveExperiment, ExperimentPage, RecoveryKind};

mod captures;
pub use captures::{CaptureReference, CaptureRetirement};
