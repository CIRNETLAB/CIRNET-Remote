import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app
from app.services.circuit_validator import validate_circuit_graph
import pytest

client=TestClient(app)

def valid_graph():
    return {'schema_version':'1.0','circuit_id':'c1','modules':[{'id':'SW1','type':'DIGITAL_SWITCH'}],'connections':[]}

def test_valid_circuit_returns_structured_success():
    response=client.post('/api/circuits/validate',json=valid_graph())
    assert response.status_code==200
    assert response.json()=={'valid':True,'code':'OK','message':'Circuit Graph is structurally valid.'}


def test_contact_wire_visual_metadata_remains_accepted_by_unchanged_api_contract():
    graph = {'schema_version': '1.0', 'circuit_id': 'contact', 'modules': [{'id': 'BB', 'type': 'BREADBOARD'}],
             'connections': [{'source': 'BB.contact:terminal:A:01', 'destination': 'BB.contact:terminal:J:03',
                              'metadata': {'wireVisual': {'version': 1, 'color': '#397ec6', 'routeMode': 'ORTHOGONAL', 'controlPoints': [], 'thickness': .036}}}]}
    response = client.post('/api/circuits/validate', json=graph)
    assert response.status_code == 200 and response.json()['valid'] is True

def test_missing_schema_version_returns_structured_error():
    graph=valid_graph(); graph.pop('schema_version')
    response=client.post('/api/circuits/validate',json=graph)
    assert response.status_code==422
    body=response.json()
    assert body['valid'] is False
    assert body['code']=='SCHEMA_VALIDATION_ERROR'
    assert body['message']


@pytest.mark.parametrize('fields', [
    {'position': 'bad'},
    {'position': None},
    {'position': {'x': '1'}},
    {'position': {'x': True}},
    {'position': {'x': None}},
    {'position': {'x': 1, 'extra': 2}},
    {'rotation': '90'},
    {'rotation': True},
    {'rotation': None},
    {'properties': []},
    {'properties': None},
])
def test_module_fields_reject_values_outside_canonical_schema(fields):
    graph = valid_graph()
    graph['modules'][0].update(fields)
    response = client.post('/api/circuits/validate', json=graph)
    assert response.status_code == 422
    assert response.json()['code'] == 'SCHEMA_VALIDATION_ERROR'


def test_optional_editor_fields_accept_numbers_and_unknown_module_metadata():
    graph = valid_graph()
    graph['modules'][0].update({
        'position': {'x': 1, 'y': 0.5},
        'rotation': 90,
        'properties': {'custom': 'value'},
        'unknown_future_field': {'preserved': True},
    })
    assert client.post('/api/circuits/validate', json=graph).json()['valid'] is True


def test_editor_fields_preserve_json_integers_beyond_float_range():
    graph = valid_graph()
    graph['modules'][0].update({'position': {'x': 10 ** 400}, 'rotation': 10 ** 400})
    assert validate_circuit_graph(graph)[0] is True


@pytest.mark.parametrize('connection_metadata', [False, True])
def test_explicit_null_metadata_is_rejected(connection_metadata):
    graph = valid_graph()
    if connection_metadata:
        graph['connections'] = [{'source': 'SW1.OUT', 'destination': 'SW1.IN', 'metadata': None}]
    else:
        graph['metadata'] = None
    response = client.post('/api/circuits/validate', json=graph)
    assert response.status_code == 422
    assert response.json()['code'] == 'SCHEMA_VALIDATION_ERROR'


@pytest.mark.parametrize('payload', [[], 'bad', 1, None])
def test_non_object_graph_returns_structured_schema_error(payload):
    response = client.post('/api/circuits/validate', json=payload)
    assert response.status_code == 422
    assert response.json()['valid'] is False
    assert response.json()['code'] == 'SCHEMA_VALIDATION_ERROR'
