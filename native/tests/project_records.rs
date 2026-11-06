use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::{auth, config::Config, db::WriteDb, projects::ProjectService};
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};
fn graph() -> Value {
    json!({"schema_version":"1.1","circuit_id":"embedded-original",
"modules":[{"id":"R","type":"RESISTOR_AXIAL","position":{"x":1,"y":2.5,"z":0},
"properties":{"resistance_ohm":1000,"custom-supported":{"nested":[null,true,4]}}}],
"connections":[],"metadata":{"foreign-extension":{"values":[1,null,{"keep":"exact"}]},"name":"Original import name"}})
}
async fn lifecycle(url: &str, fixture: &Value) {
    let config = Config::from_vars(
        &[("CIRNET_DATABASE_URL".into(), url.into())]
            .into_iter()
            .collect(),
    )
    .unwrap();
    let db = WriteDb::open_existing(url).await.unwrap();
    let owner = auth::current(&db.reads(), fixture["owner"]["token"].as_str(), &config)
        .await
        .unwrap()
        .unwrap();
    let peer_context = auth::current(&db.reads(), fixture["peer"]["token"].as_str(), &config)
        .await
        .unwrap()
        .unwrap();
    assert_ne!(peer_context.session_id, owner.session_id);
    assert_eq!(peer_context.owner_id, owner.owner_id);
    let other = auth::current(&db.reads(), fixture["other"]["token"].as_str(), &config)
        .await
        .unwrap()
        .unwrap();
    let registry = Arc::new(
        Registry::load(Path::new(&std::env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap(),
    );
    let service = ProjectService::new(db.clone(), config.clone(), registry.clone());
    let project = service
        .create_project(
            &owner,
            &json!({"name":"Project","description":"A description"}),
        )
        .await
        .unwrap();
    assert_eq!(project["revision"], 1);
    let pid = project["project_id"].as_str().unwrap();
    let document = service
        .create_circuit(
            &owner,
            pid,
            &json!({"name":"Server name","graph":graph()}),
            false,
        )
        .await
        .unwrap();
    let did = document["document_id"].as_str().unwrap();
    assert_ne!(did, graph()["circuit_id"].as_str().unwrap());
    assert_eq!(document["graph"], graph());
    assert_eq!(
        service
            .get_circuit(owner.owner_id.as_deref().unwrap(), did, None, false)
            .await
            .unwrap(),
        document
    );
    assert_eq!(
        service
            .get_circuit(other.owner_id.as_deref().unwrap(), did, None, false)
            .await
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    let fail = service
        .save_circuit(
            &other,
            did,
            &json!({"base_revision":1,"name":"stolen","graph":graph()}),
            false,
        )
        .await
        .unwrap_err();
    assert_eq!(fail.code, "FORBIDDEN");
    // Independent pools and the same base revision must yield exactly one write.
    let peer = ProjectService::new(WriteDb::open_existing(url).await.unwrap(), config, registry);
    let a = json!({"base_revision":1,"name":"first","graph":graph()});
    let b = json!({"base_revision":1,"name":"second","graph":graph()});
    let (left, right) = tokio::join!(
        service.save_circuit(&owner, did, &a, false),
        peer.save_circuit(&peer_context, did, &b, false)
    );
    assert_eq!(usize::from(left.is_ok()) + usize::from(right.is_ok()), 1);
    let (saved, error) = if let (Ok(saved), Err(error)) = (&left, &right) {
        (saved, error)
    } else {
        (right.as_ref().unwrap(), left.as_ref().unwrap_err())
    };
    assert_eq!(error.code, "REVISION_CONFLICT");
    assert_eq!(error.current_revision, Some(2));
    assert_eq!(
        service
            .get_circuit(owner.owner_id.as_deref().unwrap(), did, None, false)
            .await
            .unwrap(),
        *saved
    );
    assert_eq!(
        service
            .get_circuit(owner.owner_id.as_deref().unwrap(), did, Some(1), false)
            .await
            .unwrap()["graph"],
        graph()
    );
    let updated = service
        .update_project(
            &owner,
            pid,
            &json!({"base_revision":1,"description":"Changed"}),
        )
        .await
        .unwrap();
    assert_eq!(updated["name"], "Project");
    assert_eq!(updated["revision"], 2);
    assert_eq!(
        service
            .update_project(&owner, pid, &json!({"base_revision":1,"name":"old"}))
            .await
            .unwrap_err()
            .current_revision,
        Some(2)
    );
    assert_eq!(
        service
            .create_project(&owner, &json!({"name":" \t\n"}))
            .await
            .unwrap_err()
            .code,
        "INVALID_NAME"
    );
    let deleted = service.delete_circuit(&owner, did, 2).await.unwrap();
    assert_eq!(deleted["revision"], 3);
    assert_eq!(
        service
            .get_circuit(owner.owner_id.as_deref().unwrap(), did, None, false)
            .await
            .unwrap_err()
            .code,
        "DOCUMENT_NOT_FOUND"
    );
    assert_eq!(
        service.delete_project(&owner, pid, 2).await.unwrap()["revision"],
        3
    );

    let capped = service
        .create_project(&owner, &json!({"name":"Atomic deletion"}))
        .await
        .unwrap();
    let cap_pid = capped["project_id"].as_str().unwrap();
    let first = service
        .create_circuit(
            &owner,
            cap_pid,
            &json!({"name":"first","graph":graph()}),
            false,
        )
        .await
        .unwrap();
    let last = service
        .create_circuit(
            &owner,
            cap_pid,
            &json!({"name":"limit","graph":graph()}),
            false,
        )
        .await
        .unwrap();
    let last_id = last["document_id"].as_str().unwrap();
    set_revision(url, last_id, cirnet_remote_native::projects::MAX_REVISION).await;
    assert_eq!(
        service
            .delete_project(&owner, cap_pid, 1)
            .await
            .unwrap_err()
            .code,
        "REVISION_LIMIT_REACHED"
    );
    let parent = db.reads().project_by_id(cap_pid).await.unwrap().unwrap();
    assert_eq!(parent.revision, 1);
    assert!(!parent.deleted);
    let first = db
        .reads()
        .circuit_by_id(first["document_id"].as_str().unwrap())
        .await
        .unwrap()
        .unwrap();
    let last = db.reads().circuit_by_id(last_id).await.unwrap().unwrap();
    assert_eq!(first.revision, 1);
    assert!(!first.deleted);
    assert!(!last.deleted);
    assert_eq!(last.revision, cirnet_remote_native::projects::MAX_REVISION);

    // A revoked session must fail before any persistent mutation.
    let mut stale = owner.clone();
    stale.session_id = fixture["revoked"]["session_id"].as_str().unwrap().into();
    assert_eq!(
        service
            .create_project(&stale, &json!({"name":"must not exist"}))
            .await
            .unwrap_err()
            .code,
        "SESSION_EXPIRED"
    );
}
#[tokio::test]
#[ignore = "requires isolated project fixture in CIRNET_REMOTE_PROJECT_FIXTURE"]
async fn sqlite_project_roundtrip_cas_and_authority() {
    let path = std::env::var("CIRNET_REMOTE_PROJECT_FIXTURE").unwrap();
    let fixture: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    lifecycle(
        fixture["sqlite"]["url"].as_str().unwrap(),
        &fixture["sqlite"],
    )
    .await;
}
#[tokio::test]
#[ignore = "requires isolated PostgreSQL project fixture"]
async fn postgres_project_roundtrip_cas_and_authority() {
    let path = std::env::var("CIRNET_REMOTE_PROJECT_FIXTURE").unwrap();
    let fixture: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    lifecycle(
        fixture["postgres"]["url"].as_str().unwrap(),
        &fixture["postgres"],
    )
    .await;
}

async fn set_revision(url: &str, id: &str, revision: i64) {
    let statement = "UPDATE circuit_documents SET revision=$1 WHERE document_id=$2";
    if url.starts_with("sqlite:") {
        let url = url.replacen("sqlite:///", "sqlite://", 1);
        let pool = sqlx::SqlitePool::connect(&url).await.unwrap();
        assert_eq!(
            sqlx::query(statement)
                .bind(revision)
                .bind(id)
                .execute(&pool)
                .await
                .unwrap()
                .rows_affected(),
            1
        );
        pool.close().await;
    } else {
        let url = url.replacen("postgresql+psycopg://", "postgresql://", 1);
        let pool = sqlx::PgPool::connect(&url).await.unwrap();
        assert_eq!(
            sqlx::query(statement)
                .bind(revision)
                .bind(id)
                .execute(&pool)
                .await
                .unwrap()
                .rows_affected(),
            1
        );
        pool.close().await;
    }
}
