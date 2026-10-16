"""The compiler admits only declared instrument paths to observed student nodes."""
from copy import deepcopy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.lab_compiler import LabExecutionCompiler


@pytest.mark.parametrize('role', ['SCOPE', 'GENERATOR'])
def test_compiler_uses_authorized_instrument_path_with_analog_routing_disabled(role):
    capabilities = {'mode': 'hardware', 'physical_analog_routing': False,
        'hardware_profile_version': 'profile-1',
        'instrument_capabilities': {
            'logic_analyzer': {'channels': 1, 'runtime_reconfiguration_supported': False},
            'oscilloscope': {'channels': 2, 'runtime_reconfiguration_supported': False},
            'generator': {'channels': 2, 'runtime_reconfiguration_supported': False}},
        'routing_resources': [{'resource_id': 'approved-path', 'roles': [role], 'node_ids': ['STUDENT_NODE']}]}
    assignment = {'lab_endpoints': [{'endpoint_id': 'instrument', 'role': role, 'reference_node_id': 'REFERENCE_NODE'}]}
    experiment = {'station_id': 's1', 'experiment_id': 'e1', '_configuration': {}}
    resolution = {'endpoint_bindings': [{'endpoint_id': 'instrument', 'observed_node_id': 'STUDENT_NODE'}]}
    plan = LabExecutionCompiler().compile(experiment, assignment, capabilities, resolution)
    assert plan['endpoint_bindings'] == [{'endpoint_id': 'instrument', 'node_id': 'STUDENT_NODE', 'role': role}]
    assert plan['routing_allocations'] == [{'endpoint_id': 'instrument', 'resource_id': 'approved-path'}]
    assert plan['instrument_allocations'] == [{'endpoint_id': 'instrument', 'instrument': role, 'channel': 1}]
    restricted = deepcopy(capabilities)
    restricted['routing_resources'][0]['node_ids'] = ['REFERENCE_NODE']
    with pytest.raises(ValueError, match='UNEXECUTABLE'):
        LabExecutionCompiler().compile(experiment, assignment, restricted, resolution)
