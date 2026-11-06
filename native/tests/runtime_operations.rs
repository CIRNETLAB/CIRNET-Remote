use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::assignments::AssignmentService;
use cirnet_remote_native::config::Config;
use cirnet_remote_native::db::WriteDb;
use cirnet_remote_native::db::runtime::{
    Cas, Create, ExperimentRepository, OperationInsert, OperationKey, OperationUpdate,
    RecoveryKind, RuntimeError,
};
use serde_json::json;

const OWNER: &str = "runtime-owner";

fn dir() -> PathBuf {
    std::env::var_os("CIRNET_REMOTE_RUNTIME_EXTRA_DIR")
        .unwrap()
        .into()
}

async fn verify(url: &str) {
    let resources = std::env::var("CIRNET_CONTRACTS_ROOT").unwrap();
    let registry = Arc::new(Registry::load(Path::new(&resources)).unwrap());
    let db = WriteDb::open_existing(url).await.unwrap();
    let repo = ExperimentRepository::new(db.clone(), registry.clone());
    assert!(repo.has_active_owner(OWNER).await.unwrap());
    assert!(!repo.has_active_owner("stranger").await.unwrap());
    let page = repo
        .active_page(
            Some(OWNER),
            Some("runtime-session"),
            Some("runtime-client"),
            "",
            1,
        )
        .await
        .unwrap();
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].experiment_id, "queued-a");
    assert_eq!(page[0].owner_id, OWNER);
    assert_eq!(
        page[0].control_session_id.as_deref(),
        Some("runtime-session")
    );
    assert_eq!(page[0].control_client_id.as_deref(), Some("runtime-client"));
    assert_eq!(
        repo.active_page(
            Some(OWNER),
            Some("runtime-session"),
            Some("runtime-client"),
            "queued-a",
            100
        )
        .await
        .unwrap()[0]
            .experiment_id,
        "queued-b"
    );
    assert!(
        repo.active_page(Some("stranger"), None, None, "", 100)
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        repo.leases_page("", 1).await.unwrap()[0].experiment_id,
        "collision"
    );
    assert_eq!(
        repo.leases_page("collision", 1).await.unwrap()[0].experiment_id,
        "legacy"
    );
    assert_eq!(
        repo.lease("legacy").await.unwrap().unwrap().station_id,
        "legacy-station"
    );
    assert!(repo.lease("queued-a").await.unwrap().is_none());
    assert_eq!(repo.admission_sequence().await.unwrap(), 2);
    assert_eq!(
        repo.recovery_page(RecoveryKind::Queued, "", 100)
            .await
            .unwrap()
            .len(),
        2
    );
    assert!(
        repo.recovery_page(RecoveryKind::LegacyCapture, "", 100)
            .await
            .unwrap()
            .is_empty()
    );

    let config = Config::from_vars(&HashMap::from([(
        "CIRNET_DATABASE_URL".to_owned(),
        url.to_owned(),
    )]))
    .unwrap();
    let assignments = AssignmentService::new(db, config, registry);
    assert!(
        assignments
            .may_disclose_experiment_feedback("runtime-admin", "missing")
            .await
            .unwrap()
    );
    assert!(
        assignments
            .may_disclose_experiment_feedback("runtime-instructor", "observed")
            .await
            .unwrap()
    );
    assert!(
        !assignments
            .may_disclose_experiment_feedback("runtime-disabled", "observed")
            .await
            .unwrap()
    );
    assert!(
        !assignments
            .may_disclose_experiment_feedback(OWNER, "observed")
            .await
            .unwrap()
    );
    assert!(
        !assignments
            .may_disclose_experiment_feedback(OWNER, "missing")
            .await
            .unwrap()
    );
    assert!(
        assignments
            .may_disclose_experiment_feedback(OWNER, "detailed")
            .await
            .unwrap()
    );

    let request = json!({"experiment_id": "created", "station_id": "simulation", "state": "CREATED",
        "revision": 1, "capture": null, "_document_reference":{"document_id":"runtime-doc","revision":1}});
    let key = OperationKey {
        owner_id: OWNER,
        kind: "create",
        scope: "",
        key: "create-fixture",
    };
    let applied = json!({"schema_version": "1.0", "operation_key": key.key, "kind": key.kind,
        "status": "APPLIED", "experiment_id": "created", "error_code": null, "revision": 1});
    let operation = OperationInsert {
        identity: key,
        fingerprint: "create-fingerprint",
        payload: &applied,
    };
    let mut tx = repo.begin().await.unwrap();
    repo.create_in(
        &mut tx,
        Create {
            owner_id: OWNER,
            payload: &request,
            operation: Some(operation),
        },
    )
    .await
    .unwrap();
    assert!(repo.get("created").await.unwrap().is_none());
    assert!(repo.operation(key).await.unwrap().is_none());
    tx.commit().await.unwrap();
    assert_eq!(repo.get("created").await.unwrap().unwrap().payload, request);
    let stored = repo.operation(key).await.unwrap().unwrap();
    assert_eq!(stored.payload, applied);
    assert_eq!(stored.fingerprint, "create-fingerprint");

    let mut duplicate = request.clone();
    duplicate["experiment_id"] = json!("duplicate");
    let mut repeated = applied.clone();
    repeated["experiment_id"] = json!("duplicate");
    let repeated = OperationInsert {
        payload: &repeated,
        ..operation
    };
    let mut tx = repo.begin().await.unwrap();
    assert!(matches!(
        repo.create_in(
            &mut tx,
            Create {
                owner_id: OWNER,
                payload: &duplicate,
                operation: Some(repeated),
            }
        )
        .await,
        Err(RuntimeError::OperationConflict)
    ));
    tx.rollback().await.unwrap();
    assert!(repo.get("duplicate").await.unwrap().is_none());
    let mut tx = repo.begin().await.unwrap();
    assert!(matches!(
        repo.create_in(
            &mut tx,
            Create {
                owner_id: "stranger",
                payload: &duplicate,
                operation: None,
            }
        )
        .await,
        Err(RuntimeError::DocumentUnavailable)
    ));
    tx.rollback().await.unwrap();
    assert!(repo.get("duplicate").await.unwrap().is_none());

    let key = OperationKey {
        owner_id: OWNER,
        kind: "run",
        scope: "created",
        key: "run-fixture",
    };
    let requested = json!({"schema_version": "1.0", "operation_key": key.key, "kind": key.kind,
        "status": "REQUESTED", "experiment_id": key.scope, "error_code": null, "revision": 0});
    let mut tx = repo.begin().await.unwrap();
    let op = OperationInsert {
        identity: key,
        fingerprint: "run-fingerprint",
        payload: &requested,
    };
    assert!(repo.insert_operation_in(&mut tx, op).await.unwrap());
    assert!(!repo.insert_operation_in(&mut tx, op).await.unwrap());
    assert_eq!(
        repo.operation_in(&mut tx, key)
            .await
            .unwrap()
            .unwrap()
            .payload,
        requested
    );
    tx.commit().await.unwrap();
    let mut accepted = requested.clone();
    accepted["status"] = json!("ACCEPTED");
    accepted["revision"] = json!(1);
    accepted["_private"] = json!(true);
    accepted["experiment"] = request.clone();
    let mut tx = repo.begin().await.unwrap();
    assert_eq!(
        repo.update_operation_in(
            &mut tx,
            OperationUpdate {
                identity: key,
                expected_revision: 0,
                payload: &accepted,
            }
        )
        .await
        .unwrap(),
        Cas::Applied
    );
    assert_eq!(
        repo.update_operation_in(
            &mut tx,
            OperationUpdate {
                identity: key,
                expected_revision: 0,
                payload: &accepted,
            }
        )
        .await
        .unwrap(),
        Cas::Stale
    );
    tx.commit().await.unwrap();
    let stored = repo.operation(key).await.unwrap().unwrap();
    assert_eq!(stored.payload["status"], "ACCEPTED");
    assert!(stored.payload.get("_private").is_none());
    assert!(stored.payload.get("experiment").is_none());

    let first = repo.page(OWNER, 1, None, true).await.unwrap();
    assert_eq!(first.items[0]["experiment_id"], "collision");
    let cursor = first.next_cursor.as_deref().unwrap();
    assert!(matches!(
        repo.page("stranger", 1, Some(cursor), true).await,
        Err(RuntimeError::InvalidCursor)
    ));
    assert!(matches!(
        repo.page(OWNER, 1, Some(cursor), false).await,
        Err(RuntimeError::InvalidCursor)
    ));
    let rest = repo.page(OWNER, 100, Some(cursor), true).await.unwrap();
    assert_eq!(rest.items.len(), 4);
    assert_eq!(rest.items.last().unwrap()["experiment_id"], "created");
    assert_eq!(
        repo.page(OWNER, 1, None, false).await.unwrap().items[0]["experiment_id"],
        "created"
    );
}

#[tokio::test]
#[ignore = "requires fresh SQLite runtime extension fixtures"]
async fn sqlite_runtime_operations() {
    verify(&format!(
        "sqlite:///{}",
        dir()
            .join("runtime.sqlite")
            .to_string_lossy()
            .replace('\\', "/")
    ))
    .await;
}

#[tokio::test]
#[ignore = "requires fresh PostgreSQL runtime extension fixtures"]
async fn postgres_runtime_operations() {
    verify(&std::env::var("CIRNET_REMOTE_RUNTIME_EXTRA_PG").unwrap()).await;
}
