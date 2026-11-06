"""Stage 4 auth HTTP parity against the exact Python Remote wheel."""
from hashlib import sha256
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
from time import time
from uuid import NAMESPACE_URL, uuid4, uuid5

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import ORIGIN
from tests.integration.native_hardware_gate_cases import native_service
from tests.integration.native_remote_gate_cases import (
    REFERENCE_SHA256, SERVE_REFERENCE, WORKER_SHA256, _environment, _http_service, _select_reference,
)

LEGACY = "stage4-auth-http-legacy"
PASSWORD = "stage4-auth-http-password"
OPAQUE = re.compile(r"[A-Za-z0-9_-]{43}")
OPERATIONS = {"getSession", "login", "logout", "claimGuest", "listUsers", "createUser", "updateUser"}

SEED_AUTH = r"""
import json
import time
from sqlalchemy import insert
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository
from app.services.projects import ProjectService

settings = Settings()
repo = Repository(settings.database_url)
try:
    auth = AuthService(repo, settings)
    password = 'stage4-auth-http-password'
    admin = auth.bootstrap_admin('stage4_admin', password, 'Stage 4 Admin')
    anonymous, _ = auth.ensure_session(None)
    actor, _ = auth.login(anonymous, 'stage4_admin', password, 'stage4-auth-fixture')
    student = auth.create_user('stage4_student', password, display_name='Stage 4 Student', actor=actor)
    guest = 'stage4-auth-http-legacy'
    with repo.engine.begin() as db:
        db.execute(insert(repo.auth_principals).values(principal_id=guest,kind='GUEST',created_at=time.time()))
        db.execute(insert(repo.sessions).values(session_id=guest,expires_at=time.time()+3600))
    project = ProjectService(repo).create_project(guest, {'name': 'Auth HTTP fixture'})
    print(json.dumps({'admin': admin, 'student': student, 'project': project}))
finally:
    repo.close()
"""


def _exercise_cors(client):
    allowed_headers = "Accept, Accept-Language, Content-Language, Content-Type, Idempotency-Key, If-Match, X-CIRNET-CSRF, X-CSRF-Token, X-Control-Client, X-Request-ID"
    vary = "Origin, Access-Control-Request-Method, Access-Control-Request-Headers, Access-Control-Request-Private-Network"
    common = {"Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers": "content-type, x-cirnet-csrf, X-REQUEST-ID",
              "Cookie": "cirnet_session=expired-test-credential"}
    cases = [
        ("trusted", {}, 200, "OK", True),
        ("foreign", {"Origin": "https://outside.invalid"}, 400, "Disallowed CORS origin", False),
        ("method", {"Access-Control-Request-Method": "HEAD"}, 400, "Disallowed CORS method", True),
        ("headers", {"Access-Control-Request-Headers": "authorization"}, 400, "Disallowed CORS headers", True),
        ("private_network", {"Access-Control-Request-Private-Network": "true"}, 400,
         "Disallowed CORS private-network", True),
    ]
    observations = {}
    for name, overrides, status, body, trusted in cases:
        response = client.options("/api/auth/login", headers={"Origin": ORIGIN, **common, **overrides})
        assert response.status_code == status and response.text == body, (name, response.status_code, response.text)
        expected = {
            "access-control-allow-credentials": "true",
            "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "access-control-allow-headers": allowed_headers,
            "access-control-max-age": "600",
            "vary": vary,
            "content-type": "text/plain; charset=utf-8",
        }
        if trusted:
            expected["access-control-allow-origin"] = ORIGIN
        observed = {key: response.headers[key] for key in expected}
        assert observed == expected, name
        assert not any(key in response.headers for key in (
            "Set-Cookie", "Cache-Control", "X-Request-ID", "Access-Control-Expose-Headers",
            "Access-Control-Allow-Private-Network",
        ))
        if not trusted:
            assert "Access-Control-Allow-Origin" not in response.headers
        observations[name] = {"status": status, "body": body, "headers": observed}
    return observations


def _verify_revocations(database, evidence, credentials):
    def session(db, credential):
        digest = sha256(credential[0].encode()).hexdigest()
        row = db.execute("SELECT session_id, revoked FROM auth_sessions WHERE token_hash = ?", (digest,)).fetchone()
        assert row is not None and row[1] == 1
        return row[0]

    guest, legacy, student, claim, admin = credentials
    with sqlite3.connect(database) as db:
        legacy_context = uuid5(NAMESPACE_URL, "netcircuit-legacy-read:" + LEGACY).hex
        assert db.execute("SELECT revoked FROM auth_sessions WHERE session_id = ?",
                          (legacy_context,)).fetchone() == (1,)
        expected = [
            {session(db, guest)}, set(), {session(db, legacy)},
            {session(db, legacy), session(db, student), legacy_context},
            {session(db, claim)}, {session(db, admin)},
        ]
    records = [json.loads(line) for line in evidence.read_text(encoding="utf-8").splitlines()]
    assert len(records) == len(expected)
    for record, identities in zip(records, expected, strict=True):
        assert len(record) == len(identities) and set(record) == identities
    return [len(record) for record in records]


def _exercise_auth(client, seed, *, callback_check=None):
    output = {}
    dynamic_ids = {}

    def normalized(value):
        if isinstance(value, list):
            return [normalized(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {}
        for key, item in value.items():
            if key == "csrf_token":
                assert isinstance(item, str) and OPAQUE.fullmatch(item)
                result[key] = "opaque"
            elif key == "expires_at":
                assert isinstance(item, (int, float)) and 86340 < item - time() < 86401
                result[key] = "session ttl"
            elif key in {"principal_id", "owner_id"}:
                result[key] = dynamic_ids.get(item, item)
            else:
                result[key] = normalized(item)
        return result

    def request(name, method, path, status, *, credential=None, legacy=False, rotate=False, dynamic=None, **options):
        client.cookies.clear()
        headers = {"X-Request-ID": "stage4-auth:" + name}
        if method != "GET":
            headers["Origin"] = ORIGIN
        if credential is not None:
            token, csrf = credential
            headers["Cookie"] = ("netcircuit_session=" if legacy else "cirnet_session=") + token
            if csrf is not None and method != "GET":
                headers["X-CSRF-Token" if legacy else "X-CIRNET-CSRF"] = csrf
        headers.update(options.pop("headers", {}))
        response = client.request(method, path, headers=headers, **options)
        assert response.status_code == status, (name, response.status_code, response.text)
        assert response.headers["Cache-Control"] == "no-store"
        assert response.headers["X-Request-ID"] == headers["X-Request-ID"]
        assert response.headers["Content-Type"].split(";")[0] == "application/json"
        assert response.headers["Vary"] == "Origin"
        if "Origin" in headers:
            assert response.headers["Access-Control-Allow-Credentials"] == "true"
            assert response.headers["Access-Control-Expose-Headers"] == "ETag, X-Request-ID"
        assert response.headers.get("Access-Control-Allow-Origin") == (
            ORIGIN if headers.get("Origin") == ORIGIN else None
        )
        value = response.json()
        if dynamic:
            principal = value.get("principal", value)["principal_id"]
            assert re.fullmatch(r"[0-9a-f]{32}", principal)
            dynamic_ids[principal] = dynamic
        cookie_headers = response.headers.get_list("Set-Cookie")
        next_credential = None
        if rotate:
            assert len(cookie_headers) == 2
            parsed = SimpleCookie()
            for header in cookie_headers:
                parsed.load(header)
            assert set(parsed) == {"cirnet_session", "netcircuit_session"}
            tokens = {item.value for item in parsed.values()}
            token, = tokens
            assert OPAQUE.fullmatch(token)
            assert credential is None or token != credential[0]
            for item in parsed.values():
                assert item["httponly"] and item["path"] == "/" and item["samesite"] == "lax"
                assert item["max-age"] == "86400" and not item["secure"] and not item["domain"]
            next_credential = (token, value["csrf_token"])
        else:
            assert not cookie_headers, name
        output[name] = {"status": status, "body": normalized(value), "rotated": rotate}
        return value, next_credential

    def login(name, username, credential, **options):
        return request(name, "POST", "/api/auth/login", 200, credential=credential, rotate=True,
                       json={"username": username, "password": PASSWORD}, **options)

    guest, guest_token = request("guest_bootstrap", "GET", "/api/auth/session", 200,
                                 rotate=True, dynamic="new_guest")
    assert not guest["authenticated"] and guest["principal"]["kind"] == "GUEST"
    guest_repeat, _ = request("guest_session_repeat", "GET", "/api/auth/session", 200,
                              credential=guest_token)
    assert guest_repeat == guest
    bad_login = {"username": "stage4_admin", "password": "incorrect-password"}
    request("foreign_origin", "POST", "/api/auth/login", 403, credential=guest_token, json=bad_login,
            headers={"Origin": "https://outside.invalid"})
    request("invalid_credentials", "POST", "/api/auth/login", 401, credential=guest_token, json=bad_login)
    admin, admin_token = login("admin_login", "STAGE4_ADMIN", guest_token, legacy=True)
    assert admin["principal"]["principal_id"] == seed["admin"]["principal_id"]
    request("login_retires_guest", "GET", "/api/projects", 401, credential=guest_token)

    users, _ = request("admin_users", "GET", "/api/admin/users", 200, credential=admin_token)
    assert users == [seed["admin"], seed["student"]]
    created, _ = request("create_user", "POST", "/api/admin/users", 201, credential=admin_token,
        dynamic="created_user", json={"username": "stage4_created", "password": PASSWORD,
                                       "role": "STUDENT", "display_name": "Created Student"})
    request("duplicate_user", "POST", "/api/admin/users", 409, credential=admin_token,
        json={"username": "STAGE4_CREATED", "password": PASSWORD, "role": "STUDENT", "display_name": "Duplicate"})
    request("update_user", "PATCH", "/api/admin/users/" + created["principal_id"], 200,
            credential=admin_token, json={"role": "INSTRUCTOR"})
    request("last_admin", "PATCH", "/api/admin/users/" + seed["admin"]["principal_id"], 409,
            credential=admin_token, json={"active": False})

    project_path = "/api/projects/" + seed["project"]["project_id"]
    request("legacy_project_read", "GET", project_path, 200, credential=(LEGACY, None), legacy=True)
    legacy, legacy_token = request("legacy_bootstrap", "GET", "/api/auth/session", 200,
                                   credential=(LEGACY, None), legacy=True, rotate=True)
    assert legacy["principal"]["principal_id"] == LEGACY
    request("legacy_proof_consumed", "GET", project_path, 401, credential=(LEGACY, None), legacy=True)
    student, student_token = login("student_login", "stage4_student", legacy_token)
    assert student["claim_available"] is True
    request("student_denied_admin", "GET", "/api/admin/users", 403, credential=student_token)
    request("invalid_claim", "POST", "/api/auth/claim-guest", 422, credential=student_token, json={"confirm": False})
    request("claim_csrf_precedence", "POST", "/api/auth/claim-guest", 403, credential=student_token, legacy=True,
            headers={"X-CIRNET-CSRF": "invalid"}, json={"confirm": True})
    claimed, claim_token = request("claim_guest", "POST", "/api/auth/claim-guest", 200,
                                   credential=student_token, rotate=True, json={"confirm": True})
    assert claimed["claim_available"] is False
    request("claim_retires_old_session", "GET", project_path, 401, credential=student_token)
    transferred, _ = request("claimed_project", "GET", project_path, 200, credential=claim_token)
    assert transferred["owner_id"] == seed["student"]["principal_id"]
    request("deactivate_student", "PATCH", "/api/admin/users/" + seed["student"]["principal_id"], 200,
            credential=admin_token, json={"active": False})
    request("user_update_revokes_session", "GET", project_path, 401, credential=claim_token)
    logged_out, _ = request("logout", "POST", "/api/auth/logout", 200, credential=admin_token,
                            rotate=True, dynamic="logout_guest", json={})
    assert not logged_out["authenticated"] and logged_out["principal"]["kind"] == "GUEST"
    request("logout_retires_old_session", "GET", "/api/admin/users", 401, credential=admin_token)
    if callback_check is not None:
        callback_check((guest_token, legacy_token, student_token, claim_token, admin_token))
    return output


def test_stage4_auth_http_parity():
    root = artifact_directory(f"native-remote-auth-http/{uuid4().hex}")
    print(f"Stage 4 auth HTTP: {root}", flush=True)
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    native_sha = sha256(native.read_bytes()).hexdigest()
    seed_db = root / "seed.sqlite"
    fixture = subprocess.run([str(python), "-I", "-B", "-c", SEED_AUTH], cwd=root,
                             env=_environment(root, seed_db), capture_output=True, timeout=30)
    (root / "seed.stderr.log").write_bytes(fixture.stderr)
    assert fixture.returncode == 0, "The exact Python wheel failed to seed the auth database."
    seed = json.loads(fixture.stdout)

    results, cors = {}, {}
    revocations = []
    for label, candidate in (("rust", True), ("python", False)):
        lane = root / label
        lane.mkdir()
        db = lane / "auth.sqlite"
        shutil.copyfile(seed_db, db)
        environment = {
            **_environment(lane, db), "CIRNET_SIM_CPP_WORKER": str(worker),
            "CIRNET_SIM_CPP_WORKER_SHA256": WORKER_SHA256, "CIRNET_CONTRACTS_ROOT": str(contracts),
            "CIRNET_SIMULATION_BACKEND": "cpp", "CIRNET_HARDWARE_PREVIEW": "true",
        }
        with native_service(lane, environment, {"executable": hardware, "contracts": contracts}) as (_, (port, _)):
            environment["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{port}"
            if candidate:
                environment["CIRNET_REMOTE_READ_ONLY"] = "false"
                environment["CIRNET_STAGE4_AUTH_FIXTURE"] = "1"
                command = [str(native), "--ignored", "--exact", "serve_auth_fixture", "--nocapture", "--test-threads=1"]
            else:
                command = [str(python), "-I", "-B", "-c", SERVE_REFERENCE]
            with _http_service(command, lane, environment) as client:
                cors[label] = _exercise_cors(client)
                callback_check = None
                if candidate:
                    callback_check = lambda credentials: revocations.extend(
                        _verify_revocations(db, lane / "revocations.jsonl", credentials))
                results[label] = _exercise_auth(client, seed, callback_check=callback_check)
        if candidate:
            assert "test result: ok. 1 passed;" in (lane / "remote.log").read_text(encoding="utf-8")
        (lane / "http-observations.json").write_text(json.dumps(results[label], indent=2) + "\n", encoding="utf-8")

    assert sha256(native.read_bytes()).hexdigest() == native_sha
    assert cors["rust"] == cors["python"]
    for name, reference in results["python"].items():
        assert results["rust"][name] == reference, name
    (root / "comparison.json").write_text(json.dumps({
        "scope": "Stage 4 auth and user REST on copied SQLite; actual native router with fixture-only revoker",
        "status": "PASS", "reference_manifest_sha256": REFERENCE_SHA256, "candidate_sha256": native_sha,
        "harness_sha256": sha256(Path(__file__).read_bytes()).hexdigest(), "tested_operations": sorted(OPERATIONS),
        "http_observations_per_side": len(results["rust"]), "cors_preflight_observations": cors["rust"],
        "fixture_durable_revocations": revocations, "scheduler_revocation_under_load": "NOT RUN",
        "runtime_openapi_parity": "NOT RUN", "postgres_http": "NOT RUN", "websocket": "NOT RUN",
    }, indent=2) + "\n", encoding="utf-8")
