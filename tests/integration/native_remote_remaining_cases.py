"""Remaining actual HTTP groups on both supported native database backends."""
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest
from scripts.artifact_paths import artifact_directory
from tests.integration.native_remote_matrix_cases import _database, environment
from tests.integration.native_remote_gate_cases import (
    SEED, SERVE_REFERENCE, REFERENCE_SHA256, WORKER_SHA256,
    _select_reference, _http_service, _exercise,
)
from tests.integration.native_hardware_gate_cases import native_service


def station_observations(client, seed):
    result = {}
    for name, path, status in (
        ("list", "/api/stations", 200),
        ("virtual", "/api/stations/virtual-station-01/capabilities", 200),
        ("physical", "/api/stations/physical-station-01/capabilities", 200),
        ("virtual-queue", "/api/stations/virtual-station-01/queue", 200),
        ("physical-queue", "/api/stations/physical-station-01/queue", 200),
        ("unknown", "/api/stations/missing/capabilities", 404),
        ("unknown-queue", "/api/stations/missing/queue", 404),
        ("encoded-id", "/api/stations/virtual-station-%30%31/queue", 200),
    ):
        for actor in ("stage4_alice", "stage4_bob"):
            request_id = f"station:{name}:{actor}"
            response = client.get(path, headers={
                "Cookie": "cirnet_session=" + seed[actor]["token"],
                "X-Request-ID": request_id,
            })
            assert response.status_code == status, (name, response.status_code)
            assert response.headers["X-Request-ID"] == request_id
            assert response.headers["Cache-Control"] == "no-store"
            value = response.json()
            if status == 200 and path.endswith("/queue"):
                assert value["queued_count"] == 0 and value["own_positions"] == []
            if name == "list":
                assert [(item["station_id"], item["state"]) for item in value] == [
                    ("virtual-station-01", "ready"), ("physical-station-01", "unavailable")]
            result[f"{name}:{actor}"] = {"status": status, "body": value}
    for path in ("/api/stations", "/api/stations/virtual-station-01/capabilities",
                 "/api/stations/virtual-station-01/queue"):
        response = client.get(path, headers={"X-Request-ID": "station:anonymous"})
        assert response.status_code == 401
        result["anonymous:" + path] = response.json()
    return result


@pytest.mark.parametrize("backend", ["sqlite", "postgres"])
@pytest.mark.parametrize("group", ["reads", "stations"])
def test_stage4_remaining_database_http_groups(backend, group):
    selected = os.environ.get("CIRNET_STAGE4_MATRIX_BACKEND")
    if selected and selected != backend:
        pytest.skip("Other backend runs in its own lane.")
    root = artifact_directory(f"native-remote-remaining/{backend}-{group}-{uuid4().hex}")
    print(f"Stage 4 remaining HTTP {backend}/{group}: {root}", flush=True)
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    digest = sha256(native.read_bytes()).hexdigest()
    url, copy, databases = _database(root, backend)
    seeded = subprocess.run([str(python), "-I", "-B", "-c", SEED],
        cwd=root, env=environment(root, url), capture_output=True, timeout=60)
    (root / "seed.stderr.log").write_bytes(seeded.stderr)
    assert seeded.returncode == 0
    seed = json.loads(seeded.stdout)
    graph = json.loads((Path(seed["contracts"]) /
        "circuit-schema/examples/physical-hc08-led.json").read_bytes())
    observations = {}
    for label, is_native in (("python", False), ("rust", True)):
        lane, url = copy(label)
        env = {**environment(lane, url), "CIRNET_CONTRACTS_ROOT": str(contracts),
            "CIRNET_SIM_CPP_WORKER": str(worker), "CIRNET_SIM_CPP_WORKER_SHA256": WORKER_SHA256,
            "CIRNET_SIMULATION_BACKEND": "cpp"}
        with native_service(lane, env, {"executable": hardware, "contracts": contracts}) as (_, (port, _)):
            env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{port}"
            command = [str(native), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"] if is_native else [
                str(python), "-I", "-B", "-c", SERVE_REFERENCE]
            with _http_service(command, lane, env) as client:
                observations[label] = _exercise(client, seed, graph) if group == "reads" else station_observations(client, seed)
        (lane / "observations.json").write_text(json.dumps(observations[label], indent=2) + "\n", encoding="utf-8")
    same = observations["python"] == observations["rust"]
    (root / "comparison.json").write_text(json.dumps({
        "status": "PASS" if same else "FAIL", "backend": backend, "group": group,
        "candidate_sha256": digest, "reference_manifest_sha256": REFERENCE_SHA256,
        "harness_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
        "read_exercise_sha256": sha256(Path(__import__(_exercise.__module__, fromlist=["__file__"]).__file__).read_bytes()).hexdigest(),
        "observations_per_side": len(observations["rust"]), "database_copies": databases,
        "live_queue_owner_projection": "Separate component evidence; this route lane has an empty queue.",
        "full_gate4": "NOT RUN",
    }, indent=2) + "\n", encoding="utf-8")
    assert sha256(native.read_bytes()).hexdigest() == digest
    assert same, "Actual HTTP group mismatch; inspect owned observations."
