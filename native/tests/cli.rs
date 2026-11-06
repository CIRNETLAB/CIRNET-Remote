use std::{
    path::PathBuf,
    process::{Command, Output},
};
fn command(url: &str, args: &[&str]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_cirnet-remote"));
    for (key, _) in std::env::vars() {
        if key.starts_with("CIRNET_") || key.starts_with("NETCIRCUIT_") {
            command.env_remove(key);
        }
    }
    command
        .env("CIRNET_DATABASE_URL", url)
        .args(args)
        .output()
        .unwrap()
}
#[test]
#[ignore = "requires allocator-owned CIRNET_REMOTE_CLI_DIR"]
fn migrations_are_explicit_and_idempotent() {
    let root = PathBuf::from(std::env::var_os("CIRNET_REMOTE_CLI_DIR").unwrap());
    let db = root.join("cli.sqlite");
    assert!(!db.exists());
    let url = format!("sqlite:///{}", db.to_string_lossy().replace('\\', "/"));
    let implicit = command(&url, &["--listen", "127.0.0.1:0", "--exit-on-stdin-eof"]);
    assert!(!implicit.status.success());
    assert!(!db.exists());
    let first = command(&url, &["--migrate"]);
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    let report: serde_json::Value = serde_json::from_slice(&first.stdout).unwrap();
    assert_eq!(report["to"], "0007_auth_maintenance");
    assert_eq!(report["applied"], 7);
    assert!(db.is_file());
    let again = command(&url, &["--migrate"]);
    assert!(again.status.success());
    let report: serde_json::Value = serde_json::from_slice(&again.stdout).unwrap();
    assert_eq!(report["applied"], 0);
    assert_eq!(report["from"], "0007_auth_maintenance");
}

#[test]
#[ignore = "requires the pinned Contracts root, no database or Hardware service"]
fn openapi_export_matches_pinned_handoff_and_route_inventory() {
    use std::collections::BTreeSet;
    let root = PathBuf::from(std::env::var_os("CIRNET_CONTRACTS_ROOT").unwrap());
    let exported = Command::new(env!("CARGO_BIN_EXE_cirnet-remote"))
        .args(["--export-openapi"])
        .env("CIRNET_CONTRACTS_ROOT", &root)
        .output()
        .unwrap();
    assert!(
        exported.status.success(),
        "{}",
        String::from_utf8_lossy(&exported.stderr)
    );
    assert_eq!(
        exported.stdout,
        std::fs::read(root.join("contracts/api/openapi.json")).unwrap()
    );
    let document: serde_json::Value = serde_json::from_slice(&exported.stdout).unwrap();
    let operations: BTreeSet<_> = document["paths"]
        .as_object()
        .unwrap()
        .values()
        .flat_map(|path| path.as_object().unwrap().values())
        .filter_map(|operation| operation["operationId"].as_str())
        .collect();
    assert_eq!(operations.len(), 63);
    let registered = Command::new(env!("CARGO_BIN_EXE_cirnet-remote"))
        .arg("--route-inventory")
        .output()
        .unwrap();
    assert!(registered.status.success());
    let registered: Vec<String> = serde_json::from_slice(&registered.stdout).unwrap();
    assert_eq!(registered.len(), 63);
    assert_eq!(
        registered
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>(),
        operations
    );
}
