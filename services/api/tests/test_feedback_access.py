"""Assignment feedback policy applies to every experiment projection and stream."""
import json

from fastapi.testclient import TestClient
import pytest

from test_auth_security import security_application, browser_headers, login
from test_auth_control import socket
from test_lab_lifecycle import assignment


ANSWER_SENTINEL = 'teacher_answer_sentinel'
REFERENCE_COMPONENT = 'teacher_reference_component'
REFERENCE_INPUT = 'teacher_reference_input'
REFERENCE_OUTPUT = 'teacher_reference_output'


@pytest.fixture
def feedback_application(security_application):
    application = security_application
    auth = application.state.auth
    guest, _ = auth.ensure_session(None)
    teacher, _ = auth.login(guest, 'teacher', 'teacher secure password')
    value = {**assignment(), 'assignment_id': 'feedback-private', 'expected_component_set': ['AND'],
             'reference_topology_graph': {
                 'schema_version': '1.0', 'scan_id': 'teacher-reference',
                 'nodes': [{'node_id': REFERENCE_INPUT}, {'node_id': REFERENCE_OUTPUT}],
                 'connections': [], 'ambiguities': [],
                 'components': [{'component_id': REFERENCE_COMPONENT, 'kind': 'OBSERVED_PHYSICAL_COMPONENT',
                                 'identity': 'AND', 'node_ids': [REFERENCE_INPUT, REFERENCE_OUTPUT],
                                 'pins': [{'pin_id': 'A', 'node_id': REFERENCE_INPUT},
                                          {'pin_id': 'Y', 'node_id': REFERENCE_OUTPUT}]}]},
             'expected_behavior': {
                 'expected_signals': [{'signal': 'y', 'time_ns': 0, 'value': 0},
                                      {'signal': ANSWER_SENTINEL, 'time_ns': 37, 'value': 1}],
                 'truth_table': [{'inputs': {'x': 0}, 'outputs': {'y': 0}},
                                 {'inputs': {'x': 1}, 'outputs': {'y': 1}}]}}
    application.state.repository.create_assignment(value, owner_id=teacher.principal_id, published=True)
    original = application.state.gateway.call
    def call(station_id, experiment_id, method, **kwargs):
        if method == 'scan_topology':
            return {'schema_version': '1.0', 'scan_id': 'actual-student-scan',
                    'nodes': [{'node_id': 'N1'}, {'node_id': 'N2'}], 'connections': [], 'ambiguities': [],
                    'components': [{'component_id': 'actual-observed-component', 'kind': 'OBSERVED_PHYSICAL_COMPONENT',
                                    'identity': 'AND', 'node_ids': ['N1', 'N2'],
                                    'pins': [{'pin_id': 'A', 'node_id': 'N1'}, {'pin_id': 'Y', 'node_id': 'N2'}]}]}
        if method == 'read_capture':
            return {'available': True, 'duration_ns': 40,
                    'samples': [{'signal': 'y', 'time_ns': 0, 'value': 1},
                                {'signal': 'y', 'time_ns': 20, 'value': 0}]}
        return original(station_id, experiment_id, method, **kwargs)
    application.state.gateway.call = call
    return application


def create_and_execute(client, application):
    headers = {**browser_headers(client, control='feedback-tab'), 'Idempotency-Key': 'feedback-create'}
    payload = {'station_id': 'p1', 'assignment_id': 'feedback-private',
               'capture_config': {'signals': ['y'], 'duration_ns': 40},
               'test_vectors': [{'time_ns': 0, 'inputs': {'x': 0}}, {'time_ns': 20, 'inputs': {'x': 1}}]}
    created = client.post('/api/experiments', json=payload, headers=headers)
    assert created.status_code == 201, created.text
    eid = created.json()['experiment_id']
    headers = {**browser_headers(client, control='feedback-tab'), 'Idempotency-Key': 'feedback-run'}
    response = client.post('/api/experiments/' + eid + '/run', headers=headers)
    assert response.status_code == 200, response.text
    application.state.manager.submit.run_one()
    stored = application.state.repository.get_experiment(eid)
    assert stored['state'] == 'COMPLETE', stored['error_code']
    assert stored['functional_verification']['mismatched_signals']
    assert stored['functional_verification']['expected_truth_table']
    assert REFERENCE_COMPONENT in json.dumps(stored['topology_resolution'])
    assert REFERENCE_INPUT in json.dumps(stored['topology_verification'])
    return eid, stored, payload


def public_records(client, eid, payload):
    records = []
    for path in ('/api/experiments/' + eid, '/api/experiments/' + eid + '/results'):
        response = client.get(path)
        assert response.status_code == 200, response.text
        records.append(response.json())
    response = client.get('/api/experiments')
    assert response.status_code == 200
    records.extend(response.json())
    for key, kind in [('feedback-create', 'create'), ('feedback-run', 'run')]:
        response = client.get('/api/operations/' + key, params={'kind': kind, 'experiment_id': eid} if kind == 'run' else {})
        assert response.status_code == 200, response.text
        records.append(response.json()['experiment'])
    for method, path, body, key in [('post', '/api/experiments', payload, 'feedback-create'),
                                    ('post', '/api/experiments/' + eid + '/run', None, 'feedback-run'),
                                    ('post', '/api/experiments/' + eid + '/stop', None, 'feedback-stop')]:
        headers = {**browser_headers(client, control='feedback-tab'), 'Idempotency-Key': key}
        response = client.request(method, path, json=body, headers=headers)
        assert response.status_code in (200, 201), response.text
        records.append(response.json())
    response = client.get('/api/operations/feedback-stop', params={'kind': 'stop', 'experiment_id': eid})
    assert response.status_code == 200, response.text
    records.append(response.json()['experiment'])
    return records


def assert_observed_only(record):
    text = json.dumps(record)
    assert ANSWER_SENTINEL not in text
    assert REFERENCE_COMPONENT not in text
    assert REFERENCE_INPUT not in text
    assert REFERENCE_OUTPUT not in text
    function = record['functional_verification']
    assert 'expected_signals' not in function
    assert 'expected_truth_table' not in function
    assert all('expected' not in item for item in function.get('mismatched_signals', []))
    if function['status'] != 'NOT_EVALUATED':
        assert function['observed_signals']
        assert function['observed_truth_table']


def assert_detailed(record):
    function = record['functional_verification']
    assert function['expected_signals']
    assert function['expected_truth_table']
    assert any('expected' in item for item in function['mismatched_signals'])
    assert ANSWER_SENTINEL in json.dumps(function)
    assert REFERENCE_COMPONENT in json.dumps(record['topology_resolution'])


def test_student_observed_only_feedback_hides_answers_on_every_http_route(feedback_application):
    with TestClient(feedback_application) as student:
        login(student)
        eid, stored, payload = create_and_execute(student, feedback_application)
        assert_detailed(stored)
        for record in public_records(student, eid, payload):
            assert_observed_only(record)
        # Public projection must never destructively redact the stored evidence.
        assert feedback_application.state.repository.get_experiment(eid) == stored


def test_student_observed_only_feedback_hides_answers_in_every_lifecycle_event(feedback_application):
    with TestClient(feedback_application) as student:
        login(student)
        with socket(student, 'feedback-tab') as websocket:
            eid, stored, _ = create_and_execute(student, feedback_application)
            events = []
            for _ in range(40):
                event = websocket.receive_json()
                if event['type'] != 'experiment.updated': continue
                record = event['experiment']
                assert record['experiment_id'] == eid
                events.append(record)
                assert_observed_only(record)
                if record['state'] == 'COMPLETE' and record['lease_expires_at'] is None: break
            assert events[-1]['state'] == 'COMPLETE' and events[-1]['lease_expires_at'] is None
            assert_detailed(stored)


@pytest.mark.parametrize('username,password', [('teacher', None), ('admin', 'administrator password')])
def test_assignment_author_and_admin_retain_detailed_feedback_for_their_own_run(feedback_application, username, password):
    with TestClient(feedback_application) as client:
        login(client, username, password)
        eid, _, payload = create_and_execute(client, feedback_application)
        for record in public_records(client, eid, payload):
            assert_detailed(record)


def test_explicit_detailed_policy_allows_student_expected_feedback(feedback_application):
    repository = feedback_application.state.repository
    policy = repository.assignment_policy('feedback-private')
    repository.publish_assignment('feedback-private', policy['owner_id'], feedback_policy='detailed')
    with TestClient(feedback_application) as student:
        login(student)
        eid, _, payload = create_and_execute(student, feedback_application)
        for record in public_records(student, eid, payload):
            assert_detailed(record)
