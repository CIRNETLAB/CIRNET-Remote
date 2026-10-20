"""Raw HTTP security tests intentionally do not use the legacy CSRF helper."""
from fastapi.testclient import TestClient
import pytest

from app.main import create_app
from app.services.persistence import Repository
from test_lab_lifecycle import LabGateway, DeferredJobs, assignment


@pytest.fixture
def security_application(tmp_path):
    repository = Repository('sqlite:///' + str(tmp_path / 'security.db'))
    application = create_app(repository=repository, gateway=LabGateway(), submit=DeferredJobs())
    auth = application.state.auth
    admin = auth.bootstrap_admin('admin', 'administrator password')
    guest, _ = auth.ensure_session(None)
    actor, _ = auth.login(guest, 'admin', 'administrator password')
    for username, role in [('alice', 'STUDENT'), ('bob', 'STUDENT'), ('teacher', 'INSTRUCTOR')]:
        auth.create_user(username, username + ' secure password', role=role, actor=actor)
    repository.create_assignment(assignment())
    repository.publish_assignment('a1', admin['principal_id'])
    return application


def browser_headers(client, *, control='test-control'):
    response = client.get('/api/auth/session')
    assert response.status_code == 200, response.text
    return {'Origin': 'http://testserver', 'X-CSRF-Token': response.json()['csrf_token'],
            'X-Control-Client': control}


def login(client, username='alice', password=None):
    response = client.post('/api/auth/login', headers=browser_headers(client),
                           json={'username': username, 'password': password or username + ' secure password'})
    assert response.status_code == 200, response.text
    return client.app.state.auth.current(client.cookies.get('netcircuit_session'))


def create_experiment(client, *, key=None):
    headers = browser_headers(client)
    if key: headers['Idempotency-Key'] = key
    response = client.post('/api/experiments', headers=headers,
                           json={'station_id': 'p1', 'assignment_id': 'a1'})
    assert response.status_code == 201, response.text
    return response.json()


def test_session_bootstrap_exposes_csrf_without_returning_the_session_secret(security_application):
    with TestClient(security_application) as client:
        response = client.get('/api/auth/session')
        assert response.status_code == 200
        assert isinstance(response.json()['csrf_token'], str) and response.json()['csrf_token']
        cookie = client.cookies.get('netcircuit_session')
        assert cookie and cookie not in response.text


def test_same_origin_cookie_without_csrf_cannot_create_an_experiment(security_application):
    with TestClient(security_application) as client:
        client.get('/api/auth/session')
        response = client.post('/api/experiments', headers={'Origin': 'http://testserver'},
                               json={'station_id': 'p1', 'assignment_id': 'a1'})
        assert response.status_code == 403
        assert security_application.state.repository.list_experiments() == []


def test_guest_cannot_create_an_instructor_assignment(security_application):
    with TestClient(security_application) as client:
        value = {**assignment(), 'assignment_id': 'guest-must-not-author'}
        response = client.post('/api/assignments', json=value, headers=browser_headers(client))
        assert response.status_code == 403
        with pytest.raises(KeyError):
            security_application.state.repository.get_assignment(value['assignment_id'])


@pytest.mark.parametrize('path,body', [
    ('/api/auth/login', {'username': 'alice', 'password': 'alice secure password'}),
    ('/api/auth/logout', {}), ('/api/auth/claim-guest', {'confirm': True}),
    ('/api/assignments', assignment()),
    ('/api/experiments', {'station_id': 'p1', 'assignment_id': 'a1'}),
    ('/api/experiments/missing/run', {}), ('/api/experiments/missing/stop', {}),
])
def test_every_unsafe_route_rejects_same_origin_without_csrf(security_application, path, body):
    with TestClient(security_application) as client:
        browser_headers(client)
        response = client.post(path, json=body, headers={'Origin': 'http://testserver'})
        assert response.status_code == 403, response.text
        assert response.json()['code'] == 'CSRF_REJECTED'


@pytest.mark.parametrize('origin', [None, 'null', 'https://evil.invalid',
                                    'http://testserver.evil.invalid', 'http://testserver:99'])
def test_valid_csrf_never_authorizes_an_untrusted_origin(security_application, origin):
    with TestClient(security_application) as client:
        headers = browser_headers(client)
        headers.pop('Origin')
        if origin is not None: headers['Origin'] = origin
        response = client.post('/api/auth/login', headers=headers,
                               json={'username': 'alice', 'password': 'alice secure password'})
        assert response.status_code == 403
        assert response.json()['code'] == 'ORIGIN_REJECTED'


def test_login_rotation_invalidates_previous_cookie_and_csrf(security_application):
    with TestClient(security_application) as client:
        old_headers = browser_headers(client)
        old_cookie = client.cookies.get('netcircuit_session')
        login(client)
        assert client.cookies.get('netcircuit_session') != old_cookie
        assert security_application.state.auth.current(old_cookie) is None
        response = client.post('/api/auth/logout', json={}, headers=old_headers)
        assert response.status_code == 403 and response.json()['code'] == 'CSRF_REJECTED'
        assert client.get('/api/auth/session').json()['authenticated'] is True


def test_authenticated_ownership_survives_logout_and_a_fresh_login(security_application):
    with TestClient(security_application) as client:
        first = login(client)
        experiment = create_experiment(client)
        response = client.post('/api/auth/logout', json={}, headers=browser_headers(client))
        assert response.status_code == 200
        assert not security_application.state.auth.session_active(first.session_id)
        assert client.get('/api/experiments/' + experiment['experiment_id']).status_code == 403
        second = login(client)
        assert second.session_id != first.session_id
        assert second.owner_id == first.owner_id
        assert client.get('/api/experiments/' + experiment['experiment_id']).status_code == 200


def test_students_cannot_cross_owner_operations_results_or_captures(security_application):
    with TestClient(security_application) as alice, TestClient(security_application) as bob:
        login(alice); login(bob, 'bob')
        experiment = create_experiment(alice, key='alice-create')
        eid = experiment['experiment_id']
        assert bob.get('/api/experiments').json() == []
        for suffix in ['', '/results']:
            assert bob.get('/api/experiments/' + eid + suffix).status_code == 403
        assert bob.get('/api/operations/alice-create').status_code == 404
        for suffix in ['/run', '/stop']:
            response = bob.post('/api/experiments/' + eid + suffix, json={}, headers=browser_headers(bob))
            assert response.status_code == 403
        run = alice.post('/api/experiments/' + eid + '/run', headers=browser_headers(alice))
        assert run.status_code == 200, run.text
        security_application.state.manager.submit.run_one()
        capture = alice.get('/api/experiments/' + eid).json()['capture']
        path = '/api/captures/' + capture['capture_id'] + '/payload'
        assert bob.get(path).status_code == 403
        assert bob.delete(path, headers=browser_headers(bob)).status_code == 403
        assert alice.get(path).status_code == 200


def test_student_cannot_author_even_with_valid_csrf(security_application):
    with TestClient(security_application) as client:
        login(client)
        response = client.post('/api/assignments', headers=browser_headers(client),
                               json={**assignment(), 'assignment_id': 'student-authored'})
        assert response.status_code == 403
        with pytest.raises(KeyError): security_application.state.repository.get_assignment('student-authored')


def test_private_assignment_is_not_visible_or_executable_to_a_student(security_application):
    repository = security_application.state.repository
    repository.create_assignment({**assignment(), 'assignment_id': 'draft'})
    with TestClient(security_application) as client:
        login(client)
        assert 'draft' not in [row['assignment_id'] for row in client.get('/api/assignments').json()]
        assert client.get('/api/assignments/draft').status_code == 403
        response = client.post('/api/experiments', headers=browser_headers(client),
                               json={'station_id': 'p1', 'assignment_id': 'draft'})
        assert response.status_code == 403


def test_guest_claim_requires_explicit_confirmation_and_owns_only_its_records(security_application):
    with TestClient(security_application) as guest, TestClient(security_application) as other:
        mine = create_experiment(guest, key='guest-create')
        theirs = create_experiment(other)
        login(guest)
        assert guest.get('/api/experiments/' + mine['experiment_id']).status_code == 403
        assert guest.get('/api/auth/session').json()['claim_available'] is True
        response = guest.post('/api/auth/claim-guest', json={'confirm': False}, headers=browser_headers(guest))
        assert response.status_code in (403, 422)
        assert guest.get('/api/experiments/' + mine['experiment_id']).status_code == 403
        response = guest.post('/api/auth/claim-guest', json={'confirm': True}, headers=browser_headers(guest))
        assert response.status_code == 200, response.text
        assert guest.get('/api/experiments/' + mine['experiment_id']).status_code == 200
        assert guest.get('/api/operations/guest-create').status_code == 200
        assert guest.get('/api/experiments/' + theirs['experiment_id']).status_code == 403
        assert other.get('/api/experiments/' + theirs['experiment_id']).status_code == 200


def test_expired_session_has_no_authenticated_access_and_relogin_preserves_ownership(security_application):
    with TestClient(security_application) as client:
        context = login(client)
        experiment = create_experiment(client)
        auth = security_application.state.auth
        real_clock = auth.clock
        auth.clock = lambda: context.expires_at + 1
        expired=client.get('/api/experiments/' + experiment['experiment_id'])
        assert expired.status_code == 401 and expired.json()['code']=='SESSION_EXPIRED'
        auth.clock = real_clock
        login(client)
        assert client.get('/api/experiments/' + experiment['experiment_id']).status_code == 200


def test_published_student_view_omits_answer_and_instructor_fields(security_application):
    repository = security_application.state.repository
    value = {**assignment(), 'assignment_id': 'private-answer', 'reference_design_graph': {
        'schema_version': '1.0', 'circuit_id': 'private-answer', 'modules': [], 'connections': [],
        'metadata': {'answer_secret': 'teacher-only'}}}
    repository.create_assignment(value)
    owner = repository.assignment_policy('a1')['owner_id']
    repository.publish_assignment('private-answer', owner, feedback_policy='observed_only')
    with TestClient(security_application) as student:
        login(student)
        response = student.get('/api/assignments/private-answer')
        assert response.status_code == 200, response.text
        assert response.json()['document_kind'] == 'student'
        for key in ('reference_design_graph', 'reference_topology_graph', 'instructor_pin_profiles',
                    'expected_behavior', 'expected_component_set'):
            assert key not in response.json()
        assert 'teacher-only' not in response.text


def test_instructor_can_publish_own_document_without_accessing_another_private_document(security_application):
    with TestClient(security_application) as teacher, TestClient(security_application) as student:
        login(teacher, 'teacher'); login(student)
        response = teacher.post('/api/assignments', headers=browser_headers(teacher),
                                json={**assignment(), 'assignment_id': 'teacher-draft'})
        assert response.status_code == 201, response.text
        assert response.json()['document_kind'] == 'instructor'
        assert student.get('/api/assignments/teacher-draft').status_code == 403
        assert teacher.get('/api/assignments/a1').json()['document_kind'] == 'student'
        response = teacher.patch('/api/assignments/a1/publication', headers=browser_headers(teacher),
                                 json={'published': False})
        assert response.status_code == 403
        response = teacher.patch('/api/assignments/teacher-draft/publication', headers=browser_headers(teacher),
                                 json={'published': True})
        assert response.status_code == 200, response.text
        assert student.get('/api/assignments/teacher-draft').status_code == 200


def test_student_cannot_promote_its_own_role_or_read_admin_users(security_application):
    with TestClient(security_application) as client:
        context = login(client)
        assert client.get('/api/admin/users').status_code == 403
        response = client.patch('/api/admin/users/' + context.principal_id,
                                headers=browser_headers(client), json={'role': 'ADMIN'})
        assert response.status_code == 403
        assert client.get('/api/auth/session').json()['principal']['role'] == 'STUDENT'


def test_browser_preflight_allows_published_patch_operations_from_trusted_origin(security_application):
    with TestClient(security_application) as client:
        response = client.options('/api/assignments/a1/publication', headers={
            'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'PATCH',
            'Access-Control-Request-Headers': 'content-type,x-csrf-token'})
        assert response.status_code == 200, response.text
        assert response.headers['Access-Control-Allow-Origin'] == 'http://localhost:5173'
        assert response.headers['Access-Control-Allow-Credentials'] == 'true'


def test_production_cookie_flags_and_no_guest_access_with_an_injected_test_database():
    from app.config import Settings
    configuration = Settings(environment='production', database_url='postgresql://db.example/netcircuit',
                             allow_guest=False, trusted_origins=('https://lab.example',))
    application = create_app(repository=Repository('sqlite://'), gateway=LabGateway(),
                             submit=DeferredJobs(), configuration=configuration)
    application.state.auth.bootstrap_admin('admin', 'administrator password')
    with TestClient(application, base_url='https://lab.example') as client:
        response = client.get('/api/auth/session')
        assert response.status_code == 200
        assert response.json()['principal'] is None
        assert response.json()['guest_enabled'] is False
        cookie = response.headers['Set-Cookie'].lower()
        for attribute in ('httponly', 'secure', 'samesite=lax', 'path=/', 'max-age='):
            assert attribute in cookie
        assert client.get('/api/stations').status_code == 401
        token = response.json()['csrf_token']
        login_response = client.post('/api/auth/login', json={
            'username': 'admin', 'password': 'administrator password'},
            headers={'Origin': 'https://lab.example', 'X-CSRF-Token': token})
        assert login_response.status_code == 200, login_response.text
        assert client.get('/api/stations').status_code == 200


@pytest.mark.parametrize('overrides', [
    {'allow_guest': True}, {'trusted_origins': ()},
    {'trusted_origins': ('http://lab.example',)}, {'trusted_origins': ('https://lab.example/path',)},
    {'trusted_origins': ('*',)}, {'database_url': 'sqlite:///production.db'},
])
def test_production_settings_fail_closed_without_private_explicit_configuration(overrides):
    from app.config import Settings
    values = {'environment': 'production', 'database_url': 'postgresql://db.example/netcircuit',
              'allow_guest': False, 'trusted_origins': ('https://lab.example',), **overrides}
    with pytest.raises(ValueError): Settings(**values)


def test_claim_cannot_forge_another_guest_or_repeat_a_completed_transfer(security_application):
    with TestClient(security_application) as guest, TestClient(security_application) as other:
        mine = create_experiment(guest)
        theirs = create_experiment(other)
        other_owner = security_application.state.repository.owner(theirs['experiment_id'])
        login(guest)
        response = guest.post('/api/auth/claim-guest', headers=browser_headers(guest),
                              json={'confirm': True, 'guest_id': other_owner})
        assert response.status_code == 422
        assert security_application.state.repository.owner(theirs['experiment_id']) == other_owner
        response = guest.post('/api/auth/claim-guest', headers=browser_headers(guest), json={'confirm': True})
        assert response.status_code == 200
        assert guest.get('/api/experiments/' + mine['experiment_id']).status_code == 200
        response = guest.post('/api/auth/claim-guest', headers=browser_headers(guest), json={'confirm': True})
        assert response.status_code == 409


def test_claim_waits_for_active_guest_lease_to_reach_safe_release(security_application):
    with TestClient(security_application) as guest:
        mine = create_experiment(guest)
        old_owner = security_application.state.repository.owner(mine['experiment_id'])
        response = guest.post('/api/experiments/' + mine['experiment_id'] + '/run', headers=browser_headers(guest))
        assert response.status_code == 200
        login(guest)
        response = guest.post('/api/auth/claim-guest', headers=browser_headers(guest), json={'confirm': True})
        assert response.status_code == 409 and response.json()['code'] == 'GUEST_CLAIM_ACTIVE_LEASE'
        assert security_application.state.repository.owner(mine['experiment_id']) == old_owner
        security_application.state.manager.submit.run_one()
        assert security_application.state.repository.leases() == []
        response = guest.post('/api/auth/claim-guest', headers=browser_headers(guest), json={'confirm': True})
        assert response.status_code == 200, response.text


def test_guest_claim_operation_collision_rolls_back_every_ownership_change(security_application):
    with TestClient(security_application) as account, TestClient(security_application) as guest:
        account_context = login(account)
        existing = create_experiment(account, key='same-key')
        mine = create_experiment(guest, key='same-key')
        guest_owner = security_application.state.repository.owner(mine['experiment_id'])
        login(guest)
        response = guest.post('/api/auth/claim-guest', headers=browser_headers(guest), json={'confirm': True})
        assert response.status_code == 409 and response.json()['code'] == 'GUEST_CLAIM_CONFLICT'
        assert security_application.state.repository.owner(mine['experiment_id']) == guest_owner
        assert security_application.state.repository.owner(existing['experiment_id']) == account_context.owner_id
        operation = account.get('/api/operations/same-key')
        assert operation.status_code == 200
        assert operation.json()['experiment']['experiment_id'] == existing['experiment_id']


def test_administrator_role_does_not_bypass_runtime_safety(security_application):
    security_application.state.gateway.safety = 'UNSAFE'
    with TestClient(security_application) as client:
        login(client, 'admin', 'administrator password')
        experiment = create_experiment(client)
        response = client.post('/api/experiments/' + experiment['experiment_id'] + '/run', headers=browser_headers(client))
        assert response.status_code == 200
        security_application.state.manager.submit.run_one()
        record = client.get('/api/experiments/' + experiment['experiment_id']).json()
        assert record['execution_decision']['decision'] == 'BLOCK_SAFETY'
        assert 'guarded_power_up' not in security_application.state.gateway.calls
        assert 'start_execution' not in security_application.state.gateway.calls


def test_login_failures_do_not_reveal_whether_a_username_exists(security_application):
    with TestClient(security_application) as client:
        results = []
        for username in ('alice', 'not-a-real-user'):
            response = client.post('/api/auth/login', headers=browser_headers(client),
                                   json={'username': username, 'password': 'incorrect long password'})
            assert response.status_code == 401
            results.append({key: value for key, value in response.json().items() if key != 'request_id'})
        assert results[0] == results[1]
        assert results[0]['code'] == 'INVALID_CREDENTIALS'
