//! Explicit forward migration using the existing Alembic revision marker.
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use sqlx::types::Json;

use super::REVISION;
use super::write::{Tx, WriteDb, WriteTx, tx_execute, tx_query};

mod schema;

const REVISIONS: [&str; 7] = [
    "0001_legacy",
    "0002_auth",
    "0003_projects",
    "0004_assignments",
    "0005_captures",
    "0006_experiment_runtime",
    REVISION,
];
const MIGRATION_LOCK: i64 = 0x4349_524e_4554;
const VERSION_DDL: &str = "CREATE TABLE alembic_version (
        version_num VARCHAR(32) NOT NULL,
        CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
    )";

#[derive(Debug, thiserror::Error)]
pub enum MigrationError {
    #[error("Unknown or branched database revision")]
    UnknownRevision,
    #[error("Incompatible legacy database schema")]
    IncompatibleLegacySchema,
    #[error("Incompatible existing experiment history index")]
    IncompatibleHistoryIndex,
    #[error("Duplicate historical capture identity")]
    DuplicateCapture,
    #[error("Invalid historical experiment payload")]
    InvalidPayload,
    #[error("Another native migration is active")]
    Busy,
    #[error("Database migration failed")]
    Database,
    #[error(transparent)]
    Db(#[from] super::DbError),
}

#[derive(Debug)]
pub struct MigrationReport {
    pub from: Option<&'static str>,
    pub to: &'static str,
    pub applied: usize,
}

impl From<sqlx::Error> for MigrationError {
    fn from(_: sqlx::Error) -> Self {
        Self::Database
    }
}

/// Migrate an isolated database forward and commit the schema and all
/// backfills together. Normal service startup does not call this function.
pub async fn migrate(url: &str) -> Result<MigrationReport, MigrationError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| MigrationError::Database)?
        .as_secs_f64();
    let db = WriteDb::open_unverified(url, true).await?;
    let mut tx = db.begin().await?;
    match migrate_transaction(&mut tx, now).await {
        Ok(report) => {
            tx.commit().await?;
            Ok(report)
        }
        Err(error) => {
            tx.rollback().await?;
            Err(error)
        }
    }
}

async fn migrate_transaction(
    tx: &mut WriteTx,
    now: f64,
) -> Result<MigrationReport, MigrationError> {
    if let Tx::Postgres(connection) = &mut tx.inner {
        let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock($1)")
            .bind(MIGRATION_LOCK)
            .fetch_one(&mut **connection)
            .await?;
        if !acquired {
            return Err(MigrationError::Busy);
        }
    }
    let mut version_table = table_exists(tx, "alembic_version").await?;
    let versions: Vec<String> = if version_table {
        tx_query!(
            tx,
            query_scalar,
            fetch_all,
            "SELECT version_num FROM alembic_version LIMIT 2"
        )?
    } else {
        Vec::new()
    };
    let index = match versions.as_slice() {
        [] => None,
        [version] => Some(
            REVISIONS
                .iter()
                .position(|known| *known == version)
                .ok_or(MigrationError::UnknownRevision)?,
        ),
        _ => return Err(MigrationError::UnknownRevision),
    };
    let from = index.map(|index| REVISIONS[index]);
    let start = index.map_or(0, |index| index + 1);
    let mut previous = from;
    for (index, &revision) in REVISIONS.iter().enumerate().skip(start) {
        apply(tx, index, now).await?;
        if !version_table {
            tx_execute!(tx, VERSION_DDL)?;
            version_table = true;
        }
        let rows = if let Some(old) = previous {
            tx_execute!(
                tx,
                "UPDATE alembic_version SET version_num = $1 WHERE version_num = $2",
                revision,
                old,
            )?
        } else {
            tx_execute!(
                tx,
                "INSERT INTO alembic_version (version_num) VALUES ($1)",
                revision,
            )?
        };
        if rows != 1 {
            return Err(MigrationError::UnknownRevision);
        }
        previous = Some(revision);
    }
    Ok(MigrationReport {
        from,
        to: REVISION,
        applied: REVISIONS.len() - start,
    })
}

async fn apply(tx: &mut WriteTx, index: usize, now: f64) -> Result<(), MigrationError> {
    match index {
        0 => adopt_legacy(tx).await,
        1 => {
            execute_ddl(tx, schema::V0002).await?;
            seed_auth(tx, now).await
        }
        2 => execute_ddl(tx, schema::V0003).await,
        3 => {
            let has_history_index = history_index(tx).await?;
            execute_ddl(tx, schema::V0004).await?;
            if !has_history_index {
                tx_execute!(tx, schema::HISTORY_INDEX)?;
            }
            seed_assignment_history(tx, now).await
        }
        4 => {
            execute_ddl(tx, schema::V0005).await?;
            seed_captures(tx, now).await
        }
        5 => {
            execute_ddl(tx, schema::V0006).await?;
            seed_runtime(tx).await
        }
        6 => execute_ddl(tx, schema::V0007).await,
        _ => unreachable!(),
    }
}

async fn execute_ddl(tx: &mut WriteTx, statements: &[&str]) -> Result<(), MigrationError> {
    let sequence_type = match &tx.inner {
        Tx::Postgres(_) => "SERIAL",
        Tx::Sqlite(_) => "INTEGER",
    };
    for statement in statements {
        if statement.contains("__CIRNET_SEQUENCE__") {
            let statement = statement.replace("__CIRNET_SEQUENCE__", sequence_type);
            tx_execute!(tx, &statement)?;
        } else {
            tx_execute!(tx, statement)?;
        }
    }
    Ok(())
}

async fn table_exists(tx: &mut WriteTx, name: &str) -> Result<bool, MigrationError> {
    let exists =
        match &mut tx.inner {
            Tx::Postgres(connection) => {
                sqlx::query_scalar(
                    "SELECT EXISTS (SELECT 1
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = current_schema() AND c.relname = $1
                   AND c.relkind IN ('r', 'p'))",
                )
                .bind(name)
                .fetch_one(&mut **connection)
                .await?
            }
            Tx::Sqlite(connection) => sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = $1)",
            )
            .bind(name)
            .fetch_one(&mut **connection)
            .await?,
        };
    Ok(exists)
}

async fn adopt_legacy(tx: &mut WriteTx) -> Result<(), MigrationError> {
    let mut missing = Vec::new();
    for table in schema::LEGACY {
        if !table_exists(tx, table.name).await? {
            missing.push(table.statement);
            continue;
        }
        let columns: Vec<String> = match &mut tx.inner {
            Tx::Postgres(connection) => {
                sqlx::query_scalar(
                    "SELECT CAST(column_name AS TEXT) FROM information_schema.columns
                     WHERE table_schema = current_schema() AND table_name = $1",
                )
                .bind(table.name)
                .fetch_all(&mut **connection)
                .await?
            }
            Tx::Sqlite(connection) => {
                sqlx::query_scalar("SELECT name FROM pragma_table_info($1)")
                    .bind(table.name)
                    .fetch_all(&mut **connection)
                    .await?
            }
        };
        if table
            .columns
            .iter()
            .any(|name| !columns.iter().any(|column| column == name))
        {
            return Err(MigrationError::IncompatibleLegacySchema);
        }
    }
    execute_ddl(tx, &missing).await
}

async fn seed_auth(tx: &mut WriteTx, now: f64) -> Result<(), MigrationError> {
    tx_execute!(
        tx,
        "INSERT INTO auth_principals (principal_id, kind, created_at)
         SELECT owner_id, CASE WHEN owner_id = 'legacy-system' THEN 'LEGACY_SYSTEM' ELSE 'GUEST' END, $1
         FROM (
             SELECT owner_id FROM lab_experiments
             UNION SELECT owner_id FROM lab_operations
             UNION SELECT session_id FROM lab_sessions
             UNION SELECT 'legacy-system'
         ) AS owners
         ORDER BY owner_id",
        now,
    )?;
    tx_execute!(
        tx,
        "INSERT INTO lab_assignment_access (assignment_id, owner_id, published, feedback_policy)
         SELECT assignment_id, 'legacy-system', FALSE, 'observed_only' FROM lab_assignments",
    )?;
    Ok(())
}

async fn history_index(tx: &mut WriteTx) -> Result<bool, MigrationError> {
    let index: Option<(Vec<String>, bool)> = match &mut tx.inner {
        Tx::Postgres(connection) => {
            sqlx::query_as(
                "SELECT ARRAY(
                     SELECT COALESCE(a.attname::text, '')
                     FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinal)
                     LEFT JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
                     WHERE k.ordinal <= i.indnkeyatts ORDER BY k.ordinal
                 ), i.indpred IS NOT NULL
                 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                 WHERE i.indrelid = to_regclass('lab_experiments')
                   AND c.relname = 'ix_lab_experiments_owner_sequence'",
            )
            .fetch_optional(&mut **connection)
            .await?
        }
        Tx::Sqlite(connection) => {
            let partial: Option<bool> = sqlx::query_scalar(
                "SELECT partial FROM pragma_index_list('lab_experiments')
                 WHERE name = 'ix_lab_experiments_owner_sequence'",
            )
            .fetch_optional(&mut **connection)
            .await?;
            match partial {
                Some(partial) => {
                    let names = sqlx::query_scalar(
                        "SELECT COALESCE(name, '')
                         FROM pragma_index_info('ix_lab_experiments_owner_sequence') ORDER BY seqno",
                    )
                    .fetch_all(&mut **connection)
                    .await?;
                    Some((names, partial))
                }
                None => None,
            }
        }
    };
    match index {
        None => Ok(false),
        Some((columns, false)) if columns.as_slice() == ["owner_id", "sequence"] => Ok(true),
        _ => Err(MigrationError::IncompatibleHistoryIndex),
    }
}

async fn seed_assignment_history(tx: &mut WriteTx, now: f64) -> Result<(), MigrationError> {
    tx_execute!(
        tx,
        "INSERT INTO assignment_revisions (assignment_id, revision, definition, saved_by, saved_at)
         SELECT a.assignment_id, 1, a.payload, p.owner_id, $1
         FROM lab_assignments a JOIN lab_assignment_access p ON p.assignment_id = a.assignment_id",
        now,
    )?;
    tx_execute!(
        tx,
        "INSERT INTO assignment_documents
             (assignment_id, revision, published_revision, created_at, updated_at)
         SELECT a.assignment_id, 1, CASE WHEN p.published THEN 1 ELSE NULL END, $1, $1
         FROM lab_assignments a JOIN lab_assignment_access p ON p.assignment_id = a.assignment_id",
        now,
    )?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct ExperimentSource {
    sequence: i64,
    experiment_id: String,
    #[sqlx(json)]
    payload: Value,
}

async fn experiment_page(
    tx: &mut WriteTx,
    after: Option<i64>,
) -> Result<Vec<ExperimentSource>, MigrationError> {
    let rows = if let Some(after) = after {
        tx_query!(
            tx,
            query_as,
            fetch_all,
            "SELECT CAST(sequence AS BIGINT) AS sequence, experiment_id, payload
             FROM lab_experiments WHERE sequence > $1 ORDER BY lab_experiments.sequence LIMIT 100",
            after,
        )?
    } else {
        tx_query!(
            tx,
            query_as,
            fetch_all,
            "SELECT CAST(sequence AS BIGINT) AS sequence, experiment_id, payload
             FROM lab_experiments ORDER BY lab_experiments.sequence LIMIT 100",
        )?
    };
    Ok(rows)
}

pub(super) fn sealed_capture(value: &Value) -> Option<(&str, bool)> {
    let id = value.get("capture_id")?.as_str()?;
    if id.is_empty() || value.get("samples").is_some() {
        return None;
    }
    let available = value.get("available")?.as_bool()?;
    let count = value.get("payload_byte_count")?.as_number()?.to_string();
    let digits = count.strip_prefix('-').unwrap_or(&count);
    if !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let zero = digits.bytes().all(|byte| byte == b'0');
    let valid = if available {
        !count.starts_with('-')
            && !zero
            && value
                .get("payload_ref")
                .and_then(Value::as_str)
                .is_some_and(|path| !path.is_empty())
            && value
                .get("sha256")
                .and_then(Value::as_str)
                .is_some_and(|hash| {
                    hash.len() == 64
                        && hash
                            .bytes()
                            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                })
    } else {
        zero && value.get("payload_ref").is_none_or(Value::is_null)
            && value.get("sha256").is_none_or(Value::is_null)
    };
    valid.then_some((id, available))
}

pub(super) fn capture_time(value: &Value, fallback: f64) -> f64 {
    let Some(stamp) = value.get("timestamp_ns").and_then(Value::as_str) else {
        return fallback;
    };
    if stamp.is_empty() || stamp.len() > 39 || !stamp.bytes().all(|byte| byte.is_ascii_digit()) {
        return fallback;
    }
    // Convert integer nanoseconds with one rounding step, as Python's int
    // division does. Converting the nanoseconds to f64 first rounds twice.
    let (seconds, fraction) = stamp.split_at(stamp.len().saturating_sub(9));
    let seconds = if seconds.is_empty() { "0" } else { seconds };
    format!("{seconds}.{fraction:0>9}")
        .parse::<f64>()
        .unwrap_or(fallback)
}

async fn seed_captures(tx: &mut WriteTx, now: f64) -> Result<(), MigrationError> {
    let mut after = None;
    loop {
        let rows = experiment_page(tx, after).await?;
        let Some(last) = rows.last() else {
            return Ok(());
        };
        after = Some(last.sequence);
        for row in rows {
            let payload = row
                .payload
                .as_object()
                .ok_or(MigrationError::InvalidPayload)?;
            let Some(value) = payload.get("capture") else {
                continue;
            };
            let Some((id, available)) = sealed_capture(value) else {
                continue;
            };
            let inserted = tx_execute!(
                tx,
                "INSERT INTO lab_captures
                     (capture_id, experiment_id, metadata, created_at, available, cleanup_pending)
                 VALUES ($1, $2, $3, $4, $5, FALSE)",
                id,
                &row.experiment_id,
                Json(value),
                capture_time(value, now),
                available,
            );
            if let Err(error) = inserted {
                if error
                    .as_database_error()
                    .is_some_and(|error| error.is_unique_violation())
                {
                    return Err(MigrationError::DuplicateCapture);
                }
                return Err(error.into());
            }
        }
    }
}

fn optional_text<'a>(value: &'a Value, key: &str) -> Result<Option<&'a str>, MigrationError> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value)),
        _ => Err(MigrationError::InvalidPayload),
    }
}

async fn seed_runtime(tx: &mut WriteTx) -> Result<(), MigrationError> {
    let mut after = 0;
    loop {
        let rows = experiment_page(tx, Some(after)).await?;
        let Some(last) = rows.last() else {
            return Ok(());
        };
        after = last.sequence;
        for row in rows {
            let payload = row.payload;
            if !payload.is_object() {
                return Err(MigrationError::InvalidPayload);
            }
            let state = match payload.get("state") {
                None => "FAULT",
                Some(Value::String(state)) => state,
                _ => return Err(MigrationError::InvalidPayload),
            };
            let active = !matches!(state, "COMPLETE" | "FAULT" | "CREATED");
            let sequence = match payload.get("_queue_sequence") {
                None => 0,
                Some(value) => value.as_i64().ok_or(MigrationError::InvalidPayload)?,
            };
            let legacy_capture = payload
                .get("capture")
                .and_then(Value::as_object)
                .is_some_and(|capture| capture.contains_key("samples"));
            tx_execute!(
                tx,
                "INSERT INTO lab_experiment_runtime
                     (experiment_id, state, active, station_id, control_session_id,
                      control_client_id, queue_sequence, legacy_capture)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                &row.experiment_id,
                state,
                active,
                optional_text(&payload, "station_id")?,
                optional_text(&payload, "_control_session_id")?,
                optional_text(&payload, "_control_client_id")?,
                sequence,
                legacy_capture,
            )?;
        }
    }
}
