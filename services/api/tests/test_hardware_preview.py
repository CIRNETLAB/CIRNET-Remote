"""Exercise negotiated preview with the private protobuf wire shapes."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import sys

import grpc
from google.protobuf.empty_pb2 import Empty
from google.protobuf.wrappers_pb2 import BytesValue, UInt32Value
import pytest

from csrf_client import CsrfTestClient
from test_physical_preview import graph

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import Settings
from app.main import create_app
from app.services.hardware_client import HardwareServiceClient
from cirnet_sim.backends import preview_physical_graph


ROUTES = ('/api/circuits/physical-preview', '/api/v2/circuits/physical-preview')


@pytest.fixture
def preview_server():
    calls = []
    describe_reply = {'value': 1}
    preview_reply = {}

    def describe(request, context):
        calls.append(('describe', context.time_remaining()))
        if 'status' in describe_reply:
            context.abort(describe_reply['status'], 'private error details')
        return UInt32Value(value=describe_reply['value'])

    def preview(request, context):
        received = json.loads(request.value)
        calls.append(('preview', received, context.time_remaining()))
        if 'status' in preview_reply:
            context.abort(preview_reply['status'], 'private error details')
        if 'body' in preview_reply:
            return BytesValue(value=preview_reply['body'])
        result = preview_physical_graph(received, backend_id='legacy')
        return BytesValue(value=json.dumps({'accepted': True, 'preview': result}).encode())

    handlers = {
        'Describe': grpc.unary_unary_rpc_method_handler(
            describe, request_deserializer=Empty.FromString, response_serializer=UInt32Value.SerializeToString),
        'Preview': grpc.unary_unary_rpc_method_handler(
            preview, request_deserializer=BytesValue.FromString, response_serializer=BytesValue.SerializeToString),
    }
    with ThreadPoolExecutor(max_workers=2) as executor:
        server = grpc.server(executor)
        server.add_generic_rpc_handlers((grpc.method_handlers_generic_handler(
            'cirnet.hardware.internal.v1.SimulatorPreview', handlers),))
        port = server.add_insecure_port('127.0.0.1:0')
        server.start()
        gateway = HardwareServiceClient(f'127.0.0.1:{port}')
        try:
            yield gateway, calls, describe_reply, preview_reply
        finally:
            gateway.close()
            server.stop(0).wait()


def make_client(gateway, *, enabled):
    return CsrfTestClient(create_app(gateway=gateway, configuration=Settings(
        database_url='sqlite://', simulation_backend='legacy', hardware_preview=enabled)))


def test_hardware_preview_requires_explicit_boolean_opt_in(monkeypatch):
    monkeypatch.delenv('CIRNET_HARDWARE_PREVIEW', raising=False)
    monkeypatch.delenv('NETCIRCUIT_HARDWARE_PREVIEW', raising=False)
    assert Settings().hardware_preview is False
    monkeypatch.setenv('CIRNET_HARDWARE_PREVIEW', 'true')
    assert Settings().hardware_preview is True
    monkeypatch.setenv('CIRNET_HARDWARE_PREVIEW', 'false')
    assert Settings().hardware_preview is False
    monkeypatch.setenv('CIRNET_HARDWARE_PREVIEW', '1')
    with pytest.raises(ValueError, match='CIRNET_HARDWARE_PREVIEW'):
        Settings()


@pytest.mark.parametrize('route', ROUTES)
def test_hardware_preview_routes_preserve_public_results_and_validation(route, preview_server):
    gateway, calls, _, _ = preview_server
    value = graph()
    with make_client(gateway, enabled=False) as client:
        local = client.post(route, json=value)
        assert local.status_code == 200
        assert calls == []
    with make_client(gateway, enabled=True) as client:
        remote = client.post(route, json=value)
        assert remote.status_code == local.status_code
        assert remote.json() == local.json()
        assert [call[0] for call in calls] == ['describe', 'preview']
        assert calls[1][1] == value
        assert 0 < calls[1][2] <= gateway.timeout + 0.01
        value['modules'][1]['mount'] = {'version': 1}
        assert client.post(route, json=value).status_code == 422
        assert len(calls) == 2


def test_hardware_preview_falls_back_only_if_describe_is_unimplemented(preview_server):
    gateway, calls, describe, _ = preview_server
    describe['status'] = grpc.StatusCode.UNIMPLEMENTED
    with make_client(gateway, enabled=True) as client:
        result = client.post(ROUTES[0], json=graph())
    assert result.status_code == 200
    assert result.json()['pin_values']['U.3'] == 1
    assert [call[0] for call in calls] == ['describe']


def test_hardware_preview_shares_deadline_across_negotiation(preview_server, monkeypatch):
    gateway, calls, _, _ = preview_server
    # Advance only the gateway's clock between its two RPCs.
    clock = iter((100.0, 100.0, 101.0))
    monkeypatch.setattr('app.services.hardware_client.monotonic', lambda: next(clock))
    gateway.preview(graph())
    assert 2.5 < calls[0][1] <= 3.01
    assert 1.5 < calls[1][2] <= 2.01


@pytest.mark.parametrize(('describe', 'preview', 'count', 'code'), [
    ({'value': 2}, {}, 1, 'PROTOCOL_MISMATCH'),
    ({'status': grpc.StatusCode.UNAVAILABLE}, {}, 1, 'HARDWARE_UNAVAILABLE'),
    ({'status': grpc.StatusCode.DEADLINE_EXCEEDED}, {}, 1, 'TIMEOUT'),
    ({}, {'status': grpc.StatusCode.UNIMPLEMENTED}, 2, 'PROTOCOL_MISMATCH'),
    ({}, {'status': grpc.StatusCode.DEADLINE_EXCEEDED}, 2, 'TIMEOUT'),
    ({}, {'body': b'bad json'}, 2, 'PROTOCOL_MISMATCH'),
    ({}, {'body': b'{"accepted":true,"preview":{}}'}, 2, 'PROTOCOL_MISMATCH'),
    ({}, {'body': b'{"accepted":false,"code":"UNEXECUTABLE"}'}, 2, 'UNEXECUTABLE'),
    ({}, {'body': b'{"accepted":false,"code":"private error details"}'}, 2, 'PROTOCOL_MISMATCH'),
])
def test_hardware_preview_errors_preserve_public_envelope(preview_server, describe, preview, count, code):
    gateway, calls, describe_reply, preview_reply = preview_server
    describe_reply.update(describe)
    preview_reply.update(preview)
    with make_client(gateway, enabled=True) as client:
        response = client.post(ROUTES[1], json=graph())
    assert response.status_code == 422
    assert response.json() == {'valid': False, 'code': code,
                               'message': 'The physical preview could not compile or settle this design.'}
    assert len(calls) == count
