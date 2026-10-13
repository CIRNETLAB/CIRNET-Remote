"""Placement-independent pin incidence, honest ambiguity and run permission."""
from copy import deepcopy
import importlib

import pytest
from test_lab_lifecycle import LabGateway, DeferredJobs, modules
from app.services.lab_compiler import LabExecutionCompiler
from app.services.verification import TopologyVerificationService
from app.services.execution_policy import ExecutionPolicy


def resolver():
    return importlib.import_module('app.services.topology_resolver').TopologyResolver()


def graph(prefix, identities=('74HC08', '74HC32'), wire=('U1.3', 'U2.1')):
    node = lambda pin: prefix + '_' + pin.replace('.', '_')
    components = [{'component_id': prefix + '_' + f'U{i+1}', 'kind': 'OBSERVED_PHYSICAL_COMPONENT',
                   'identity': identity, 'package': 'DIP14',
                   'node_ids': [node(f'U{i+1}.{pin}') for pin in (1, 2, 3)],
                   'pins': [{'pin_id': str(pin), 'node_id': node(f'U{i+1}.{pin}')} for pin in (1, 2, 3)]}
                  for i, identity in enumerate(identities)]
    return {'schema_version': '1.0', 'scan_id': prefix, 'nodes': [{'node_id': n} for c in components for n in c['node_ids']],
            'components': components, 'connections': [{'node_ids': [node(p) for p in wire]}] if wire else [], 'ambiguities': []}


def assignment(reference=None):
    return {'schema_version': '1.0', 'assignment_id': 'placement', 'title': 'Placement',
            'lab_endpoints': [{'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'reference_node_id': 'REF_U1_1'},
                              {'endpoint_id': 'y', 'role': 'OUTPUT_SENSE', 'reference_node_id': 'REF_U2_3'}],
            'reference_topology_graph': reference or graph('REF'), 'component_resolution_mode': 'HYBRID',
            'assessment_policy': 'STRICT_TOPOLOGY'}


def capabilities():
    caps = LabGateway().capabilities('p1')
    caps['routing_resources'][0]['node_ids'] = ['STUDENT_U1_1']
    caps['routing_resources'][1]['node_ids'] = ['STUDENT_U2_3']
    return caps


def test_arbitrary_nodes_resolve_and_compiler_routes_only_student_positions():
    a, observed, caps = assignment(), graph('STUDENT'), capabilities()
    resolution = resolver().resolve(a, observed, caps)
    assert resolution['status'] == 'RESOLVED'
    assert resolution['endpoint_bindings'][0]['observed_node_id'] == 'STUDENT_U1_1'
    record = {'station_id': 'p1', 'experiment_id': 'e', '_configuration': {}}
    plan = LabExecutionCompiler().compile(record, a, caps, resolution)
    assert {b['node_id'] for b in plan['endpoint_bindings']} == {'STUDENT_U1_1', 'STUDENT_U2_3'}
    assert TopologyVerificationService().verify(a, observed, resolution)['status'] == 'MATCH'
    with pytest.raises(ValueError): LabExecutionCompiler().compile(record, a, caps)


@pytest.mark.parametrize('policy', ['FUNCTIONAL_ONLY', 'TOPOLOGY_AND_FUNCTION', 'STRICT_TOPOLOGY'])
def test_same_connection_count_wrong_pin_wiring_is_diagnostic_mismatch(policy):
    a, observed = assignment(), graph('STUDENT', wire=('U1.3', 'U2.2'))
    a['assessment_policy'] = policy
    resolution = resolver().resolve(a, observed, capabilities())
    assert resolution['status'] == 'RESOLVED'
    result = TopologyVerificationService().verify(a, observed, resolution)
    assert result['status'] == 'MISMATCH'
    assert result['missing_nets'] and result['unexpected_nets']
    assert ExecutionPolicy().decide({'schema_version': '1.0', 'status': 'SAFE', 'issues': []}, True)['decision'] == 'RUN_NORMAL'


def test_two_identical_parts_keep_multiplicity_and_use_unique_pin_incidence():
    a = assignment(graph('REF', ('74HC08', '74HC08')))
    observed = graph('STUDENT', ('74HC08', '74HC08'))
    resolution = resolver().resolve(a, observed, capabilities())
    assert resolution['status'] == 'RESOLVED'
    assert len(resolution['component_matches']) == 2
    observed = graph('STUDENT', ('74HC08',), wire=None)
    result = TopologyVerificationService().verify(a, observed, resolver().resolve(a, observed))
    assert result['status'] == 'MISMATCH'
    assert result['missing_components'][0]['count'] == 1


def test_equally_valid_matches_remain_ambiguous_and_do_not_bind_required_reference():
    a = assignment(graph('REF', ('74HC08', '74HC08'), wire=None))
    observed = graph('STUDENT', ('74HC08', '74HC08'), wire=None)
    resolution = resolver().resolve(a, observed)
    assert resolution['status'] == 'AMBIGUOUS'
    assert resolution['endpoint_bindings'] == []
    assert resolution['component_matches'] == []
    with pytest.raises(ValueError): LabExecutionCompiler().compile({'station_id': 'p1', 'experiment_id': 'e', '_configuration': {}}, a, capabilities(), resolution)
    # An unrelated ambiguous part must not veto fixed infrastructure bindings.
    a['lab_endpoints'] = [{'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'fixed_node_id': 'STUDENT_U1_1'}]
    resolution = resolver().resolve(a, observed)
    assert resolution['status'] == 'AMBIGUOUS'
    assert resolution['endpoint_bindings'][0]['source'] == 'FIXED_NODE'
    LabExecutionCompiler().compile({'station_id': 'p1', 'experiment_id': 'e', '_configuration': {}}, a, capabilities(), resolution)


@pytest.mark.parametrize('mode', ['AUTO_DISCOVERY', 'INSTRUCTOR_PROFILE', 'HYBRID'])
def test_supported_profile_modes_and_opaque_never_guess(mode):
    a = assignment(); a['component_resolution_mode'] = mode
    a['instructor_pin_profiles'] = [{'profile_id': identity, 'component_type': identity,
                                    'pins': [{'pin_id': str(i), 'role': role} for i, role in [(1, 'INPUT'), (2, 'INPUT'), (3, 'OUTPUT')]]}
                                   for identity in ('74HC08', '74HC32')]
    observed = graph('STUDENT')
    assert resolver().resolve(a, observed)['status'] == 'RESOLVED'
    observed['components'][0].update(kind='OPAQUE_PHYSICAL_COMPONENT', identity='UNKNOWN')
    resolution = resolver().resolve(a, observed)
    assert not any(m['observed_component_id'] == 'STUDENT_U1' for m in resolution['component_matches'])
    assert not any(b['endpoint_id'] == 'x' for b in resolution['endpoint_bindings'])


def test_unrecognized_component_without_explicit_profile_remains_unresolved():
    a = assignment(graph('REF', ('CUSTOM_UNKNOWN_LAYOUT',), wire=None))
    a['lab_endpoints'] = a['lab_endpoints'][:1]
    observed = graph('STUDENT', ('CUSTOM_UNKNOWN_LAYOUT',), wire=None)
    assert resolver().resolve(a, observed)['status'] == 'UNRESOLVED'


def test_reference_n1_resolves_to_student_n42_with_pin_evidence():
    reference, observed = graph('REF', ('74HC08',), wire=None), graph('STUDENT', ('74HC08',), wire=None)
    for value, old, new in [(reference, 'REF_U1_1', 'REF_N1'), (observed, 'STUDENT_U1_1', 'STUDENT_N42')]:
        value['nodes'][0]['node_id'] = new
        value['components'][0]['node_ids'][0] = new
        value['components'][0]['pins'][0]['node_id'] = new
    a = assignment(reference)
    a['lab_endpoints'] = [{'endpoint_id': 'x', 'role': 'INPUT_SOURCE', 'reference_node_id': 'REF_N1'}]
    resolution = resolver().resolve(a, observed)
    assert resolution['endpoint_bindings'] == [{'endpoint_id': 'x', 'observed_node_id': 'STUDENT_N42', 'source': 'REFERENCE_TOPOLOGY'}]


def test_arbitrary_placement_runs_through_manager_before_routing(tmp_path):
    experiments, persistence = modules()
    repo = persistence.Repository('sqlite:///' + str(tmp_path / 'resolution.db'))
    repo.create_assignment(assignment())
    plans = []; jobs = DeferredJobs()
    class PlacementGateway(LabGateway):
        def capabilities(self, station_id): return capabilities()
        def call(self, station_id, experiment_id, method, **kwargs):
            if method == 'scan_topology': self.calls.append(method); return graph('STUDENT')
            if method == 'prepare_execution': plans.append(deepcopy(kwargs['plan']))
            return super().call(station_id, experiment_id, method, **kwargs)
    gateway = PlacementGateway()
    manager = experiments.ExperimentManager(repo, gateway, submit=jobs)
    e = manager.create('owner', {'station_id': 'p1', 'assignment_id': 'placement'})
    manager.run(e['experiment_id'], 'owner'); jobs.run_one()
    actual = manager.get(e['experiment_id'], 'owner')
    assert actual['topology_resolution']['status'] == 'RESOLVED'
    assert actual['topology_verification']['status'] == 'MATCH'
    assert actual['execution_decision']['decision'] == 'RUN_NORMAL'
    assert plans[0]['endpoint_bindings'][0]['node_id'] == 'STUDENT_U1_1'
    assert gateway.calls.index('read_runtime_safety') < gateway.calls.index('prepare_execution')
