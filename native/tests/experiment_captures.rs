use super::*;
use cirnet_contracts_native::capture::encode_digital;

fn fixture(name: &str, max_bytes: usize, max_files: usize) -> (CaptureStore, Registry, PathBuf) {
    let owned = PathBuf::from(std::env::var_os("CIRNET_ARTIFACTS_SESSION").unwrap())
        .canonicalize()
        .unwrap();
    let root = PathBuf::from(std::env::var_os("CIRNET_REMOTE_CAPTURE_TEST_DIR").unwrap())
        .canonicalize()
        .unwrap();
    assert!(root.starts_with(owned));
    let directory = root.join(format!("{name}-{}", Uuid::new_v4().simple()));
    let registry = Registry::load(Path::new(
        &std::env::var_os("CIRNET_CONTRACTS_ROOT").unwrap(),
    ))
    .unwrap();
    (
        CaptureStore::with_limits(&directory, max_bytes, max_files).unwrap(),
        registry,
        directory,
    )
}

fn binary() -> Vec<u8> {
    encode_digital(
        &json!([
            {"signal":"Y","time_ns":0,"value":"X"},
            {"signal":"A","time_ns":1,"value":0},
            {"signal":"Y","time_ns":2,"value":1},
        ]),
        &json!(3),
    )
    .unwrap()
}

#[test]
#[ignore = "requires a canonical owned capture-test directory and pinned Contracts"]
fn persists_exact_worker_ncap_and_rejects_tampered_payload() {
    let (store, registry, directory) = fixture("exact", DEFAULT_BYTES, DEFAULT_FILES);
    let payload = binary();
    let result = json!({"available":true,"duration_ns":3,"sample_count":3});
    let metadata = store
        .seal(&registry, "simulation", &result, &payload)
        .unwrap();
    let id = metadata["capture_id"].as_str().unwrap();
    assert_eq!(
        metadata["payload_ref"],
        format!("/api/captures/{id}/payload")
    );
    assert_eq!(metadata["signals"], json!(["A", "Y"]));
    assert_eq!(metadata["channel_count"], 2);
    assert_eq!(metadata["payload_byte_count"], payload.len());
    assert_eq!(
        metadata["sha256"],
        format!("{:x}", Sha256::digest(&payload))
    );
    let path = directory.join(format!("{id}.ncap"));
    assert_eq!(std::fs::read(&path).unwrap(), payload);
    assert_eq!(store.read(&metadata).unwrap(), payload);
    store.put(id, &payload).unwrap();
    let mut corrupt = payload.clone();
    *corrupt.last_mut().unwrap() ^= 1;
    assert_eq!(
        store.put(id, &corrupt).unwrap_err().code,
        "CAPTURE_KEY_CONFLICT"
    );
    std::fs::write(&path, &corrupt).unwrap();
    assert_eq!(store.read(&metadata).unwrap_err().code, "CAPTURE_CORRUPT");
    assert!(store.remove(id).unwrap());
    assert!(!store.remove(id).unwrap());
    assert_eq!(
        store.read(&metadata).unwrap_err().code,
        "CAPTURE_UNAVAILABLE"
    );
    assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 0);
}

#[test]
#[ignore = "requires a canonical owned capture-test directory and pinned Contracts"]
fn enforces_quota_identity_and_unavailable_capture_without_writes() {
    let payload = binary();
    let (store, registry, directory) = fixture("quota", payload.len(), 1);
    let result = json!({"available":false,"code":"NOT_IMPLEMENTED"});
    let metadata = store.seal(&registry, "simulation", &result, &[]).unwrap();
    assert_eq!(metadata["available"], false);
    assert_eq!(metadata["payload_byte_count"], 0);
    assert_eq!(metadata["payload_ref"], Value::Null);
    assert!(!directory.exists());
    assert_eq!(
        store.read(&metadata).unwrap_err().code,
        "CAPTURE_UNAVAILABLE"
    );
    assert_eq!(
        store.put("../outside", &payload).unwrap_err().code,
        "INVALID_CAPTURE_KEY"
    );
    assert_eq!(
        store
            .seal(
                &registry,
                "simulation",
                &json!({"available":true,"duration_ns":3,"sample_count":2}),
                &payload
            )
            .unwrap_err()
            .code,
        "INVALID_CAPTURE"
    );
    let first = "a".repeat(32);
    let second = "b".repeat(32);
    store.put(&first, &payload).unwrap();
    assert_eq!(
        store.put(&second, &payload).unwrap_err().code,
        "CAPTURE_QUOTA_EXCEEDED"
    );
    assert_eq!(std::fs::read_dir(&directory).unwrap().count(), 1);
}
