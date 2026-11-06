"""Stage 4 paired loaded-Stop adapter for the approved Windows safety method."""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack, contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
from statistics import median
import subprocess
from threading import Lock
from time import get_clock_info, monotonic, perf_counter_ns, sleep
from uuid import uuid4

import psutil
import pytest

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics, Session, stop_owned_backend
from tests.integration import native_external_baseline_cases as harness
from tests.integration import native_hardware_stop_cases as aligned
from tests.integration import native_stop_baseline_cases as stop
from tests.integration.native_hardware_gate_cases import matrix_services
from tests.integration.native_remote_gate_cases import READY, REFERENCE_SHA256, WORKER_SHA256, _select_reference


RUN_MODE = "CIRNET_NATIVE_REMOTE_STOP_RUN"
PROBE = "CIRNET_NATIVE_REMOTE_STOP_PROBE"
REMOTE_SHA = "CIRNET_NATIVE_REMOTE_STOP_SHA256"
RUN_COOLDOWN_NS = 1_010_000_000
RUN_COOLDOWN_DRIVER = "stage4-last-run-response-cooldown-v1"
SEED_DATABASE = r"""
import os
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository

settings = Settings()
repo = Repository(settings.database_url)
try:
    AuthService(repo, settings).bootstrap_admin(
        'e2e_admin', os.environ['CIRNET_BASELINE_ADMIN_PASSWORD'], 'Baseline Administrator',
    )
finally:
    repo.close()
"""


def _selected(directory):
    python, hardware, worker, contracts = _select_reference(directory)
    baseline = json.loads(Path(os.environ["CIRNET_NATIVE_STAGE3_CANDIDATE"]).read_bytes())
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    expected = os.environ[REMOTE_SHA]
    assert re.fullmatch(r"[0-9a-f]{64}", expected)
    assert sha256(native.read_bytes()).hexdigest() == expected
    return {
        "python": python, "executable": hardware, "worker": worker, "contracts": contracts,
        "reference_sha256": baseline["referenceSha256"], "manifest_sha256": REFERENCE_SHA256,
        "hardware_sha256": baseline["artifacts"]["Hardware"]["sha256"], "remote": native, "remote_sha256": expected,
    }


@contextmanager
def _rust_api(directory, environment, selected, *, probe):
    environment = {**environment, "CIRNET_REMOTE_READ_ONLY": "false",
                   "CIRNET_CONTRACTS_ROOT": str(selected["contracts"])}
    if probe:
        environment[PROBE] = "1"
    else:
        environment.pop(PROBE, None)
    assert not (directory / "baseline.sqlite").exists()
    with (directory / "seed.log").open("wb") as log:
        subprocess.run(
            [str(selected["python"]), "-I", "-B", "-c", SEED_DATABASE], cwd=directory,
            env=environment, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=60,
        )
    log_path = directory / "api.log"
    with log_path.open("wb") as log:
        child = subprocess.Popen(
            [str(selected["remote"]), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"],
            cwd=directory, env=environment, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        try:
            deadline = monotonic() + 60
            while child.poll() is None and monotonic() < deadline:
                match = READY.search(log_path.read_bytes())
                if match:
                    port = int(match.group(1))
                    assert 0 < port <= 65535
                    break
                sleep(.05)
            else:
                pytest.fail(f"Rust Remote readiness failed. Inspect {log_path}.")
            yield child, (port, child.pid)
        finally:
            stop_owned_backend(child, psutil)
    if probe:
        assert (directory / "stop-observations").is_dir()
        assert "Loaded Stop probe evidence write failed" not in log_path.read_text(encoding="utf-8")
    else:
        assert not (directory / "stop-observations").exists()


@contextmanager
def _services(directory, database_url, native, candidate, monkeypatch, *, start_rendezvous, probe=True):
    assert start_rendezvous
    original = harness._service
    with monkeypatch.context() as scope:
        scope.setenv(aligned.START_WAVE_ENV, "1")
        scope.setenv("CIRNET_SIM_CPP_WORKER", str(candidate["worker"]))
        scope.setenv("CIRNET_SIM_CPP_WORKER_SHA256", WORKER_SHA256)
        scope.delenv(PROBE, raising=False)
        if native:
            def service(role, path, environment, python):
                if role == "api":
                    return _rust_api(path, environment, candidate, probe=probe)
                return original(role, path, environment, python)
            scope.setattr(harness, "_service", service)
        # Both lanes select the same pinned Rust Hardware.
        with matrix_services(directory, database_url, True, candidate, scope,
                             service_probe=None if native else "stop") as lane:
            yield lane


def _native_trace(events):
    for entry in events:
        assert entry.get("clock") == aligned.STOP_INGRESS_CLOCK
        assert type(entry["at_ns"]) is int and entry["at_ns"] > 0
        if entry["event"] not in ("start-returned", "stop-ack"):
            assert entry["event"] in ("lease-released", "lease-quarantined")
            continue
        assert type(entry["sent_ns"]) is int and 0 < entry["sent_ns"] <= entry["at_ns"]
        metadata = entry["wire_metadata"]
        assert isinstance(metadata, list)
        assert all(isinstance(pair, list) and len(pair) == 2 and isinstance(pair[0], str) for pair in metadata)
        if entry["event"] == "start-returned":
            entry["hardware_start"] = aligned._decode_start_wave(metadata)
        else:
            assert entry["kind"] in ("stop", "run", "sweep", "recovery")
            assert type(entry["safe"]) is bool
            entry["hardware_ingress"] = aligned._decode_stop_ingress(metadata)
    return events



def _pace_run_waves(scope, evidence, *, clock=perf_counter_ns, wait=sleep):
    """Apply the existing owner rate interval before creating the next wave."""
    create_wave, run = aligned._create_wave, stop._run
    lock = Lock()
    completions = []

    def record_run(*args):
        result = run(*args)
        completed = clock()
        with lock:
            completions.append(completed)
        return result

    def create_after_cooldown(*args):
        # _finish_wave has awaited all four Run futures before the next Create.
        with lock:
            assert len(completions) in (0, stop.WORKERS)
            latest = max(completions, default=None)
            completions.clear()
        if latest is None:
            return create_wave(*args)
        eligible = latest + RUN_COOLDOWN_NS
        checked = clock()
        delay = eligible - checked
        if delay > 0:
            wait(delay / 1_000_000_000)
        started = clock()
        assert started >= eligible
        evidence.append({
            "prior_latest_run_response_ns": latest, "eligible_ns": eligible,
            "checked_ns": checked, "next_create_started_ns": started,
            "added_wait_ns": started - checked if delay > 0 else 0,
        })
        return create_wave(*args)

    scope.setattr(stop, "_run", record_run)
    scope.setattr(aligned, "_create_wave", create_after_cooldown)


def _scope(profile, required, windows, limits, diagnostic, failed_lanes):
    cap = 4 * required + 3
    qualification = {"B": [], "D": []}
    for side in qualification:
        for index in range(windows):
            row = profile[side][index] if index < len(profile[side]) else None
            reasons = Counter(item["rejected"] for item in row["rejected"]) if row else {}
            count = len(row["samples"]) if row else 0
            attempted = count + sum(reasons.values())
            assert attempted <= cap and count <= required
            status = (
                "FAIL" if (side, index) in failed_lanes else
                "NOT RUN" if row is None else "PASS" if count == required else "FAIL"
            )
            qualification[side].append({
                "window": index + 1, "status": status, "samples": count, "required": required,
                "attempts": attempted, "attempt_cap": cap, "rejected": dict(reasons),
                "warmups": len(row["warmups"]) if row else 0,
            })
    complete = all(row["status"] == "PASS" for rows in qualification.values() for row in rows)
    frozen, paired = {}, {}
    if complete:
        for field, percentiles in limits.items():
            for percentile, ceiling in percentiles.items():
                baseline, native = (
                    median(row["percentiles"][field][percentile] for row in profile[side])
                    for side in ("B", "D")
                )
                key = f"{field}.{percentile}"
                measurements = {"B_ms": baseline, "D_ms": native}
                frozen[key] = {**measurements, "maximum_ms": ceiling, "passed": native <= ceiling}
                paired[key] = {**measurements, "maximum_ms": 1.10 * baseline, "passed": native <= 1.10 * baseline}
    failed_safety = [name for name, result in frozen.items() if not result["passed"]]
    failed_paired = [name for name, result in paired.items() if not result["passed"]]
    status = "DIAGNOSTIC" if diagnostic else "PASS" if complete and not failed_safety and not failed_paired else "FAIL"
    safety_status = "DIAGNOSTIC" if diagnostic else "PASS" if complete and not failed_safety else "FAIL"
    paired_status = (
        "NOT RUN" if not complete else "DIAGNOSTIC" if diagnostic else "FAIL" if failed_paired else "PASS"
    )
    return {
        "status": status, "qualification": qualification, "qualification_complete": complete,
        "windows_safety_status": safety_status,
        "windows_safety_checks": frozen, "failed_safety_checks": failed_safety,
        "paired_performance": {"status": paired_status, "checks": paired, "failed_checks": failed_paired},
        "linux_performance": {"status": "NOT RUN", "thresholds": "TBD_BEFORE_ACCEPTANCE"},
    }

@pytest.mark.skipif(os.name != "nt", reason="Windows QPC and child pipe I/O evidence")
def test_stage4_native_remote_loaded_stop(monkeypatch):
    mode = os.environ.get(RUN_MODE)
    if mode is None:
        pytest.skip(f"Select {RUN_MODE}=diagnostic or formal explicitly.")
    assert mode in ("diagnostic", "formal")
    assert "QueryPerformanceCounter" in get_clock_info("perf_counter").implementation
    diagnostic = mode == "diagnostic"
    required, windows = (8, 1) if diagnostic else (100, 3)
    root = artifact_directory(f"native-remote-loaded-stop/{uuid4().hex}")
    print(f"Stage 4 loaded Stop ({mode}): {root}", flush=True)
    candidate = _selected(root)
    limits = stop._load_stop_limits(candidate["reference_sha256"])
    workload = stop._saturated_load()
    workload_hash = sha256(json.dumps(workload, sort_keys=True).encode()).hexdigest()
    assert workload_hash == stop.SATURATED_WORKLOAD_SHA256
    profiles = {"B": [], "D": []}
    pacing_by_lane = {}
    failed_lanes = set()
    original_events = stop._read_events

    def read_events(path):
        events = original_events(path)
        return _native_trace(events) if path.parent.parent.name.endswith("-D") else events

    try:
        with monkeypatch.context() as scope:
            scope.setattr(aligned, "_stop_services", _services)
            scope.setattr(stop, "_read_events", read_events)
            exhausted = False
            for window in range(windows):
                for side in (("B", "D") if window % 2 == 0 else ("D", "B")):
                    lane = root / f"{window + 1:02d}-{side}"
                    lane.mkdir()
                    print(f"Starting {lane.name}, window {window + 1}/{windows}", flush=True)
                    pacing = []
                    try:
                        with scope.context() as lane_scope:
                            _pace_run_waves(lane_scope, pacing)
                            row = aligned._measure(
                                lane, side == "D", candidate, lane_scope, workload, required,
                                diagnostic=diagnostic, idle_barrier=False, start_rendezvous=True,
                            )
                    except BaseException:
                        failed_lanes.add((side, window))
                        raise
                    finally:
                        (lane / "run-cooldown.json").write_text(json.dumps({
                            "driver": RUN_COOLDOWN_DRIVER, "clock": aligned.STOP_INGRESS_CLOCK,
                            "interval_ns": RUN_COOLDOWN_NS, "wave_boundaries": pacing,
                        }, indent=2) + "\n", encoding="utf-8")
                        pacing_by_lane[lane.name] = {
                            "boundaries": len(pacing),
                            "added_wait_ns": sum(boundary["added_wait_ns"] for boundary in pacing),
                        }
                    assert row["peer_capture_sha256"] == aligned.PEER_CAPTURE_SHA256
                    profiles[side].append(row)
                    if not diagnostic and len(row["samples"]) < required:
                        exhausted = True
                        break
                if exhausted:
                    break
    finally:
        summary = {
            **_scope(profiles, required, windows, limits, diagnostic, failed_lanes),
            "method": aligned.HARDWARE_RENDEZVOUS, "acceptance_scope": "stage4-loaded-stop-frozen-and-paired-v1",
            "workload_sha256": workload_hash, "reference_manifest_sha256": REFERENCE_SHA256,
            "stage0_thresholds_sha256": stop.STOP_THRESHOLDS_SHA256, "worker_sha256": WORKER_SHA256,
            "hardware_sha256": candidate["hardware_sha256"], "remote_sha256": candidate["remote_sha256"],
            "historical_harness_sha256": sha256(Path(aligned.__file__).read_bytes()).hexdigest(),
            "adapter_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
            "samples_required_per_side_per_window": required, "attempt_cap_per_window": 4 * required + 3,
            "windows_required_per_side": windows, "hardware_start_rendezvous": True,
            "idle_pre_dispatch_barrier": False,
            "run_cooldown": {
                "driver": RUN_COOLDOWN_DRIVER, "interval_ns": RUN_COOLDOWN_NS,
                "scope": "Between waves, before Create and all measured Stop boundaries.",
                "by_lane": pacing_by_lane,
            },
        }
        (root / "stop-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    assert sha256(candidate["remote"].read_bytes()).hexdigest() == candidate["remote_sha256"]
    assert summary["qualification_complete"], summary["qualification"]
    if not diagnostic:
        assert summary["status"] == "PASS", (
            summary["failed_safety_checks"], summary["paired_performance"]["failed_checks"]
        )


@pytest.mark.skipif(os.name != "nt", reason="Windows probe configuration")
def test_stage4_native_remote_stop_probe_semantic_equivalence(monkeypatch):
    if os.environ.get(RUN_MODE) != "diagnostic":
        pytest.skip("The probe comparison runs with the short diagnostic.")
    root = artifact_directory(f"native-remote-stop-probe-equivalence/{uuid4().hex}")
    print(f"Stage 4 probe semantic equivalence: {root}", flush=True)
    selected = _selected(root)
    workload = stop._saturated_load()
    workload_sha = sha256(json.dumps(workload, sort_keys=True).encode()).hexdigest()
    assert workload_sha == stop.SATURATED_WORKLOAD_SHA256
    receipts = {}
    for enabled in (False, True):
        lane = root / ("enabled" if enabled else "disabled")
        lane.mkdir()
        with (
            harness.baseline_database("sqlite", lane) as database,
            _services(lane, database, True, selected, monkeypatch, start_rendezvous=True, probe=enabled) as (url, _, _),
            ExitStack() as stack,
        ):
            pool = stack.enter_context(ThreadPoolExecutor(max_workers=stop.WORKERS))
            clients = []
            for _ in range(stop.WORKERS):
                client = Session(url, Metrics())
                stack.callback(client.close)
                session = client.request("session", "GET", "/api/auth/session").json()
                client.client.headers["X-CSRF-Token"] = session["csrf_token"]
                clients.append(client)
            entries = aligned._create_wave(pool, clients, workload)
            began = perf_counter_ns()
            runs = aligned._start_wave(pool, clients, entries)
            terminals = aligned._finish_wave(clients, entries, runs)
            finished = perf_counter_ns()
            observations = []
            for client, terminal in zip(clients, terminals, strict=True):
                assert terminal["error_code"] is None
                digest = aligned._verify_peer(client, terminal, warmup=True)
                observations.append({"states": terminal["state_history"], "sha256": digest,
                                     "samples": terminal["capture"]["sample_count"]})
            assert len(observations) == stop.WORKERS
            if enabled:
                traces = [_native_trace(stop._read_events(lane / "stop-observations" / identity))
                          for identity, _ in entries]
                assert aligned._start_wave_proof(
                    traces, [identity for identity, _ in entries], before_ns=finished, tick_ns=aligned._qpc_tick_ns(),
                )
                for trace in traces:
                    cleanup, = [event for event in trace if event["event"] == "stop-ack"]
                    release, = [event for event in trace if event["event"] == "lease-released"]
                    assert cleanup["kind"] == "run" and cleanup["safe"] and cleanup["at_ns"] <= release["at_ns"]
            receipts["enabled" if enabled else "disabled"] = {
                "execution_to_terminal_ns": finished - began, "observations": observations,
            }
    assert receipts["enabled"]["observations"] == receipts["disabled"]["observations"]
    assert sha256(selected["remote"].read_bytes()).hexdigest() == selected["remote_sha256"]
    (root / "comparison.json").write_text(json.dumps({
        "status": "PASS", "scope": "one four-Run wave per setting; timing exploratory",
        "method": aligned.HARDWARE_RENDEZVOUS, "workload_sha256": workload_sha,
        "candidate_sha256": selected["remote_sha256"], "results": receipts,
    }, indent=2) + "\n", encoding="utf-8")


def test_stage4_stop_receipt_preserves_frozen_scope_and_fails_underfilled_window():
    profile = {"samples": [{}] * 100, "rejected": [], "warmups": [],
               "percentiles": {field: {"p95_ms": 2.0, "p99_ms": 3.0} for field in stop.STOP_GATE_FIELDS}}
    limits = {field: {"p95_ms": 3.0, "p99_ms": 4.0} for field in stop.STOP_GATE_FIELDS}
    profiles = {"B": [profile] * 3, "D": [profile] * 2}
    failed = _scope(profiles, 100, 3, limits, False, set())
    assert failed["status"] == "FAIL" and failed["qualification"]["D"][2]["status"] == "NOT RUN"
    assert not failed["windows_safety_checks"] and failed["qualification"]["B"][0]["attempt_cap"] == 403
    profiles["D"].append(profile)
    clean = _scope(profiles, 100, 3, limits, False, set())
    assert clean["status"] == "PASS" and len(clean["windows_safety_checks"]) == 6
    assert clean["windows_safety_status"] == clean["paired_performance"]["status"] == "PASS"

    def changed(p95):
        return {**profile, "percentiles": {
            field: {"p95_ms": p95, "p99_ms": 3.0} for field in stop.STOP_GATE_FIELDS
        }}

    profiles["D"] = [changed(2.5)] * 3
    slower = _scope(profiles, 100, 3, limits, False, set())
    assert slower["status"] == "FAIL" and slower["windows_safety_status"] == "PASS"
    assert slower["paired_performance"]["status"] == "FAIL"
    assert len(slower["paired_performance"]["failed_checks"]) == 3
    diagnostic = _scope(profiles, 100, 3, limits, True, set())
    assert diagnostic["status"] == diagnostic["paired_performance"]["status"] == "DIAGNOSTIC"
    profiles["D"] = [changed(3.1)] * 3
    unsafe = _scope(profiles, 100, 3, limits, False, set())
    assert unsafe["status"] == "FAIL" and len(unsafe["failed_safety_checks"]) == 3


def test_stage4_stop_wire_metadata_uses_frozen_decoder_and_rejects_duplicates():
    identity = "1" * 32
    wave = "2" * 32
    stop_receipt = ["x-cirnet-stop-ingress", f"qpc-ns-v1:{identity}:120"]
    event = {"event": "stop-ack", "at_ns": 150, "clock": "qpc-ns-v1", "sent_ns": 100,
             "kind": "stop", "safe": True, "wire_metadata": [stop_receipt]}
    start = {"event": "start-returned", "at_ns": 155, "clock": "qpc-ns-v1", "sent_ns": 100,
             "start_wave_id": wave, "wire_metadata": [["x-cirnet-start-wave", f"qpc-ns-v1:{wave}:{identity}:110:115"]]}
    seen = _native_trace([event, start])
    assert seen[0]["hardware_ingress"] == {"experiment_id": identity, "entered_ns": 120}
    assert seen[1]["hardware_start"] == {"wave_id": wave, "experiment_id": identity,
                                           "entered_ns": 110, "released_ns": 115}
    event["wire_metadata"].append(stop_receipt)
    assert _native_trace([event])[0]["hardware_ingress"] is None


def test_stage4_run_cooldown_uses_latest_success_and_waits_only_if_needed(monkeypatch):
    now = 0
    created, sleeps, evidence = [], [], []

    def wait(seconds):
        nonlocal now
        delta = round(seconds * 1_000_000_000)
        sleeps.append(delta)
        now += delta

    def create(*args):
        created.append(now)
        return ["wave"]

    monkeypatch.setattr(aligned, "_create_wave", create)
    monkeypatch.setattr(stop, "_run", lambda *_: "experiment")
    with monkeypatch.context() as scope:
        _pace_run_waves(scope, evidence, clock=lambda: now, wait=wait)
        assert aligned._create_wave(None, None, None) == ["wave"]
        for end in (10_000_000, 25_000_000, 35_000_000, 120_000_000):
            now = end
            assert stop._run(None, None, None) == "experiment"
        now = 1_010_000_000
        assert aligned._create_wave(None, None, None) == ["wave"]
        assert created[-1] == 1_130_000_000
        assert sleeps == [120_000_000]
        for end in (1_140_000_000, 1_145_000_000, 1_160_000_000, 1_180_000_000):
            now = end
            assert stop._run(None, None, None) == "experiment"
        now = 2_300_000_000
        assert aligned._create_wave(None, None, None) == ["wave"]
        assert created == [0, 1_130_000_000, 2_300_000_000]
        assert sleeps == [120_000_000]
        assert evidence == [
            {"prior_latest_run_response_ns": 120_000_000, "eligible_ns": 1_130_000_000,
             "checked_ns": 1_010_000_000, "next_create_started_ns": 1_130_000_000,
             "added_wait_ns": 120_000_000},
            {"prior_latest_run_response_ns": 1_180_000_000, "eligible_ns": 2_190_000_000,
             "checked_ns": 2_300_000_000, "next_create_started_ns": 2_300_000_000,
             "added_wait_ns": 0},
        ]
