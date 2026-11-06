use std::env;
use std::future::{Future, poll_fn};
use std::path::PathBuf;
use std::pin::pin;
use std::task::Poll;
use std::time::Duration;

use sqlx::SqlitePool;
use tokio::{sync::oneshot, task::JoinHandle, time};

use super::super::{
    Db, Pool, WriteDb, WriteTx, migrations,
    write::{tx_execute, tx_query},
};

const READ: &str = "SELECT value FROM writer_gate_probe WHERE id = 1";

async fn fixture(filename: &str) -> (String, WriteDb) {
    let owned = PathBuf::from(env::var_os("CIRNET_ARTIFACTS_SESSION").unwrap())
        .canonicalize()
        .unwrap();
    let lane = PathBuf::from(env::var_os("CIRNET_STAGE4_SQLITE_WRITER_GATE_DIR").unwrap());
    assert!(lane.is_absolute());
    let canonical = lane.canonicalize().unwrap();
    assert!(canonical != owned && canonical.starts_with(owned));
    let path = lane.join(filename);
    assert!(
        !path.exists(),
        "Select a fresh owned SQLite fixture directory."
    );
    let url = format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"));
    migrations::migrate(&url).await.unwrap();
    let db = WriteDb::open_existing(&url).await.unwrap();
    let mut tx = db.begin().await.unwrap();
    tx_execute!(
        tx,
        "CREATE TABLE writer_gate_probe (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)"
    )
    .unwrap();
    tx_execute!(
        tx,
        "INSERT INTO writer_gate_probe (id, value) VALUES (1, 0)"
    )
    .unwrap();
    tx.commit().await.unwrap();
    (url, db)
}

fn sqlite_pool(db: &Db) -> &SqlitePool {
    let Pool::Sqlite(pool) = &db.pool else {
        panic!("Expected SQLite");
    };
    pool
}

async fn update(tx: &mut WriteTx, value: i64) {
    assert_eq!(
        tx_execute!(
            tx,
            "UPDATE writer_gate_probe SET value = $1 WHERE id = 1",
            value,
        )
        .unwrap(),
        1
    );
}

async fn read_transaction(tx: &mut WriteTx) -> i64 {
    tx_query!(tx, query_scalar, fetch_one, READ).unwrap()
}

async fn queued_begin(db: &WriteDb) -> JoinHandle<WriteTx> {
    let db = db.clone();
    let (polled, pending) = oneshot::channel();
    let waiter = tokio::spawn(async move {
        let mut begin = pin!(db.begin());
        assert!(poll_fn(|context| Poll::Ready(begin.as_mut().poll(context).is_pending())).await);
        polled.send(()).unwrap();
        begin.await.unwrap()
    });
    pending.await.unwrap();
    waiter
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires a fresh owned CIRNET_STAGE4_SQLITE_WRITER_GATE_DIR"]
async fn sqlite_queued_writers_leave_pooled_read_capacity() {
    time::timeout(Duration::from_secs(15), async {
        let (_, db) = fixture("read-starvation.sqlite").await;
        let reads = db.reads();
        let pool = sqlite_pool(&reads);
        let capacity = pool.options().get_max_connections() as usize;
        assert_eq!(capacity, 10);
        let mut warm = Vec::new();
        for _ in 0..capacity {
            warm.push(pool.acquire().await.unwrap());
        }
        for mut connection in warm {
            connection.return_to_pool().await;
        }
        assert_eq!(pool.num_idle(), capacity);
        let mut held = db.begin().await.unwrap();
        update(&mut held, 1).await;
        let mut writers = Vec::new();
        for _ in 1..capacity {
            writers.push(queued_begin(&db).await);
        }
        let idle_before_read = pool.num_idle();
        let visible = time::timeout(
            Duration::from_secs(1),
            sqlx::query_scalar::<_, i64>(READ).fetch_one(pool),
        )
        .await
        .expect("Queued clone writers exhausted the read pool.")
        .unwrap();
        assert_eq!(idle_before_read, capacity - 1);
        assert_eq!(visible, 0);
        held.rollback().await.unwrap();
        // Earlier waiters must obtain and return the writer before later ones.
        for writer in writers {
            writer.await.unwrap().rollback().await.unwrap();
        }
        pool.close().await;
    })
    .await
    .expect("SQLite writer/read test did not complete.");
}

#[tokio::test(flavor = "current_thread")]
#[ignore = "requires a fresh owned CIRNET_STAGE4_SQLITE_WRITER_GATE_DIR"]
async fn sqlite_cancelled_waiter_and_dropped_writer_leave_no_transaction() {
    time::timeout(Duration::from_secs(15), async {
        let (url, db) = fixture("cancelled-writer.sqlite").await;
        let mut held = db.begin().await.unwrap();
        update(&mut held, 1).await;
        let cancelled = queued_begin(&db).await;
        let survivor = queued_begin(&db).await;
        cancelled.abort();
        assert!(matches!(cancelled.await, Err(error) if error.is_cancelled()));
        assert!(!survivor.is_finished());
        drop(held);
        let mut committed = survivor.await.unwrap();
        assert_eq!(read_transaction(&mut committed).await, 0);
        update(&mut committed, 2).await;
        committed.commit().await.unwrap();

        let independent = WriteDb::open_existing(&url).await.unwrap();
        let mut held = db.begin().await.unwrap();
        update(&mut held, 3).await;
        let mut other = queued_begin(&independent).await;
        assert!(
            time::timeout(Duration::from_millis(25), &mut other)
                .await
                .is_err(),
            "Independent pool bypassed SQLite's writer lock."
        );
        held.rollback().await.unwrap();
        let mut other = other.await.unwrap();
        assert_eq!(read_transaction(&mut other).await, 2);
        other.rollback().await.unwrap();
        sqlite_pool(&db.reads()).close().await;
        sqlite_pool(&independent.reads()).close().await;
    })
    .await
    .expect("SQLite canceled-writer test did not complete.");
}
