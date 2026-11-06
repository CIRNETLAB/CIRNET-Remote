"""Stage 4 first HTTP slice against the exact Stage 3 Python Remote and Hardware."""

from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
from tarfile import open as open_tar
from time import monotonic, sleep
from uuid import uuid4

import httpx
import psutil
import pytest

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import ORIGIN, stop_owned_backend
from scripts.install_release import API_INSTALL_PROBE
from tests.integration.native_cpp_pool_cases import _selected_file
from tests.integration.native_hardware_gate_cases import native_service


REFERENCE_SHA256 = "ebc49c57c052e0a78c98074af240c78010f787872a4ad32ac23617ada1fc15bd"
WORKER_SHA256 = "c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf"
OPENAPI_SHA256 = "dc39c874386eba2b58f8b5c631cbee0d63ded86cf287aea63f54e4a237ff8f08"
READY = re.compile(rb"^CIRNET_REMOTE_READY=127\.0\.0\.1:([1-9][0-9]{0,4})\r?$", re.MULTILINE)
SLICE_OPERATIONS = {
    "getHealth", "listProjects", "getProject", "validateCircuit", "previewCircuit",
    "validateCircuitV2", "previewCircuitV2",
}

SEED = r"""
from importlib.resources import files
from pathlib import Path
from secrets import token_urlsafe
import json

from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository
from app.services.projects import ProjectService

settings = Settings()
repo = Repository(settings.database_url)
try:
    auth = AuthService(repo, settings)
    password = token_urlsafe(24)
    auth.bootstrap_admin('stage4_admin', password, 'Stage 4 admin')
    session, _ = auth.ensure_session(None)
    admin, _ = auth.login(session, 'stage4_admin', password, 'stage4-admin')
    projects = ProjectService(repo, authorize_session=auth.require_principal_session)
    result = {}
    for username, count in (('stage4_alice', 2), ('stage4_bob', 1)):
        auth.create_user(username, password, actor=admin)
        session, _ = auth.ensure_session(None)
        user, token = auth.login(session, username, password, username)
        records = [projects.create_project(user.owner_id,
            {'name': f'{username} {i}', 'description': f'fixture {i}'},
            auth_session_id=user.session_id) for i in range(count)]
        result[username] = {'token': token, 'csrf': user.csrf_token, 'projects': records}
    session, _ = auth.ensure_session(None)
    revoked, token = auth.login(session, 'stage4_alice', password, 'stage4-revoked')
    auth.logout(revoked)
    result['revoked'] = token
    result['contracts'] = str(Path(str(files('contracts'))).resolve(strict=True))
    print(json.dumps(result))
finally:
    repo.close()
"""

SERVE_REFERENCE = r"""
import socket
import sys
from threading import Thread

import uvicorn
from app.main import create_app

app = create_app()
server = uvicorn.Server(uvicorn.Config(app, log_level='warning', lifespan='off'))

def stop_on_eof():
    sys.stdin.buffer.read()
    server.should_exit = True

with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    Thread(target=stop_on_eof, daemon=True).start()
    print(f'CIRNET_REMOTE_READY=127.0.0.1:{listener.getsockname()[1]}', flush=True)
    try:
        server.run(sockets=[listener])
    finally:
        app.state.manager.close()
        app.state.repository.close()
"""


def _select_reference(directory):
    manifest = Path(os.environ["CIRNET_NATIVE_STAGE3_CANDIDATE"])
    payload = manifest.read_bytes()
    assert manifest.is_absolute() and sha256(payload).hexdigest() == REFERENCE_SHA256
    data = json.loads(payload)
    worker_lock = json.loads(Path(os.environ["CIRNET_NATIVE_STAGE1_CANDIDATE"]).read_bytes())
    worker_entry = worker_lock["artifacts"]["Worker"]
    assert worker_entry["sha256"] == data["workerSha256"] == WORKER_SHA256
    worker = _selected_file(worker_entry)
    remote, hardware, crate = (_selected_file(data["artifacts"][key]) for key in ("Remote", "Hardware", "Contracts"))
    python = Path(os.environ["CIRNET_NATIVE_STAGE3_PYTHON"]).resolve(strict=True)
    assert python.is_relative_to(manifest.parent.resolve())
    contracts = Path(data["contractsRoot"]).resolve(strict=True)
    with open_tar(crate, "r:gz") as archive:
        for member in archive:
            if member.isfile():
                relative = Path(member.name)
                assert relative.parts[0] == "cirnet-contracts-native-0.1.2"
                target = contracts.joinpath(*relative.parts[1:])
                assert target.resolve(strict=True).is_relative_to(contracts) and not target.is_symlink()
                assert target.read_bytes() == archive.extractfile(member).read(), member.name
    with (directory / "reference-wheel.log").open("wb") as log:
        subprocess.run(
            [str(python), "-I", "-B", "-c", API_INSTALL_PROBE, str(remote), data["artifacts"]["Remote"]["sha256"]],
            cwd=directory, stdout=log, stderr=subprocess.STDOUT, check=True, timeout=30,
        )
    return python, hardware, worker, contracts


def _environment(directory, database):
    environment = {key: value for key, value in os.environ.items()
                   if not key.upper().startswith(("CIRNET_", "NETCIRCUIT_"))}
    environment.pop("PYTHONPATH", None)
    captures = directory / "captures"
    captures.mkdir()
    return {
        **environment, "CIRNET_ENV": "development", "CIRNET_HARDWARE_MODE": "simulation",
        "CIRNET_ALLOW_GUEST": "true", "CIRNET_SIMULATION_WORKERS": "4",
        "CIRNET_TRUSTED_ORIGINS": ORIGIN, "CIRNET_DATABASE_URL": "sqlite:///" + database.as_posix(),
        "CIRNET_CAPTURE_DIR": str(captures), "PYTHONUNBUFFERED": "1", "PYTHONDONTWRITEBYTECODE": "1",
        "TMP": str(directory), "TEMP": str(directory), "TMPDIR": str(directory),
    }


@contextmanager
def _http_service(command, directory, environment):
    log_path = directory / "remote.log"
    with log_path.open("wb") as log, subprocess.Popen(
        command, cwd=directory, env=environment, stdin=subprocess.PIPE, stdout=log, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    ) as child:
        try:
            deadline = monotonic() + 30
            while child.poll() is None and monotonic() < deadline:
                ready = READY.search(log_path.read_bytes())
                if ready:
                    port = int(ready.group(1))
                    assert port <= 65535
                    try:
                        with socket.create_connection(("127.0.0.1", port), timeout=.2):
                            break
                    except OSError:
                        pass
                sleep(.05)
            else:
                pytest.fail(f"Remote readiness failed (exit={child.poll()}). Inspect {log_path}.")
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=10) as client:
                yield client
        finally:
            if child.poll() is None:
                stop_owned_backend(child, psutil)


def _exercise(client, seed, graph):
    alice, bob = (seed[key] for key in ("stage4_alice", "stage4_bob"))
    own, second = alice["projects"]
    foreign = bob["projects"][0]
    results = {}

    def request(name, method, path, status, *, headers=None, **kwargs):
        request_id = "stage4:" + name
        response = client.request(method, path, headers={"X-Request-ID": request_id, **(headers or {})}, **kwargs)
        assert response.status_code == status, (name, response.status_code, response.text)
        assert response.headers["X-Request-ID"] == request_id
        assert response.headers["Cache-Control"] == "no-store"
        assert response.headers["Content-Type"].split(";")[0] == "application/json"
        assert "Set-Cookie" not in response.headers, name
        value = response.json()
        results[name] = {"status": response.status_code, "body": value}
        return value

    cookie = {"Cookie": "cirnet_session=" + alice["token"]}
    legacy = {"Cookie": "netcircuit_session=" + alice["token"]}
    canonical_wins = {"Cookie": "cirnet_session=invalid; " + legacy["Cookie"]}
    request("health", "GET", "/api/health", 200)
    request("missing_session", "GET", "/api/projects", 401)
    request("invalid_current_cookie", "GET", "/api/projects", 401, headers=canonical_wins)
    request("revoked_session", "GET", "/api/projects", 401,
            headers={"Cookie": "cirnet_session=" + seed["revoked"]})
    first_page = request("projects_page_one", "GET", "/api/projects", 200, headers=cookie, params={"limit": 1})
    assert first_page["items"] == [own] and first_page["next_cursor"]
    second_page = request("projects_page_two", "GET", "/api/projects", 200, headers=legacy,
                          params={"limit": 1, "cursor": first_page["next_cursor"]})
    assert second_page["items"] == [second] and second_page["next_cursor"] is None
    assert request("own_project", "GET", "/api/projects/" + own["project_id"], 200, headers=cookie) == own
    request("foreign_project", "GET", "/api/projects/" + foreign["project_id"], 403, headers=cookie)
    request("missing_project", "GET", "/api/projects/stage4-missing", 404, headers=cookie)

    mutation = {**cookie, "Origin": ORIGIN, "X-CIRNET-CSRF": alice["csrf"]}
    legacy_mutation = {**legacy, "Origin": ORIGIN, "X-CSRF-Token": alice["csrf"]}
    request("missing_csrf", "POST", "/api/circuits/validate", 403, headers={**cookie, "Origin": ORIGIN}, json=graph)
    request("legacy_csrf", "POST", "/api/circuits/validate", 200, headers=legacy_mutation, json=graph)
    request("invalid_current_csrf", "POST", "/api/circuits/validate", 403,
            headers={**legacy_mutation, "X-CIRNET-CSRF": "invalid"}, json=graph)
    request("wrong_origin", "POST", "/api/circuits/validate", 403,
            headers={**mutation, "Origin": "https://stage4.invalid"}, json=graph)
    for version, prefix in (("v1", "/api/circuits"), ("v2", "/api/v2/circuits")):
        valid = request("validate_" + version, "POST", prefix + "/validate", 200, headers=mutation, json=graph)
        assert valid["valid"] is True
        invalid = request("invalid_" + version, "POST", prefix + "/validate", 422, headers=mutation, json={})
        assert invalid["valid"] is False
        preview = request("preview_" + version, "POST", prefix + "/physical-preview", 200,
                          headers=mutation, json=graph)
        assert preview["provenance"] == "simulation_preview"
    return results


def test_stage4_read_preview_parity():
    """Probe actual routes; all other canonical operations and the WebSocket remain outside this slice."""
    root = artifact_directory(f"native-remote-http/{uuid4().hex}")
    print(f"Stage 4 HTTP slice: {root}", flush=True)
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    native_sha = sha256(native.read_bytes()).hexdigest()

    database = root / "seed.sqlite"
    seed_process = subprocess.run([str(python), "-I", "-B", "-c", SEED], cwd=root,
                                  env=_environment(root, database), capture_output=True, timeout=30)
    (root / "seed.stderr.log").write_bytes(seed_process.stderr)
    assert seed_process.returncode == 0, "The exact Python wheel failed to seed the reference database."
    seed = json.loads(seed_process.stdout)
    contract_root = Path(seed.pop("contracts"))
    openapi_bytes = (contract_root / "api/openapi.json").read_bytes()
    assert sha256(openapi_bytes).hexdigest() == OPENAPI_SHA256
    openapi = json.loads(openapi_bytes)
    inventory = {operation["operationId"] for methods in openapi["paths"].values() for operation in methods.values()
                 if isinstance(operation, dict) and "operationId" in operation}
    assert len(inventory) == 63 and SLICE_OPERATIONS <= inventory
    graph = json.loads((contract_root / "circuit-schema/examples/physical-hc08-led.json").read_bytes())

    results = {}
    for label, is_native in (("rust", True), ("python", False)):
        lane = root / label
        lane.mkdir()
        lane_db = lane / "baseline.sqlite"
        shutil.copyfile(database, lane_db)
        before = sha256(lane_db.read_bytes()).hexdigest()
        environment = {
            **_environment(lane, lane_db), "CIRNET_SIM_CPP_WORKER": str(worker),
            "CIRNET_SIM_CPP_WORKER_SHA256": WORKER_SHA256, "CIRNET_CONTRACTS_ROOT": str(contracts),
            "CIRNET_SIMULATION_BACKEND": "cpp", "CIRNET_HARDWARE_PREVIEW": "true",
        }
        with native_service(lane, environment, {"executable": hardware, "contracts": contracts}) as (_, (port, _)):
            environment["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{port}"
            if is_native:
                environment["CIRNET_REMOTE_READ_ONLY"] = "true"
                command = [str(native), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"]
            else:
                command = [str(python), "-I", "-B", "-c", SERVE_REFERENCE]
            with _http_service(command, lane, environment) as client:
                results[label] = _exercise(client, seed, graph)
        if is_native:
            assert sha256(lane_db.read_bytes()).hexdigest() == before
            assert not any((lane / "captures").iterdir())
        (lane / "http-observations.json").write_text(json.dumps(results[label], indent=2) + "\n", encoding="utf-8")

    assert sha256(native.read_bytes()).hexdigest() == native_sha
    for name, reference in results["python"].items():
        assert results["rust"][name] == reference, name
    (root / "comparison.json").write_text(json.dumps({
        "scope": "Stage 4 first HTTP slice on copied SQLite, modern sessions, and isolated Hardware",
        "status": "PASS", "reference_manifest_sha256": REFERENCE_SHA256, "candidate_sha256": native_sha,
        "harness_sha256": sha256(Path(__file__).read_bytes()).hexdigest(), "openapi_reference_sha256": OPENAPI_SHA256,
        "runtime_openapi_parity": "NOT RUN", "websocket": "NOT RUN",
        "tested_operations": sorted(SLICE_OPERATIONS), "untested_operations": sorted(inventory - SLICE_OPERATIONS),
        "http_observations_per_side": len(results["rust"]),
    }, indent=2) + "\n", encoding="utf-8")
