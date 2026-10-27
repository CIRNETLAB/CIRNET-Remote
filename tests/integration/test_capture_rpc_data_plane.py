"""Large digital captures cross the real local RPC boundary in bounded binary form."""
import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
for relative in ['services/api', 'services/hardware-service']:
    sys.path.insert(0, str(ROOT / relative))


@pytest.mark.parametrize('signal', ['y', 'long_' + 's' * 256])
def test_100k_capture_crosses_default_rpc_limit_losslessly_as_ncap(signal):
    subprocess.run([sys.executable, str(ROOT / 'scripts/generate_hardware_rpc.py')], check=True)
    from contracts.generated import rpc_v2_pb2 as pb
    from hardware_service.server import build_server
    from hardware_service.station.physical import PhysicalHardwareStation
    from app.services.hardware_client import HardwareServiceClient

    samples = [{'signal': signal, 'time_ns': i, 'value': 'X' if i % 3 == 2 else i % 2} for i in range(100000)]

    class CaptureTransportFixture(PhysicalHardwareStation):
        # Test the RPC data boundary only; no claim of physical driver readiness.
        def read_capture(self):
            return {'available': True, 'duration_ns': 100000, 'sample_count': len(samples), 'samples': samples}

    server = build_server({'capture': CaptureTransportFixture('capture')})
    port = server.add_insecure_port('127.0.0.1:0'); server.start()
    client = HardwareServiceClient(f'127.0.0.1:{port}', timeout=10)
    try:
        client._connect()
        wire = client._stub.ReadCapture(pb.Target(station_id='capture', experiment_id='e'), timeout=10)
        assert wire.accepted
        assert 'samples' not in json.loads(wire.result_json)
        assert len(wire.result_json) < 1000
        assert wire.capture_payload.startswith(b'NCAP')
        assert len(wire.capture_payload) <= 9 + 65536 + 100000 * 11
        data = client.call('capture', 'e', 'read_capture')
        assert data['samples'] == samples
        assert data['duration_ns'] == 100000
    finally:
        client.close(); server.stop(0).wait()


@pytest.mark.parametrize('field', ['sample_count', 'duration_ns'])
def test_gateway_rejects_boolean_capture_counts_in_binary_descriptors(field):
    from contracts.generated import rpc_v2_pb2 as pb
    from contracts.capture_codec import encode_digital
    from app.services.hardware_client import HardwareServiceClient, GatewayError
    metadata = {'available': True, 'sample_count': 1, 'duration_ns': 1}
    metadata[field] = True
    payload = encode_digital([{'signal': 'y', 'time_ns': 0, 'value': 1}], 1)

    class ReplyStub:
        def ReadCapture(self, request, timeout):
            return pb.OperationReply(accepted=True, code=pb.OK, result_json=json.dumps(metadata).encode(), capture_payload=payload)

    client = HardwareServiceClient(); client._stub = ReplyStub(); client.pb = pb
    with pytest.raises(GatewayError, match='PROTOCOL_MISMATCH'):
        client.call('capture', 'e', 'read_capture')
