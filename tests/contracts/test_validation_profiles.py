"""Shared validation profiles preserve documents and constrain transport explicitly."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from contracts.validation import validate


ROOT = Path(__file__).resolve().parents[2]


def capture():
    return {"schema_version": "1.0", "capture_id": "capture", "source": "simulation",
            "instrument": "logic_analyzer", "encoding": "digital_events", "available": True,
            "duration_ns": 10, "sample_count": 1,
            "samples": [{"signal": "out", "time_ns": 0, "value": 0}]}


def experiment():
    return {"schema_version": "1.0", "experiment_id": "e", "circuit_id": "c", "station_id": "s",
            "assignment_id": None, "mode": "simulation", "state": "CREATED",
            "state_history": ["CREATED"], "revision": 0, "execution_decision": None,
            "safety_verification": None, "topology_verification": None,
            "functional_verification": {"schema_version": "1.0", "status": "NOT_EVALUATED", "issues": []},
            "capture": None, "error_code": None, "queue_position": None, "lease_expires_at": None}


@pytest.mark.parametrize("name,value", [
    ("ClockConfiguration", {"signal": "CLK.OUT", "period_ns": 4294967296, "cycles": 1}),
    ("DigitalObservation", {"signal": "out", "time_ns": 9007199254740992, "value": 1}),
])
def test_lab_transport_rejects_unrepresentable_values_before_rpc(name, value):
    with pytest.raises(ValidationError):
        validate(name, value)


def test_capture_samples_must_agree_with_declared_count():
    value = capture()
    value["sample_count"] = 2
    with pytest.raises(ValidationError):
        validate("CaptureResult", value)


def test_capture_samples_cannot_lie_outside_declared_duration():
    value = capture()
    value["samples"][0]["time_ns"] = 11
    with pytest.raises(ValidationError):
        validate("CaptureResult", value)


def test_experiment_last_history_state_must_match_current_state():
    value = experiment()
    value["state"] = "RUNNING"
    with pytest.raises(ValidationError):
        validate("ExperimentRecord", value)


def test_structural_profile_preserves_historical_large_integers():
    value = {"signal": "out", "time_ns": 9007199254740992, "value": 1}
    assert validate("DigitalObservation", value, profile="structural") == value


def test_profile_overlay_is_detached_and_does_not_loosen_canonical_bounds():
    from contracts.semantic_profiles import profile_schema
    schema = {"$defs": {"ClockConfiguration": {"type": "object", "properties": {
        "period_ns": {"type": "integer", "minimum": 2},
        "cycles": {"type": "integer", "minimum": 1, "maximum": 100000}}}}}
    before = deepcopy(schema)
    bounded = profile_schema("ClockConfiguration", schema, "transport")
    assert schema == before
    properties = bounded["$defs"]["ClockConfiguration"]["properties"]
    assert properties["period_ns"]["maximum"] == 4294967295
    assert properties["cycles"]["maximum"] == 100000


def test_failures_offer_machine_readable_profile_path_and_rule():
    with pytest.raises(ValidationError) as failure:
        validate("ClockConfiguration", {"signal": "CLK.OUT", "period_ns": 4294967296, "cycles": 1})
    issue = failure.value.issues[0]
    assert issue["code"] == "SCHEMA_MAXIMUM"
    assert issue["path"] == "/period_ns"
    assert issue["severity"] == "error"
    assert issue["profile"] == "transport"


@pytest.mark.parametrize("field", ["clock", "vector", "allocation"])
def test_nested_plan_fields_obey_protobuf_uint32_before_serialization(field):
    from test_lab_first import plan
    value = plan()
    if field == "clock":
        value["clock_config"] = {"signal": "CLK.OUT", "period_ns": 4294967296, "cycles": 1}
    elif field == "vector":
        value["test_vectors"] = [{"time_ns": 4294967296, "inputs": {"x": 0}}]
    else:
        value["instrument_allocations"] = [{"endpoint_id": "x", "instrument": "SCOPE", "channel": 4294967296}]
    with pytest.raises(ValidationError):
        validate("InstrumentationExecutionPlan", value)
    assert validate("InstrumentationExecutionPlan", value, profile="structural") == value


@pytest.mark.parametrize("name,field", [("InstrumentCapability", "channels"),
                                        ("GeneratorCapability", "channels")])
def test_capability_channel_counters_are_uint32(name, field):
    with pytest.raises(ValidationError):
        validate(name, {field: 4294967296, "runtime_reconfiguration_supported": False})


def test_overlay_preserves_boolean_schemas_and_rejects_unknown_profiles():
    from contracts.semantic_profiles import profile_schema
    assert profile_schema("anything", False, "transport") is False
    assert profile_schema("anything", True, "transport") is True
    with pytest.raises(ValueError, match="Unknown validation profile"):
        profile_schema("anything", {}, "typo")


def test_nonfinite_numbers_produce_plain_structured_validation_failures():
    with pytest.raises(ValidationError) as failure:
        validate("GeneratorCapability", {"channels": 1, "runtime_reconfiguration_supported": False,
                                          "offset_min_v": float("nan")})
    assert failure.value.issues[0]["code"] == "NONFINITE_NUMBER"
    assert failure.value.issues[0]["path"] == "/offset_min_v"


def test_memory_semantics_apply_at_the_named_registry_boundary():
    from contracts.registry import validate_contract
    with pytest.raises(ValidationError) as failure:
        validate_contract("MemoryImage", {"version": "1.0", "word_bits": 8, "depth": 2, "data": [0]})
    assert failure.value.issues[0]["code"] == "MEMORY_DEPTH_MISMATCH"
    assert failure.value.issues[0]["path"] == "/data"


def test_shared_fixture_corpus_covers_structural_and_semantic_boundaries():
    corpus = json.loads((ROOT / "contracts/fixtures/conformance.json").read_text(encoding="utf-8"))
    assert corpus["version"] == "1.0"
    assert len(corpus["cases"]) >= 25
    for case in corpus["cases"]:
        value = deepcopy(case["value"])
        if case["valid"]:
            result = validate(case["contract"], value, profile=case["profile"])
            assert result == value, case["id"]
            if isinstance(value, dict):
                assert result is not value
        else:
            with pytest.raises(ValidationError) as failure:
                validate(case["contract"], value, profile=case["profile"])
            issue = failure.value.issues[0]
            assert issue["profile"] == case["profile"], case["id"]
            if "issue" in case:
                assert issue["code"] == case["issue"]["code"], case["id"]
                assert issue["path"] == case["issue"]["path"], case["id"]
