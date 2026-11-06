use crate::error::ApiError;
use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn operation_key(value: &str) -> Result<&str, ApiError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b':' | b'-'))
    {
        return Err(ApiError::new("INVALID_OPERATION_KEY", 422));
    }
    Ok(value)
}

pub fn request_fingerprint(value: &Value) -> Result<String, ApiError> {
    let mut wire = Vec::new();
    canonical_json(value, &mut wire)?;
    Ok(format!("{:x}", Sha256::digest(wire)))
}

fn canonical_json(value: &Value, wire: &mut Vec<u8>) -> Result<(), ApiError> {
    let invalid = || ApiError::new("INVALID_CONFIGURATION", 422);
    match value {
        Value::Object(map) => {
            let mut entries: Vec<_> = map.iter().collect();
            entries.sort_unstable_by(|left, right| left.0.cmp(right.0));
            wire.push(b'{');
            for (index, (key, value)) in entries.into_iter().enumerate() {
                if index != 0 {
                    wire.push(b',');
                }
                serde_json::to_writer(&mut *wire, key).map_err(|_| invalid())?;
                wire.push(b':');
                canonical_json(value, wire)?;
            }
            wire.push(b'}');
        }
        Value::Array(entries) => {
            wire.push(b'[');
            for (index, value) in entries.iter().enumerate() {
                if index != 0 {
                    wire.push(b',');
                }
                canonical_json(value, wire)?;
            }
            wire.push(b']');
        }
        Value::Number(number) => {
            let lexeme = number.as_str();
            if lexeme.contains(['.', 'e', 'E']) {
                let number = lexeme
                    .parse::<f64>()
                    .ok()
                    .filter(|value| value.is_finite())
                    .ok_or_else(invalid)?;
                // Normalize numbers as Python's JSON decoder and encoder do.
                let repr = format!("{number:?}");
                if let Some((mantissa, exponent)) = repr.split_once('e') {
                    let exponent = exponent.parse::<i32>().map_err(|_| invalid())?;
                    wire.extend_from_slice(format!("{mantissa}e{exponent:+03}").as_bytes());
                } else {
                    wire.extend_from_slice(repr.as_bytes());
                }
            } else {
                wire.extend_from_slice(if lexeme == "-0" {
                    b"0"
                } else {
                    lexeme.as_bytes()
                });
            }
        }
        _ => serde_json::to_writer(wire, value).map_err(|_| invalid())?,
    }
    Ok(())
}

use crate::db::runtime::OperationKey;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, Weak},
};
use tokio::sync::Mutex as AsyncMutex;

type OperationScope = (String, String, String, String);

#[derive(Default)]
pub(super) struct OperationGuards(Mutex<HashMap<OperationScope, Weak<AsyncMutex<()>>>>);

impl OperationGuards {
    pub(super) fn lock(&self, identity: OperationKey<'_>) -> Result<Arc<AsyncMutex<()>>, ApiError> {
        let mut locks = self.0.lock().map_err(|_| super::internal())?;
        locks.retain(|_, lock| lock.strong_count() > 0);
        let key = (
            identity.owner_id.into(),
            identity.kind.into(),
            identity.scope.into(),
            identity.key.into(),
        );
        if let Some(existing) = locks.get(&key).and_then(Weak::upgrade) {
            return Ok(existing);
        }
        let guard = Arc::new(AsyncMutex::new(()));
        locks.insert(key, Arc::downgrade(&guard));
        Ok(guard)
    }
}

#[cfg(test)]
#[path = "../../tests/experiment_operations.rs"]
mod tests;
