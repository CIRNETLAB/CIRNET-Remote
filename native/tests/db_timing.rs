//! Opt-in single-client DB component timings. No HTTP, Hardware or scheduler.
use std::env;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::db::WriteDb;
use cirnet_remote_native::db::runtime::{Cas, Expected, ExperimentRepository, Update};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Connection;
use sqlx::postgres::PgConnection;
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};

const WARMUP: usize = 10;
const SAMPLES: usize = 200;

#[derive(Deserialize)]
struct Fixture {
    owner: String,
    session: String,
    client: String,
    read_payload: Value,
    active_rows: Value,
    update_payload: Value,
    warmup: usize,
    samples: usize,
}

fn owned_directory(variable: &str) -> PathBuf {
    PathBuf::from(env::var_os(variable).expect("select an owned diagnostic directory"))
        .canonicalize()
        .expect("diagnostic directory unavailable")
}

async fn database_configuration(url: &str, lane: &Path) -> (&'static str, Value) {
    if let Some(filename) = url.strip_prefix("sqlite:///") {
        let path = PathBuf::from(filename)
            .canonicalize()
            .expect("SQLite fixture missing");
        assert_eq!(path.parent(), Some(lane));
        assert_eq!(path.file_name().unwrap(), "remote.sqlite");
        // This connection uses the exact configured default options, independently
        // of WriteDb's private pool. The timed connection options stay unchanged.
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(false)
            .foreign_keys(true);
        let mut connection = SqliteConnection::connect_with(&options).await.unwrap();
        let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        let version: String = sqlx::query_scalar("SELECT sqlite_version()")
            .fetch_one(&mut connection)
            .await
            .unwrap();
        assert_eq!(
            (journal.as_str(), synchronous, foreign_keys),
            ("delete", 2, 1)
        );
        return (
            "sqlite",
            json!({
                "journal_mode": journal, "synchronous": synchronous, "foreign_keys": foreign_keys,
                "sqlite_version": version,
            }),
        );
    }

    let native = url.replacen("postgresql+psycopg://", "postgresql://", 1);
    let parsed = url::Url::parse(&native).expect("invalid diagnostic PostgreSQL URL");
    let suffix = parsed
        .path()
        .strip_prefix("/stage4_http_")
        .expect("not an isolated diagnostic database");
    assert_eq!(parsed.scheme(), "postgresql");
    assert!(matches!(parsed.host_str(), Some("127.0.0.1" | "[::1]")));
    assert!(parsed.query().is_none() && parsed.fragment().is_none());
    assert_eq!(suffix.len(), 16);
    assert!(suffix.bytes().all(|byte| byte.is_ascii_hexdigit()));
    let mut connection = PgConnection::connect(&native).await.unwrap();
    let (version, isolation, commit, fsync, full_page, block_size): (
        String,
        String,
        String,
        String,
        String,
        String,
    ) = sqlx::query_as(
        "SELECT current_setting('server_version'), current_setting('transaction_isolation'),
                       current_setting('synchronous_commit'), current_setting('fsync'),
                       current_setting('full_page_writes'), current_setting('block_size')",
    )
    .fetch_one(&mut connection)
    .await
    .unwrap();
    assert_eq!(isolation, "read committed");
    assert_eq!(fsync, "on");
    assert_eq!(commit, "on");
    (
        "postgres",
        json!({
            "server_version": version, "transaction_isolation": isolation, "synchronous_commit": commit,
            "fsync": fsync, "full_page_writes": full_page, "block_size": block_size,
        }),
    )
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "owned Stage 4 DB-only paired diagnostic"]
async fn stage4_database_component_timing() {
    for variable in [
        "CIRNET_SQLITE_ROLLBACK_JOURNAL",
        "NETCIRCUIT_SQLITE_ROLLBACK_JOURNAL",
    ] {
        assert!(env::var_os(variable).is_none());
    }
    let lane = owned_directory("CIRNET_STAGE4_DB_COMPONENT_LANE");
    let session = owned_directory("CIRNET_ARTIFACTS_SESSION");
    assert!(lane != session && lane.starts_with(&session));
    let spec = PathBuf::from(env::var_os("CIRNET_STAGE4_DB_COMPONENT_SPEC").unwrap())
        .canonicalize()
        .unwrap();
    assert!(spec.starts_with(&session));
    let fixture: Fixture = serde_json::from_slice(&fs::read(spec).unwrap()).unwrap();
    assert_eq!((fixture.warmup, fixture.samples), (WARMUP, SAMPLES));

    let url = env::var("CIRNET_DATABASE_URL").expect("select an isolated DB fixture");
    let (backend, config) = database_configuration(&url, &lane).await;
    let registry =
        Arc::new(Registry::load(Path::new(&env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap());
    let db = WriteDb::open_existing(&url).await.unwrap();
    let repository = ExperimentRepository::new(db.clone(), registry);
    let read_id = fixture.read_payload["experiment_id"].as_str().unwrap();
    let update_id = fixture.update_payload["experiment_id"].as_str().unwrap();
    let initial = repository.get(update_id).await.unwrap().unwrap();
    assert_eq!(initial.owner_id, fixture.owner);
    assert_eq!(initial.payload, fixture.update_payload);
    let start_revision = initial.payload["revision"].as_i64().unwrap();
    let mut snapshots = Vec::with_capacity(SAMPLES);
    let mut pages = Vec::with_capacity(SAMPLES);
    let mut updates = Vec::with_capacity(SAMPLES);
    let mut payload = fixture.update_payload.clone();

    for index in 0..WARMUP + SAMPLES {
        let started = Instant::now();
        let snapshot = repository.get(read_id).await.unwrap().unwrap();
        let snapshot_ns = started.elapsed().as_nanos();
        assert_eq!(snapshot.owner_id, fixture.owner);
        assert_eq!(snapshot.payload, fixture.read_payload);

        let started = Instant::now();
        let active = repository
            .active_page(
                Some(&fixture.owner),
                Some(&fixture.session),
                Some(&fixture.client),
                "",
                100,
            )
            .await
            .unwrap();
        let active_ns = started.elapsed().as_nanos();
        let rows: Vec<_> = active.into_iter().map(|row| json!({
            "experiment_id": row.experiment_id, "owner_id": row.owner_id,
            "control_session_id": row.control_session_id, "control_client_id": row.control_client_id,
        })).collect();
        assert_eq!(json!(rows), fixture.active_rows);

        let prior_revision = start_revision + index as i64;
        payload["revision"] = json!(prior_revision + 1);
        let update = Update {
            expected: Expected {
                id: update_id,
                revision: prior_revision,
                generation: None,
            },
            payload: &payload,
        };
        let started = Instant::now();
        let mut transaction = db.begin().await.unwrap();
        let begun = Instant::now();
        let changed = repository
            .update_in(&mut transaction, update)
            .await
            .unwrap();
        let operated = Instant::now();
        transaction.commit().await.unwrap();
        let committed = Instant::now();
        assert_eq!(changed, Cas::Applied);

        if index >= WARMUP {
            snapshots.push(json!({"total_ns": snapshot_ns}));
            pages.push(json!({"total_ns": active_ns}));
            updates.push(json!({
                "total_ns": committed.duration_since(started).as_nanos(),
                "begin_ns": begun.duration_since(started).as_nanos(),
                "operation_ns": operated.duration_since(begun).as_nanos(),
                "commit_ns": committed.duration_since(operated).as_nanos(),
            }));
        }
    }
    let saved = repository.get(update_id).await.unwrap().unwrap();
    assert_eq!(saved.owner_id, fixture.owner);
    assert_eq!(saved.payload, payload);
    let samples = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(lane.join("samples.json"))
        .unwrap();
    serde_json::to_writer(samples, &json!({
        "backend": backend, "config": config,
        "config_scope": "independent connection with same SQLx client options",
        "read_payload": fixture.read_payload, "active_rows": fixture.active_rows, "final_payload": saved.payload,
        "observations": {"snapshot": snapshots, "active_page": pages, "update": updates},
    })).unwrap();
}
