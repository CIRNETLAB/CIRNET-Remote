import copy
import json
from pathlib import Path

import pytest

from contracts.design_validation import validate_design_graph


def graph(module_type='RESISTOR_AXIAL', properties=None):
    return {'schema_version': '1.1', 'circuit_id': 'design-properties',
            'modules': [{'id': 'R1', 'type': module_type, 'properties': properties or {}}], 'connections': []}


@pytest.mark.parametrize('module_type, properties', [
    ('RESISTOR_AXIAL', {'resistanceOhms': 0}),
    ('RESISTOR_AXIAL', {'resistanceOhms': '1 kΩ'}),
    ('RESISTOR_AXIAL', {'resistanceOhms': True}),
    ('RESISTOR_AXIAL', {'resistanceOhms': float('nan')}),
    ('RESISTOR_AXIAL', {'powerWatts': float('inf')}),
    ('RESISTOR_AXIAL', {'tolerancePercent': 21}),
    ('CAPACITOR_CERAMIC', {'capacitanceFarads': 0}),
    ('CAPACITOR_ELECTROLYTIC', {'voltageRatingVolts': -1}),
])
def test_design_validation_rejects_invalid_canonical_component_properties(module_type, properties):
    with pytest.raises(ValueError):
        validate_design_graph(graph(module_type, properties))


def test_design_properties_survive_typed_api_serialization_without_mount_or_wire_changes():
    from contracts.component_properties import normalize_design_properties
    fixture = json.loads((Path(__file__).resolve().parents[2] / 'contracts/design-models/fixtures/legacy-component-properties.json').read_text(encoding='utf-8'))
    resistor = next(m for m in fixture['modules'] if m['type'] == 'RESISTOR_AXIAL')
    original = copy.deepcopy(fixture)
    normalized = normalize_design_properties(fixture)
    validate_design_graph(normalized)
    result = next(m for m in normalized['modules'] if m['id'] == resistor['id'])
    assert result['properties'] == {'resistanceOhms': 4700, 'powerWatts': .5, 'tolerancePercent': 2}
    assert result['mount'] == resistor['mount']
    assert normalized['connections'] == fixture['connections']
    assert fixture == original


def test_explicit_normalizer_keeps_canonical_value_and_unrelated_legacy_metadata():
    from contracts.component_properties import normalize_component_properties
    assert normalize_component_properties('RESISTOR_AXIAL', {'resistanceOhms': 220, 'resistance_ohm': 330}) == {'resistanceOhms': 220}
    assert normalize_component_properties('UNKNOWN_LEGACY', {'resistance_ohm': 330}) == {'resistance_ohm': 330}


def test_editor_validation_requires_no_simulation_profile(monkeypatch):
    from contracts import physical_mounting
    parts = copy.deepcopy(physical_mounting.physical_parts())
    for part in parts:
        part.pop('simulation', None)
    monkeypatch.setattr(physical_mounting, 'physical_parts', lambda: parts)
    validate_design_graph(graph('CAPACITOR_CERAMIC', {'capacitanceFarads': 100e-9, 'voltageRatingVolts': 50}))


def test_optional_execution_profile_adapter_preserves_declared_profiles_and_never_mutates_descriptors(monkeypatch):
    from contracts import physical_mounting
    from contracts.execution_profiles import get_execution_part
    parts = copy.deepcopy(physical_mounting.physical_parts())
    capacitor = next(part for part in parts if part['editorType'] == 'CAPACITOR_CERAMIC')
    capacitor.pop('simulation', None)
    original = copy.deepcopy(parts)
    monkeypatch.setattr(physical_mounting, 'physical_parts', lambda: parts)
    source = next(part for part in parts if part['editorType'] == 'SN74HC08N')
    assert get_execution_part('SN74HC08N')['simulation'] == source['simulation']
    assert get_execution_part('CAPACITOR_CERAMIC')['simulation']['status'] == 'unsupported'
    assert get_execution_part('UNKNOWN_LEGACY') is None
    assert parts == original


@pytest.mark.parametrize('module_type,properties',[
    ('GENERIC_LED',{'forwardVoltageVolts':True}),('GENERIC_LED',{'maxCurrentAmps':0}),
    ('GENERIC_LED',{'color':'red'}),('GENERIC_BUZZER',{'buzzerType':'MOTOR'}),
    ('GENERIC_BJT',{'transistorType':'MOSFET'}),('GENERIC_CAPACITOR',{'capacitorType':'ELECTROLYTIC'}),
])
def test_generic_design_properties_validate_typed_parameters(module_type,properties):
    from contracts.component_properties import normalize_component_properties
    with pytest.raises(ValueError):normalize_component_properties(module_type,properties)


def test_graph_12_schema_itself_enforces_new_generic_enums_while_preserving_unknown_metadata():
    from contracts.registry import validate_contract
    from jsonschema import ValidationError
    value=graph('GENERIC_BUZZER',{'buzzerType':'MOTOR','opaque':{'preserve':True}});value['schema_version']='1.2'
    with pytest.raises(ValidationError):validate_contract('CircuitGraphV12',value)
    value['modules'][0]['properties']['buzzerType']='PASSIVE'
    assert validate_contract('CircuitGraphV12',value)==value
