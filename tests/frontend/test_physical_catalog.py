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


def test_generation_adds_physical_pin_ports_without_mutating_legacy_metadata():
    legacy = json.loads((ROOT / 'device-library/editor/components.json').read_text(encoding='utf-8'))
    before = copy.deepcopy(legacy)
    catalog = sync.generate_catalog(legacy, registry())
    assert legacy == before
    assert catalog['components'][:len(legacy['components'])] == legacy['components']
    hc08 = next(item for item in catalog['components'] if item['type'] == 'SN74HC08N')
    assert [pin['id'] for pin in hc08['ports']] == [str(i) for i in range(1, 15)]
    assert hc08['ports'][6] == {'id': '7', 'direction': 'inout'}
    assert hc08['mode'] == 'physical'
