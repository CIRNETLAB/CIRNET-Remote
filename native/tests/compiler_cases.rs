use cirnet_contracts_native::validation::Registry;
use cirnet_remote_native::compiler::*;
use prost::Message;
use serde_json::Value;
use std::{path::Path, sync::Arc};
#[test]
#[ignore = "requires CIRNET_REMOTE_COMPILER_CORPUS from pinned Python reference"]
fn pure_compiler_policy_topology_and_function_match_reference() {
    let corpus: Vec<Value> = serde_json::from_slice(
        &std::fs::read(std::env::var("CIRNET_REMOTE_COMPILER_CORPUS").unwrap()).unwrap(),
    )
    .unwrap();
    let registry = Arc::new(
        Registry::load(Path::new(&std::env::var("CIRNET_CONTRACTS_ROOT").unwrap())).unwrap(),
    );
    let compiler = ExecutionCompiler::new(registry.clone());
    let mut failures = Vec::new();
    for case in &corpus {
        let i = &case["inputs"];
        let assignment = i.get("assignment").filter(|v| !v.is_null());
        let actual = match case["kind"].as_str().unwrap() {
            "wire" => {
                let expected = cirnet_remote_native::hardware::pb::PrepareExecutionRequest::decode(
                    hex(i["protobuf_hex"].as_str().unwrap()).as_slice(),
                )
                .unwrap();
                prepare_request(
                    cirnet_remote_native::hardware::pb::Target {
                        station_id: i["target"]["station_id"].as_str().unwrap().into(),
                        experiment_id: i["target"]["experiment_id"].as_str().unwrap().into(),
                    },
                    &i["plan"],
                    &i["decision"],
                )
                .map(|actual| serde_json::json!(actual == expected))
            }
            "capabilities" => Ok(capabilities_json(
                &cirnet_remote_native::hardware::pb::StationCapabilities::decode(
                    hex(i["protobuf_hex"].as_str().unwrap()).as_slice(),
                )
                .unwrap(),
            )),
            "compile" => compiler.compile_value(
                &i["experiment"],
                assignment,
                &i["caps"],
                i.get("resolution"),
            ),
            "resolve" => resolve_topology(&registry, assignment, &i["observed"], i.get("caps")),
            "topology" => {
                verify_topology(&registry, assignment, &i["observed"], i.get("resolution"))
            }
            "functional" => {
                verify_functional(&registry, assignment, i.get("capture"), i.get("vectors"))
            }
            "assess" => assess(assignment, i.get("topology"), i.get("function")),
            "decide" => decide(
                &registry,
                &i["safety"],
                i["executable"].as_bool().unwrap(),
                i["unknown"].as_bool().unwrap(),
            ),
            _ => panic!("unknown oracle kind"),
        };
        let observed = match actual {
            Ok(value) => serde_json::json!({"value":value}),
            Err(error) => serde_json::json!({"error":error.code}),
        };
        let expected = if let Some(value) = case.get("value") {
            serde_json::json!({"value":value})
        } else {
            serde_json::json!({"error":case["error"]})
        };
        let same = observed == expected;
        if !same {
            eprintln!(
                "COMPILER_DIFF {}",
                serde_json::json!({"kind":case["kind"],"name":case["name"],"expected":expected,"observed":observed})
            );
        }
        if !same {
            failures.push(format!("{}:{}", case["kind"], case["name"]));
        }
    }
    assert!(
        failures.is_empty(),
        "{} cases differed: {:?}",
        failures.len(),
        failures
    );
    assert!(corpus.len() > 100);
}

fn hex(value: &str) -> Vec<u8> {
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|c| u8::from_str_radix(std::str::from_utf8(c).unwrap(), 16).unwrap())
        .collect()
}
