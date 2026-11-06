//! Typed live pools and transactions for the explicitly writable Remote mode.
use std::sync::Arc;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions, Postgres};
use sqlx::sqlite::{Sqlite, SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{ConnectOptions, Transaction};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio::time::timeout;

use super::{Db, DbError, Pool, SessionRow};

#[derive(Clone)]
pub struct WriteDb {
    db: Db,
    sqlite_writer: Option<Arc<Semaphore>>,
}

pub struct WriteTx {
    pub(crate) inner: Tx,
    // Drop the SQLx transaction first. Its worker queues rollback on drop,
    // so SQLite can still hold its physical lock briefly after the permit returns.
    _sqlite_writer: Option<OwnedSemaphorePermit>,
}

pub(crate) enum Tx {
    Postgres(Transaction<'static, Postgres>),
    Sqlite(Transaction<'static, Sqlite>),
}

// Keep backend-specific bind/decode checks. SQLx errors stay within the crate
// so a domain caller can classify a constraint without exposing driver text.
macro_rules! tx_query {
    ($tx:expr, $query:ident, $fetch:ident, $sql:expr $(, $value:expr)* $(,)?) => {{
        match &mut $tx.inner {
            $crate::db::write::Tx::Postgres(tx) => ::sqlx::$query($sql)$(.bind($value))*.$fetch(&mut **tx).await,
            $crate::db::write::Tx::Sqlite(tx) => ::sqlx::$query($sql)$(.bind($value))*.$fetch(&mut **tx).await,
        }
    }};
}
pub(crate) use tx_query;

macro_rules! tx_execute {
    ($tx:expr, $sql:expr $(, $value:expr)* $(,)?) => {{
        match &mut $tx.inner {
            $crate::db::write::Tx::Postgres(tx) => ::sqlx::query($sql)$(.bind($value))*
                .execute(&mut **tx).await.map(|result| result.rows_affected()),
            $crate::db::write::Tx::Sqlite(tx) => ::sqlx::query($sql)$(.bind($value))*
                .execute(&mut **tx).await.map(|result| result.rows_affected()),
        }
    }};
}
pub(crate) use tx_execute;

impl WriteDb {
    /// Open an already-migrated database. Startup never creates or migrates it.
    pub async fn open_existing(url: &str) -> Result<Self, DbError> {
        let db = Self::open_unverified(url, false).await?;
        db.db.require_revision().await?;
        Ok(db)
    }

    pub(super) async fn open_unverified(url: &str, allow_create: bool) -> Result<Self, DbError> {
        let (pool, sqlite_writer) = if url.starts_with("sqlite:") {
            let options = sqlite_write_options(url, allow_create)?;
            let pool = SqlitePoolOptions::new()
                .connect_with(options)
                .await
                .map_err(|_| DbError::Unavailable)?;
            (Pool::Sqlite(pool), Some(Arc::new(Semaphore::new(1))))
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
                .disable_statement_logging();
            let pool = PgPoolOptions::new()
                .connect_with(options)
                .await
                .map_err(|_| DbError::Unavailable)?;
            (Pool::Postgres(pool), None)
        };
        Ok(Self {
            db: Db { pool },
            sqlite_writer,
        })
    }

    /// Typed reads share the live pool and observe committed mutations.
    pub fn reads(&self) -> Db {
        self.db.clone()
    }

    pub async fn begin(&self) -> Result<WriteTx, DbError> {
        let (inner, writer) = match &self.db.pool {
            Pool::Postgres(pool) => (
                Tx::Postgres(
                    pool.begin_with("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE")
                        .await
                        .map_err(|_| DbError::QueryFailed)?,
                ),
                None,
            ),
            Pool::Sqlite(pool) => {
                let gate = self.sqlite_writer.as_ref().ok_or(DbError::QueryFailed)?;
                // Waiting for the writer and checking out a connection share
                // the original pool acquisition budget. Reads skip this gate.
                let (writer, connection) = timeout(pool.options().get_acquire_timeout(), async {
                    let writer = Arc::clone(gate)
                        .acquire_owned()
                        .await
                        .map_err(|_| DbError::QueryFailed)?;
                    let connection = pool.acquire().await.map_err(|_| DbError::QueryFailed)?;
                    Ok::<_, DbError>((writer, connection))
                })
                .await
                .map_err(|_| DbError::QueryFailed)??;
                // Keep SQLite's driver-level lock and busy timeout for other pools.
                let tx = Transaction::begin(connection, Some("BEGIN IMMEDIATE".into()))
                    .await
                    .map_err(|_| DbError::QueryFailed)?;
                (Tx::Sqlite(tx), Some(writer))
            }
        };
        Ok(WriteTx {
            inner,
            _sqlite_writer: writer,
        })
    }
}

impl WriteTx {
    /// Acquire the live session's write fence and read its joined authority
    /// row in this same transaction. The auth layer evaluates the row.
    pub async fn fence_session(
        &mut self,
        id: &str,
        now: f64,
    ) -> Result<Option<SessionRow>, DbError> {
        let matched = tx_execute!(
            self,
            "UPDATE auth_sessions SET auth_revision = auth_revision
             WHERE session_id = $1 AND revoked = FALSE AND expires_at > $2
             RETURNING session_id",
            id,
            now,
        )
        .map_err(|_| DbError::QueryFailed)?;
        if matched == 0 {
            return Ok(None);
        }
        self.session_by_id(id).await
    }

    pub async fn session_by_id(&mut self, id: &str) -> Result<Option<SessionRow>, DbError> {
        tx_query!(
            self,
            query_as,
            fetch_optional,
            super::session_select!("s.session_id"),
            id,
        )
        .map_err(|_| DbError::QueryFailed)
    }

    pub async fn commit(self) -> Result<(), DbError> {
        let Self {
            inner,
            _sqlite_writer,
        } = self;
        match inner {
            Tx::Postgres(tx) => tx.commit().await,
            Tx::Sqlite(tx) => tx.commit().await,
        }
        .map_err(|_| DbError::QueryFailed)
    }

    pub async fn rollback(self) -> Result<(), DbError> {
        let Self {
            inner,
            _sqlite_writer,
        } = self;
        match inner {
            Tx::Postgres(tx) => tx.rollback().await,
            Tx::Sqlite(tx) => tx.rollback().await,
        }
        .map_err(|_| DbError::QueryFailed)
    }
}

fn sqlite_write_options(url: &str, allow_create: bool) -> Result<SqliteConnectOptions, DbError> {
    let url = match url.strip_prefix("sqlite:///") {
        Some(filename) => format!("sqlite://{filename}"),
        None => url.to_owned(),
    };
    if let Some((_, parameters)) = url.split_once('?') {
        let incompatible =
            url::form_urlencoded::parse(parameters.as_bytes()).any(|(key, value)| {
                matches!(
                    (key.as_ref(), value.as_ref()),
                    ("mode", "ro" | "memory") | ("immutable", "true" | "1")
                )
            });
        if incompatible {
            return Err(DbError::InvalidUrl);
        }
    }
    let options = url
        .parse::<SqliteConnectOptions>()
        .map_err(|_| DbError::InvalidUrl)?;
    let filename = options.get_filename();
    if filename.as_os_str().is_empty()
        || filename
            .to_string_lossy()
            .starts_with("file:sqlx-in-memory-")
    {
        return Err(DbError::InvalidUrl);
    }
    if !allow_create && !filename.is_file() {
        return Err(DbError::Unavailable);
    }
    Ok(options
        .create_if_missing(allow_create)
        .foreign_keys(true)
        .disable_statement_logging())
}
