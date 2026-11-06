"""Explicit isolated PostgreSQL/NCAP and scheduler cutover/rollback gate."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
from threading import Event, Lock
from time import monotonic, sleep
from uuid import uuid4

import grpc
import httpx
import psutil
import psycopg
from psycopg import sql
from sqlalchemy.engine import URL

from scripts.artifact_paths import artifact_directory, validate_artifact_directory
from scripts.benchmark_web_sessions import ORIGIN, graph, stop_owned_backend, verify_digital_evidence
from tests.integration.native_hardware_gate_cases import native_service
from tests.integration.native_remote_gate_cases import (
    READY, REFERENCE_SHA256, SEED, SERVE_REFERENCE, WORKER_SHA256, _environment, _select_reference,
)

NATIVE_ARGS = ["--listen", "127.0.0.1:0", "--exit-on-stdin-eof"]
DATABASE_PREFIX = "cirnet_stage4_cutover_"
INTERRUPTED = "2" * 32
QUEUED = "6" * 32
RUN_KEY = "cutover-interrupted-run"
QUEUE_KEY = "cutover-queued-run"
GENERATOR_KEY = "cutover-interrupted-generator"
AUTHORITY_KEY = 0x4349524E45540001
PHYSICAL = "physical-station-01"
VIRTUAL = "virtual-station-01"
TABLE_ORDERS = {
    "alembic_version": "version_num",
    "auth_sessions": "session_id",
    "auth_audit": "sequence",
    "lab_experiments": "experiment_id",
    "lab_experiment_runtime": "experiment_id",
    "lab_operations": "owner_id, kind, scope, operation_key",
    "lab_leases": "experiment_id",
    "lab_captures": "capture_id",
}


def _digest(path):
    return sha256(path.read_bytes()).hexdigest()


def _json_bytes(value):
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def _poll(predicate, timeout=12):
    deadline = monotonic() + timeout
    while monotonic() < deadline:
        value = predicate()
        if value:
            return value
        sleep(.025)
    raise AssertionError("Timed out waiting for the bounded cutover condition.")


def _port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=.3):
            return True
    except OSError:
        return False


def _retired(child, port):
    assert child.returncode == 0
    assert not _port_open(port), f"Retired listener still accepts a connection on port {port}."
    return {"pid": child.pid, "port": port, "exit": child.returncode, "listener_closed": True}


class OwnedPostgres:
    def __init__(self, state_file):
        owned = artifact_directory()
        assert state_file.is_absolute()
        assert validate_artifact_directory(state_file.parent).is_relative_to(owned)
        self.state = json.loads(state_file.read_bytes())
        self.data = validate_artifact_directory(Path(self.state["data_directory"]))
        assert self.data.is_relative_to(owned)
        secret_file = Path(self.state["password_file"]).resolve(strict=True)
        assert secret_file.is_relative_to(owned)
        assert self.state["host"] == "127.0.0.1"
        assert 1024 < self.state["port"] < 65536
        self.bin = Path(self.state["pg_ctl"]).resolve(strict=True).parent
        postgres = self.tool("postgres")
        assert Path(psutil.Process(self.state["server_pid"]).exe()).resolve(strict=True) == postgres
        assert _digest(postgres) == self.state["server_sha256"].lower()
        self.secret = secret_file.read_text(encoding="utf-8-sig").strip()
        self.databases = set()
        with self.connect("postgres") as db:
            path, host, port = db.execute(
                "SELECT current_setting('data_directory'), host(inet_server_addr()), inet_server_port()"
            ).fetchone()
        assert Path(path).resolve(strict=True) == self.data
        assert (host, port) == (self.state["host"], self.state["port"])

    def connect(self, database):
        assert database == "postgres" or database in self.databases
        return psycopg.connect(host=self.state["host"], port=self.state["port"],
                               user=self.state["admin_user"], password=self.secret, dbname=database,
                               connect_timeout=5, options="-c statement_timeout=5000", autocommit=True)

    def create(self, phase):
        assert phase in {"source", "native", "rollback"}
        name = DATABASE_PREFIX + phase + "_" + uuid4().hex[:12]
        assert re.fullmatch(DATABASE_PREFIX + r"(?:source|native|rollback)_[0-9a-f]{12}", name)
        with self.connect("postgres") as db:
            db.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(sql.Identifier(name)))
        self.databases.add(name)
        return name

    def url(self, database):
        assert database in self.databases
        return URL.create("postgresql+psycopg", username=self.state["admin_user"], password=self.secret,
                          host=self.state["host"], port=self.state["port"], database=database
                          ).render_as_string(hide_password=False)

    def tool(self, name):
        tool = self.bin / (name + (".exe" if os.name == "nt" else ""))
        assert tool.is_file()
        return tool.resolve(strict=True)

    def run(self, name, database, args, directory):
        assert database in self.databases
        env = {key: value for key, value in os.environ.items() if not key.upper().startswith("PG")}
        env.update(PGHOST=self.state["host"], PGPORT=str(self.state["port"]), PGUSER=self.state["admin_user"],
                   PGPASSWORD=self.secret, PGDATABASE=database, PGCONNECT_TIMEOUT="5")
        log = directory / f"{name}.log"
        with log.open("wb") as output:
            result = subprocess.run([str(self.tool(name)), *args], cwd=directory, env=env,
                                    stdout=output, stderr=subprocess.STDOUT, timeout=60)
        assert result.returncode == 0, f"{name} failed for isolated {database}; see {log}."

    def clients(self, database):
        assert database in self.databases
        with self.connect("postgres") as db:
            return db.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=%s", (database,)).fetchone()[0]

    def holders(self, database):
        assert database in self.databases
        with self.connect("postgres") as db:
            return [pid for (pid,) in db.execute(
                """SELECT lock.pid FROM pg_locks lock JOIN pg_database catalog ON catalog.oid=lock.database
                   WHERE catalog.datname=%s AND lock.locktype='advisory' AND lock.granted
                     AND lock.mode='ExclusiveLock' AND lock.objsubid=1
                     AND lock.classid::bigint=%s AND lock.objid::bigint=%s""",
                (database, AUTHORITY_KEY >> 32, AUTHORITY_KEY & 0xffffffff),
            ).fetchall()]

    def terminate_authority(self, database):
        holders = self.holders(database)
        assert len(holders) == 1
        pid = holders[0]
        with self.connect("postgres") as db:
            stopped = db.execute(
                """SELECT pg_terminate_backend(activity.pid) FROM pg_stat_activity activity
                   JOIN pg_locks lock ON lock.pid=activity.pid
                   WHERE activity.pid=%s AND activity.datname=%s AND lock.locktype='advisory'
                     AND lock.granted AND lock.mode='ExclusiveLock' AND lock.objsubid=1
                     AND lock.classid::bigint=%s AND lock.objid::bigint=%s""",
                (pid, database, AUTHORITY_KEY >> 32, AUTHORITY_KEY & 0xffffffff),
            ).fetchone()
        assert stopped == (True,)
        _poll(lambda: not self.holders(database))
        return pid

    def snapshot(self, database):
        with self.connect(database) as db:
            tables = {}
            for table, order in TABLE_ORDERS.items():
                query = sql.SQL("SELECT to_jsonb(item) FROM (SELECT * FROM {} ORDER BY {}) AS item").format(
                    sql.Identifier(table), sql.SQL(order))
                tables[table] = [value for (value,) in db.execute(query).fetchall()]
        assert tables["alembic_version"] == [{"version_num": "0007_auth_maintenance"}]
        return tables


def _file_inventory(directory):
    inventory = {}
    for path in sorted(directory.iterdir()):
        assert path.is_file() and not path.is_symlink() and re.fullmatch(r"[0-9a-f]{32}\.ncap", path.name)
        inventory[path.name] = {"sha256": _digest(path), "bytes": path.stat().st_size}
    return inventory


def _verify_capture_pair(rows, captures):
    files = _file_inventory(captures)
    available = {row["capture_id"] + ".ncap": row["metadata"]
                 for row in rows["lab_captures"] if row["available"]}
    assert files.keys() == available.keys()
    for filename, metadata in available.items():
        assert files[filename]["sha256"] == metadata["sha256"]
        assert files[filename]["bytes"] == metadata["payload_byte_count"]
        verify_digital_evidence(metadata, (captures / filename).read_bytes())
    return files


def _backup(pg, database, captures, pair):
    assert pg.clients(database) == 0 and not pg.holders(database)
    pair.mkdir()
    rows = pg.snapshot(database)
    files = _verify_capture_pair(rows, captures)
    archive = pair / "database.dump"
    pg.run("pg_dump", database, ["--format=custom", "--no-owner", "--no-privileges", f"--file={archive}"], pair)
    shutil.copytree(captures, pair / "captures")
    assert _verify_capture_pair(rows, pair / "captures") == files
    proof = {"database": database, "archive_sha256": _digest(archive), "schema": "0007_auth_maintenance",
             "row_sha256": sha256(_json_bytes(rows)).hexdigest(), "captures": files}
    (pair / "pair.json").write_bytes(_json_bytes(proof))
    return rows, proof


def _restore(pg, database, pair, captures, rows, proof):
    assert pg.clients(database) == 0 and not pg.holders(database)
    assert not any(captures.iterdir())
    with pg.connect(database) as db:
        assert db.execute("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'").fetchone() == (0,)
    archive = pair / "database.dump"
    assert _digest(archive) == proof["archive_sha256"]
    assert _verify_capture_pair(rows, pair / "captures") == proof["captures"]
    pg.run("pg_restore", database, ["--exit-on-error", "--no-owner", "--no-privileges", f"--dbname={database}", str(archive)], captures.parent)
    shutil.copytree(pair / "captures", captures, dirs_exist_ok=True)
    restored = pg.snapshot(database)
    assert restored == rows
    assert sha256(_json_bytes(restored)).hexdigest() == proof["row_sha256"]
    assert _verify_capture_pair(restored, captures) == proof["captures"]
    assert pg.clients(database) == 0 and not pg.holders(database)

@contextmanager
def _remote(command, directory, env):
    log = directory / "remote.log"
    with log.open("wb") as output, subprocess.Popen(
        command, cwd=directory, env=env, stdin=subprocess.PIPE, stdout=output, stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    ) as child:
        def ready():
            assert child.poll() is None, f"Remote exited before readiness; see {log}."
            match = READY.search(log.read_bytes())
            if match:
                port = int(match.group(1))
                if _port_open(port):
                    return port
            return None

        try:
            port = _poll(ready, 30)
            with httpx.Client(base_url=f"http://127.0.0.1:{port}", trust_env=False, timeout=10) as client:
                yield child, port, client
        finally:
            stop_owned_backend(child, psutil)


def _competing(command, directory, env):
    log = directory / "competing-native.log"
    with log.open("wb") as output:
        result = subprocess.run(command, cwd=directory, env=env, stdin=subprocess.DEVNULL,
                                stdout=output, stderr=subprocess.STDOUT, timeout=15)
    payload = log.read_bytes()
    assert result.returncode == 2 and READY.search(payload) is None
    assert b"Scheduler authority unavailable" in payload
    return {"exit": result.returncode, "ready": False, "reason": "Scheduler authority unavailable"}


def _phase(root, name, pg, database, worker, contracts):
    path = root / name
    path.mkdir()
    env = _environment(path, path / "unused.sqlite")
    env.update(
        CIRNET_DATABASE_URL=pg.url(database), CIRNET_SIM_CPP_WORKER=str(worker),
        CIRNET_SIM_CPP_WORKER_SHA256=WORKER_SHA256, CIRNET_CONTRACTS_ROOT=str(contracts),
        CIRNET_SIMULATION_BACKEND="cpp", CIRNET_REMOTE_READ_ONLY="false",
        CIRNET_HARDWARE_START_RENDEZVOUS="0",
    )
    return path, env


def _reference_script(python, code, directory, env, name, data=None):
    input_bytes = _json_bytes(data) if data is not None else None
    result = subprocess.run([str(python), "-I", "-B", "-c", code], cwd=directory, env=env,
                            input=input_bytes, capture_output=True, timeout=60)
    log = directory / f"{name}.stderr.log"
    log.write_bytes(result.stderr)
    assert result.returncode == 0, f"Exact Python fixture {name} failed; see {log}."
    return json.loads(result.stdout)


def _headers(actor, key=None):
    value = {"Cookie": "cirnet_session=" + actor["token"], "X-CIRNET-CSRF": actor["csrf"],
             "Origin": ORIGIN, "X-Control-Client": "stage4-cutover"}
    if key:
        value["Idempotency-Key"] = key
    return value


def _request(client, actor, method, path, status=200, *, key=None, **kwargs):
    reply = client.request(method, path, headers=_headers(actor, key), **kwargs)
    assert reply.status_code == status, (method, path, reply.status_code, reply.text[:400])
    return reply


def _payload(label):
    return {"station_id": VIRTUAL, "circuit_graph": graph(label),
            "capture_config": {"signals": ["G.Y1"], "duration_ns": 40, "max_events": 100},
            "test_vectors": [{"time_ns": 20, "inputs": {"X.OUT": 1}}]}


def _create(client, actor, label):
    response = _request(client, actor, "POST", "/api/experiments", 201,
                        key="cutover-create-" + label, json=_payload(label)).json()
    assert response["state"] == "CREATED"
    return response["experiment_id"]


def _run(client, actor, eid, label):
    reply = _request(client, actor, "POST", f"/api/experiments/{eid}/run",
                     key="cutover-run-" + label).json()
    assert reply["experiment_id"] == eid


def _terminal(client, actor, eid):
    def finished():
        record = _request(client, actor, "GET", f"/api/experiments/{eid}").json()
        if record["state"] in {"FAULT", "COMPLETE"} and record["lease_expires_at"] is None:
            return record
        return None
    return _poll(finished)


def _capture(client, actor, metadata):
    binary = _request(client, actor, "GET", metadata["payload_ref"]).content
    assert verify_digital_evidence(metadata, binary) == 3
    return binary


SEED_INTERRUPTION = r"""
from contextlib import closing
import json
import sys
import time
from app.config import Settings
from app.services.auth import AuthService
from app.services.operations import request_fingerprint
from app.services.persistence import Repository

seed = json.load(sys.stdin)
settings = Settings()
with closing(Repository(settings.database_url)) as repo:
    auth = AuthService(repo, settings)
    current = auth.current(seed["cookie"])
    assert current and current.owner_id
    owner, eid = current.owner_id, seed["experiment_id"]
    assignment = repo.create_assignment({
        "schema_version":"1.0","assignment_id":"stage4-cutover-historical","title":"Historical interrupted control",
        "lab_endpoints":[],"assessment_policy":"STRICT_TOPOLOGY",
    }, owner_id=owner, published=True)
    prior = repo.get_experiment(seed["completed_id"], owner)
    expires = time.time() + 120
    row = {**prior, "experiment_id":eid, "station_id":"physical-station-01", "mode":"hardware",
           "state":"RUNNING","state_history":["CREATED","QUEUED","RESERVED","SAFE_STATE","RUNNING"],
           "revision":4,"error_code":None,"lease_expires_at":expires,"queue_position":None,"capture":None,
           "assignment_id":assignment["assignment_id"],"_assignment_snapshot":assignment,
           "_reservation_generation":"3"*32, "_control_session_id":current.session_id,
           "_control_client_id":"stage4-cutover", "_run_operation_key":seed["run_key"]}
    row.pop("_operation", None)
    repo.create_experiment(owner, row, auth_session_id=current.session_id,
                           authorize_session=auth.require_principal_session)
    assert repo.reserve(row["station_id"], 0, eid, expires)
    run = repo.begin_operation(owner, "run", seed["run_key"], eid,
                               request_fingerprint({"experiment_id":eid}))
    configuration = {"channel":1,"waveform":"SINE","frequency_hz":1000,"amplitude_vpp":1,"offset_v":0,"enabled":True}
    generator = {"schema_version":"1.0","experiment_id":eid,"operation_key":seed["generator_key"],
                 "status":"REQUESTED","revision":0,"accepted":False,"hardware_applied":False,
                 "error_code":None,"configuration":configuration}
    repo.begin_instrument_command(owner, generator, request_fingerprint({"experiment_id":eid,"configuration":configuration}),
                                  current.session_id, auth.require_principal_session)
    assert run["status"] == "REQUESTED"

    queued_actor = auth.current(seed["queued_cookie"])
    assert queued_actor and queued_actor.owner_id != owner
    queued = {**row, "experiment_id":seed["queued_id"], "state":"QUEUED", "revision":1,
              "state_history":["CREATED","QUEUED"], "lease_expires_at":None, "queue_position":1,
              "_queue_sequence":1, "_control_session_id":queued_actor.session_id,
              "_run_operation_key":seed["queue_key"]}
    queued.pop("_reservation_generation")
    repo.create_experiment(queued_actor.owner_id, queued, auth_session_id=queued_actor.session_id,
                           authorize_session=auth.require_principal_session)
    repo.begin_operation(queued_actor.owner_id, "run", seed["queue_key"], queued["experiment_id"],
                         request_fingerprint({"experiment_id":queued["experiment_id"]}))
    print(json.dumps({"owner":owner, "queued_owner":queued_actor.owner_id, "expires_at":expires}))
"""


def _interrupted(rows, owner, quarantined):
    leases = [row for row in rows["lab_leases"] if row["experiment_id"] == INTERRUPTED]
    assert len(leases) == 1
    lease = leases[0]
    assert lease["station_id"] == PHYSICAL and lease["slot"] == 0 and lease["quarantined"] is quarantined
    record = next(row for row in rows["lab_experiments"] if row["experiment_id"] == INTERRUPTED)
    assert record["owner_id"] == owner and record["payload"]["capture"] is None
    assert record["payload"]["state"] == ("FAULT" if quarantined else "RUNNING")
    if quarantined:
        assert record["payload"]["error_code"] == "RESTART_RECOVERY"
        assert record["payload"]["lease_expires_at"] is None
        assert any(row["subject_id"] == INTERRUPTED and row["action"] == "EXPERIMENT_RESTART_QUARANTINED"
                   for row in rows["auth_audit"])
    operations = [row for row in rows["lab_operations"] if row["scope"] == INTERRUPTED]
    assert {(row["kind"], row["operation_key"]) for row in operations} == {
        ("generator", GENERATOR_KEY), ("run", RUN_KEY),
    }
    for row in operations:
        assert row["owner_id"] == owner and row["payload"]["status"] == "REQUESTED"
        assert row["payload"]["revision"] == 0 and row["payload"]["error_code"] is None
    return {"lease": lease, "operations": operations}


def _queued(rows, owner, state):
    record = next(row for row in rows["lab_experiments"] if row["experiment_id"] == QUEUED)
    payload = record["payload"]
    assert record["owner_id"] == owner and payload["station_id"] == PHYSICAL
    assert payload["state"] == state and payload["capture"] is None
    assert payload["lease_expires_at"] is None
    assert not any(row["experiment_id"] == QUEUED for row in rows["lab_leases"])
    if state == "QUEUED":
        assert payload["queue_position"] == 1 and payload["_queue_sequence"] == 1
        assert payload["state_history"] == ["CREATED", "QUEUED"]
    else:
        assert payload["queue_position"] is None and payload["error_code"] == "DISCONNECTED"
        assert payload["state_history"] == ["CREATED", "QUEUED", "COMPLETE"]
    [intent] = [row for row in rows["lab_operations"] if row["scope"] == QUEUED]
    assert intent["owner_id"] == owner and intent["operation_key"] == QUEUE_KEY and intent["kind"] == "run"
    assert intent["payload"]["status"] == "REQUESTED" and intent["payload"]["revision"] == 0
    return intent


def _read_pending(client, actor):
    run = _request(client, actor, "GET", f"/api/operations/{RUN_KEY}",
                   params={"kind": "run", "experiment_id": INTERRUPTED}).json()
    command = _request(client, actor, "GET",
                       f"/api/experiments/{INTERRUPTED}/instruments/commands/{GENERATOR_KEY}").json()
    assert run["status"] == command["status"] == "REQUESTED"
    assert run["experiment"]["state"] == "FAULT" and run["experiment"]["capture"] is None
    assert command["accepted"] is False and command["hardware_applied"] is False

class HardwareRelay(grpc.GenericRpcHandler):
    """Hold successful replies after forwarding them to the exact loopback Hardware."""

    def __init__(self, target):
        from contracts.generated import rpc_v2_pb2 as pb

        self.pb = pb
        self.channel = grpc.insecure_channel(target)
        self.lock = Lock()
        self.calls = []
        self.held_id = None
        self.start_ready = Event()
        self.start_release = Event()
        self.cleanup_ready = Event()
        self.cleanup_release = Event()

    def service(self, details):
        return grpc.unary_unary_rpc_method_handler(lambda payload, context: self.forward(details.method, payload, context))

    def forward(self, method, payload, context):
        name = method.rsplit("/", 1)[-1]
        eid = self.pb.Target.FromString(payload).experiment_id if name in {"StartExecution", "StopExecution"} else None
        with self.lock:
            row = {"method": name, "experiment_id": eid, "request_bytes": len(payload)}
            self.calls.append(row)
            ordinal = sum(call["method"] == name and call["experiment_id"] == eid for call in self.calls)
        try:
            response = self.channel.unary_unary(method)(payload, timeout=context.time_remaining())
        except grpc.RpcError as error:
            context.abort(error.code(), "Isolated Hardware RPC failed.")
        if eid:
            reply = self.pb.OperationReply.FromString(response)
            result = json.loads(reply.result_json)
            with self.lock:
                row.update(accepted=reply.accepted and result.get("accepted") is True,
                           hardware_applied=result.get("hardware_applied"), code=self.pb.ErrorCode.Name(reply.code))
        if eid and eid == self.held_id:
            if name == "StartExecution":
                self.start_ready.set()
                if not self.start_release.wait(12):
                    context.abort(grpc.StatusCode.DEADLINE_EXCEEDED, "Start test reply was not released.")
            if name == "StopExecution" and ordinal == 2:
                self.cleanup_ready.set()
                if not self.cleanup_release.wait(2):
                    context.abort(grpc.StatusCode.DEADLINE_EXCEEDED, "Cleanup test reply was not released.")
        with self.lock:
            row["reply_sent"] = True
        return response

    def observed(self):
        with self.lock:
            return [dict(row) for row in self.calls]


@contextmanager
def _relay(hardware_port):
    relay = HardwareRelay(f"127.0.0.1:{hardware_port}")
    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="cutover-grpc") as pool:
        server = grpc.server(pool)
        server.add_generic_rpc_handlers([relay])
        port = server.add_insecure_port("127.0.0.1:0")
        assert 1024 < port < 65536
        server.start()
        try:
            yield relay, port
        finally:
            relay.start_release.set()
            relay.cleanup_release.set()
            assert server.stop(1).wait(5)
            relay.channel.close()
    assert not _port_open(port)


def _assert_no_replay(calls):
    assert any(row["method"] == "StopExecution" and row["experiment_id"] == INTERRUPTED
               and row.get("accepted") is False for row in calls)
    assert all(row["method"] not in {"StartExecution", "ConfigureInstrument", "GuardedPowerUp"} for row in calls)


def _lease_exists(pg, database, eid):
    with pg.connect(database) as db:
        return db.execute("SELECT EXISTS(SELECT 1 FROM lab_leases WHERE experiment_id=%s)", (eid,)).fetchone()[0]


def _authority_loss(client, actor, relay, pg, database):
    eid = _create(client, actor, "lost-authority")
    relay.held_id = eid
    _run(client, actor, eid, "lost-authority")
    try:
        assert relay.start_ready.wait(7), "Exact Hardware Start reply did not reach the test relay."
        before = relay.observed()
        assert before[-1]["method"] == "StartExecution" and before[-1]["experiment_id"] == eid
        assert before[-1]["accepted"] is True and not before[-1].get("reply_sent")
        assert _lease_exists(pg, database, eid)
        terminated = pg.terminate_authority(database)

        def early_stop():
            return next((row for row in relay.observed()[len(before):]
                         if row["method"] == "StopExecution" and row["experiment_id"] == eid
                         and row.get("reply_sent")), None)

        early = _poll(early_stop, 7)
        assert early["accepted"] is True
        rejected = _request(client, actor, "POST", "/api/experiments", 503,
                            key="cutover-denied-after-loss", json=_payload("denied-after-loss"))
        assert rejected.json()["code"] == "UNAVAILABLE"
        assert _lease_exists(pg, database, eid), "Early safe ACK released the durable lease."
        assert not pg.holders(database)
        relay.start_release.set()
        assert relay.cleanup_ready.wait(6), "Worker did not send its independent cleanup Stop."
        assert _lease_exists(pg, database, eid), "Lease released before the cleanup ACK reached Remote."
        pending = [row for row in relay.observed()[len(before):] if row["experiment_id"] == eid]
        assert len(pending) == 2 and all(row["method"] == "StopExecution" and row["accepted"] is True for row in pending)
        assert not pending[-1].get("reply_sent")
        relay.cleanup_release.set()
        terminal = _terminal(client, actor, eid)
        assert terminal["capture"] is None and "CAPTURING" not in terminal["state_history"]
        assert not _lease_exists(pg, database, eid) and not pg.holders(database)
        # Observe a second monitor interval and mutation attempt after cleanup.
        sleep(1.1)
        repeated = _request(client, actor, "POST", "/api/experiments", 503,
                            key="cutover-still-denied", json=_payload("still-denied"))
        assert repeated.json()["code"] == "UNAVAILABLE" and not pg.holders(database)
        tail = relay.observed()[len(before):]
        assert len(tail) == 2 and all(row["method"] == "StopExecution" and row.get("reply_sent") for row in tail)
        return {"experiment_id": eid, "terminated_backend": terminated, "reconnected": False,
                "rejected_admission": rejected.status_code, "second_monitor_check": repeated.status_code,
                "early_ack_retained_lease": True,
                "late_start_capture_published": False, "stop_receipts": tail,
                "terminal_state": terminal["state"], "terminal_error": terminal["error_code"]}
    finally:
        relay.start_release.set()
        relay.cleanup_release.set()

def test_stage4_postgres_scheduler_cutover_and_rollback():
    root = artifact_directory(f"stage4-postgres-cutover/{uuid4().hex}")
    print(f"Stage 4 PostgreSQL cutover rehearsal: {root}", flush=True)
    pg = OwnedPostgres(Path(os.environ["CIRNET_STAGE4_CUTOVER_PG_STATE"]))
    python, hardware, worker, contracts = _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    digest = _digest(native)
    assert digest == os.environ["CIRNET_STAGE4_CUTOVER_NATIVE_SHA256"]
    candidate = {"executable": hardware, "contracts": contracts}
    old_command = [str(python), "-I", "-B", "-c", SERVE_REFERENCE]
    native_command = [str(native), *NATIVE_ARGS]

    source_db = pg.create("source")
    native_db = pg.create("native")
    rollback_db = pg.create("rollback")
    source, source_env = _phase(root, "source", pg, source_db, worker, contracts)
    seed = _reference_script(python, SEED, source, source_env, "seed")
    actor = seed["stage4_alice"]
    foreign = seed["stage4_bob"]
    with native_service(source, source_env, candidate) as (old_hardware, (old_target, _)):
        source_env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{old_target}"
        with _remote(old_command, source, source_env) as (old_remote, old_port, client):
            source_eid = _create(client, actor, "prior-artifact")
            _run(client, actor, source_eid, "prior-artifact")
            completed = _terminal(client, actor, source_eid)
            assert completed["state"] == "COMPLETE" and not _lease_exists(pg, source_db, source_eid)
            metadata = completed["capture"]
            original = _capture(client, actor, metadata)
    source_retired = {"remote": _retired(old_remote, old_port), "hardware": _retired(old_hardware, old_target)}
    assert pg.clients(source_db) == 0 and not pg.holders(source_db)

    # Populate a historical interruption only after both original processes are
    # gone. The fixture establishes durable state without actuating physical I/O.
    fixture = _reference_script(python, SEED_INTERRUPTION, source, source_env, "interrupted-lease", {
        "cookie": actor["token"], "experiment_id": INTERRUPTED, "completed_id": source_eid,
        "run_key": RUN_KEY, "generator_key": GENERATOR_KEY,
        "queued_cookie": foreign["token"], "queued_id": QUEUED, "queue_key": QUEUE_KEY,
    })
    original_pair = root / "prior-artifact-pair"
    original_rows, original_proof = _backup(pg, source_db, source / "captures", original_pair)
    interrupted = _interrupted(original_rows, fixture["owner"], False)
    assert interrupted["lease"]["expires_at"] == fixture["expires_at"]

    destination, native_env = _phase(root, "native", pg, native_db, worker, contracts)
    _restore(pg, native_db, original_pair, destination / "captures", original_rows, original_proof)
    restored_prior = pg.snapshot(native_db)
    # Inspect the durable queue before any candidate Hardware connection.
    # Keep it held because its station already has an unresolved lease.
    queued_intent = _queued(restored_prior, fixture["queued_owner"], "QUEUED")
    assert _interrupted(restored_prior, fixture["owner"], False)["lease"]["station_id"] == PHYSICAL
    assert not _port_open(old_target)
    with native_service(destination, native_env, candidate) as (native_hardware, (r2_port, _)):
        with _relay(r2_port) as (relay, native_target):
            assert native_target != old_target and r2_port != old_target
            native_env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{native_target}"
            with _remote(native_command, destination, native_env) as (native_remote, native_port, client):
                initial = pg.snapshot(native_db)
                recovered = _interrupted(initial, fixture["owner"], True)
                assert _queued(initial, fixture["queued_owner"], "QUEUED") == queued_intent
                assert recovered["operations"] == interrupted["operations"]
                assert recovered["lease"]["expires_at"] == interrupted["lease"]["expires_at"]
                _read_pending(client, actor)
                assert _capture(client, actor, metadata) == original
                _request(client, foreign, "GET", metadata["payload_ref"], 403)
                pre_contention = relay.observed()
                _assert_no_replay(pre_contention)
                holder = pg.holders(native_db)
                assert len(holder) == 1
                competing = _competing(native_command, destination, native_env)
                assert pg.holders(native_db) == holder
                assert relay.observed() == pre_contention
                loss = _authority_loss(client, actor, relay, pg, native_db)
                assert loss["terminated_backend"] == holder[0]
            native_remote_retired = _retired(native_remote, native_port)
        assert not _port_open(native_target)
    native_retired = {"remote": native_remote_retired, "hardware": _retired(native_hardware, r2_port),
                      "configured_target": {"port": native_target, "listener_closed": True}}
    assert pg.clients(native_db) == 0 and not pg.holders(native_db)

    rollback_pair = root / "candidate-era-pair"
    rollback_rows, rollback_proof = _backup(pg, native_db, destination / "captures", rollback_pair)
    pending = _interrupted(rollback_rows, fixture["owner"], True)
    assert _queued(rollback_rows, fixture["queued_owner"], "COMPLETE") == queued_intent
    assert pending["operations"] == interrupted["operations"]
    assert rollback_proof["captures"] == original_proof["captures"]
    assert not any(row["experiment_id"] == loss["experiment_id"] for row in rollback_rows["lab_leases"])

    restored, rollback_env = _phase(root, "rollback", pg, rollback_db, worker, contracts)
    _restore(pg, rollback_db, rollback_pair, restored / "captures", rollback_rows, rollback_proof)
    pre_reconnect = pg.snapshot(rollback_db)
    assert _interrupted(pre_reconnect, fixture["owner"], True) == pending
    assert _queued(pre_reconnect, fixture["queued_owner"], "COMPLETE") == queued_intent
    assert not pg.holders(rollback_db)
    assert not _port_open(native_target) and not _port_open(r2_port)
    with native_service(restored, rollback_env, candidate) as (rollback_hardware, (rollback_r2, _)):
        with _relay(rollback_r2) as (relay, rollback_target):
            assert {rollback_target, rollback_r2}.isdisjoint({old_target, native_target, r2_port})
            rollback_env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{rollback_target}"
            with _remote(old_command, restored, rollback_env) as (rollback_remote, rollback_port, client):
                _read_pending(client, actor)
                assert _capture(client, actor, metadata) == original
                _request(client, foreign, "GET", metadata["payload_ref"], 403)
                _assert_no_replay(relay.observed())
            rollback_remote_retired = _retired(rollback_remote, rollback_port)
    assert pg.clients(rollback_db) == 0 and not pg.holders(rollback_db)
    after_rollback = pg.snapshot(rollback_db)
    assert _interrupted(after_rollback, fixture["owner"], True) == pending
    assert _queued(after_rollback, fixture["queued_owner"], "COMPLETE") == queued_intent
    assert _verify_capture_pair(rollback_rows, restored / "captures") == rollback_proof["captures"]

    assert _digest(native) == digest
    receipt = {
        "status": "PASS", "scope": "isolated PostgreSQL scheduler cutover and rollback with real process owners",
        "reference_manifest_sha256": REFERENCE_SHA256, "candidate_sha256": digest,
        "hardware_sha256": _digest(hardware), "worker_sha256": _digest(worker),
        "harness_sha256": _digest(Path(__file__)), "postgres_server_sha256": pg.state["server_sha256"],
        "tools": {name: _digest(pg.tool(name)) for name in ("pg_dump", "pg_restore")},
        "prior": source_retired, "candidate": native_retired, "competing_native": competing,
        "rollback": {"remote": rollback_remote_retired, "hardware": _retired(rollback_hardware, rollback_r2),
                     "configured_target_closed": not _port_open(rollback_target),
                     "database": rollback_db, "pair_verified_before_reconnect": True,
                     "quarantine_verified_before_reconnect": True},
        "prior_pair": original_proof, "candidate_pair": rollback_proof,
        "interrupted_lease": {"experiment_id": INTERRUPTED, "station_id": PHYSICAL, "slot": 0,
                              "quarantined_after_recovery": True, "pending_commands_preserved": 2,
                              "physical_driver_present": False, "synthetic_historical_state": True},
        "restored_queue": {"experiment_id": QUEUED, "station_id": PHYSICAL,
                           "inspected_before_hardware": True, "held_by_quarantine": True,
                           "no_command_replay": True, "closed_before_rollback": "DISCONNECTED",
                           "requested_identity_preserved": True},
        "authority_loss": loss, "capture_sha256": sha256(original).hexdigest(),
        "capture_samples": 3, "loaded_stop": "NOT RUN",
        "injection": "Relay withheld successful exact R2 Start and final cleanup replies; no worker pause.",
    }
    (root / "cutover-summary.json").write_bytes(_json_bytes(receipt))
