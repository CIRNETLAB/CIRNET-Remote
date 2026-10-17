"""Physical registry validation prevents malformed source reaching either runtime."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('sync_editor_catalog', ROOT / 'scripts/sync_editor_catalog.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def registry():
    return json.loads((ROOT / 'device-library/parts/physical-parts.json').read_text(encoding='utf-8'))


def test_generator_rejects_impossible_body_geometry_and_nonplanar_mounting_pins():
    bad_body = registry()
    bad_body['parts'][0]['package']['bodyMm']['x'] = 0
    bad_pin = registry()
    bad_pin['parts'][0]['package']['pins'][0]['positionMm']['y'] = 1
    for bad in [bad_body, bad_pin]:
        with pytest.raises(ValueError):
            sync.validate_parts(bad)


def test_generator_rejects_missing_output_kind_and_incorrect_supply_role():
    bad_output = registry()
    del bad_output['parts'][0]['package']['pins'][2]['outputType']
    bad_power = registry()
    bad_power['parts'][0]['package']['pins'][13]['role'] = 'passive'
    for bad in [bad_output, bad_power]:
        with pytest.raises(ValueError):
            sync.validate_parts(bad)


def test_generator_rejects_duplicate_pin_and_unknown_internal_connection():
    duplicate = registry()
    duplicate['parts'][0]['package']['pins'][0]['id'] = '2'
    unknown = registry()
    unknown['parts'][0]['internalConnections'] = [{'pins': ['1', 'missing']}]
    for bad in [duplicate, unknown]:
        with pytest.raises(ValueError):
            sync.validate_parts(bad)


def test_generated_physical_snapshots_have_exact_canonical_provenance():
    canonical = registry()
    sync.validate_parts(canonical)
    for snapshot in ['apps/web/src/data/physicalParts.json', 'contracts/design-models/physical-parts.v1.json']:
        assert json.loads((ROOT / snapshot).read_text(encoding='utf-8')) == canonical


def test_mechanical_authoring_snapshot_has_exact_canonical_provenance():
    canonical = json.loads((ROOT / 'contracts/design-models/flexible-mechanics.json').read_text(encoding='utf-8'))
    assert json.loads((ROOT / 'apps/web/src/data/flexibleMechanics.json').read_text(encoding='utf-8')) == canonical


def test_generation_adds_physical_pin_ports_without_mutating_legacy_metadata():
    legacy = json.loads((ROOT / 'device-library/editor/components.json').read_text(encoding='utf-8'))
    before = copy.deepcopy(legacy)
    catalog = sync.generate_catalog(legacy, registry())
    assert legacy == before
    assert catalog['components'][:len(legacy['components'])] == legacy['components']
    hc08 = next(item for item in catalog['components'] if item['type'] == 'SN74HC08N')
    assert [pin['id'] for pin in hc08['ports']] == [str(i) for i in range(1, 15)]
    assert hc08['ports'][6] == {'id': '7', 'direction': 'inout', 'domain':'GROUND'}
    assert hc08['mode'] == 'physical'


def test_generic_design_parts_keep_reference_package_pin_identities_and_typed_properties():
    parts = {part['editorType']: part for part in registry()['parts']}
    pairs = {
        'GENERIC_RESISTOR': 'RESISTOR_AXIAL', 'GENERIC_CAPACITOR': 'CAPACITOR_CERAMIC',
        'GENERIC_CAPACITOR_ELECTROLYTIC': 'CAPACITOR_ELECTROLYTIC', 'GENERIC_DIODE': 'DIODE_1N4148',
        'GENERIC_ZENER_DIODE': 'ZENER_1N4733A', 'GENERIC_LED': 'LED_LTL307EE',
        'GENERIC_BUZZER': 'BUZZER_PS1240', 'GENERIC_BJT': 'TRANSISTOR_2N3904',
    }
    for generic, legacy in pairs.items():
        assert generic in parts
        # Revision 1 was a reference-package copy; compact defaults explicitly
        # pin a new package while the original generic remains resolvable.
        historical = next((part for part in registry().get('historicalParts', []) if part['editorType'] == generic), parts[generic])
        assert historical['package'] == parts[legacy]['package']
        assert [pin['id'] for pin in parts[generic]['package']['pins']] == [pin['id'] for pin in parts[legacy]['package']['pins']]
        assert parts[generic]['identityKind'] == 'configurable-generic'
        assert 'manufacturer' not in parts[generic] and 'partNumber' not in parts[generic]
        assert parts[legacy]['editor']['addType'] == generic
    assert parts['GENERIC_CAPACITOR']['editor']['defaults']['capacitorType'] == 'CERAMIC'
    assert parts['GENERIC_CAPACITOR_ELECTROLYTIC']['editor']['defaults']['capacitorType'] == 'ELECTROLYTIC'
    assert parts['GENERIC_CAPACITOR_ELECTROLYTIC']['editor']['hidden'] is True
    assert parts['GENERIC_LED']['editor']['defaults']['color'] == '#ce3935'
    for kind in ['GENERIC_DIODE', 'GENERIC_ZENER_DIODE', 'GENERIC_CAPACITOR', 'GENERIC_BUZZER', 'GENERIC_BJT']:
        assert parts[kind]['simulation']['status'] == 'unsupported'
    sync.validate_parts(registry())


def test_generator_validates_enum_string_and_color_defaults_without_numeric_coercion():
    valid = registry()
    editor = valid['parts'][0]['editor']
    editor['parameters'] = [
        {'key': 'type', 'label': 'Type', 'kind': 'enum', 'options': [{'value': 'A', 'label': 'A'}, {'value': 'B', 'label': 'B'}]},
        {'key': 'color', 'label': 'Color', 'kind': 'color', 'pattern': '^#[0-9a-fA-F]{6}$'},
        {'key': 'label', 'label': 'Label', 'kind': 'string', 'maxLength': 20},
    ]
    editor['defaults'] = {'type': 'A', 'color': '#ff0000', 'label': 'draft'}
    sync.validate_parts(valid)
    for key, value in [('type', 'C'), ('type', 1), ('color', 'red'), ('label', True), ('label', 'x' * 21)]:
        invalid = copy.deepcopy(valid)
        invalid['parts'][0]['editor']['defaults'][key] = value
        with pytest.raises(ValueError):
            sync.validate_parts(invalid)
