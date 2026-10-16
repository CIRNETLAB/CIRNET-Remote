from csrf_client import CsrfTestClient as TestClient
from csrf_client import publish_fixture_assignment
import pytest


def test_schema_only_app_never_constructs_repository_or_gateway(monkeypatch):
    import app.main as main
    def forbidden(*args,**kwargs):
        raise AssertionError('OpenAPI initialized runtime')
    monkeypatch.setattr(main,'Repository',forbidden)
    monkeypatch.setattr(main,'HardwareServiceClient',forbidden)
    application=main.create_app(schema_only=True)
    assert '/api/experiments' in application.openapi()['paths']


def test_business_errors_have_correlated_safe_envelope():
    from app.main import create_app
    from app.services.persistence import Repository
    from test_lab_lifecycle import LabGateway, DeferredJobs
    application=create_app(repository=Repository('sqlite://'),gateway=LabGateway(),submit=DeferredJobs())
    with TestClient(application) as client:
        response=client.get('/api/experiments/missing',headers={'X-Request-ID':'request-test-123'})
        assert response.status_code==404
        assert response.json()['request_id']=='request-test-123'
        assert response.headers['X-Request-ID']=='request-test-123'
        assert response.json()['code']=='NOT_FOUND'
        assert response.json()['message']!='NOT_FOUND'


def test_http_validation_errors_are_typed_without_echoing_raw_inputs():
    from app.main import create_app
    from app.services.persistence import Repository
    from test_lab_lifecycle import LabGateway, DeferredJobs
    application=create_app(repository=Repository('sqlite://'),gateway=LabGateway(),submit=DeferredJobs())
    with TestClient(application) as client:
        response=client.post('/api/experiments',json={'private':'do-not-echo-this'})
        assert response.status_code==422
        assert response.json()['code'] in {'INVALID_CONTRACT','REQUEST_VALIDATION_ERROR'}
        assert response.json()['request_id']
        assert 'do-not-echo-this' not in response.text


def test_http_lost_create_ack_reconciles_key_and_conflict_without_duplicate():
    from app.main import create_app
    from app.services.persistence import Repository
    from test_lab_lifecycle import LabGateway, DeferredJobs, assignment
    repo=Repository('sqlite://')
    application=create_app(repository=repo,gateway=LabGateway(),submit=DeferredJobs())
    publish_fixture_assignment(application,assignment())
    with TestClient(application) as client:
        body={'station_id':'physical-station-01','assignment_id':'a1'}
        first=client.post('/api/experiments',json=body,headers={'Idempotency-Key':'create-http-once'})
        assert first.status_code==201
        # Ignore the first response as a client with a lost acknowledgement.
        retry=client.post('/api/experiments',json=body,headers={'Idempotency-Key':'create-http-once'})
        assert retry.status_code==201
        assert retry.json()['experiment_id']==first.json()['experiment_id']
        assert len(client.get('/api/experiments').json())==1
        operation=client.get('/api/operations/create-http-once')
        assert operation.status_code==200
        assert operation.json()['experiment']['experiment_id']==first.json()['experiment_id']
        assert operation.json()['status']=='APPLIED'
        changed={**body,'capture_config':{'signals':[],'duration_ns':1}}
        response=client.post('/api/experiments',json=changed,headers={'Idempotency-Key':'create-http-once'})
        assert response.status_code==409
        assert response.json()['code']=='IDEMPOTENCY_CONFLICT'
