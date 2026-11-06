use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use cirnet_remote_native::db::authority::{AuthorityError, SchedulerAuthority};
use sqlx::postgres::PgPoolOptions;
use tokio::process::Command;
use tokio::time::{sleep, timeout};

fn sqlite_url(path: &Path) -> String {
    format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"))
}

async fn peer(url: &str, occupied: bool) {
    let child = Command::new(std::env::current_exe().unwrap())
        .args(["--ignored", "--exact", "independent_authority_peer"])
        .env("CIRNET_REMOTE_AUTHORITY_PEER_URL", url)
        .env(
            "CIRNET_REMOTE_AUTHORITY_PEER_OCCUPIED",
            if occupied { "true" } else { "false" },
        )
        .stdin(Stdio::null())
        .kill_on_drop(true)
        .output();
    let output = timeout(Duration::from_secs(10), child)
        .await
        .unwrap()
        .unwrap();
    assert!(
        output.status.success(),
        "peer failed: {}",
        String::from_utf8_lossy(&output.stdout)
    );
}

#[tokio::test]
#[ignore = "subprocess-only scheduler authority probe"]
async fn independent_authority_peer() {
    let url = std::env::var("CIRNET_REMOTE_AUTHORITY_PEER_URL").unwrap();
    let occupied = std::env::var("CIRNET_REMOTE_AUTHORITY_PEER_OCCUPIED").unwrap() == "true";
    let result = SchedulerAuthority::acquire(&url).await;
    if occupied {
        assert!(matches!(result, Err(AuthorityError::Busy)));
    } else {
        let authority = result.unwrap();
        authority.check().await.unwrap();
    }
}

#[tokio::test]
#[ignore = "requires a closed external Python SQLite authority fixture"]
async fn sqlite_scheduler_authority_excludes_independent_processes_and_aliases() {
    let directory = PathBuf::from(std::env::var_os("CIRNET_REMOTE_AUTHORITY_FIXTURE_DIR").unwrap());
    let database = directory.join("authority.sqlite");
    let url = sqlite_url(&database);
    let alias = format!(
        "sqlite:///{}/./authority.sqlite",
        directory.to_string_lossy().replace('\\', "/")
    );
    let guard = SchedulerAuthority::acquire(&url).await.unwrap();
    guard.check().await.unwrap();
    assert!(!guard.is_lost());
    assert!(matches!(
        SchedulerAuthority::acquire(&alias).await,
        Err(AuthorityError::Busy)
    ));
    peer(&alias, true).await;
    guard.check().await.unwrap();
    drop(guard);
    peer(&alias, false).await;

    let hardlink = directory.join("hardlinked.sqlite");
    std::fs::hard_link(&database, &hardlink).unwrap();
    let rejected = SchedulerAuthority::acquire(&sqlite_url(&hardlink)).await;
    std::fs::remove_file(&hardlink).unwrap();
    assert!(matches!(rejected, Err(AuthorityError::UnsafeIdentity)));
    let guard = SchedulerAuthority::acquire(&url).await.unwrap();
    guard.check().await.unwrap();
    let renamed = directory.join("replaced.sqlite");
    #[cfg(windows)]
    {
        assert!(std::fs::rename(&database, &renamed).is_err());
        guard.check().await.unwrap();
    }
    #[cfg(unix)]
    {
        std::fs::rename(&database, &renamed).unwrap();
        assert!(matches!(guard.check().await, Err(AuthorityError::Lost)));
        std::fs::rename(&renamed, &database).unwrap();
        assert!(guard.is_lost());
        assert!(matches!(guard.check().await, Err(AuthorityError::Lost)));
    }
}

#[tokio::test]
#[ignore = "requires a dedicated loopback PostgreSQL authority fixture"]
async fn postgres_scheduler_authority_survives_peer_conflict_and_fails_closed_after_loss() {
    let url = std::env::var("CIRNET_REMOTE_AUTHORITY_FIXTURE_POSTGRES").unwrap();
    let guard = SchedulerAuthority::acquire(&url).await.unwrap();
    guard.check().await.unwrap();
    assert!(!guard.is_lost());
    assert!(matches!(
        SchedulerAuthority::acquire(&url).await,
        Err(AuthorityError::Busy)
    ));
    peer(&url, true).await;
    let observer = PgPoolOptions::new()
        .connect(&url.replacen("postgresql+psycopg://", "postgresql://", 1))
        .await
        .unwrap();
    let pids: Vec<i32> = sqlx::query_scalar(
        "SELECT pid FROM pg_locks
         WHERE locktype = 'advisory' AND objsubid = 1 AND granted
           AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
    )
    .fetch_all(&observer)
    .await
    .unwrap();
    assert_eq!(pids.len(), 1, "exactly one dedicated owner backend");
    let signal: bool = sqlx::query_scalar("SELECT pg_terminate_backend($1)")
        .bind(pids[0])
        .fetch_one(&observer)
        .await
        .unwrap();
    assert!(signal);
    assert!(matches!(guard.check().await, Err(AuthorityError::Lost)));
    assert!(guard.is_lost());
    let successor = timeout(Duration::from_secs(5), async {
        loop {
            match SchedulerAuthority::acquire(&url).await {
                Ok(guard) => break guard,
                Err(AuthorityError::Busy) => sleep(Duration::from_millis(20)).await,
                Err(error) => panic!("{error}"),
            }
        }
    })
    .await
    .unwrap();
    successor.check().await.unwrap();
    assert!(matches!(guard.check().await, Err(AuthorityError::Lost)));
    drop(successor);
    assert!(matches!(guard.check().await, Err(AuthorityError::Lost)));
}

#[tokio::test]
async fn unknown_authority_source_does_not_echo_credentials() {
    let result =
        SchedulerAuthority::acquire("other://user:fixture-secret@localhost/database").await;
    let error = match result {
        Ok(_) => panic!("unsupported source acquired"),
        Err(error) => error,
    };
    assert!(matches!(error, AuthorityError::InvalidUrl));
    assert!(!format!("{error:?} {error}").contains("fixture-secret"));
}
