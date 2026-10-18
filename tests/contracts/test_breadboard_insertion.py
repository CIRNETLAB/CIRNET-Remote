"""Virtual cavity dimensions and sectioned conductors retain canonical contacts."""
from copy import deepcopy
import math

import pytest

from contracts.breadboard_topology import get_breadboard_topology
from contracts.breadboard_mechanics import MM_TO_WORLD as MM, board_contact_mechanics, conductor_fits_contact_cavity, validate_board_conductor_segment
from contracts.physical_mounting import get_physical_part, rigid_world_lead_paths
from contracts.rigid_leads import fixed_package_lead_path, rigid_lead_stations_mm


@pytest.mark.parametrize('board_type', ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100'])
def test_board_cutaway_depths_preserve_topology_and_reject_plastic(board_type):
    topology = get_breadboard_topology(board_type)
    before = tuple((item['contactId'], item['localPosition'], item['nodeId']) for item in topology['contacts'])
    contact = topology['contacts'][0]
    mechanics = board_contact_mechanics(board_type, contact['contactId'])
    assert mechanics['contact'] == tuple(contact['localPosition'])
    assert mechanics['tip'][1] == pytest.approx(.330-3*MM)
    assert mechanics['floor'][1] == pytest.approx(.330-3.5*MM)
    assert mechanics['tip'][1]-mechanics['floor'][1] == pytest.approx(.5*MM)
    assert conductor_fits_contact_cavity(board_type, contact['contactId'], mechanics['contact'], mechanics['tip'], .31*MM)
    x, y, z = mechanics['contact']
    for start, end in [((x+.13, y, z), mechanics['tip']), (mechanics['contact'], (x, mechanics['floor'][1]-.01, z))]:
        with pytest.raises(ValueError, match='plastic'):
            validate_board_conductor_segment(board_type, contact['contactId'], start, end, .31*MM)
    assert tuple((item['contactId'], item['localPosition'], item['nodeId']) for item in topology['contacts']) == before


def mount_on_board(part, board_type):
    package = part['package']
    contacts = get_breadboard_topology(board_type)['contacts']
    first = package['pins'][0]['positionMm']
    for anchor in contacts:
        origin = tuple(anchor['localPosition'][i]-first[axis]*MM for i, axis in enumerate(('x', 'y', 'z')))
        bindings = []
        for pin in package['pins']:
            expected = tuple(origin[i]+pin['positionMm'][axis]*MM for i, axis in enumerate(('x', 'y', 'z')))
            found = next((item for item in contacts if math.dist(item['localPosition'], expected) < 1e-7), None)
            if found is None:
                break
            bindings.append(dict(kind='pin-contact', version=1, pinId=pin['id'], contactId=found['contactId']))
        if len(bindings) == len(package['pins']):
            return dict(kind='breadboard', version=1, boardId='BB', partId=part['id'], partRevision=part['revision'], packageId=package['id'], packageRevision=package['revision'],
                        pose=dict(position=dict(zip(('x', 'y', 'z'), origin)), rotation=0), contacts=bindings)
    raise AssertionError(f'No mount for {part["editorType"]}/{board_type}')


@pytest.mark.parametrize('board_type', ['BREADBOARD', 'BREADBOARD_630'])
@pytest.mark.parametrize('module_type', ['GENERIC_RESISTOR', 'GENERIC_CAPACITOR', 'GENERIC_CAPACITOR_ELECTROLYTIC', 'GENERIC_DIODE', 'GENERIC_ZENER_DIODE', 'GENERIC_LED', 'GENERIC_BJT', 'SN74HC08N', 'PUSH_BUTTON_B3F1000', 'SLIDE_SWITCH_SS12D10', 'DIP_SWITCH_A6D4100', 'SEGMENT_SC5611EWA', 'SEGMENT_DC5611EWA', 'SEGMENT_CC5612EWA', 'BUZZER_PS1240', 'RESISTOR_AXIAL', 'LED_LTL307EE', 'TRANSISTOR_2N3904', 'DIODE_1N4148', 'ZENER_1N4733A', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC'])
def test_every_adapted_family_has_normal_buried_tails_with_moved_yawed_board(module_type, board_type):
    part = get_physical_part(module_type)
    board = dict(id='BB', type=board_type, position=dict(x=3, y=.4, z=-2), rotation=37)
    mount = mount_on_board(part, board_type)
    module = dict(id='P', type=module_type, mount=mount)
    paths = rigid_world_lead_paths(module, part, {'BB': board, 'P': module})
    for path in paths:
        binding = next(item for item in mount['contacts'] if item['pinId'] == path['pinId'])
        tip = board_contact_mechanics(board_type, binding['contactId'])['tip']
        angle = math.radians(37)
        expected = (3+tip[0]*math.cos(angle)+tip[2]*math.sin(angle), .4+tip[1], -2-tip[0]*math.sin(angle)+tip[2]*math.cos(angle))
        assert path['segments'][-1]['end'] == pytest.approx(expected)
        assert path['segments'][-1]['start'][0::2] == pytest.approx(expected[0::2])


@pytest.mark.parametrize('module_type', ['GENERIC_RESISTOR', 'GENERIC_BJT', 'DIP_SWITCH_A6D4100'])
def test_adapted_package_budget_cannot_invent_lead_length(module_type):
    package = deepcopy(get_physical_part(module_type)['package'])
    package['boardInsertion']['maxExternalLeadMm'] = .2
    with pytest.raises(ValueError, match='short'):
        if package['shape']['family'] == 'to92':
            rigid_lead_stations_mm(package, package['pins'][0], 3)
        else:
            fixed_package_lead_path(package, package['pins'][0], 3)
