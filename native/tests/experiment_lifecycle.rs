use super::*;
use serde_json::json;

#[test]
fn authoritative_stop_ack_is_mode_specific_and_fails_closed() {
    for (result, simulation, physical) in [
        (json!({"accepted":true,"hardware_applied":true}), true, true),
        (
            json!({"accepted":true,"hardware_applied":false}),
            true,
            false,
        ),
        (json!({"accepted":true}), true, false),
        (
            json!({"accepted":false,"hardware_applied":true}),
            false,
            false,
        ),
        (json!({"accepted":1,"hardware_applied":true}), false, false),
        (json!({"hardware_applied":true}), false, false),
    ] {
        assert_eq!(safe_stop_ack("simulation", &result), simulation);
        assert_eq!(safe_stop_ack("hardware", &result), physical);
        assert!(!safe_stop_ack("unsupported", &result));
    }
}

#[test]
fn station_capacity_selects_first_free_and_any_quarantine_blocks_dispatch() {
    assert_eq!(vacant_slot(4, [(0, false), (2, false)]), Some(1));
    assert_eq!(vacant_slot(4, [(2, true)]), None);
    assert_eq!(vacant_slot(2, [(0, false), (1, false)]), None);
    assert_eq!(vacant_slot(0, []), None);
}

#[test]
fn transition_revisions_preserve_generation_history_and_extra_fields() {
    let initial = json!({
        "experiment_id":"eid", "state":"RUNNING", "state_history":["CREATED","RUNNING"],
        "revision":12, "_reservation_generation":"gen", "capture":null, "unknown_field":[1,2,3],
    });
    let updated = transition(&initial, "STOPPING", json!({"error_code":"STOPPED"})).unwrap();
    assert_eq!(updated["revision"], 13);
    assert_eq!(updated["_reservation_generation"], "gen");
    assert_eq!(updated["unknown_field"], initial["unknown_field"]);
    assert_eq!(
        updated["state_history"],
        json!(["CREATED", "RUNNING", "STOPPING"])
    );
    let revised = transition(&updated, "STOPPING", json!({"lease_expires_at":null})).unwrap();
    assert_eq!(revised["revision"], 14);
    assert_eq!(revised["state_history"], updated["state_history"]);
}
