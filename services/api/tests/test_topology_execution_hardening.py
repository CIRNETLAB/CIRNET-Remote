"""Executable observed nets and repeated-component mappings stay independent of placement."""
import pytest
from copy import deepcopy

from test_topology_resolution import assignment, capabilities, graph, resolver
from app.services.lab_compiler import LabExecutionCompiler
from app.services.verification import TopologyVerificationService


def record():
    return {'station_id': 'p1', 'experiment_id': 'e', '_configuration': {}}


def test_reference_endpoint_uses_routable_terminal_on_the_observed_pin_net():
    a, observed, caps = assignment(), graph('STUDENT'), capabilities()
    observed['nodes'].append({'node_id': 'ROUTABLE_TERMINAL'})
    observed['connections'].append({'node_ids': ['STUDENT_U1_1', 'ROUTABLE_TERMINAL']})
    caps['routing_resources'][0]['node_ids'] = ['ROUTABLE_TERMINAL']
    resolution = resolver().resolve(a, observed, caps)

    assert TopologyVerificationService().verify(a, observed, resolution)['status'] == 'MATCH'
    assert resolution['endpoint_bindings'][0]['observed_node_id'] == 'ROUTABLE_TERMINAL'
    plan = LabExecutionCompiler().compile(record(), a, caps, resolution)
    assert plan['endpoint_bindings'][0]['node_id'] == 'ROUTABLE_TERMINAL'


@pytest.mark.parametrize('reverse_endpoints', [False, True])
def test_compiler_finds_complete_route_allocation_for_competing_resources(reverse_endpoints):
    a, observed, caps = assignment(), graph('STUDENT'), capabilities()
    if reverse_endpoints:
        a['lab_endpoints'].reverse()
    caps['routing_resources'] = [
        {'resource_id': 'shared', 'roles': ['INPUT_SOURCE', 'OUTPUT_SENSE'],
         'node_ids': ['STUDENT_U1_1', 'STUDENT_U2_3']},
        {'resource_id': 'input-only', 'roles': ['INPUT_SOURCE'], 'node_ids': ['STUDENT_U1_1']},
    ]
    resolution = resolver().resolve(a, observed, caps)
    plan = LabExecutionCompiler().compile(record(), a, caps, resolution)

    assert {entry['endpoint_id']: entry['resource_id'] for entry in plan['routing_allocations']} == {
        'x': 'input-only', 'y': 'shared',
    }
    caps['routing_resources'] = caps['routing_resources'][:1]
    with pytest.raises(ValueError, match='UNEXECUTABLE'):
        LabExecutionCompiler().compile(record(), a, caps, resolution)


def repeated_chain(prefix):
    value = graph(prefix, ('74HC08',) * 5, wire=None)
    value['connections'] = [
        {'node_ids': [f'{prefix}_U{i}_3', f'{prefix}_U{i + 1}_1']}
        for i in range(1, 5)
    ]
    return value


def test_unique_repeated_component_chain_resolves_without_factorial_candidate_exhaustion():
    a, observed, caps = assignment(repeated_chain('REF')), repeated_chain('STUDENT'), capabilities()
    # Changing observed component labels/order must not change the electrical mapping.
    for i, component in enumerate(observed['components']):
        component['component_id'] = f'ACTUAL_{5 - i}'
    observed['components'].reverse()
    a['lab_endpoints'] = [{'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'reference_node_id': 'REF_U1_1'}]
    resolution = resolver().resolve(a, observed, caps)

    assert resolution['status'] == 'RESOLVED'
    assert len(resolution['component_matches']) == 5
    assert resolution['endpoint_bindings'] == [
        {'endpoint_id': 'x', 'observed_node_id': 'STUDENT_U1_1', 'source': 'REFERENCE_TOPOLOGY'},
    ]
    assert TopologyVerificationService().verify(a, observed, resolution)['status'] == 'MATCH'
    assert LabExecutionCompiler().compile(record(), a, caps, resolution)['endpoint_bindings'][0]['node_id'] == 'STUDENT_U1_1'


def test_genuine_repeated_component_symmetry_stays_ambiguous_with_fixed_endpoints_executable():
    a, observed, caps = assignment(graph('REF', ('74HC08',) * 5, wire=None)), graph('STUDENT', ('74HC08',) * 5, wire=None), capabilities()
    a['lab_endpoints'] = [{'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'fixed_node_id': 'STUDENT_U1_1'}]
    resolution = resolver().resolve(a, observed, caps)

    assert resolution['status'] == 'AMBIGUOUS'
    assert resolution['component_matches'] == []
    assert LabExecutionCompiler().compile(record(), a, caps, resolution)['endpoint_bindings'][0]['node_id'] == 'STUDENT_U1_1'


@pytest.mark.parametrize('reverse_endpoints', [False, True])
def test_observed_net_aliases_are_selected_with_complete_resource_allocation(reverse_endpoints):
    a, observed, caps = assignment(), graph('STUDENT'), capabilities()
    if reverse_endpoints: a['lab_endpoints'].reverse()
    observed['nodes'].append({'node_id': 'ZZ_ALTERNATE'})
    observed['connections'].append({'node_ids': ['STUDENT_U1_1', 'ZZ_ALTERNATE']})
    caps['routing_resources'] = [
        {'resource_id': 'shared', 'roles': ['INPUT_SOURCE', 'OUTPUT_SENSE'], 'node_ids': ['STUDENT_U1_1', 'STUDENT_U2_3']},
        {'resource_id': 'input-only', 'roles': ['INPUT_SOURCE'], 'node_ids': ['ZZ_ALTERNATE']},
    ]
    before = deepcopy(observed)
    resolution = resolver().resolve(a, observed, caps)
    plan = LabExecutionCompiler().compile(record(), a, caps, resolution)
    assert {b['endpoint_id']: b['node_id'] for b in plan['endpoint_bindings']} == {'x': 'ZZ_ALTERNATE', 'y': 'STUDENT_U2_3'}
    assert {r['endpoint_id']: r['resource_id'] for r in plan['routing_allocations']} == {'x': 'input-only', 'y': 'shared'}
    assert observed == before
    # An unconnected terminal is not an electrically equivalent alternative.
    observed['connections'].pop()
    with pytest.raises(ValueError, match='UNEXECUTABLE'):
        LabExecutionCompiler().compile(record(), a, caps, resolver().resolve(a, observed, caps))


@pytest.mark.parametrize('uncertainty', ['scan', 'reference', 'pin', 'connection'])
def test_declared_uncertainty_cannot_become_an_inferred_required_endpoint(uncertainty):
    a, observed, caps = assignment(), graph('STUDENT'), capabilities()
    if uncertainty == 'scan': observed['ambiguities'] = ['Pin identity remains ambiguous']
    if uncertainty == 'reference': a['reference_topology_graph']['ambiguities'] = ['Reference pin identity ambiguous']
    if uncertainty == 'pin': observed['components'][0]['pins'][0]['confidence'] = 0
    if uncertainty == 'connection': observed['connections'][0]['confidence'] = 0
    resolution = resolver().resolve(a, observed, caps)
    assert resolution['status'] == 'AMBIGUOUS'
    assert not any(binding['endpoint_id'] == 'x' for binding in resolution['endpoint_bindings'])
    with pytest.raises(ValueError, match='UNEXECUTABLE'):
        LabExecutionCompiler().compile(record(), a, caps, resolution)
    a['lab_endpoints'] = [{'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'fixed_node_id': 'STUDENT_U1_1'}]
    resolution = resolver().resolve(a, observed, caps)
    assert resolution['status'] == 'AMBIGUOUS'
    assert LabExecutionCompiler().compile(record(), a, caps, resolution)['endpoint_bindings'][0]['node_id'] == 'STUDENT_U1_1'


def test_supplied_pin_confidence_survives_component_and_endpoint_resolution():
    a, observed, caps = assignment(), graph('STUDENT'), capabilities()
    observed['components'][0]['pins'][0]['confidence'] = 0.65
    resolution = resolver().resolve(a, observed, caps)
    assert resolution['status'] == 'RESOLVED'
    assert resolution['component_matches'][0]['confidence'] == 0.65
    assert resolution['endpoint_bindings'][0]['confidence'] == 0.65


def test_reference_and_observed_component_labels_can_overlap_without_losing_confidence():
    a, observed, caps = assignment(), graph('STUDENT'), capabilities()
    for ref, actual in zip(a['reference_topology_graph']['components'], observed['components']):
        actual['component_id'] = ref['component_id']
    a['reference_topology_graph']['components'][0]['pins'][0]['confidence'] = 0.85
    observed['components'][0]['pins'][0]['confidence'] = 0.6
    resolution = resolver().resolve(a, observed, caps)
    assert resolution['status'] == 'RESOLVED'
    assert resolution['component_matches'][0]['confidence'] == 0.6
    assert resolution['endpoint_bindings'][0]['confidence'] == 0.6
