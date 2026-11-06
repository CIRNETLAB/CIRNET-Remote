//! Pure Lab-First compilation and diagnostics, independent of scheduler authority.
mod execution;
mod routing;
mod topology;
mod verification;
mod wire;

pub use execution::{ExecutionCompiler, validate_generator, validate_plan_instruments};
pub use routing::{NodeOptions, allocate_routes};
pub use topology::{resolve_topology, verify_topology};
pub use verification::{assess, decide, verify_functional};
pub use wire::{
    capabilities_json, capture_request, clock_request, generator_request, prepare_request,
    trigger_request,
};

use crate::error::ApiError;
use cirnet_contracts_native::validation::{Registry, ValidationError};
use serde_json::Value;
pub(crate) fn array(value: &Value) -> &[Value] {
    value.as_array().map(Vec::as_slice).unwrap_or(&[])
}
pub(crate) fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}
pub(crate) fn validate(registry: &Registry, name: &str, value: &Value) -> Result<Value, ApiError> {
    registry
        .validate(name, "transport", value)
        .map_err(|error| match error {
            ValidationError::Invalid(issue) => {
                ApiError::new("INVALID_CONTRACT", 422).with_issues(vec![
                    serde_json::to_value(issue).expect("serializable canonical issue"),
                ])
            }
            _ => ApiError::new("INTERNAL_ERROR", 500),
        })
}

#[cfg(test)]
#[path = "../tests/compiler_numeric_cases.rs"]
mod numeric_cases;
