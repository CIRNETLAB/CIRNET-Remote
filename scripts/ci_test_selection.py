"""Resolve observed CI test scope from the exact candidate and reviewed paths."""

import os
import re
import subprocess


REMOTE = 'cirnet-remote'
OTHER_REPOSITORIES = frozenset({
    'cirnet-contracts', 'cirnet-fpga', 'cirnet-hardware', 'cirnet-interface', 'cirnet-simulator',
})
FULL_GATES = (
    'backend', 'browser-chromium', 'contracts', 'documentation', 'fpga-rtl',
    'hardware-simulator', 'integration-python', 'interface', 'postgresql-migrations',
    'system-artifact-access',
)
DOCUMENTATION_TARGETS = frozenset({
    'tests/integration/test_context_integrity.py', 'tests/test_docs_baseline.py',
    'tests/test_docs_workflow.py', 'tests/test_markdown_links.py', 'tests/test_post_r7_provenance.py',
})
NARROW_PATHS = {
    'README.md': 'remote-documentation',
    'docs/en/index.md': 'remote-documentation',
    'docs/vi/index.md': 'remote-documentation',
    'docs/en/history/changelog.md': 'remote-documentation',
    'services/api/app/api/health.py': 'remote-api-health',
    'services/api/tests/test_health.py': 'remote-api-health',
}
RISK = re.compile(r'auth|csrf|lease|control|migrat|fenc|power|policy|persist|station|runtime|postgres')


def full_selection(reasons):
    return {'mode': 'full', 'targets': [], 'reasons': sorted(reasons), 'gates': list(FULL_GATES)}


def _safe_path(path):
    return (isinstance(path, str) and re.fullmatch(r'[a-zA-Z0-9_./-]+', path)
            and all(part and part not in {'.', '..'} and part.casefold() != '.git'
                    for part in path.split('/')))


def _path_reason(path):
    if path in NARROW_PATHS:
        return NARROW_PATHS[path]
    if (path.startswith(('.github/', 'integration/', 'scripts/', 'deployment/'))
            or path.split('/')[-1].startswith(('requirements', 'Dockerfile'))
            or path.split('/')[-1] in {'pyproject.toml', 'conftest.py', 'package.json', 'package-lock.json'}):
        return 'shared-ci-or-release-input'
    if path.startswith(('services/api/', 'docs/')) and RISK.search(path.casefold()):
        return 'remote-security-safety-or-persistence'
    return 'unreviewed-path'


def select_changes(changes):
    """Build a conservative plan from (repository, Git status, paths) records."""
    reasons = set()
    selected_reasons = set(NARROW_PATHS.values())
    try:
        for repository, status, paths in changes:
            if isinstance(paths, (str, bytes)):
                reasons.add('unverified-change-shape')
                continue
            paths = tuple(paths)
            if not paths or not all(_safe_path(path) for path in paths):
                reasons.add('unverified-change-path')
                continue
            if status not in ('A', 'M'):
                change = status[:1] if isinstance(status, str) and re.fullmatch(r'[ACDMRTUXB]\d{0,3}', status) else 'unknown'
                reasons.add(f'change-status-requires-full:{change}')
            if status in ('A', 'M') and len(paths) != 1:
                reasons.add('unverified-change-shape')
            if repository == REMOTE:
                reasons.update(_path_reason(path) for path in paths)
            elif isinstance(repository, str) and repository in OTHER_REPOSITORIES:
                reasons.add(f'cross-repository-candidate-unavailable:{repository}')
            else:
                reasons.add('unreviewed-repository')
    except (TypeError, ValueError):
        reasons.add('unverified-change-shape')
    if not reasons:
        return full_selection({'empty-change-set'})
    if reasons - selected_reasons:
        return full_selection(reasons)
    targets = set(DOCUMENTATION_TARGETS)
    gates = {'documentation', 'integration-python'}
    if 'remote-api-health' in reasons:
        targets.add('services/api/tests')
        gates.update(('backend', 'browser-chromium'))
    return {'mode': 'selected', 'targets': sorted(targets), 'reasons': sorted(reasons), 'gates': sorted(gates)}


def _sha(value):
    return isinstance(value, str) and bool(re.fullmatch(r'[0-9a-f]{40}', value)) and value != '0' * 40


def _diff_records(data):
    if not data:
        return
    fields = data.decode('utf-8').split('\0')
    if fields.pop() != '':
        raise ValueError('Missing Git diff terminator.')
    index = 0
    while index < len(fields):
        status = fields[index]
        if not re.fullmatch(r'[ACDMRTUXB]\d{0,3}', status):
            raise ValueError('Invalid Git change status.')
        size = 3 if status[0] in {'R', 'C'} else 2
        if index + size > len(fields):
            raise ValueError('Missing Git diff path.')
        yield REMOTE, status, fields[index + 1:index + size]
        index += size


def resolve_event(event_name, payload, candidate, root):
    """Resolve a GitHub event against the checked-out tree without fetching."""
    candidate = candidate if _sha(candidate) else None
    base = None

    def fallback(reason):
        return {**full_selection({reason}), 'candidate': candidate, 'base': base}

    def git(*arguments):
        return subprocess.check_output(
            ['git', '--no-replace-objects', '-C', str(root), *arguments], stderr=subprocess.DEVNULL,
            timeout=30, env={**os.environ, 'GIT_NO_LAZY_FETCH': '1', 'GIT_TERMINAL_PROMPT': '0'},
        )

    try:
        if candidate is None or git('rev-parse', '--verify', 'HEAD^{commit}').strip() != candidate.encode():
            candidate = None
            return fallback('event-checkout-unverified')
    except (OSError, subprocess.SubprocessError):
        candidate = None
        return fallback('event-checkout-unverified')

    if event_name not in ('push', 'pull_request'):
        return fallback('event-range-unavailable')
    if not isinstance(payload, dict):
        return fallback('event-payload-unverified')

    try:
        if event_name == 'push':
            before = payload.get('before')
            if (payload.get('after') != candidate or not _sha(before)
                    or any(payload.get(flag) for flag in ('created', 'deleted', 'forced'))):
                return fallback('event-push-range-unverified')
            if git('rev-parse', '--verify', f'{before}^{{commit}}').strip() != before.encode():
                return fallback('event-push-range-unverified')
            git('merge-base', '--is-ancestor', before, candidate)
        else:
            pr = payload.get('pull_request')
            if not isinstance(pr, dict) or any(not isinstance(pr.get(key), dict) for key in ('base', 'head')):
                return fallback('event-pr-range-unverified')
            before, head = pr['base'].get('sha'), pr['head'].get('sha')
            if not _sha(before) or not _sha(head) or pr.get('merge_commit_sha') not in (None, candidate):
                return fallback('event-pr-range-unverified')
            parents = git('rev-list', '--parents', '-n', '1', candidate).split()
            if parents != [value.encode() for value in (candidate, before, head)]:
                return fallback('event-pr-merge-parents-mismatch')
        base = before
        changes = list(_diff_records(git('diff', '--name-status', '-z', '--find-renames', '--find-copies',
                                        '--no-ext-diff', '--no-textconv', '--no-relative',
                                        '--ignore-submodules=none', base, candidate, '--')))
    except (OSError, subprocess.SubprocessError, ValueError):
        return fallback('event-git-range-or-diff-unverified')

    return {**select_changes(changes), 'candidate': candidate, 'base': base}
