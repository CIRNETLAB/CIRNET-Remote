use cirnet_remote_native::{auth::AuthService, config::Config, db::WriteDb};
use serde_json::json;

const LEGACY_GUEST: &str = "stage4-auth-legacy-guest";
const ADMIN_PASSWORD: &str = "stage4-admin-password";
const STUDENT_PASSWORD: &str = "stage4-student-password";

async fn lifecycle(url: &str) {
    let config = Config::from_vars(
        &[
            ("CIRNET_DATABASE_URL".into(), url.into()),
            ("CIRNET_REMOTE_READ_ONLY".into(), "false".into()),
            ("CIRNET_BOOTSTRAP_LIMIT".into(), "2".into()),
        ]
        .into_iter()
        .collect(),
    )
    .unwrap();
    let db = WriteDb::open_existing(url).await.unwrap();
    let auth = AuthService::new(db.clone(), config).await.unwrap();

    assert!(
        auth.ensure_session(None, false, false)
            .await
            .unwrap()
            .context
            .is_none()
    );
    auth.admit_bootstrap("auth-fixture-client").await.unwrap();
    auth.admit_bootstrap("auth-fixture-client").await.unwrap();
    assert_eq!(
        auth.admit_bootstrap("auth-fixture-client")
            .await
            .unwrap_err()
            .status,
        429
    );

    let admin = auth
        .bootstrap_admin("stage4_admin", ADMIN_PASSWORD, Some("Stage 4 Admin"))
        .await
        .unwrap();
    assert_eq!(admin.role, "ADMIN");
    assert_eq!(
        auth.bootstrap_admin("other_admin", ADMIN_PASSWORD, None)
            .await
            .unwrap_err()
            .code,
        "BOOTSTRAP_ALREADY_COMPLETE"
    );
    let prelogin = auth.ensure_session(None, true, true).await.unwrap();
    let admin_login = auth
        .login(
            &prelogin.context.unwrap(),
            "STAGE4_ADMIN",
            ADMIN_PASSWORD,
            "admin-address",
        )
        .await
        .unwrap();
    assert_eq!(
        admin_login.context.principal_id.as_deref(),
        Some(admin.principal_id.as_str())
    );
    assert!(
        auth.current(prelogin.cookie.as_deref())
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(admin_login.revoked_session_ids.len(), 1);
    assert_eq!(
        auth.view(&admin_login.context)["principal"]["role"],
        "ADMIN"
    );

    let student = auth
        .create_user(
            &admin_login.context,
            "stage4_student",
            STUDENT_PASSWORD,
            "STUDENT",
            Some("Stage 4 Student"),
        )
        .await
        .unwrap();
    assert_eq!(student.role, "STUDENT");
    assert_eq!(
        auth.create_user(
            &admin_login.context,
            "STAGE4_STUDENT",
            STUDENT_PASSWORD,
            "STUDENT",
            None
        )
        .await
        .unwrap_err()
        .code,
        "USERNAME_EXISTS"
    );
    assert_eq!(
        auth.list_users(&admin_login.context).await.unwrap().len(),
        3
    );

    let python_prelogin = auth.ensure_session(None, true, true).await.unwrap();
    let python_login = auth
        .login(
            &python_prelogin.context.unwrap(),
            "stage4_python",
            "stage4-python-password",
            "python-address",
        )
        .await
        .unwrap();
    assert!(python_login.context.authenticated);
    assert_eq!(
        python_login.context.username.as_deref(),
        Some("stage4_python")
    );
    let python_logout = auth.logout(&python_login.context).await.unwrap();
    assert_eq!(
        python_logout.revoked_session_ids,
        [python_login.context.session_id]
    );
    assert!(
        auth.current(Some(&python_login.cookie))
            .await
            .unwrap()
            .is_none()
    );
    assert!(!python_logout.context.authenticated);

    let legacy_read = auth
        .ensure_session(Some(LEGACY_GUEST), false, false)
        .await
        .unwrap();
    assert!(legacy_read.cookie.is_none());
    let legacy_context = legacy_read.context.unwrap();
    assert_eq!(legacy_context.owner_id.as_deref(), Some(LEGACY_GUEST));
    assert_eq!(
        legacy_context.session_id,
        uuid::Uuid::new_v5(
            &uuid::Uuid::NAMESPACE_URL,
            format!("netcircuit-legacy-read:{LEGACY_GUEST}").as_bytes()
        )
        .simple()
        .to_string()
    );
    assert_eq!(
        auth.ensure_session(Some(LEGACY_GUEST), false, false)
            .await
            .unwrap()
            .context
            .unwrap()
            .session_id,
        legacy_context.session_id
    );
    let legacy_bootstrap = auth
        .ensure_session(Some(LEGACY_GUEST), true, true)
        .await
        .unwrap();
    assert!(legacy_bootstrap.cookie.is_some());
    assert!(!legacy_bootstrap.replaced_invalid_cookie);
    let legacy_context = legacy_bootstrap.context.unwrap();
    assert!(
        auth.ensure_session(Some(LEGACY_GUEST), false, false)
            .await
            .unwrap()
            .context
            .is_none()
    );
    let login = auth
        .login(
            &legacy_context,
            "stage4_student",
            STUDENT_PASSWORD,
            "student-address",
        )
        .await
        .unwrap();
    assert_eq!(
        login.context.claimable_guest_id.as_deref(),
        Some(LEGACY_GUEST)
    );
    assert_eq!(
        auth.list_users(&login.context).await.unwrap_err().code,
        "FORBIDDEN"
    );
    assert_eq!(
        auth.claim_guest(&login.context, false)
            .await
            .err()
            .unwrap()
            .code,
        "GUEST_CLAIM_UNAVAILABLE"
    );
    assert_eq!(
        db.reads()
            .list_projects(LEGACY_GUEST, 0, 100)
            .await
            .unwrap()
            .len(),
        1
    );

    let claimed = auth.claim_guest(&login.context, true).await.unwrap();
    assert!(claimed.context.claimable_guest_id.is_none());
    assert!(
        claimed
            .revoked_session_ids
            .contains(&login.context.session_id)
    );
    assert!(auth.current(Some(&login.cookie)).await.unwrap().is_none());
    assert!(
        db.reads()
            .list_projects(LEGACY_GUEST, 0, 100)
            .await
            .unwrap()
            .is_empty()
    );
    let projects = db
        .reads()
        .list_projects(&student.principal_id, 0, 100)
        .await
        .unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].name, "Legacy owned project");

    assert_eq!(
        auth.update_user(
            &admin_login.context,
            &admin.principal_id,
            &json!({"active":false})
        )
        .await
        .err()
        .unwrap()
        .code,
        "LAST_ADMIN_REQUIRED"
    );
    let change = auth
        .update_user(
            &admin_login.context,
            &student.principal_id,
            &json!({"active":false}),
        )
        .await
        .unwrap();
    assert!(!change.user.active);
    assert_eq!(
        change.revoked_session_ids,
        [claimed.context.session_id.clone()]
    );
    assert!(auth.current(Some(&claimed.cookie)).await.unwrap().is_none());
    assert_eq!(
        auth.logout(&claimed.context).await.err().unwrap().code,
        "SESSION_EXPIRED"
    );
    assert!(auth.maintain().await.is_ok());
}

#[tokio::test]
#[ignore = "requires isolated Python-migrated fixture in CIRNET_REMOTE_AUTH_SQLITE"]
async fn sqlite_auth_lifecycle_matches_existing_schema() {
    lifecycle(&std::env::var("CIRNET_REMOTE_AUTH_SQLITE").unwrap()).await;
}

#[tokio::test]
#[ignore = "requires isolated Python-migrated fixture in CIRNET_REMOTE_AUTH_POSTGRES"]
async fn postgres_auth_lifecycle_matches_existing_schema() {
    lifecycle(&std::env::var("CIRNET_REMOTE_AUTH_POSTGRES").unwrap()).await;
}
