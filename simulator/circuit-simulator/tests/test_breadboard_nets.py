import copy
import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from netcircuit_sim.engine import VirtualCompiler, SimulationError, run_plan


def graph():
    return {'schema_version': '1.0', 'circuit_id': 'board', 'modules': [
        {'id': 'S', 'type': 'DIGITAL_SWITCH', 'properties': {'state': True}},
        {'id': 'L', 'type': 'LED'}, {'id': 'BB', 'type': 'BREADBOARD'},
    ], 'connections': []}


def test_intrinsic_contacts_jumpers_and_reversed_terminal_edges_lower_to_the_existing_digital_plan():
    direct = graph()
    direct['connections'] = [{'source': 'S.OUT', 'destination': 'L.IN'}]
    board = graph()
    board['connections'] = [
        {'source': 'BB.contact:terminal:A:01', 'destination': 'S.OUT'},
        {'source': 'BB.contact:terminal:E:01', 'destination': 'BB.contact:terminal:F:02'},
        {'source': 'L.IN', 'destination': 'BB.contact:terminal:J:02'},
    ]
    expected = VirtualCompiler().compile(direct)
    actual = VirtualCompiler().compile(board)
    assert actual == expected
    config = {'signals': ['L.IN'], 'duration_ns': 20}
    assert run_plan(actual, config)['samples'] == [{'signal': 'L.IN', 'time_ns': 0, 'value': 1}]
    changed = copy.deepcopy(board)
    changed['modules'][-1].update(position={'x': 100, 'y': 3, 'z': -40}, rotation=37)
    for edge in changed['connections']:
        edge['metadata'] = {'wireVisual': {'version': 1, 'color': '#8656a8', 'routeMode': 'FREE', 'controlPoints': [{'space': 'world', 'position': {'x': 3, 'y': 10, 'z': 9}}], 'thickness': .036}}
    changed['connections'].reverse()
    assert VirtualCompiler().compile(changed) == expected
    assert not any('.contact:' in key for key in actual.directions)


@pytest.mark.parametrize('kind,first,last', [
    ('BREADBOARD', 'rail:top-positive:01', 'rail:top-positive:50'),
    ('BREADBOARD_100', 'rail:positive:01', 'rail:positive:50'),
    ('BREADBOARD_630', 'terminal:A:01', 'terminal:E:01'),
])
def test_declared_continuous_rail_and_five_hole_strip_conduct_without_a_jumper(kind, first, last):
    value = graph(); value['modules'][-1]['type'] = kind
    value['connections'] = [{'source': 'S.OUT', 'destination': 'BB.contact:' + first}, {'source': 'BB.contact:' + last, 'destination': 'L.IN'}]
    assert run_plan(VirtualCompiler().compile(value), {'signals': ['L.IN'], 'duration_ns': 10})['samples'][-1]['value'] == 1


def test_board_nets_preserve_floating_x_and_reject_hidden_multiple_drivers_unknown_contacts_and_duplicates():
    value = graph(); value['connections'] = [{'source': 'BB.contact:terminal:A:01', 'destination': 'L.IN'}]
    assert run_plan(VirtualCompiler().compile(value), {'signals': ['L.IN'], 'duration_ns': 10})['samples'] == [{'signal': 'L.IN', 'time_ns': 0, 'value': 'X'}]
    value['modules'].append({'id': 'S2', 'type': 'DIGITAL_SWITCH'})
    value['connections'] += [{'source': 'S.OUT', 'destination': 'BB.contact:terminal:B:01'}, {'source': 'S2.OUT', 'destination': 'BB.contact:terminal:E:01'}]
    with pytest.raises(SimulationError, match='UNEXECUTABLE'): VirtualCompiler().compile(value)
    invalid = graph(); invalid['connections'] = [{'source': 'S.OUT', 'destination': 'BB.contact:terminal:A:64'}]
    with pytest.raises(SimulationError, match='UNEXECUTABLE'): VirtualCompiler().compile(invalid)
    invalid['connections'] = [{'source': 'S.OUT', 'destination': 'L.IN'}, {'source': 'L.IN', 'destination': 'S.OUT'}]
    with pytest.raises(SimulationError, match='UNEXECUTABLE'): VirtualCompiler().compile(invalid)
