//! Loopback-only auth parity host for a disposable database.
//! The receiver records durable revocations without starting a scheduler.
use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::{
    auth::AuthService,
    config::Config,
    db::{Db, WriteDb},
    error::ApiError,
    hardware::HardwareClient,
    http_api::{self, AppState, WritableAuth},
    http_auth::{Revocation, SessionRevoker},
    projects::ProjectService,
};
use std::{
    env,
    io::{Read, Write},
    net::SocketAddr,
    path::Path,
    sync::Arc,
};
use tokio::io::AsyncWriteExt;

struct RecordingRevoker {
    db: Db,
    evidence: tokio::sync::Mutex<tokio::fs::File>,
}

impl SessionRevoker for RecordingRevoker {
    fn revoke<'a>(&'a self, ids: &'a [String]) -> Revocation<'a> {
        Box::pin(async move {
            let failure = || ApiError::new("UNAVAILABLE", 503);
            for id in ids {
                if !self
                    .db
                    .session_by_id(id)
                    .await
                    .map_err(|_| failure())?
                    .is_some_and(|row| row.revoked)
                {
                    return Err(failure());
                }
            }
            let mut row = serde_json::to_vec(ids).map_err(|_| failure())?;
            row.push(b'\n');
            let mut evidence = self.evidence.lock().await;
            evidence.write_all(&row).await.map_err(|_| failure())?;
            evidence.flush().await.map_err(|_| failure())?;
            Ok(())
        })
    }
}

#[tokio::test]
#[ignore = "requires a disposable auth fixture database and runs until stdin closes"]
async fn serve_auth_fixture() {
    assert_eq!(env::var("CIRNET_STAGE4_AUTH_FIXTURE").as_deref(), Ok("1"));
    let root = env::current_dir().unwrap().canonicalize().unwrap();
    let db_path = root.join("auth.sqlite").canonicalize().unwrap();
    assert!(db_path.starts_with(&root));
    let variables = env::vars().collect();
    let config = Config::from_vars(&variables).unwrap();
    let configured_db = config.database_url.strip_prefix("sqlite:///").unwrap();
    assert_eq!(Path::new(configured_db).canonicalize().unwrap(), db_path);
    let registry =
        Arc::new(Registry::load(Path::new(&env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap());
    let write = WriteDb::open_existing(&config.database_url).await.unwrap();
    let db = write.reads();
    let service = Arc::new(
        AuthService::new(write.clone(), config.clone())
            .await
            .unwrap(),
    );
    let evidence = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(root.join("revocations.jsonl"))
        .await
        .unwrap();
    let revoker = Arc::new(RecordingRevoker {
        db: db.clone(),
        evidence: tokio::sync::Mutex::new(evidence),
    });
    let writable_auth = Some(WritableAuth::new(service, revoker, &config));
    let projects = Some(ProjectService::new(
        write.clone(),
        config.clone(),
        registry.clone(),
    ));
    let assignments = Some(cirnet_remote_native::assignments::AssignmentService::new(
        write,
        config.clone(),
        registry.clone(),
    ));
    let hardware = HardwareClient::new(&config.hardware_target).unwrap();
    let state = Arc::new(AppState {
        config,
        db,
        registry,
        hardware,
        projects,
        assignments,
        writable_auth,
        manager: None,
        websocket: None,
        openapi: None,
        routes: None,
        stations: None,
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let (stop, stopped) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 128];
        while let Ok(count) = std::io::stdin().read(&mut buffer) {
            if count == 0 {
                break;
            }
        }
        let _ = stop.send(());
    });
    println!("\nCIRNET_REMOTE_READY={}", listener.local_addr().unwrap());
    std::io::stdout().flush().unwrap();
    axum::serve(
        listener,
        http_api::router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(async {
        let _ = stopped.await;
    })
    .await
    .unwrap();
}
