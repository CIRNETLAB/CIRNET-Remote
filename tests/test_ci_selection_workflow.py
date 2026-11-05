"""The advisory selector has no control over the established CI gates."""

from pathlib import Path

import yaml


WORKFLOW = Path(__file__).resolve().parents[1] / '.github/workflows/integration.yml'


def workflow():
    return yaml.safe_load(WORKFLOW.read_text(encoding='utf-8'))


def command(job, text):
    return next(step for step in job['steps'] if text in step.get('run', ''))


def artifact(job, action, name):
    return next(step for step in job['steps'] if step.get('uses', '').startswith(f'actions/{action}-artifact@')
                and step['with']['name'] == f'ci-selection-{name}-${{{{ github.run_attempt }}}}')


def test_full_and_selected_are_independent_on_the_same_non_tag_events():
    data = workflow()
    events = data.get('on', data.get(True))
    full = data['jobs']['repository-contracts']
    selected = data['jobs']['selector-observation']

    assert events['push'] == {'branches': ['master'], 'tags': ['v*']}
    assert events['pull_request'] is None and 'workflow_dispatch' in events
    assert full['if'] == selected['if'] == "github.ref_type != 'tag'"
    assert full['runs-on'] == selected['runs-on'] == 'ubuntu-latest'
    assert 'needs' not in full and 'needs' not in selected
    assert not full.get('continue-on-error') and selected['continue-on-error'] is True
    assert command(full, 'check_release.py')['run'] == 'python scripts/check_release.py --group python --observe-pytest full'
    assert command(selected, 'check_release.py')['run'] == 'python scripts/check_release.py --group python --observe-pytest selected'
    assert 'secrets.' not in str(selected)
    assert selected['permissions'] == {'contents': 'read'}
    assert selected['steps'][0]['with'] == {'ref': '${{ github.sha }}', 'fetch-depth': 0, 'persist-credentials': False}


def test_observation_uses_the_same_dependency_and_isolation_commands():
    jobs = workflow()['jobs']
    full, selected = jobs['repository-contracts'], jobs['selector-observation']

    for marker in ('scripts/select_ci_release.py', 'scripts/install_contracts.py --dev-only',
                   'CIRNET_CAPTURE_DIR=', 'scripts/build_ci_dependency.py', 'python -m build --no-isolation',
                   'scripts.install_interface', 'scripts/bootstrap-contracts.mjs', 'npm ci --no-audit',
                   'scripts.check_contract_consumer', 'python scripts/install_fpga.py', 'scripts.check_fpga_consumer'):
        assert command(full, marker)['run'] == command(selected, marker)['run']

    for kind, job in (('full', full), ('selected', selected)):
        upload = artifact(job, 'upload', kind)
        assert upload['with']['path'] == '${{ env.CIRNET_ARTIFACTS_SESSION }}/ci-selection/receipt.json'
        assert upload['continue-on-error'] is True
        assert 'always()' in upload['if']
        assert job['steps'].index(command(job, '--observe-pytest')) < job['steps'].index(upload)
        assert job['steps'].index(upload) < job['steps'].index(command(job, 'cleanup-artifact-session.mjs'))


def test_comparison_is_advisory_and_requires_two_receipts_from_the_current_attempt():
    job = workflow()['jobs']['selector-comparison']

    assert set(job['needs']) == {'repository-contracts', 'selector-observation'}
    assert job['if'] == "always() && !cancelled() && github.ref_type != 'tag'"
    assert job['continue-on-error'] is True
    assert job['permissions'] == {'contents': 'read'}
    assert 'secrets.' not in str(job)
    assert job['steps'][0]['with'] == {'ref': '${{ github.sha }}', 'persist-credentials': False}
    allocation = command(job, 'ci-selection-inputs')['run']
    assert allocation.index('echo "CIRNET_ARTIFACTS_SESSION=$CIRNET_ARTIFACTS_SESSION" >> "$GITHUB_ENV"') < allocation.index('node scripts/artifact-paths.mjs ci-selection-inputs')
    comparison = command(job, 'scripts.compare_ci_selection')
    assert '$GITHUB_STEP_SUMMARY' in comparison['run']
    for kind in ('full', 'selected'):
        download = artifact(job, 'download', kind)
        assert download['with']['path'] == f'${{{{ env.CIRNET_CI_OBSERVATION_INPUTS }}}}/{kind}'
        assert download['continue-on-error'] is True
        assert job['steps'].index(download) < job['steps'].index(comparison)
    upload = artifact(job, 'upload', 'comparison')
    assert upload['with']['path'] == '${{ env.CIRNET_ARTIFACTS_SESSION }}/ci-selection/comparison.json'
    assert job['steps'].index(comparison) < job['steps'].index(upload)
    assert job['steps'].index(upload) < job['steps'].index(command(job, 'cleanup-artifact-session.mjs'))


def test_artifact_access_and_real_postgres_do_not_depend_on_observation():
    jobs = workflow()['jobs']
    for name, marker in (('system-artifact-access', 'scripts/install_release.py'),
                         ('postgresql-migrations', 'services/api/tests/postgres_cases.py')):
        job = jobs[name]
        assert 'needs' not in job and 'if' not in job
        assert 'observe-pytest' not in str(job)
        assert command(job, marker)
