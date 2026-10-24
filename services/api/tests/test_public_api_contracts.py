"""Public HTTP shapes are explicit, conforming, and exclude hardware-private data."""
from pathlib import Path
import json
import subprocess
import sys

from csrf_client import CsrfTestClient as TestClient
from csrf_client import login_admin
import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'services/api'))


def test_all_known_http_successes_and_errors_have_explicit_contracts():
    from app.main import app
    document = app.openapi()
    for path, operations in document['paths'].items():
        if not path.startswith('/api/'):
            continue
        for method, operation in operations.items():
            if method not in ('get', 'post', 'put', 'delete', 'patch'):
                continue
            for status, response in operation['responses'].items():
                if status.startswith('2'):
                    content = response.get('content', {})
                    assert content, (path, method, status)
                    assert all(item.get('schema') for item in content.values()), (path, method, status)
            assert {'403', '404', '409', '422', '429', '503'} <= operation['responses'].keys(), (path, method)


def test_station_http_projection_excludes_internal_route_resources():
    from app.main import create_app
    from app.services.persistence import Repository
    from contracts.registry import validate_contract
    from test_lab_lifecycle import LabGateway, DeferredJobs
    gateway = LabGateway()
    application = create_app(repository=Repository('sqlite://'), gateway=gateway, submit=DeferredJobs())
    with TestClient(application) as client:
        response = client.get('/api/stations/physical-station-01/capabilities')
        assert response.status_code == 200
        assert 'routing_resources' not in response.json()
        validate_contract('PublicStationCapabilities', response.json(), profile='transport')
        stations = client.get('/api/stations').json()
        assert all('routing_resources' not in station['capabilities'] for station in stations)
        assert gateway.capabilities('physical-station-01')['routing_resources'][0]['node_ids'] == ['N1']


def test_capture_openapi_declares_binary_media_and_metadata_deletion_response():
    from app.main import app
    document = app.openapi()
    payload = document['paths']['/api/captures/{capture_id}/payload']
    assert payload['get']['responses']['200']['content']['application/vnd.netcircuit.capture; version=1']['schema'] == {
        'type': 'string', 'format': 'binary'}
    assert payload['delete']['responses']['200']['content']['application/json']['schema']


def test_create_request_cannot_accept_client_authored_execution_permission():
    from contracts.registry import validate_contract
    from jsonschema import ValidationError
    with pytest.raises(ValidationError):
        validate_contract('ExperimentCreate', {'station_id': 'physical-station-01', 'execution_decision': {
            'schema_version': '1.0', 'decision': 'RUN_NORMAL', 'reasons': []}})


def test_create_request_retains_explicit_empty_clock_configuration():
    from contracts.registry import validate_contract
    from contracts.boundary.models import ExperimentCreate
    value={'station_id':'physical-station-01','clock_config':{}}
    assert validate_contract('ExperimentCreate',value,profile='transport')==value
    assert ExperimentCreate.model_validate(value).model_dump()==value


def test_physical_preview_identifies_simulated_provenance_and_retains_legacy_validation_error():
    from app.main import app
    from contracts.registry import validate_contract
    with TestClient(app) as client:
        response = client.post('/api/circuits/physical-preview', json={
            'schema_version': '1.0', 'circuit_id': 'probe', 'modules': [], 'connections': []})
        assert response.status_code == 200
        validate_contract('PhysicalPreviewResult', response.json())
        assert response.json()['provenance'] == 'simulation_preview'
        assert response.json()['limitations']
        response = client.post('/api/circuits/validate', json={'schema_version': 1.0})
        assert response.status_code == 422 and response.json()['valid'] is False


def test_openapi_uses_canonical_numeric_types_and_contains_no_private_plan():
    from app.main import app
    from app.services.api_contracts import install_openapi
    app.openapi_schema=None
    install_openapi(app)
    document=app.openapi()
    schemas=document['components']['schemas']
    assert schemas['ClockConfiguration']['properties']['period_ns']['type']=='integer'
    assert schemas['ClockConfiguration']['properties']['period_ns']['maximum']==4294967295
    assert 'InstrumentationExecutionPlan' not in schemas
    assert 'routing_resources' not in schemas['PublicStationCapabilities']['properties']
    assert document['paths']['/api/circuits/validate']['post']['requestBody']['content']['application/json']['schema']['$ref'].endswith('/CircuitGraph')


def test_http_successes_conform_to_exported_response_schemas():
    from app.main import create_app
    from app.services.persistence import Repository
    from app.services.api_contracts import install_openapi
    from test_lab_lifecycle import LabGateway, DeferredJobs, assignment
    from jsonschema import Draft202012Validator
    application=create_app(repository=Repository('sqlite://'),gateway=LabGateway(),submit=DeferredJobs())
    install_openapi(application)
    document=application.openapi()
    with TestClient(application) as client:
        login_admin(client)
        responses=[('get','/api/health',client.get('/api/health')),
                   ('get','/api/stations',client.get('/api/stations')),
                   ('post','/api/assignments',client.post('/api/assignments',json=assignment()))]
        created=client.post('/api/experiments',json={'station_id':'physical-station-01','assignment_id':'a1'})
        responses.append(('post','/api/experiments',created))
        for method,path,response in responses:
            assert response.is_success,response.text
            schema=document['paths'][path][method]['responses'][str(response.status_code)]['content']['application/json']['schema']
            Draft202012Validator({**schema,'components':document['components']}).validate(response.json())


def test_generated_browser_operations_follow_route_methods_paths_and_binary_media(tmp_path):
    from app.main import app
    from app.services.api_contracts import install_openapi
    from scripts.export_openapi import operation_bindings
    install_openapi(app)
    output=tmp_path/'operations.ts'
    output.write_text(operation_bindings(app.openapi()),encoding='utf-8')
    code="import {apiOperations} from "+json.dumps(output.as_uri())+"; process.stdout.write(JSON.stringify({create:apiOperations.createExperiment,capture:apiOperations.getCapturePayload}));"
    result=subprocess.run(['node','--input-type=module','-e',code],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    bindings=json.loads(result.stdout)
    assert bindings['create']['method']=='POST'
    assert bindings['create']['path']=='/api/experiments'
    assert bindings['create']['requestContract']=='ExperimentCreate'
    assert bindings['create']['responseContract']=='ExperimentRecord'
    assert bindings['capture']['binary'] is True
    assert bindings['capture']['responseMedia']==['application/vnd.netcircuit.capture; version=1']


def test_openapi_export_rejects_staged_model_injection(tmp_path):
    models=tmp_path/'models.py'
    models.write_bytes((ROOT/'contracts/boundary/models.py').read_bytes())
    result=subprocess.run([sys.executable,str(ROOT/'scripts/export_openapi.py'),'--models',str(models),
                           '--output',str(tmp_path/'openapi.json'),'--operations',str(tmp_path/'operations.ts')],
                          cwd=ROOT,capture_output=True,text=True)
    assert result.returncode!=0
    assert '--models' in result.stderr
    assert not (tmp_path/'openapi.json').exists()
    assert not (tmp_path/'operations.ts').exists()
    assert not list(tmp_path.rglob('*.pyc'))
