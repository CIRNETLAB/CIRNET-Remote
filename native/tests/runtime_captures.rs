use std::path::{Path, PathBuf};
use std::sync::Arc;

use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::db::WriteDb;
use cirnet_remote_native::db::runtime::{ExperimentRepository, RuntimeError};
use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

const OWNER: &str = "runtime-owner";

macro_rules! check_audit {
    ($pool:expr) => {{
        let rows: Vec<(String, Option<String>, String)> =
            sqlx::query_as("SELECT action, actor_id, subject_id FROM auth_audit ORDER BY sequence")
                .fetch_all($pool)
                .await
                .unwrap();
        assert_eq!(
            rows,
            [
                (
                    "CAPTURE_RETENTION".to_owned(),
                    None,
                    "capture-old".to_owned()
                ),
                (
                    "CAPTURE_DELETED".to_owned(),
                    Some(OWNER.to_owned()),
                    "capture-current".to_owned()
                ),
            ]
        );
    }};
}

async fn verify(url: &str) {
    let resources = std::env::var("CIRNET_CONTRACTS_ROOT").unwrap();
    let registry = Arc::new(Registry::load(Path::new(&resources)).unwrap());
    let db = WriteDb::open_existing(url).await.unwrap();
    let repo = ExperimentRepository::new(db, registry);
    let old = repo
        .capture_reference("capture-old", Some(OWNER))
        .await
        .unwrap();
    assert_eq!(old.owner_id, OWNER);
    assert_eq!(old.experiment_id, "capture-terminal");
    assert_eq!(old.created_at, 1.0);
    assert!(old.available);
    assert!(!old.cleanup_pending);
    assert!(matches!(
        repo.capture_reference("capture-old", Some("foreign")).await,
        Err(RuntimeError::Forbidden)
    ));
    assert!(matches!(
        repo.capture_reference("missing", None).await,
        Err(RuntimeError::CaptureNotFound)
    ));
    assert!(matches!(
        repo.expired_captures(Some(f64::NAN), 1).await,
        Err(RuntimeError::InvalidRetentionQuery)
    ));
    assert!(matches!(
        repo.expired_captures(Some(2.0), 1001).await,
        Err(RuntimeError::InvalidRetentionQuery)
    ));
    assert!(repo.expired_captures(None, 100).await.unwrap().is_empty());
    let expired: Vec<_> = repo
        .expired_captures(Some(2.0), 100)
        .await
        .unwrap()
        .into_iter()
        .map(|row| row.capture_id)
        .collect();
    assert_eq!(expired, ["capture-current", "capture-limit", "capture-old"]);

    let before = repo.get("capture-terminal").await.unwrap().unwrap().payload;
    let mut tx = repo.begin().await.unwrap();
    let retired = repo
        .retire_capture_in(&mut tx, "capture-old", OWNER, "RETENTION", None)
        .await
        .unwrap();
    assert!(retired.changed);
    assert!(!retired.reference.available);
    assert!(retired.reference.cleanup_pending);
    assert!(retired.reference.metadata["sha256"].is_null());
    tx.commit().await.unwrap();
    assert_eq!(
        repo.get("capture-terminal").await.unwrap().unwrap().payload,
        before
    );
    assert_eq!(
        repo.expired_captures(None, 100).await.unwrap()[0].capture_id,
        "capture-old"
    );
    assert!(
        !repo
            .finish_capture_cleanup("capture-current")
            .await
            .unwrap()
    );
    assert!(repo.finish_capture_cleanup("capture-old").await.unwrap());
    assert!(repo.expired_captures(None, 100).await.unwrap().is_empty());

    for id in ["capture-active", "capture-held"] {
        let mut tx = repo.begin().await.unwrap();
        assert!(matches!(
            repo.retire_capture_in(&mut tx, id, OWNER, "DELETED", Some(OWNER))
                .await,
            Err(RuntimeError::CaptureActive)
        ));
        tx.rollback().await.unwrap();
        assert!(
            repo.capture_reference(id, Some(OWNER))
                .await
                .unwrap()
                .available
        );
    }
    let mut tx = repo.begin().await.unwrap();
    assert!(matches!(
        repo.retire_capture_in(&mut tx, "capture-limit", OWNER, "DELETED", Some(OWNER))
            .await,
        Err(RuntimeError::RevisionLimit)
    ));
    tx.rollback().await.unwrap();
    assert!(
        repo.capture_reference("capture-limit", Some(OWNER))
            .await
            .unwrap()
            .available
    );

    let mut tx = repo.begin().await.unwrap();
    let retired = repo
        .retire_capture_in(&mut tx, "capture-current", OWNER, "DELETED", Some(OWNER))
        .await
        .unwrap();
    assert!(retired.changed);
    tx.commit().await.unwrap();
    let current = repo.get("capture-terminal").await.unwrap().unwrap().payload;
    assert_eq!(current["revision"], 4);
    assert_eq!(current["capture"], retired.reference.metadata);
    assert!(current["capture"]["payload_ref"].is_null());
    let mut tx = repo.begin().await.unwrap();
    assert!(
        !repo
            .retire_capture_in(&mut tx, "capture-current", OWNER, "DELETED", Some(OWNER))
            .await
            .unwrap()
            .changed
    );
    tx.commit().await.unwrap();

    if let Some(path) = url.strip_prefix("sqlite:///") {
        let pool = SqlitePoolOptions::new()
            .connect_with(SqliteConnectOptions::new().filename(path))
            .await
            .unwrap();
        check_audit!(&pool);
    } else {
        let pool = PgPoolOptions::new()
            .connect(&url.replacen("postgresql+psycopg://", "postgresql://", 1))
            .await
            .unwrap();
        check_audit!(&pool);
    }
}

#[tokio::test]
#[ignore = "requires fresh SQLite capture catalog fixture"]
async fn sqlite_runtime_captures() {
    let directory = PathBuf::from(std::env::var_os("CIRNET_REMOTE_RUNTIME_CAPTURE_DIR").unwrap());
    let path = directory.join("runtime.sqlite");
    verify(&format!(
        "sqlite:///{}",
        path.to_string_lossy().replace('\\', "/")
    ))
    .await;
}

#[tokio::test]
#[ignore = "requires fresh PostgreSQL capture catalog fixture"]
async fn postgres_runtime_captures() {
    verify(&std::env::var("CIRNET_REMOTE_RUNTIME_CAPTURE_PG").unwrap()).await;
}
