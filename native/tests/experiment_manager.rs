use super::*;
use crate::db::{
    WriteDb,
    runtime::{Create, Reserve},
};
use crate::events::EventLimits;
use cirnet_contracts_native::capture::encode_digital;
use sha2::{Digest, Sha256};
use std::{collections::HashMap, path::PathBuf, process::Stdio};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Child,
    time::{sleep, timeout},
};
use uuid::Uuid;

const R2_SHA: &str = "22d3d0a1c57aad0d2d01d512f3a890149566bc799228559b6943843cba1e85e6";
const WORKER_SHA: &str = "c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf";

struct Lane {
    manager: ExperimentManager,
    context: SessionContext,
    directory: PathBuf,
    child: Child,
}

impl Lane {
    async fn start() -> Self {
        Self::start_with_database(None).await
    }

    async fn start_with_database(postgres: Option<(&str, &str)>) -> Self {
        let artifact = |name, expected| {
            let path = PathBuf::from(std::env::var_os(name).expect("select pinned artifact"));
            assert!(path.is_absolute());
            assert_eq!(
                format!("{:x}", Sha256::digest(std::fs::read(&path).unwrap())),
                expected
            );
            path
        };
        let hardware = artifact("CIRNET_NATIVE_STAGE3_HARDWARE", R2_SHA);
        artifact("CIRNET_SIM_CPP_WORKER", WORKER_SHA);
        let owned = PathBuf::from(std::env::var_os("CIRNET_ARTIFACTS_SESSION").unwrap())
            .canonicalize()
            .unwrap();
        let source = PathBuf::from(std::env::var_os("CIRNET_REMOTE_WS_FIXTURE_DIR").unwrap())
            .canonicalize()
            .unwrap();
        let target = PathBuf::from(std::env::var_os("CIRNET_REMOTE_EXPERIMENT_TEST_DIR").unwrap());
        assert!(source.starts_with(&owned) && target.canonicalize().unwrap().starts_with(&owned));
        let directory = target.join(Uuid::new_v4().simple().to_string());
        std::fs::create_dir(&directory).unwrap();
        let database = directory.join("remote.sqlite");
        if postgres.is_none() {
            std::fs::copy(source.join("websocket.sqlite"), &database).unwrap();
        }
        let fixture: Value =
            serde_json::from_slice(&std::fs::read(source.join("fixture.json")).unwrap()).unwrap();
        let registry = Arc::new(
            Registry::load(&PathBuf::from(
                std::env::var_os("CIRNET_CONTRACTS_ROOT").unwrap(),
            ))
            .unwrap(),
        );

        let mut child = tokio::process::Command::new(hardware)
            .args(["--listen", "127.0.0.1:0", "--exit-on-stdin-eof"])
            .env("CIRNET_SIMULATION_WORKERS", "1")
            .env("CIRNET_HARDWARE_START_RENDEZVOUS", "0")
            .current_dir(&directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let ready = timeout(Duration::from_secs(15), lines.next_line())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let target = ready.strip_prefix("CIRNET_HARDWARE_READY=").unwrap();
        let config = Arc::new(
            Config::from_vars(&HashMap::from([
                (
                    "CIRNET_DATABASE_URL".into(),
                    postgres.map(|(url, _)| url.to_owned()).unwrap_or_else(|| {
                        format!(
                            "sqlite:///{}",
                            database.to_str().unwrap().replace('\\', "/")
                        )
                    }),
                ),
                (
                    "CIRNET_CAPTURE_DIR".into(),
                    directory.join("captures").to_str().unwrap().to_owned(),
                ),
                ("CIRNET_SIMULATION_WORKERS".into(), "1".into()),
            ]))
            .unwrap(),
        );
        let write = WriteDb::open_existing(&config.database_url).await.unwrap();
        let context = auth::current(
            &write.reads(),
            postgres
                .map(|(_, token)| token)
                .or_else(|| fixture["stage4_alice"]["token"].as_str()),
            &config,
        )
        .await
        .unwrap()
        .unwrap();
        let hardware = HardwareClient::new(target).unwrap();
        let events = EventHub::new(EventLimits::default()).unwrap();
        let assignments =
            AssignmentService::new(write.clone(), (*config).clone(), registry.clone());
        let projects = ProjectService::new(write.clone(), (*config).clone(), registry.clone());
        let authority = SchedulerAuthority::acquire(&config.database_url)
            .await
            .unwrap();
        let manager = ExperimentManager::new(
            ExperimentRepository::new(write, registry.clone()),
            hardware,
            config,
            registry,
            events,
            assignments,
            projects,
            authority,
        )
        .unwrap();
        Self {
            manager,
            context,
            directory,
            child,
        }
    }

    async fn close(self) {
        self.manager.shutdown().await.unwrap();
        self.close_hardware().await;
    }

    async fn close_hardware(mut self) {
        drop(self.child.stdin.take());
        assert!(
            timeout(Duration::from_secs(8), self.child.wait())
                .await
                .unwrap()
                .unwrap()
                .success()
        );
    }
}

#[tokio::test]
#[ignore = "requires the exact R2 Hardware, pinned Contracts and owned SQLite fixture"]
async fn exact_r2_native_manager_run_capture_idempotency_and_safe_release() {
    let lane = Lane::start().await;
    let manager = &lane.manager;
    manager.initialize().await.unwrap();
    let context = &lane.context;
    let owner = owner(context).unwrap();
    let payload = json!({
        "station_id":"virtual-station-01",
        "circuit_graph":{
            "schema_version":"1.0", "circuit_id":"runtime-pair",
            "modules":[{"id":"X","type":"DIGITAL_SWITCH","properties":{"state":true}},{"id":"L","type":"LED"}],
            "connections":[{"source":"X.OUT","destination":"L.IN"}],
        },
        "capture_config":{"signals":["L.IN"],"duration_ns":20},
    });
    let first = manager
        .create(context, &payload, Some("create"), Some("stage4"), false)
        .await
        .unwrap();
    assert_eq!(first["state"], "CREATED");
    let id = first["experiment_id"].as_str().unwrap();
    assert_eq!(
        manager
            .create(context, &payload, Some("create"), Some("retry"), false)
            .await
            .unwrap(),
        first
    );
    let mut different = payload.clone();
    different["capture_config"]["duration_ns"] = json!(30);
    assert_eq!(
        manager
            .create(context, &different, Some("create"), None, false)
            .await
            .unwrap_err()
            .code,
        "IDEMPOTENCY_CONFLICT"
    );
    manager
        .run(context, id, Some("run"), Some("tab"), Some("stage4"))
        .await
        .unwrap();
    let record = timeout(Duration::from_secs(10), async {
        loop {
            let record = manager.get(owner, id).await.unwrap();
            if terminal(&record) && manager.0.repo.lease(id).await.unwrap().is_none() {
                break record;
            }
            sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(record["state"], "COMPLETE", "{record:?}");
    assert_eq!(
        record["state_history"],
        json!([
            "CREATED",
            "QUEUED",
            "RESERVED",
            "SAFE_STATE",
            "SAFETY_CHECK",
            "EXECUTION_DECISION",
            "ROUTE_PREPARE",
            "GUARDED_POWER_UP",
            "RUNNING",
            "CAPTURING",
            "FUNCTIONAL_VERIFY",
            "STOPPING",
            "SAFE_STATE",
            "RELEASE",
            "COMPLETE",
        ])
    );
    assert_eq!(record["capture"]["available"], true);
    let capture_id = record["capture"]["capture_id"].as_str().unwrap();
    let actual = std::fs::read(
        lane.directory
            .join("captures")
            .join(format!("{capture_id}.ncap")),
    )
    .unwrap();
    let expected = encode_digital(
        &json!([{"signal":"L.IN","time_ns":0,"value":1}]),
        &json!(20),
    )
    .unwrap();
    assert_eq!(actual, expected);
    assert_eq!(
        manager
            .operation(owner, "run", Some(id), "run")
            .await
            .unwrap()["status"],
        "APPLIED"
    );
    assert_eq!(
        manager
            .run(context, id, Some("run"), Some("tab"), None)
            .await
            .unwrap(),
        record
    );
    assert_eq!(
        manager.stop(context, id, Some("stop"), None).await.unwrap(),
        record
    );
    assert_eq!(
        manager
            .operation(owner, "stop", Some(id), "stop")
            .await
            .unwrap()["status"],
        "APPLIED"
    );
    assert_eq!(
        manager.capture_payload(context, capture_id).await.unwrap(),
        expected
    );
    let retired = manager.delete_capture(context, capture_id).await.unwrap();
    assert_eq!(retired["available"], false);
    assert_eq!(retired["payload_ref"], Value::Null);
    assert_eq!(retired["sha256"], Value::Null);
    assert_eq!(
        manager.delete_capture(context, capture_id).await.unwrap(),
        retired
    );
    assert_eq!(
        manager
            .capture_payload(context, capture_id)
            .await
            .unwrap_err()
            .code,
        "CAPTURE_UNAVAILABLE"
    );
    assert!(
        !lane
            .directory
            .join("captures")
            .join(format!("{capture_id}.ncap"))
            .exists()
    );
    assert_eq!(manager.get(owner, id).await.unwrap()["capture"], retired);
    lane.close().await;
}

#[tokio::test]
#[ignore = "requires exact R2 Hardware with absent physical driver and owned SQLite fixture"]
async fn real_restart_retains_legacy_physical_lease_without_safe_ack() {
    let lane = Lane::start().await;
    let manager = &lane.manager;
    let repo = &manager.0.repo;
    let id = Uuid::new_v4().simple().to_string();
    let owner = owner(&lane.context).unwrap();
    let mut payload = json!({
        "schema_version":"1.0", "experiment_id":id, "station_id":"physical-station-01", "mode":"hardware",
        "circuit_id":"historical", "state":"CREATED", "state_history":["CREATED"], "revision":0,
        "queue_position":null, "lease_expires_at":null, "assignment_id":null, "capture":null,
    });
    let mut tx = repo.begin().await.unwrap();
    repo.create_in(
        &mut tx,
        Create {
            owner_id: owner,
            payload: &payload,
            operation: None,
        },
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let next = transition(&payload, "QUEUED", json!({"_queue_sequence":1})).unwrap();
    assert_eq!(
        repo.update(Update {
            expected: expected(&payload).unwrap(),
            payload: &next
        })
        .await
        .unwrap(),
        Cas::Applied
    );
    payload = next;
    let expires_at = now() + 120.0;
    let next = transition(
        &payload,
        "RESERVED",
        json!({
            "_reservation_generation":"legacy-reservation", "lease_expires_at":expires_at,
        }),
    )
    .unwrap();
    assert_eq!(
        repo.reserve(Reserve {
            expected: expected(&payload).unwrap(),
            station_id: "physical-station-01",
            slot: 0,
            expires_at,
            payload: &next,
        })
        .await
        .unwrap(),
        Cas::Applied
    );
    assert!(!repo.lease(&id).await.unwrap().unwrap().quarantined);
    let mut legacy = payload.clone();
    legacy["experiment_id"] = json!("historical-inline-capture");
    legacy["station_id"] = json!("virtual-station-01");
    legacy["mode"] = json!("simulation");
    legacy["state"] = json!("CREATED");
    legacy["state_history"] = json!(["CREATED"]);
    legacy["revision"] = json!(0);
    legacy["capture"] = json!({"available":true,"duration_ns":20,"samples":[{"signal":"L.IN","time_ns":0,"value":1}]});
    let mut tx = repo.begin().await.unwrap();
    repo.create_in(
        &mut tx,
        Create {
            owner_id: owner,
            payload: &legacy,
            operation: None,
        },
    )
    .await
    .unwrap();
    tx.commit().await.unwrap();
    let blocker = lane.directory.join("captures");
    std::fs::write(&blocker, b"unwritable capture directory fixture").unwrap();

    assert_eq!(
        manager.initialize().await.unwrap_err().code,
        "CAPTURE_STORAGE_UNAVAILABLE"
    );
    let recovered = manager.get(owner, &id).await.unwrap();
    assert_eq!(recovered["state"], "FAULT");
    assert_eq!(recovered["error_code"], "RESTART_RECOVERY");
    assert_eq!(recovered["lease_expires_at"], Value::Null);
    assert!(repo.lease(&id).await.unwrap().unwrap().quarantined);
    assert_eq!(
        std::fs::read(&blocker).unwrap(),
        b"unwritable capture directory fixture"
    );
    lane.close().await;
}
#[tokio::test]
#[ignore = "requires owned SQLite fixture and exact R2 Hardware"]
async fn revoked_same_owner_session_cannot_stop_an_experiment() {
    let lane = Lane::start().await;
    let manager = &lane.manager;
    manager.initialize().await.unwrap();
    let context = &lane.context;
    let owner = owner(context).unwrap();
    let payload = json!({
        "station_id":"virtual-station-01",
        "circuit_graph":{
            "schema_version":"1.0", "circuit_id":"stale-stop",
            "modules":[{"id":"X","type":"DIGITAL_SWITCH","properties":{"state":true}}],
            "connections":[],
        },
    });
    let record = manager
        .create(context, &payload, None, None, false)
        .await
        .unwrap();
    let id = record["experiment_id"].as_str().unwrap();
    let mut config = (*manager.0.config).clone();
    config.read_only = false;
    let db = WriteDb::open_existing(&config.database_url).await.unwrap();
    let auth = auth::AuthService::new(db, config).await.unwrap();
    let change = auth.logout(context).await.unwrap();
    assert_eq!(change.revoked_session_ids, vec![context.session_id.clone()]);
    assert_eq!(
        manager
            .stop(context, id, None, None)
            .await
            .unwrap_err()
            .code,
        "SESSION_EXPIRED"
    );
    assert_eq!(
        manager
            .stop(context, id, Some("revoked"), None)
            .await
            .unwrap_err()
            .code,
        "SESSION_EXPIRED"
    );
    assert_eq!(manager.get(owner, id).await.unwrap(), record);
    lane.close().await;
}

#[tokio::test]
#[ignore = "requires owned SQLite fixture and exact R2 Hardware"]
async fn shutdown_drains_accepted_work_even_after_its_caller_disconnects() {
    let lane = Lane::start().await;
    lane.manager.initialize().await.unwrap();
    let guard = Arc::new(Mutex::new(()));
    let held = guard.lock().await;
    let waiter = guard.clone();
    let (started, admitted) = tokio::sync::oneshot::channel();
    let manager = lane.manager.clone();
    let caller = tokio::spawn(async move {
        manager
            .owned(async move {
                started.send(()).unwrap();
                let _waiting = waiter.lock().await;
                Ok(())
            })
            .await
    });
    admitted.await.unwrap();
    caller.abort();
    let _ = caller.await;

    lane.manager.stop_admissions();
    let manager = lane.manager.clone();
    let mut shutdown = tokio::spawn(async move { manager.shutdown().await });
    assert!(
        timeout(Duration::from_millis(50), &mut shutdown)
            .await
            .is_err()
    );
    assert_eq!(
        lane.manager.owned(async { Ok(()) }).await.unwrap_err().code,
        "UNAVAILABLE"
    );
    drop(held);
    timeout(Duration::from_secs(5), shutdown)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    lane.close().await;
}

#[path = "experiment_fault_transport.rs"]
mod fault_transport;
#[tokio::test]
#[ignore = "requires exact R2 Hardware and an allocator-owned disposable SQLite fixture"]
async fn failed_cleanup_commit_blocks_another_slot_on_the_station() {
    let mut lane = Lane::start().await;
    let runtime = Arc::get_mut(&mut lane.manager.0).unwrap();
    let mut config = (*runtime.config).clone();
    config.simulation_workers = 2;
    runtime.config = Arc::new(config);
    let manager = &lane.manager;
    manager.initialize().await.unwrap();
    let fixture = PathBuf::from(std::env::var_os("CIRNET_REMOTE_WS_FIXTURE_DIR").unwrap());
    let fixture: Value =
        serde_json::from_slice(&std::fs::read(fixture.join("fixture.json")).unwrap()).unwrap();
    let bob = auth::current(
        &manager.0.auth_db,
        fixture["stage4_bob"]["token"].as_str(),
        &manager.0.config,
    )
    .await
    .unwrap()
    .unwrap();
    let payload = json!({
        "station_id":"virtual-station-01",
        "circuit_graph":{
            "schema_version":"1.0","circuit_id":"failed-cleanup-persistence",
            "modules":[{"id":"X","type":"DIGITAL_SWITCH","properties":{"state":true}},{"id":"L","type":"LED"}],
            "connections":[{"source":"X.OUT","destination":"L.IN"}],
        },
        "capture_config":{"signals":["L.IN"],"duration_ns":20},
    });
    let first = manager
        .create(&lane.context, &payload, None, None, false)
        .await
        .unwrap();
    let first = first["experiment_id"].as_str().unwrap();
    let second = manager
        .create(&bob, &payload, None, None, false)
        .await
        .unwrap();
    let second = second["experiment_id"].as_str().unwrap();

    let mut tx = manager.0.repo.begin().await.unwrap();
    crate::db::write::tx_execute!(
        tx,
        "CREATE TRIGGER test_deny_lease_release BEFORE DELETE ON lab_leases
         BEGIN SELECT RAISE(ABORT, 'fixture denies lease release'); END"
    )
    .unwrap();
    tx.commit().await.unwrap();

    manager
        .run(&lane.context, first, None, Some("alice"), None)
        .await
        .unwrap();
    timeout(Duration::from_secs(5), async {
        loop {
            let state = manager.0.state.lock().await;
            if manager.0.cleanup_failed.load(Ordering::Acquire) && !state.active.contains_key(first)
            {
                break;
            }
            drop(state);
            sleep(Duration::from_millis(2)).await;
        }
    })
    .await
    .unwrap();
    let interrupted = manager
        .get(owner(&lane.context).unwrap(), first)
        .await
        .unwrap();
    assert_eq!(interrupted["state"], "RELEASE");
    assert_eq!(interrupted["capture"]["available"], true);
    let held = manager.0.repo.lease(first).await.unwrap().unwrap();
    assert!(!held.quarantined);

    let queued = manager
        .run(&bob, second, None, Some("bob"), None)
        .await
        .unwrap();
    assert_eq!(queued["state"], "QUEUED");
    assert_eq!(
        manager.queue("virtual-station-01").await.unwrap(),
        vec![second.to_owned()]
    );
    assert_eq!(
        manager
            .0
            .repo
            .station_leases("virtual-station-01")
            .await
            .unwrap(),
        vec![held]
    );
    assert!(manager.0.repo.lease(second).await.unwrap().is_none());

    assert_eq!(manager.shutdown().await.unwrap_err().code, "UNAVAILABLE");
    drop(lane.child.stdin.take());
    assert!(
        timeout(Duration::from_secs(8), lane.child.wait())
            .await
            .unwrap()
            .unwrap()
            .success()
    );
}

#[derive(Clone, Copy)]
enum RecoveryResult {
    Released,
    Quarantined,
}

#[tokio::test]
#[ignore = "requires exact R2 Hardware and an isolated PostgreSQL authority-capture fixture"]
async fn authority_loss_after_seal_never_publishes_capture() {
    capture_after_authority_loss(None).await;
}

#[tokio::test]
#[ignore = "requires exact R2 Hardware and an isolated PostgreSQL authority-capture fixture"]
async fn stale_worker_cannot_overwrite_successor_release() {
    capture_after_authority_loss(Some(RecoveryResult::Released)).await;
}

#[tokio::test]
#[ignore = "requires exact R2 Hardware and an isolated PostgreSQL authority-capture fixture"]
async fn stale_worker_cannot_overwrite_successor_quarantine() {
    capture_after_authority_loss(Some(RecoveryResult::Quarantined)).await;
}

async fn capture_after_authority_loss(recovery: Option<RecoveryResult>) {
    use sqlx::{Connection, PgConnection, postgres::PgConnectOptions};
    let proof = PathBuf::from(std::env::var_os("CIRNET_REMOTE_AUTHORITY_CAPTURE_FIXTURE").unwrap());
    let owned = PathBuf::from(std::env::var_os("CIRNET_ARTIFACTS_SESSION").unwrap())
        .canonicalize()
        .unwrap();
    assert!(proof.canonicalize().unwrap().starts_with(&owned));
    let proof: Value = serde_json::from_slice(&std::fs::read(proof).unwrap()).unwrap();
    let database = field(&proof, "database").unwrap();
    assert!(database.starts_with("cirnet_stage4_cutover_native_"));
    let url = field(&proof, "url").unwrap();
    let token = field(&proof, "token").unwrap();
    let postgres_url = url.replacen("postgresql+psycopg://", "postgresql://", 1);
    let options: PgConnectOptions = postgres_url.parse().unwrap();
    assert_eq!(options.get_host(), "127.0.0.1");
    let mut observer = PgConnection::connect_with(&options).await.unwrap();
    let (current, data): (String, String) =
        sqlx::query_as("SELECT current_database(), current_setting('data_directory')")
            .fetch_one(&mut observer)
            .await
            .unwrap();
    let data = PathBuf::from(data).canonicalize().unwrap();
    assert!(data.starts_with(&owned));
    assert_eq!(
        data,
        PathBuf::from(field(&proof, "data_directory").unwrap())
            .canonicalize()
            .unwrap()
    );
    assert_eq!(current, database);
    let lane = Lane::start_with_database(Some((url, token))).await;
    let manager = &lane.manager;
    manager.initialize().await.unwrap();
    manager
        .0
        .test_capture_gate
        .set((Notify::new(), Notify::new()))
        .unwrap();
    let (sealed, release) = manager.0.test_capture_gate.get().unwrap();
    let context = &lane.context;
    let owner = owner(context).unwrap();
    let mut events = manager
        .0
        .events
        .subscribe(owner, &context.session_id)
        .unwrap();
    let created = manager.create(context, &json!({
        "station_id":"virtual-station-01",
        "circuit_graph":{
            "schema_version":"1.0","circuit_id":"guard-loss-capture",
            "modules":[{"id":"X","type":"DIGITAL_SWITCH","properties":{"state":true}},{"id":"L","type":"LED"}],
            "connections":[{"source":"X.OUT","destination":"L.IN"}],
        },
        "capture_config":{"signals":["L.IN"],"duration_ns":20},
    }), None, None, false).await.unwrap();
    let id = created["experiment_id"].as_str().unwrap();
    manager
        .run(context, id, None, Some("capture-guard"), None)
        .await
        .unwrap();
    timeout(Duration::from_secs(8), sealed.notified())
        .await
        .unwrap();
    assert_eq!(manager.get(owner, id).await.unwrap()["state"], "CAPTURING");
    assert!(manager.0.repo.lease(id).await.unwrap().is_some());
    assert_eq!(
        std::fs::read_dir(lane.directory.join("captures"))
            .unwrap()
            .count(),
        1
    );

    let mut exact: Vec<bool> = sqlx::query_scalar(
        "SELECT pg_terminate_backend(pid) FROM pg_locks
         WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database())
           AND locktype='advisory' AND granted AND mode='ExclusiveLock' AND objsubid=1
           AND classid::bigint=$1 AND objid::bigint=$2",
    )
    .bind(0x4349_524e_i64)
    .bind(0x4554_0001_i64)
    .fetch_all(&mut observer)
    .await
    .unwrap();
    assert_eq!(exact.pop(), Some(true));
    assert!(exact.is_empty());
    assert!(manager.0.authority.check().await.is_err());
    assert!(manager.0.authority.is_lost());
    // No monitor runs in this fixture. Pooled application reads and writes
    // remain available after only the dedicated guard connection is lost.
    assert_eq!(manager.get(owner, id).await.unwrap()["state"], "CAPTURING");
    let former = manager.record(id, Some(owner)).await.unwrap().payload;
    let previous_generation = former["_reservation_generation"].as_str().unwrap();
    let (successor, restored) = if let Some(recovery) = recovery {
        let write = WriteDb::open_existing(url).await.unwrap();
        let registry = manager.0.registry.clone();
        let config = manager.0.config.clone();
        let blocked = match recovery {
            RecoveryResult::Released => None,
            RecoveryResult::Quarantined => {
                Some(tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap())
            }
        };
        let hardware = blocked
            .as_ref()
            .map(|listener| {
                HardwareClient::new(&listener.local_addr().unwrap().to_string()).unwrap()
            })
            .unwrap_or_else(|| manager.0.hardware.clone());
        let successor = ExperimentManager::new(
            ExperimentRepository::new(write.clone(), registry.clone()),
            hardware,
            config.clone(),
            registry.clone(),
            EventHub::new(EventLimits::default()).unwrap(),
            AssignmentService::new(write.clone(), (*config).clone(), registry.clone()),
            ProjectService::new(write, (*config).clone(), registry),
            SchedulerAuthority::acquire(url).await.unwrap(),
        )
        .unwrap();
        successor.initialize().await.unwrap();
        let row = successor.record(id, Some(owner)).await.unwrap().payload;
        assert_eq!(row["state"], "FAULT");
        assert_eq!(row["error_code"], "RESTART_RECOVERY");
        let lease = successor.0.repo.lease(id).await.unwrap();
        assert_eq!(
            lease.as_ref().map(|lease| lease.quarantined),
            match recovery {
                RecoveryResult::Released => None,
                RecoveryResult::Quarantined => Some(true),
            }
        );
        // Even a stale caller reusing the successor's latest revision cannot
        // update this parent row with the revoked generation.
        let stale = transition(
            &row,
            "RUNNING",
            json!({"_reservation_generation":previous_generation}),
        )
        .unwrap();
        assert_eq!(
            manager
                .0
                .repo
                .update(Update {
                    expected: Expected {
                        id,
                        revision: row["revision"].as_i64().unwrap(),
                        generation: Some(previous_generation)
                    },
                    payload: &stale,
                })
                .await
                .unwrap(),
            Cas::Stale
        );
        (Some(successor), Some((row, lease)))
    } else {
        (None, None)
    };
    release.notify_one();

    // The successor's row is already terminal. Wait for the stale worker to
    // finish, rather than treating that earlier terminal state as the result.
    timeout(Duration::from_secs(8), async {
        loop {
            if !manager.0.state.lock().await.active.contains_key(id) {
                break;
            }
            sleep(Duration::from_millis(3)).await;
        }
    })
    .await
    .unwrap();
    let record = manager.record(id, Some(owner)).await.unwrap().payload;
    let final_lease = manager.0.repo.lease(id).await.unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM lab_captures")
        .fetch_one(&mut observer)
        .await
        .unwrap();
    let files = std::fs::read_dir(lane.directory.join("captures"))
        .unwrap()
        .count();
    let mut observations = Vec::new();
    while let Ok(Some(event)) = timeout(Duration::from_millis(25), events.recv()).await {
        observations.push(serde_json::from_str::<Value>(event.text()).unwrap());
    }
    observer.close().await.unwrap();
    let shutdown = manager.shutdown().await;
    if let Some(successor) = successor {
        successor.shutdown().await.unwrap();
    }
    lane.close_hardware().await;

    if let Some((expected, lease)) = restored {
        assert!(
            record == expected,
            "stale worker changed successor state/revision from {}/{} to {}/{}",
            expected["state"],
            expected["revision"],
            record["state"],
            record["revision"]
        );
        assert_eq!(
            final_lease, lease,
            "stale worker changed the successor's lease disposition"
        );
        assert!(record["_reservation_generation"].is_null());
        assert!(observations.iter().all(|event| !matches!(
            event["experiment"]["state"].as_str(),
            Some("STOPPING" | "RELEASE" | "FAULT")
        )));
    } else {
        assert!(final_lease.is_none());
        assert_eq!(record["state"], "FAULT");
        assert_eq!(record["error_code"], "UNAVAILABLE");
    }
    shutdown.unwrap();

    assert!(
        record["capture"].is_null(),
        "a capture became visible after scheduler authority was lost"
    );
    assert!(
        !record["state_history"]
            .as_array()
            .unwrap()
            .contains(&json!("FUNCTIONAL_VERIFY"))
    );
    assert_eq!(count, 0);
    assert_eq!(files, 0);
    assert!(!observations.is_empty());
    assert!(
        observations
            .iter()
            .all(|event| event["experiment"]["capture"].is_null())
    );
}
