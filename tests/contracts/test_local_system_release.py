"""Local files require an explicit mode; published release policy stays strict."""
import hashlib
import json
from pathlib import Path

import pytest

from tests.contracts.test_system_release import release, saved_environment


def local_set(tmp_path):
    value = release()
    value['distribution'] = 'local'
    entries = [entry for product in value['repositories'].values() for entry in product['artifacts'].values()]
    entries.append(value['rollback']['source'])
    for index, entry in enumerate(entries):
        directory = tmp_path / str(index)
        directory.mkdir()
        path = directory / entry['filename']
        path.write_bytes(('artifact ' + str(index)).encode())
        entry.pop('url')
        entry['path'] = str(path.resolve())
        entry['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    return value


def test_local_transport_is_explicit_and_default_release_stays_strict(tmp_path):
    from scripts.system_release_manifest import validate_manifest
    value = local_set(tmp_path)
    with pytest.raises(ValueError):
        validate_manifest(value)
    assert validate_manifest(value, local_artifacts=True) == value
    with pytest.raises(ValueError):
        validate_manifest(release(), local_artifacts=True)


@pytest.mark.parametrize('failure', ['missing-path', 'relative-path', 'directory', 'wrong-digest', 'mixed-url', 'wrong-filename', 'missing-owner', 'wrong-version', 'unsafe-runtime', 'unsafe-rollback'])
def test_bad_local_set_cannot_reach_bootstrap(tmp_path, monkeypatch, failure):
    from scripts import install_release
    value = local_set(tmp_path)
    entry = value['repositories']['Contracts']['artifacts']['python']
    if failure == 'missing-path': entry.pop('path')
    elif failure == 'relative-path': entry['path'] = entry['filename']
    elif failure == 'directory': entry['path'] = str(tmp_path)
    elif failure == 'wrong-digest': entry['sha256'] = '0' * 64
    elif failure == 'mixed-url': entry['url'] = 'https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/1'
    elif failure == 'wrong-filename': entry['filename'] = 'netcircuit_contracts-1.0.1-py3-none-any.whl'
    elif failure == 'missing-owner': value['repositories'].pop('FPGA')
    elif failure == 'wrong-version': value['repositories']['Hardware']['version'] = '0.2.0'
    elif failure == 'unsafe-runtime': value['compatibility']['apiSchedulerProcesses'] = 2
    elif failure == 'unsafe-rollback': value['rollback']['automaticStartReplay'] = True
    manifest = tmp_path / 'local-set.json'
    manifest.write_text(json.dumps(value), encoding='utf-8')
    monkeypatch.setattr(install_release, '_bootstrap', lambda *args, **kwargs: pytest.fail('Invalid local set reached bootstrap'))
    with pytest.raises(ValueError):
        install_release.install(manifest, tmp_path / 'environment.json', local_artifacts=True)


def test_local_copy_rechecks_bytes_without_network_fallback(tmp_path, monkeypatch):
    from scripts import install_release
    from scripts.system_release_manifest import validate_manifest
    value = local_set(tmp_path)
    validate_manifest(value, local_artifacts=True)
    entry = value['repositories']['Contracts']['artifacts']['python']
    monkeypatch.setattr(install_release, 'download_artifact', lambda *args, **kwargs: pytest.fail('Local transport reached network fallback'))
    assert install_release._artifact_bytes(entry, local_artifacts=True) == Path(entry['path']).read_bytes()
    Path(entry['path']).write_bytes(b'changed after validation')
    with pytest.raises(ValueError, match='SHA256'):
        install_release._artifact_bytes(entry, local_artifacts=True)


def saved_local_environment(tmp_path):
    state, path = saved_environment(tmp_path)
    value = local_set(tmp_path)
    manifest = Path(state['manifest'])
    manifest.write_text(json.dumps(value), encoding='utf-8')
    state.update(distribution='local', manifestSha256=hashlib.sha256(manifest.read_bytes()).hexdigest())
    path.write_text(json.dumps(state), encoding='utf-8')
    return state, path


def test_rollback_local_environment_requires_explicit_opt_in(tmp_path):
    from scripts import check_release_rollback
    state, path = saved_local_environment(tmp_path)
    with pytest.raises(ValueError, match='explicit --local-artifacts'):
        check_release_rollback.load_environment(path)
    selected = check_release_rollback.load_environment(path, local_artifacts=True)
    assert selected['manifestSha256'] == state['manifestSha256']
    assert selected['processEnvironment'] == state['processEnvironment']


@pytest.mark.parametrize('failure', ['manifest-digest', 'artifact-bytes', 'mixed-url', 'published-distribution', 'unsafe-runtime'])
def test_rollback_local_environment_retains_digest_and_strict_admission(tmp_path, failure):
    from scripts import check_release_rollback
    state, path = saved_local_environment(tmp_path)
    manifest = Path(state['manifest'])
    value = json.loads(manifest.read_text(encoding='utf-8'))
    entry = value['repositories']['Contracts']['artifacts']['python']
    if failure == 'manifest-digest':
        state['manifestSha256'] = '0' * 64
    elif failure == 'artifact-bytes':
        Path(entry['path']).write_bytes(b'changed after installation')
    else:
        if failure == 'mixed-url': entry['url'] = 'https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/1'
        elif failure == 'published-distribution': value['distribution'] = 'github-release'
        elif failure == 'unsafe-runtime': value['compatibility']['apiSchedulerProcesses'] = 2
        manifest.write_text(json.dumps(value), encoding='utf-8')
        state['manifestSha256'] = hashlib.sha256(manifest.read_bytes()).hexdigest()
    path.write_text(json.dumps(state), encoding='utf-8')
    with pytest.raises(ValueError):
        check_release_rollback.load_environment(path, local_artifacts=True)


def test_rollback_local_run_passes_verified_environment_before_database_requirement(tmp_path, monkeypatch):
    from scripts import check_release_rollback
    _state, path = saved_local_environment(tmp_path)
    monkeypatch.delenv('NETCIRCUIT_TEST_POSTGRES_URL', raising=False)
    with pytest.raises(ValueError, match='NETCIRCUIT_TEST_POSTGRES_URL'):
        check_release_rollback.run(path, local_artifacts=True)


def test_rollback_show_plan_explicitly_admits_local_manifest(tmp_path, capsys):
    from scripts import check_release_rollback
    state, _path = saved_local_environment(tmp_path)
    arguments = ['--manifest', state['manifest'], '--show-plan']
    with pytest.raises(ValueError, match='explicit --local-artifacts'):
        check_release_rollback.main(arguments)
    assert check_release_rollback.main([*arguments, '--local-artifacts']) == 0
    output = json.loads(capsys.readouterr().out)
    assert output['executionStatus'] == 'NOT_RUN'
    assert output['fullPriorArtifactRollbackRehearsal'] == 'NOT_RUN'
    assert [gate['gate'] for gate in output['gates']] == ['postgres-backup-restore', 'replay-and-quarantine', 'installed-artifact-isolation']


@pytest.mark.parametrize('local', [False, True])
def test_rollback_cli_dispatch_retains_default_call_compatibility(tmp_path, monkeypatch, capsys, local):
    from scripts import check_release_rollback
    path = tmp_path / 'environment.json'
    calls = []
    def execute(*args, **kwargs):
        calls.append((args, kwargs))
        return {'gateStatus': 'PASS'}, tmp_path / 'result.json'
    monkeypatch.setattr(check_release_rollback, 'run', execute)
    arguments = ['--environment-file', str(path), '--run']
    if local: arguments.append('--local-artifacts')
    assert check_release_rollback.main(arguments) == 0
    assert calls == [((path,), {'local_artifacts': True} if local else {})]
    assert json.loads(capsys.readouterr().out)['fullPriorArtifactRollbackRehearsal'] == 'NOT_RUN'
