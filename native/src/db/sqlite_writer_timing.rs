//! Opt-in SQLite component diagnostic. No HTTP, Hardware, or acceptance thresholds.

use std::env;
use std::fs::OpenOptions;
use std::future::{Future, poll_fn};
use std::io::Write;
use std::path::PathBuf;
use std::pin::pin;
use std::task::Poll;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use sqlx::{Connection, SqlitePool};
use tokio::{sync::oneshot, time};

use super::super::{Pool, WriteDb, migrations, write::tx_execute};

const HOLDS_MS: [u64; 3] = [10, 25, 50];
const REPEATS: usize = 5;
const READ: &str = "SELECT value FROM writer_probe WHERE id = 1";

fn ns(origin: Instant) -> u64 {
    origin.elapsed().as_nanos().try_into().unwrap()
}

async fn idle(pool: &SqlitePool) {
    while pool.num_idle() < 3 {
        tokio::task::yield_now().await;
    }
    assert_eq!(pool.size(), 3);
}

async fn uncontended(pool: &SqlitePool, origin: Instant, expected: i64) -> Value {
    let acquire_started = ns(origin);
    let mut connection = pool.acquire().await.unwrap();
    let acquired = ns(origin);
    let mut second = (&mut *connection)
        .begin_with("BEGIN IMMEDIATE")
        .await
        .unwrap();
    let returned = ns(origin);
    let value: i64 = sqlx::query_scalar(READ)
        .fetch_one(&mut *second)
        .await
        .unwrap();
    assert_eq!(value, expected);
    second.rollback().await.unwrap();
    connection.return_to_pool().await;
    json!({
        "pool_acquire_started_ns": acquire_started, "pool_acquired_ns": acquired,
        "begin_started_ns": acquired, "begin_returned_ns": returned,
        "pool_acquire_ns": acquired - acquire_started, "begin_ns": returned - acquired,
    })
}

async fn contended(
    db: &WriteDb,
    pool: &SqlitePool,
    origin: Instant,
    hold_ms: u64,
    previous: i64,
) -> Value {
    let mut first = db.begin().await.unwrap();
    let first_write = tx_execute!(
        first,
        "UPDATE writer_probe SET value = value + 1 WHERE id = 1"
    );
    assert_eq!(first_write.unwrap(), 1);

    let (attempt, attempted) = oneshot::channel();
    let second_pool = pool.clone();
    let challenger = tokio::spawn(async move {
        let acquire_started = ns(origin);
        let mut connection = second_pool.acquire().await.unwrap();
        let acquired = ns(origin);
        let begin_started = ns(origin);
        let begin_returned = {
            let mut begin = pin!((&mut *connection).begin_with("BEGIN IMMEDIATE"));
            assert!(
                poll_fn(|context| Poll::Ready(begin.as_mut().poll(context).is_pending())).await,
                "Second BEGIN completed while the first writer still held the lock."
            );
            attempt
                .send((acquire_started, acquired, begin_started))
                .unwrap();
            let mut tx = begin.await.unwrap();
            let returned = ns(origin);
            let committed: i64 = sqlx::query_scalar(READ).fetch_one(&mut *tx).await.unwrap();
            assert_eq!(committed, previous + 1);
            tx.rollback().await.unwrap();
            returned
        };
        connection.return_to_pool().await;
        begin_returned
    });

    let (acquire_started, acquired, begin_started) = attempted.await.unwrap();
    assert_eq!((pool.size(), pool.num_idle()), (3, 1));
    let read_started = ns(origin);
    let committed: i64 = sqlx::query_scalar(READ).fetch_one(pool).await.unwrap();
    let read_returned = ns(origin);
    assert_eq!(
        committed, previous,
        "A concurrent reader saw an uncommitted write."
    );
    assert_eq!(
        pool.size(),
        3,
        "Concurrent read opened an extra pool connection."
    );

    let hold = Duration::from_millis(hold_ms);
    time::sleep(hold.saturating_sub(Duration::from_nanos(ns(origin) - begin_started))).await;
    assert!(!challenger.is_finished());
    let commit_started = ns(origin);
    first.commit().await.unwrap();
    let commit_returned = ns(origin);
    let begin_returned = challenger.await.unwrap();
    assert!(acquire_started <= acquired && acquired <= begin_started);
    assert!(begin_started <= read_started && read_returned <= commit_started);
    assert!(begin_returned >= commit_started);
    idle(pool).await;

    // SQLite may unblock the challenger before the first commit future's wake-up.
    // The signed difference records that possibility without claiming the exact
    // internal unlock time. The latest observed commit return bounds it below.
    let signed_overshoot = i128::from(begin_returned) - i128::from(commit_returned);
    json!({
        "requested_hold_ms": hold_ms, "actual_hold_after_begin_attempt_ns": commit_started - begin_started,
        "pool_acquire_started_ns": acquire_started, "pool_acquired_ns": acquired,
        "begin_started_ns": begin_started, "begin_returned_ns": begin_returned,
        "pool_acquire_ns": acquired - acquire_started, "begin_ns": begin_returned - begin_started,
        "read_started_ns": read_started, "read_returned_ns": read_returned,
        "read_while_writer_held_ns": read_returned - read_started,
        "first_commit_started_ns": commit_started, "first_commit_returned_ns": commit_returned,
        "begin_minus_first_commit_return_ns": signed_overshoot,
        "post_unlock_delay_lower_ns": begin_returned.saturating_sub(commit_returned),
        "post_unlock_delay_upper_ns": begin_returned - commit_started,
    })
}

async fn probe() {
    for variable in [
        "CIRNET_SQLITE_ROLLBACK_JOURNAL",
        "NETCIRCUIT_SQLITE_ROLLBACK_JOURNAL",
    ] {
        assert!(env::var_os(variable).is_none());
    }
    let owned = PathBuf::from(env::var_os("CIRNET_ARTIFACTS_SESSION").unwrap())
        .canonicalize()
        .unwrap();
    let lane = PathBuf::from(env::var_os("CIRNET_STAGE4_SQLITE_WRITER_PROBE_DIR").unwrap());
    assert!(lane.is_absolute());
    let canonical = lane.canonicalize().unwrap();
    assert!(canonical != owned && canonical.starts_with(&owned));
    let fixture = lane.join("writer-probe.sqlite");
    assert!(
        !fixture.exists(),
        "Select a fresh owned SQLite fixture directory."
    );
    let url = format!("sqlite:///{}", fixture.to_string_lossy().replace('\\', "/"));
    migrations::migrate(&url).await.unwrap();
    let db = WriteDb::open_existing(&url).await.unwrap();
    let reads = db.reads();
    let Pool::Sqlite(pool) = &reads.pool else {
        panic!("Expected SQLite")
    };

    let mut setup = db.begin().await.unwrap();
    tx_execute!(
        setup,
        "CREATE TABLE writer_probe (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)"
    )
    .unwrap();
    tx_execute!(setup, "INSERT INTO writer_probe (id, value) VALUES (1, 0)").unwrap();
    setup.commit().await.unwrap();

    let mut warm = Vec::new();
    let mut settings = Vec::new();
    for _ in 0..3 {
        let mut connection = pool.acquire().await.unwrap();
        let journal: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        let version: String = sqlx::query_scalar("SELECT sqlite_version()")
            .fetch_one(&mut *connection)
            .await
            .unwrap();
        assert_eq!((journal.as_str(), synchronous), ("delete", 2));
        settings.push(json!({"journal_mode": journal, "synchronous": synchronous,
                            "busy_timeout_ms": busy_timeout, "sqlite_version": version}));
        warm.push(connection);
    }
    for mut connection in warm {
        connection.return_to_pool().await;
    }
    idle(pool).await;

    let origin = Instant::now();
    let mut controls = Vec::new();
    let mut samples = Vec::new();
    let mut previous = 0;
    for _ in 0..REPEATS {
        controls.push(uncontended(pool, origin, previous).await);
        for hold_ms in HOLDS_MS {
            samples.push(contended(&db, pool, origin, hold_ms, previous).await);
            previous += 1;
        }
    }
    let saved: i64 = sqlx::query_scalar(READ).fetch_one(pool).await.unwrap();
    assert_eq!(saved, previous);
    pool.close().await;

    let evidence = json!({
        "status": "DIAGNOSTIC", "scope": "controlled SQLite writer contention, no HTTP or Hardware",
        "clock": "std::time::Instant, nanoseconds from same process origin",
        "repeats_per_hold": REPEATS, "requested_holds_ms": HOLDS_MS,
        "pooled_connections_warmed": settings, "uncontended": controls, "contended": samples,
        "overshoot_definition": "challenger BEGIN return minus observed first commit return; actual unlock bracket uses first commit start and return",
    });
    let output = lane.join("writer-wait.json");
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output)
        .unwrap();
    serde_json::to_writer_pretty(&mut file, &evidence).unwrap();
    file.write_all(b"\n").unwrap();
    println!("SQLite writer contention diagnostic: {}", output.display());
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires a fresh owned CIRNET_STAGE4_SQLITE_WRITER_PROBE_DIR"]
async fn sqlite_writer_wait_splits_pool_and_begin() {
    time::timeout(Duration::from_secs(20), probe())
        .await
        .expect("SQLite writer diagnostic did not finish within its harness guard.");
}
