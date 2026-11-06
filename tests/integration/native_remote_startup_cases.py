"""Verify process cleanup when startup fails after reserving recovered work."""
from contextlib import closing
from hashlib import sha256
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
from uuid import uuid4

import psutil

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import stop_owned_backend
from tests.integration.native_hardware_gate_cases import harness, native_service
from tests.integration.native_remote_gate_cases import (
    REFERENCE_SHA256, WORKER_SHA256, _environment, _select_reference,
)

SEED = """
from contextlib import closing
import json
import sys
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository

workload = json.load(sys.stdin)
config = Settings()
with closing(Repository(config.database_url)) as repo:
    auth = AuthService(repo, config)
    for position, identity in enumerate(('a-startup-reserved', 'b-startup-injected-failure'), 1):
        guest, _ = auth.ensure_session(None)
        repo.create_experiment(guest.owner_id, {
            'schema_version': '1.0', 'experiment_id': identity,
            'circuit_id': workload['graph']['circuit_id'], 'station_id': 'virtual-station-01',
            'mode': 'simulation', 'state': 'QUEUED', 'state_history': ['CREATED', 'QUEUED'],
            'revision': 1, 'queue_position': position, 'error_code': None, 'assignment_id': None,
            'lease_expires_at': None, 'capture': None, '_assignment_snapshot': None,
            '_queue_sequence': position, '_control_session_id': guest.session_id,
            '_circuit_graph': workload['graph'], '_capture_config': workload['configuration'],
            '_test_vectors': workload['vectors'],
        }, auth_session_id=guest.session_id, authorize_session=auth.require_principal_session)
"""
TRIGGERS = """
CREATE TABLE fixture_reservations (experiment_id TEXT NOT NULL, slot INTEGER NOT NULL);
CREATE TRIGGER fixture_record_first_reservation AFTER INSERT ON lab_leases
BEGIN INSERT INTO fixture_reservations VALUES (NEW.experiment_id, NEW.slot); END;
CREATE TRIGGER fixture_fail_second_queue_position BEFORE UPDATE OF payload ON lab_experiments
WHEN OLD.experiment_id = 'b-startup-injected-failure'
 AND json_extract(NEW.payload, '$.state') = 'QUEUED'
 AND json_extract(NEW.payload, '$.queue_position') = 1
BEGIN SELECT RAISE(ABORT, 'FIXTURE_STARTUP_QUEUE_POSITION_FAILURE'); END;
"""


def test_stage4_startup_error_drains_recovered_reservation():
    root = artifact_directory(f"stage4-startup-fault/{uuid4().hex}")
    print(f"Stage 4 startup cleanup: {root}", flush=True)
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    candidate_hash = sha256(native.read_bytes()).hexdigest()
    assert candidate_hash == os.environ["CIRNET_STAGE4_STARTUP_CANDIDATE_SHA256"]
    database = root / "legacy-recovery.sqlite"
    _, graph, config, vectors, _ = harness._workloads()[0]
    environment = _environment(root, database)
    seed = subprocess.run(
        [str(python), "-I", "-B", "-c", SEED], cwd=root, env=environment, capture_output=True,
        input=json.dumps({"graph": graph, "configuration": config, "vectors": vectors}).encode(),
        timeout=60,
    )
    (root / "seed.stderr.log").write_bytes(seed.stderr)
    assert seed.returncode == 0, "Cannot seed the owned Python reference database."
    with closing(sqlite3.connect(database)) as connection:
        assert connection.execute("SELECT COUNT(*) FROM lab_leases").fetchone() == (0,)
        connection.executescript(TRIGGERS)
        connection.commit()

    environment.update(
        CIRNET_REMOTE_READ_ONLY="false", CIRNET_CONTRACTS_ROOT=str(contracts),
        CIRNET_SIM_CPP_WORKER=str(worker), CIRNET_SIM_CPP_WORKER_SHA256=WORKER_SHA256,
        CIRNET_SIMULATION_BACKEND="cpp",
    )
    remote_log = root / "remote.log"
    with native_service(root, environment, {"executable": hardware, "contracts": contracts}) as (_, (port, pid)):
        hardware_process = psutil.Process(pid)
        environment["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{port}"
        command = [str(native), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"]
        with remote_log.open("wb") as log, subprocess.Popen(
            command, cwd=root, env=environment, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        ) as child:
            remote_process = psutil.Process(child.pid)
            try:
                exit_code = child.wait(timeout=20)
            except subprocess.TimeoutExpired:
                stop_owned_backend(child, psutil, graceful_seconds=1)
                raise
        assert not remote_process.is_running()
    assert not hardware_process.is_running()
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=.3):
            raise AssertionError("Owned Hardware listener survived.")
    except OSError:
        pass

    text = remote_log.read_text(encoding="utf-8")
    with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)) as connection:
        reservations = connection.execute(
            "SELECT experiment_id, slot FROM fixture_reservations",
        ).fetchall()
        records = {identity: json.loads(payload) for identity, payload in connection.execute(
            "SELECT experiment_id, payload FROM lab_experiments ORDER BY experiment_id",
        )}
        leases = connection.execute(
            "SELECT experiment_id, quarantined FROM lab_leases",
        ).fetchall()
    observed = {
        "candidate_sha256": candidate_hash, "reference_manifest_sha256": REFERENCE_SHA256,
        "hardware_sha256": sha256(hardware.read_bytes()).hexdigest(), "worker_sha256": WORKER_SHA256,
        "harness_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
        "seed_sql_sha256": sha256(TRIGGERS.encode()).hexdigest(),
        "process_exit": exit_code, "ready_marker": "CIRNET_REMOTE_READY" in text,
        "remote_log_sha256": sha256(remote_log.read_bytes()).hexdigest(),
        "recorded_reservations": reservations, "retained_leases": leases,
        "records": {identity: {key: row[key] for key in ("state", "state_history", "error_code",
                                                          "lease_expires_at")}
                    for identity, row in records.items()},
        "owned_processes_stopped": True,
        "scope": "after committed reservation and spawn, before startup success; no energization assertion",
    }
    (root / "observed.json").write_text(json.dumps(observed, indent=2) + "\n", encoding="utf-8")
    assert exit_code == 2 and not observed["ready_marker"]
    assert text.splitlines()[-1] == "Scheduler recovery failed"
    assert reservations == [("a-startup-reserved", 0)] and not leases
    assert len(records) == 2 and all(row["state"] == "COMPLETE" and
                                     row["lease_expires_at"] is None for row in records.values())
    assert "RESERVED" in records["a-startup-reserved"]["state_history"]
    assert "RESERVED" not in records["b-startup-injected-failure"]["state_history"]
