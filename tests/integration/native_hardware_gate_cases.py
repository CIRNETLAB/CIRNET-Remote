"""Stage 3 acceptance using exact Python transition wheels and Rust Hardware."""

from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tarfile import open as open_tar
from time import monotonic, perf_counter_ns, sleep
from uuid import uuid4

import psutil
import pytest

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics, Session, stop_owned_backend
from scripts.install_release import API_INSTALL_PROBE
from tests.integration import native_external_baseline_cases as harness
from tests.integration.native_cpp_pool_cases import (
    _compare_frozen_load,
    _load_frozen_thresholds,
    _physical_fixture,
    _selected_file,
    select_candidate,
)


READY = re.compile(rb"^CIRNET_HARDWARE_READY=127\.0\.0\.1:([1-9][0-9]{0,4})\r?$", re.MULTILINE)
CONTRACTS_SHA256 = "35c22067f497d68f6461c201dc164e7567ee641fbce66cc243da8567f3b69ec7"


@pytest.fixture
def selected(monkeypatch):
    baseline, worker = select_candidate(monkeypatch)
    assert baseline["artifacts"]["Worker"]["sha256"] == "c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf"
    path = Path(os.environ["CIRNET_NATIVE_STAGE3_CANDIDATE"])
    assert path.is_absolute()
    payload = path.read_bytes()
    candidate = json.loads(payload)
    assert candidate["schemaVersion"] == 1
    assert candidate["referenceSha256"] == baseline["referenceSha256"]
    assert candidate["workerSha256"] == baseline["artifacts"]["Worker"]["sha256"]
    assert candidate["baselineRemoteSha256"] == baseline["artifacts"]["Remote"]["sha256"]
    assert candidate["artifacts"]["Contracts"]["sha256"] == CONTRACTS_SHA256
    contracts_archive = _selected_file(candidate["artifacts"]["Contracts"])
    executable = _selected_file(candidate["artifacts"]["Hardware"])
    remote = _selected_file(candidate["artifacts"]["Remote"])
    owned = artifact_directory()
    contracts = Path(candidate["contractsRoot"]).resolve(strict=True)
    python = Path(os.environ["CIRNET_NATIVE_STAGE3_PYTHON"]).resolve(strict=True)
    assert contracts.is_relative_to(owned) and python.is_relative_to(owned)
    assert python != Path(sys.executable).resolve()
    with open_tar(contracts_archive, "r:gz") as archive:
        for member in archive:
            if not member.isfile():
                continue
            name = Path(member.name)
            assert name.parts[0] == "cirnet-contracts-native-0.1.2"
            target = contracts.joinpath(*name.parts[1:])
            assert target.resolve(strict=True).is_relative_to(contracts) and not target.is_symlink()
            assert target.read_bytes() == archive.extractfile(member).read(), member.name
    subprocess.run(
        [str(python), "-I", "-B", "-c", API_INSTALL_PROBE, str(remote), candidate["artifacts"]["Remote"]["sha256"]],
        check=True,
    )
    return {
        "executable": executable, "contracts": contracts, "python": python, "worker": worker,
        "manifest_sha256": sha256(payload).hexdigest(), "reference_sha256": baseline["referenceSha256"],
    }


@contextmanager
def native_service(directory, environment, candidate):
    environment = {
        **environment,
        "CIRNET_CONTRACTS_ROOT": str(candidate["contracts"]),
        "CIRNET_HARDWARE_PREVIEW": "true",
    }
    log_path = directory / "hardware.log"
    with log_path.open("wb") as log:
        child = subprocess.Popen(
            [str(candidate["executable"]), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"],
            cwd=directory, env=environment, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        try:
            deadline = monotonic() + 60
            while monotonic() < deadline and child.poll() is None:
                match = READY.search(log_path.read_bytes())
                if match:
                    port = int(match.group(1))
                    assert port <= 65535
                    break
                sleep(0.05)
            else:
                pytest.fail(f"Rust Hardware readiness failed. Inspect {log_path}.")
            yield child, (port, child.pid)
        finally:
            stop_owned_backend(child, psutil)


@contextmanager
def matrix_services(directory, database_url, native, candidate, monkeypatch, *, service_probe=None):
    original = harness._service
    with monkeypatch.context() as scope:
        scope.setenv("CIRNET_HARDWARE_PREVIEW", "true" if native else "false")
        scope.delenv("CIRNET_STAGE3_SERVICE_PROBE", raising=False)
        if service_probe is not None:
            scope.setenv("CIRNET_STAGE3_SERVICE_PROBE", service_probe)
            scope.setattr(harness, "MODULE", "tests.integration.native_hardware_gate_cases")
        if native:
            def service(role, path, env, python):
                if role == "hardware":
                    return native_service(path, env, candidate)
                return original(role, path, env, python)
            scope.setattr(harness, "_service", service)
        interpreter = str(candidate["python"]) if native else sys.executable
        with harness.baseline_services(directory, database_url, backend="cpp", python=interpreter) as stack:
            yield stack


def test_stage3_native_matrix_smoke(selected, monkeypatch):
    root = artifact_directory(f"native-hardware-smoke/{uuid4().hex}")
    results = []
    for native in (False, True):
        lane = root / ("rust" if native else "python")
        lane.mkdir()
        with harness.baseline_database("sqlite", lane) as database_url:
            with matrix_services(lane, database_url, native, selected, monkeypatch) as (url, _, _):
                client = Session(url, Metrics())
                try:
                    session = client.request("session", "GET", "/api/auth/session").json()
                    client.client.headers["X-CSRF-Token"] = session["csrf_token"]
                    capture_lengths = []
                    for index, case in enumerate(harness._workloads()):
                        if index:
                            sleep(1.05)
                        capture_lengths.append(harness.run_workload_job(client, *case[1:], case[0]))
                    _, graph, _, _, _ = _physical_fixture()
                    previews = [
                        client.request("preview", "POST", route, json=graph).json()
                        for route in ("/api/circuits/physical-preview", "/api/v2/circuits/physical-preview")
                    ]
                    stations = client.request("stations", "GET", "/api/stations").json()
                    results.append((capture_lengths, previews, stations))
                finally:
                    client.close()
    assert results[0] == results[1]
    (root / "comparison.json").write_text(
        json.dumps({"passed": True, "candidate": selected["manifest_sha256"],
                    "capture_bytes": results[1][0]}, indent=2), encoding="utf-8",
    )
    print(f"Stage 3 matrix smoke: {root}")


def test_stage3_rollback(selected, monkeypatch):
    from app.services.persistence import Repository

    root = artifact_directory(f"native-hardware-rollback/{uuid4().hex}")
    workload, graph, configuration, vectors, expected = harness._workloads()[0]
    with harness.baseline_database("sqlite", root) as database_url:
        client = None
        try:
            with matrix_services(root, database_url, True, selected, monkeypatch) as (url, _, native_pids):
                client = Session(url, Metrics())
                session = client.request("session", "GET", "/api/auth/session").json()
                client.client.headers["X-CSRF-Token"] = session["csrf_token"]
                harness.run_workload_job(client, graph, configuration, vectors, expected, workload)
                records = client.request("list", "GET", "/api/experiments").json()
                assert len(records) == 1
                before = records[0]
                assert before["state"] == "COMPLETE" and before["lease_expires_at"] is None
            assert all(not psutil.pid_exists(pid) for pid in native_pids)
            repository = Repository(database_url)
            try:
                assert not repository.leases()
            finally:
                repository.close()
            for filename in ("hardware.log", "api.log", "api.port"):
                path = root / filename
                path.rename(path.with_suffix(path.suffix + ".rust"))
            with matrix_services(root, database_url, False, selected, monkeypatch, service_probe="resume") as (url, _, python_pids):
                client.client.base_url = url
                after = client.request("list", "GET", "/api/experiments").json()
                assert after == [before]
                payload = client.request("capture", "GET", before["capture"]["payload_ref"])
                assert sha256(payload.content).hexdigest() == expected
                harness.run_workload_job(client, graph, configuration, vectors, expected, workload)
            assert all(not psutil.pid_exists(pid) for pid in python_pids)
        finally:
            if client is not None:
                client.close()
    (root / "comparison.json").write_text(
        json.dumps({"passed": True, "candidate": selected["manifest_sha256"],
                    "capture_sha256": expected, "old_pids": native_pids, "rollback_pids": python_pids}, indent=2),
        encoding="utf-8",
    )
    print(f"Stage 3 rollback: {root}")


@pytest.mark.parametrize("database", ("sqlite", "postgresql"))
def test_stage3_paired_service_load(database, selected, monkeypatch):
    repetitions = 25
    configuration, workload_sha256 = harness.fixed_profile_configuration(repetitions)
    thresholds = _load_frozen_thresholds(
        Path(os.environ["CIRNET_NATIVE_STAGE0_REFERENCE"]), selected["reference_sha256"],
        database, configuration, workload_sha256,
    )
    root = artifact_directory(f"native-hardware-services/{database}-{uuid4().hex}")
    print(f"Stage 3 service profiles: {root}", flush=True)
    profiles = {"legacy": [], "cpp": []}
    for batch in range(3):
        for native in ((False, True) if batch % 2 == 0 else (True, False)):
            lane_label = f"{database} {batch + 1}/3 {'C' if native else 'B'}"
            print(f"Stage 3 service lane setup {lane_label}", flush=True)
            lane = root / f"{batch + 1}-{'rust' if native else 'python'}"
            lane.mkdir()
            metrics = Metrics()
            setup_started = perf_counter_ns()
            with harness.baseline_database(database, lane) as database_url:
                database_ready = perf_counter_ns()
                with matrix_services(lane, database_url, native, selected, monkeypatch) as (url, password, pids):
                    services_ready = perf_counter_ns()
                    with harness.benchmark_clients(database_url, url, password, metrics, 50) as clients:
                        clients_ready = perf_counter_ns()
                        print(f"Stage 3 service lane warmup/workload start {lane_label}", flush=True)
                        warmup_started = perf_counter_ns()
                        profile = harness._run_fixed_profile(clients, repetitions, metrics, pids)
                        workload_finished = perf_counter_ns()
            cleaned = perf_counter_ns()
            profile.update(
                database=database, backend="rust" if native else "python", batch=batch + 1,
                configuration=configuration, workload_sha256=workload_sha256,
                candidate_sha256=selected["manifest_sha256"],
                wall_timing_ns={
                    "database_and_window_setup": database_ready - setup_started,
                    "service_startup": services_ready - database_ready,
                    "client_setup": clients_ready - services_ready,
                    "warmup": profile["measurement_started_ns"] - warmup_started,
                    "measured_workload": round(profile["seconds"] * 1_000_000_000),
                    "cleanup": cleaned - workload_finished,
                },
            )
            (lane / "profile.json").write_text(json.dumps(profile, indent=2), encoding="utf-8")
            profiles["cpp" if native else "legacy"].append(profile)
            print(f"Stage 3 service lane complete {lane_label}", flush=True)
    checks = _compare_frozen_load(profiles, thresholds)
    for result in checks.values():
        maximum = result["bound"] == "maximum"
        paired_limit = result["legacy"] * (1.10 if maximum else 0.95)
        result["paired_limit"] = paired_limit
        result["passed_frozen"] = result["passed"]
        result["passed_paired"] = result["cpp"] <= paired_limit if maximum else result["cpp"] >= paired_limit
        result["passed"] = result["passed_frozen"] and result["passed_paired"]
    failed = [name for name, result in checks.items() if not result["passed"]]
    (root / "gate-load-summary.json").write_text(
        json.dumps({"database": database, "passed": not failed, "checks": checks,
                    "legacy": "Stage 1 Python Hardware with C++", "cpp": "Stage 3 Rust Hardware with C++"},
                   indent=2), encoding="utf-8",
    )
    assert not failed, failed


def serve_test_lane(role, directory):
    if role == "api":
        probe = os.environ["CIRNET_STAGE3_SERVICE_PROBE"]
        if probe == "resume":
            from app.services.auth import AuthError, AuthService

            bootstrap = AuthService.bootstrap_admin

            def bootstrap_or_resume(service, *args, **kwargs):
                try:
                    return bootstrap(service, *args, **kwargs)
                except AuthError as error:
                    if error.code != "BOOTSTRAP_ALREADY_COMPLETE":
                        raise

            AuthService.bootstrap_admin = bootstrap_or_resume
        elif probe == "stop":
            from tests.integration.native_hardware_stop_cases import install_start_barrier

            install_start_barrier(directory)
        else:
            raise ValueError("Unknown Stage 3 test service probe.")
    harness._serve(role, directory)


if __name__ == "__main__":
    serve_test_lane(sys.argv[1], Path(sys.argv[2]))
