"""Physical evidence integrity and the independent teaching/result boundaries."""
from copy import deepcopy

import pytest
from jsonschema import ValidationError

from contracts.validation import validate


def observed(prefix='STUDENT'):
    return {'schema_version': '1.0', 'scan_id': 'scan',
            'nodes': [{'node_id': prefix + '_1'}, {'node_id': prefix + '_2'}],
            'connections': [{'node_ids': [prefix + '_1', prefix + '_2']}],
            'components': [{'component_id': 'U1', 'kind': 'OBSERVED_PHYSICAL_COMPONENT',
                            'identity': '74HC08', 'node_ids': [prefix + '_1', prefix + '_2'],
                            'pins': [{'pin_id': '1', 'node_id': prefix + '_1'},
                                     {'pin_id': '2', 'node_id': prefix + '_2'}]}],
            'ambiguities': []}


def test_opaque_observation_cannot_claim_a_known_identity():
    graph = observed()
    graph['components'][0].pop('pins')
    graph['components'][0]['kind'] = 'OPAQUE_PHYSICAL_COMPONENT'
    with pytest.raises(ValidationError):
        validate('DetectedTopologyGraph', graph)


@pytest.mark.parametrize('change', ['connection_node', 'component_node', 'pin_node',
                                  'duplicate_pin', 'duplicate_connection_node', 'duplicate_connection'])
def test_malformed_scan_evidence_is_rejected(change):
    graph = observed()
    if change == 'connection_node': graph['connections'][0]['node_ids'][1] = 'MISSING'
    if change == 'component_node': graph['components'][0]['node_ids'].append('MISSING')
    if change == 'pin_node': graph['components'][0]['pins'][0]['node_id'] = 'MISSING'
    if change == 'duplicate_pin': graph['components'][0]['pins'][1]['pin_id'] = '1'
    if change == 'duplicate_connection_node': graph['connections'][0]['node_ids'][1] = 'STUDENT_1'
    if change == 'duplicate_connection': graph['connections'].append({'node_ids': ['STUDENT_2', 'STUDENT_1']})
    with pytest.raises(ValidationError): validate('DetectedTopologyGraph', graph)


def test_pin_observations_are_position_independent_and_do_not_invent_roles():
    reference, student = observed('REF'), observed('STUDENT')
    assert validate('DetectedTopologyGraph', reference) == reference
    assert validate('DetectedTopologyGraph', student) == student
    assert 'inferred_role' not in validate('ObservedPinBinding', student['components'][0]['pins'][0])


@pytest.mark.parametrize('field', ['fixed_node_id', 'reference_node_id', 'design_port'])
def test_endpoint_supports_each_explicit_binding_form(field):
    value = {'endpoint_id': 'x', 'role': 'INPUT_SOURCE', field: 'U1.OUT' if field == 'design_port' else 'N1'}
    assert validate('LabEndpoint', value) == value


def test_deprecated_fixed_node_cannot_be_mixed_with_design_port():
    with pytest.raises(ValidationError):
        validate('LabEndpoint', {'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'node_id': 'N1', 'design_port': 'X.OUT'})


@pytest.mark.parametrize('name', ['LabEndpoint', 'InstrumentationExecutionPlan'])
def test_user_facing_instrument_channel_zero_is_rejected(name):
    from test_lab_first import plan
    value = {'endpoint_id': 'scope', 'role': 'SCOPE', 'channel': 0} if name == 'LabEndpoint' else plan()
    if name == 'InstrumentationExecutionPlan':
        value['instrument_allocations'] = [{'endpoint_id': 'x', 'instrument': 'SCOPE', 'channel': 0}]
    with pytest.raises(ValidationError): validate(name, value)


def test_resolution_contract_binds_observed_student_node_and_serializes_detached():
    value = {'schema_version': '1.0', 'status': 'RESOLVED',
             'component_matches': [{'reference_component_id': 'REF_U1', 'observed_component_id': 'STUDENT_U2'}],
             'endpoint_bindings': [{'endpoint_id': 'x', 'observed_node_id': 'STUDENT_N42', 'source': 'REFERENCE_TOPOLOGY'}],
             'issues': []}
    result = validate('TopologyResolutionResult', value)
    before = deepcopy(result)
    value['endpoint_bindings'].clear()
    assert result == before


@pytest.mark.parametrize('graph', [{'schema_version': '1.0'},
                                 {'schema_version': 'future', 'circuit_id': 'c', 'modules': [], 'connections': []}])
def test_reference_design_must_be_a_valid_circuit_graph(graph):
    from test_lab_first import assignment
    value = assignment(); value['reference_design_graph'] = graph
    with pytest.raises(ValidationError): validate('AssignmentDefinition', value)


@pytest.mark.parametrize('name,status,details', [
    ('TopologyVerificationResult', 'MATCH', {'matched_components': [{'reference_component_id': 'R', 'observed_component_id': 'S'}], 'matched_nets': [], 'shorted_nets': [], 'orientation_differences': [], 'pin_mapping_differences': [], 'confidence': 1}),
    ('FunctionalVerificationResult', 'PASS', {'timing_results': [], 'waveform_comparisons': []}),
    ('SafetyVerificationResult', 'UNSAFE', {'power_shorts': [{'node_ids': ['VCC', 'GND'], 'message': 'driver short evidence'}], 'notes': ['measured']}),
    ('TopologyVerificationResult', 'MISMATCH', {'missing_components': [{'identity': '74HC08', 'count': 2}], 'missing_nets': [{'reference_nodes': ['R1'], 'observed_nodes': [], 'reference_pins': ['U1.1'], 'observed_pins': []}]}),
    ('FunctionalVerificationResult', 'FAIL', {'expected_signals': [{'signal': 'y', 'time_ns': 10, 'value': 1}], 'observed_signals': [{'signal': 'y', 'time_ns': 10, 'value': 'X'}], 'mismatched_signals': [{'signal': 'y', 'time_ns': 10, 'expected': 1, 'observed': 'X'}]})])
def test_structured_verification_evidence_roundtrips(name, status, details):
    value = {'schema_version': '1.0', 'status': status, 'issues': [], **details}
    assert validate(name, value) == value
