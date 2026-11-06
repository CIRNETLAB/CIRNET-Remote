use super::{
    array,
    routing::{NodeOptions, allocate_routes},
    text, validate,
    wire::capabilities_json,
};
use crate::{
    error::ApiError,
    hardware::pb,
    numeric::{bounded_integer, compare_numbers},
};
use cirnet_contracts_native::validation::Registry;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
fn reject() -> ApiError {
    ApiError::new("UNEXECUTABLE", 422)
}
fn exceeds(value: &Value, limit: &Value) -> Result<bool, ApiError> {
    Ok(compare_numbers(value, limit).ok_or_else(reject)?.is_gt())
}
fn instrument(role: &str) -> Option<&'static str> {
    match role {
        "LOGIC_ANALYZER" => Some("logic_analyzer"),
        "SCOPE" => Some("oscilloscope"),
        "GENERATOR" => Some("generator"),
        _ => None,
    }
}
pub struct ExecutionCompiler {
    registry: Arc<Registry>,
}
impl ExecutionCompiler {
    pub fn new(registry: Arc<Registry>) -> Self {
        Self { registry }
    }
    pub fn compile(
        &self,
        experiment: &Value,
        assignment: Option<&Value>,
        caps: &pb::StationCapabilities,
        resolution: Option<&Value>,
    ) -> Result<Value, ApiError> {
        let caps = validate(
            &self.registry,
            "StationCapabilities",
            &capabilities_json(caps),
        )?;
        self.compile_value(experiment, assignment, &caps, resolution)
    }
    /// Inputs have already crossed their canonical boundaries; retained as a
    /// pure seam for the exact-reference corpus and station-profile admission.
    pub fn compile_value(
        &self,
        experiment: &Value,
        assignment: Option<&Value>,
        caps: &Value,
        resolution: Option<&Value>,
    ) -> Result<Value, ApiError> {
        let empty = json!({});
        let assignment = assignment.unwrap_or(&empty);
        let resolution = resolution.unwrap_or(&empty);
        let virtual_mode = caps["mode"] == "simulation";
        let endpoints = array(&assignment["lab_endpoints"]);
        let resolved: BTreeMap<_, _> = array(&resolution["endpoint_bindings"])
            .iter()
            .map(|b| (text(b, "endpoint_id"), &b["observed_node_id"]))
            .collect();
        if !virtual_mode && endpoints.is_empty() {
            return Err(reject());
        }
        let (mut bindings, mut instruments) = (Vec::new(), Vec::new());
        let default_channel = json!(1);
        for endpoint in endpoints {
            let role = text(endpoint, "role");
            if virtual_mode && matches!(role, "VCC" | "GND") {
                continue;
            }
            let node = if virtual_mode {
                endpoint
                    .get("design_port")
                    .or_else(|| endpoint.get("fixed_node_id"))
                    .or_else(|| endpoint.get("node_id"))
            } else {
                resolved.get(text(endpoint, "endpoint_id")).copied()
            };
            let Some(node) = node.and_then(Value::as_str).filter(|n| !n.is_empty()) else {
                if !virtual_mode && endpoint.get("required").is_none_or(|v| *v == true) {
                    return Err(reject());
                }
                continue;
            };
            bindings
                .push(json!({"endpoint_id":endpoint["endpoint_id"],"node_id":node,"role":role}));
            if let Some(name) = instrument(role) {
                let limit = &caps["instrument_capabilities"][name]["channels"];
                let channel = endpoint.get("channel").unwrap_or(&default_channel);
                // The pinned instrument-path validator requires allocation channels to
                // be integer tokens, even though capability limits may be integral floats.
                if channel.as_u64().is_none_or(|value| value < 1) || exceeds(channel, limit)? {
                    return Err(reject());
                }
                instruments.push(json!({"endpoint_id":endpoint["endpoint_id"],"instrument":role,"channel":channel}));
            }
        }
        let allocations = if virtual_mode {
            Vec::new()
        } else {
            allocate_routes(
                &bindings,
                array(&caps["routing_resources"]),
                &NodeOptions::new(),
            )?
        };
        let config = &experiment["_configuration"];
        let profile = &caps["hardware_profile_version"];
        let plan = validate(
            &self.registry,
            "InstrumentationExecutionPlan",
            &json!({
             "schema_version":"1.0","station_id":experiment["station_id"],"experiment_id":experiment["experiment_id"],
             "power_policy":{"profile_id":profile,"guarded":true},"endpoint_bindings":bindings,
             "routing_allocations":allocations,"instrument_allocations":instruments,
             "clock_config":config.get("clock_config").cloned().unwrap_or_else(||json!({})),
             "generator_config":config.get("generator_config").cloned().unwrap_or_else(||json!([])),
             "capture_config":config.get("capture_config").cloned().unwrap_or_else(||json!({"signals":[],"duration_ns":1000000})),
             "test_vectors":config.get("test_vectors").cloned().unwrap_or_else(||json!([])),
             "runtime_safety_policy":{"profile_id":profile,"watchdog_required":true}
            }),
        )?;
        validate_plan_instruments(&self.registry, &plan, caps)?;
        Ok(plan)
    }
}
/// Station-dependent admission follows the pinned Contracts instrument guards;
/// individual configurations/capability schemas still use the producer registry.
pub fn validate_generator(
    registry: &Registry,
    configuration: &Value,
    capability: &Value,
) -> Result<(), ApiError> {
    validate(registry, "GeneratorConfiguration", configuration).map_err(|_| reject())?;
    validate(registry, "GeneratorCapability", capability).map_err(|_| reject())?;
    if exceeds(&configuration["channel"], &capability["channels"])? {
        return Err(reject());
    }
    for key in ["frequency_hz", "amplitude_vpp", "offset_v", "phase_degrees"] {
        if let Some(value) = configuration.get(key)
            && value.as_f64().is_none_or(|n| !n.is_finite())
        {
            return Err(reject());
        }
    }
    if let Some(waveforms) = capability.get("supported_waveforms")
        && !array(waveforms).contains(&configuration["waveform"])
    {
        return Err(reject());
    }
    for (limit, parameter, upper) in [
        ("frequency_min_hz", "frequency_hz", false),
        ("frequency_max_hz", "frequency_hz", true),
        ("amplitude_max_vpp", "amplitude_vpp", true),
        ("offset_min_v", "offset_v", false),
        ("offset_max_v", "offset_v", true),
    ] {
        if let Some(limit) = capability.get(limit) {
            let ordering = compare_numbers(&configuration[parameter], limit).ok_or_else(reject)?;
            if if upper {
                ordering.is_gt()
            } else {
                ordering.is_lt()
            } {
                return Err(reject());
            }
        }
    }
    Ok(())
}
pub fn validate_plan_instruments(
    registry: &Registry,
    plan: &Value,
    capabilities: &Value,
) -> Result<(), ApiError> {
    let caps = &capabilities["instrument_capabilities"];
    validate(registry, "InstrumentCapabilities", caps)?;
    let bindings: BTreeMap<_, _> = array(&plan["endpoint_bindings"])
        .iter()
        .map(|b| (text(b, "endpoint_id"), b))
        .collect();
    if bindings.len() != array(&plan["endpoint_bindings"]).len() {
        return Err(reject());
    }
    let hardware = capabilities["mode"] == "hardware";
    let mut resources = BTreeMap::new();
    let mut routes: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    let mut uses: BTreeMap<&str, usize> = BTreeMap::new();
    if hardware {
        for resource in array(&capabilities["routing_resources"]) {
            resources.insert(text(resource, "resource_id"), resource);
        }
        if resources.len() != array(&capabilities["routing_resources"]).len() {
            return Err(reject());
        }
        for route in array(&plan["routing_allocations"]) {
            routes
                .entry(text(route, "endpoint_id"))
                .or_default()
                .push(text(route, "resource_id"));
            *uses.entry(text(route, "resource_id")).or_default() += 1;
        }
    }
    let mut channels = BTreeSet::new();
    let mut endpoints = BTreeSet::new();
    let mut generator_channels = BTreeSet::new();
    for allocation in array(&plan["instrument_allocations"]) {
        let role = text(allocation, "instrument");
        let name = instrument(role).ok_or_else(reject)?;
        let endpoint = text(allocation, "endpoint_id");
        let binding = bindings.get(endpoint).ok_or_else(reject)?;
        let channel = allocation["channel"].as_u64().ok_or_else(reject)?;
        if binding["role"] != role
            || channel < 1
            || exceeds(&allocation["channel"], &caps[name]["channels"])?
            || !channels.insert((name, channel))
            || !endpoints.insert(endpoint)
        {
            return Err(reject());
        }
        if hardware {
            let route = routes
                .get(endpoint)
                .filter(|v| v.len() == 1)
                .ok_or_else(reject)?[0];
            let resource = resources.get(route).ok_or_else(reject)?;
            if uses[route] != 1
                || !array(&resource["roles"]).contains(&binding["role"])
                || !array(&resource["node_ids"]).contains(&binding["node_id"])
            {
                return Err(reject());
            }
        }
        if role == "GENERATOR" {
            generator_channels.insert(channel);
        }
    }
    let expected: BTreeSet<_> = bindings
        .iter()
        .filter(|(_, b)| instrument(text(b, "role")).is_some())
        .map(|(id, _)| *id)
        .collect();
    if expected != endpoints {
        return Err(reject());
    }
    let mut configured = BTreeSet::new();
    for config in array(&plan["generator_config"]) {
        validate_generator(registry, config, &caps["generator"])?;
        let channel = bounded_integer(&config["channel"], 1, 2).ok_or_else(reject)? as u64;
        if !configured.insert(channel)
            || (config["enabled"] == true && !generator_channels.contains(&channel))
        {
            return Err(reject());
        }
    }
    if exceeds(
        &json!(array(&plan["capture_config"]["signals"]).len()),
        &caps["logic_analyzer"]["channels"],
    )? {
        return Err(reject());
    }
    Ok(())
}
