"""Instrument path authorization is distinct from arbitrary analog routing."""
from copy import deepcopy

import pytest

from contracts.instrument_validation import validate_plan_instruments
from test_lab_first import plan as source_plan


def instrument_case(role='GENERATOR'):
    plan = source_plan()
    plan['endpoint_bindings'][0]['role'] = role
    plan['instrument_allocations'] = [{'endpoint_id': 'x', 'instrument': role, 'channel': 1}]
    capabilities = {
        'mode': 'hardware', 'physical_analog_routing': False,
        'instrument_capabilities': {
            'logic_analyzer': {'channels': 1, 'runtime_reconfiguration_supported': False},
            'oscilloscope': {'channels': 2, 'runtime_reconfiguration_supported': False},
            'generator': {'channels': 2, 'runtime_reconfiguration_supported': False}},
        'routing_resources': [{'resource_id': 'source-1', 'roles': [role], 'node_ids': ['N1']}]}
    return plan, capabilities


@pytest.mark.parametrize('role', ['SCOPE', 'GENERATOR', 'LOGIC_ANALYZER'])
def test_explicit_instrument_path_is_independent_from_arbitrary_analog_routing(role):
    plan, capabilities = instrument_case(role)
    original = deepcopy((plan, capabilities))
    assert validate_plan_instruments(plan, capabilities) == plan
    assert (plan, capabilities) == original
    assert capabilities['physical_analog_routing'] is False


@pytest.mark.parametrize('arbitrary_analog', [False, True])
@pytest.mark.parametrize('change', ['missing_route', 'unknown_resource', 'wrong_role', 'wrong_node',
                                    'duplicate_route', 'duplicate_resource', 'unsupported_channel'])
def test_channel_counts_and_analog_flag_do_not_authorize_an_undeclared_path(change, arbitrary_analog):
    plan, capabilities = instrument_case()
    capabilities['physical_analog_routing'] = arbitrary_analog
    if change == 'missing_route': plan['routing_allocations'] = []
    if change == 'unknown_resource': plan['routing_allocations'][0]['resource_id'] = 'unknown'
    if change == 'wrong_role': capabilities['routing_resources'][0]['roles'] = ['INPUT_SOURCE']
    if change == 'wrong_node': capabilities['routing_resources'][0]['node_ids'] = ['ANOTHER_NODE']
    if change == 'duplicate_route': plan['routing_allocations'].append(deepcopy(plan['routing_allocations'][0]))
    if change == 'duplicate_resource': capabilities['routing_resources'].append(deepcopy(capabilities['routing_resources'][0]))
    if change == 'unsupported_channel': plan['instrument_allocations'][0]['channel'] = 3
    with pytest.raises(ValueError, match='UNEXECUTABLE'):
        validate_plan_instruments(plan, capabilities)
