import copy
import itertools
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from netcircuit_sim.engine import VirtualCompiler, SimulationError, run_plan


def physical_graph(voltage=5):
    return {'schema_version': '1.1', 'circuit_id': 'physical-supply', 'modules': [
        {'id': 'PS', 'type': 'DC_SUPPLY', 'properties': {'voltage': voltage}},
        {'id': 'U', 'type': 'SN74HC08N'},
        {'id': 'A', 'type': 'DIGITAL_SWITCH', 'properties': {'state': True}},
        {'id': 'B', 'type': 'DIGITAL_SWITCH', 'properties': {'state': True}},
    ], 'connections': [
        {'source': 'PS.PLUS', 'destination': 'U.14'},
        {'source': 'PS.MINUS', 'destination': 'U.7'},
        *[{'source': 'A.OUT', 'destination': f'U.{pin}'} for pin in ('1', '4', '9', '12')],
        *[{'source': 'B.OUT', 'destination': f'U.{pin}'} for pin in ('2', '5', '10', '13')],
    ]}


def capture(graph, **kwargs):
    return run_plan(VirtualCompiler().compile(graph), {'signals': ['U.3', 'U.6', 'U.8', 'U.11'], 'duration_ns': 30}, **kwargs)


def test_physical_74hc08_all_four_gates_require_real_supply_and_obey_truth_table():
    for a, b in itertools.product((0, 1), repeat=2):
        result = capture(physical_graph(), inputs={'A.OUT': a, 'B.OUT': b})
        assert result['device_states']['U']['state'] == 'POWERED'
        for pin in ('3', '6', '8', '11'):
            assert [s for s in result['samples'] if s['signal'] == f'U.{pin}'][-1]['value'] == a & b
    value = physical_graph(); value['connections'].pop(0)
    result = capture(value)
    assert result['device_states']['U']['state'] == 'UNPOWERED'
    assert all(s['value'] == 'X' for s in result['samples'])


@pytest.mark.parametrize('voltage', [-5, 0, 1, 7])
def test_physical_74hc08_rejects_reversed_and_out_of_envelope_supply(voltage):
    result = capture(physical_graph(voltage))
    assert result['device_states']['U']['state'] in ('UNPOWERED', 'FAULT')
    assert all(s['value'] == 'X' for s in result['samples'])


def test_floating_package_input_is_unknown_and_unpowering_never_reuses_valid_output():
    value = physical_graph(); value['connections'] = [e for e in value['connections'] if e['destination'] != 'U.1']
    result = capture(value)
    assert [s for s in result['samples'] if s['signal'] == 'U.3'][-1]['value'] == 'X'
    value['connections'] = [e for e in value['connections'] if e['destination'] != 'U.7']
    assert all(s['value'] == 'X' for s in capture(value)['samples'])


def led_loop(reverse=False, opened=False, from_gate=False):
    value = physical_graph() if from_gate else {'schema_version': '1.1', 'circuit_id': 'dc', 'modules': [
        {'id': 'PS', 'type': 'DC_SUPPLY', 'properties': {'voltage': 5}},
    ], 'connections': []}
    value['modules'] += [{'id': 'R', 'type': 'RESISTOR_AXIAL', 'properties': {'resistanceOhms': 330}}, {'id': 'L', 'type': 'LED_LTL307EE'}]
    value['connections'] += [
        {'source': 'U.3' if from_gate else 'PS.PLUS', 'destination': 'R.A'},
        {'source': 'R.B', 'destination': 'L.K' if reverse else 'L.A'},
    ]
    if not opened: value['connections'].append({'source': 'L.A' if reverse else 'L.K', 'destination': 'PS.MINUS'})
    return value


@pytest.mark.parametrize('reverse,opened,state', [(False, False, 'ON'), (True, False, 'OFF'), (False, True, 'OFF')])
def test_bounded_dc_led_requires_closed_forward_source_resistor_loop(reverse, opened, state):
    result = run_plan(VirtualCompiler().compile(led_loop(reverse, opened)), {'signals': [], 'duration_ns': 20})
    assert result['device_states']['L']['state'] == state
    assert result['device_states']['L']['model'] == 'bounded-dc-series'
    if state == 'ON': assert result['device_states']['L']['currentAmps'] == pytest.approx((5-2)/330)


def test_powered_gate_output_can_drive_resistor_led_and_resistor_is_never_a_short():
    result = capture(led_loop(from_gate=True))
    assert result['device_states']['L']['state'] == 'ON'
    from netcircuit_sim.nets import resolve_connectivity
    groups = resolve_connectivity(led_loop())
    assert next(g for g in groups if 'R.A' in g) != next(g for g in groups if 'R.B' in g)


def test_unsupported_physical_behavior_is_reported_and_never_fabricated():
    value = led_loop()
    value['modules'].append({'id': 'Q', 'type': 'TRANSISTOR_2N3904'})
    result = run_plan(VirtualCompiler().compile(value), {'signals': [], 'duration_ns': 10})
    assert result['device_states']['Q']['state'] == 'UNSUPPORTED'


def test_typescript_python_connectivity_parity_and_mounted_same_strip_jumper():
    from netcircuit_sim.nets import resolve_connectivity
    fixture = json.loads((Path(__file__).resolve().parents[3]/'contracts/design-models/fixtures/physical-mounting-parity.json').read_text(encoding='utf-8'))
    assert [list(group) for group in resolve_connectivity(fixture['graph'])] == fixture['expectedGroups']
    value = copy.deepcopy(fixture['graph'])
    value['modules'].append({'id': 'PS', 'type': 'DC_SUPPLY', 'position': {'x': -5, 'y': 0, 'z': 5}})
    value['connections'] = [
        {'source': 'PS.PLUS', 'destination': 'BB.contact:rail:top-positive:01'},
        {'source': 'BB.contact:rail:top-positive:50', 'destination': 'BB.contact:terminal:A:25'},
        {'source': 'PS.MINUS', 'destination': 'BB.contact:terminal:J:31'},
        {'source': 'PS.PLUS', 'destination': 'BB.contact:terminal:J:25'},
        {'source': 'PS.PLUS', 'destination': 'BB.contact:terminal:J:26'},
    ]
    result = capture(value)
    assert result['device_states']['U']['state'] == 'POWERED'
    assert [sample for sample in result['samples'] if sample['signal'] == 'U.3'][-1]['value'] == 1
    groups = resolve_connectivity(value)
    assert next(g for g in groups if 'U.1' in g) != next(g for g in groups if 'U.7' in g)


def test_unsupported_analog_branch_and_missing_series_resistor_are_explicit():
    value = led_loop(); value['modules'].append({'id': 'Q', 'type': 'TRANSISTOR_2N3904'})
    value['connections'].append({'source': 'Q.2', 'destination': 'L.A'})
    result = run_plan(VirtualCompiler().compile(value), {'signals': [], 'duration_ns': 10})
    assert result['device_states']['L']['state'] == 'UNSUPPORTED'
    value = led_loop(); value['connections'] = [{'source': 'PS.PLUS', 'destination': 'L.A'}, {'source': 'PS.MINUS', 'destination': 'L.K'}]
    assert run_plan(VirtualCompiler().compile(value), {'signals': [], 'duration_ns': 10})['device_states']['L']['state'] == 'UNSUPPORTED'


def test_independent_source_negatives_are_not_implicitly_global_ground():
    value = led_loop(); value['modules'].append({'id': 'PS2', 'type': 'DC_SUPPLY'})
    value['connections'][-1]['destination'] = 'PS2.MINUS'
    result = run_plan(VirtualCompiler().compile(value), {'signals': [], 'duration_ns': 10})
    assert result['device_states']['L']['state'] == 'UNSUPPORTED'
    value = physical_graph()
    value['connections'][0]['source'] = 'PS.MINUS'; value['connections'][1]['source'] = 'PS.PLUS'
    assert capture(value)['device_states']['U']['state'] == 'FAULT'


def test_switch_property_comparison_has_the_same_boolean_semantics_as_typescript():
    from netcircuit_sim.nets import resolve_connectivity
    value = {'schema_version': '1.1', 'circuit_id': 'switch-type', 'modules': [
        {'id': 'D', 'type': 'DIP_SWITCH_A6D4100', 'properties': {'position0': 1}},
    ], 'connections': []}
    assert next(g for g in resolve_connectivity(value) if 'D.1' in g) == ('D.1',)


def test_hc_input_has_no_implicit_reference_to_an_independent_dc_source():
    value = physical_graph()
    value['modules'].append({'id': 'PS2', 'type': 'DC_SUPPLY'})
    value['connections'] = [e for e in value['connections'] if e['destination'] != 'U.1']
    value['connections'].append({'source': 'PS2.PLUS', 'destination': 'U.1'})
    assert [s for s in capture(value)['samples'] if s['signal'] == 'U.3'][-1]['value'] == 'X'
    value['connections'].append({'source': 'PS2.MINUS', 'destination': 'PS.MINUS'})
    assert [s for s in capture(value)['samples'] if s['signal'] == 'U.3'][-1]['value'] == 1
    value['modules'][-1]['properties'] = {'voltage': 1}
    assert [s for s in capture(value)['samples'] if s['signal'] == 'U.3'][-1]['value'] == 'X'


def test_static_dc_terminals_cannot_be_overridden_by_digital_test_vectors():
    with pytest.raises(SimulationError, match='UNEXECUTABLE'):
        capture(physical_graph(), inputs={'PS.PLUS': 0})
    with pytest.raises(SimulationError, match='UNEXECUTABLE'):
        capture(physical_graph(), vectors=[{'time_ns': 10, 'inputs': {'PS.PLUS': 0}}])


@pytest.mark.parametrize('inactive,active', [('A', 'Z'), ('Z', 'A')])
@pytest.mark.parametrize('reverse_order', [False, True])
@pytest.mark.parametrize('input_pin,expected', [('MINUS', 0), ('PLUS', 1)])
def test_inactive_supply_cannot_hide_an_active_rail_on_shared_ground(inactive, active, reverse_order, input_pin, expected):
    value = {'schema_version': '1.1', 'circuit_id': 'shared-source-return', 'modules': [
        {'id': inactive, 'type': 'DC_SUPPLY', 'properties': {'power_on': False}},
        {'id': active, 'type': 'DC_SUPPLY'}, {'id': 'U', 'type': 'SN74HC08N'},
    ], 'connections': [
        {'source': f'{active}.PLUS', 'destination': 'U.14'},
        {'source': f'{active}.MINUS', 'destination': 'U.7'},
        {'source': f'{inactive}.MINUS', 'destination': f'{active}.MINUS'},
        {'source': f'{active}.{input_pin}', 'destination': 'U.1'},
        {'source': f'{active}.PLUS', 'destination': 'U.2'},
    ]}
    if reverse_order:
        value['modules'].reverse(); value['connections'].reverse()
    result = capture(value)
    assert result['device_states']['U']['state'] == 'POWERED'
    assert result['pin_values']['U.1'] == expected
    assert result['pin_values']['U.3'] == expected

