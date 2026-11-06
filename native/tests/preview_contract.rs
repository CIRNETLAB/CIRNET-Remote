use super::*;
use serde_json::json;

fn registry() -> Registry {
    Registry::load(std::path::Path::new(
        &std::env::var_os("CIRNET_CONTRACTS_ROOT").expect("select pinned Contracts resources"),
    ))
    .expect("load pinned Contracts registry")
}

#[test]
#[ignore = "requires the pinned Contracts resource directory"]
fn public_graph_versions_match_legacy_boundaries() {
    let registry = registry();
    let mut graph = json!({
        "schema_version":"1.0", "circuit_id":"test", "modules":[], "connections":[],
    });
    assert_eq!(
        validate_graph(&registry, &graph, GraphVersion::V1).unwrap(),
        json!({"valid":true,"code":"OK","message":"Circuit Graph is structurally valid."}),
    );
    assert_eq!(
        validate_graph(&registry, &graph, GraphVersion::V2).unwrap(),
        json!({"valid":true,"code":"OK","message":"Circuit Graph is structurally and mechanically valid."}),
    );
    graph["schema_version"] = json!("1.2");
    let err = validate_graph(&registry, &graph, GraphVersion::V1).unwrap_err();
    assert_eq!(err.status, 422);
    assert_eq!(
        err.body.unwrap(),
        json!({
            "valid":false,"code":"UNSUPPORTED_SCHEMA_VERSION","message":"Unsupported Circuit Graph schema: 1.2",
        })
    );
    assert_eq!(
        validate_graph(&registry, &graph, GraphVersion::V2).unwrap()["valid"],
        true
    );
    graph.as_object_mut().unwrap().remove("schema_version");
    let err = validate_graph(&registry, &graph, GraphVersion::V1).unwrap_err();
    assert_eq!(err.status, 422);
    assert_eq!(
        err.body.unwrap(),
        json!({
            "valid":false,"code":"SCHEMA_VALIDATION_ERROR","message":": The value does not match its canonical contract.",
        })
    );
    let err = validate_graph(&registry, &graph, GraphVersion::V2).unwrap_err();
    assert_eq!(err.status, 422);
    assert_eq!(
        err.body.unwrap(),
        json!({
            "valid":false,"code":"UNSUPPORTED_SCHEMA_VERSION","message":"Unsupported Circuit Graph schema.",
        })
    );
}

#[test]
#[ignore = "requires the pinned Contracts resource directory"]
fn v2_one_of_errors_preserve_python_public_detail() {
    let registry = registry();
    let graph = json!({
        "schema_version":"1.0", "circuit_id":"shape", "modules":"no", "connections":[],
    });
    let error = validate_graph(&registry, &graph, GraphVersion::V2).unwrap_err();
    let message = r#"{'schema_version': '1.0', 'circuit_id': 'shape', 'modules': 'no', 'connections': []} is not valid under any of the given schemas

Failed validating 'oneOf' in schema:
    {'oneOf': [{'$ref': 'https://cirnet.local/contracts/circuit/1.x/circuit.schema.json'},
               {'$ref': 'https://cirnet.local/contracts/circuit/1.2/schema.json'}]}

On instance:
    {'schema_version': '1.0',
     'circuit_id': 'shape',
     'modules': 'no',
     'connections': []}"#;
    assert_eq!(
        error.body.unwrap(),
        json!({"valid":false,"code":"SCHEMA_VALIDATION_ERROR","message":message})
    );

    let error = validate_graph(&registry, &Value::Null, GraphVersion::V2).unwrap_err();
    let message = r#"None is not valid under any of the given schemas

Failed validating 'oneOf' in schema:
    {'oneOf': [{'$ref': 'https://cirnet.local/contracts/circuit/1.x/circuit.schema.json'},
               {'$ref': 'https://cirnet.local/contracts/circuit/1.2/schema.json'}]}

On instance:
    None"#;
    assert_eq!(
        error.body.unwrap(),
        json!({"valid":false,"code":"SCHEMA_VALIDATION_ERROR","message":message})
    );
}

#[test]
#[ignore = "requires the pinned Contracts resource directory"]
fn physical_binding_validation_matches_reference_mounting_rules() {
    let registry = registry();
    let directory = std::path::PathBuf::from(std::env::var_os("CIRNET_CONTRACTS_ROOT").unwrap());
    let fixture: Value = serde_json::from_slice(
        &std::fs::read(
            directory.join("contracts/design-models/fixtures/physical-mounting-parity.json"),
        )
        .unwrap(),
    )
    .unwrap();
    let mut graph = fixture["graph"].clone();
    let wrapper = json!({
        "schema_version":"2.0","assignment_id":"physical-validation","title":"Physical validation",
        "lab_endpoints":[],"assessment_policy":"STRICT_TOPOLOGY","reference_design_graph":graph,
    });
    assert!(
        registry
            .validate("AnySupportedAssignmentDefinition", "structural", &wrapper)
            .is_ok()
    );
    for version in [GraphVersion::V1, GraphVersion::V2] {
        assert_eq!(
            validate_graph(&registry, &graph, version).unwrap()["valid"],
            true
        );
    }
    graph["modules"][1]["mount"]["boardId"] = json!("missing-board");
    assert!(
        registry
            .validate("AnySupportedCircuitGraph", "structural", &graph)
            .is_ok()
    );
    for version in [GraphVersion::V1, GraphVersion::V2] {
        let error = validate_graph(&registry, &graph, version).unwrap_err();
        assert_eq!(error.status, 422);
        assert_eq!(
            error.body.unwrap(),
            json!({
                "valid":false,"code":"SCHEMA_VALIDATION_ERROR","message":"Unknown mounting breadboard",
            })
        );
    }
}
