use super::{array, text, validate};
use crate::{
    error::ApiError,
    numeric::{bounded_integer, integral_float},
};
use cirnet_contracts_native::validation::Registry;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub fn decide(
    registry: &Registry,
    safety: &Value,
    executable: bool,
    unknown: bool,
) -> Result<Value, ApiError> {
    let safety = validate(registry, "SafetyVerificationResult", safety)?;
    let (decision, reasons) = if safety["status"] != "SAFE" {
        ("BLOCK_SAFETY", json!([safety["status"]]))
    } else if !executable {
        (
            "BLOCK_UNEXECUTABLE",
            json!(["Required infrastructure unavailable"]),
        )
    } else if unknown {
        ("RUN_GUARDED", json!(["Unknown component identity"]))
    } else {
        ("RUN_NORMAL", json!([]))
    };
    Ok(json!({"schema_version":"1.0","decision":decision,"reasons":reasons}))
}
pub fn assess(
    assignment: Option<&Value>,
    topology: Option<&Value>,
    function: Option<&Value>,
) -> Result<Value, ApiError> {
    let empty = json!({});
    let assignment = assignment.unwrap_or(&empty);
    let topology = topology.unwrap_or(&empty);
    let function = function.unwrap_or(&empty);
    let policy = assignment
        .get("assessment_policy")
        .and_then(Value::as_str)
        .unwrap_or("FUNCTIONAL_ONLY");
    if ![
        "STRICT_TOPOLOGY",
        "FUNCTIONAL_ONLY",
        "TOPOLOGY_AND_FUNCTION",
    ]
    .contains(&policy)
    {
        return Err(ApiError::new("INVALID_ASSESSMENT_POLICY", 422));
    }
    let topo = topology
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("UNKNOWN");
    let func = function
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("NOT_EVALUATED");
    let use_topo = policy != "FUNCTIONAL_ONLY";
    let use_function = policy != "STRICT_TOPOLOGY";
    let topology_evaluated = use_topo && matches!(topo, "MATCH" | "MISMATCH");
    let function_evaluated = use_function && func != "NOT_EVALUATED";
    let mut issues = Vec::new();
    if use_topo {
        issues.extend_from_slice(array(&topology["issues"]));
        if !topology_evaluated {
            issues.push(json!("Topology evidence is unknown or ambiguous"));
        }
    }
    if use_function {
        issues.extend_from_slice(array(&function["issues"]));
        if !function_evaluated {
            issues.push(json!("Functional behavior has not been evaluated"));
        }
    }
    let status = match policy {
        "STRICT_TOPOLOGY" => match topo {
            "MATCH" => "PASS",
            "MISMATCH" => "FAIL",
            _ => "NOT_EVALUATED",
        },
        "FUNCTIONAL_ONLY" => func,
        _ => {
            if topo == "MISMATCH" || func == "FAIL" {
                "FAIL"
            } else if topo == "MATCH" && func == "PASS" {
                "PASS"
            } else if matches!(func, "NO_RESPONSE" | "PARTIAL") {
                func
            } else {
                "NOT_EVALUATED"
            }
        }
    };
    let mut seen = BTreeSet::new();
    issues.retain(|v| seen.insert(v.as_str().unwrap_or("").to_owned()));
    Ok(
        json!({"schema_version":"1.0","policy":policy,"status":status,"topology_evaluated":topology_evaluated,
  "function_evaluated":function_evaluated,"issues":issues}),
    )
}
#[derive(Clone, Copy)]
enum Timestamp {
    Integer(i128),
    Float(f64),
}
impl Timestamp {
    fn order(self) -> i128 {
        match self {
            Self::Integer(value) => value,
            Self::Float(value) => value as i128,
        }
    }
    fn minus_one(self) -> Self {
        match self {
            Self::Integer(value) => Self::Integer(value - 1),
            Self::Float(value) => Self::Float(value - 1.0),
        }
    }
    fn json(self) -> Value {
        match self {
            Self::Integer(value) => json!(value),
            Self::Float(value) => json!(value),
        }
    }
}
fn nanos(value: &Value) -> Result<Timestamp, ApiError> {
    if let Some(value) = value.as_i64() {
        return Ok(Timestamp::Integer(i128::from(value)));
    }
    if let Some(value) = value.as_u64() {
        return Ok(Timestamp::Integer(i128::from(value)));
    }
    if let Some(value) = integral_float(value)
        .filter(|value| *value >= i128::MIN as f64 && *value < i128::MAX as f64)
    {
        return Ok(Timestamp::Float(value));
    }
    Err(ApiError::new("INVALID_CONFIGURATION", 422))
}
fn same_logic(left: &Value, right: &Value) -> bool {
    left == right
        || bounded_integer(left, 0, 1)
            .is_some_and(|value| bounded_integer(right, 0, 1) == Some(value))
}
pub fn verify_functional(
    registry: &Registry,
    assignment: Option<&Value>,
    capture: Option<&Value>,
    vectors: Option<&Value>,
) -> Result<Value, ApiError> {
    let empty = json!({});
    let assignment = assignment.unwrap_or(&empty);
    let capture = capture.unwrap_or(&empty);
    let samples = if capture["available"] == true {
        array(&capture["samples"])
    } else {
        &[]
    };
    let behavior = &assignment["expected_behavior"];
    let rows = array(&behavior["truth_table"]);
    let mut checkpoints: Vec<(Value, Option<usize>)> = array(&behavior["expected_signals"])
        .iter()
        .map(|v| (v.clone(), None))
        .collect();
    let duration = if let Some(duration) = capture.get("duration_ns") {
        nanos(duration)?
    } else {
        let mut maximum: Option<Timestamp> = None;
        for sample in samples {
            let timestamp = nanos(&sample["time_ns"])?;
            if maximum.is_none_or(|previous| timestamp.order() > previous.order()) {
                maximum = Some(timestamp);
            }
        }
        maximum.unwrap_or(Timestamp::Integer(0))
    };
    let mut ordered = Vec::new();
    for vector in array(vectors.unwrap_or(&empty)) {
        ordered.push((nanos(&vector["time_ns"])?, vector));
    }
    ordered.sort_by_key(|(time, _)| time.order());
    let mut episodes: Vec<(Timestamp, Map<String, Value>)> = Vec::new();
    let mut state = Map::new();
    for (time, vector) in ordered {
        if let Some(inputs) = vector["inputs"].as_object() {
            for (key, value) in inputs {
                state.insert(key.clone(), value.clone());
            }
        }
        if episodes
            .last()
            .is_some_and(|(at, _)| at.order() == time.order())
        {
            episodes.pop();
        }
        episodes.push((time, state.clone()));
    }
    let mut cases = Vec::new();
    let mut unexercised = Vec::new();
    for (index, row) in rows.iter().enumerate() {
        let inputs = row["inputs"]
            .as_object()
            .ok_or_else(|| ApiError::new("INVALID_CONFIGURATION", 422))?;
        let found = episodes.iter().position(|(_, values)| {
            inputs.iter().all(|(key, value)| {
                values
                    .get(key)
                    .is_some_and(|actual| same_logic(actual, value))
            })
        });
        let Some(episode) = found else {
            unexercised.push(index);
            continue;
        };
        let (start, values) = &episodes[episode];
        let timestamp = episodes.get(episode + 1).map_or(duration, |(next, _)| {
            let end = next.minus_one();
            // Python's min retains its first argument on ties, including token shape.
            if end.order() <= duration.order() {
                end
            } else {
                duration
            }
        });
        if timestamp.order() < start.order() {
            unexercised.push(index);
            continue;
        }
        let timestamp = timestamp.json();
        let inputs: Map<_, _> = inputs
            .keys()
            .map(|key| (key.clone(), values[key].clone()))
            .collect();
        cases.push(json!({"case_index":index,"inputs":inputs,"outputs":{},"time_ns":timestamp,"status":"NO_RESPONSE"}));
        for (signal, value) in row["outputs"]
            .as_object()
            .ok_or_else(|| ApiError::new("INVALID_CONFIGURATION", 422))?
        {
            checkpoints.push((
                json!({"signal":signal,"time_ns":timestamp,"value":value}),
                Some(index),
            ));
        }
    }
    let mut details = json!({"expected_signals":checkpoints.iter().map(|(v,_)|v).collect::<Vec<_>>(),
  "observed_signals":[],"mismatched_signals":[]});
    let mut grouped: BTreeMap<String, Vec<(Timestamp, Value)>> = BTreeMap::new();
    for sample in samples {
        grouped
            .entry(text(sample, "signal").into())
            .or_default()
            .push((nanos(&sample["time_ns"])?, sample["value"].clone()));
    }
    for values in grouped.values_mut() {
        values.sort_by_key(|(at, _)| at.order());
    }
    let (mut matched, mut observed_count) = (0, 0);
    let mut observed_signals = Vec::new();
    let mut mismatches = Vec::new();
    for (signal, case_index) in &checkpoints {
        let timestamp = nanos(&signal["time_ns"])?;
        let observed = if timestamp.order() > duration.order() {
            None
        } else {
            grouped.get(text(signal, "signal")).and_then(|values| {
                let index = values.partition_point(|(at, _)| at.order() <= timestamp.order());
                index.checked_sub(1).map(|i| values[i].1.clone())
            })
        };
        if let Some(value) = &observed {
            observed_count += 1;
            let mut entry = signal.clone();
            entry["value"] = value.clone();
            observed_signals.push(entry);
        }
        if observed
            .as_ref()
            .is_some_and(|value| same_logic(value, &signal["value"]))
        {
            matched += 1;
        } else {
            let mut mismatch = json!({"signal":signal["signal"],"time_ns":signal["time_ns"],"expected":signal["value"],"observed":observed});
            if let Some(index) = case_index {
                mismatch["case_index"] = json!(index);
            }
            mismatches.push(mismatch);
        }
        if let Some(index) = case_index
            && let Some(case) = cases
                .iter_mut()
                .find(|case| case["case_index"].as_u64() == Some(*index as u64))
        {
            case["outputs"][text(signal, "signal")] = observed.unwrap_or(Value::Null);
        }
    }
    for case in &mut cases {
        let index = case["case_index"].as_u64().unwrap() as usize;
        let expected = rows[index]["outputs"].as_object().unwrap();
        let mismatch = expected.iter().any(|(key, value)| {
            !case["outputs"][key].is_null() && !same_logic(&case["outputs"][key], value)
        });
        let missing = expected.keys().any(|key| case["outputs"][key].is_null());
        case["status"] = json!(if mismatch {
            "FAIL"
        } else if missing {
            "NO_RESPONSE"
        } else {
            "PASS"
        });
    }
    let mut issues = Vec::new();
    if !unexercised.is_empty() {
        issues.push(format!(
            "Truth table cases not exercised within the capture window: {}",
            unexercised
                .iter()
                .map(usize::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    let status = if checkpoints.is_empty() {
        issues.push("No expected signal checkpoints could be evaluated".into());
        "NOT_EVALUATED"
    } else if observed_count == 0 {
        issues.push("No requested signal response was captured".into());
        "NO_RESPONSE"
    } else if matched == checkpoints.len() && unexercised.is_empty() {
        "PASS"
    } else {
        if !mismatches.is_empty() {
            issues.push("Observed signals differ from expected behavior".into());
        }
        if matched > 0 { "PARTIAL" } else { "FAIL" }
    };
    details["schema_version"] = json!("1.0");
    details["status"] = json!(status);
    details["issues"] = json!(issues);
    details["observed_signals"] = json!(observed_signals);
    details["mismatched_signals"] = json!(mismatches);
    if !rows.is_empty() {
        details["expected_truth_table"] = json!(rows);
        details["observed_truth_table"] = json!(cases);
    }
    validate(registry, "FunctionalVerificationResult", &details)
}
