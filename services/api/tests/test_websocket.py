import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from csrf_client import CsrfTestClient as TestClient
from starlette.websockets import WebSocketDisconnect
from app.main import app


def test_websocket_binary_message_closes_cleanly_as_unsupported_data():
    with TestClient(app) as client:
        with client.websocket_connect('/ws/events') as websocket:
            assert websocket.receive_json()['type'] == 'hello'
            websocket.send_bytes(b'unsupported')
            with pytest.raises(WebSocketDisconnect) as error:
                websocket.receive_json()
            assert error.value.code == 1003


def test_websocket_text_echo_and_normal_disconnect():
    with TestClient(app) as client:
        with client.websocket_connect('/ws/events') as websocket:
            assert websocket.receive_json()['type'] == 'hello'
            websocket.send_text('hello')
            assert websocket.receive_json() == {'type': 'echo', 'payload': 'hello'}
