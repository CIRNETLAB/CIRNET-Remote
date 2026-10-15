"""Physical bindings are authoritative, versioned electrical design data."""
import copy
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

from contracts.design_validation import validate_design_graph

ROOT = Path(__file__).resolve().parents[2]


def mounted_graph():
    from contracts.physical_mounting import get_physical_part
    part = get_physical_part('SN74HC08N')
    package = part['package']
    return {'schema_version': '1.1', 'circuit_id': 'physical', 'modules': [
        {'id': 'BB', 'type': 'BREADBOARD', 'position': {'x': 4, 'y': 0, 'z': -3}, 'rotation': 90},
        {'id': 'U', 'type': 'SN74HC08N', 'mount': {
            'kind': 'breadboard', 'version': 1, 'boardId': 'BB',
            'partId': part['id'], 'partRevision': part['revision'],
            'packageId': package['id'], 'packageRevision': package['revision'],
            'pose': {'position': {'x': -3.64, 'y': .309, 'z': 0}, 'rotation': 0},
            'contacts': [
                {'kind': 'pin-contact', 'version': 1, 'pinId': str(pin),
                 'contactId': f'terminal:{"F" if pin <= 7 else "E"}:{(pin if pin <= 7 else 15-pin):02d}'}
                for pin in range(1, 15)
            ],
        }},
    ], 'connections': []}


def test_physical_graph_binds_every_pin_and_keeps_relative_pose_authoritative():
    value = mounted_graph()
    validate_design_graph(value)
    # World board pose never changes intrinsic pin/contact validation.
    value['modules'][0].update(position={'x': -44, 'y': 3, 'z': 61}, rotation=37)
    validate_design_graph(value)


@pytest.mark.parametrize('mutation', [
    lambda g: g.update(schema_version='1.0'),
    lambda g: g['modules'][1].update(position={'x': 0}),
    lambda g: g['modules'][1]['mount'].update(boardId='missing'),
    lambda g: g['modules'][1]['mount'].update(packageRevision='unverified'),
    lambda g: g['modules'][1]['mount']['contacts'].pop(),
    lambda g: g['modules'][1]['mount']['contacts'][0].update(pinId='missing'),
    lambda g: g['modules'][1]['mount']['contacts'][0].update(contactId='terminal:E:63'),
    lambda g: g['modules'][1]['mount']['pose'].update(rotation=90),
    lambda g: g['modules'][1]['mount']['pose']['position'].update(x=-3.63),
    lambda g: g['modules'][1]['mount'].update(unvalidated='bad'),
])
def test_mount_rejects_unknown_revision_geometry_missing_pins_and_untyped_data(mutation):
    value = mounted_graph()
    mutation(value)
    with pytest.raises((ValueError, ValidationError)):
        validate_design_graph(value)


def test_two_parts_cannot_occupy_same_hole_even_on_same_declared_electrical_strip():
    value = mounted_graph()
    duplicate = copy.deepcopy(value['modules'][1]); duplicate['id'] = 'U2'
    value['modules'].append(duplicate)
    with pytest.raises(ValueError, match='occup'):
        validate_design_graph(value)


def test_plastic_envelopes_cannot_overlap_even_when_all_leads_use_distinct_holes():
    value = mounted_graph()
    second = copy.deepcopy(value['modules'][1]); second['id'] = 'U2'
    second['mount']['pose']['position']['x'] += .91
    for binding in second['mount']['contacts']:
        prefix, column = binding['contactId'].rsplit(':', 1)
        binding['contactId'] = f'{prefix}:{int(column)+7:02d}'
    value['modules'].append(second)
    with pytest.raises(ValueError, match='bodies'):
        validate_design_graph(value)


def test_unknown_board_duplicate_module_and_orphan_mount_are_rejected():
    value = mounted_graph(); value['modules'][0]['type'] = 'LED'
    with pytest.raises(ValueError): validate_design_graph(value)
    value = mounted_graph(); value['modules'][0]['id'] = 'U'
    with pytest.raises(ValueError): validate_design_graph(value)


def test_legacy_graph_stays_1_0_and_keeps_old_port_semantics():
    value = {'schema_version': '1.0', 'circuit_id': 'legacy', 'modules': [
        {'id': 'U', 'type': '74HC08'}, {'id': 'L', 'type': 'LED'},
        {'id': 'S', 'type': 'DIGITAL_SWITCH'},
    ], 'connections': [{'source': 'S.OUT', 'destination': 'U.A1'}, {'source': 'U.Y1', 'destination': 'L.IN'}]}
    validate_design_graph(value)

