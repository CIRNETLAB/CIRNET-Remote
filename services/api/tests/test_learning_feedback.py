"""Teaching observations and assessment policies never become execution gates."""
from copy import deepcopy
import importlib
import json

import pytest

from test_lab_lifecycle import LabGateway, DeferredJobs, assignment, modules
from app.services.verification import FunctionalVerificationService


def expected_assignment(behavior, policy='TOPOLOGY_AND_FUNCTION'):
    value = assignment()
    value.update(expected_behavior=behavior, assessment_policy=policy)
    return value


def test_checkpoint_feedback_preserves_unknown_values_and_only_reports_comparisons():
    expected = [{'signal': 'x', 'time_ns': 0, 'value': 0}, {'signal': 'y', 'time_ns': 20, 'value': 1}]
    capture = {'available': True, 'duration_ns': 40, 'samples': [
        {'signal': 'x', 'time_ns': 0, 'value': 0}, {'signal': 'y', 'time_ns': 0, 'value': 'X'},
        {'signal': 'y', 'time_ns': 30, 'value': 1},
    ]}
    feedback = FunctionalVerificationService().verify(expected_assignment({'expected_signals': expected}), capture)

    assert feedback['status'] == 'PARTIAL'
    assert feedback['expected_signals'] == expected
    assert feedback['observed_signals'] == [
        {'signal': 'x', 'time_ns': 0, 'value': 0}, {'signal': 'y', 'time_ns': 20, 'value': 'X'},
    ]
    assert feedback['mismatched_signals'] == [{'signal': 'y', 'time_ns': 20, 'expected': 1, 'observed': 'X'}]
    assert 'timing_results' not in feedback and 'waveform_comparisons' not in feedback


@pytest.mark.parametrize('capture', [
    {'available': False, 'samples': []},
    {'available': True, 'duration_ns': 40, 'samples': [{'signal': 'unrelated', 'time_ns': 0, 'value': 1}]},
    {'available': True, 'duration_ns': 5, 'samples': [{'signal': 'y', 'time_ns': 0, 'value': 1}]},
])
def test_missing_required_observation_is_no_response_without_an_invented_logic_value(capture):
    expected = [{'signal': 'y', 'time_ns': 10, 'value': 1}]
    feedback = FunctionalVerificationService().verify(expected_assignment({'expected_signals': expected}), capture)

    assert feedback['status'] == 'NO_RESPONSE'
    assert feedback['expected_signals'] == expected
    assert feedback['observed_signals'] == []
    assert feedback['mismatched_signals'] == [{'signal': 'y', 'time_ns': 10, 'expected': 1, 'observed': None}]


def test_large_capture_feedback_contains_only_declared_checkpoints():
    capture = {'available': True, 'duration_ns': 99999,
               'samples': [{'signal': 'y', 'time_ns': index, 'value': index % 2} for index in range(100000)]}
    expected = [{'signal': 'y', 'time_ns': 99999, 'value': 1}]
    feedback = FunctionalVerificationService().verify(expected_assignment({'expected_signals': expected}), capture)

    assert feedback['status'] == 'PASS'
    assert feedback['observed_signals'] == [{'signal': 'y', 'time_ns': 99999, 'value': 1}]
    assert feedback['mismatched_signals'] == []
    assert len(json.dumps(feedback)) < 1500


def truth_rows():
    return [{'inputs': {'x': 0, 'z': 1}, 'outputs': {'y': 0}},
            {'inputs': {'x': 1, 'z': 1}, 'outputs': {'y': 1}}]


def test_truth_table_feedback_uses_exercised_held_input_vectors_and_actual_outputs():
    rows = truth_rows()
    capture = {'available': True, 'duration_ns': 40, 'samples': [
        {'signal': 'y', 'time_ns': 0, 'value': 0}, {'signal': 'y', 'time_ns': 28, 'value': 1},
    ]}
    vectors = [{'time_ns': 0, 'inputs': {'x': 0, 'z': 1}}, {'time_ns': 20, 'inputs': {'x': 1}}]
    feedback = FunctionalVerificationService().verify(expected_assignment({'truth_table': rows}), capture, vectors)

    assert feedback['status'] == 'PASS'
    assert feedback['expected_truth_table'] == rows
    assert feedback['observed_truth_table'] == [
        {'case_index': 0, 'inputs': {'x': 0, 'z': 1}, 'outputs': {'y': 0}, 'time_ns': 19, 'status': 'PASS'},
        {'case_index': 1, 'inputs': {'x': 1, 'z': 1}, 'outputs': {'y': 1}, 'time_ns': 40, 'status': 'PASS'},
    ]
    assert feedback['mismatched_signals'] == []


def test_unexercised_truth_case_does_not_gain_an_observed_timestamp_or_output():
    feedback = FunctionalVerificationService().verify(
        expected_assignment({'truth_table': truth_rows()}),
        {'available': True, 'duration_ns': 40, 'samples': [{'signal': 'y', 'time_ns': 0, 'value': 0}]},
        [{'time_ns': 0, 'inputs': {'x': 0, 'z': 1}}],
    )

    assert feedback['status'] == 'PARTIAL'
    assert feedback['observed_truth_table'] == [
        {'case_index': 0, 'inputs': {'x': 0, 'z': 1}, 'outputs': {'y': 0}, 'time_ns': 40, 'status': 'PASS'},
    ]
    assert feedback['expected_truth_table'] == truth_rows()
    assert feedback['issues']


def test_truth_case_mismatch_preserves_x_and_identifies_its_declared_case():
    feedback = FunctionalVerificationService().verify(
        expected_assignment({'truth_table': truth_rows()[:1]}),
        {'available': True, 'duration_ns': 40, 'samples': [{'signal': 'y', 'time_ns': 0, 'value': 'X'}]},
        [{'time_ns': 0, 'inputs': {'x': 0, 'z': 1}}],
    )

    assert feedback['status'] == 'FAIL'
    assert feedback['observed_truth_table'] == [
        {'case_index': 0, 'inputs': {'x': 0, 'z': 1}, 'outputs': {'y': 'X'}, 'time_ns': 40, 'status': 'FAIL'},
    ]
    assert feedback['mismatched_signals'] == [
        {'signal': 'y', 'time_ns': 40, 'expected': 0, 'observed': 'X', 'case_index': 0},
    ]


@pytest.mark.parametrize('policy,topology,function,expected,topology_evaluated,function_evaluated', [
    ('STRICT_TOPOLOGY', 'MATCH', 'FAIL', 'PASS', True, False),
    ('STRICT_TOPOLOGY', 'MISMATCH', 'PASS', 'FAIL', True, False),
    ('STRICT_TOPOLOGY', 'UNKNOWN', 'PASS', 'NOT_EVALUATED', False, False),
    ('STRICT_TOPOLOGY', 'AMBIGUOUS', 'FAIL', 'NOT_EVALUATED', False, False),
    ('FUNCTIONAL_ONLY', 'MISMATCH', 'PASS', 'PASS', False, True),
    ('FUNCTIONAL_ONLY', 'MATCH', 'FAIL', 'FAIL', False, True),
    ('FUNCTIONAL_ONLY', 'UNKNOWN', 'PARTIAL', 'PARTIAL', False, True),
    ('FUNCTIONAL_ONLY', 'UNKNOWN', 'NO_RESPONSE', 'NO_RESPONSE', False, True),
    ('FUNCTIONAL_ONLY', 'MATCH', 'NOT_EVALUATED', 'NOT_EVALUATED', False, False),
    ('TOPOLOGY_AND_FUNCTION', 'MATCH', 'PASS', 'PASS', True, True),
    ('TOPOLOGY_AND_FUNCTION', 'MISMATCH', 'PASS', 'FAIL', True, True),
    ('TOPOLOGY_AND_FUNCTION', 'UNKNOWN', 'FAIL', 'FAIL', False, True),
    ('TOPOLOGY_AND_FUNCTION', 'UNKNOWN', 'PASS', 'NOT_EVALUATED', False, True),
    ('TOPOLOGY_AND_FUNCTION', 'MATCH', 'NO_RESPONSE', 'NO_RESPONSE', True, True),
    ('TOPOLOGY_AND_FUNCTION', 'AMBIGUOUS', 'PARTIAL', 'PARTIAL', False, True),
])
def test_assessment_policy_reports_only_its_selected_known_criteria(
    policy, topology, function, expected, topology_evaluated, function_evaluated,
):
    service = importlib.import_module('app.services.assessment').AssessmentService()
    topology_result = {'schema_version': '1.0', 'status': topology, 'issues': ['topology diagnostic']}
    function_result = {'schema_version': '1.0', 'status': function, 'issues': ['function diagnostic']}
    before = deepcopy((topology_result, function_result))
    feedback = service.evaluate({'assessment_policy': policy}, topology_result, function_result)

    assert feedback['schema_version'] == '1.0'
    assert feedback['policy'] == policy and feedback['status'] == expected
    assert feedback['topology_evaluated'] is topology_evaluated
    assert feedback['function_evaluated'] is function_evaluated
    assert isinstance(feedback['issues'], list)
    assert (topology_result, function_result) == before
    assert 'execution_decision' not in feedback


@pytest.mark.parametrize('policy', ['STRICT_TOPOLOGY', 'FUNCTIONAL_ONLY', 'TOPOLOGY_AND_FUNCTION'])
def test_safe_wrong_wiring_runs_then_reports_actual_function_failure_under_every_policy(tmp_path, policy):
    from test_topology_resolution import assignment as placement_assignment, capabilities, graph
    experiments, persistence = modules()
    repo = persistence.Repository('sqlite:///' + str(tmp_path / 'wrong-wiring.db'))
    value = placement_assignment()
    value.update(assessment_policy=policy, expected_behavior={'expected_signals': [
        {'signal': 'y', 'time_ns': 0, 'value': 0},
    ]})
    repo.create_assignment(value)

    class WrongWiringGateway(LabGateway):
        def capabilities(self, station_id):
            return capabilities()

        def call(self, station_id, experiment_id, method, **kwargs):
            if method == 'scan_topology':
                self.calls.append(method)
                return graph('STUDENT', wire=('U1.3', 'U2.2'))
            return super().call(station_id, experiment_id, method, **kwargs)

    gateway, jobs = WrongWiringGateway(), DeferredJobs()
    manager = experiments.ExperimentManager(repo, gateway, submit=jobs)
    experiment = manager.create('student', {'station_id': 'p1', 'assignment_id': 'placement'})
    manager.run(experiment['experiment_id'], 'student')
    jobs.run_one()
    feedback = manager.get(experiment['experiment_id'], 'student')

    assert feedback['state'] == 'COMPLETE'
    assert feedback['safety_verification']['status'] == 'SAFE'
    assert feedback['topology_verification']['status'] == 'MISMATCH'
    assert feedback['execution_decision']['decision'] == 'RUN_NORMAL'
    assert 'start_execution' in gateway.calls
    assert feedback['functional_verification']['status'] == 'FAIL'
    assert feedback['functional_verification']['mismatched_signals'] == [
        {'signal': 'y', 'time_ns': 0, 'expected': 0, 'observed': 1},
    ]
    assert repo.leases() == []
    manager.close()
    repo.close()


@pytest.mark.parametrize('policy', ['STRICT_TOPOLOGY', 'FUNCTIONAL_ONLY', 'TOPOLOGY_AND_FUNCTION'])
def test_reported_vcc_ground_short_blocks_power_and_start_independent_of_assessment_policy(tmp_path, policy):
    experiments, persistence = modules()
    repo = persistence.Repository('sqlite:///' + str(tmp_path / 'power-short.db'))
    value = assignment()
    value['assessment_policy'] = policy
    repo.create_assignment(value)

    class PowerShortGateway(LabGateway):
        def call(self, station_id, experiment_id, method, **kwargs):
            if method == 'scan_topology':
                self.calls.append(method)
                return {'schema_version': '1.0', 'scan_id': 'power-short',
                        'nodes': [{'node_id': 'N1', 'label': 'VCC'}, {'node_id': 'N2', 'label': 'GND'}],
                        'connections': [{'node_ids': ['N1', 'N2']}], 'components': [], 'ambiguities': []}
            if method == 'read_runtime_safety':
                self.calls.append(method)
                return {'schema_version': '1.0', 'status': 'UNSAFE', 'issues': ['VCC connected to GND'],
                        'power_shorts': [{'node_ids': ['N1', 'N2'], 'message': 'Driver reports VCC–GND short'}]}
            return super().call(station_id, experiment_id, method, **kwargs)

    gateway, jobs = PowerShortGateway(), DeferredJobs()
    manager = experiments.ExperimentManager(repo, gateway, submit=jobs)
    experiment = manager.create('student', {'station_id': 'p1', 'assignment_id': 'a1'})
    manager.run(experiment['experiment_id'], 'student')
    jobs.run_one()
    feedback = manager.get(experiment['experiment_id'], 'student')

    assert feedback['safety_verification']['status'] == 'UNSAFE'
    assert feedback['safety_verification']['power_shorts'][0]['node_ids'] == ['N1', 'N2']
    assert feedback['execution_decision']['decision'] == 'BLOCK_SAFETY'
    assert 'guarded_power_up' not in gateway.calls and 'start_execution' not in gateway.calls
    assert repo.leases() == []
    manager.close()
    repo.close()
