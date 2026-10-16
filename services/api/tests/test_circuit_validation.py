import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from csrf_client import CsrfTestClient as TestClient
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


@pytest.mark.parametrize('module_type, properties', [
    ('RESISTOR_AXIAL', {'resistanceOhms': 0}),
    ('RESISTOR_AXIAL', {'resistanceOhms': '1 kΩ'}),
    ('RESISTOR_AXIAL', {'powerWatts': -1}),
    ('CAPACITOR_CERAMIC', {'capacitanceFarads': ''}),
    ('CAPACITOR_ELECTROLYTIC', {'voltageRatingVolts': 0}),
])
def test_api_rejects_invalid_design_properties(module_type, properties):
    value = {'schema_version': '1.1', 'circuit_id': 'properties', 'modules': [{'id': 'R', 'type': module_type, 'properties': properties}], 'connections': []}
    assert client.post('/api/circuits/validate', json=value).status_code == 422


def test_api_model_explicitly_normalizes_legacy_resistance_and_preserves_new_properties():
    from app.models.circuit import CircuitGraph
    value = {'schema_version': '1.1', 'circuit_id': 'properties', 'modules': [{'id': 'R', 'type': 'RESISTOR_AXIAL', 'properties': {'resistance_ohm': 1000, 'powerWatts': .5, 'tolerancePercent': 2}}], 'connections': []}
    serialized = CircuitGraph.model_validate(value).model_dump(exclude_unset=True)
    assert serialized['modules'][0]['properties'] == {'resistanceOhms': 1000, 'powerWatts': .5, 'tolerancePercent': 2}
    assert value['modules'][0]['properties']['resistance_ohm'] == 1000


@pytest.mark.parametrize('module_type, properties', [
    ('RESISTOR_AXIAL', {'resistanceOhms': 1234, 'powerWatts': .5, 'tolerancePercent': 2}),
    ('CAPACITOR_CERAMIC', {'capacitanceFarads': 100e-9, 'voltageRatingVolts': 50}),
    ('CAPACITOR_ELECTROLYTIC', {'capacitanceFarads': 47e-6, 'voltageRatingVolts': 25}),
])
def test_api_roundtrip_keeps_all_design_properties_as_numbers(module_type, properties):
    from app.models.circuit import CircuitGraph
    value = {'schema_version': '1.1', 'circuit_id': 'properties', 'modules': [{'id': 'P', 'type': module_type, 'properties': properties}], 'connections': []}
    assert CircuitGraph.model_validate_json(json.dumps(value)).model_dump(exclude_unset=True) == value
    assert client.post('/api/circuits/validate', json=value).status_code == 200


@pytest.mark.parametrize('module_type', [{}, [], True, None])
def test_property_normalization_keeps_malformed_module_types_as_structured_schema_errors(module_type):
    value = valid_graph()
    value['modules'][0].update(type=module_type, properties={})
    response = client.post('/api/circuits/validate', json=value)
    assert response.status_code == 422
    assert response.json()['code'] == 'SCHEMA_VALIDATION_ERROR'
