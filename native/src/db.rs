//! Typed queries over an already-migrated Remote read-only data source.
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use sqlx::ConnectOptions;
use sqlx::postgres::{PgConnectOptions, PgPool, PgPoolOptions};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};

const REVISION: &str = "0007_auth_maintenance";
const REVISION_QUERY: &str = "SELECT version_num FROM alembic_version LIMIT 2";

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("Unsupported database URL")]
    InvalidUrl,
    #[error("Database unavailable")]
    Unavailable,
    #[error("SQLite requires a closed, consistent database copy")]
    UnsafeSnapshot,
    #[error("Unsupported database revision")]
    RevisionMismatch,
    #[error("Database read failed")]
    QueryFailed,
}

#[derive(Clone)]
pub struct Db {
    pool: Pool,
}

#[derive(Clone)]
enum Pool {
    Postgres(PgPool),
    Sqlite(SqlitePool),
}

#[derive(sqlx::FromRow)]
pub struct SessionRow {
    pub session_id: String,
    pub principal_id: Option<String>,
    pub csrf_token: String,
    pub expires_at: f64,
    pub revoked: bool,
    pub auth_revision: i64,
    pub claimable_guest_id: Option<String>,
    pub user_principal_id: Option<String>,
    pub user_auth_revision: Option<i64>,
    pub active: Option<bool>,
    pub role: Option<String>,
    pub username: Option<String>,
    pub display_name: Option<String>,
}

#[derive(sqlx::FromRow)]
pub struct ProjectRow {
    pub sequence: i64,
    pub project_id: String,
    pub owner_id: String,
    pub name: String,
    pub description: String,
    pub created_at: f64,
    pub updated_at: f64,
    pub revision: i64,
    pub deleted: bool,
}

#[derive(sqlx::FromRow)]
pub struct CircuitRow {
    pub sequence: i64,
    pub document_id: String,
    pub project_id: String,
    pub owner_id: String,
    pub name: String,
    pub graph_schema_version: String,
    pub created_at: f64,
    pub updated_at: f64,
    pub revision: i64,
    pub deleted: bool,
}

#[derive(sqlx::FromRow)]
pub struct CircuitRevisionRow {
    pub document_id: String,
    pub revision: i64,
    pub name: String,
    pub graph_schema_version: String,
    #[sqlx(json)]
    pub graph: serde_json::Value,
    pub saved_by: String,
    pub saved_at: f64,
}

// SQLx checks each backend's encoders and decoders. Only the fixed SQL
// and parameters are shared, without a backend-neutral value conversion.
macro_rules! read_rows {
    ($db:expr, $fetch:ident, $query:expr, $($value:expr),+ $(,)?) => {{
        match &$db.pool {
            Pool::Postgres(pool) => sqlx::query_as($query)$(.bind($value))+.$fetch(pool).await,
            Pool::Sqlite(pool) => sqlx::query_as($query)$(.bind($value))+.$fetch(pool).await,
        }
        .map_err(|_| DbError::QueryFailed)
    }};
}

macro_rules! session_select {
    ($column:literal) => {
        concat!(
            "SELECT s.session_id, s.principal_id, s.csrf_token, s.expires_at, s.revoked,
                    CAST(s.auth_revision AS BIGINT) AS auth_revision, s.claimable_guest_id,
                    u.principal_id AS user_principal_id,
                    CAST(u.auth_revision AS BIGINT) AS user_auth_revision,
                    u.active, u.role, u.username, u.display_name
             FROM auth_sessions AS s
             LEFT JOIN auth_users AS u ON u.principal_id = s.principal_id
             WHERE ",
            $column,
            " = $1"
        )
    };
}
pub(super) use session_select;

impl Db {
    /// Open an existing database at the supported Alembic revision.
    ///
    /// SQLite requires a closed, consistent copy for the lifetime of this
    /// handle. The immutable connection cannot detect external changes.
    pub async fn open_readonly(url: &str) -> Result<Self, DbError> {
        let pool = if url.starts_with("sqlite:") {
            let options = sqlite_snapshot_options(url)?;
            let pool = SqlitePoolOptions::new()
                .connect_with(options)
                .await
                .map_err(|_| DbError::Unavailable)?;
            Pool::Sqlite(pool)
        } else {
            let url = if let Some(rest) = url.strip_prefix("postgresql+psycopg://") {
                format!("postgresql://{rest}")
            } else if url.starts_with("postgresql://") || url.starts_with("postgres://") {
                url.to_owned()
            } else {
                return Err(DbError::InvalidUrl);
            };
            let options = url
                .parse::<PgConnectOptions>()
                .map_err(|_| DbError::InvalidUrl)?
                .options([("default_transaction_read_only", "on")])
                .disable_statement_logging();
            let pool = PgPoolOptions::new()
                .after_connect(|connection, _| {
                    Box::pin(async move {
                        let read_only: bool = sqlx::query_scalar(
                            "SELECT current_setting('transaction_read_only')::boolean",
                        )
                        .fetch_one(connection)
                        .await?;
                        if !read_only {
                            return Err(sqlx::Error::Protocol(
                                "Remote shadow database connection is not read-only".into(),
                            ));
                        }
                        Ok(())
                    })
                })
                .connect_with(options)
                .await
                .map_err(|_| DbError::Unavailable)?;
            Pool::Postgres(pool)
        };
        let db = Self { pool };
        db.require_revision().await?;
        Ok(db)
    }

    async fn require_revision(&self) -> Result<(), DbError> {
        let revisions: Vec<String> = match &self.pool {
            Pool::Postgres(pool) => sqlx::query_scalar(REVISION_QUERY).fetch_all(pool).await,
            Pool::Sqlite(pool) => sqlx::query_scalar(REVISION_QUERY).fetch_all(pool).await,
        }
        .map_err(|_| DbError::RevisionMismatch)?;
        if revisions.as_slice() != [REVISION] {
            return Err(DbError::RevisionMismatch);
        }
        Ok(())
    }

    pub async fn session_by_token_hash(
        &self,
        token_hash: &str,
    ) -> Result<Option<SessionRow>, DbError> {
        read_rows!(
            self,
            fetch_optional,
            session_select!("s.token_hash"),
            token_hash,
        )
    }

    pub async fn session_by_id(&self, id: &str) -> Result<Option<SessionRow>, DbError> {
        read_rows!(self, fetch_optional, session_select!("s.session_id"), id,)
    }

    pub async fn project_by_id(&self, id: &str) -> Result<Option<ProjectRow>, DbError> {
        read_rows!(
            self,
            fetch_optional,
            "SELECT CAST(sequence AS BIGINT) AS sequence, project_id, owner_id, name,
                    description, created_at, updated_at, revision, deleted
             FROM projects WHERE project_id = $1",
            id,
        )
    }

    pub async fn list_projects(
        &self,
        owner: &str,
        after: i64,
        limit: i64,
    ) -> Result<Vec<ProjectRow>, DbError> {
        read_rows!(
            self,
            fetch_all,
            "SELECT CAST(sequence AS BIGINT) AS sequence, project_id, owner_id, name,
                    description, created_at, updated_at, revision, deleted
             FROM projects WHERE owner_id = $1 AND deleted = FALSE AND sequence > $2
             ORDER BY projects.sequence LIMIT $3",
            owner,
            after,
            limit,
        )
    }

    pub async fn circuit_by_id(&self, id: &str) -> Result<Option<CircuitRow>, DbError> {
        read_rows!(
            self,
            fetch_optional,
            "SELECT CAST(sequence AS BIGINT) AS sequence, document_id, project_id, owner_id,
                    name, graph_schema_version, created_at, updated_at, revision, deleted
             FROM circuit_documents WHERE document_id = $1",
            id,
        )
    }

    pub async fn list_circuits(
        &self,
        owner: &str,
        project: &str,
        after: i64,
        limit: i64,
    ) -> Result<Vec<CircuitRow>, DbError> {
        read_rows!(
            self,
            fetch_all,
            "SELECT CAST(sequence AS BIGINT) AS sequence, document_id, project_id, owner_id,
                    name, graph_schema_version, created_at, updated_at, revision, deleted
             FROM circuit_documents
             WHERE owner_id = $1 AND project_id = $2 AND deleted = FALSE AND sequence > $3
             ORDER BY circuit_documents.sequence LIMIT $4",
            owner,
            project,
            after,
            limit,
        )
    }

    pub async fn circuit_revision(
        &self,
        id: &str,
        revision: i64,
    ) -> Result<Option<CircuitRevisionRow>, DbError> {
        read_rows!(
            self,
            fetch_optional,
            "SELECT document_id, revision, name, graph_schema_version, graph, saved_by, saved_at
             FROM circuit_revisions WHERE document_id = $1 AND revision = $2",
            id,
            revision,
        )
    }
}

fn sqlite_snapshot_options(url: &str) -> Result<SqliteConnectOptions, DbError> {
    // SQLAlchemy's third slash separates the driver from the filename.
    // SQLx uses two slashes and treats the remaining path verbatim.
    let url = match url.strip_prefix("sqlite:///") {
        Some(filename) => format!("sqlite://{filename}"),
        None => url.to_owned(),
    };
    let options = url
        .parse::<SqliteConnectOptions>()
        .map_err(|_| DbError::InvalidUrl)?;
    let path = fs::canonicalize(options.get_filename()).map_err(|_| DbError::Unavailable)?;
    if !path.is_file() {
        return Err(DbError::Unavailable);
    }

    let wal = sidecar(&path, "-wal");
    if sidecar_size(&wal)? != 0 {
        return Err(DbError::UnsafeSnapshot);
    }
    let journal = sidecar(&path, "-journal");
    if sidecar_size(&journal)? != 0 {
        let mut header = [0u8; 8];
        File::open(journal)
            .and_then(|mut file| file.read_exact(&mut header))
            .map_err(|_| DbError::UnsafeSnapshot)?;
        // SQLite PERSIST mode can retain a journal whose header was zeroed
        // at commit. A nonzero header requires recovery before copying.
        if header != [0; 8] {
            return Err(DbError::UnsafeSnapshot);
        }
    }
    Ok(options
        .read_only(true)
        .create_if_missing(false)
        .in_memory(false)
        .immutable(true)
        .pragma("query_only", "ON")
        .disable_statement_logging())
}

fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(suffix);
    name.into()
}

fn sidecar_size(path: &Path) -> Result<u64, DbError> {
    match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => Ok(metadata.len()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(0),
        _ => Err(DbError::UnsafeSnapshot),
    }
}

#[cfg(test)]
mod readonly_tests;

pub(crate) mod write;
pub use write::{WriteDb, WriteTx};

pub mod migrations;

pub mod runtime;

pub mod authority;
mod stations;
pub(crate) use stations::StationLease;
