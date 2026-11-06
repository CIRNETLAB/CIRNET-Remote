use super::*;
use cirnet_contracts_native::wire_json;

#[test]
fn durable_fingerprints_match_pinned_python_json() {
    // Captured from request_fingerprint in the exact installed r8 Remote.
    for (raw, expected) in [
        (
            r#"{"z":{"điện":"μ\u2028雪","A":[true,null,0,-0]},"a":1.0,"label":"☃","𐐀":1,"á":2}"#,
            "532b90f8dbc3386b183d3092337362ca866cf6a7b46876fae7dde3fb32f8e923",
        ),
        (
            r#"{"small":1e-7,"medium":1e-4,"threshold":1e16,"normal":1e15,"large":1e+300,"negative":-0.0}"#,
            "9858e40c5c7059b26e318ba8760d69a3dd5d871839c0c1fdaf3b144ba29e463a",
        ),
        (
            r#"{"large_int":9007199254740993456789,"unity":1.0000000000000001,"half":0.10000000000000001,"key":"\u0000\n\t\\\""}"#,
            "4b120434e6ae6f088edd68d0dc1f712bf47e54ba2c72355fa77141358cb53a24",
        ),
    ] {
        let payload = wire_json::parse(raw.as_bytes()).unwrap();
        assert_eq!(request_fingerprint(&payload).unwrap(), expected);
    }
    let non_finite = wire_json::parse(br#"{"e":1e400}"#).unwrap();
    assert_eq!(
        request_fingerprint(&non_finite).unwrap_err().code,
        "INVALID_CONFIGURATION"
    );
}

#[test]
fn operation_keys_have_frozen_ascii_boundary() {
    for key in ["session:Run_1.2-x", &"a".repeat(128)] {
        assert_eq!(operation_key(key).unwrap(), key);
    }
    for key in ["", "a\n", "é", "has/slash", &"a".repeat(129)] {
        assert_eq!(
            operation_key(key).unwrap_err().code,
            "INVALID_OPERATION_KEY"
        );
    }
}
