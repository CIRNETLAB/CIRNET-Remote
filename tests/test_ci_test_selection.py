import subprocess

import pytest


HEALTH = 'services/api/app/api/health.py'
HEALTH_TEST = 'services/api/tests/test_health.py'


def select(*changes):
    from scripts.ci_test_selection import select_changes

    return select_changes(changes)


def test_known_api_scope_keeps_api_and_baseline_tests():
    decision = select(('cirnet-remote', 'M', [HEALTH]))

    assert decision['mode'] == 'selected'
    assert 'services/api/tests' in decision['targets']
    assert 'tests/test_markdown_links.py' in decision['targets']
    assert {'backend', 'browser-chromium', 'integration-python'} <= set(decision['gates'])
    assert 'remote-api-health' in decision['reasons']


def test_duplicate_changes_keep_one_copy_of_each_target_and_reason():
    changes = [('cirnet-remote', 'M', [path]) for path in (HEALTH, 'README.md', HEALTH_TEST, HEALTH)]

    decision = select(*changes)

    assert decision == select(*reversed(changes))
    assert decision['mode'] == 'selected'
    assert decision['reasons'] == ['remote-api-health', 'remote-documentation']
    assert len(decision['targets']) == len(set(decision['targets']))


@pytest.mark.parametrize(('repo', 'path', 'reason'), [
    ('cirnet-remote', 'services/api/app/services/auth.py', 'remote-security-safety-or-persistence'),
    ('cirnet-remote', 'services/api/app/services/execution_policy.py', 'remote-security-safety-or-persistence'),
    ('cirnet-remote', 'services/api/app/migrations/versions/0007_auth_maintenance.py', 'remote-security-safety-or-persistence'),
    ('cirnet-remote', 'integration/ci-source-dependencies.json', 'shared-ci-or-release-input'),
    ('cirnet-remote', 'integration/browser-interface-source.json', 'shared-ci-or-release-input'),
    ('cirnet-remote', 'requirements-verification.txt', 'shared-ci-or-release-input'),
    ('cirnet-remote', 'services/api/pyproject.toml', 'shared-ci-or-release-input'),
    ('cirnet-remote', '.github/workflows/integration.yml', 'shared-ci-or-release-input'),
    ('cirnet-remote', 'scripts/ci_test_selection.py', 'shared-ci-or-release-input'),
    ('cirnet-remote', 'unknown/input.txt', 'unreviewed-path'),
    ('cirnet-remote', 'services/api/app/api/new_route.py', 'unreviewed-path'),
    ('cirnet-remote', 'services/api/app/api/health.py/child', 'unreviewed-path'),
    ('cirnet-contracts', 'contracts/public/auth.schema.json', 'cross-repository-candidate-unavailable:cirnet-contracts'),
    ('cirnet-contracts', 'tools/artifact-paths/package.json', 'cross-repository-candidate-unavailable:cirnet-contracts'),
    ('cirnet-hardware', 'hardware_service/server.py', 'cross-repository-candidate-unavailable:cirnet-hardware'),
    ('cirnet-simulator', 'cirnet_sim/backends.py', 'cross-repository-candidate-unavailable:cirnet-simulator'),
    ('cirnet-interface', 'src/three/SceneManager.ts', 'cross-repository-candidate-unavailable:cirnet-interface'),
    ('cirnet-fpga', 'experiment-controller/rtl/top.v', 'cross-repository-candidate-unavailable:cirnet-fpga'),
    ('unknown-owner', 'README.md', 'unreviewed-repository'),
])
def test_unreviewed_or_shared_scope_falls_back_without_losing_safety_intents(repo, path, reason):
    decision = select(('cirnet-remote', 'M', [HEALTH]), (repo, 'M', [path]))

    assert decision['mode'] == 'full'
    assert decision['targets'] == []
    assert reason in decision['reasons']
    assert {'postgresql-migrations', 'browser-chromium', 'fpga-rtl', 'integration-python'} <= set(decision['gates'])


@pytest.mark.parametrize('change', [
    ('cirnet-remote', 'D', [HEALTH]),
    ('cirnet-remote', 'R100', ['unknown.py', HEALTH]),
    ('cirnet-remote', 'C100', [HEALTH, 'unknown.py']),
    ('cirnet-remote', 'T', [HEALTH]),
    ('cirnet-remote', 'M', [HEALTH, HEALTH_TEST]),
    ('cirnet-remote', 'M', ['services/api/app/api/../api/health.py']),
    ('cirnet-remote', 'M', [f'/{HEALTH}']),
    ('cirnet-remote', 'M', [f'C:/{HEALTH}']),
    ('cirnet-remote', 'M', [HEALTH.replace('/', '\\')]),
    ('cirnet-remote', 'M', [f'{HEALTH}\n::error::untrusted']),
    ('cirnet-remote', 'M', HEALTH),
    ('cirnet-remote', 'M', []),
    ('cirnet-remote',),
])
def test_unverified_change_shape_cannot_enable_narrow_selection(change):
    decision = select(change)

    assert decision['mode'] == 'full'
    assert decision['targets'] == []
    assert decision['reasons']
    assert not any('\n' in reason for reason in decision['reasons'])


def test_empty_scope_falls_back_explicitly():
    assert select()['reasons'] == ['empty-change-set']


@pytest.fixture
def git_repository(tmp_path):
    def git(*arguments):
        return subprocess.check_output([
            'git', '-C', str(tmp_path), '-c', 'core.longpaths=true',
            '-c', 'user.name=Selector Test', '-c', 'user.email=selector@example.invalid',
            *arguments,
        ], text=True).strip()

    git('init', '-q', '-b', 'master')
    health = tmp_path / HEALTH
    health.parent.mkdir(parents=True)
    health.write_text('initial\n', encoding='utf-8')
    git('add', '--', HEALTH)
    git('commit', '-qm', 'base')
    return tmp_path, git, git('rev-parse', 'HEAD')


def test_push_resolves_exact_checkout_ancestor_and_nul_diff(git_repository):
    from scripts.ci_test_selection import resolve_event

    root, git, base = git_repository
    (root / HEALTH).write_text('updated\n', encoding='utf-8')
    git('commit', '-qam', 'change')
    candidate = git('rev-parse', 'HEAD')

    decision = resolve_event('push', {'before': base, 'after': candidate}, candidate, root)

    assert decision['mode'] == 'selected'
    assert (decision['base'], decision['candidate']) == (base, candidate)


def test_pr_resolves_the_tested_merge_tree_not_the_head_tree(git_repository):
    from scripts.ci_test_selection import resolve_event

    root, git, base = git_repository
    git('switch', '-qc', 'topic')
    (root / HEALTH).write_text('updated\n', encoding='utf-8')
    git('commit', '-qam', 'change')
    head = git('rev-parse', 'HEAD')
    git('switch', '-q', 'master')
    git('merge', '-q', '--no-ff', '-m', 'GitHub test merge', 'topic')
    candidate = git('rev-parse', 'HEAD')
    pr = {'pull_request': {'base': {'sha': base}, 'head': {'sha': head}, 'merge_commit_sha': candidate}}

    assert resolve_event('pull_request', pr, candidate, root)['mode'] == 'selected'
    assert resolve_event('pull_request', pr, head, root)['mode'] == 'full'
    pr['pull_request']['head']['sha'] = base
    assert resolve_event('pull_request', pr, candidate, root)['mode'] == 'full'


def test_git_rename_is_observed_as_a_full_fallback(git_repository):
    from scripts.ci_test_selection import resolve_event

    root, git, base = git_repository
    git('mv', HEALTH, 'renamed.py')
    git('commit', '-qm', 'rename')
    candidate = git('rev-parse', 'HEAD')

    decision = resolve_event('push', {'before': base, 'after': candidate}, candidate, root)

    assert decision['mode'] == 'full'
    assert 'change-status-requires-full:R' in decision['reasons']


def test_nonancestor_push_cannot_narrow(git_repository):
    from scripts.ci_test_selection import resolve_event

    root, git, base = git_repository
    git('switch', '-qc', 'topic')
    git('commit', '-qm', 'unrelated before', '--allow-empty')
    other = git('rev-parse', 'HEAD')
    git('switch', '-q', 'master')
    assert resolve_event('push', {'before': other, 'after': base}, base, root)['mode'] == 'full'


@pytest.mark.parametrize(('event', 'payload'), [
    ('push', {}),
    ('push', {'before': '0' * 40, 'after': 'a' * 40}),
    ('push', {'before': '--help'}),
    ('pull_request', {'pull_request': []}),
    ('workflow_dispatch', {}),
    ('pull_request_target', {}),
])
def test_missing_or_unsupported_event_inputs_fall_back(git_repository, event, payload):
    from scripts.ci_test_selection import resolve_event

    root, _, candidate = git_repository
    decision = resolve_event(event, payload, candidate, root)

    assert decision['mode'] == 'full'
    assert decision['targets'] == []
    assert decision['candidate'] == candidate
    assert decision['reasons']
