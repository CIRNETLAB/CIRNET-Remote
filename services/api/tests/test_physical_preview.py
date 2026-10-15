"""The physical subset has a JSON preview without extending capture/FPGA RPC."""
import sys
import copy
import json
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app


def graph():
    return {'schema_version': '1.1', 'circuit_id': 'powered-preview', 'modules': [
        {'id': 'PS', 'type': 'DC_SUPPLY'}, {'id': 'U', 'type': 'SN74HC08N'},
    ], 'connections': [
        {'source': 'PS.PLUS', 'destination': 'U.14'}, {'source': 'PS.MINUS', 'destination': 'U.7'},
        {'source': 'PS.PLUS', 'destination': 'U.1'}, {'source': 'PS.PLUS', 'destination': 'U.2'},
    ]}


def test_physical_preview_validates_and_returns_real_powered_pin_values():
    response = TestClient(app).post('/api/circuits/physical-preview', json=graph())
    assert response.status_code == 200
    body = response.json()
    assert body['device_states']['U']['state'] == 'POWERED'
    assert body['pin_values']['U.3'] == 1
    assert body['pin_values']['U.6'] == 'X'
    assert isinstance(body['diagnostics'], list)


def test_physical_preview_rejects_malformed_mount_and_does_not_invent_ground():
    value = graph(); value['modules'][1]['mount'] = {'version': 1}
    assert TestClient(app).post('/api/circuits/physical-preview', json=value).status_code == 422
    value = graph(); value['connections'].pop(1)
    body = TestClient(app).post('/api/circuits/physical-preview', json=value).json()
    assert body['device_states']['U']['state'] == 'UNPOWERED'
    assert body['pin_values']['U.3'] == 'X'


def test_shared_mounting_fixture_validates_and_roundtrips_through_typed_api_model():
    from app.models.circuit import CircuitGraph
    fixture = json.loads((Path(__file__).resolve().parents[3]/'contracts/design-models/fixtures/physical-mounting-parity.json').read_text(encoding='utf-8'))
    value = fixture['graph']
    assert CircuitGraph.model_validate_json(json.dumps(value)).model_dump(exclude_unset=True) == value
    assert TestClient(app).post('/api/circuits/validate', json=value).json()['valid'] is True
    invalid = copy.deepcopy(value); invalid['modules'][1]['mount']['version'] = True
    assert TestClient(app).post('/api/circuits/validate', json=invalid).status_code == 422
    invalid = copy.deepcopy(value); invalid['modules'][1]['mount']['contacts'][0]['version'] = True
    assert TestClient(app).post('/api/circuits/validate', json=invalid).status_code == 422


def test_openable_lab_example_powers_real_mounted_ic_and_led_and_loses_light_when_off():
    value = json.loads((Path(__file__).resolve().parents[3]/'contracts/circuit-schema/examples/physical-hc08-led.json').read_text(encoding='utf-8'))
    client = TestClient(app)
    response = client.post('/api/circuits/physical-preview', json=value)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body['device_states']['U1']['state'] == 'POWERED'
    assert body['pin_values']['U1.3'] == 1
    assert body['device_states']['D1']['state'] == 'ON'
    next(module for module in value['modules'] if module['id'] == 'PSU')['properties']['power_on'] = False
    body = client.post('/api/circuits/physical-preview', json=value).json()
    assert body['device_states']['U1']['state'] == 'UNPOWERED'
    assert body['pin_values']['U1.3'] == 'X'
    assert body['device_states']['D1']['state'] in ('OFF', 'UNKNOWN')


def test_missing_execution_profile_keeps_authoring_valid_and_reports_unavailable_without_simulating(monkeypatch):
    from contracts import physical_mounting
    parts = copy.deepcopy(physical_mounting.physical_parts())
    capacitor = next(part for part in parts if part['editorType'] == 'CAPACITOR_CERAMIC')
    capacitor.pop('simulation', None)
    monkeypatch.setattr(physical_mounting, 'physical_parts', lambda: parts)
    value = {'schema_version': '1.1', 'circuit_id': 'no-profile', 'modules': [
        {'id': 'C', 'type': 'CAPACITOR_CERAMIC', 'properties': {'capacitanceFarads': 100e-9, 'voltageRatingVolts': 50}},
    ], 'connections': []}
    client = TestClient(app)
    assert client.post('/api/circuits/validate', json=value).status_code == 200
    response = client.post('/api/circuits/physical-preview', json=value)
    assert response.status_code == 200, response.json()
    body = response.json()
    assert body['device_states']['C']['state'] == 'UNSUPPORTED'
    assert 'profile' in body['device_states']['C']['reason'].lower()
    assert body['pin_values']['C.A'] == 'X'
    assert body['pin_values']['C.B'] == 'X'


def test_result_contract_accepts_observed_device_state_without_an_engine_model():
    from app.api.circuits import PhysicalPreview
    value = {'device_states': {'D1': {'state': 'ON'}}, 'pin_values': {'D1.A': 1}, 'diagnostics': []}
    assert PhysicalPreview.model_validate(value).model_dump(exclude_none=True) == value
