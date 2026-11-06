use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::{auth, config::Config, db::WriteDb, projects::ProjectService};
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};
async fn check(backend: &str) {
    let fixture: Value = serde_json::from_slice(
        &std::fs::read(std::env::var("CIRNET_REMOTE_PROJECT_FIXTURE").unwrap()).unwrap(),
    )
    .unwrap();
    let f = &fixture[backend];
    let url = f["url"].as_str().unwrap();
    let config = Config::from_vars(
        &[("CIRNET_DATABASE_URL".into(), url.into())]
            .into_iter()
            .collect(),
    )
    .unwrap();
    let db = WriteDb::open_existing(url).await.unwrap();
    let ctx = auth::current(&db.reads(), f["owner"]["token"].as_str(), &config)
        .await
        .unwrap()
        .unwrap();
    let registry = Arc::new(
        Registry::load(Path::new(&std::env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap(),
    );
    let service = ProjectService::new(db, config, registry);
    let p = service
        .create_project(&ctx, &json!({"name":"Numeric revision"}))
        .await
        .unwrap();
    let id = p["project_id"].as_str().unwrap();
    let changed = service
        .update_project(
            &ctx,
            id,
            &json!({"base_revision":1.0,"name":"Float accepted"}),
        )
        .await
        .unwrap();
    assert_eq!(changed["revision"], 2);
    for base in [json!(true), json!(2.5), json!(9007199254740992u64)] {
        assert_eq!(
            service
                .update_project(
                    &ctx,
                    id,
                    &json!({"base_revision":base,"name":"Must not change"})
                )
                .await
                .unwrap_err()
                .code,
            "INVALID_CONTRACT"
        );
    }
    let graph =
        json!({"schema_version":"1.0","circuit_id":"numeric","modules":[],"connections":[]});
    let d = service
        .create_circuit(&ctx, id, &json!({"name":"Circuit","graph":graph}), false)
        .await
        .unwrap();
    let saved = service
        .save_circuit(
            &ctx,
            d["document_id"].as_str().unwrap(),
            &json!({"base_revision":1.0,"name":"Float save","graph":graph}),
            false,
        )
        .await
        .unwrap();
    assert_eq!(saved["revision"], 2);
}
#[tokio::test]
#[ignore = "requires isolated numeric SQLite fixture"]
async fn sqlite_integral_float_revision_is_valid() {
    check("sqlite").await;
}
#[tokio::test]
#[ignore = "requires isolated numeric PostgreSQL fixture"]
async fn postgres_integral_float_revision_is_valid() {
    check("postgres").await;
}
