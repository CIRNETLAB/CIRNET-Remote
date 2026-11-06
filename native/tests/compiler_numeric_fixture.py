"""Exact r8 numeric behavior for the pure native compiler regression."""
import json
from google.protobuf.json_format import ParseDict, ParseError
from contracts.generated import rpc_v2_pb2 as pb
from contracts.instrument_validation import validate_generator
from app.services.lab_compiler import LabExecutionCompiler
from app.services.verification import FunctionalVerificationService


cases = []


def case(kind, name, inputs, compute):
    try:
        result = {"value": compute(inputs)}
    except ParseError:
        result = {"error": "INVALID_CONFIGURATION"}
    except ValueError as error:
        result = {"error": str(error)}
    cases.append({"kind": kind, "name": name, "inputs": inputs, **result})


def wire_clock(value):
    clock = ParseDict(value, pb.ClockConfiguration())
    return {"signal": clock.signal, "period_ns": clock.period_ns, "cycles": clock.cycles}


for name, period, cycles in (
    ("integral-floats", 2.0, 1.0),
    ("u32-boundary-float", 4294967295.0, 1.0),
    ("fraction", 2.5, 1),
    ("outside-u32", 4294967296.0, 1),
    ("bool", 2, True),
):
    case("clock", name, {"signal": "CLK", "period_ns": period, "cycles": cycles}, wire_clock)


def generator(offset, channel=1.0, enabled=False):
    return {"channel": channel, "waveform": "SINE", "frequency_hz": 10.0,
            "amplitude_vpp": 1.0, "offset_v": offset, "enabled": enabled}


def limits(**optional):
    return {"channels": 2.0, "runtime_reconfiguration_supported": False, **optional}


def validate_generator_case(inputs):
    validate_generator(inputs["config"], inputs["capability"])
    return True


for name, configuration, capability in (
    ("integral-float-channel", generator(0), limits()),
    ("channel-over-limit", generator(0, 2.0), limits(channels=1)),
    ("mixed-upper-limit-2pow53", generator(9007199254740993), limits(offset_max_v=9007199254740992.0)),
    ("mixed-lower-limit-2pow53", generator(-9007199254740993), limits(offset_min_v=-9007199254740992.0)),
    ("float-below-integer-limit", generator(9007199254740992.0), limits(offset_min_v=9007199254740993)),
    ("integer-beyond-u64", generator(2**96 + 1), limits(offset_max_v=float(2**96))),
    ("integer-at-large-float-limit", generator(2**96), limits(offset_max_v=float(2**96))),
    ("integer-vs-integer-limit", generator(9007199254740993), limits(offset_max_v=9007199254740992)),
    ("negative-fraction-reject", generator(0), limits(offset_max_v=-0.25)),
    ("positive-fraction-accept", generator(0), limits(offset_max_v=0.25)),
):
    case("generator", name, {"config": configuration, "capability": capability}, validate_generator_case)


def plan(inputs):
    return LabExecutionCompiler().compile(inputs["experiment"], inputs["assignment"], inputs["caps"])


def prepare(inputs):
    message = ParseDict(plan(inputs), pb.InstrumentationExecutionPlan())
    return {
        "clock": {"signal": message.clock_config.signal, "period_ns": message.clock_config.period_ns,
                  "cycles": message.clock_config.cycles},
        "capture": {"duration_ns": message.capture_config.duration_ns, "max_events": message.capture_config.max_events},
        "generators": [g.channel for g in message.generator_config],
        "vectors": [{"time_ns": vector.time_ns, "inputs": dict(vector.inputs)} for vector in message.test_vectors],
    }


caps = {"mode": "simulation", "hardware_profile_version": "profile-1", "routing_resources": [],
        "instrument_capabilities": {name: limits() for name in ("logic_analyzer", "oscilloscope", "generator")}}
experiment = {"experiment_id": "e", "station_id": "s", "_configuration": {
    "clock_config": {"signal": "CLK", "period_ns": 2.0, "cycles": 1.0},
    "capture_config": {"signals": ["Y"], "duration_ns": 1000.0, "max_events": 2.0},
    "generator_config": [generator(0)],
    "test_vectors": [{"time_ns": 4294967295.0, "inputs": {"A": 1.0}}],
}}
endpoint = {"endpoint_id": "probe", "role": "LOGIC_ANALYZER", "design_port": "U1.Y", "channel": 1}
plan_args = {"experiment": experiment, "caps": caps, "assignment": {"lab_endpoints": [endpoint]}}
case("compile", "float-capability-typed-allocation", plan_args, plan)
case("prepare", "full-protobuf-integer-projection", plan_args, prepare)
case("compile", "float-allocation-remains-rejected",
     {**plan_args, "assignment": {"lab_endpoints": [{**endpoint, "channel": 1.0}]}}, plan)


def verify(inputs):
    return FunctionalVerificationService().verify(inputs["assignment"], inputs["capture"], inputs["vectors"])


assignment = {"expected_behavior": {
    "truth_table": [{"inputs": {"A": 1}, "outputs": {"Y": 1}}, {"inputs": {"A": 0.0}, "outputs": {"Y": 0.0}}],
    "expected_signals": [{"signal": "Y", "time_ns": 0.0, "value": 1}],
}}
samples = [{"signal": "Y", "time_ns": 0, "value": 0}, {"signal": "Y", "time_ns": 0.0, "value": 1.0},
           {"signal": "Y", "time_ns": 4, "value": 0.0}]
for name, duration, later_time in (
    ("equal-timestamp-prefers-computed-float", 2, 3.0),
    ("equal-timestamp-prefers-computed-integer", 2.0, 3),
    ("float-duration-last-episode", 5.0, 4),
):
    case("functional", name, {
        "assignment": assignment, "capture": {"available": True, "duration_ns": duration, "samples": samples},
        "vectors": [{"time_ns": 0, "inputs": {"A": 0}}, {"time_ns": 0.0, "inputs": {"A": 1.0}},
                    {"time_ns": later_time, "inputs": {"A": 0}}],
    }, verify)
case("functional", "maximum-sample-time-first-tie", {
    "assignment": assignment, "capture": {"available": True,
        "samples": [{"signal": "Y", "time_ns": 2.0, "value": 0}, {"signal": "Y", "time_ns": 2, "value": 1.0}]},
    "vectors": [{"time_ns": 0.0, "inputs": {"A": 1.0}}],
}, verify)

print(json.dumps(cases, ensure_ascii=False, separators=(",", ":")))
