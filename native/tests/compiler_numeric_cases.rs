use std::{env, fs, path::Path, sync::Arc};

use cirnet_contracts_native::validation::Registry;
use serde_json::{Value, json};

use crate::hardware::pb;

use super::{
    ExecutionCompiler, clock_request, prepare_request, text, validate_generator, verify_functional,
};

#[test]
#[ignore = "requires the pinned Python numeric compiler corpus"]
fn compiler_numeric_boundary_matches_python() {
    let corpus = fs::read(env::var("CIRNET_REMOTE_COMPILER_NUMERIC_CORPUS").unwrap()).unwrap();
    let cases: Vec<Value> = serde_json::from_slice(&corpus).unwrap();
    assert_eq!(cases.len(), 22);
    let contracts = env::var("CIRNET_CONTRACTS_ROOT").unwrap();
    let registry = Arc::new(Registry::load(Path::new(&contracts)).unwrap());
    let compiler = ExecutionCompiler::new(registry.clone());
    let mut failures = Vec::new();
    for case in cases {
        let input = &case["inputs"];
        let compile = || {
            compiler.compile_value(
                &input["experiment"],
                input.get("assignment"),
                &input["caps"],
                None,
            )
        };
        let actual = match text(&case, "kind") {
            "clock" => clock_request(input).map(|clock| json!({
                "signal": clock.signal, "period_ns": clock.period_ns, "cycles": clock.cycles,
            })),
            "generator" => validate_generator(&registry, &input["config"], &input["capability"]).map(|_| json!(true)),
            "functional" => verify_functional(&registry, input.get("assignment"), input.get("capture"), input.get("vectors")),
            "compile" => compile(),
            "prepare" => compile().and_then(|plan| {
                let target = pb::Target { station_id: "s".to_owned(), experiment_id: "e".to_owned() };
                let message = prepare_request(target, &plan, &json!({"schema_version": "1.0",
                    "decision": "RUN_NORMAL", "reasons": []}))?.plan.unwrap();
                let clock = message.clock_config.unwrap();
                let capture = message.capture_config.unwrap();
                Ok(json!({
                    "clock": {"signal": clock.signal, "period_ns": clock.period_ns, "cycles": clock.cycles},
                    "capture": {"duration_ns": capture.duration_ns, "max_events": capture.max_events},
                    "generators": message.generator_config.iter().map(|g| g.channel).collect::<Vec<_>>(),
                    "vectors": message.test_vectors.iter().map(|v| json!({"time_ns": v.time_ns, "inputs": v.inputs})).collect::<Vec<_>>(),
                }))
            }),
            kind => panic!("Unknown numeric fixture kind: {kind}"),
        };
        let matched = match &actual {
            Ok(value) => case.get("value") == Some(value),
            Err(error) => case["error"].as_str() == Some(&error.code),
        };
        if !matched {
            failures.push(format!(
                "{} ({}) actual={actual:?} expected={}",
                case["name"],
                case["kind"],
                case.get("value").unwrap_or(&case["error"])
            ));
        }
    }
    assert!(
        failures.is_empty(),
        "{} numeric cases differed:\n{}",
        failures.len(),
        failures.join("\n")
    );
}
