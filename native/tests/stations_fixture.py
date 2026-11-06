"""Seed Station route oracle cases with pinned Python Remote and scripted Hardware."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import grpc
from google.protobuf.json_format import ParseDict

from app.main import create_app
from app.services.hardware_client import HardwareServiceClient
from app.services.persistence import Repository
from contracts.generated import rpc_v2_pb2 as pb, rpc_v2_pb2_grpc as rpc


VIRTUAL = "virtual-station-01"
PHYSICAL = "physical-station-01"
UNKNOWN = "never-declared"
QUEUE = ["foreign_first", "own_second", "foreign_third", "own_fourth"]


def station_values(station, scenario):
    physical = station == PHYSICAL
    value = {
        "schema_version": "1.0", "station_id": station,
        "mode": "hardware" if physical else "simulation", "available": True,
        "virtual_digital": not physical, "virtual_analog": False,
        "physical_digital": physical, "physical_analog_routing": physical,
        "physical_execution_slots": int(physical), "topology_scan_supported": physical,
        "safety_gate_supported": physical, "guarded_run_supported": physical,
        "component_resolution_modes": ["HYBRID"] if physical else [],
        "instrument_capabilities": {
            "logic_analyzer": {"channels": 4, "runtime_reconfiguration_supported": False},
            "oscilloscope": {"channels": int(physical), "runtime_reconfiguration_supported": False},
            "generator": {"channels": int(physical), "runtime_reconfiguration_supported": physical,
                          **({"status": "READY", "supported_waveforms": ["SINE"], "offset_min_v": -1.0} if physical else {})},
        },
        "routing_resources": [
            {"resource_id": "private-route", "roles": ["INPUT_SOURCE"], "node_ids": ["private-node"]},
        ] if physical else [],
        "hardware_rpc_version": "2.0", "fpga_protocol_version": "fixture-fpga",
        "firmware_version": "" if scenario == "invalid" else "fixture-firmware",
        "hardware_profile_version": "fixture-profile",
        "breadboards": [{"id": "board1", "model": "board-fixture"}] if physical else [],
    }
    return ParseDict(value, pb.StationCapabilities())


def seed_scenario(directory, scenario, target):
    database = directory / f"{scenario}.sqlite"
    assert not database.exists()
    repo = Repository("sqlite:///" + database.as_posix())
    gateway = HardwareServiceClient(target)
    app = create_app(repository=repo, gateway=gateway)
    manager = app.state.manager
    sessions = [app.state.auth.ensure_session(None) for _ in range(3)]
    owners = [context.owner_id for context, _ in sessions]

    def record(owner, identity, station):
        repo.create_experiment(owner, {
            "experiment_id": identity, "station_id": station, "state": "CREATED",
            "revision": 1, "capture": None, "lease_expires_at": None,
        })

    try:
        for index, identity in enumerate(QUEUE):
            record(owners[1 - (index % 2)], identity, VIRTUAL)
        with manager.lock:
            manager.queues[VIRTUAL].extend(QUEUE)
        if scenario == "busy":
            record(owners[1], "busy-virtual-private", VIRTUAL)
            record(owners[1], "quarantine-physical-private", PHYSICAL)
            assert repo.reserve(VIRTUAL, 0, "busy-virtual-private", 1.0)
            assert repo.reserve(PHYSICAL, 0, "quarantine-physical-private", 1.0)
            repo.quarantine("quarantine-physical-private")
        # Without a lifespan context, the reference does not start the expiry
        # monitor; discovery observes exactly the durable fixture leases.
        client = TestClient(app)
        cases = []
        try:
            requested = [(0, "/api/stations"), (0, f"/api/stations/{VIRTUAL}/capabilities"),
                         (0, f"/api/stations/{PHYSICAL}/capabilities"),
                         (0, f"/api/stations/{UNKNOWN}/capabilities"),
                         (0, f"/api/stations/{UNKNOWN}/queue")]
            if scenario != "invalid":
                requested += [(index, f"/api/stations/{VIRTUAL}/queue") for index in range(3)]
                requested.append((0, f"/api/stations/{PHYSICAL}/queue"))
            for index, path in requested:
                response = client.get(path, headers={"Cookie": "cirnet_session=" + sessions[index][1],
                                                     "X-Request-ID": "station-oracle"})
                payload = response.json()
                assert response.status_code in (200, 404, 422), (path, payload)
                assert all(hidden not in response.text for hidden in (
                    "private-route", "private-node", "routing_resources",
                    "busy-virtual-private", "quarantine-physical-private",
                ))
                if path.endswith("/queue") and VIRTUAL in path and response.status_code == 200:
                    expected = [QUEUE[1], QUEUE[3]] if index == 0 else [QUEUE[0], QUEUE[2]] if index == 1 else []
                    assert [entry["experiment_id"] for entry in payload["own_positions"]] == expected
                cases.append({
                    "path": path, "owner": owners[index], "status": response.status_code, "body": payload,
                })
        finally:
            client.close()
    finally:
        with manager.lock:
            manager.queues.clear()
        manager.close()
        gateway.close()
        repo.close()
    return {"scenario": scenario, "database": database.name, "queue": QUEUE, "cases": cases}


@contextmanager
def fixture_hardware():
    class Hardware(rpc.HardwareServiceServicer):
        def __init__(self, scenario):
            self.scenario = scenario

        def GetCapabilities(self, request, context):
            if request.station_id not in (VIRTUAL, PHYSICAL) or request.experiment_id:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, "unrecognized fixture target")
            if self.scenario == "offline":
                context.abort(grpc.StatusCode.UNAVAILABLE, "isolated fixture offline")
            return station_values(request.station_id, self.scenario)

    servers = {}
    addresses = {}
    for name in ("ready", "offline", "invalid"):
        server = grpc.server(ThreadPoolExecutor(max_workers=2))
        rpc.add_HardwareServiceServicer_to_server(Hardware(name), server)
        port = server.add_insecure_port("127.0.0.1:0")
        assert port > 0
        server.start()
        addresses[name] = f"127.0.0.1:{port}"
        servers[name] = server
    try:
        yield addresses
    finally:
        for server in servers.values():
            server.stop(grace=2).wait(timeout=3)


def main():
    if sys.argv[1:] == ["serve"]:
        with fixture_hardware() as addresses:
            print(json.dumps(addresses), flush=True)
            sys.stdin.buffer.read()
        return
    assert sys.argv[1:] == ["seed"]
    session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
    folder = Path.cwd().resolve(strict=True)
    assert folder != session and folder.is_relative_to(session)
    scenarios = ["ready", "busy", "offline", "invalid"]
    with fixture_hardware() as targets:
        if target := os.getenv("CIRNET_EXACT_STATION_HARDWARE"):
            scenarios.append("r2")
            targets["r2"] = target
        targets["busy"] = targets["ready"]
        values = [seed_scenario(folder, scenario, targets[scenario]) for scenario in scenarios]
    with (folder / "oracle.json").open("x", encoding="utf-8") as file:
        json.dump(values, file, indent=2)
        file.write("\n")
    print(f"Generated {sum(len(value['cases']) for value in values)} exact Python station-route observations.")


if __name__ == "__main__":
    main()
