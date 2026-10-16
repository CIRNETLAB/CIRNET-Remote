import asyncio

from app.services.events import EventHub


def record(revision):
    return {"schema_version": "1.0", "experiment_id": "e1", "circuit_id": "c1", "station_id": "s1",
            "assignment_id": None, "mode": "simulation", "state": "CREATED", "state_history": ["CREATED"],
            "revision": revision, "execution_decision": None, "safety_verification": None,
            "topology_verification": None, "functional_verification": {"schema_version": "1.0", "status": "NOT_EVALUATED", "issues": []},
            "capture": None, "error_code": None, "queue_position": None, "lease_expires_at": None}


def test_bounded_stream_reports_dropped_events_and_keeps_latest_snapshot():
    async def check():
        hub = EventHub()
        token, queue = hub.subscribe("owner")
        _, other = hub.subscribe("other-owner")
        for revision in range(130):
            hub.publish("owner", {"type": "experiment.updated", "experiment": record(revision)})
        await asyncio.sleep(0)
        events = []
        while not queue.empty():
            events.append(queue.get_nowait())
        assert other.empty()
        assert any(event["type"] == "resync.required" and event["reason"] == "QUEUE_OVERFLOW" for event in events)
        assert events[-1]["experiment"]["revision"] == 129
        assert events[-1]["aggregate_id"] == "e1"
        assert events[-1]["aggregate_revision"] == 129
        assert all(event["protocol_version"] == "1.0" for event in events)
        assert len({event["stream_id"] for event in events}) == 1
        assert [event["sequence"] for event in events] == sorted({event["sequence"] for event in events})
        assert hub.unsubscribe(token) is True
    asyncio.run(check())


def test_each_subscription_gets_a_new_stream_identity_and_initial_capabilities():
    async def check():
        hub = EventHub()
        first, _ = hub.subscribe("owner")
        second, _ = hub.subscribe("owner")
        first_hello, second_hello = hub.hello(first), hub.hello(second)
        assert first_hello["type"] == "hello"
        assert first_hello["protocol_version"] == "1.0"
        assert first_hello["sequence"] == 0
        assert first_hello["resync_required"] is True
        assert first_hello["capabilities"]["snapshot_resync"] is True
        assert first_hello["capabilities"]["replay_commands"] is False
        assert first_hello["stream_id"] != second_hello["stream_id"]
        assert hub.unsubscribe(first) is False
        assert hub.unsubscribe(second) is True
    asyncio.run(check())


def test_websocket_negotiation_exposes_capabilities_and_rejects_unknown_version():
    import pytest
    from csrf_client import CsrfTestClient as TestClient
    from starlette.websockets import WebSocketDisconnect
    from app.main import app
    with TestClient(app) as client:
        with client.websocket_connect('/ws/events') as websocket:
            hello = websocket.receive_json()
            assert hello['protocol_version'] == '1.0'
            assert hello['capabilities']['replay_commands'] is False
            websocket.send_json({'type': 'client.hello', 'protocol_version': '9.0'})
            failure = websocket.receive_json()
            assert failure['type'] == 'protocol.error'
            assert failure['code'] == 'UNSUPPORTED_VERSION'
            with pytest.raises(WebSocketDisconnect) as error:
                websocket.receive_json()
            assert error.value.code == 1002
