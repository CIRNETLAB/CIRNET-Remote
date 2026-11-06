use crate::{error::ApiError, hardware::HardwareClient};
use cirnet_contracts_native::validation::{Registry, ValidationError};
use serde_json::{Value, json};

const PREVIEW_FAILURE: &str = "The physical preview could not compile or settle this design.";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GraphVersion {
    V1,
    V2,
}

pub fn validate_graph(
    registry: &Registry,
    graph: &Value,
    version: GraphVersion,
) -> Result<Value, ApiError> {
    validated_graph(registry, graph, version)?;
    let message = match version {
        GraphVersion::V1 => "Circuit Graph is structurally valid.",
        GraphVersion::V2 => "Circuit Graph is structurally and mechanically valid.",
    };
    Ok(json!({"valid":true,"code":"OK","message":message}))
}

pub async fn physical_preview(
    registry: &Registry,
    hardware: &HardwareClient,
    graph: &Value,
    version: GraphVersion,
) -> Result<Value, ApiError> {
    let mut graph = validated_graph(registry, graph, version)?;
    if version == GraphVersion::V2 {
        normalize_properties(&mut graph);
    }
    let result = hardware
        .preview(&graph)
        .await
        .map_err(|error| validation_error(&error.code, PREVIEW_FAILURE))?
        .ok_or_else(|| ApiError::new("HARDWARE_UNAVAILABLE", 503))?;
    let validated = registry
        .validate("PhysicalPreviewResult", "transport", &result)
        .map_err(|_| validation_error("PROTOCOL_MISMATCH", PREVIEW_FAILURE))?;
    let Value::Object(mut result) = validated else {
        return Err(validation_error("PROTOCOL_MISMATCH", PREVIEW_FAILURE));
    };
    result.insert("provenance".into(), json!("simulation_preview"));
    result.insert(
        "limitations".into(),
        json!([
            "Educational DC and digital component models have a limited execution envelope.",
            "Physical acquisition and full SPICE or mixed-signal execution remain unavailable.",
        ]),
    );
    let mut value = Value::Object(result);
    remove_optional_nulls(&mut value);
    Ok(value)
}

/// Validate mechanical bindings after validating the circuit graph's schema.
pub fn validate_design(registry: &Registry, graph: &Value) -> Result<(), ApiError> {
    // The pinned Contracts registry currently exposes physical design checks
    // through assignment references. Use a fixed valid envelope so geometry
    // remains owned by Contracts, and translate only a reference-graph failure.
    let assignment = json!({
        "schema_version": "2.0",
        "assignment_id": "physical-validation",
        "title": "Physical validation",
        "lab_endpoints": [],
        "assessment_policy": "STRICT_TOPOLOGY",
        "reference_design_graph": graph,
    });
    registry
        .validate(
            "AnySupportedAssignmentDefinition",
            "structural",
            &assignment,
        )
        .map(|_| ())
        .map_err(|error| match error {
            ValidationError::Invalid(issue)
                if issue.code == "INVALID_REFERENCE_DESIGN"
                    && (issue.path == "/reference_design_graph"
                        || issue.path.starts_with("/reference_design_graph/")) =>
            {
                ApiError::new("INVALID_CONFIGURATION", 422).with_message(issue.message)
            }
            _ => ApiError::new("INTERNAL_ERROR", 500),
        })
}

fn validated_graph(
    registry: &Registry,
    graph: &Value,
    version: GraphVersion,
) -> Result<Value, ApiError> {
    let schema = graph.get("schema_version").and_then(Value::as_str);
    if version == GraphVersion::V1
        && let Some(schema) = schema
        && !matches!(schema, "1.0" | "1.1")
    {
        return Err(validation_error(
            "UNSUPPORTED_SCHEMA_VERSION",
            &format!("Unsupported Circuit Graph schema: {schema}"),
        ));
    }
    if version == GraphVersion::V2
        && graph.is_object()
        && !matches!(schema, Some("1.0" | "1.1" | "1.2"))
    {
        return Err(validation_error(
            "UNSUPPORTED_SCHEMA_VERSION",
            "Unsupported Circuit Graph schema.",
        ));
    }

    let legacy_graph;
    let (contract, instance) = match version {
        GraphVersion::V1 => {
            legacy_graph = {
                let mut graph = graph.clone();
                normalize_properties(&mut graph);
                graph
            };
            ("CircuitGraph", &legacy_graph)
        }
        GraphVersion::V2 => ("AnySupportedCircuitGraph", graph),
    };
    let validated = registry
        .validate(contract, "structural", instance)
        .map_err(|error| match error {
            ValidationError::Invalid(issue) => {
                let message = if version == GraphVersion::V1 && issue.code.starts_with("SCHEMA_") {
                    ": The value does not match its canonical contract.".into()
                } else if version == GraphVersion::V2
                    && issue.code == "SCHEMA_ONEOF"
                    && issue.path.is_empty()
                {
                    v2_one_of_detail(registry, graph).unwrap_or(issue.message)
                } else {
                    issue.message
                };
                validation_error("SCHEMA_VALIDATION_ERROR", &message)
            }
            _ => ApiError::new("INTERNAL_ERROR", 500),
        })?;
    validate_design(registry, &validated).map_err(|error| {
        if error.status == 422 {
            validation_error("SCHEMA_VALIDATION_ERROR", &error.message)
        } else {
            error
        }
    })?;
    Ok(validated)
}

fn v2_one_of_detail(registry: &Registry, graph: &Value) -> Option<String> {
    // The versioned endpoint exposed jsonschema's root oneOf diagnostic.
    // Read the schema fragment from the pinned registry instead of repeating it.
    let schema = registry
        .load_schema("https://cirnet.local/contracts/circuit/1.2/schema.json#/$defs/AnySupportedCircuitGraph")
        .ok()?;
    let representation = python_repr(graph);
    let schema = python_pretty(&schema, 0, 0).replace('\n', "\n    ");
    let instance = python_pretty(graph, 0, 0).replace('\n', "\n    ");
    Some(format!(
        "{representation} is not valid under any of the given schemas\n\nFailed validating 'oneOf' in schema:\n    {schema}\n\nOn instance:\n    {instance}",
    ))
}

fn python_repr(value: &Value) -> String {
    match value {
        Value::Null => "None".into(),
        Value::Bool(true) => "True".into(),
        Value::Bool(false) => "False".into(),
        Value::Number(number) if number.is_f64() => {
            let Some(number) = number.as_f64() else {
                return number.to_string();
            };
            let rendered = format!("{number:?}");
            if let Some((mantissa, exponent)) = rendered.split_once('e')
                && let Ok(exponent) = exponent.parse::<i32>()
            {
                return format!("{mantissa}e{exponent:+03}");
            }
            rendered
        }
        Value::Number(number) => number.to_string(),
        Value::String(text) => python_string(text),
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(python_repr)
                .collect::<Vec<_>>()
                .join(", ")
        ),
        Value::Object(values) => format!(
            "{{{}}}",
            values
                .iter()
                .map(|(key, value)| format!("{}: {}", python_string(key), python_repr(value)))
                .collect::<Vec<_>>()
                .join(", ")
        ),
    }
}

fn python_string(text: &str) -> String {
    use std::fmt::Write;
    let quote = if text.contains('\'') && !text.contains('"') {
        '"'
    } else {
        '\''
    };
    let mut rendered = String::from(quote);
    for character in text.chars() {
        match character {
            '\\' => rendered.push_str("\\\\"),
            '\n' => rendered.push_str("\\n"),
            '\r' => rendered.push_str("\\r"),
            '\t' => rendered.push_str("\\t"),
            character if character == quote => {
                rendered.push('\\');
                rendered.push(character);
            }
            character
                if character.is_control() || character.is_whitespace() && character != ' ' =>
            {
                let code = u32::from(character);
                if code <= 0xff {
                    let _ = write!(rendered, "\\x{code:02x}");
                } else if code <= 0xffff {
                    let _ = write!(rendered, "\\u{code:04x}");
                } else {
                    let _ = write!(rendered, "\\U{code:08x}");
                }
            }
            character => rendered.push(character),
        }
    }
    rendered.push(quote);
    rendered
}

fn python_pretty(value: &Value, indent: usize, allowance: usize) -> String {
    const WIDTH: usize = 72;
    let flat = python_repr(value);
    if flat.chars().count() + indent + allowance <= WIDTH {
        return flat;
    }

    match value {
        Value::Object(values) => {
            drop(flat);
            let mut rendered = String::from("{");
            for (index, (key, value)) in values.iter().enumerate() {
                if index > 0 {
                    rendered.push_str(",\n");
                    rendered.push_str(&" ".repeat(indent + 1));
                }
                let key = python_string(key);
                rendered.push_str(&key);
                rendered.push_str(": ");
                let closing = if index + 1 == values.len() {
                    allowance + 1
                } else {
                    1
                };
                rendered.push_str(&python_pretty(
                    value,
                    indent + key.chars().count() + 3,
                    closing,
                ));
            }
            rendered.push('}');
            rendered
        }
        Value::Array(values) => {
            drop(flat);
            let mut rendered = String::from("[");
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    rendered.push_str(",\n");
                    rendered.push_str(&" ".repeat(indent + 1));
                }
                let closing = if index + 1 == values.len() {
                    allowance + 1
                } else {
                    1
                };
                rendered.push_str(&python_pretty(value, indent + 1, closing));
            }
            rendered.push(']');
            rendered
        }
        _ => flat,
    }
}

fn validation_error(code: &str, message: &str) -> ApiError {
    ApiError::new(code, 422)
        .with_message(message)
        .with_body(json!({"valid":false,"code":code,"message":message}))
}

fn normalize_properties(graph: &mut Value) {
    let Some(modules) = graph.get_mut("modules").and_then(Value::as_array_mut) else {
        return;
    };
    for module in modules {
        let resistor = module["type"] == "RESISTOR_AXIAL";
        let label = module["type"] == "LABEL";
        let Some(properties) = module.get_mut("properties").and_then(Value::as_object_mut) else {
            continue;
        };
        if resistor && let Some(resistance) = properties.remove("resistance_ohm") {
            properties.entry("resistanceOhms").or_insert(resistance);
        }
        if label {
            for (key, default) in [
                ("version", json!(1)),
                ("text", json!("Hello")),
                ("fontSizeMm", json!(3)),
                ("textColor", json!("#20252A")),
                ("backgroundColor", json!("#FAFAF7")),
                ("paddingMm", json!(1)),
            ] {
                properties.entry(key).or_insert(default);
            }
        }
    }
}

fn remove_optional_nulls(value: &mut Value) {
    match value {
        Value::Object(object) => {
            object.retain(|_, value| !value.is_null());
            for value in object.values_mut() {
                remove_optional_nulls(value);
            }
        }
        Value::Array(items) => items.iter_mut().for_each(remove_optional_nulls),
        _ => {}
    }
}

#[cfg(test)]
#[path = "../tests/preview_contract.rs"]
mod tests;

/// An unparsed HTTP byte body is not a CircuitGraph. Preserve the legacy
/// endpoint's diagnostic without converting bytes into an accepted graph.
pub(crate) fn raw_graph_error(registry: &Registry, body: &[u8], version: GraphVersion) -> ApiError {
    if version == GraphVersion::V1 {
        return validation_error(
            "SCHEMA_VALIDATION_ERROR",
            ": The value does not match its canonical contract.",
        );
    }
    let schema = match registry.load_schema(
        "https://cirnet.local/contracts/circuit/1.2/schema.json#/$defs/AnySupportedCircuitGraph",
    ) {
        Ok(schema) => schema,
        Err(_) => return ApiError::new("INTERNAL_ERROR", 500),
    };
    let representation = crate::http_body::python_bytes_repr(body);
    let schema = python_pretty(&schema, 0, 0).replace('\n', "\n    ");
    validation_error(
        "SCHEMA_VALIDATION_ERROR",
        &format!(
            "{representation} is not valid under any of the given schemas\n\nFailed validating 'oneOf' in schema:\n    {schema}\n\nOn instance:\n    {representation}"
        ),
    )
}
