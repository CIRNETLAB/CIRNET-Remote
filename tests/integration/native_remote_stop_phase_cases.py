"""Opt-in Stop phase proof. Formal causal evidence is handled separately."""
from hashlib import sha256
import json
import os
from uuid import uuid4

import pytest

from scripts.artifact_paths import artifact_directory
from tests.integration import native_hardware_stop_cases as aligned
from tests.integration import native_stop_baseline_cases as stop
from tests.integration.native_remote_stop_cases import _native_trace, _pace_run_waves, _selected, _services


PHASE_PROBE = "CIRNET_NATIVE_REMOTE_STOP_PHASES"
PHASE_TEST = "CIRNET_NATIVE_REMOTE_STOP_PHASE_TEST"
PHASE_FILENAME = "stop-phases.json"



@pytest.mark.skipif(os.name != "nt", reason="Windows QPC and child pipe I/O evidence")
def test_stage4_native_remote_stop_phase_opt_in_preserves_loaded_semantics(monkeypatch):
    if os.environ.get(PHASE_TEST) != "1":
        pytest.skip(f"Set {PHASE_TEST}=1 for the phase probe diagnostic.")
    root = artifact_directory(f"native-remote-stop-phase-semantics/{uuid4().hex}")
    print(f"Stage 4 Stop phase semantic equivalence: {root}", flush=True)
    candidate = _selected(root)
    workload = stop._saturated_load()
    workload_sha = sha256(json.dumps(workload, sort_keys=True).encode()).hexdigest()
    assert workload_sha == stop.SATURATED_WORKLOAD_SHA256
    original_events = stop._read_events

    def events(path):
        return _native_trace(original_events(path))

    rows = {}
    for enabled in (False, True):
        mode = "enabled" if enabled else "disabled"
        lane = root / mode
        lane.mkdir()
        with monkeypatch.context() as scope:
            scope.setenv(PHASE_PROBE, "1" if enabled else "0")
            scope.setattr(aligned, "_stop_services", _services)
            scope.setattr(stop, "_read_events", events)
            _pace_run_waves(scope, [])
            profile = aligned._measure(
                lane, True, candidate, scope, workload, 1,
                diagnostic=True, idle_barrier=False, start_rendezvous=True,
            )
        sample, = profile["samples"]
        proof = sample["capture_proof"]
        semantics = {"peer_captures": sorted(proof["peer_sha256"].values()),
                     "target_capture": proof["target_available"]}
        phase_path = lane / PHASE_FILENAME
        if enabled:
            phases = json.loads(phase_path.read_bytes())
            assert phases["clock"] == aligned.STOP_INGRESS_CLOCK
            assert phases["version"] == "stage4-explicit-stop-phases-v1"
            assert phases["discarded"] == 0
            record, = [record for record in phases["records"]
                       if record["experiment_id"] == sample["experiment_id"]]
            ack, = [entry for entry in sample["proof"]["acknowledgements"] if entry["kind"] == "stop"]
            started = sample["proof"]["http_started_ns"]
            marks = [started, record["started_ns"], ack["at_ns"],
                     *(record[field] for field in (
                         "post_ack_read_start_ns", "post_ack_read_end_ns", "command_returned_ns",
                         "snapshot_start_ns", "snapshot_end_ns", "operation_save_start_ns",
                         "operation_begin_returned_ns", "operation_cas_returned_ns",
                         "operation_commit_returned_ns", "response_constructed_ns",
                     )),
                     started + sample["http_ns"]]
            assert all(type(mark) is int and mark > 0 for mark in marks)
            assert marks == sorted(marks)
            phase_digest = sha256(phase_path.read_bytes()).hexdigest()
        else:
            assert not phase_path.exists()
            phase_digest = None
        rows[mode] = {"semantics": semantics, "phase_sha256": phase_digest}
    assert rows["enabled"]["semantics"] == rows["disabled"]["semantics"]
    assert sha256(candidate["remote"].read_bytes()).hexdigest() == candidate["remote_sha256"]
    (root / "comparison.json").write_text(json.dumps({
        "status": "PASS", "scope": "one qualified loaded Stop per phase setting",
        "method": aligned.HARDWARE_RENDEZVOUS, "workload_sha256": workload_sha,
        "candidate_sha256": candidate["remote_sha256"], "results": rows,
    }, indent=2) + "\n", encoding="utf-8")
