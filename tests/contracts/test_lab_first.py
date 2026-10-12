import copy
import importlib
import json
from pathlib import Path

import pytest
from jsonschema import ValidationError

ROOT = Path(__file__).resolve().parents[2]


def validate(name, value):
    assert (ROOT / 'contracts/validation.py').is_file(), 'Lab contract validator missing'
    return importlib.import_module('contracts.validation').validate(name, value)


def assignment():
    return {'schema_version': '1.0', 'assignment_id': 'and-lab', 'title': 'AND',
            'lab_endpoints': [{'endpoint_id': 'x', 'role': 'INPUT_SOURCE'},
                              {'endpoint_id': 'y', 'role': 'OUTPUT_SENSE'}],
            'assessment_policy': 'FUNCTIONAL_ONLY', 'component_resolution_mode': 'HYBRID'}


def plan():
    return {'schema_version': '1.0', 'station_id': 'station-1', 'experiment_id': 'e1',
            'power_policy': {'profile_id': 'protected-v1', 'guarded': True},
            'endpoint_bindings': [{'endpoint_id': 'x', 'node_id': 'N1', 'role': 'INPUT_SOURCE'}],
            'routing_allocations': [{'endpoint_id': 'x', 'resource_id': 'source-1'}],
            'instrument_allocations': [], 'clock_config': {}, 'generator_config': [],
            'capture_config': {'signals': ['y'], 'duration_ns': 100}, 'test_vectors': [],
            'runtime_safety_policy': {'profile_id': 'protected-v1', 'watchdog_required': True}}


def test_minimal_assignment_roundtrips_and_endpoints_are_optional():
    value = assignment()
    assert validate('AssignmentDefinition', value) == value
    value['lab_endpoints'] = []
    validate('AssignmentDefinition', value)


def test_endpoint_ids_are_unique_even_when_roles_differ():
    value = assignment()
    value['lab_endpoints'][1]['endpoint_id'] = 'x'
    with pytest.raises(ValidationError):
        validate('AssignmentDefinition', value)


@pytest.mark.parametrize('role', ['INPUT_SOURCE', 'OUTPUT_SENSE', 'CLOCK', 'VCC', 'GND', 'GENERATOR', 'SCOPE', 'LOGIC_ANALYZER'])
def test_endpoint_roles(role):
    validate('LabEndpoint', {'endpoint_id': 'p', 'role': role})


def test_physical_graph_preserves_opaque_part_unexpected_wire_and_ambiguity():
    value = {'schema_version': '1.0', 'scan_id': 'scan-1',
             'nodes': [{'node_id': 'N1'}, {'node_id': 'N2'}],
             'connections': [{'node_ids': ['N1', 'N2'], 'confidence': 0.3}],
             'components': [{'component_id': 'U1', 'kind': 'OPAQUE_PHYSICAL_COMPONENT',
                             'node_ids': ['N1'], 'identity': 'UNKNOWN'}],
             'ambiguities': ['unexpected safe connection']}
    assert validate('DetectedTopologyGraph', value) == value
    validate('OpaquePhysicalComponent', value['components'][0])


def test_safe_topology_mismatch_and_guarded_decision_are_independent_contracts():
    validate('SafetyVerificationResult', {'schema_version': '1.0', 'status': 'SAFE', 'issues': []})
    validate('TopologyVerificationResult', {'schema_version': '1.0', 'status': 'MISMATCH', 'issues': ['wrong IC']})
    validate('FunctionalVerificationResult', {'schema_version': '1.0', 'status': 'FAIL', 'issues': ['wrong output']})
    validate('ExecutionDecision', {'schema_version': '1.0', 'decision': 'RUN_GUARDED', 'reasons': ['unknown']})
    with pytest.raises(ValidationError):
        validate('ExecutionDecision', {'schema_version': '1.0', 'decision': 'BLOCK_WRONG', 'reasons': []})


def test_v1_target_capability_contract_has_two_instrument_channels_and_one_slot():
    value = json.loads((ROOT / 'contracts/physical-lab/examples/v1-target-capabilities.json').read_text()) if (ROOT / 'contracts/physical-lab/examples/v1-target-capabilities.json').exists() else {}
    validate('StationCapabilities', value)
    assert (value['oscilloscope_channels'], value['generator_channels'], value['physical_execution_slots']) == (2, 2, 1)
    assert value['physical_analog_routing'] is False


@pytest.mark.parametrize('field,value', [('fpga_register', 1), ('mux_address', 0), ('transport', '/dev/spidev0.0')])
def test_plan_rejects_raw_control_fields(field, value):
    value_plan = plan()
    validate('InstrumentationExecutionPlan', value_plan)
    value_plan['routing_allocations'][0][field] = value
    with pytest.raises(ValidationError):
        validate('InstrumentationExecutionPlan', value_plan)


def test_contract_version_and_unresolved_endpoint_binding_are_rejected():
    value = assignment()
    value['schema_version'] = 'future'
    with pytest.raises(ValidationError):
        validate('AssignmentDefinition', value)
    value = plan()
    value['routing_allocations'][0]['endpoint_id'] = 'missing'
    with pytest.raises(ValidationError):
        validate('InstrumentationExecutionPlan', value)


def test_validated_contract_is_detached_from_mutable_caller_input():
    value = assignment()
    result = validate('AssignmentDefinition', value)
    before = copy.deepcopy(result)
    value['lab_endpoints'].clear()
    assert result == before
