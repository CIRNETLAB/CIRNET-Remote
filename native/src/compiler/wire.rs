//! Explicit adapters for the exact pinned protobuf descriptors. No generator.
use super::{array, text};
use crate::{error::ApiError, hardware::pb, numeric::bounded_integer};
use serde_json::{Value, json};
fn invalid() -> ApiError {
    ApiError::new("INVALID_CONFIGURATION", 422)
}
fn n32(value: &Value) -> Result<u32, ApiError> {
    bounded_integer(value, 0, i64::from(u32::MAX))
        .map(|value| value as u32)
        .ok_or_else(invalid)
}
fn decimal(value: &Value) -> Result<f64, ApiError> {
    value.as_f64().filter(|v| v.is_finite()).ok_or_else(invalid)
}
fn number(value: f64) -> Value {
    if value.is_nan() {
        json!("NaN")
    } else if value == f64::INFINITY {
        json!("Infinity")
    } else if value == f64::NEG_INFINITY {
        json!("-Infinity")
    } else {
        json!(value)
    }
}
pub fn capabilities_json(c: &pb::StationCapabilities) -> Value {
    let mut value = json!({"schema_version":c.schema_version,"station_id":c.station_id,"mode":c.mode,"available":c.available,
  "virtual_digital":c.virtual_digital,"virtual_analog":c.virtual_analog,"physical_digital":c.physical_digital,
  "physical_analog_routing":c.physical_analog_routing,"physical_execution_slots":c.physical_execution_slots,
  "topology_scan_supported":c.topology_scan_supported,"safety_gate_supported":c.safety_gate_supported,
  "guarded_run_supported":c.guarded_run_supported,"component_resolution_modes":c.component_resolution_modes,
  "hardware_rpc_version":c.hardware_rpc_version,"fpga_protocol_version":c.fpga_protocol_version,
  "firmware_version":c.firmware_version,"hardware_profile_version":c.hardware_profile_version,
  "routing_resources":c.routing_resources.iter().map(|r|json!({"resource_id":r.resource_id,"roles":r.roles,"node_ids":r.node_ids})).collect::<Vec<_>>(),
  "breadboards":c.breadboards.iter().map(|b|json!({"id":b.id,"model":b.model})).collect::<Vec<_>>()});
    if let Some(caps) = &c.instrument_capabilities {
        let mut instruments = json!({});
        for (name, c) in [
            ("logic_analyzer", &caps.logic_analyzer),
            ("oscilloscope", &caps.oscilloscope),
        ] {
            if let Some(c) = c {
                let mut v = json!({"channels":c.channels,"runtime_reconfiguration_supported":c.runtime_reconfiguration_supported});
                if let Some(status) = &c.status {
                    v["status"] = json!(status);
                }
                instruments[name] = v;
            }
        }
        if let Some(c) = &caps.generator {
            let mut v = json!({"channels":c.channels,"runtime_reconfiguration_supported":c.runtime_reconfiguration_supported});
            if let Some(status) = &c.status {
                v["status"] = json!(status);
            }
            if !c.supported_waveforms.is_empty() {
                v["supported_waveforms"] = json!(c.supported_waveforms);
            }
            for (key, value) in [
                ("frequency_min_hz", c.frequency_min_hz),
                ("frequency_max_hz", c.frequency_max_hz),
                ("amplitude_max_vpp", c.amplitude_max_vpp),
                ("offset_min_v", c.offset_min_v),
                ("offset_max_v", c.offset_max_v),
            ] {
                if let Some(value) = value {
                    v[key] = number(value);
                }
            }
            instruments["generator"] = v;
        }
        value["instrument_capabilities"] = instruments;
    }
    value
}
pub fn generator_request(c: &Value) -> Result<pb::GeneratorConfiguration, ApiError> {
    Ok(pb::GeneratorConfiguration {
        channel: n32(&c["channel"])?,
        waveform: text(c, "waveform").into(),
        frequency_hz: decimal(&c["frequency_hz"])?,
        amplitude_vpp: decimal(&c["amplitude_vpp"])?,
        offset_v: decimal(&c["offset_v"])?,
        enabled: c["enabled"].as_bool().ok_or_else(invalid)?,
        phase_degrees: c.get("phase_degrees").map(decimal).transpose()?,
    })
}
pub fn clock_request(c: &Value) -> Result<pb::ClockConfiguration, ApiError> {
    Ok(pb::ClockConfiguration {
        signal: text(c, "signal").into(),
        period_ns: c.get("period_ns").map(n32).transpose()?.unwrap_or_default(),
        cycles: c.get("cycles").map(n32).transpose()?.unwrap_or_default(),
    })
}
pub fn trigger_request(c: &Value) -> pb::TriggerConfiguration {
    pb::TriggerConfiguration {
        signal: text(c, "signal").into(),
        edge: text(c, "edge").into(),
    }
}
pub fn capture_request(c: &Value) -> Result<pb::CaptureConfiguration, ApiError> {
    Ok(pb::CaptureConfiguration {
        signals: array(&c["signals"])
            .iter()
            .map(|v| v.as_str().map(str::to_owned).ok_or_else(invalid))
            .collect::<Result<_, _>>()?,
        duration_ns: n32(&c["duration_ns"])?,
        max_events: c.get("max_events").map(n32).transpose()?,
        trigger: c.get("trigger").map(trigger_request),
    })
}
pub fn prepare_request(
    target: pb::Target,
    p: &Value,
    d: &Value,
) -> Result<pb::PrepareExecutionRequest, ApiError> {
    let bindings = array(&p["endpoint_bindings"])
        .iter()
        .map(|b| pb::EndpointBinding {
            endpoint_id: text(b, "endpoint_id").into(),
            node_id: text(b, "node_id").into(),
            role: text(b, "role").into(),
        })
        .collect();
    let routes = array(&p["routing_allocations"])
        .iter()
        .map(|b| pb::RoutingAllocation {
            endpoint_id: text(b, "endpoint_id").into(),
            resource_id: text(b, "resource_id").into(),
        })
        .collect();
    let instruments = array(&p["instrument_allocations"])
        .iter()
        .map(|b| {
            Ok(pb::InstrumentAllocation {
                endpoint_id: text(b, "endpoint_id").into(),
                instrument: text(b, "instrument").into(),
                channel: n32(&b["channel"])?,
            })
        })
        .collect::<Result<_, ApiError>>()?;
    let vectors = array(&p["test_vectors"])
        .iter()
        .map(|v| {
            let inputs = v["inputs"]
                .as_object()
                .ok_or_else(invalid)?
                .iter()
                .map(|(k, v)| Ok((k.clone(), n32(v)?)))
                .collect::<Result<_, ApiError>>()?;
            Ok(pb::TestVector {
                time_ns: n32(&v["time_ns"])?,
                inputs,
            })
        })
        .collect::<Result<_, ApiError>>()?;
    let policy = &p["power_policy"];
    let safety = &p["runtime_safety_policy"];
    if target.station_id != text(p, "station_id")
        || target.experiment_id != text(p, "experiment_id")
    {
        return Err(invalid());
    }
    Ok(pb::PrepareExecutionRequest {
        target: Some(target),
        plan: Some(pb::InstrumentationExecutionPlan {
            schema_version: text(p, "schema_version").into(),
            station_id: text(p, "station_id").into(),
            experiment_id: text(p, "experiment_id").into(),
            power_policy: Some(pb::PowerPolicy {
                profile_id: text(policy, "profile_id").into(),
                guarded: policy["guarded"].as_bool().ok_or_else(invalid)?,
            }),
            endpoint_bindings: bindings,
            routing_allocations: routes,
            instrument_allocations: instruments,
            clock_config: p.get("clock_config").map(clock_request).transpose()?,
            generator_config: array(&p["generator_config"])
                .iter()
                .map(generator_request)
                .collect::<Result<_, _>>()?,
            capture_config: Some(capture_request(&p["capture_config"])?),
            test_vectors: vectors,
            runtime_safety_policy: Some(pb::RuntimeSafetyPolicy {
                profile_id: text(safety, "profile_id").into(),
                watchdog_required: safety["watchdog_required"].as_bool().ok_or_else(invalid)?,
            }),
        }),
        decision: Some(pb::ExecutionDecision {
            schema_version: text(d, "schema_version").into(),
            decision: text(d, "decision").into(),
            reasons: array(&d["reasons"])
                .iter()
                .map(|v| v.as_str().map(str::to_owned).ok_or_else(invalid))
                .collect::<Result<_, _>>()?,
        }),
    })
}
