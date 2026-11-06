use std::path::PathBuf;

use super::{Db, Pool};

const ATTEMPT: &str = "UPDATE projects SET name = 'forbidden fixture write' WHERE project_id = $1";

#[tokio::test]
#[ignore = "requires closed Python-migrated SQLite fixtures in CIRNET_REMOTE_DB_FIXTURE_DIR"]
async fn sqlite_connection_rejects_durable_dml() {
    let directory = std::env::var_os("CIRNET_REMOTE_DB_FIXTURE_DIR").unwrap();
    let path = PathBuf::from(directory).join("legacy.sqlite");
    let bytes = std::fs::read(&path).unwrap();
    let url = format!("sqlite:///{}", path.to_string_lossy().replace('\\', "/"));
    let db = Db::open_readonly(&url).await.unwrap();
    let Pool::Sqlite(pool) = &db.pool else {
        panic!("expected SQLite");
    };
    let mut tx = pool.begin().await.unwrap();
    let write = sqlx::query(ATTEMPT)
        .bind("project-a")
        .execute(&mut *tx)
        .await;
    tx.rollback().await.unwrap();
    let error = write.expect_err("SQLite shadow connection permitted DML");
    let code = error
        .as_database_error()
        .and_then(|error| error.code())
        .and_then(|code| code.parse::<u32>().ok());
    assert_eq!(code.map(|code| code & 0xff), Some(8)); // SQLITE_READONLY
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}

#[tokio::test]
#[ignore = "requires a Python-migrated PostgreSQL fixture in CIRNET_REMOTE_DB_FIXTURE_POSTGRES"]
async fn postgres_connection_rejects_durable_dml() {
    let url = std::env::var("CIRNET_REMOTE_DB_FIXTURE_POSTGRES").unwrap();
    let db = Db::open_readonly(&url).await.unwrap();
    let Pool::Postgres(pool) = &db.pool else {
        panic!("expected PostgreSQL");
    };
    let mut tx = pool.begin().await.unwrap();
    let write = sqlx::query(ATTEMPT)
        .bind("project-a")
        .execute(&mut *tx)
        .await;
    tx.rollback().await.unwrap();
    let error = write.expect_err("PostgreSQL shadow connection permitted DML");
    let code = error.as_database_error().and_then(|error| error.code());
    assert_eq!(code.as_deref(), Some("25006")); // read_only_sql_transaction
}

#[path = "sqlite_writer_timing.rs"]
mod sqlite_writer_timing;

#[path = "sqlite_writer_gate_tests.rs"]
mod sqlite_writer_gate_tests;
