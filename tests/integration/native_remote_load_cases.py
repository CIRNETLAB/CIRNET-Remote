"""Opt-in Gate 4 fixed-load comparison; shared workload and frozen thresholds."""
from contextlib import contextmanager
import ctypes
from hashlib import sha256
import json
import os
from pathlib import Path
import platform
import sqlite3
from time import perf_counter_ns
from uuid import uuid4
from zipfile import ZipFile

import psutil
import pytest
from sqlalchemy.engine import make_url

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import Metrics
from tests.integration import native_external_baseline_cases as harness
from tests.integration.native_cpp_pool_cases import _load_frozen_thresholds, _compare_frozen_load
from tests.integration.native_hardware_gate_cases import matrix_services
from tests.integration.native_remote_cutover_cases import OwnedPostgres
from tests.integration.native_remote_gate_cases import WORKER_SHA256
from tests.integration.native_remote_stop_cases import _selected, _rust_api, PROBE
from tests.integration.native_hardware_stop_cases import START_WAVE_ENV


SQLITE_JOURNAL_ENV = ("CIRNET_SQLITE_ROLLBACK_JOURNAL", "NETCIRCUIT_SQLITE_ROLLBACK_JOURNAL")
PG_STATE = "CIRNET_NATIVE_REMOTE_LOAD_POSTGRES_STATE"
WORKER_SLOTS = 4


def _digest(path):
    return sha256(path.read_bytes()).hexdigest()


def _database_provenance(database):
    if database == "sqlite":
        return {
            "journal_mode": "delete", "synchronous": "full",
            "journal_environment_unset": list(SQLITE_JOURNAL_ENV),
            "client_sqlite_version": sqlite3.sqlite_version,
            "stage0_journal_recorded": False,
            "configuration": "Stage 4 default rollback journal, distinct from Stage 3 PERSIST",
        }
    postgres = OwnedPostgres(Path(os.environ[PG_STATE]))
    url = make_url(os.environ["CIRNET_TEST_POSTGRES_URL"])
    expected = (postgres.state["host"], postgres.state["port"], postgres.state["admin_user"], postgres.secret)
    if (url.drivername != "postgresql+psycopg" or not url.database or url.query
            or (url.host, url.port, url.username, url.password) != expected):
        raise ValueError("The load database URL must select the verified owned PostgreSQL cluster.")
    postgres.databases.add(url.database)
    with postgres.connect(url.database) as db:
        settings = dict(db.execute(
            """SELECT name, setting FROM pg_settings
               WHERE name IN ('server_version', 'fsync', 'synchronous_commit', 'full_page_writes',
                              'shared_buffers', 'max_connections', 'checkpoint_timeout', 'max_wal_size')"""
        ).fetchall())
    return {
        "server_sha256": postgres.state["server_sha256"].lower(),
        "server_settings": settings,
        "isolation": "fresh owned schema per lane",
        "schema_startup_settings": {"lock_timeout_ms": 5000, "statement_timeout_ms": 20000},
    }


def _sqlite_observer(directory):
    database = directory / "baseline.sqlite"
    connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
    try:
        journal, = connection.execute("PRAGMA journal_mode").fetchone()
        synchronous, = connection.execute("PRAGMA synchronous").fetchone()
    finally:
        connection.close()
    assert (journal, synchronous) == ("delete", 2)
    return {"journal_mode": journal, "synchronous": synchronous, "scope": "separate read-only connection"}


def _console_host_path():
    if os.name != "nt":
        return None
    system_directory = ctypes.create_unicode_buffer(32768)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    size = kernel.GetSystemDirectoryW(system_directory, len(system_directory))
    if not 0 < size < len(system_directory):
        raise RuntimeError("Cannot identify the Windows system console host.")
    return (Path(system_directory.value) / "conhost.exe").resolve(strict=True)


def _worker_inventory(pids, executable, console_host):
    api, hardware = pids
    workers, helpers = {}, {}
    for root in (api, hardware):
        for child in psutil.Process(root).children(recursive=True):
            image = Path(child.exe())
            # Windows can report system images rooted on the system volume without a drive letter.
            if console_host is not None and image.root and not image.drive:
                image = Path(console_host.drive + str(image))
            image = image.resolve(strict=True)
            parent = child.ppid()
            if image == executable:
                assert root == parent == hardware, "C++ worker must be a direct Hardware child."
                workers[child.pid] = child.create_time()
            else:
                assert image == console_host, f"Unexpected service descendant image: {image}"
                helpers[child.pid] = {"root_pid": root, "parent_pid": parent, "created_at": child.create_time()}
    # The frozen profile configures four slots and four warmup jobs; its lazy pool
    # may reuse a single child. It does not require four simultaneously busy workers.
    assert 1 <= len(workers) <= WORKER_SLOTS, f"Invalid pinned worker population: {len(workers)}."
    for helper in helpers.values():
        root, parent = helper["root_pid"], helper["parent_pid"]
        assert parent == root or root == hardware and parent in workers, "Unexpected console host parent."
    return {"process_births": workers, "console_hosts": helpers}


def _verify_worker_window(scope, worker, evidence):
    original = harness._monitor
    executable = worker.resolve(strict=True)
    console_host = _console_host_path()

    @contextmanager
    def monitor(pids, resources):
        # The shared profile enters its monitor after warmup and starts its clock inside it.
        assert _digest(executable) == WORKER_SHA256
        before = _worker_inventory(pids, executable, console_host)
        with original(pids, resources):
            yield
        assert _worker_inventory(pids, executable, console_host) == before
        assert resources["process_count"] == len(before["process_births"]) + 2 + len(before["console_hosts"])
        evidence.update(
            path=str(executable), sha256=WORKER_SHA256, configured_worker_slots=WORKER_SLOTS,
            warmed_workers=len(before["process_births"]), **before,
            console_host_path=str(console_host) if before["console_hosts"] else None,
        )

    scope.setattr(harness, "_monitor", monitor)


@contextmanager
def remote_services(directory, database_url, native, candidate, monkeypatch):
    original = harness._service
    with monkeypatch.context() as scope:
        scope.delenv(PROBE, raising=False)
        scope.delenv(START_WAVE_ENV, raising=False)
        for name in SQLITE_JOURNAL_ENV:
            scope.delenv(name, raising=False)
        if native:
            def service(role, path, environment, python):
                if role == "api":
                    return _rust_api(path, environment, candidate, probe=False)
                return original(role, path, environment, python)
            scope.setattr(harness, "_service", service)
        # Both sides use the exact same Rust Hardware and C++ worker.
        scope.setenv("CIRNET_SIM_CPP_WORKER", str(candidate["worker"]))
        scope.setenv("CIRNET_SIM_CPP_WORKER_SHA256", WORKER_SHA256)
        with matrix_services(directory, database_url, True, candidate, scope) as stack:
            yield stack


@pytest.mark.parametrize("database", ["sqlite", "postgresql"])
def test_stage4_paired_service_load(database, monkeypatch):
    mode = os.environ.get("CIRNET_NATIVE_REMOTE_LOAD_RUN")
    if mode is None:
        pytest.skip("Select CIRNET_NATIVE_REMOTE_LOAD_RUN=diagnostic or formal.")
    assert mode in ("diagnostic", "formal")
    selected_backend = os.environ.get("CIRNET_NATIVE_REMOTE_LOAD_DATABASE")
    if selected_backend and selected_backend != database:
        pytest.skip("Other backend runs in its own timing lane.")
    formal = mode == "formal"
    repetitions, windows = (25, 3) if formal else (1, 1)
    root = artifact_directory(f"native-remote-load/{database}-{mode}-{uuid4().hex}")
    print(f"Stage 4 service load {database}/{mode}: {root}", flush=True)
    candidate = _selected(root)
    configuration, workload_sha256 = harness.fixed_profile_configuration(repetitions)
    archive = Path(os.environ["CIRNET_NATIVE_STAGE0_REFERENCE"])
    frozen_configuration, frozen_workload = harness.fixed_profile_configuration(25)
    thresholds = _load_frozen_thresholds(archive, candidate["reference_sha256"], database,
                                         frozen_configuration, frozen_workload)
    reference = json.loads(Path(os.environ["CIRNET_NATIVE_STAGE3_CANDIDATE"]).read_bytes())
    with ZipFile(archive) as frozen:
        thresholds_sha256 = sha256(frozen.read("performance/thresholds.json")).hexdigest()
    provenance = {
        "stage0_archive_sha256": _digest(archive), "stage0_thresholds_sha256": thresholds_sha256,
        "stage0_release_sha256": candidate["reference_sha256"],
        "reference_manifest_sha256": candidate["manifest_sha256"],
        "reference_remote_wheel_sha256": reference["artifacts"]["Remote"]["sha256"],
        "reference_python_sha256": _digest(candidate["python"]),
        "contracts_archive_sha256": reference["artifacts"]["Contracts"]["sha256"],
        "hardware_sha256": candidate["hardware_sha256"], "worker_sha256": WORKER_SHA256,
        "backend": _database_provenance(database),
    }
    profiles = {"legacy": [], "cpp": []}
    host = {"platform": platform.platform(), "processor": platform.processor(),
        "logical_cpus": psutil.cpu_count(), "physical_cpus": psutil.cpu_count(logical=False),
        "ram_bytes": psutil.virtual_memory().total, "python": platform.python_version()}
    started = perf_counter_ns()
    completed = False
    try:
        for batch in range(windows):
            for native in ((False, True) if batch % 2 == 0 else (True, False)):
                side = "D" if native else "B"
                lane = root / f"{batch + 1}-{side}"
                lane.mkdir()
                metrics = Metrics()
                worker_evidence = {}
                setup_started = perf_counter_ns()
                print(f"Stage 4 load {database} {batch + 1}/{windows} {side} setup", flush=True)
                with harness.baseline_database(database, lane) as database_url:
                    database_ready = perf_counter_ns()
                    with remote_services(lane, database_url, native, candidate, monkeypatch) as (url, password, pids):
                        services_ready = perf_counter_ns()
                        sqlite_observer = _sqlite_observer(lane) if database == "sqlite" else None
                        database_check_finished = perf_counter_ns()
                        with harness.benchmark_clients(database_url, url, password, metrics, 50) as clients:
                            clients_ready = perf_counter_ns()
                            with monkeypatch.context() as scope:
                                _verify_worker_window(scope, candidate["worker"], worker_evidence)
                                profile = harness._run_fixed_profile(clients, repetitions, metrics, pids)
                            workload_finished = perf_counter_ns()
                cleaned = perf_counter_ns()
                profile.update(database=database, side=side, batch=batch + 1,
                    configuration=configuration, workload_sha256=workload_sha256, host=host,
                    candidate_sha256=candidate["remote_sha256"],
                    reference_manifest_sha256=candidate["manifest_sha256"],
                    hardware_sha256=candidate["hardware_sha256"],
                    worker_inventory=worker_evidence, sqlite_observer=sqlite_observer,
                    wall_timing_ns={
                        "database_setup": database_ready - setup_started,
                        "service_startup": services_ready - database_ready,
                        "database_check": database_check_finished - services_ready,
                        "client_setup": clients_ready - database_check_finished,
                        "warmup": profile["measurement_started_ns"] - clients_ready,
                        "measured_workload": round(profile["seconds"] * 1_000_000_000),
                        "cleanup": cleaned - workload_finished,
                    })
                (lane / "profile.json").write_text(json.dumps(profile, indent=2) + "\n", encoding="utf-8")
                profiles["cpp" if native else "legacy"].append(profile)
                print(f"Stage 4 load {database} {batch + 1}/{windows} {side} completed", flush=True)
        completed = True
    finally:
        checks = _compare_frozen_load(profiles, thresholds) if formal and completed else {}
        for result in checks.values():
            maximum = result["bound"] == "maximum"
            result["paired_limit"] = result["legacy"] * (1.10 if maximum else 0.95)
            result["passed_frozen"] = result["passed"]
            result["passed_paired"] = result["cpp"] <= result["paired_limit"] if maximum else result["cpp"] >= result["paired_limit"]
            result["passed"] = result["passed_frozen"] and result["passed_paired"]
        failed = [name for name, result in checks.items() if not result["passed"]]
        summary = {"status": ("PASS" if not failed else "FAIL") if formal and completed else
            "DIAGNOSTIC" if completed else "FAIL", "database": database,
            "host": host, "candidate_sha256": candidate["remote_sha256"],
            "checks": checks, "failed": failed, "completed_windows": {key: len(rows) for key, rows in profiles.items()},
            "windows_required_per_side": windows, "configuration": configuration, "workload_sha256": workload_sha256,
            "provenance": provenance,
            "harness_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
            "workload_harness_sha256": sha256(Path(harness.__file__).read_bytes()).hexdigest(),
            "wall_time_ns": perf_counter_ns() - started, "linux_production": "NOT RUN"}
        (root / "load-summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    assert sha256(candidate["remote"].read_bytes()).hexdigest() == candidate["remote_sha256"]
    if formal:
        assert summary["status"] == "PASS", failed
