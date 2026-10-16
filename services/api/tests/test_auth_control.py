"""A read subscription does not own or extend an experiment's control lease."""
from contextlib import contextmanager

from fastapi.testclient import TestClient
import pytest
from starlette.websockets import WebSocketDisconnect

from test_auth_security import security_application, browser_headers, login, create_experiment


@contextmanager
def _client_without_lifespan(application):
    client = TestClient(application)
    try:
        yield client
    finally:
        client.close()
        application.state.manager.close()
        application.state.repository.close()


@contextmanager
def socket(client, control_client_id=None, *, origin='http://testserver'):
    headers = {'Origin': origin} if origin is not None else {}
    with client.websocket_connect('/ws/events', headers=headers) as websocket:
        assert websocket.receive_json()['type'] == 'hello'
        if control_client_id:
            websocket.send_json({'type': 'client.hello', 'protocol_version': '1.0',
                                 'control_client_id': control_client_id})
        # A harmless round trip ensures negotiation was processed before Run.
        websocket.send_text('ready')
        assert websocket.receive_json() == {'type': 'echo', 'payload': 'ready'}
        yield websocket


def run(client, experiment, control='controller'):
    response = client.post('/api/experiments/' + experiment['experiment_id'] + '/run',
                           headers=browser_headers(client, control=control))
    assert response.status_code == 200, response.text


def finish_cancelled(application, eid, expected):
    application.state.manager.submit.run_one()
    record = application.state.repository.get_experiment(eid)
    assert record['state'] in {'COMPLETE', 'FAULT'}
    assert record['error_code'] == expected
    assert application.state.repository.leases() == []
    assert 'guarded_power_up' not in application.state.gateway.calls
    assert 'start_execution' not in application.state.gateway.calls


def test_viewer_tab_disconnect_does_not_cancel_controller(security_application):
    with TestClient(security_application) as controller, TestClient(security_application) as viewer:
        login(controller)
        viewer.cookies.update(controller.cookies)
        experiment = create_experiment(controller)
        eid = experiment['experiment_id']
        with socket(controller, 'controller'):
            with socket(viewer, 'viewer'):
                run(controller, experiment)
            assert security_application.state.repository.get_experiment(eid)['state'] == 'RESERVED'
            assert not security_application.state.manager.cancel[eid].is_set()
        finish_cancelled(security_application, eid, 'DISCONNECTED')


def test_controller_disconnect_stops_even_while_a_viewer_tab_remains(security_application):
    with TestClient(security_application) as controller, TestClient(security_application) as viewer:
        login(controller)
        viewer.cookies.update(controller.cookies)
        experiment = create_experiment(controller)
        with socket(viewer, 'viewer'):
            with socket(controller, 'controller'):
                run(controller, experiment)
            finish_cancelled(security_application, experiment['experiment_id'], 'DISCONNECTED')


def test_same_user_viewer_session_logout_does_not_stop_another_control_session(security_application):
    with TestClient(security_application) as controller, TestClient(security_application) as viewer:
        context = login(controller)
        second = login(viewer)
        assert context.owner_id == second.owner_id and context.session_id != second.session_id
        experiment = create_experiment(controller)
        with socket(controller, 'controller'):
            with socket(viewer, 'viewer'):
                run(controller, experiment)
                reply = viewer.post('/api/auth/logout', json={}, headers=browser_headers(viewer))
                assert reply.status_code == 200
            assert not security_application.state.manager.cancel[experiment['experiment_id']].is_set()
        finish_cancelled(security_application, experiment['experiment_id'], 'DISCONNECTED')


def test_controller_logout_revokes_quiet_socket_and_stops_before_power(security_application):
    with TestClient(security_application) as controller:
        context = login(controller)
        experiment = create_experiment(controller)
        with socket(controller, 'controller') as websocket:
            run(controller, experiment)
            # Consume the two admission updates, so a subsequent receive proves
            # a quiet connection is revoked without another client message.
            while True:
                event = websocket.receive_json()
                if event.get('experiment', {}).get('state') == 'RESERVED': break
            reply = controller.post('/api/auth/logout', json={}, headers=browser_headers(controller))
            assert reply.status_code == 200
            assert not security_application.state.auth.session_active(context.session_id)
            with pytest.raises(WebSocketDisconnect) as disconnected:
                websocket.receive_json()
            assert disconnected.value.code == 4401
        finish_cancelled(security_application, experiment['experiment_id'], 'SESSION_REVOKED')


def test_expired_quiet_socket_closes_and_expires_its_control_session(security_application):
    # Do not start the separate application monitor: this verifies that the
    # socket's own expiry path performs the required control cleanup.
    with _client_without_lifespan(security_application) as controller:
        context = login(controller)
        experiment = create_experiment(controller)
        with socket(controller, 'controller') as websocket:
            run(controller, experiment)
            while True:
                event = websocket.receive_json()
                if event.get('experiment', {}).get('state') == 'RESERVED': break
            security_application.state.auth.clock = lambda: context.expires_at + 1
            with pytest.raises(WebSocketDisconnect) as disconnected:
                websocket.receive_json()
            assert disconnected.value.code == 4401
        finish_cancelled(security_application, experiment['experiment_id'], 'SESSION_EXPIRED')


def test_read_requests_and_viewer_heartbeats_never_extend_physical_lease(security_application):
    with TestClient(security_application) as controller, TestClient(security_application) as viewer:
        login(controller); viewer.cookies.update(controller.cookies)
        now = [100.0]
        manager = security_application.state.manager
        manager.clock = lambda: now[0]
        manager.lease_seconds = 10
        experiment = create_experiment(controller)
        with socket(controller, 'controller'), socket(viewer) as websocket:
            run(controller, experiment)
            expiry = security_application.state.repository.leases()[0]['expires_at']
            for current in (101.0, 105.0, 109.0):
                now[0] = current
                assert viewer.get('/api/experiments/' + experiment['experiment_id']).status_code == 200
                websocket.send_text('heartbeat')
                while websocket.receive_json().get('type') != 'echo': pass
                assert security_application.state.repository.leases()[0]['expires_at'] == expiry
            now[0] = 111.0
            manager.expire_leases()
            finish_cancelled(security_application, experiment['experiment_id'], 'TIMEOUT')


@pytest.mark.parametrize('origin', [None, 'null', 'https://evil.invalid', 'http://testserver.evil.invalid'])
def test_websocket_rejects_untrusted_origin_even_with_valid_session(security_application, origin):
    with TestClient(security_application) as client:
        login(client)
        with pytest.raises(WebSocketDisconnect) as disconnected:
            with socket(client, origin=origin): pass
        assert disconnected.value.code == 4403


def test_websocket_requires_a_real_unexpired_server_session(security_application):
    with TestClient(security_application) as client:
        client.cookies.set('netcircuit_session', 'forged-cookie')
        with pytest.raises(WebSocketDisconnect) as disconnected:
            with socket(client): pass
        assert disconnected.value.code == 4401


def test_admin_role_revocation_closes_old_socket_and_stops_its_control(security_application):
    with TestClient(security_application) as controller, TestClient(security_application) as admin:
        context = login(controller)
        login(admin, 'admin', 'administrator password')
        experiment = create_experiment(controller)
        with socket(controller, 'controller') as websocket:
            run(controller, experiment)
            while True:
                event = websocket.receive_json()
                if event.get('experiment', {}).get('state') == 'RESERVED': break
            response = admin.patch('/api/admin/users/' + context.principal_id, json={'role': 'INSTRUCTOR'},
                                   headers=browser_headers(admin))
            assert response.status_code == 200, response.text
            with pytest.raises(WebSocketDisconnect) as disconnected:
                websocket.receive_json()
            assert disconnected.value.code == 4401
        finish_cancelled(security_application, experiment['experiment_id'], 'SESSION_REVOKED')
        assert controller.get('/api/auth/session').json()['authenticated'] is False
