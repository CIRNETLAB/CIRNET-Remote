use std::path::{Path, PathBuf};
use std::time::Duration;

use cirnet_remote_native::db::{DbError, WriteDb, WriteTx};
use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tokio::sync::oneshot;
use tokio::time::{sleep, timeout};

const FRESH: f64 = 1_800_000_000.0;
const EXPIRES: f64 = 1_900_000_000.125;
const REVOKE: &str = "UPDATE auth_sessions SET revoked = TRUE WHERE session_id = 'account-session'";

fn sqlite_url(path: &Path) -> String {
    format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"))
}

async fn assert_fence(tx: &mut WriteTx) {
    let row = tx
        .fence_session("account-session", FRESH)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row.principal_id.as_deref(), Some("stage4-db-owner"));
    assert_eq!(row.auth_revision, 7);
    assert_eq!(row.user_auth_revision, Some(7));
    assert_eq!(row.expires_at, EXPIRES);
    assert!(!row.revoked);
    assert!(
        tx.fence_session("account-session", EXPIRES)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        tx.fence_session("revoked-session", FRESH)
            .await
            .unwrap()
            .is_none()
    );
    assert!(tx.fence_session("missing", FRESH).await.unwrap().is_none());
    let joined = tx.session_by_id("account-session").await.unwrap().unwrap();
    assert_eq!(joined.expires_at, row.expires_at);
    assert_eq!(joined.auth_revision, row.auth_revision);
}

#[tokio::test]
async fn rejects_unsupported_write_url() {
    assert!(matches!(
        WriteDb::open_existing("mysql://example.invalid/stage4").await,
        Err(DbError::InvalidUrl)
    ));
}

#[tokio::test]
#[ignore = "requires isolated write copies in CIRNET_REMOTE_DB_WRITE_SQLITE_DIR"]
async fn sqlite_write_pool_shares_live_reads_and_serializes_revocation() {
    let directory = PathBuf::from(std::env::var_os("CIRNET_REMOTE_DB_WRITE_SQLITE_DIR").unwrap());
    let old = WriteDb::open_existing(&sqlite_url(&directory.join("wrong.sqlite"))).await;
    assert!(matches!(old, Err(DbError::RevisionMismatch)));
    let missing = directory.join("missing.sqlite");
    assert!(WriteDb::open_existing(&sqlite_url(&missing)).await.is_err());
    assert!(!missing.exists());

    let path = directory.join("legacy.sqlite");
    let db = WriteDb::open_existing(&sqlite_url(&path)).await.unwrap();
    let reads = db.reads();
    let observer = SqlitePoolOptions::new()
        .connect_with(SqliteConnectOptions::new().filename(&path))
        .await
        .unwrap();
    let mut tx = db.begin().await.unwrap();
    assert_fence(&mut tx).await;
    let (started, received) = oneshot::channel();
    let mut competing = tokio::spawn(async move {
        let mut connection = observer.acquire().await.unwrap();
        started.send(()).unwrap();
        sqlx::query(REVOKE)
            .execute(&mut *connection)
            .await
            .unwrap()
            .rows_affected()
    });
    received.await.unwrap();
    assert!(
        timeout(Duration::from_millis(150), &mut competing)
            .await
            .is_err()
    );
    let row = reads
        .session_by_token_hash(&"a".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert!(!row.revoked);
    tx.rollback().await.unwrap();
    assert_eq!(
        timeout(Duration::from_secs(5), competing)
            .await
            .unwrap()
            .unwrap(),
        1
    );
    let row = reads
        .session_by_token_hash(&"a".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert!(row.revoked);
    assert_eq!(row.auth_revision, 7);
    assert_eq!(row.expires_at, EXPIRES);
    let mut tx = db.begin().await.unwrap();
    assert!(
        tx.fence_session("account-session", FRESH)
            .await
            .unwrap()
            .is_none()
    );
    tx.commit().await.unwrap();
}

#[tokio::test]
#[ignore = "requires isolated write fixture in CIRNET_REMOTE_DB_WRITE_POSTGRES"]
async fn postgres_write_fence_blocks_independent_revocation() {
    let url = std::env::var("CIRNET_REMOTE_DB_WRITE_POSTGRES").unwrap();
    let db = WriteDb::open_existing(&url).await.unwrap();
    let reads = db.reads();
    let url = url.replacen("postgresql+psycopg://", "postgresql://", 1);
    let observer = PgPoolOptions::new().connect(&url).await.unwrap();
    let peer = observer.clone();
    let mut tx = db.begin().await.unwrap();
    assert_fence(&mut tx).await;

    let (started, received) = oneshot::channel();
    let competing = tokio::spawn(async move {
        let mut connection = peer.acquire().await.unwrap();
        let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        started.send(pid).unwrap();
        sqlx::query(REVOKE)
            .execute(&mut *connection)
            .await
            .unwrap()
            .rows_affected()
    });
    let pid = received.await.unwrap();
    let blocked = timeout(Duration::from_secs(3), async {
        loop {
            let blocked: bool = sqlx::query_scalar("SELECT cardinality(pg_blocking_pids($1)) > 0")
                .bind(pid)
                .fetch_one(&observer)
                .await
                .unwrap();
            if blocked {
                break;
            }
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await;
    let row = reads
        .session_by_token_hash(&"a".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert!(!row.revoked);
    tx.commit().await.unwrap();
    assert!(
        blocked.is_ok(),
        "PostgreSQL did not report the competing backend blocked"
    );
    assert_eq!(
        timeout(Duration::from_secs(5), competing)
            .await
            .unwrap()
            .unwrap(),
        1
    );
    let row = reads
        .session_by_token_hash(&"a".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert!(row.revoked);
    assert_eq!(row.auth_revision, 7);
    assert_eq!(row.expires_at, EXPIRES);
    let mut tx = db.begin().await.unwrap();
    assert!(
        tx.fence_session("account-session", FRESH)
            .await
            .unwrap()
            .is_none()
    );
    tx.commit().await.unwrap();
}
