import json
from pathlib import Path
import subprocess
import sys

import grpc

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services/hardware-service'))


def test_registered_v2_rpc_cannot_start_physical_without_safety():
    subprocess.run([sys.executable, str(ROOT / 'scripts/generate_hardware_rpc.py')], check=True)
    from contracts.generated import rpc_v2_pb2 as pb
    from contracts.generated import rpc_v2_pb2_grpc as rpc
    from hardware_service.server import build_server
    from hardware_service.station.physical import PhysicalHardwareStation
    server = build_server({'physical-1': PhysicalHardwareStation('physical-1')})
    port = server.add_insecure_port('127.0.0.1:0')
    server.start()
    try:
        with grpc.insecure_channel(f'127.0.0.1:{port}') as channel:
            client = rpc.HardwareServiceStub(channel)
            target = pb.Target(station_id='physical-1', experiment_id='e1')
            caps = client.GetCapabilities(target, timeout=5)
            assert caps.available is False
            assert caps.hardware_rpc_version == '2.0'
            result = client.StartExecution(target, timeout=5)
            assert result.accepted is False
            assert result.code == pb.HARDWARE_UNAVAILABLE
            safe = client.EnterSafeState(target, timeout=5)
            assert json.loads(safe.result_json)['hardware_applied'] is False
    finally:
        server.stop(0).wait()


def test_stale_physical_start_rechecks_owner_under_operation_lock():
    from contracts.generated import rpc_v2_pb2 as pb
    from hardware_service.rpc import LifecycleRpc
    from test_physical_station import station, prepare, plan, ProtectedTestDriver
    s=station(ProtectedTestDriver()); prepare(s)
    s.apply_routing(); s.guarded_power_up(); s.arm_capture(plan()['capture_config'])
    rpc=LifecycleRpc({'physical-1':s},pb)
    original=rpc._station
    first=True
    def lookup(target):
        nonlocal first
        current=original(target)
        if first:
            first=False
            s.stop_execution(); s.enter_safe_state(); s.scan_topology(); s.read_runtime_safety()
            next_plan=plan(); next_plan['experiment_id']='e2'
            s.prepare_execution(next_plan,{'schema_version':'1.0','decision':'RUN_GUARDED','reasons':[]})
            s.apply_routing(); s.guarded_power_up(); s.arm_capture(next_plan['capture_config'])
        return current
    rpc._station=lookup
    reply=rpc.StartExecution(pb.Target(station_id='physical-1',experiment_id='e1'),None)
    assert reply.accepted is False
    assert reply.code==pb.RESOURCE_CONFLICT
    assert s._experiment_id=='e2' and s.state=='ARMED'
