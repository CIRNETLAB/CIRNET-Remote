use std::{env, fs, path::Path};

use cirnet_contracts_native::validation::{Registry, ValidationError};

use super::*;

#[test]
#[ignore = "requires the exact installed Python HTTP body fixture and Contracts"]
fn pinned_json_offsets_nonfinite_values_and_media_types() {
    let corpus = env::var("CIRNET_REMOTE_HTTP_BODY_CORPUS").unwrap();
    let corpus: Value = serde_json::from_slice(&fs::read(corpus).unwrap()).unwrap();
    let cases = corpus["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 54);
    let registry = Registry::load(Path::new(&env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap();
    let mut failures = Vec::new();
    let mut checked = 0;
    for case in cases {
        let name = case["name"].as_str().unwrap();
        let kind = case["kind"].as_str().unwrap();
        let input = case["input"].as_str().unwrap().as_bytes();
        let profile = case["profile"].as_str().unwrap();
        let header = case["content_type"]
            .as_str()
            .map(|value| HeaderValue::from_str(value).unwrap());
        if kind == "any" {
            // These route results depend on the public graph validators. The
            // decoder must classify raw bytes and supply their exact legacy repr.
            let raw = !is_json_media_type(header.as_ref());
            let repr_matches = !name.starts_with("/api/v2/")
                || case["value"]["message"]
                    .as_str()
                    .unwrap()
                    .starts_with(&python_bytes_repr(input));
            if !(raw && repr_matches) {
                failures.push(format!(
                    "{name}: media classification or bytes repr differs"
                ));
            }
            checked += 1;
            continue;
        }
        let result = if is_json_media_type(header.as_ref()) {
            decode(input, profile).and_then(|value| {
                let contract = if profile == "transport" {
                    "LoginRequest"
                } else {
                    "ProjectCreate"
                };
                registry
                    .validate(contract, profile, &value)
                    .map_err(|error| match error {
                        ValidationError::Invalid(canonical) => {
                            let mut canonical =
                                schema_first_error(&registry, contract, profile, &value, canonical);
                            canonical.path = format!("/body{}", canonical.path);
                            canonical.message =
                                "The request field does not match its declared contract.".into();
                            ApiError::new("REQUEST_VALIDATION_ERROR", 422)
                                .with_issues(vec![json!(canonical)])
                        }
                        _ => ApiError::new("INTERNAL_ERROR", 500),
                    })
            })
        } else {
            Err(media_type_error(profile))
        };
        let actual = match result {
            Ok(value) => json!({"status": 201, "value": value["name"]}),
            Err(error) => {
                json!({"status": error.status, "error": error.code, "issues": error.issues})
            }
        };
        let expected = if case["status"] == 201 {
            json!({"status": case["status"], "value": case["value"]})
        } else {
            json!({"status": case["status"], "error": case["error"], "issues": case["issues"]})
        };
        if actual != expected {
            failures.push(format!("{name}: actual={actual} expected={expected}"));
        }
        checked += 1;
    }
    assert_eq!(checked, 54);
    assert!(
        failures.is_empty(),
        "{} HTTP body cases differed:\n{}",
        failures.len(),
        failures.join("\n")
    );
}

#[test]
fn raw_bytes_representation_escapes_content_as_python() {
    assert_eq!(python_bytes_repr(b"plain"), "b'plain'");
    assert_eq!(python_bytes_repr(b"single'quote"), "b\"single'quote\"");
    assert_eq!(
        python_bytes_repr(b"'\"\n\r\t\\\x00\xff"),
        "b'\\'\"\\n\\r\\t\\\\\\x00\\xff'"
    );
}
