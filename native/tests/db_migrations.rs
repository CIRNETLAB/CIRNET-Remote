use std::path::{Path, PathBuf};

use cirnet_remote_native::db::WriteDb;
use cirnet_remote_native::db::migrations::{MigrationError, migrate};
use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

const HEAD: &str = "0007_auth_maintenance";
const RAW_SEALED: &str = concat!(
    r#"{"state" : "COMPLETE", "label":"Mạch", "capture":{"capture_id":"migration-sealed","#,
    r#""available":true,"payload_byte_count":7,"payload_ref":"captures/sealed.ncap","#,
    r#""sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","#,
    r#""timestamp_ns":"1700000000000000125"}}"#,
);
const REVISIONS: [&str; 7] = [
    "0001_legacy",
    "0002_auth",
    "0003_projects",
    "0004_assignments",
    "0005_captures",
    "0006_experiment_runtime",
    HEAD,
];

fn sqlite_fixture_dir() -> PathBuf {
    std::env::var_os("CIRNET_REMOTE_DB_MIGRATION_SQLITE_DIR")
        .unwrap()
        .into()
}

fn sqlite_url(path: &Path) -> String {
    format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"))
}

macro_rules! check_migrated {
    ($pool:expr, $published:expr) => {{
        let revision: String = sqlx::query_scalar("SELECT version_num FROM alembic_version")
            .fetch_one($pool).await.unwrap();
        assert_eq!(revision, HEAD);
        let payload: String = sqlx::query_scalar("SELECT CAST(payload AS TEXT) FROM lab_experiments WHERE experiment_id = 'migration-sealed'")
            .fetch_one($pool).await.unwrap();
        assert_eq!(payload, RAW_SEALED);
        let owners: Vec<(String, String)> = sqlx::query_as("SELECT principal_id, kind FROM auth_principals ORDER BY principal_id")
            .fetch_all($pool).await.unwrap();
        assert_eq!(owners, [
            ("legacy-system".to_owned(), "LEGACY_SYSTEM".to_owned()),
            ("migration-cookie".to_owned(), "GUEST".to_owned()),
            ("migration-guest".to_owned(), "GUEST".to_owned()),
            ("migration-orphan".to_owned(), "GUEST".to_owned()),
        ]);
        let assignment: (i64, Option<i64>, String) = sqlx::query_as(
            "SELECT d.revision, d.published_revision, CAST(r.definition AS TEXT)
             FROM assignment_documents d JOIN assignment_revisions r
             ON r.assignment_id = d.assignment_id AND r.revision = d.revision
             WHERE d.assignment_id = 'migration-assignment'")
            .fetch_one($pool).await.unwrap();
        assert_eq!(assignment.0, 1);
        assert_eq!(assignment.1, if $published { Some(1) } else { None });
        let json: serde_json::Value = serde_json::from_str(&assignment.2).unwrap();
        assert_eq!(json["custom"], serde_json::json!([1, null, true]));

        let captures: Vec<(String, bool, bool)> = sqlx::query_as(
            "SELECT capture_id, available, cleanup_pending FROM lab_captures ORDER BY capture_id")
            .fetch_all($pool).await.unwrap();
        assert_eq!(captures, [
            ("migration-sealed".to_owned(), true, false),
            ("migration-tombstone".to_owned(), false, false),
        ]);
        let captured_at: f64 = sqlx::query_scalar(
            "SELECT created_at FROM lab_captures WHERE capture_id = 'migration-sealed'")
            .fetch_one($pool).await.unwrap();
        assert_eq!(captured_at, 1_700_000_000.000_000_2);
        let runtime: (String, bool, i64, bool, String, String, String) = sqlx::query_as(
            "SELECT state, active, queue_sequence, legacy_capture, station_id, control_session_id, control_client_id
             FROM lab_experiment_runtime WHERE experiment_id = 'migration-inline'")
            .fetch_one($pool).await.unwrap();
        assert_eq!(runtime, ("RUNNING".to_owned(), true, 9_007_199_254_740_991, true,
            "migration-station".to_owned(), "migration-session".to_owned(), "migration-client".to_owned()));
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM lab_experiment_runtime")
            .fetch_one($pool).await.unwrap();
        assert_eq!(total, 107);
        let fallback: (String, bool) = sqlx::query_as(
            "SELECT state, active FROM lab_experiment_runtime WHERE experiment_id = 'migration-fault'")
            .fetch_one($pool).await.unwrap();
        assert_eq!(fallback, ("FAULT".to_owned(), false));
        let lease: (bool, f64) = sqlx::query_as(
            "SELECT quarantined, expires_at FROM lab_leases WHERE experiment_id = 'migration-inline'")
            .fetch_one($pool).await.unwrap();
        assert_eq!(lease, (true, 1_700_000_001.5));
        let operation: String = sqlx::query_scalar("SELECT CAST(payload AS TEXT) FROM lab_operations WHERE operation_key = 'old-key'")
            .fetch_one($pool).await.unwrap();
        let json: serde_json::Value = serde_json::from_str(&operation).unwrap();
        assert_eq!(json["extension"]["retained"], true);
    }};
}

#[tokio::test]
#[ignore = "requires isolated Python migration fixtures in CIRNET_REMOTE_DB_MIGRATION_SQLITE_DIR"]
async fn sqlite_migrates_fresh_unversioned_and_every_historical_revision() {
    let directory = sqlite_fixture_dir();
    let fresh = sqlite_url(&directory.join("fresh.sqlite"));
    let report = migrate(&fresh).await.unwrap();
    assert_eq!((report.from, report.to, report.applied), (None, HEAD, 7));
    assert!(WriteDb::open_existing(&fresh).await.is_ok());

    for rank in 0usize..=7 {
        let filename = if rank == 0 {
            "legacy.sqlite".into()
        } else {
            format!("r{rank:04}.sqlite")
        };
        let path = directory.join(filename);
        let url = sqlite_url(&path);
        let report = migrate(&url).await.unwrap();
        let from = rank.checked_sub(1).map(|index| REVISIONS[index]);
        assert_eq!(
            (report.from, report.to, report.applied),
            (from, HEAD, 7 - rank)
        );
        let pool = SqlitePoolOptions::new()
            .connect_with(SqliteConnectOptions::new().filename(&path).read_only(true))
            .await
            .unwrap();
        check_migrated!(&pool, rank >= 2);
        let repeat = migrate(&url).await.unwrap();
        assert_eq!(
            (repeat.from, repeat.to, repeat.applied),
            (Some(HEAD), HEAD, 0)
        );
        pool.close().await;
    }
}

#[tokio::test]
#[ignore = "requires isolated negative SQLite fixtures in CIRNET_REMOTE_DB_MIGRATION_SQLITE_DIR"]
async fn sqlite_refuses_incompatible_migrations_without_leaving_changes() {
    let directory = sqlite_fixture_dir();
    for (name, expected) in [
        ("unknown.sqlite", "revision"),
        ("branched.sqlite", "revision"),
        ("bad-legacy.sqlite", "legacy"),
        ("bad-index.sqlite", "index"),
        ("duplicate.sqlite", "capture"),
    ] {
        let path = directory.join(name);
        let before = std::fs::read(&path).unwrap();
        let failure = migrate(&sqlite_url(&path))
            .await
            .err()
            .expect("expected migration failure");
        let actual = match failure {
            MigrationError::UnknownRevision => "revision",
            MigrationError::IncompatibleLegacySchema => "legacy",
            MigrationError::IncompatibleHistoryIndex => "index",
            MigrationError::DuplicateCapture => "capture",
            _ => "unexpected",
        };
        assert_eq!(actual, expected, "{name}: {failure:?}");
        assert_eq!(std::fs::read(&path).unwrap(), before, "{name}");
    }
}

#[tokio::test]
#[ignore = "requires isolated Python migration fixtures in CIRNET_REMOTE_DB_MIGRATION_POSTGRES and _DUPLICATE"]
async fn postgres_migrates_preversioned_rows_and_rolls_back_duplicate_capture() {
    let url = std::env::var("CIRNET_REMOTE_DB_MIGRATION_POSTGRES").unwrap();
    let report = migrate(&url).await.unwrap();
    assert_eq!((report.from, report.to, report.applied), (None, HEAD, 7));
    let pool = PgPoolOptions::new()
        .connect(&url.replacen("postgresql+psycopg://", "postgresql://", 1))
        .await
        .unwrap();
    check_migrated!(&pool, false);
    let repeat = migrate(&url).await.unwrap();
    assert_eq!(
        (repeat.from, repeat.to, repeat.applied),
        (Some(HEAD), HEAD, 0)
    );

    let duplicate = std::env::var("CIRNET_REMOTE_DB_MIGRATION_POSTGRES_DUPLICATE").unwrap();
    assert!(matches!(
        migrate(&duplicate).await,
        Err(MigrationError::DuplicateCapture)
    ));
    let pool = PgPoolOptions::new()
        .connect(&duplicate.replacen("postgresql+psycopg://", "postgresql://", 1))
        .await
        .unwrap();
    let revision: String = sqlx::query_scalar("SELECT version_num FROM alembic_version")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(revision, "0004_assignments");
    let catalog_exists: bool = sqlx::query_scalar("SELECT to_regclass('lab_captures') IS NOT NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(!catalog_exists);
    let payload: String = sqlx::query_scalar("SELECT CAST(payload AS TEXT) FROM lab_experiments WHERE experiment_id = 'migration-sealed'")
        .fetch_one(&pool).await.unwrap();
    assert_eq!(payload, RAW_SEALED);
}
