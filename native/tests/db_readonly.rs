use std::collections::BTreeMap;
use std::ffi::OsString;
use std::path::Path;

use cirnet_remote_native::db::{Db, DbError};
use serde_json::json;

const OWNER: &str = "stage4-db-owner";
const OTHER: &str = "stage4-db-other";
const GUEST: &str = "stage4-db-guest";
const LARGEST_JS_INTEGER: i64 = 9_007_199_254_740_991;

fn sqlite_url(path: &Path) -> String {
    format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"))
}

fn snapshot(directory: &Path) -> BTreeMap<OsString, Vec<u8>> {
    std::fs::read_dir(directory)
        .unwrap()
        .map(|entry| {
            let entry = entry.unwrap();
            (entry.file_name(), std::fs::read(entry.path()).unwrap())
        })
        .collect()
}

async fn check_legacy_rows(db: &Db) {
    let session = db
        .session_by_token_hash(&"a".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(session.session_id, "account-session");
    let by_id = db
        .session_by_id(&session.session_id)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(by_id.csrf_token, session.csrf_token);
    assert_eq!(by_id.user_auth_revision, session.user_auth_revision);
    assert!(db.session_by_id("missing").await.unwrap().is_none());
    assert_eq!(session.principal_id.as_deref(), Some(OWNER));
    assert_eq!(session.csrf_token, "csrf-fixture");
    assert_eq!(session.expires_at, 1_900_000_000.125);
    assert!(!session.revoked);
    assert_eq!(session.auth_revision, 7);
    assert_eq!(session.claimable_guest_id.as_deref(), Some(GUEST));
    assert_eq!(session.user_principal_id.as_deref(), Some(OWNER));
    assert_eq!(session.user_auth_revision, Some(7));
    assert_eq!(session.active, Some(true));
    assert_eq!(session.role.as_deref(), Some("STUDENT"));
    assert_eq!(session.username.as_deref(), Some("stage4-owner"));
    assert_eq!(session.display_name.as_deref(), Some("Người dùng"));

    let guest = db
        .session_by_token_hash(&"b".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(guest.principal_id.as_deref(), Some(GUEST));
    assert_eq!(guest.user_principal_id, None);
    assert_eq!(guest.user_auth_revision, None);
    assert_eq!(guest.active, None);
    let anonymous = db
        .session_by_token_hash(&"c".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(anonymous.principal_id, None);
    assert_eq!(anonymous.user_principal_id, None);
    let revoked = db
        .session_by_token_hash(&"d".repeat(64))
        .await
        .unwrap()
        .unwrap();
    assert!(revoked.revoked);
    assert_eq!(revoked.active, Some(false));
    assert_eq!(revoked.auth_revision, 10);
    assert_eq!(revoked.user_auth_revision, Some(11));
    assert!(
        db.session_by_token_hash(&"0".repeat(64))
            .await
            .unwrap()
            .is_none()
    );

    let page = db.list_projects(OWNER, 0, 1).await.unwrap();
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].project_id, "project-a");
    assert_eq!(page[0].owner_id, OWNER);
    assert_eq!(page[0].name, "Mạch số");
    assert_eq!(page[0].description, "Legacy project");
    assert_eq!(page[0].revision, LARGEST_JS_INTEGER);
    assert_eq!(page[0].created_at, 1_700_000_000.125);
    assert_eq!(page[0].updated_at, 1_700_000_000.25);
    assert!(!page[0].deleted);
    let after = db.list_projects(OWNER, page[0].sequence, 10).await.unwrap();
    assert_eq!(after.len(), 1);
    assert_eq!(after[0].project_id, "project-b");
    assert_eq!(
        db.project_by_id("project-foreign")
            .await
            .unwrap()
            .unwrap()
            .owner_id,
        OTHER
    );
    assert!(
        db.project_by_id("project-deleted")
            .await
            .unwrap()
            .unwrap()
            .deleted
    );
    assert!(db.project_by_id("missing").await.unwrap().is_none());

    let page = db.list_circuits(OWNER, "project-a", 0, 10).await.unwrap();
    assert_eq!(page.len(), 1);
    assert_eq!(page[0].document_id, "circuit-a");
    assert_eq!(page[0].project_id, "project-a");
    assert_eq!(page[0].owner_id, OWNER);
    assert_eq!(page[0].graph_schema_version, "1.1");
    assert_eq!(page[0].revision, LARGEST_JS_INTEGER);
    assert!(
        db.list_circuits(OWNER, "project-a", page[0].sequence, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        db.list_circuits(OTHER, "project-a", 0, 10)
            .await
            .unwrap()
            .is_empty()
    );
    let deleted = db.circuit_by_id("circuit-deleted").await.unwrap().unwrap();
    assert!(deleted.deleted);
    assert!(db.circuit_by_id("missing").await.unwrap().is_none());
    let snapshot = db
        .circuit_revision("circuit-a", LARGEST_JS_INTEGER)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(snapshot.document_id, "circuit-a");
    assert_eq!(snapshot.revision, LARGEST_JS_INTEGER);
    assert_eq!(snapshot.name, "Mạch số");
    assert_eq!(snapshot.graph_schema_version, "1.1");
    assert_eq!(snapshot.saved_at, 1_700_000_000.5);
    assert_eq!(
        snapshot.graph,
        json!({"schema_version": "1.1", "circuit_id": "embedded-fixture", "modules": [], "connections": [],
               "metadata": {"label": "Mạch", "integer": LARGEST_JS_INTEGER, "float": 0.125}})
    );
    assert!(db.circuit_revision("circuit-a", 2).await.unwrap().is_none());
}

#[tokio::test]
async fn unsupported_url_does_not_echo_credentials() {
    let result = Db::open_readonly("mysql://user:fixture-password@localhost/sample").await;
    let error = match result {
        Err(error) => error,
        Ok(_) => panic!("unsupported database URL accepted"),
    };
    assert!(matches!(error, DbError::InvalidUrl));
    assert!(!format!("{error:?} {error}").contains("fixture-password"));
}

#[tokio::test]
#[ignore = "requires closed Python-migrated fixtures in CIRNET_REMOTE_DB_FIXTURE_DIR"]
async fn reads_legacy_sqlite_without_mutating_files() {
    let directory = std::env::var_os("CIRNET_REMOTE_DB_FIXTURE_DIR").unwrap();
    let directory = Path::new(&directory);
    let before = snapshot(directory);
    let db = Db::open_readonly(&sqlite_url(&directory.join("legacy.sqlite")))
        .await
        .unwrap();
    check_legacy_rows(&db).await;
    drop(db);

    let wrong = Db::open_readonly(&sqlite_url(&directory.join("wrong.sqlite"))).await;
    assert!(matches!(wrong, Err(DbError::RevisionMismatch)));
    let missing = Db::open_readonly(&sqlite_url(&directory.join("missing.sqlite"))).await;
    assert!(missing.is_err());
    for name in ["wal.sqlite", "hot.sqlite"] {
        let unsafe_copy = Db::open_readonly(&sqlite_url(&directory.join(name))).await;
        assert!(matches!(unsafe_copy, Err(DbError::UnsafeSnapshot)));
    }
    assert_eq!(snapshot(directory), before);
}

#[tokio::test]
#[ignore = "requires a Python-migrated PostgreSQL fixture in CIRNET_REMOTE_DB_FIXTURE_POSTGRES"]
async fn reads_legacy_postgres() {
    let url = std::env::var("CIRNET_REMOTE_DB_FIXTURE_POSTGRES").unwrap();
    let db = Db::open_readonly(&url).await.unwrap();
    check_legacy_rows(&db).await;
}
