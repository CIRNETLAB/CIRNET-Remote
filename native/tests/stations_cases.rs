use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use axum::body::to_bytes;
use cirnet_contracts_native::validation::Registry;
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::Command,
    time::timeout,
};

use crate::{db::Db, hardware::HardwareClient};

use super::*;

#[tokio::test]
#[ignore = "requires canonical exact Python station fixtures and loopback Hardware RPC"]
async fn station_routes_match_pinned_python_and_keep_queue_private() {
    let fixture = PathBuf::from(env::var_os("CIRNET_STATION_FIXTURE_DIR").unwrap());
    assert!(fixture.is_absolute());
    let cases: Vec<Value> =
        serde_json::from_slice(&fs::read(fixture.join("oracle.json")).unwrap()).unwrap();
    let contracts = env::var("CIRNET_CONTRACTS_ROOT").unwrap();
    let registry = Arc::new(Registry::load(Path::new(&contracts)).unwrap());
    let mut hardware = Command::new(env::var_os("CIRNET_NATIVE_STAGE3_PYTHON").unwrap())
        .args(["-I", "-B"])
        .arg(fixture.join("stations_fixture.py"))
        .arg("serve")
        .current_dir(&fixture)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut readiness = BufReader::new(hardware.stdout.take().unwrap()).lines();
    let readiness = timeout(Duration::from_secs(10), readiness.next_line())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let targets: Value = serde_json::from_str(&readiness).unwrap();
    let mut failures = Vec::new();
    let mut observations = 0;
    for entry in &cases {
        let scenario = entry["scenario"].as_str().unwrap();
        let database = fixture.join(entry["database"].as_str().unwrap());
        assert!(database.starts_with(&fixture));
        let database_url = "sqlite:///".to_owned() + &database.to_str().unwrap().replace('\\', "/");
        let db = Db::open_readonly(&database_url).await.unwrap();
        let target = if scenario == "r2" {
            env::var("CIRNET_EXACT_STATION_HARDWARE").unwrap()
        } else {
            targets[if scenario == "busy" {
                "ready"
            } else {
                scenario
            }]
            .as_str()
            .unwrap()
            .to_owned()
        };
        let service =
            StationService::new(registry.clone(), HardwareClient::new(&target).unwrap(), db)
                .unwrap();
        let order: Vec<String> = serde_json::from_value(entry["queue"].clone()).unwrap();
        for case in entry["cases"].as_array().unwrap() {
            let path = case["path"].as_str().unwrap();
            let owner = case["owner"].as_str().unwrap();
            let owner_expectation = case["body"].get("own_positions");
            let called = AtomicBool::new(false);
            let sampled = &called;
            let ordered = &order;
            let get_queue = |station: String| async move {
                assert!(!sampled.swap(true, Ordering::SeqCst));
                if station == "virtual-station-01" {
                    Ok(ordered.clone())
                } else {
                    assert_eq!(station, "physical-station-01");
                    Ok(Vec::new())
                }
            };
            let actual = match dispatch(&Method::GET, path, &service, owner, get_queue).await {
                Some(Ok(response)) => {
                    let status = response.status().as_u16();
                    let bytes = to_bytes(response.into_body(), 2_000_000).await.unwrap();
                    let body: Value = serde_json::from_slice(&bytes).unwrap();
                    json!({"status": status, "body": body})
                }
                Some(Err(error)) => {
                    let mut error_body = json!({"code": error.code});
                    if !error.issues.is_empty() {
                        error_body["issues"] = json!(error.issues);
                    }
                    json!({"status": error.status, "body": error_body})
                }
                None => Value::Null,
            };
            let mut body = case["body"].clone();
            if case["status"] != 200 {
                body.as_object_mut().unwrap().remove("message");
                body.as_object_mut().unwrap().remove("request_id");
            }
            let expected = json!({"status": case["status"], "body": body});
            if actual != expected {
                failures.push(format!(
                    "{scenario} {path} actual={actual} expected={expected}"
                ));
            }
            if called.load(Ordering::SeqCst) != owner_expectation.is_some() {
                failures.push(format!(
                    "{scenario} {path} invalid queue sampling order or count"
                ));
            }
            observations += 1;
        }
    }
    drop(hardware.stdin.take());
    assert!(
        timeout(Duration::from_secs(10), hardware.wait())
            .await
            .unwrap()
            .unwrap()
            .success()
    );
    assert!(observations >= 32);
    assert!(
        failures.is_empty(),
        "{} station observations differed:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
