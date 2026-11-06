use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::assignments::AssignmentService;
use cirnet_remote_native::auth::{self, AuthService, SessionContext};
use cirnet_remote_native::config::Config;
use cirnet_remote_native::db::WriteDb;
use cirnet_remote_native::db::authority::SchedulerAuthority;
use cirnet_remote_native::db::runtime::{ExperimentRepository, OperationKey};
use cirnet_remote_native::events::{EventHub, EventLimits};
use cirnet_remote_native::experiments::ExperimentManager;
use cirnet_remote_native::hardware::HardwareClient;
use cirnet_remote_native::projects::ProjectService;
use serde_json::Value;
use sqlx::Connection;
use sqlx::postgres::{PgConnection, PgPool, PgPoolOptions};
use tokio::time::{sleep, timeout};

const GATE: i64 = 4_812_697_205_017;

fn directory() -> PathBuf {
    std::env::var_os("CIRNET_REMOTE_STOP_CLAIM_DIR")
        .unwrap()
        .into()
}

struct Fixture {
    manager: ExperimentManager,
    auth: AuthService,
    db: WriteDb,
    repo: ExperimentRepository,
    sessions: Value,
}

impl Fixture {
    async fn open(url: &str, backend: &str) -> Self {
        let config = Config::from_vars(&HashMap::from([
            ("CIRNET_REMOTE_READ_ONLY".to_owned(), "false".to_owned()),
            ("CIRNET_ALLOW_GUEST".to_owned(), "true".to_owned()),
            ("CIRNET_DATABASE_URL".to_owned(), url.to_owned()),
            (
                "CIRNET_CAPTURE_DIR".to_owned(),
                directory()
                    .join(format!("{backend}-captures"))
                    .to_str()
                    .unwrap()
                    .to_owned(),
            ),
        ]))
        .unwrap();
        let registry = Arc::new(
            Registry::load(Path::new(&std::env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap(),
        );
        let db = WriteDb::open_existing(url).await.unwrap();
        let auth = AuthService::new(db.clone(), config.clone()).await.unwrap();
        let repo = ExperimentRepository::new(db.clone(), registry.clone());
        let manager = ExperimentManager::new(
            repo.clone(),
            HardwareClient::new("127.0.0.1:1").unwrap(),
            Arc::new(config.clone()),
            registry.clone(),
            EventHub::new(EventLimits::default()).unwrap(),
            AssignmentService::new(db.clone(), config.clone(), registry.clone()),
            ProjectService::new(db.clone(), config, registry),
            SchedulerAuthority::acquire(url).await.unwrap(),
        )
        .unwrap();
        manager.initialize().await.unwrap();
        let sessions = serde_json::from_slice(
            &std::fs::read(directory().join(format!("{backend}-sessions.json"))).unwrap(),
        )
        .unwrap();
        Self {
            manager,
            auth,
            db,
            repo,
            sessions,
        }
    }

    async fn context(&self, identity: &str, kind: &str) -> SessionContext {
        let id = self.sessions[identity][kind].as_str().unwrap();
        let row = self.db.reads().session_by_id(id).await.unwrap().unwrap();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs_f64();
        auth::context_from_row(row, true, now).unwrap()
    }
}

async fn blocked_by(observer: &PgPool, blocker: i32) -> i32 {
    timeout(Duration::from_secs(5), async {
        loop {
            let blocked: Option<i32> = sqlx::query_scalar(
                "SELECT pid FROM pg_stat_activity
                 WHERE datname = current_database() AND $1 = ANY(pg_blocking_pids(pid))
                 ORDER BY pid LIMIT 1",
            )
            .bind(blocker)
            .fetch_optional(observer)
            .await
            .unwrap();
            if let Some(pid) = blocked {
                return pid;
            }
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("expected a real PostgreSQL lock wait")
}

#[tokio::test]
#[ignore = "requires a dedicated Python-r8 PostgreSQL Stop claim fixture"]
async fn postgres_real_claim_blocks_stale_keyless_and_keyed_stop_without_mutation() {
    let url = std::env::var("CIRNET_REMOTE_STOP_CLAIM_POSTGRES").unwrap();
    let native = url.replacen("postgresql+psycopg://", "postgresql://", 1);
    let parsed = url::Url::parse(&native).unwrap();
    assert_eq!(parsed.host_str(), Some("127.0.0.1"));
    assert!(parsed.path().starts_with("/cirnet_stage4_db_stop_claim_"));
    assert!(parsed.query().is_none());
    let fixture = Fixture::open(&url, "postgres").await;
    let observer = PgPoolOptions::new().connect(&native).await.unwrap();
    // Native claim locks the guest session first, then the experiment parent.
    // Pause only at the final owner transfer while both remain uncommitted.
    let function = format!(
        "CREATE FUNCTION fixture_stop_claim_gate() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN PERFORM pg_advisory_xact_lock({GATE}); RETURN NEW; END $$"
    );
    sqlx::query(&function).execute(&observer).await.unwrap();
    sqlx::query(
        "CREATE TRIGGER fixture_stop_claim_gate BEFORE UPDATE OF owner_id ON lab_experiments
         FOR EACH ROW WHEN (OLD.owner_id IS DISTINCT FROM NEW.owner_id)
         EXECUTE FUNCTION fixture_stop_claim_gate()",
    )
    .execute(&observer)
    .await
    .unwrap();

    for (id, key) in [("claim-keyless", None), ("claim-keyed", Some("old-stop"))] {
        let older = fixture.context(id, "old").await;
        let claimant = fixture.context(id, "claim").await;
        let original = fixture.repo.get(id).await.unwrap().unwrap();
        assert_eq!(original.owner_id, older.owner_id.as_deref().unwrap());
        assert_eq!(original.payload["state"], "CREATED");
        assert_eq!(original.payload["revision"], 0);
        let mut gate = PgConnection::connect(&native).await.unwrap();
        let gate_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
            .fetch_one(&mut gate)
            .await
            .unwrap();
        sqlx::query("SELECT pg_advisory_lock($1)")
            .bind(GATE)
            .execute(&mut gate)
            .await
            .unwrap();
        let service = fixture.auth.clone();
        let claim = tokio::spawn(async move { service.claim_guest(&claimant, true).await });
        let claim_pid = blocked_by(&observer, gate_pid).await;
        assert!(!claim.is_finished());

        let manager = fixture.manager.clone();
        let stale = older.clone();
        let stop = tokio::spawn(async move { manager.stop(&stale, id, key, None).await });
        let stop_pid = blocked_by(&observer, claim_pid).await;
        assert_ne!(stop_pid, gate_pid);
        assert!(!stop.is_finished());
        let unlocked: bool = sqlx::query_scalar("SELECT pg_advisory_unlock($1)")
            .bind(GATE)
            .fetch_one(&mut gate)
            .await
            .unwrap();
        assert!(unlocked);
        let moved = timeout(Duration::from_secs(5), claim)
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let result = timeout(Duration::from_secs(5), stop)
            .await
            .unwrap()
            .unwrap();
        let current = fixture.repo.get(id).await.unwrap().unwrap();
        assert_eq!(current.owner_id, moved.context.owner_id.as_deref().unwrap());
        assert_eq!(
            current.payload, original.payload,
            "old-owner Stop changed committed state"
        );
        assert!(
            fixture
                .db
                .reads()
                .session_by_id(&older.session_id)
                .await
                .unwrap()
                .unwrap()
                .revoked
        );
        let error = result.expect_err("stale Stop accepted after guest claim");
        assert!(
            matches!(error.code.as_str(), "SESSION_EXPIRED" | "FORBIDDEN"),
            "{error:?}"
        );
        if let Some(key) = key {
            let op = fixture
                .repo
                .operation(OperationKey {
                    owner_id: &current.owner_id,
                    kind: "stop",
                    scope: id,
                    key,
                })
                .await
                .unwrap()
                .unwrap();
            assert_eq!(op.payload["status"], "REQUESTED");
            assert_eq!(op.payload["revision"], 0);
        }
        println!(
            "{id}: claim backend {claim_pid}, Stop backend {stop_pid}, denied {}",
            error.code
        );
    }
    fixture.manager.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "requires a Python-r8 SQLite Stop claim fixture"]
async fn sqlite_real_logout_invalidates_stale_same_owner_stop() {
    let path = directory().join("stop.sqlite");
    let url = format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"));
    let fixture = Fixture::open(&url, "sqlite").await;
    let context = fixture.context("revoked-stop", "old").await;
    let original = fixture.repo.get("revoked-stop").await.unwrap().unwrap();
    fixture.auth.logout(&context).await.unwrap();
    let result = fixture
        .manager
        .stop(&context, "revoked-stop", None, None)
        .await;
    let current = fixture.repo.get("revoked-stop").await.unwrap().unwrap();
    assert_eq!(current.owner_id, original.owner_id);
    assert_eq!(
        current.payload, original.payload,
        "revoked Stop changed durable state"
    );
    assert_eq!(result.unwrap_err().code, "SESSION_EXPIRED");
    fixture.manager.shutdown().await.unwrap();
}
