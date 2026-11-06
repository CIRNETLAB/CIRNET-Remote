use crate::error::ApiError;
use cirnet_contracts_native::{capture::decode_digital, validation::Registry};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashMap},
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, Weak},
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

const DEFAULT_BYTES: usize = 268_435_456;
const DEFAULT_FILES: usize = 4_096;
// Pinned NCAP1 layout: prefix + maximum header + maximum digital event body.
const MAX_PAYLOAD: usize = 9 + 65_536 + 100_000 * 11;

type DirectoryLocks = Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>;

#[derive(Clone)]
pub struct CaptureStore {
    directory: PathBuf,
    lock: Arc<Mutex<()>>,
    max_bytes: usize,
    max_files: usize,
}

impl CaptureStore {
    pub fn new(directory: &Path) -> Result<Self, ApiError> {
        Self::with_limits(directory, DEFAULT_BYTES, DEFAULT_FILES)
    }

    pub(super) fn with_limits(
        directory: &Path,
        max_bytes: usize,
        max_files: usize,
    ) -> Result<Self, ApiError> {
        if max_bytes == 0 || max_files == 0 {
            return Err(ApiError::new("INVALID_CAPTURE_LIMIT", 422));
        }
        let directory = if directory.as_os_str().is_empty() {
            Path::new(".")
        } else {
            directory
        };
        let absolute = std::path::absolute(directory).map_err(storage_error)?;
        let directory = absolute.canonicalize().unwrap_or(absolute);
        static LOCKS: OnceLock<DirectoryLocks> = OnceLock::new();
        let mut directories = LOCKS
            .get_or_init(DirectoryLocks::default)
            .lock()
            .map_err(|_| ApiError::new("CAPTURE_STORAGE_UNAVAILABLE", 503))?;
        directories.retain(|_, lock| lock.strong_count() > 0);
        let lock = directories
            .get(&directory)
            .and_then(Weak::upgrade)
            .unwrap_or_else(|| {
                let lock = Arc::new(Mutex::new(()));
                directories.insert(directory.clone(), Arc::downgrade(&lock));
                lock
            });
        Ok(Self {
            directory,
            lock,
            max_bytes,
            max_files,
        })
    }

    /// Seal the worker's canonical NCAP1 bytes with the existing public metadata shape.
    /// Call from a blocking lane. An unavailable capture has metadata only.
    pub fn seal(
        &self,
        registry: &Registry,
        mode: &str,
        result: &Value,
        payload: &[u8],
    ) -> Result<Value, ApiError> {
        let invalid = || ApiError::new("INVALID_CAPTURE", 422);
        let available = result["available"].as_bool().ok_or_else(invalid)?;
        let number = |name: &str| match result.get(name) {
            Some(value) => value.as_u64().ok_or_else(invalid),
            None if !available => Ok(0),
            None => Err(invalid()),
        };
        let duration = number("duration_ns")?;
        let count = number("sample_count")?;
        if payload.len() > MAX_PAYLOAD {
            return Err(ApiError::new("CAPTURE_PAYLOAD_LIMIT", 422));
        }
        let signals = if available {
            let observed = decode_digital(payload).map_err(|_| invalid())?;
            let (observed_count, signals) = signals(&observed).ok_or_else(invalid)?;
            if observed["duration_ns"].as_u64() != Some(duration) || observed_count as u64 != count
            {
                return Err(invalid());
            }
            signals.into_iter().map(str::to_owned).collect::<Vec<_>>()
        } else {
            if !payload.is_empty() || count != 0 {
                return Err(invalid());
            }
            Vec::new()
        };

        let id = Uuid::new_v4().simple().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(storage_error)?
            .as_nanos()
            .to_string();
        let metadata = json!({
            "schema_version":"1.0", "capture_id":id, "source":mode,
            "instrument":"logic_analyzer", "encoding":"digital_events",
            "available":available, "duration_ns":duration, "sample_count":count,
            "channel_count":signals.len(), "signals":signals, "timestamp_ns":timestamp,
            "payload_ref":available.then(|| format!("/api/captures/{id}/payload")),
            "payload_byte_count":payload.len(),
            "sha256":available.then(|| format!("{:x}", Sha256::digest(payload))),
        });
        let metadata = registry
            .validate("CaptureMetadata", "transport", &metadata)
            .map_err(|_| invalid())?;
        if available {
            self.put(&id, payload)?;
        }
        Ok(metadata)
    }

    pub fn read(&self, metadata: &Value) -> Result<Vec<u8>, ApiError> {
        let unavailable = || ApiError::new("CAPTURE_UNAVAILABLE", 422);
        let corrupt = || ApiError::new("CAPTURE_CORRUPT", 422);
        let id = metadata["capture_id"].as_str().ok_or_else(corrupt)?;
        let path = self.path(id)?;
        if metadata["available"] != true {
            return Err(unavailable());
        }
        match fs::symlink_metadata(&path) {
            Ok(entry) if entry.is_file() => {}
            Ok(_) => return Err(corrupt()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Err(unavailable()),
            Err(error) => return Err(storage_error(error)),
        }
        let bytes = read_bounded(&path).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                unavailable()
            } else {
                storage_error(error)
            }
        })?;
        if bytes.len() > MAX_PAYLOAD
            || metadata["payload_byte_count"].as_u64() != Some(bytes.len() as u64)
            || metadata["sha256"].as_str() != Some(&format!("{:x}", Sha256::digest(&bytes)))
        {
            return Err(corrupt());
        }
        let observed = decode_digital(&bytes).map_err(|_| corrupt())?;
        let (count, signals) = signals(&observed).ok_or_else(corrupt)?;
        if metadata["sample_count"].as_u64() != Some(count as u64)
            || metadata["duration_ns"].as_u64() != observed["duration_ns"].as_u64()
            || metadata["channel_count"].as_u64() != Some(signals.len() as u64)
            || metadata
                .get("signals")
                .is_some_and(|value| value != &json!(signals))
        {
            return Err(corrupt());
        }
        Ok(bytes)
    }

    pub fn remove(&self, id: &str) -> Result<bool, ApiError> {
        let path = self.path(id)?;
        let _guard = self.lock.lock().map_err(storage_error)?;
        match fs::remove_file(path) {
            Ok(()) => Ok(true),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(storage_error(error)),
        }
    }

    fn path(&self, id: &str) -> Result<PathBuf, ApiError> {
        if id.len() != 32
            || !id
                .bytes()
                .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        {
            return Err(ApiError::new("INVALID_CAPTURE_KEY", 422));
        }
        Ok(self.directory.join(format!("{id}.ncap")))
    }

    fn put(&self, id: &str, payload: &[u8]) -> Result<(), ApiError> {
        let path = self.path(id)?;
        if payload.len() > MAX_PAYLOAD {
            return Err(ApiError::new("CAPTURE_PAYLOAD_LIMIT", 422));
        }
        let _guard = self.lock.lock().map_err(storage_error)?;
        fs::create_dir_all(&self.directory).map_err(storage_error)?;
        let conflict = || ApiError::new("CAPTURE_KEY_CONFLICT", 422);
        match fs::symlink_metadata(&path) {
            Ok(entry) if entry.is_file() && entry.len() == payload.len() as u64 => {
                return if read_bounded(&path).map_err(storage_error)? == payload {
                    Ok(())
                } else {
                    Err(conflict())
                };
            }
            Ok(_) => return Err(conflict()),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(storage_error(error)),
        }

        let quota = || ApiError::new("CAPTURE_QUOTA_EXCEEDED", 422);
        let mut bytes = payload.len() as u64;
        let mut files = 1;
        for entry in fs::read_dir(&self.directory).map_err(storage_error)? {
            let entry = entry.map_err(storage_error)?;
            if entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("ncap"))
            {
                match entry.metadata() {
                    Ok(metadata) => bytes = bytes.saturating_add(metadata.len()),
                    Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
                    Err(error) => return Err(storage_error(error)),
                }
                files += 1;
                if files > self.max_files || bytes > self.max_bytes as u64 {
                    return Err(quota());
                }
            }
        }
        if bytes > self.max_bytes as u64 {
            return Err(quota());
        }

        let temporary = self
            .directory
            .join(format!(".capture-{}", Uuid::new_v4().simple()));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(storage_error)?;
        let result = (|| {
            file.write_all(payload).map_err(storage_error)?;
            file.sync_all().map_err(storage_error)?;
            drop(file);
            // Publish without replacing an existing identity, even if another
            // process creates that destination after our quota scan.
            match fs::hard_link(&temporary, &path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                    let entry = fs::symlink_metadata(&path).map_err(storage_error)?;
                    if entry.is_file()
                        && entry.len() == payload.len() as u64
                        && read_bounded(&path).map_err(storage_error)? == payload
                    {
                        Ok(())
                    } else {
                        Err(conflict())
                    }
                }
                Err(error) => Err(storage_error(error)),
            }
        })();
        let cleanup = fs::remove_file(temporary).map_err(storage_error);
        result.and(cleanup)
    }
}

fn read_bounded(path: &Path) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?
        .take(MAX_PAYLOAD as u64 + 1)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn signals(capture: &Value) -> Option<(usize, BTreeSet<&str>)> {
    let samples = capture["samples"].as_array()?;
    let signals = samples
        .iter()
        .map(|sample| sample["signal"].as_str())
        .collect::<Option<_>>()?;
    Some((samples.len(), signals))
}

fn storage_error(_: impl std::fmt::Display) -> ApiError {
    ApiError::new("CAPTURE_STORAGE_UNAVAILABLE", 503)
}

#[cfg(test)]
#[path = "../../tests/experiment_captures.rs"]
mod tests;
