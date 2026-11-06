use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::assignments::AssignmentService;
use cirnet_remote_native::auth::{self, SessionContext};
use cirnet_remote_native::config::Config;
use cirnet_remote_native::db::WriteDb;
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

const MAX: i64 = 9_007_199_254_740_991;

fn fixture_dir() -> PathBuf {
    std::env::var_os("CIRNET_REMOTE_ASSIGNMENT_FIXTURE_DIR")
        .unwrap()
        .into()
}

fn sqlite_url(path: &Path) -> String {
    format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"))
}

fn definition(id: &str, title: &str) -> Value {
    json!({"schema_version": "1.0", "assignment_id": id, "title": title,
        "lab_endpoints": [{"endpoint_id": "UNRESOLVED", "role": "INPUT_SOURCE"}],
        "assessment_policy": "FUNCTIONAL_ONLY",
        "reference_design_graph": {"schema_version": "1.0", "circuit_id": "reference",
            "modules": [], "connections": [], "metadata": {"private-answer": "keep"}},
        "expected_behavior": {"truth_table": [{"inputs": {"A": 0}, "outputs": {"Y": 1}}]}})
}

async fn actor(db: &WriteDb, ids: &Value, name: &str) -> SessionContext {
    let id = ids[name].as_str().unwrap();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs_f64();
    let row = db.reads().session_by_id(id).await.unwrap().unwrap();
    auth::context_from_row(row, true, now).unwrap()
}

macro_rules! check_data {
    ($pool:expr, $admin:expr, $teacher:expr) => {{
        let versions: Vec<i64> = sqlx::query_scalar(
            "SELECT revision FROM assignment_revisions WHERE assignment_id = 'assignment' ORDER BY revision")
            .fetch_all($pool).await.unwrap();
        assert_eq!(versions, [1, 2, 3, 4, 5]);
        let old: String = sqlx::query_scalar(
            "SELECT CAST(definition AS TEXT) FROM assignment_revisions WHERE assignment_id = 'assignment' AND revision = 2")
            .fetch_one($pool).await.unwrap();
        assert_eq!(serde_json::from_str::<Value>(&old).unwrap(), definition("assignment", "Original"));
        let audit: Vec<String> = sqlx::query_scalar(
            "SELECT action FROM auth_audit WHERE actor_id = $1 AND subject_id = 'assignment' ORDER BY sequence")
            .bind($admin).fetch_all($pool).await.unwrap();
        assert!(audit.contains(&"ASSIGNMENT_ADMIN_READ".to_owned()));
        assert!(audit.contains(&"ASSIGNMENT_ADMIN_PUBLICATION".to_owned()));
        let revoked = sqlx::query(
            "UPDATE auth_sessions SET revoked = TRUE WHERE session_id = $1")
            .bind($teacher).execute($pool).await.unwrap().rows_affected();
        assert_eq!(revoked, 1);
    }};
}

async fn verify(url: &str, fixture: &str) {
    let root = fixture_dir();
    let ids: Value = serde_json::from_slice(&std::fs::read(root.join(fixture)).unwrap()).unwrap();
    let config = Config::from_vars(&HashMap::from([
        ("CIRNET_DATABASE_URL".to_owned(), url.to_owned()),
        ("CIRNET_ALLOW_GUEST".to_owned(), "true".to_owned()),
    ]))
    .unwrap();
    let registry = Arc::new(
        Registry::load(Path::new(&std::env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap(),
    );
    let db = WriteDb::open_existing(url).await.unwrap();
    let service = AssignmentService::new(db.clone(), config.clone(), registry.clone());
    let peer = AssignmentService::new(
        WriteDb::open_existing(url).await.unwrap(),
        config.clone(),
        registry,
    );
    let teacher = actor(&db, &ids, "teacher").await;
    let teacher2 = actor(&db, &ids, "teacher2").await;
    let student = actor(&db, &ids, "student").await;
    let other = actor(&db, &ids, "other").await;
    let admin = actor(&db, &ids, "admin").await;
    let guest = actor(&db, &ids, "guest").await;
    assert_eq!(teacher.owner_id, teacher2.owner_id);
    assert_ne!(teacher.session_id, teacher2.session_id);

    let original = definition("assignment", "Original");
    let created = service.create(&teacher, &original, false).await.unwrap();
    assert_eq!(created["revision"], 1);
    assert!(created["published_revision"].is_null());
    assert_eq!(created["definition"], original);
    assert_eq!(
        service
            .create(&teacher, &original, false)
            .await
            .unwrap_err()
            .code,
        "ASSIGNMENT_EXISTS"
    );
    for actor in [&student, &other] {
        assert_eq!(
            service
                .get_document(actor, "assignment", false)
                .await
                .unwrap_err()
                .code,
            "FORBIDDEN"
        );
        assert_eq!(
            service
                .legacy_view(actor, "assignment", false)
                .await
                .unwrap_err()
                .code,
            "FORBIDDEN"
        );
    }
    assert_eq!(
        service
            .get_document(&admin, "assignment", false)
            .await
            .unwrap()["owner_id"],
        teacher.owner_id.as_deref().unwrap()
    );
    let invalid = service
        .save(
            &teacher,
            "assignment",
            &json!({"base_revision": 1,
        "definition": definition("different", "Wrong ID")}),
            false,
        )
        .await
        .unwrap_err();
    assert_eq!(invalid.code, "ASSIGNMENT_ID_MISMATCH");

    for invalid in [
        json!(1.5),
        json!(true),
        json!(0.0),
        json!(9_007_199_254_740_992.0),
        serde_json::from_str::<Value>("9007199254740991000000").unwrap(),
    ] {
        assert_eq!(
            service
                .publish(
                    &teacher,
                    "assignment",
                    &json!({"base_revision": invalid, "published": true}),
                    false
                )
                .await
                .unwrap_err()
                .status,
            422
        );
    }
    let published = service
        .publish(
            &teacher,
            "assignment",
            &json!({"base_revision": 1.0, "published": true}),
            false,
        )
        .await
        .unwrap();
    assert_eq!(published["published_revision"], 2);
    let public = service
        .legacy_view(&student, "assignment", false)
        .await
        .unwrap();
    assert_eq!(
        public,
        json!({"schema_version": "1.0", "assignment_id": "assignment", "title": "Original",
        "lab_endpoints": [{"endpoint_id": "UNRESOLVED", "role": "INPUT_SOURCE"}],
        "assessment_policy": "FUNCTIONAL_ONLY", "document_kind": "student", "published": true,
        "feedback_policy": "observed_only"})
    );
    assert_eq!(
        service
            .legacy_view(&guest, "assignment", false)
            .await
            .unwrap(),
        public
    );
    let selected = service
        .resolve_snapshot(student.owner_id.as_deref().unwrap(), "assignment")
        .await
        .unwrap();
    assert_eq!(selected.revision, 2);
    assert_eq!(selected.definition, original);

    // Independent pools and distinct author sessions contend on one document.
    let first =
        json!({"base_revision": 2.0, "definition": definition("assignment", "First draft")});
    let second =
        json!({"base_revision": 2, "definition": definition("assignment", "Second draft")});
    let (a, b) = tokio::join!(
        service.save(&teacher, "assignment", &first, false),
        peer.save(&teacher2, "assignment", &second, false)
    );
    let (saved, conflict) = match (a, b) {
        (Ok(saved), Err(conflict)) | (Err(conflict), Ok(saved)) => (saved, conflict),
        _ => panic!("expected exactly one winning assignment revision"),
    };
    assert_eq!(conflict.code, "REVISION_CONFLICT");
    assert_eq!(conflict.current_revision, Some(3));
    assert_eq!(saved["revision"], 3);
    assert_eq!(saved["published_revision"], 2);
    assert_eq!(
        service
            .legacy_view(&student, "assignment", false)
            .await
            .unwrap(),
        public
    );

    let mut tx = db.begin().await.unwrap();
    let current = auth::authorize_session(
        &mut tx,
        &student.session_id,
        student.owner_id.as_deref().unwrap(),
        &config,
    )
    .await
    .unwrap();
    assert_eq!(
        service
            .authorize_snapshot(
                &mut tx,
                &current,
                "assignment",
                selected.revision,
                &selected.definition
            )
            .await
            .unwrap(),
        json!({"assignment_id": "assignment", "revision": 2})
    );
    tx.commit().await.unwrap();
    let mut tx = db.begin().await.unwrap();
    let current = auth::authorize_session(
        &mut tx,
        &student.session_id,
        student.owner_id.as_deref().unwrap(),
        &config,
    )
    .await
    .unwrap();
    assert_eq!(
        service
            .authorize_snapshot(
                &mut tx,
                &current,
                "assignment",
                selected.revision,
                &definition("assignment", "Different")
            )
            .await
            .unwrap_err()
            .code,
        "ASSIGNMENT_CHANGED"
    );
    tx.rollback().await.unwrap();

    let unpublish = service
        .publish(
            &admin,
            "assignment",
            &json!({"base_revision": 3, "published": false}),
            false,
        )
        .await
        .unwrap();
    assert!(unpublish["published_revision"].is_null());
    let mut tx = db.begin().await.unwrap();
    let current = auth::authorize_session(
        &mut tx,
        &student.session_id,
        student.owner_id.as_deref().unwrap(),
        &config,
    )
    .await
    .unwrap();
    assert_eq!(
        service
            .authorize_snapshot(
                &mut tx,
                &current,
                "assignment",
                selected.revision,
                &selected.definition
            )
            .await
            .unwrap_err()
            .code,
        "FORBIDDEN"
    );
    tx.rollback().await.unwrap();
    let result = service
        .legacy_publish(
            &teacher,
            "assignment",
            &json!({"published": true, "feedback_policy": "detailed"}),
        )
        .await
        .unwrap();
    assert_eq!(result["document_kind"], "instructor");
    let new_public = service
        .legacy_view(&student, "assignment", false)
        .await
        .unwrap();
    assert_eq!(new_public["title"], saved["title"]);
    assert_eq!(new_public["feedback_policy"], "detailed");

    assert_eq!(
        service
            .publish(
                &teacher,
                "revision-limit",
                &json!({"base_revision": MAX, "published": true}),
                false
            )
            .await
            .unwrap_err()
            .code,
        "REVISION_LIMIT_REACHED"
    );
    assert_eq!(
        service
            .publish(
                &teacher,
                "revision-limit",
                &json!({"base_revision": MAX as f64, "published": true}),
                false
            )
            .await
            .unwrap_err()
            .code,
        "REVISION_LIMIT_REACHED"
    );
    let created = service
        .legacy_create(&other, &definition("foreign", "Foreign"))
        .await
        .unwrap();
    assert_eq!(created["document_kind"], "instructor");
    let page = service
        .list_documents(&teacher, 1, None, false)
        .await
        .unwrap();
    let cursor = page["next_cursor"].as_str().unwrap();
    let second_page = service
        .list_documents(&teacher, 1, Some(cursor), false)
        .await
        .unwrap();
    assert_eq!(second_page["items"].as_array().unwrap().len(), 1);
    assert!(second_page["next_cursor"].is_null());
    assert!(second_page["items"][0].get("definition").is_none());
    assert_eq!(
        service
            .list_documents(&other, 1, Some(cursor), false)
            .await
            .unwrap_err()
            .code,
        "INVALID_CURSOR"
    );

    let graph: Value =
        serde_json::from_slice(&std::fs::read(root.join("flexible-graph.json")).unwrap()).unwrap();
    let flexible = json!({"schema_version": "2.0", "assignment_id": "flex-assignment", "title": "Flexible",
        "lab_endpoints": [], "assessment_policy": "FUNCTIONAL_ONLY", "reference_design_graph": graph});
    let mut invalid = flexible.clone();
    invalid["reference_design_graph"]["modules"][1]["mount"]["contacts"][0]["contactId"] =
        json!("missing");
    assert_eq!(
        service
            .create(&teacher, &invalid, true)
            .await
            .unwrap_err()
            .status,
        422
    );
    assert_eq!(
        service
            .get_document(&teacher, "flex-assignment", true)
            .await
            .unwrap_err()
            .code,
        "ASSIGNMENT_NOT_FOUND"
    );
    let created = service.create(&teacher, &flexible, true).await.unwrap();
    assert_eq!(created["definition"], flexible);
    assert_eq!(created["schema_version"], "2.0");
    assert_eq!(
        service
            .get_document(&teacher, "flex-assignment", false)
            .await
            .unwrap_err()
            .code,
        "UNSUPPORTED_DOCUMENT_VERSION"
    );
    assert_eq!(
        service
            .list_documents(&teacher, 100, None, false)
            .await
            .unwrap_err()
            .code,
        "UNSUPPORTED_DOCUMENT_VERSION"
    );
    assert_eq!(
        service
            .publish(
                &teacher,
                "flex-assignment",
                &json!({"base_revision": 1.0, "published": true}),
                false
            )
            .await
            .unwrap_err()
            .code,
        "UNSUPPORTED_DOCUMENT_VERSION"
    );
    let published = service
        .publish(
            &teacher,
            "flex-assignment",
            &json!({"base_revision": 1.0, "published": true}),
            true,
        )
        .await
        .unwrap();
    assert_eq!(published["published_revision"], 2);
    let list = service.legacy_list(&student, true).await.unwrap();
    assert_eq!(list.as_array().unwrap().len(), 2);
    let flex_public = service
        .legacy_view(&student, "flex-assignment", true)
        .await
        .unwrap();
    assert_eq!(flex_public["schema_version"], "2.0");
    assert!(flex_public.get("reference_design_graph").is_none());

    let admin_id = admin.owner_id.as_deref().unwrap();
    if let Some(path) = url.strip_prefix("sqlite:///") {
        let pool = SqlitePoolOptions::new()
            .connect_with(SqliteConnectOptions::new().filename(path))
            .await
            .unwrap();
        check_data!(&pool, admin_id, &teacher.session_id);
    } else {
        let pool = PgPoolOptions::new()
            .connect(&url.replacen("postgresql+psycopg://", "postgresql://", 1))
            .await
            .unwrap();
        check_data!(&pool, admin_id, &teacher.session_id);
    }
    assert_eq!(
        service
            .save(
                &teacher,
                "assignment",
                &json!({"base_revision": 5, "definition": original}),
                false
            )
            .await
            .unwrap_err()
            .code,
        "SESSION_EXPIRED"
    );
}

#[tokio::test]
#[ignore = "requires Python-r8 SQLite assignment fixture"]
async fn sqlite_assignment_records() {
    verify(
        &sqlite_url(&fixture_dir().join("assignment.sqlite")),
        "sqlite-actors.json",
    )
    .await;
}

#[tokio::test]
#[ignore = "requires isolated Python-r8 PostgreSQL assignment fixture"]
async fn postgres_assignment_records() {
    let url = std::env::var("CIRNET_REMOTE_ASSIGNMENT_FIXTURE_POSTGRES").unwrap();
    verify(&url, "postgres-actors.json").await;
}
