"""Real PostgreSQL lock chains through the frozen native Remote HTTP boundary."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
from time import monotonic, sleep
from uuid import uuid4

import psycopg
from psycopg import sql
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect

from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import ORIGIN, graph, verify_digital_evidence
from tests.integration.native_hardware_gate_cases import native_service
from tests.integration.native_remote_assignments_cases import definition
from tests.integration.native_remote_gate_cases import REFERENCE_SHA256, WORKER_SHA256, _http_service, _select_reference
from tests.integration.native_remote_matrix_cases import _database, environment

LOCK_KEY = 4812697205089
SEED = """
from contextlib import closing
import json
from secrets import token_urlsafe
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository

def actor(context, token):
    return {"owner": context.owner_id, "session": context.session_id,
            "csrf": context.csrf_token, "token": token}

settings = Settings()
with closing(Repository(settings.database_url)) as repo:
    auth = AuthService(repo, settings)
    password = token_urlsafe(24)
    auth.bootstrap_admin("pg_race_admin", password)
    anonymous, _ = auth.ensure_session(None)
    admin, _ = auth.login(anonymous, "pg_race_admin", password)
    result = {}
    for name, role in (("teacher", "INSTRUCTOR"), ("student", "STUDENT")):
        username = "pg_race_" + name
        auth.create_user(username, password, role=role, actor=admin)
        fresh, _ = auth.ensure_session(None)
        context, token = auth.login(fresh, username, password)
        result[name] = actor(context, token)
    for purpose in ("project", "experiment", "capture", "websocket"):
        guest, _ = auth.ensure_session(None)
        with repo.lock, repo.engine.begin() as db:
            writer, writer_token = auth._new_session(db, guest.owner_id)
            viewer, viewer_token = auth._new_session(db, guest.owner_id)
        claimant, claimant_token = auth.login(guest, "pg_race_admin", password)
        result[purpose] = {"guest": actor(writer, writer_token), "viewer": actor(viewer, viewer_token),
                           "claim": actor(claimant, claimant_token)}
    parent, parent_token = auth.ensure_session(None)
    with repo.lock, repo.engine.begin() as db:
        peer, peer_token = auth._new_session(db, parent.owner_id)
    result["parent"] = {"creator": actor(parent, parent_token), "deleter": actor(peer, peer_token)}
    print(json.dumps(result))
"""


def response(client, actor, method, path, statuses, *, key=None, **options):
    headers = {"Cookie": "cirnet_session=" + actor["token"], "X-CIRNET-CSRF": actor["csrf"],
               "Origin": ORIGIN, "X-Request-ID": "pg-race:" + uuid4().hex}
    if method == "POST" and path.endswith("/run"):
        headers["X-Control-Client"] = "stage4-pg-races"
    if key is not None:
        headers["Idempotency-Key"] = key
    result = client.request(method, path, headers=headers, **options)
    allowed = (statuses,) if isinstance(statuses, int) else statuses
    if result.status_code not in allowed:
        raise AssertionError(f"{method} {path}: unexpected HTTP {result.status_code}, error "
                             f"{result.json().get('error', {}).get('code')}")
    return result


def claim(client, actor):
    return response(client, actor, "POST", "/api/auth/claim-guest", 200, json={"confirm": True})


def acquired_actor(result):
    value = result.json()
    return {"owner": value["principal"]["principal_id"], "csrf": value["csrf_token"],
            "token": result.cookies["cirnet_session"]}


def blocked_by(observer, blocker):
    deadline = monotonic() + 5
    while monotonic() < deadline:
        match = observer.execute(
            "SELECT pid, wait_event_type FROM pg_stat_activity WHERE datname=current_database() "
            "AND %s=ANY(pg_blocking_pids(pid)) ORDER BY pid LIMIT 1",
            (blocker,),
        ).fetchone()
        if match:
            assert match[1] == "Lock"
            return match[0]
        sleep(.02)
    raise AssertionError("No PostgreSQL lock waiter was observed on the expected backend.")


@contextmanager
def trigger(db, operation, table, condition):
    command = sql.SQL(
        "CREATE TRIGGER fixture_pause BEFORE {} ON {} FOR EACH ROW WHEN ({}) "
        "EXECUTE FUNCTION fixture_pause_writer()",
    ).format(sql.SQL(operation), sql.Identifier(table), condition)
    db.execute(command)
    try:
        yield
    finally:
        db.execute(sql.SQL("DROP TRIGGER fixture_pause ON {}").format(sql.Identifier(table)))


def two_waiters(db, connect_db, writer, second):
    with connect_db() as blocker, ThreadPoolExecutor(2) as threads:
        gate_pid = blocker.execute("SELECT pg_backend_pid()").fetchone()[0]
        blocker.execute("SELECT pg_advisory_lock(%s)", (LOCK_KEY,))
        try:
            pending = threads.submit(writer)
            writer_pid = blocked_by(db, gate_pid)
            contender = threads.submit(second)
            second_pid = blocked_by(db, writer_pid)
            assert len({gate_pid, writer_pid, second_pid}) == 3
            assert not pending.done() and not contender.done()
        finally:
            assert blocker.execute("SELECT pg_advisory_unlock(%s)", (LOCK_KEY,)).fetchone()[0]
        return pending.result(10), contender.result(10), [gate_pid, writer_pid, second_pid]


def create_project(client, actor, name):
    return response(client, actor, "POST", "/api/projects", 201, json={"name": name}).json()


def create_circuit(client, actor, project, name, payload):
    return response(client, actor, "POST", f"/api/projects/{project}/circuits", 201,
                    json={"name": name, "graph": payload}).json()


def payload(circuit=None):
    base = {"station_id": "virtual-station-01",
            "capture_config": {"signals": ["G.Y1"], "duration_ns": 40, "max_events": 100},
            "test_vectors": [{"time_ns": 20, "inputs": {"X.OUT": 1}}]}
    if circuit is None:
        return {**base, "circuit_graph": graph("stage4-postgres-race")}
    return {**base, "circuit_document_id": circuit, "circuit_revision": 1}


def committed_snapshots(client, db, connect_db, seed):
    actor = seed["student"]
    old = response(client, actor, "POST", "/api/experiments", 201, json=payload()).json()
    other = response(client, actor, "POST", "/api/experiments", 201, json=payload()).json()
    identity = old["experiment_id"]
    path = f"/api/experiments/{identity}"
    original = db.execute("SELECT payload FROM lab_experiments WHERE experiment_id=%s", (identity,)).fetchone()[0]
    with connect_db() as writer:
        with writer.transaction():
            writer.execute("UPDATE lab_experiments SET payload=jsonb_set(payload::jsonb,'{revision}','1')::json "
                           "WHERE experiment_id=%s", (other["experiment_id"],))
            assert response(client, actor, "GET", path, 200).json() == old
        for commit in (False, True):
            with writer.transaction(force_rollback=not commit):
                replacement = {**original, "revision": 1}
                writer.execute("UPDATE lab_experiments SET payload=%s::json WHERE experiment_id=%s",
                               (json.dumps(replacement), identity))
                assert response(client, actor, "GET", path, 200).json() == old
            actual = response(client, actor, "GET", path, 200).json()
            assert actual == ({**old, "revision": 1} if commit else old)
    return {"unrelated_writer": "PASS", "same_row_commit": "PASS", "same_row_rollback": "PASS"}


def project_and_experiment_claim(client, db, connect_db, seed):
    result = {}
    guest, claimant = seed["project"]["guest"], seed["project"]["claim"]
    with trigger(db, "INSERT", "projects", sql.SQL("NEW.name = 'Writer before claim'")):
        made, transfer, pids = two_waiters(db, connect_db,
            lambda: create_project(client, guest, "Writer before claim"),
            lambda: claim(client, claimant))
    new = acquired_actor(transfer)
    assert db.execute("SELECT owner_id FROM projects WHERE project_id=%s",
                      (made["project_id"],)).fetchone() == (new["owner"],)
    assert db.execute("SELECT revoked FROM auth_sessions WHERE session_id=%s",
                      (guest["session"],)).fetchone() == (True,)
    result["project_claim"] = {"backends": pids, "writer_status": 201, "transferred": True}

    guest, claimant = seed["experiment"]["guest"], seed["experiment"]["claim"]
    parent = create_project(client, guest, "Pinned reference")
    did = create_circuit(client, guest, parent["project_id"], "Immutable revision", graph("reference"))["document_id"]
    before = db.execute("SELECT COUNT(*) FROM lab_experiments").fetchone()
    response(client, guest, "POST", "/api/experiments", (404, 422), key="unavailable-revision",
             json={**payload(did), "circuit_revision": 999})
    assert db.execute("SELECT COUNT(*) FROM lab_experiments").fetchone() == before
    assert db.execute("SELECT COUNT(*) FROM lab_operations WHERE operation_key='unavailable-revision'").fetchone() == (0,)
    with trigger(db, "INSERT", "lab_experiments",
                 sql.SQL("NEW.payload->'_document_reference'->>'document_id' = {}").format(sql.Literal(did))):
        made, transfer, pids = two_waiters(db, connect_db,
            lambda: response(client, guest, "POST", "/api/experiments", (201, 403),
                             key="write-before-claim", json=payload(did)),
            lambda: claim(client, claimant))
    new = acquired_actor(transfer)
    row = db.execute(
        "SELECT owner_id, payload FROM lab_operations WHERE kind='create' AND operation_key='write-before-claim'",
    ).fetchone()
    assert row[0] == new["owner"] and row[1]["status"] == "APPLIED"
    eid = row[1]["experiment_id"]
    assert db.execute("SELECT owner_id FROM lab_experiments WHERE experiment_id=%s", (eid,)).fetchone() == (new["owner"],)
    assert db.execute("SELECT document_id, revision FROM experiment_document_refs WHERE experiment_id=%s",
                      (eid,)).fetchone() == (did, 1)
    assert db.execute("SELECT saved_by FROM circuit_revisions WHERE document_id=%s AND revision=1",
                      (did,)).fetchone() == (guest["owner"],)
    fresh = response(client, new, "GET", f"/api/experiments/{eid}", 200).json()
    assert fresh["state"] == "CREATED"
    result["experiment_claim"] = {"backends": pids, "writer_status": made.status_code, "transferred": True,
                                   "pinned_document_revision": 1, "durable_operation": "APPLIED"}
    return result


def parent_delete(client, db, connect_db, seed):
    creator, deleter = seed["parent"]["creator"], seed["parent"]["deleter"]
    assert creator["session"] != deleter["session"] and creator["owner"] == deleter["owner"]
    project = create_project(client, creator, "Parent lock")["project_id"]
    with trigger(db, "INSERT", "circuit_documents", sql.SQL("NEW.name = 'Child before deletion'")):
        child, deleted, pids = two_waiters(db, connect_db,
            lambda: create_circuit(client, creator, project, "Child before deletion", graph("parent-race")),
            lambda: response(client, deleter, "DELETE", f"/api/projects/{project}", 200,
                             json={"base_revision": 1}))
    did = child["document_id"]
    assert deleted.json()["deleted"] is True
    response(client, creator, "GET", f"/api/circuits/{did}", 404)
    assert db.execute("SELECT deleted FROM circuit_documents WHERE document_id=%s", (did,)).fetchone() == (True,)
    assert db.execute("SELECT graph FROM circuit_revisions WHERE document_id=%s AND revision=1",
                      (did,)).fetchone() == (graph("parent-race"),)
    return {"backends": pids, "distinct_sessions": True, "retained_revision": 1}


def revision_limit(client, db, seed):
    actor = seed["parent"]["creator"]
    maximum = 9_007_199_254_740_991
    graph_value = graph("revision-limit")
    pid = create_project(client, actor, "Revision limit")["project_id"]
    did = create_circuit(client, actor, pid, "Maximum document revision", graph_value)["document_id"]
    with db.transaction():
        db.execute(
            "INSERT INTO circuit_revisions (document_id,revision,name,graph_schema_version,graph,saved_by,saved_at) "
            "SELECT document_id,%s,name,graph_schema_version,graph,saved_by,saved_at "
            "FROM circuit_revisions WHERE document_id=%s AND revision=1", (maximum, did),
        )
        db.execute("UPDATE circuit_documents SET revision=%s WHERE document_id=%s", (maximum, did))
    path = f"/api/circuits/{did}"
    response(client, actor, "PUT", path, 422,
             json={"base_revision": maximum, "name": "Overflow", "graph": graph_value})
    response(client, actor, "DELETE", path, 422, json={"base_revision": maximum})
    response(client, actor, "DELETE", f"/api/projects/{pid}", 422, json={"base_revision": 1})
    assert db.execute("SELECT revision,deleted FROM circuit_documents WHERE document_id=%s",
                      (did,)).fetchone() == (maximum, False)
    assert db.execute("SELECT revision,deleted FROM projects WHERE project_id=%s",
                      (pid,)).fetchone() == (1, False)
    return {"document_revision": maximum, "save_delete_parent_rollback": "PASS"}


def terminal_write_fence(client, db, connect_db, seed):
    actor = seed["student"]
    made = response(client, actor, "POST", "/api/experiments", 201, json=payload()).json()
    identity = made["experiment_id"]
    row = db.execute("SELECT payload FROM lab_experiments WHERE experiment_id=%s", (identity,)).fetchone()[0]
    changed = {**row, "state": "COMPLETE", "state_history": ["CREATED", "COMPLETE"], "revision": 1}
    with connect_db() as writer, ThreadPoolExecutor(1) as threads:
        with writer.transaction():
            writer_pid = writer.execute("SELECT pg_backend_pid()").fetchone()[0]
            writer.execute("UPDATE lab_experiments SET payload=%s::json WHERE experiment_id=%s",
                           (json.dumps(changed), identity))
            writer.execute("UPDATE lab_experiment_runtime SET state='COMPLETE' WHERE experiment_id=%s",
                           (identity,))
            run = threads.submit(response, client, actor, "POST", f"/api/experiments/{identity}/run", 409)
            run_pid = blocked_by(db, writer_pid)
            assert not run.done()
        run.result(10)
    assert db.execute("SELECT payload FROM lab_experiments WHERE experiment_id=%s",
                      (identity,)).fetchone() == (changed,)
    assert db.execute("SELECT COUNT(*) FROM lab_leases WHERE experiment_id=%s",
                      (identity,)).fetchone() == (0,)
    return {"backends": [writer_pid, run_pid], "terminal_write_won": True, "new_lease": False}


def assignment_publication(client, db, connect_db, seed):
    result = {}
    teacher, student = seed["teacher"], seed["student"]
    for publish_again in (False, True):
        identity = "race-republish" if publish_again else "race-unpublish"
        path = f"/api/assignment-documents/{identity}"
        response(client, teacher, "POST", "/api/assignment-documents", 201, json={"definition": definition(identity)})
        response(client, teacher, "PATCH", path + "/publication", 200,
                 json={"base_revision": 1, "published": True})
        body = {**payload(), "assignment_id": identity}
        with trigger(db, "INSERT", "lab_experiments",
                     sql.SQL("NEW.payload->>'assignment_id' = {}").format(sql.Literal(identity))):
            admitted, published, pids = two_waiters(db, connect_db,
                lambda: response(client, student, "POST", "/api/experiments", 201, key=identity, json=body),
                lambda: response(client, teacher, "PATCH", path + "/publication", 200,
                                 json={"base_revision": 2, "published": publish_again}))
        eid = admitted.json()["experiment_id"]
        record = db.execute("SELECT payload FROM lab_experiments WHERE experiment_id=%s", (eid,)).fetchone()[0]
        assert record["_assignment_reference"] == {"assignment_id": identity, "revision": 2}
        assert published.json()["published_revision"] == (3 if publish_again else None)
        if publish_again:
            try:
                db.execute("UPDATE assignment_documents SET published_revision=999 WHERE assignment_id=%s",
                           (identity,))
            except psycopg.errors.ForeignKeyViolation:
                pass
            else:
                raise AssertionError("PostgreSQL accepted a nonexistent published assignment revision.")
            assert db.execute("SELECT published_revision FROM assignment_documents WHERE assignment_id=%s",
                              (identity,)).fetchone() == (3,)
        else:
            response(client, student, "POST", "/api/experiments", 403, key=identity + "-blocked", json=body)
            assert db.execute("SELECT COUNT(*) FROM lab_operations WHERE operation_key=%s",
                              (identity + "-blocked",)).fetchone() == (0,)
        result[identity] = {"backends": pids, "admitted_revision": 2,
                            "new_published_revision": published.json()["published_revision"]}
    return result


def capture_retirement(client, db, connect_db, seed, capture_dir):
    guest, claimant = seed["capture"]["guest"], seed["capture"]["claim"]
    made = response(client, guest, "POST", "/api/experiments", 201, json=payload()).json()
    eid = made["experiment_id"]
    path = f"/api/experiments/{eid}"
    response(client, guest, "POST", path + "/run", 200)
    deadline = monotonic() + 20
    while True:
        current = response(client, guest, "GET", path, 200).json()
        if current["state"] == "COMPLETE":
            break
        assert current["state"] != "FAULT" and monotonic() < deadline, "Cannot complete real R2 capture fixture."
        sleep(.05)
    metadata = current["capture"]
    capture_id = metadata["capture_id"]
    reference = metadata["payload_ref"]
    binary = response(client, guest, "GET", reference, 200).content
    assert verify_digital_evidence(metadata, binary) == 3
    assert sha256(binary).hexdigest() == "a7d9fbe031939f9cdbf60f0f626b325beac173d9e720eb968fc62d9b83314010"
    with trigger(db, "UPDATE OF metadata", "lab_captures", sql.SQL(
        "OLD.capture_id = {} AND OLD.available = TRUE AND NEW.available = FALSE",
    ).format(sql.Literal(capture_id))):
        deleted, transfer, pids = two_waiters(db, connect_db,
            lambda: response(client, guest, "DELETE", reference, (200, 403)),
            lambda: claim(client, claimant))
    new = acquired_actor(transfer)
    read = response(client, new, "GET", path, 200).json()
    assert not read["capture"]["available"] and read["capture"]["sha256"] is None
    response(client, new, "GET", reference, 422)
    response(client, guest, "DELETE", reference, (401, 403))
    if db.execute("SELECT cleanup_pending FROM lab_captures WHERE capture_id=%s",
                  (capture_id,)).fetchone() == (True,):
        response(client, new, "DELETE", reference, 200)
    assert db.execute("SELECT available, cleanup_pending FROM lab_captures WHERE capture_id=%s",
                      (capture_id,)).fetchone() == (False, False)
    assert db.execute("SELECT action FROM auth_audit WHERE subject_id=%s",
                      (capture_id,)).fetchall() == [("CAPTURE_DELETED",)]
    assert not (capture_dir / f"{capture_id}.ncap").exists()
    return {"backends": pids, "writer_status": deleted.status_code,
            "audit_count": 1, "capture_unavailable": True, "cleanup_pending": False}


@contextmanager
def events(client, actor):
    url = str(client.base_url).rstrip("/").replace("http://", "ws://") + "/ws/events"
    with connect(url, origin=ORIGIN, additional_headers={"Cookie": "cirnet_session=" + actor["token"]},
                 open_timeout=5, close_timeout=5, proxy=None) as websocket:
        hello = json.loads(websocket.recv(timeout=5))
        assert hello["type"] == "hello" and hello["sequence"] == 0 and hello["resync_required"] is True
        websocket.send(json.dumps({"type": "client.hello", "protocol_version": "1.0",
                                   "control_client_id": "pg-race-" + uuid4().hex}))
        websocket.send("fixture-ready")
        assert json.loads(websocket.recv(timeout=5)) == {"type": "echo", "payload": "fixture-ready"}
        yield websocket


def claim_websocket(client, db, connect_db, seed):
    guest, viewer, claimant = (seed["websocket"][key] for key in ("guest", "viewer", "claim"))
    made = response(client, guest, "POST", "/api/experiments", 201, json=payload()).json()
    eid = made["experiment_id"]
    path = f"/api/experiments/{eid}"
    condition = sql.SQL("OLD.experiment_id = {} AND OLD.owner_id IS DISTINCT FROM NEW.owner_id").format(
        sql.Literal(eid),
    )
    with events(client, viewer) as old:
        with trigger(db, "UPDATE OF owner_id", "lab_experiments", condition):
            with connect_db() as blocker, ThreadPoolExecutor(2) as threads:
                gate_pid = blocker.execute("SELECT pg_backend_pid()").fetchone()[0]
                blocker.execute("SELECT pg_advisory_lock(%s)", (LOCK_KEY,))
                try:
                    transfer = threads.submit(claim, client, claimant)
                    claim_pid = blocked_by(db, gate_pid)
                    assert response(client, guest, "GET", path, 200).json() == made
                    response(client, claimant, "GET", path, 403)
                    old.send("committed-old-session")
                    try:
                        echo = json.loads(old.recv(timeout=1.5))
                        assert echo == {"type": "echo", "payload": "committed-old-session"}
                        precommit = "old committed session echo observed"
                    except TimeoutError:
                        precommit = "no echo before commit"
                    stop = threads.submit(
                        response, client, guest, "POST", path + "/stop", (401, 403), key="stale-stop-ws",
                    )
                    stop_pid = blocked_by(db, claim_pid)
                    assert not transfer.done() and not stop.done()
                finally:
                    assert blocker.execute("SELECT pg_advisory_unlock(%s)", (LOCK_KEY,)).fetchone()[0]
                new = acquired_actor(transfer.result(10))
                denied = stop.result(10)
        assert response(client, new, "GET", path, 200).json() == made
        assert db.execute("SELECT revoked FROM auth_sessions WHERE session_id=%s",
                          (viewer["session"],)).fetchone() == (True,)
        with events(client, new) as next_owner:
            terminal = response(client, new, "POST", path + "/stop", 200, key="new-owner-stop").json()
            assert terminal["state"] == "COMPLETE" and terminal["error_code"] == "STOPPED"
            event = json.loads(next_owner.recv(timeout=5))
            assert event["type"] == "experiment.updated" and event["experiment"] == terminal
            # An echo authorized while the guest still owned the row is harmless.
            # After the commit the old stream must close without this aggregate.
            for _ in range(2):
                try:
                    delayed = json.loads(old.recv(timeout=5))
                except ConnectionClosed as closed:
                    assert closed.rcvd is not None and closed.rcvd.code == 4401
                    break
                assert delayed == {"type": "echo", "payload": "committed-old-session"}
            else:
                raise AssertionError("Old owner WebSocket stayed open after committed revocation.")
    return {"backends": [gate_pid, claim_pid, stop_pid], "precommit_echo": precommit,
            "old_stop_status": denied.status_code, "old_socket_close": 4401,
            "new_owner_event": "COMPLETE", "old_owner_payload_leak": False}


def test_stage4_postgres_concurrent_write_and_live_event_fences():
    root = artifact_directory(f"stage4-postgres-races/{uuid4().hex}")
    print(f"Stage 4 PostgreSQL public transaction races: {root}", flush=True)
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    candidate = sha256(native.read_bytes()).hexdigest()
    assert candidate == os.environ["CIRNET_STAGE4_PG_RACES_CANDIDATE_SHA256"]
    source, copy, names = _database(root, "postgres")
    seeded = subprocess.run([str(python), "-I", "-B", "-c", SEED], cwd=root,
                            env=environment(root, source), capture_output=True, timeout=60)
    (root / "seed.stderr.log").write_bytes(seeded.stderr)
    assert seeded.returncode == 0, "Cannot seed exact Python-r8 actors for the transaction races."
    seed = json.loads(seeded.stdout)
    lane, url = copy("rust")
    assert names["rust"].startswith("stage4_http_")

    def connect_db():
        return psycopg.connect(url.replace("postgresql+psycopg://", "postgresql://", 1),
                               autocommit=True, connect_timeout=5, options="-c statement_timeout=10000")

    env = {**environment(lane, url), "CIRNET_CONTRACTS_ROOT": str(contracts),
           "CIRNET_SIM_CPP_WORKER": str(worker), "CIRNET_SIM_CPP_WORKER_SHA256": WORKER_SHA256,
           "CIRNET_SIMULATION_BACKEND": "cpp"}
    with connect_db() as observer:
        observer.execute(f"""
            CREATE FUNCTION fixture_pause_writer() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN PERFORM pg_advisory_xact_lock({LOCK_KEY}); RETURN NEW; END $$;
        """)
        with native_service(lane, env, {"executable": hardware, "contracts": contracts}) as (_, (port, _)):
            env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{port}"
            command = [str(native), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"]
            with _http_service(command, lane, env) as client:
                observations = {"mvcc_snapshots": committed_snapshots(client, observer, connect_db, seed)}
                print("Independent uncommitted/committed/rolled-back snapshot read PASS", flush=True)
                observations.update(project_and_experiment_claim(client, observer, connect_db, seed))
                print("Project and pinned experiment claim lock chains PASS", flush=True)
                observations["parent_delete"] = parent_delete(client, observer, connect_db, seed)
                print("Independent-session parent deletion lock chain PASS", flush=True)
                observations["revision_limit"] = revision_limit(client, observer, seed)
                observations["terminal_write_fence"] = terminal_write_fence(client, observer, connect_db, seed)
                print("Revision overflow rollback and terminal write fencing Run PASS", flush=True)
                observations.update(assignment_publication(client, observer, connect_db, seed))
                print("Publication and unpublication against admitted Create PASS", flush=True)
                observations["capture_claim"] = capture_retirement(client, observer, connect_db, seed, lane / "captures")
                print("Capture retirement and claim lock chain PASS", flush=True)
                observations["websocket_claim"] = claim_websocket(client, observer, connect_db, seed)
                print("Live WebSocket claim and new owner terminal event PASS", flush=True)
        assert observer.execute("SELECT COUNT(*) FROM lab_leases").fetchone() == (0,)
    assert sha256(native.read_bytes()).hexdigest() == candidate
    (root / "observations.json").write_text(json.dumps({
        "status": "PASS", "candidate_sha256": candidate, "reference_manifest_sha256": REFERENCE_SHA256,
        "harness_sha256": sha256(Path(__file__).read_bytes()).hexdigest(),
        "hardware_sha256": sha256(hardware.read_bytes()).hexdigest(), "worker_sha256": WORKER_SHA256,
        "database_names": names, "observations": observations, "owned_service_teardown": "PASS",
    }, indent=2) + "\n", encoding="utf-8")


SEED_UNSAFE_RECOVERY = """
from contextlib import closing
from app.config import Settings
from app.services.persistence import Repository

with closing(Repository(Settings().database_url)) as repo:
    experiment = {
        "schema_version": "1.0", "experiment_id": "fixture-recovery", "circuit_id": "fixture-circuit",
        "station_id": "physical-station-01", "mode": "hardware", "assignment_id": None,
        "state": "RUNNING", "state_history": ["CREATED", "QUEUED", "RESERVED", "RUNNING"],
        "revision": 3, "queue_position": None, "capture": None, "error_code": None,
        "lease_expires_at": 200.0, "_reservation_generation": "6" * 32,
    }
    repo.create_experiment("historical-owner", experiment)
    assert repo.reserve("physical-station-01", 0, experiment["experiment_id"], experiment["lease_expires_at"])
"""


def test_stage4_postgres_recovery_audit_rollback_then_quarantine():
    root = artifact_directory(f"stage4-postgres-races/unsafe-recovery-{uuid4().hex}")
    print(f"Stage 4 PostgreSQL recovery audit retry: {root}", flush=True)
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    candidate = sha256(native.read_bytes()).hexdigest()
    assert candidate == os.environ["CIRNET_STAGE4_PG_RACES_CANDIDATE_SHA256"]
    source, copy, names = _database(root, "postgres")
    seeded = subprocess.run([str(python), "-I", "-B", "-c", SEED_UNSAFE_RECOVERY], cwd=root,
                            env=environment(root, source), capture_output=True, timeout=60)
    (root / "seed.stderr.log").write_bytes(seeded.stderr)
    assert seeded.returncode == 0, "Cannot seed the historical physical lease."
    lane, url = copy("rust")
    native_url = url.replace("postgresql+psycopg://", "postgresql://", 1)
    env = {**environment(lane, url), "CIRNET_CONTRACTS_ROOT": str(contracts),
           "CIRNET_SIM_CPP_WORKER": str(worker), "CIRNET_SIM_CPP_WORKER_SHA256": WORKER_SHA256,
           "CIRNET_SIMULATION_BACKEND": "cpp"}
    command = [str(native), "--listen", "127.0.0.1:0", "--exit-on-stdin-eof"]
    with psycopg.connect(native_url, autocommit=True, connect_timeout=5) as db:
        original = db.execute("SELECT payload::text FROM lab_experiments WHERE experiment_id='fixture-recovery'").fetchone()
        lease_query = "SELECT station_id,slot,expires_at,quarantined FROM lab_leases WHERE experiment_id='fixture-recovery'"
        audit_query = "SELECT action FROM auth_audit WHERE subject_id='fixture-recovery' ORDER BY sequence"
        assert db.execute(lease_query).fetchall() == [("physical-station-01", 0, 200.0, False)]
        db.execute("""
            CREATE FUNCTION fixture_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'fixture recovery audit unavailable'; END $$;
        """)
        db.execute("""
            CREATE TRIGGER fixture_refuse_audit BEFORE INSERT ON auth_audit FOR EACH ROW
            WHEN (NEW.subject_id='fixture-recovery' AND NEW.action='EXPERIMENT_RESTART_QUARANTINED')
            EXECUTE FUNCTION fixture_refuse_audit()
        """)
        with native_service(lane, env, {"executable": hardware, "contracts": contracts}) as (_, (port, _)):
            env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{port}"
            failure = subprocess.run(command, cwd=lane, env=env, input=b"", capture_output=True, timeout=25)
            (lane / "refused-startup.log").write_bytes(failure.stdout + failure.stderr)
            assert failure.returncode == 2 and b"CIRNET_REMOTE_READY" not in failure.stdout
            assert b"Scheduler recovery failed" in failure.stderr
            assert db.execute("SELECT payload::text FROM lab_experiments WHERE experiment_id='fixture-recovery'").fetchone() == original
            assert db.execute(lease_query).fetchall() == [("physical-station-01", 0, 200.0, False)]
            assert not db.execute(audit_query).fetchall()
            db.execute("DROP TRIGGER fixture_refuse_audit ON auth_audit")
            with _http_service(command, lane, env) as client:
                assert client.get("/api/health").status_code == 200
            row = db.execute("SELECT payload FROM lab_experiments WHERE experiment_id='fixture-recovery'").fetchone()[0]
            assert row["state"] == "FAULT" and row["error_code"] == "RESTART_RECOVERY"
            assert row["state_history"] == ["CREATED", "QUEUED", "RESERVED", "RUNNING", "FAULT"]
            assert row["revision"] == 4 and row["lease_expires_at"] is None
            assert row.get("_reservation_generation") is None
            assert db.execute(lease_query).fetchall() == [("physical-station-01", 0, 200.0, True)]
            assert db.execute(audit_query).fetchall() == [("EXPERIMENT_RESTART_QUARANTINED",)]
    (root / "observations.json").write_text(json.dumps({
        "status": "PASS", "candidate_sha256": candidate, "reference_manifest_sha256": REFERENCE_SHA256,
        "harness_sha256": sha256(Path(__file__).read_bytes()).hexdigest(), "database_names": names,
        "audit_failure_rolled_back": True, "raw_payload_preserved_before_retry": True,
        "retry_terminal_state": "FAULT", "retry_lease_quarantined": True,
        "retry_generation_revoked": True, "retry_audit_count": 1, "physical_hil": "NOT RUN",
    }, indent=2) + "\n", encoding="utf-8")
