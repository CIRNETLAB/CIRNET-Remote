"""Compact defaults must never reinterpret a pinned historical package."""
from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from contracts.physical_mounting import get_physical_part
from contracts.registry import validate_contract

ROOT = Path(__file__).resolve().parents[2]


def test_compact_generic_defaults_have_real_dimensions_and_leave_exact_parts_unchanged():
    resistor = get_physical_part('GENERIC_RESISTOR')
    assert resistor['revision'] == 6
    assert resistor['package']['bodyMm'] == {'x': 4.9, 'y': 1.75, 'z': 1.75}
    assert resistor['editor']['color'].lower() == '#4a90e2'
    capacitor = get_physical_part('GENERIC_CAPACITOR_ELECTROLYTIC')
    assert capacitor['package']['bodyMm'] == {'x': 6.3, 'y': 11, 'z': 6.3}
    assert capacitor['package']['footprint']['pitchMm'] == 2.54
    assert [pin['positionMm']['x'] for pin in capacitor['package']['pins']] == [-1.27, 1.27]
    assert get_physical_part('CAPACITOR_ELECTROLYTIC')['package']['bodyMm'] == {'x': 10, 'y': 12.5, 'z': 10}


@pytest.mark.parametrize('kind,part_id,package_id,old_size', [
    ('GENERIC_RESISTOR', 'GENERIC-RESISTOR-AXIAL', 'MRS25-1016', 6.5),
    ('GENERIC_ZENER_DIODE', 'GENERIC-ZENER-DIODE-AXIAL', 'DO41-1016', 5.2),
    ('GENERIC_CAPACITOR_ELECTROLYTIC', 'GENERIC-CAPACITOR-ELECTROLYTIC', 'UVR-D10-508', 10),
])
def test_pinned_historical_descriptor_resolves_without_accepting_fabricated_revisions(kind, part_id, package_id, old_size):
    pinned = {'partId': part_id, 'partRevision': 1, 'packageId': package_id, 'packageRevision': 1}
    assert get_physical_part(kind, pinned)['package']['bodyMm']['x'] == old_size
    assert get_physical_part(kind, {**pinned, 'partRevision': 99}) is None
    assert get_physical_part('GENERIC_DIODE', pinned) is None


def test_version_two_auto_routing_is_explicit_and_frozen_version_one_rejects_it():
    corpus = json.loads((ROOT / 'contracts/design-models/fixtures/flexible-mounting-parity.json').read_text())
    original = corpus['cases'][0]['graph']['modules'][1]['mount']
    automatic = deepcopy(original)
    automatic.update(version=2, geometryRevision=2, routing={'version': 1, 'mode': 'automatic', 'template': 'axial-horizontal'})
    assert validate_contract('FlexibleMountV2', automatic) == automatic
    with pytest.raises(ValidationError):
        validate_contract('FlexibleMountV1', automatic)
    without_intent = deepcopy(automatic)
    del without_intent['routing']
    with pytest.raises(ValidationError):
        validate_contract('FlexibleMountV2', without_intent)
    assert validate_contract('FlexibleMountV1', original) == original


def test_pinned_manual_pose_fixture_round_trips_without_reflow_or_property_loss():
    from contracts.boundary.models import AnySupportedCircuitGraph
    from contracts.design_validation import validate_design_graph
    graph = json.loads((ROOT / 'contracts/design-models/fixtures/component-mechanics-legacy.json').read_text())
    original = deepcopy(graph)
    validate_design_graph(graph)
    restored = AnySupportedCircuitGraph.model_validate(graph).model_dump(exclude_unset=True)
    assert restored == original
    assert graph == original
    assert restored['modules'][1]['mount']['version'] == 1
    assert restored['modules'][1]['mount']['partRevision'] == 1
    assert restored['modules'][1]['mount']['leads'][1]['controlPoints']


def test_old_free_parts_use_original_dimensions_and_new_free_parts_explicitly_pin_compact():
    from contracts.physical_mounting import get_physical_part_for_module
    from contracts.design_validation import validate_design_graph
    old = {'id': 'R', 'type': 'GENERIC_RESISTOR', 'position': {'x': 20, 'y': 0, 'z': 20}, 'properties': {'opaque': {'keep': True}}}
    assert get_physical_part_for_module(old)['package']['bodyMm']['x'] == 6.5
    latest = get_physical_part(old['type'])
    new = {**deepcopy(old), 'physicalDescriptor': {'version': 1, 'partId': latest['id'], 'partRevision': latest['revision'], 'packageId': latest['package']['id'], 'packageRevision': latest['package']['revision']}}
    assert get_physical_part_for_module(new)['package']['bodyMm']['x'] == 4.9
    for version, module in [('1.1', old), ('1.2', new)]:
        graph = {'schema_version': version, 'circuit_id': 'free', 'modules': [module], 'connections': []}
        original = deepcopy(graph)
        validate_design_graph(graph)
        assert graph == original
    bad = {**deepcopy(new), 'physicalDescriptor': {**new['physicalDescriptor'], 'partRevision': 99}}
    assert get_physical_part_for_module(bad) is None
    with pytest.raises(ValueError):
        validate_design_graph({'schema_version': '1.2', 'circuit_id': 'bad', 'modules': [bad], 'connections': []})


@pytest.mark.parametrize('revision,package_id,dimensions,exit_x,profile_id', [
    (3, 'GENERIC-AXIAL-R36-762', dict(x=3.6, y=1.6, z=1.6), 1.8, 'flex-sealed-resistor'),
    (4, 'GENERIC-AXIAL-R39-762', dict(x=3.9, y=1.75, z=1.75), 1.95, 'flex-sealed-resistor-r39'),
    (5, 'GENERIC-AXIAL-R43-762', dict(x=4.3, y=1.75, z=1.75), 2.15, 'flex-sealed-resistor-r43'),
])
def test_observed_sealed_resistor_revisions_keep_their_earlier_shape_and_profile(revision, package_id, dimensions, exit_x, profile_id):
    from contracts.flexible_mounting import get_mechanical_profile
    pinned = dict(partId='GENERIC-RESISTOR-AXIAL', partRevision=revision, packageId=package_id, packageRevision=1)
    previous = get_physical_part('GENERIC_RESISTOR', pinned)
    assert previous['package']['bodyMm'] == dimensions
    assert previous['package']['shape']['version'] == 1
    assert [exit['positionMm']['x'] for exit in previous['package']['shape']['leadExits']] == [-exit_x, exit_x]
    profile = get_mechanical_profile(pinned['packageId'], pinned['packageRevision'])
    assert profile['id'] == profile_id
    assert [pin['bodyExitMm']['x'] for pin in profile['pins']] == [-exit_x, exit_x]
    current = get_physical_part('GENERIC_RESISTOR')
    assert current['revision'] == 6
    assert current['package']['id'] == 'GENERIC-AXIAL-R49-762'
