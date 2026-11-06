"""Clock-driven WebSocket session and lease expiry against an exact Remote."""

from contextlib import contextmanager, nullcontext
from hashlib import sha256
import json
import os
from pathlib import Path
from time import monotonic
from uuid import uuid4

import pytest
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect

from tests.integration import native_remote_cutover_cases as cutover


EXPIRY_DELAY_SECONDS = 1.5
CONTROL_ID = "stage4-cutover"
SEED = cutover.SEED.replace(
    "    print(json.dumps(result))",
    """    session, _ = auth.ensure_session(None)
    observer, token = auth.login(session, 'stage4_alice', password, 'stage4-expiry-observer')
    result['observer'] = {'token': token, 'csrf': observer.csrf_token}
    print(json.dumps(result))""",
    1,
)


@contextmanager
def _control_socket(client, actor):
    url = str(client.base_url).rstrip("/").replace("http://", "ws://") + "/ws/events"
    with connect(url, origin=cutover.ORIGIN,
                 additional_headers={"Cookie": "cirnet_session=" + actor["token"]},
                 open_timeout=5, close_timeout=5, ping_interval=None, proxy=None) as websocket:
        assert json.loads(websocket.recv(timeout=5))["type"] == "hello"
        websocket.send(json.dumps({"type": "client.hello", "protocol_version": "1.0",
                                   "control_client_id": CONTROL_ID}))
        websocket.send("expiry-fixture-ready")
        assert json.loads(websocket.recv(timeout=5)) == {"type": "echo", "payload": "expiry-fixture-ready"}
        yield websocket


def _running_event(websocket, experiment_id):
    deadline = monotonic() + 4
    while monotonic() < deadline:
        event = json.loads(websocket.recv(timeout=max(0, deadline - monotonic())))
        if (event.get("type") == "experiment.updated" and event["experiment"]["experiment_id"] == experiment_id
                and event["experiment"]["state"] == "RUNNING"):
            return
    pytest.fail("The control socket did not observe RUNNING before expiry.")


def _await_server_close(websocket):
    deadline = monotonic() + 5
    server_events = []
    while monotonic() < deadline:
        try:
            event = json.loads(websocket.recv(timeout=max(0, deadline - monotonic())))
        except ConnectionClosed as closed:
            assert closed.rcvd is not None and closed.rcvd.code == 4401
            return closed.rcvd.code, server_events
        server_events.append(event["type"])
    pytest.fail("The quiet control socket did not close after its session expired.")


def _arm_expiry(db, case, experiment_id, token_hash):
    # Only the isolated fixture deadline changes. The service sees it cross
    # real PostgreSQL/Windows wall time during its ordinary monitor tick.
    future = "EXTRACT(EPOCH FROM clock_timestamp())::double precision + %s"
    if case == "session":
        initial = db.execute("SELECT auth_revision, revoked, expires_at FROM auth_sessions WHERE token_hash=%s",
                             (token_hash,)).fetchone()
        assert initial is not None and initial[1] is False
        (expiry,) = db.execute(
            f"UPDATE auth_sessions SET expires_at={future} WHERE token_hash=%s RETURNING expires_at",
            (EXPIRY_DELAY_SECONDS, token_hash),
        ).fetchone()
        assert expiry < initial[2]
    else:
        initial = None
        (expiry,) = db.execute(
            f"""UPDATE lab_leases SET expires_at={future}
                WHERE experiment_id=%s AND NOT quarantined RETURNING expires_at""",
            (EXPIRY_DELAY_SECONDS, experiment_id),
        ).fetchone()
    (armed_at,) = db.execute("SELECT EXTRACT(EPOCH FROM clock_timestamp())::double precision").fetchone()
    assert armed_at < expiry
    return armed_at, expiry, initial


def _stop_calls(relay, experiment_id):
    return [row for row in relay.observed()
            if row["method"] == "StopExecution" and row["experiment_id"] == experiment_id]


def _exercise(case, client, actor, observer, db, relay):
    experiment_id = cutover._create(client, actor, "clock-" + case)
    relay.held_id = experiment_id
    token_hash = sha256(actor["token"].encode()).hexdigest()
    lease_exists = lambda: db.execute(
        "SELECT EXISTS(SELECT 1 FROM lab_leases WHERE experiment_id=%s)", (experiment_id,)
    ).fetchone()[0]
    expected = "SESSION_EXPIRED" if case == "session" else "TIMEOUT"
    close_code, server_events = None, []
    with _control_socket(client, actor) if case == "session" else nullcontext() as websocket:
        cutover._run(client, actor, experiment_id, "clock-" + case)
        try:
            assert relay.start_ready.wait(7)
            start = next(row for row in relay.observed() if row["method"] == "StartExecution"
                         and row["experiment_id"] == experiment_id)
            assert start["accepted"] is True and not start.get("reply_sent")
            assert lease_exists() and not _stop_calls(relay, experiment_id)
            if websocket is not None:
                _running_event(websocket, experiment_id)
            armed_at, expiry, old_session = _arm_expiry(db, case, experiment_id, token_hash)
            if websocket is not None:
                # No client messages, pings or close requests after the deadline is armed.
                close_code, server_events = _await_server_close(websocket)

            def early_ack():
                calls = _stop_calls(relay, experiment_id)
                return calls[0] if len(calls) == 1 and calls[0].get("reply_sent") else None

            early = cutover._poll(early_ack, 5)
            assert early["accepted"] is True and early["code"] == "OK"
            (observed_at,) = db.execute(
                "SELECT EXTRACT(EPOCH FROM clock_timestamp())::double precision"
            ).fetchone()
            assert armed_at < expiry <= observed_at
            if case == "session":
                auth_revision, revoked, expires_at = db.execute(
                    "SELECT auth_revision, revoked, expires_at FROM auth_sessions WHERE token_hash=%s",
                    (token_hash,),
                ).fetchone()
                assert (auth_revision, revoked, expires_at) == (old_session[0], False, expiry)
            else:
                assert db.execute(
                    """SELECT revoked=FALSE AND expires_at > EXTRACT(EPOCH FROM clock_timestamp())
                       FROM auth_sessions WHERE token_hash=%s""", (token_hash,)
                ).fetchone() == (True,)
            pending = cutover._request(client, observer, "GET", f"/api/experiments/{experiment_id}").json()
            assert pending["state"] == "STOPPING" and pending["error_code"] == expected
            assert lease_exists(), "An early ACK must not release the lease."
            relay.start_release.set()
            assert relay.cleanup_ready.wait(6), "The independent cleanup Stop never reached the relay."
            calls = _stop_calls(relay, experiment_id)
            assert len(calls) == 2 and all(row["accepted"] is True and row["code"] == "OK" for row in calls)
            assert not calls[1].get("reply_sent") and lease_exists(), "Lease escaped the held cleanup ACK."
            relay.cleanup_release.set()
            terminal = cutover._terminal(client, observer, experiment_id)
            assert terminal["state"] == "COMPLETE" and terminal["error_code"] == expected
            assert terminal["state_history"][-5:] == ["RUNNING", "STOPPING", "SAFE_STATE", "RELEASE", "COMPLETE"]
            assert terminal["capture"] is None and "CAPTURING" not in terminal["state_history"]
            assert not lease_exists()
            assert db.execute("SELECT COUNT(*) FROM lab_captures WHERE experiment_id=%s",
                              (experiment_id,)).fetchone() == (0,)
            assert not any(row["method"] == "ReadCapture" for row in relay.observed())
            assert all(row["reply_sent"] for row in _stop_calls(relay, experiment_id))
            return {
                "trigger": case, "armed_wall_time": armed_at, "deadline_wall_time": expiry,
                "after_early_ack_wall_time": observed_at, "explicit_stop_or_revocation": False,
                "client_initiated_close": False, "quiet_ws_close_code": close_code,
                "server_event_types_before_close": server_events,
                "terminal_error": expected, "terminal_history": terminal["state_history"],
                "held_start_was_successful": True, "early_ack_retained_lease": True,
                "held_cleanup_ack_retained_lease": True, "released_after_cleanup_ack": True,
                "late_start_capture_published": False,
            }
        finally:
            relay.start_release.set()
            relay.cleanup_release.set()


@pytest.mark.parametrize("case", ["session", "lease"])
def test_stage4_clock_driven_session_and_lease_expiry(case):
    root = cutover.artifact_directory(f"stage4-clock-expiry/{case}-{uuid4().hex}")
    print(f"Stage 4 clock-driven {case} expiry: {root}", flush=True)
    pg = cutover.OwnedPostgres(Path(os.environ["CIRNET_STAGE4_CUTOVER_PG_STATE"]))
    python, hardware, worker, contracts = cutover._select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(cutover.artifact_directory())
    digest = cutover._digest(native)
    assert digest == os.environ["CIRNET_STAGE4_CUTOVER_NATIVE_SHA256"]
    database = pg.create("native")
    try:
        lane, env = cutover._phase(root, "native", pg, database, worker, contracts)
        seed = cutover._reference_script(python, SEED, lane, env, "seed")
        with cutover.native_service(lane, env, {"executable": hardware, "contracts": contracts}) as (r2, (port, _)):
            with cutover._relay(port) as (relay, relay_port):
                env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{relay_port}"
                with cutover._remote([str(native), *cutover.NATIVE_ARGS], lane, env) as (remote, remote_port, client):
                    with pg.connect(database) as db:
                        result = _exercise(case, client, seed["stage4_alice"], seed["observer"], db, relay)
                    (root / "functional-observations.json").write_bytes(cutover._json_bytes(result))
                remote_retired = cutover._retired(remote, remote_port)
        hardware_retired = cutover._retired(r2, port)
    finally:
        # Keep the owned fixture as evidence. Service connections and
        # scheduler authority must be gone before the receipt can pass.
        assert pg.clients(database) == 0 and not pg.holders(database)

    assert cutover._digest(native) == digest
    receipt = {
        "status": "PASS", "candidate_sha256": digest, "harness_sha256": cutover._digest(Path(__file__)),
        "reference_manifest_sha256": cutover.REFERENCE_SHA256, "hardware_sha256": cutover._digest(hardware),
        "worker_sha256": cutover.WORKER_SHA256, "postgres_server_sha256": pg.state["server_sha256"],
        "scope": "Controlled exact R2 reply transport. Start completed at Hardware before expiry.",
        "observations": result, "remote": remote_retired, "hardware": hardware_retired,
        "relay_listener_closed": True, "owned_database_preserved": database,
        "database_clients_remaining": 0, "scheduler_holders_remaining": 0,
    }
    (root / "expiry-summary.json").write_bytes(cutover._json_bytes(receipt))
