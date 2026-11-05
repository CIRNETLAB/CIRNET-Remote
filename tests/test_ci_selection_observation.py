"""Test selector observations without changing any release assertions."""

from copy import deepcopy
from importlib.metadata import distribution
import json
from types import SimpleNamespace

import pytest


CASES = (
    'services/api/tests/test_health.py::test_health',
    'services/api/tests/test_health.py::test_optional',
    'tests/integration/test_virtual_lab_execution.py::test_execution',
)


def receipts():
    full = {
        'schema': 1, 'kind': 'full', 'candidate': 'a' * 40,
        'inputs': {'locks': {'release-set.json': 'b' * 64}},
        'decision': None, 'collected': list(CASES), 'exitCode': 0,
        'outcomes': {
            CASES[0]: {'status': 'PASS'},
            CASES[1]: {'status': 'SKIP', 'reasonSha256': 'c' * 64},
            CASES[2]: {'status': 'PASS'},
        },
    }
    selected = deepcopy(full)
    selected['kind'] = 'selected'
    selected['decision'] = {'mode': 'selected', 'candidate': selected['candidate'], 'targets': ['services/api/tests']}
    del selected['outcomes'][CASES[2]]
    return full, selected


def test_observation_compares_exact_case_ids_and_keeps_skips_separate():
    from scripts.compare_ci_selection import compare

    full, selected = receipts()
    result = compare(full, selected)
    assert result['status'] == 'PASS'
    assert result['unselected'] == [CASES[2]]
    assert result['counts']['selected'] == {'PASS': 1, 'SKIP': 1}
    assert result['missedFailures'] == []
    assert result['effectiveDecision'] == result['decision']


def test_observation_detects_a_failure_outside_selection_and_skip_drift():
    from scripts.compare_ci_selection import compare

    full, selected = receipts()
    full['outcomes'][CASES[2]] = {'status': 'FAIL'}
    full['exitCode'] = 1
    selected['outcomes'][CASES[1]]['reasonSha256'] = 'd' * 64
    result = compare(full, selected)
    assert result['status'] == 'FAIL'
    assert result['missedFailures'] == [CASES[2]]
    assert result['outcomeDifferences'] == [CASES[1]]
    assert result['decision']['mode'] == 'selected'
    assert result['effectiveDecision']['mode'] == 'full'
    assert result['effectiveDecision']['targets'] == []
    assert result['effectiveDecision']['reasons'] == ['selector-missed-failures']
    assert result['effectiveDecision']['candidate'] == full['candidate']


@pytest.mark.parametrize('selected_outcome', ['NOT_RUN', 'SKIP', 'XFAIL'])
def test_full_fallback_detects_a_failure_hidden_by_an_unexecuted_case(selected_outcome):
    from scripts.compare_ci_selection import compare

    full, selected = receipts()
    full['outcomes'][CASES[1]] = {'status': 'FAIL'}
    full['exitCode'] = 1
    selected['outcomes'][CASES[1]] = {'status': selected_outcome}
    result = compare(full, selected)
    assert result['status'] == 'FAIL'
    assert result['missedFailures'] == [CASES[1]]
    assert result['effectiveDecision']['mode'] == 'full'


@pytest.mark.parametrize('difference', ['commit', 'inputs', 'collection', 'missing', 'interrupted'])
def test_observation_rejects_incomparable_evidence(difference):
    from scripts.compare_ci_selection import compare

    full, selected = receipts()
    if difference == 'commit':
        selected['candidate'] = 'd' * 40
    elif difference == 'inputs':
        selected['inputs']['locks']['release-set.json'] = 'e' * 64
    elif difference == 'collection':
        selected['collected'].remove(CASES[2])
    elif difference == 'missing':
        selected = None
    elif difference == 'interrupted':
        selected['exitCode'] = 2
    result = compare(full, selected)
    assert result['status'] == 'NOT_VERIFIED'
    assert result['effectiveDecision']['mode'] == 'full'


def test_observation_detects_an_incomplete_execution_even_with_exit_zero():
    from scripts.compare_ci_selection import compare

    full, selected = receipts()
    del selected['outcomes'][CASES[0]]
    result = compare(full, selected)
    assert result['status'] == 'FAIL'
    assert result['missingSelected'] == [CASES[0]]


def test_observation_rejects_matching_receipts_from_another_ci_candidate():
    from scripts.compare_ci_selection import compare

    full, selected = receipts()
    assert compare(full, selected, expected_candidate=full['candidate'])['status'] == 'PASS'
    assert compare(full, selected, expected_candidate='d' * 40)['status'] == 'NOT_VERIFIED'


def test_full_fallback_compares_every_test_and_does_not_pass_on_a_matching_failure():
    from scripts.compare_ci_selection import compare

    full, selected = receipts()
    selected['decision'] = {'mode': 'full', 'targets': []}
    selected['outcomes'] = deepcopy(full['outcomes'])
    assert compare(full, selected)['unselected'] == []
    full['outcomes'][CASES[0]] = selected['outcomes'][CASES[0]] = {'status': 'FAIL'}
    full['exitCode'] = selected['exitCode'] = 1
    assert compare(full, selected)['status'] == 'FAIL'


def test_observer_preserves_setup_skip_teardown_failure_and_expected_failure():
    from scripts.ci_selection_pytest import Observation

    observer = Observation('full')

    def report(nodeid, when, status, **details):
        return SimpleNamespace(nodeid=nodeid, when=when, failed=status == 'failed',
                               skipped=status == 'skipped', **details)

    observer.pytest_runtest_logreport(report(CASES[0], 'setup', 'skipped', longrepr=('test.py', 1, 'No runtime')))
    assert observer.outcome(CASES[0])['status'] == 'SKIP'
    assert len(observer.outcome(CASES[0])['reasonSha256']) == 64
    observer.pytest_runtest_logreport(report(CASES[0], 'teardown', 'failed'))
    assert observer.outcome(CASES[0]) == {'status': 'FAIL', 'phase': 'teardown'}
    observer.pytest_runtest_logreport(report(CASES[1], 'call', 'skipped', wasxfail='known'))
    assert observer.outcome(CASES[1])['status'] == 'XFAIL'
    observer.pytest_runtest_logreport(report(CASES[1], 'call', 'passed', wasxfail='known'))
    assert observer.outcome(CASES[1]) == {'status': 'XPASS'}
    assert observer.outcome(CASES[2]) == {'status': 'NOT_RUN'}
    for when in ('setup', 'call', 'teardown'):
        observer.pytest_runtest_logreport(report(CASES[2], when, 'passed'))
    assert observer.outcome(CASES[2]) == {'status': 'PASS'}


def test_observer_falls_back_to_every_case_when_one_selected_path_collects_nothing(monkeypatch):
    from scripts.ci_selection_pytest import Observation

    observer = Observation('selected')
    items = [SimpleNamespace(nodeid=nodeid) for nodeid in CASES]
    monkeypatch.setattr(observer, 'select', lambda config: {
        'mode': 'selected', 'targets': ['services/api/tests', 'tests/missing.py'], 'candidate': 'a' * 40,
    })
    observer.pytest_collection_modifyitems(None, items)
    assert observer.collected == observer.executed == list(CASES)
    assert observer.decision['mode'] == 'full'
    assert observer.decision['candidate'] == 'a' * 40


@pytest.mark.parametrize(('setting', 'reason'), [
    ('true', 'selector-force-full'), ('unexpected', 'selector-force-full-invalid'),
])
def test_operator_fallback_keeps_every_collected_case(monkeypatch, setting, reason):
    from scripts.ci_selection_pytest import Observation

    monkeypatch.setenv('CIRNET_CI_SELECTOR_FORCE_FULL', setting)
    observer = Observation('selected')
    items = [SimpleNamespace(nodeid=nodeid) for nodeid in CASES]
    observer.pytest_collection_modifyitems(None, items)
    assert observer.collected == observer.executed == list(CASES)
    assert observer.decision['mode'] == 'full'
    assert observer.decision['reasons'] == [reason]


@pytest.mark.parametrize('setting', ['', 'false'])
def test_inactive_operator_override_still_resolves_the_candidate(monkeypatch, setting):
    from scripts import ci_test_selection
    from scripts.ci_selection_pytest import Observation

    monkeypatch.setenv('CIRNET_CI_SELECTOR_FORCE_FULL', setting)
    monkeypatch.setenv('GITHUB_SHA', 'a' * 40)
    monkeypatch.delenv('GITHUB_EVENT_PATH', raising=False)
    expected = {'mode': 'selected', 'targets': ['services/api/tests']}
    monkeypatch.setattr(ci_test_selection, 'resolve_event', lambda *args: expected)
    assert Observation('selected').select(SimpleNamespace(rootpath=None)) == expected


def test_provenance_records_normalized_transitive_versions_from_installed_paths(monkeypatch):
    from scripts import ci_selection_pytest as observer

    def distributions(*, path):
        assert path == ['installed-purelib', 'installed-platlib']
        return [SimpleNamespace(metadata={'Name': 'Py_YAML'}, version='6.0.3'),
                SimpleNamespace(metadata={'Name': 'starlette'}, version='1.3.0')]

    monkeypatch.setattr(observer.sysconfig, 'get_path', lambda key: f'installed-{key}')
    monkeypatch.setattr(observer, 'distributions', distributions)
    assert observer.installed_versions() == [('py-yaml', '6.0.3'), ('starlette', '1.3.0')]


def test_provenance_ignores_checkout_metadata_added_to_pytest_import_paths(monkeypatch, tmp_path):
    from scripts import ci_selection_pytest as observer

    checkout = tmp_path / 'checkout'
    source = checkout / 'cirnet_probe.egg-info'
    source.mkdir(parents=True)
    (source / 'PKG-INFO').write_text('Name: cirnet-probe\nVersion: 0.0.0\n', encoding='utf-8')
    installed = tmp_path / 'installed'
    wheel = installed / 'cirnet_probe-0.1.2.dist-info'
    wheel.mkdir(parents=True)
    (wheel / 'METADATA').write_text('Name: cirnet-probe\nVersion: 0.1.2\n', encoding='utf-8')
    (wheel / 'direct_url.json').write_text(json.dumps({'archive_info': {'hashes': {'sha256': 'b' * 64}}}),
                                         encoding='utf-8')
    monkeypatch.syspath_prepend(str(checkout))
    assert distribution('cirnet-probe').version == '0.0.0'
    monkeypatch.setattr(observer.sysconfig, 'get_path', lambda key: str(installed))
    assert observer.installed_identity('cirnet-probe') == {'version': '0.1.2', 'archiveSha256': 'b' * 64}


def test_release_opt_in_attaches_only_to_the_python_pytest_command(monkeypatch, tmp_path):
    from scripts import check_release

    monkeypatch.setattr(check_release, 'artifact_directory', lambda *args: tmp_path)
    usual = check_release.release_plan(['python'])
    observed = check_release.release_plan(['python'], observe_pytest='full')
    assert observed[:-1] == usual[:-1]
    assert observed[-1]['command'] == [*usual[-1]['command'], '-p',
        'scripts.ci_selection_pytest', '--cirnet-ci-observation=full']
    assert '--cirnet-ci-observation=full' not in ' '.join(usual[-1]['command'])
