"""Stage 4 DB repository timing. Opt-in diagnostic with no acceptance thresholds."""
from contextlib import closing
from functools import cache
from hashlib import sha256
import json
from math import ceil
import os
from pathlib import Path
import sqlite3
import subprocess
from time import get_clock_info, perf_counter_ns, sleep
from uuid import uuid4

import psycopg
import pytest

from scripts.artifact_paths import artifact_directory
from tests.integration.native_hardware_gate_cases import harness
from tests.integration.native_remote_gate_cases import REFERENCE_SHA256, _select_reference
from tests.integration.native_remote_matrix_cases import _database, environment

ROOT = Path(__file__).resolve().parents[2]
DRIVER = Path(__file__).with_name("native_remote_db_driver.py")
NATIVE_TEST = ROOT / "native/tests/db_timing.rs"
TEST_ENTRY = b'\n[[test]]\nname = "db_timing"\npath = "native/tests/db_timing.rs"\n'
DB_CFG_ROOT = "native/src/db/readonly_tests.rs"
DB_CFG_TEST = "native/src/db/sqlite_writer_timing.rs"
DB_CFG_ENTRY = b'\n#[path = "sqlite_writer_timing.rs"]\nmod sqlite_writer_timing;\n'
WARMUP, SAMPLES = 10, 200
JOURNAL_ENV = ("CIRNET_SQLITE_ROLLBACK_JOURNAL", "NETCIRCUIT_SQLITE_ROLLBACK_JOURNAL")
ORDERS = (("B", "D"), ("D", "B"), ("B", "D"))


@cache
def owned_session():
    return artifact_directory()


def owned_file(name):
    path = Path(os.environ[name]).resolve(strict=True)
    assert path.is_relative_to(owned_session()) and path.is_file()
    return path


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def verify_product_source():
    candidate = owned_file("CIRNET_NATIVE_REMOTE_EXE")
    candidate_manifest = candidate.with_name("candidate.json")
    selected = json.loads(candidate_manifest.read_bytes())
    snapshot_path = candidate.with_name("source-after.json")
    assert digest(candidate) == selected["sha256"]
    assert digest(snapshot_path) == selected["source_inventory_sha256"]
    snapshot = json.loads(snapshot_path.read_bytes())["files"]

    audited = owned_file("CIRNET_STAGE4_DB_COMPONENT_SOURCE_AUDIT")
    assert digest(audited) == os.environ["CIRNET_STAGE4_DB_COMPONENT_SOURCE_AUDIT_SHA256"]
    inventory = json.loads(audited.read_bytes())
    assert inventory["candidate_sha256"] == selected["sha256"]
    compiled = {path: hashed for path, hashed in inventory["native_rust_source"].items()
                if path == "native/build.rs" or path.startswith("native/src/")}
    actual = {(ROOT / "native/build.rs").relative_to(ROOT).as_posix()}
    actual.update(path.relative_to(ROOT).as_posix() for path in (ROOT / "native/src").rglob("*.rs"))
    test_source = {}
    if DB_CFG_TEST in actual and DB_CFG_TEST not in compiled:
        assert actual - set(compiled) == {DB_CFG_TEST}
        cfg_file = ROOT / DB_CFG_ROOT
        cfg_bytes = cfg_file.read_bytes()
        assert cfg_bytes.endswith(DB_CFG_ENTRY)
        assert sha256(cfg_bytes[:-len(DB_CFG_ENTRY)]).hexdigest() == compiled[DB_CFG_ROOT]
        test_source = {DB_CFG_ROOT: digest(cfg_file), DB_CFG_TEST: digest(ROOT / DB_CFG_TEST)}
    else:
        assert set(compiled) == actual
    for path, hashed in compiled.items():
        if path != DB_CFG_ROOT or not test_source:
            assert digest(ROOT / path) == hashed, path
    manifest = (ROOT / "Cargo.toml").read_bytes()
    assert manifest.endswith(TEST_ENTRY)
    assert snapshot["Cargo.toml"] in {sha256(manifest).hexdigest(), sha256(manifest[:-len(TEST_ENTRY)]).hexdigest()}
    for filename in ("Cargo.lock", "rust-toolchain.toml"):
        assert digest(ROOT / filename) == snapshot[filename]

    return {
        "release_candidate_sha256": selected["sha256"], "release_manifest_sha256": digest(candidate_manifest),
        "source_audit_sha256": digest(audited), "release_product_source_sha256": inventory["corrected_product_source_sha256"],
        "component_manifest_sha256": sha256(manifest).hexdigest(), "lock_sha256": snapshot["Cargo.lock"],
        "additional_cfg_test_source_sha256": test_source,
    }


def verify_build():
    source = verify_product_source()
    build_path = owned_file("CIRNET_STAGE4_DB_COMPONENT_BUILD_RECEIPT")
    build = json.loads(build_path.read_text(encoding="utf-8-sig"))
    executable = owned_file("CIRNET_STAGE4_DB_COMPONENT_EXE")
    assert build["executable_sha256"] == digest(executable)
    assert build["test_source_sha256"] == digest(NATIVE_TEST)
    assert build["manifest_sha256"] == source["component_manifest_sha256"]
    assert build["lock_sha256"] == source["lock_sha256"]
    assert build["source_audit_sha256"] == source["source_audit_sha256"]
    assert build["additional_cfg_test_source_sha256"] == source["additional_cfg_test_source_sha256"]
    assert build["command"] == "cargo +1.90.0 test --release --locked --offline --test db_timing --no-run --message-format=json"
    return executable, {
        **source,
        "component_build_receipt_sha256": digest(build_path),
        "component_executable_sha256": digest(executable), "component_test_sha256": digest(NATIVE_TEST),
        "driver_sha256": digest(DRIVER), "harness_sha256": digest(Path(__file__)),
        "reference_manifest_sha256": REFERENCE_SHA256,
    }


def fixture():
    _, graph, configuration, vectors, _ = harness._workloads()[0]
    base = {"schema_version": "1.0", "circuit_id": graph["circuit_id"], "station_id": "virtual-station-01",
            "mode": "simulation", "state": "COMPLETE", "state_history": ["CREATED", "COMPLETE"],
            "revision": 1, "capture": None, "assignment_id": None, "error_code": None,
            "queue_position": None, "lease_expires_at": None, "_circuit_graph": graph,
            "_configuration": {"capture_config": configuration, "test_vectors": vectors}}
    owner, session, client = "db-profile-owner", "db-profile-session", "db-profile-client"
    return {
        "owner": owner, "session": session, "client": client, "history_count": 2000, "active_count": 8,
        "warmup": WARMUP, "samples": SAMPLES, "read_payload": {**base, "experiment_id": "db-read"},
        "update_payload": {**base, "experiment_id": "db-write", "state": "CREATED",
                           "state_history": ["CREATED"], "revision": 0},
        "active_rows": [{"experiment_id": "active-00", "owner_id": owner,
                         "control_session_id": session, "control_client_id": client}],
    }


def ensure_owned_postgres():
    state = json.loads(owned_file("CIRNET_REMOTE_PG_STATE").read_bytes())
    assert state["host"] in {"127.0.0.1", "::1"}
    assert 0 < int(state["port"]) <= 65535
    password_path = Path(state["password_file"]).resolve(strict=True)
    assert password_path.is_relative_to(owned_session()) and password_path.is_file()


def await_template_idle(source, database):
    # An owned source can get an autovacuum worker after bulk seeding. Preserve
    # the shared clone guard and wait only before either timed lane starts.
    assert database.startswith("stage4_http_")
    dsn = source.replace("postgresql+psycopg://", "postgresql://", 1)
    started = perf_counter_ns()
    observed = set()
    with psycopg.connect(dsn, dbname="postgres", autocommit=True, connect_timeout=5,
                         options="-c statement_timeout=5000") as db:
        while True:
            rows = db.execute(
                "SELECT pid, backend_type FROM pg_stat_activity WHERE datname=%s ORDER BY pid", (database,),
            ).fetchall()
            observed.update(rows)
            assert all(kind == "autovacuum worker" for _, kind in rows), "Unexpected connection on the owned template."
            if not rows:
                break
            assert perf_counter_ns() - started < 5_000_000_000, "The owned template stayed busy."
            sleep(.05)
    return {"wait_ns": perf_counter_ns() - started,
            "observed_workers": [{"pid": pid, "backend_type": kind} for pid, kind in sorted(observed)]}


def run(command, lane, url, spec, contracts):
    env = {**environment(lane, url), "CIRNET_CONTRACTS_ROOT": str(contracts),
           "CIRNET_ARTIFACTS_SESSION": str(owned_session()),
           "CIRNET_STAGE4_DB_COMPONENT_LANE": str(lane), "CIRNET_STAGE4_DB_COMPONENT_SPEC": str(spec)}
    for variable in JOURNAL_ENV:
        env.pop(variable, None)
    started = perf_counter_ns()
    with (lane / "driver.log").open("xb") as log:
        process = subprocess.run(command, cwd=lane, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=75,
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    assert process.returncode == 0, f"Inspect {lane / 'driver.log'}"
    return perf_counter_ns() - started


def database_readback(url, spec, expected_revision):
    if url.startswith("sqlite:///"):
        path = Path(url.removeprefix("sqlite:///")).resolve(strict=True)
        db = sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)
    else:
        db = psycopg.connect(url.replace("postgresql+psycopg://", "postgresql://", 1),
                             autocommit=True, connect_timeout=5, options="-c statement_timeout=5000")
    with closing(db):
        count = spec["history_count"] + spec["active_count"] + 2
        assert db.execute("SELECT COUNT(*) FROM lab_experiments").fetchone() == (count,)
        assert db.execute("SELECT COUNT(*) FROM lab_experiment_runtime").fetchone() == (count,)
        assert db.execute("SELECT COUNT(*) FROM lab_experiment_runtime WHERE active=TRUE").fetchone() == (spec["active_count"],)
        assert db.execute("SELECT COUNT(*) FROM lab_leases").fetchone() == (0,)
        assert db.execute("SELECT COUNT(*) FROM lab_captures").fetchone() == (0,)
        owner, payload, state, active, sequence = db.execute(
            "SELECT e.owner_id,e.payload,r.state,r.active,r.queue_sequence FROM lab_experiments e "
            "JOIN lab_experiment_runtime r ON r.experiment_id=e.experiment_id WHERE e.experiment_id='db-write'",
        ).fetchone()
        if isinstance(payload, str):
            payload = json.loads(payload)
        assert (owner, state, active, sequence) == (spec["owner"], "CREATED", False, 0)
        assert payload == {**spec["update_payload"], "revision": expected_revision}
    return payload


def summarize(rows):
    result = {}
    assert set(rows["observations"]) == {"snapshot", "active_page", "update"}
    for name, samples in rows["observations"].items():
        assert len(samples) == SAMPLES
        keys = set(samples[0])
        assert all(set(sample) == keys for sample in samples)
        phases = {}
        for key in sorted(keys):
            values = sorted(sample[key] for sample in samples)
            assert all(isinstance(value, int) and value >= 0 for value in values)
            phases[key] = {f"p{percentile}_ns": values[ceil(percentile * len(values) / 100) - 1]
                           for percentile in (50, 95, 99)}
        result[name] = {"count": len(samples), "phases": phases}
    return result


@pytest.mark.parametrize("backend", ["sqlite", "postgres"])
def test_stage4_database_component_pair(backend):
    if os.environ.get("CIRNET_STAGE4_DB_COMPONENT_RUN") != "diagnostic":
        pytest.skip("Explicitly select the DB-only diagnostic.")
    if os.environ.get("CIRNET_STAGE4_DB_COMPONENT_BACKEND", backend) != backend:
        pytest.skip("Other database runs in a separate diagnostic lane.")
    if backend == "postgres":
        ensure_owned_postgres()
    root = artifact_directory(f"native-remote-db-component/{backend}-{uuid4().hex}")
    print(f"Stage 4 DB-only diagnostic {backend}: {root}", flush=True)
    native, provenance = verify_build()
    python, _, _, contracts = _select_reference(root)
    spec = fixture()
    spec_path = root / "fixture.json"
    spec_path.write_text(json.dumps(spec, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    source, copy, names = _database(root, backend)
    seed_ns = run([str(python), "-I", "-B", str(DRIVER), "seed"], root, source, spec_path, contracts)

    blocks = []
    for number, order in enumerate(ORDERS, 1):
        block = {"block": number, "order": order, "results": {}}
        # Prepare both clones before either timed process starts.
        lanes = {}
        for side in order:
            if backend == "postgres":
                block.setdefault("template_clone_wait", {})[side] = await_template_idle(source, names["seed"])
            lanes[side] = copy(f"{number}-{side}")
        for side in order:
            lane, url = lanes[side]
            database_readback(url, spec, 0)
            print(f"Stage 4 DB-only {backend} {number}/{len(ORDERS)} {side}", flush=True)
            command = ([str(python), "-I", "-B", str(DRIVER), "measure"] if side == "B" else
                       [str(native), "--ignored", "--exact", "stage4_database_component_timing", "--nocapture"])
            process_ns = run(command, lane, url, spec_path, contracts)
            rows = json.loads((lane / "samples.json").read_bytes())
            assert rows["backend"] == backend
            assert rows["read_payload"] == spec["read_payload"] and rows["active_rows"] == spec["active_rows"]
            assert rows["final_payload"] == database_readback(url, spec, WARMUP + SAMPLES)
            block["results"][side] = {
                "configuration": rows["config"], "configuration_scope": rows["config_scope"],
                "driver_versions": rows.get("driver_versions", {"rust": "1.90.0", "sqlx": "0.8.6"}),
                "raw_samples_sha256": digest(lane / "samples.json"), "process_wall_ns": process_ns,
                "operations": summarize(rows),
            }
        baseline, candidate = (block["results"][side] for side in ("B", "D"))
        first = baseline["configuration"].copy()
        second = candidate["configuration"].copy()
        if backend == "sqlite":
            assert first.pop("sqlite_version") and second.pop("sqlite_version")
            assert first == second == {"journal_mode": "delete", "synchronous": 2, "foreign_keys": 1}
        else:
            assert first == second
        block["paired_total_d_over_b"] = {}
        for name in ("snapshot", "active_page", "update"):
            a = baseline["operations"][name]["phases"]["total_ns"]
            b = candidate["operations"][name]["phases"]["total_ns"]
            block["paired_total_d_over_b"][name] = {metric: b[metric] / a[metric] for metric in a}
        blocks.append(block)

    ranges = {side: {name: {} for name in ("snapshot", "active_page", "update")} for side in ("B", "D")}
    for side, cases in ranges.items():
        for name, values in cases.items():
            for metric in ("p95_ns", "p99_ns"):
                window = [block["results"][side]["operations"][name]["phases"]["total_ns"][metric] for block in blocks]
                values[metric] = [min(window), max(window)]
    (root / "comparison.json").write_text(json.dumps({
        "status": "DIAGNOSTIC", "backend": backend, "purpose": "repository component timing",
        "http_service_db_spans": "NOT RUN", "formal_gate": "NOT RUN", "thresholds": None,
        "provenance": provenance, "fixture_sha256": digest(spec_path), "seed_receipt_sha256": digest(root / "seed.json"),
        "warmup_per_operation": WARMUP, "samples_per_operation_per_block": SAMPLES, "blocks": blocks,
        "per_side_total_latency_ranges": ranges,
        "database_names": names, "seed_process_wall_ns": seed_ns,
        "clock": {"python": get_clock_info("perf_counter").implementation, "rust": "std::time::Instant"},
        "phase_scope": "Write totals are paired. Client lock, begin, operation and commit boundaries differ. "
                       "SQLAlchemy may begin implicitly during the operation, while SQLx sends explicit BEGIN. "
                       "The native path includes revision/generation CAS. Commit and pool return overhead may differ.",
        "conditions": "Single sequential caller on fresh copies of an identical Python-r8 fixture. "
                      "No HTTP, Hardware, scheduler, concurrent SQL load or capture bytes.",
    }, indent=2) + "\n", encoding="utf-8")
