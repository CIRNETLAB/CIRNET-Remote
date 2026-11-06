use std::path::{Path, PathBuf};
use std::sync::Arc;

use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::db::WriteDb;
use cirnet_remote_native::db::runtime::{
    Cas, Expected, ExperimentRepository, LeaseOutcome, Reserve, RuntimeError, Settle, Update,
};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

fn directory() -> PathBuf {
    std::env::var_os("CIRNET_REMOTE_RUNTIME_FIXTURE_DIR")
        .unwrap()
        .into()
}

fn sqlite_url(path: &Path) -> String {
    format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"))
}

fn changed(value: &Value, state: &str, revision: i64) -> Value {
    let mut next = value.clone();
    next["state"] = json!(state);
    next["revision"] = json!(revision);
    next
}

fn expected<'a>(id: &'a str, revision: i64, generation: Option<&'a str>) -> Expected<'a> {
    Expected {
        id,
        revision,
        generation,
    }
}

async fn refuse_audit(url: &str, enable: bool) {
    if let Some(path) = url.strip_prefix("sqlite:///") {
        let pool = SqlitePoolOptions::new()
            .connect_with(SqliteConnectOptions::new().filename(path))
            .await
            .unwrap();
        let sql = if enable {
            "CREATE TRIGGER runtime_refuse_audit BEFORE INSERT ON auth_audit
             WHEN NEW.subject_id = 'legacy' BEGIN SELECT RAISE(ABORT, 'fixture'); END"
        } else {
            "DROP TRIGGER runtime_refuse_audit"
        };
        sqlx::query(sql).execute(&pool).await.unwrap();
    } else {
        let pool = PgPoolOptions::new()
            .connect(&url.replacen("postgresql+psycopg://", "postgresql://", 1))
            .await
            .unwrap();
        let sql = if enable {
            "ALTER TABLE auth_audit ADD CONSTRAINT runtime_refuse_audit CHECK (subject_id <> 'legacy')"
        } else {
            "ALTER TABLE auth_audit DROP CONSTRAINT runtime_refuse_audit"
        };
        sqlx::query(sql).execute(&pool).await.unwrap();
    }
}

macro_rules! check_durable {
    ($pool:expr, $capture:expr) => {{
        let row: (String, bool, bool, String) = sqlx::query_as(
            "SELECT experiment_id, available, cleanup_pending, CAST(metadata AS TEXT)
             FROM lab_captures WHERE capture_id = 'runtime-fixture-capture'",
        )
        .fetch_one($pool)
        .await
        .unwrap();
        assert_eq!((row.0.as_str(), row.1, row.2), ("legacy", true, false));
        assert_eq!(serde_json::from_str::<Value>(&row.3).unwrap(), $capture);
        let projection: (String, bool) = sqlx::query_as(
            "SELECT state, active FROM lab_experiment_runtime WHERE experiment_id = 'legacy'",
        )
        .fetch_one($pool)
        .await
        .unwrap();
        assert_eq!((projection.0.as_str(), projection.1), ("FAULT", false));
        let audit: Vec<String> = sqlx::query_scalar(
            "SELECT action FROM auth_audit WHERE subject_id = 'legacy' ORDER BY sequence",
        )
        .fetch_all($pool)
        .await
        .unwrap();
        assert_eq!(audit, ["EXPERIMENT_RESTART_RECOVERED"]);
    }};
}

async fn verify(url: &str) {
    let resources = std::env::var("CIRNET_CONTRACTS_ROOT").unwrap();
    let registry = Arc::new(Registry::load(Path::new(&resources)).unwrap());
    let db = WriteDb::open_existing(url).await.unwrap();
    let repo = ExperimentRepository::new(db.clone(), registry.clone());
    let peer = ExperimentRepository::new(WriteDb::open_existing(url).await.unwrap(), registry);

    assert!(repo.get("missing").await.unwrap().is_none());
    assert!(repo.station_leases("simulation").await.unwrap().is_empty());
    let a = repo.get("queued-a").await.unwrap().unwrap();
    let b = repo.get("queued-b").await.unwrap().unwrap();
    assert_eq!(a.owner_id, "runtime-owner");
    let mut a_payload = changed(&a.payload, "RESERVED", 2);
    let mut b_payload = changed(&b.payload, "RESERVED", 2);
    for (value, generation) in [
        (&mut a_payload, "generation-a"),
        (&mut b_payload, "generation-b"),
    ] {
        value["_reservation_generation"] = json!(generation);
        value["lease_expires_at"] = json!(200.0);
    }
    let reserve_a = Reserve {
        expected: expected("queued-a", 1, None),
        station_id: "simulation",
        slot: 0,
        expires_at: 200.0,
        payload: &a_payload,
    };
    let reserve_b = Reserve {
        expected: expected("queued-b", 1, None),
        station_id: "simulation",
        slot: 0,
        expires_at: 200.0,
        payload: &b_payload,
    };
    let (a, b) = tokio::join!(repo.reserve(reserve_a), peer.reserve(reserve_b));
    let (winner, loser, generation, loser_payload) = match (a.unwrap(), b.unwrap()) {
        (Cas::Applied, Cas::Occupied) => ("queued-a", "queued-b", "generation-a", b_payload),
        (Cas::Occupied, Cas::Applied) => ("queued-b", "queued-a", "generation-b", a_payload),
        pair => panic!("unexpected competing reserve result {pair:?}"),
    };
    let lease = repo.station_leases("simulation").await.unwrap();
    assert_eq!(lease.len(), 1);
    assert_eq!(
        (
            lease[0].experiment_id.as_str(),
            lease[0].slot,
            lease[0].expires_at
        ),
        (winner, 0, 200.0)
    );
    assert!(!lease[0].quarantined);

    let reserved = repo.get(winner).await.unwrap().unwrap().payload;
    let stopping = changed(&reserved, "STOPPING", 3);
    let mut tx = repo.begin().await.unwrap();
    assert!(matches!(
        repo.update_owned_in(
            &mut tx,
            "foreign-owner",
            Update {
                expected: expected(winner, 2, Some(generation)),
                payload: &stopping,
            }
        )
        .await,
        Err(RuntimeError::Forbidden)
    ));
    tx.rollback().await.unwrap();
    assert_eq!(
        repo.update(Update {
            expected: expected(winner, 1, Some(generation)),
            payload: &stopping
        })
        .await
        .unwrap(),
        Cas::Stale
    );
    assert_eq!(
        repo.update(Update {
            expected: expected(winner, 2, Some(generation)),
            payload: &stopping
        })
        .await
        .unwrap(),
        Cas::Applied
    );
    let mut terminal = changed(&stopping, "FAULT", 4);
    terminal["lease_expires_at"] = Value::Null;
    assert_eq!(
        repo.settle(Settle {
            expected: expected(winner, 3, Some("old-generation")),
            payload: &terminal,
            lease: LeaseOutcome::Release,
            recovery: false
        })
        .await
        .unwrap(),
        Cas::Stale
    );
    assert_eq!(repo.station_leases("simulation").await.unwrap(), lease);
    assert_eq!(
        repo.settle(Settle {
            expected: expected(winner, 3, Some(generation)),
            payload: &terminal,
            lease: LeaseOutcome::Quarantine,
            recovery: false
        })
        .await
        .unwrap(),
        Cas::Applied
    );
    assert!(repo.station_leases("simulation").await.unwrap()[0].quarantined);
    assert_eq!(
        repo.reserve(Reserve {
            expected: expected(loser, 1, None),
            station_id: "simulation",
            slot: 1,
            expires_at: 200.0,
            payload: &loser_payload
        })
        .await
        .unwrap(),
        Cas::Quarantined
    );
    assert_eq!(
        repo.get(loser).await.unwrap().unwrap().payload["state"],
        "QUEUED"
    );

    let legacy = repo.get("legacy").await.unwrap().unwrap().payload;
    let capture: Value =
        serde_json::from_slice(&std::fs::read(directory().join("capture-metadata.json")).unwrap())
            .unwrap();
    let mut recovered = changed(&legacy, "FAULT", 8);
    recovered["error_code"] = json!("RESTART_RECOVERY");
    recovered["lease_expires_at"] = Value::Null;
    recovered["capture"] = capture.clone();
    refuse_audit(url, true).await;
    let failure = repo
        .settle(Settle {
            expected: expected("legacy", 7, None),
            payload: &recovered,
            lease: LeaseOutcome::Release,
            recovery: true,
        })
        .await;
    refuse_audit(url, false).await;
    assert!(failure.is_err(), "failing recovery audit must roll back");
    assert_eq!(repo.get("legacy").await.unwrap().unwrap().payload, legacy);
    assert_eq!(
        repo.station_leases("legacy-station").await.unwrap().len(),
        1
    );
    assert_eq!(
        repo.settle(Settle {
            expected: expected("legacy", 7, None),
            payload: &recovered,
            lease: LeaseOutcome::Release,
            recovery: true
        })
        .await
        .unwrap(),
        Cas::Applied
    );
    assert!(
        repo.station_leases("legacy-station")
            .await
            .unwrap()
            .is_empty()
    );

    let original = repo.get("collision").await.unwrap().unwrap().payload;
    let mut collision = changed(&original, "COMPLETE", 3);
    collision["capture"] = capture.clone();
    collision["lease_expires_at"] = Value::Null;
    assert!(matches!(
        repo.settle(Settle {
            expected: expected("collision", 2, Some("existing-generation")),
            payload: &collision,
            lease: LeaseOutcome::Release,
            recovery: false
        })
        .await,
        Err(RuntimeError::CaptureIdentityConflict)
    ));
    assert_eq!(
        repo.get("collision").await.unwrap().unwrap().payload,
        original
    );
    assert_eq!(
        repo.station_leases("collision-station")
            .await
            .unwrap()
            .len(),
        1
    );

    if let Some(path) = url.strip_prefix("sqlite:///") {
        let pool = SqlitePoolOptions::new()
            .connect_with(SqliteConnectOptions::new().filename(path))
            .await
            .unwrap();
        check_durable!(&pool, capture);
    } else {
        let pool = PgPoolOptions::new()
            .connect(&url.replacen("postgresql+psycopg://", "postgresql://", 1))
            .await
            .unwrap();
        check_durable!(&pool, capture);
    }
}

#[tokio::test]
#[ignore = "requires a fresh Python-r8 SQLite runtime fixture"]
async fn sqlite_runtime_records() {
    verify(&sqlite_url(&directory().join("runtime.sqlite"))).await;
}

#[tokio::test]
#[ignore = "requires a fresh Python-r8 PostgreSQL runtime fixture"]
async fn postgres_runtime_records() {
    verify(&std::env::var("CIRNET_REMOTE_RUNTIME_FIXTURE_POSTGRES").unwrap()).await;
}
