import json
from pathlib import Path
import subprocess
import sys

import grpc

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services/hardware-service'))


def test_registered_v2_rpc_cannot_start_physical_without_safety():
    subprocess.run([sys.executable, str(ROOT / 'scripts/generate_hardware_rpc.py')], check=True)
    from hardware_service.generated import rpc_v2_pb2 as pb
    from hardware_service.generated import rpc_v2_pb2_grpc as rpc
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
