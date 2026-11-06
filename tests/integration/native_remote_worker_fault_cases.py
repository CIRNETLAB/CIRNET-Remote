"""Explicit Windows actual-worker crash/timeout propagation, Python r8 then Rust."""

from contextlib import closing, contextmanager, suppress
import os
from pathlib import Path
import shutil
import sqlite3
from time import monotonic, sleep
from uuid import uuid4

from tests.integration import native_remote_cutover_cases as cutover
from tests.integration.native_hardware_stop_cases import SATURATED_REQUEST_BYTES, _worker_processes
from tests.integration.native_stop_baseline_cases import _saturated_load

FAULTS = (("crash", "DRIVER_ERROR"), ("timeout", "TIMEOUT"))


class FaultRelay(cutover.HardwareRelay):
    def __init__(self, target):
        super().__init__(target)
        self.witness = {}

    def forward(self, method, payload, context):
        reply = super().forward(method, payload, context)
        if method.endswith("/StopExecution"):
            identity = self.pb.Target.FromString(payload).experiment_id
            child = self.witness.get(identity)
            if child is not None:
                with self.lock:
                    matching = [row for row in self.calls if row["method"] == "StopExecution"
                                and row["experiment_id"] == identity]
                    assert len(matching) == 1
                    matching[0]["worker_exited_at_ack"] = not child.is_running()
        return reply


@contextmanager
def _fault_relay(hardware_port):
    relay = FaultRelay(f"127.0.0.1:{hardware_port}")
    with cutover.ThreadPoolExecutor(max_workers=8, thread_name_prefix="worker-fault") as pool:
        server = cutover.grpc.server(pool)
        server.add_generic_rpc_handlers([relay])
        port = server.add_insecure_port("127.0.0.1:0")
        assert 1024 < port < 65536
        server.start()
        try:
            yield relay, port
        finally:
            assert server.stop(1).wait(5)
            relay.channel.close()
    assert not cutover._port_open(port)


def _assert_owned(hardware_pid, worker, child, started):
    current = cutover.psutil.Process(child.pid)
    assert current.create_time() == started
    assert current.ppid() == hardware_pid
    assert Path(current.exe()).resolve(strict=True) == worker
    return current


def _leases(database):
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)) as db:
        return db.execute("SELECT experiment_id, quarantined FROM lab_leases ORDER BY experiment_id").fetchall()


def _exercise(client, relay, hardware_pid, worker, database, seed, capture_dir):
    owners = {"alice":seed["stage4_alice"], "bob":seed["stage4_bob"]}
    previous = {}

    def admit(label, owner, eid):
        sleep(max(0, 1.05 - (monotonic() - previous.get(owner, 0))))
        previous[owner] = monotonic()
        cutover._run(client, owners[owner], eid, label)

    def completed(label):
        owner = owners["alice"]
        eid = cutover._create(client, owner, label)
        admit(label, "alice", eid)
        record = cutover._terminal(client, owner, eid)
        assert record["state"] == "COMPLETE" and _leases(database) == []
        return cutover._capture(client, owner, record["capture"])

    original = completed("warm-worker")
    receipt = []
    for fault, expected in FAULTS:
        children = _worker_processes(hardware_pid, worker)
        assert len(children) == 1
        child, = children.values()
        started = child.create_time()
        assert child.is_running()
        eid = cutover._request(client, owners["bob"], "POST", "/api/experiments", 201,
                               key=f"cutover-create-{fault}", json=_saturated_load()).json()["experiment_id"]
        relay.witness[eid] = child
        before_files = cutover._file_inventory(capture_dir)
        first = len(relay.observed())
        _assert_owned(hardware_pid, worker, child, started)
        baseline = child.io_counters()
        try:
            _assert_owned(hardware_pid, worker, child, started).suspend()
            admit(fault, "bob", eid)

            def started_reading():
                start = next((row for row in relay.observed()[first:]
                              if row["method"] == "StartExecution" and row["experiment_id"] == eid), None)
                if not start:
                    return None
                assert not start.get("reply_sent")
                current = _assert_owned(hardware_pid, worker, child, started).io_counters()
                delta = current.read_bytes - baseline.read_bytes
                assert current.write_count == baseline.write_count and current.write_bytes == baseline.write_bytes
                assert 0 <= delta < SATURATED_REQUEST_BYTES
                return delta or None

            transferred = cutover._poll(started_reading, 5)
            assert _leases(database) == [(eid, 0)]
            if fault == "crash":
                _assert_owned(hardware_pid, worker, child, started).kill()
            terminal = cutover._terminal(client, owners["bob"], eid)
            assert terminal["state"] == "FAULT" and terminal["error_code"] == expected
            assert terminal["capture"] is None and "CAPTURING" not in terminal["state_history"]
            child.wait(timeout=3)
            assert not child.is_running() and _leases(database) == []
            assert cutover._file_inventory(capture_dir) == before_files
            calls = relay.observed()[first:]
            [start] = [row for row in calls if row["method"] == "StartExecution" and row["experiment_id"] == eid]
            [stop] = [row for row in calls if row["method"] == "StopExecution" and row["experiment_id"] == eid]
            assert start["accepted"] is False and start["code"] == expected and start["reply_sent"]
            assert stop["accepted"] is True and stop["worker_exited_at_ack"] is True
            assert all(row["method"] != "ReadCapture" for row in calls)
        finally:
            if child.is_running():
                with suppress(cutover.psutil.NoSuchProcess):
                    _assert_owned(hardware_pid, worker, child, started).resume()

        assert completed("replacement-" + fault) == original
        replacement = _worker_processes(hardware_pid, worker)
        assert len(replacement) == 1 and child.pid not in replacement
        replacement_pid, = replacement
        receipt.append({"fault":fault, "worker_pid":child.pid, "worker_started":started,
                        "parent_pid":hardware_pid, "worker_path":str(worker), "partial_cnp_read_bytes":transferred,
                        "remote_error":terminal["error_code"], "fault_capture":False, "leases_after":0,
                        "start":start, "cleanup_stop":stop, "replacement_pid":replacement_pid,
                        "replacement_capture_sha256":cutover.sha256(original).hexdigest()})
    return receipt


def test_stage4_real_cpp_worker_crash_and_timeout():
    assert os.name == "nt", "This explicit fault gate uses Windows child I/O counters."
    root = cutover.artifact_directory(f"stage4-worker-faults/{uuid4().hex}")
    print(f"Stage 4 actual C++ worker faults: {root}", flush=True)
    python, hardware, worker, contracts = cutover._select_reference(root)
    worker = worker.resolve(strict=True)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(cutover.artifact_directory())
    digest = cutover._digest(native)
    assert digest == os.environ["CIRNET_STAGE4_CUTOVER_NATIVE_SHA256"]
    seed_dir = root / "seed"
    seed_dir.mkdir()
    db_seed = seed_dir / "seed.sqlite"
    seed = cutover._reference_script(python, cutover.SEED, seed_dir, cutover._environment(seed_dir, db_seed), "seed")
    for suffix in ("-wal", "-shm", "-journal"):
        assert not Path(str(db_seed) + suffix).exists()
    outcomes = {}
    for lane, command in (
        ("python", [str(python), "-I", "-B", "-c", cutover.SERVE_REFERENCE]),
        ("rust", [str(native), *cutover.NATIVE_ARGS]),
    ):
        directory = root / lane
        directory.mkdir()
        database = directory / "fixture.sqlite"
        shutil.copyfile(db_seed, database)
        env = cutover._environment(directory, database)
        env.update(CIRNET_SIM_CPP_WORKER=str(worker), CIRNET_SIM_CPP_WORKER_SHA256=cutover.WORKER_SHA256,
                   CIRNET_CONTRACTS_ROOT=str(contracts), CIRNET_SIMULATION_BACKEND="cpp",
                   CIRNET_REMOTE_READ_ONLY="false", CIRNET_SIMULATION_WORKERS="1",
                   CIRNET_HARDWARE_START_RENDEZVOUS="0")
        with cutover.native_service(directory, env, {"executable":hardware, "contracts":contracts}) as (r2, (port, pid)):
            with _fault_relay(port) as (relay, relay_port):
                env["CIRNET_HARDWARE_GRPC_TARGET"] = f"127.0.0.1:{relay_port}"
                with cutover._remote(command, directory, env) as (remote, remote_port, client):
                    receipts = _exercise(client, relay, pid, worker, database, seed, directory / "captures")
                remote_retired = cutover._retired(remote, remote_port)
        outcomes[lane] = {"remote":remote_retired, "hardware":cutover._retired(r2, port),
                          "cases":receipts}
    assert cutover._digest(worker) == cutover.WORKER_SHA256 and cutover._digest(native) == digest
    assert [(row["remote_error"], row["replacement_capture_sha256"]) for row in outcomes["python"]["cases"]] == [
        (row["remote_error"], row["replacement_capture_sha256"]) for row in outcomes["rust"]["cases"]
    ]
    (root / "worker-fault-summary.json").write_bytes(cutover._json_bytes({
        "status":"PASS", "scope":"isolated Windows real worker failure propagation",
        "harness_sha256":cutover._digest(Path(__file__)), "reference_manifest_sha256":cutover.REFERENCE_SHA256,
        "candidate_sha256":digest, "hardware_sha256":cutover._digest(hardware), "worker_sha256":cutover.WORKER_SHA256,
        "fault_injection":"Paused exact idle worker, then proved target Start partial request before kill or timeout.",
        "formal_loaded_stop":"NOT RUN", "lanes":outcomes,
    }))
