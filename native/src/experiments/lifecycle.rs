use crate::error::ApiError;
use serde_json::{Value, json};
use std::collections::HashSet;

pub(super) fn safe_stop_ack(mode: &str, result: &Value) -> bool {
    result["accepted"].as_bool() == Some(true)
        && match mode {
            "simulation" => true,
            "hardware" => result["hardware_applied"].as_bool() == Some(true),
            _ => false,
        }
}

pub(super) fn vacant_slot(
    capacity: usize,
    leases: impl IntoIterator<Item = (i64, bool)>,
) -> Option<i64> {
    let mut occupied = HashSet::new();
    for (slot, quarantined) in leases {
        if quarantined {
            return None;
        }
        occupied.insert(slot);
    }
    if occupied.len() >= capacity {
        return None;
    }
    (0..i64::try_from(capacity).ok()?).find(|slot| !occupied.contains(slot))
}

pub(super) fn transition(current: &Value, state: &str, updates: Value) -> Result<Value, ApiError> {
    let invalid = || ApiError::new("INTERNAL_ERROR", 500);
    let mut value = current.as_object().cloned().ok_or_else(invalid)?;
    let changes = updates.as_object().ok_or_else(invalid)?;
    let revision = match current.get("revision") {
        Some(value) => value
            .as_i64()
            .filter(|value| (0..9_007_199_254_740_991).contains(value))
            .ok_or_else(invalid)?,
        None => 0,
    };
    let previous = current["state"].as_str().ok_or_else(invalid)?;
    if previous != state {
        let history = value
            .get_mut("state_history")
            .and_then(Value::as_array_mut)
            .ok_or_else(invalid)?;
        history.push(json!(state));
    }
    value.extend(changes.clone());
    value.insert("state".into(), json!(state));
    value.insert("revision".into(), json!(revision + 1));
    Ok(Value::Object(value))
}

#[cfg(test)]
#[path = "../../tests/experiment_lifecycle.rs"]
mod tests;
