"""Owned Stage 4 supplemental proof of shutdown after a real startup Start."""

from contextlib import contextmanager
import json
import os
from pathlib import Path
import subprocess
from uuid import uuid4

from tests.integration import native_remote_cutover_cases as cutover

FIRST = "4" * 32
SECOND = "5" * 32
SECOND_STATION = "zz-recovery-unavailable"

SEED_QUEUES = r"""
from contextlib import closing
import json
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository

seed = json.load(sys.stdin)
settings = Settings()
with closing(Repository(settings.database_url)) as repo:
    auth = AuthService(repo, settings)
    for index, actor in enumerate(seed["actors"], 1):
        current = auth.current(actor["cookie"])
        assert current and current.owner_id
        graph = seed["configuration"]["circuit_graph"]
        payload = {
            "schema_version":"1.0","experiment_id":actor["id"],"circuit_id":graph["circuit_id"],
            "station_id":actor["station"],"assignment_id":None,"mode":"simulation",
            "state":"QUEUED","state_history":["CREATED","QUEUED"],"revision":1,
            "safety_verification":None,"topology_verification":None,"topology_resolution":None,
            "functional_verification":{"schema_version":"1.0","status":"NOT_EVALUATED","issues":[]},
            "execution_decision":None,"assessment":None,"capture":None,"error_code":None,
            "lease_expires_at":None,"queue_position":1,
            "_queue_sequence":index,"_assignment_snapshot":None,"_snapshot_provenance":"created",
            "_circuit_graph":graph,"_configuration":{
                "capture_config":seed["configuration"]["capture_config"],
                "test_vectors":seed["configuration"]["test_vectors"],
            },
            "_control_session_id":current.session_id,"_control_client_id":"startup-failure",
        }
        repo.create_experiment(current.owner_id, payload, auth_session_id=current.session_id,
                               authorize_session=auth.require_principal_session)
    print(json.dumps({"seeded":2}))
"""


class StartupRelay(cutover.HardwareRelay):
    def __init__(self, target):
        super().__init__(target)
        self.held_id = FIRST
        self.unavailable_checked_after_start = cutover.Event()

    def forward(self, method, payload, context):
        if (method.endswith("/GetCapabilities")
                and self.pb.Target.FromString(payload).station_id == SECOND_STATION):
            assert self.start_ready.wait(7), "First real Start was not observed before second-station recovery."
            self.unavailable_checked_after_start.set()
        return super().forward(method, payload, context)


@contextmanager
def relay_for(port):
    relay = StartupRelay(f"127.0.0.1:{port}")
    with cutover.ThreadPoolExecutor(max_workers=8) as pool:
        server = cutover.grpc.server(pool)
        server.add_generic_rpc_handlers([relay])
        target = server.add_insecure_port("127.0.0.1:0")
        assert 1024 < target < 65536
        server.start()
        try:
            yield relay, target
        finally:
            relay.start_release.set()
            relay.cleanup_release.set()
            assert server.stop(1).wait(5)
            relay.channel.close()


def test_stage4_postgres_startup_failure_after_real_start():
    root = cutover.artifact_directory(f"stage4-startup-touched/{uuid4().hex}")
    print(f"Stage 4 startup failure after real Start: {root}", flush=True)
    pg = cutover.OwnedPostgres(Path(os.environ["CIRNET_STAGE4_CUTOVER_PG_STATE"]))
    python, hardware, worker, contracts = cutover._select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    digest = cutover._digest(native)
    assert digest == os.environ["CIRNET_STAGE4_CUTOVER_NATIVE_SHA256"]
    database = pg.create("native")
    directory, env = cutover._phase(root, "native", pg, database, worker, contracts)
    seed = cutover._reference_script(python, cutover.SEED, directory, env, "auth-seed")
    cutover._reference_script(python, SEED_QUEUES, directory, env, "queue-seed", {
        "actors": [
            {"id":FIRST,"station":cutover.VIRTUAL,"cookie":seed["stage4_alice"]["token"]},
            {"id":SECOND,"station":SECOND_STATION,"cookie":seed["stage4_bob"]["token"]},
        ],
        "configuration":cutover._payload("startup-after-start"),
    })
    with pg.connect(database) as db:
        db.execute("""CREATE FUNCTION stage4_fail_second_update() RETURNS trigger LANGUAGE plpgsql
                      AS $$ BEGIN RAISE EXCEPTION 'owned fixture denies second queued update'; END; $$""")
        db.execute(cutover.sql.SQL("""
            CREATE TRIGGER stage4_startup_second BEFORE UPDATE ON lab_experiments
              FOR EACH ROW WHEN (OLD.experiment_id={})
              EXECUTE FUNCTION stage4_fail_second_update()
        """).format(cutover.sql.Literal(SECOND)))
    before = pg.snapshot(database)
    assert [row["payload"]["state"] for row in before["lab_experiments"]] == ["QUEUED","QUEUED"]
    assert before["lab_leases"] == []

    with cutover.native_service(directory, env, {"executable":hardware,"contracts":contracts}) as (r2, (r2port,_)):
        with relay_for(r2port) as (relay, target):
            env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{target}"
            log = directory / "remote.log"
            with log.open("wb") as output, subprocess.Popen(
                [str(native), *cutover.NATIVE_ARGS], cwd=directory, env=env, stdin=subprocess.PIPE,
                stdout=output, stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            ) as child:
                try:
                    assert relay.start_ready.wait(10)
                    assert relay.unavailable_checked_after_start.wait(2)
                    start = next(row for row in relay.observed() if row["method"] == "StartExecution")
                    assert start["experiment_id"] == FIRST and start["accepted"] and not start.get("reply_sent")

                    def early_stop():
                        return any(row["method"] == "StopExecution" and row["experiment_id"] == FIRST
                                   and row.get("accepted") and row.get("reply_sent") for row in relay.observed())
                    cutover._poll(early_stop, 6)
                    assert cutover._lease_exists(pg, database, FIRST)
                    assert not cutover._lease_exists(pg, database, SECOND)
                    assert cutover.READY.search(log.read_bytes()) is None and child.poll() is None
                    relay.start_release.set()
                    assert relay.cleanup_ready.wait(5)
                    assert cutover._lease_exists(pg, database, FIRST)
                    relay.cleanup_release.set()
                    assert child.wait(timeout=12) == 2
                    assert cutover.READY.search(log.read_bytes()) is None
                    assert b"Scheduler recovery failed" in log.read_bytes()
                finally:
                    relay.start_release.set()
                    relay.cleanup_release.set()
                    if child.poll() is None:
                        cutover.stop_owned_backend(child, cutover.psutil)
            calls = relay.observed()
        assert not cutover._port_open(target)
    hardware_retired = cutover._retired(r2, r2port)
    assert pg.clients(database) == 0 and not pg.holders(database)
    after = pg.snapshot(database)
    assert after["lab_leases"] == [] and after["lab_captures"] == []
    first, second = (row["payload"] for row in after["lab_experiments"])
    assert first["state"] == "COMPLETE" and first["error_code"] == "DISCONNECTED"
    assert "RUNNING" in first["state_history"] and "CAPTURING" not in first["state_history"]
    assert second == before["lab_experiments"][1]["payload"]
    stop_calls = [row for row in calls if row["method"] == "StopExecution"]
    assert len(stop_calls) == 2 and all(row["experiment_id"] == FIRST and row["accepted"] for row in stop_calls)
    assert sum(row["method"] == "StartExecution" for row in calls) == 1
    assert all(row["method"] != "ReadCapture" for row in calls)
    proof = {
        "status":"PASS","scope":"isolated PostgreSQL startup failure after real virtual Start",
        "candidate_sha256":digest,"hardware_sha256":cutover._digest(hardware),
        "worker_sha256":cutover._digest(worker),"harness_sha256":cutover._digest(Path(__file__)),
        "remote_exit":child.returncode,"ready":False,"hardware":hardware_retired,
        "database":database,"first_state_history":first["state_history"],"second_unchanged":True,
        "leases_after":0,"capture_after":0,"calls":calls,
    }
    (root / "startup-touched.json").write_bytes(cutover._json_bytes(proof))
