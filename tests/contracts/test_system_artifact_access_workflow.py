"""The hosted credential consumer must install the complete selected release."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
from urllib.parse import urlparse
from urllib.request import url2pathname

import pytest
import yaml


ROOT = Path(__file__).resolve().parents[2]


def document():
    return yaml.safe_load((ROOT / '.github/workflows/integration.yml').read_text(encoding='utf-8'))


def access_job():
    jobs = document()['jobs']
    assert 'system-artifact-access' in jobs, 'Integration lacks the real complete-release credential consumer'
    return jobs['system-artifact-access']


def test_manual_dispatch_can_recheck_private_assets_on_the_same_verified_revision():
    data = document()
    events = data.get('on', data.get(True))
    assert 'workflow_dispatch' in events, 'Credential rotation needs a same-revision consumer rerun'
    assert data['name'] == 'Integration'
    job = access_job()
    assert job['permissions'] == {'contents': 'read'}
    assert job['timeout-minutes'] == 20
    assert job['runs-on'] == 'ubuntu-latest'


def test_access_job_uses_real_installer_only_the_named_secret_and_owned_outputs():
    job = access_job()
    steps = job['steps']
    assert job['env'] == {'NETCIRCUIT_ARTIFACTS_TOKEN': '${{ secrets.NETCIRCUIT_ARTIFACTS_READ_TOKEN }}'}
    commands = '\n'.join(step.get('run', '') for step in steps)
    assert 'GITHUB_TOKEN' not in commands
    assert 'github.token' not in str(job)
    assert 'NETCIRCUIT_ARTIFACTS_TOKEN:?' in commands
    bootstrap = next(i for i, step in enumerate(steps) if 'install_contracts.py --dev-only' in step.get('run', ''))
    allocation = next(i for i, step in enumerate(steps) if 'ci_runtime=' in step.get('run', ''))
    install = next(i for i, step in enumerate(steps) if 'scripts/install_release.py --manifest integration/release-set.json --environment-file ci-release-env.json' in step.get('run', ''))
    assert bootstrap < allocation < install
    assert 'python -m venv "$ci_runtime/access-venv"' in steps[install]['run']
    assert ' -I -m pip check' in steps[install]['run']
    for name in ('TMP', 'TEMP', 'TMPDIR', 'PIP_CACHE_DIR', 'npm_config_cache', 'NETCIRCUIT_DATABASE_URL', 'NETCIRCUIT_CAPTURE_DIR'):
        assert 'echo "' + name + '=' in steps[allocation]['run'], name
    assert any(i < bootstrap and step.get('with', {}).get('node-version') == '22' for i, step in enumerate(steps))
    assert any(i < bootstrap and step.get('with', {}).get('python-version') == '3.12' for i, step in enumerate(steps))
    upload = next(step for step in steps if step.get('uses', '').startswith('actions/upload-artifact@'))
    assert upload['with']['path'].splitlines() == [
        '${{ env.NETCIRCUIT_ARTIFACTS_SESSION }}/system-artifact-access/receipt.json',
        '${{ env.NETCIRCUIT_ARTIFACTS_SESSION }}/system-artifact-access/installer.log',
    ]
    assert upload['if'] == "always() && env.NETCIRCUIT_ARTIFACTS_SESSION != ''"
    cleanup = steps[-1]
    assert cleanup['if'] == "always() && env.NETCIRCUIT_ARTIFACTS_SESSION != ''"
    assert cleanup['run'] == 'node scripts/cleanup-artifact-session.mjs --cleanup "$NETCIRCUIT_ARTIFACTS_SESSION"'
    assert not any(step.get('continue-on-error') for step in steps)


def receipt_program():
    step = next(step for step in access_job()['steps'] if step.get('name') == 'Rehash the installed release and write a sanitized receipt')
    code = step['run'].split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
    namespace = {'__name__': 'receipt_policy_test'}
    exec(compile(code, 'integration.yml:system-artifact-access', 'exec'), namespace)
    namespace['__source__'] = code
    return namespace


def installed_fixture(tmp_path):
    from tests.contracts.test_system_release import release
    value = release()
    state = {'artifacts': {}, 'rollback': {}}
    for component, product in value['repositories'].items():
        directory = tmp_path / component
        directory.mkdir()
        state['artifacts'][component] = {}
        for kind, artifact in product['artifacts'].items():
            path = directory / artifact['filename']
            payload = (component + ':' + kind).encode()
            path.write_bytes(payload)
            artifact['sha256'] = hashlib.sha256(payload).hexdigest()
            state['artifacts'][component][kind] = str(path)
    rollback = tmp_path / value['rollback']['source']['filename']
    with tarfile.open(rollback, 'w:gz') as archive:
        for product in value['rollback']['artifactSet']:
            for artifact in product['artifacts'].values():
                payload = product['component'].encode()
                artifact['sha256'] = hashlib.sha256(payload).hexdigest()
                member = tarfile.TarInfo(artifact['filename'])
                member.size = len(payload)
                archive.addfile(member, io.BytesIO(payload))
    value['rollback']['source']['sha256'] = hashlib.sha256(rollback.read_bytes()).hexdigest()
    state['rollback'] = {'archive': str(rollback), 'verifiedPreservedArtifacts': 6}
    installed = [{
        'name': name, 'version': version, 'origin': 'owned-venv/site-packages/' + module + '/__init__.py',
        'selectedSha256': value['repositories'][component]['artifacts'][kind]['sha256'],
    } for name, module, version, component, kind in receipt_program()['PACKAGES']]
    return state, value, installed


def test_receipt_rehashes_all_fifteen_actual_files_and_rollback_without_environment_dump(tmp_path):
    program = receipt_program()
    state, manifest, installed = installed_fixture(tmp_path)
    state['environment'] = {'NETCIRCUIT_ARTIFACTS_TOKEN': 'sentinel-never-publish'}
    receipt = program['create_receipt'](state, manifest, installed, authenticated_request=True)
    assert receipt['status'] == 'PASS'
    assert len(receipt['artifacts']) == 15
    assert {row['component'] for row in receipt['artifacts']} == set(manifest['repositories'])
    assert receipt['rollback']['verifiedPreservedArtifacts'] == 6
    assert receipt['credentialScopeVerification'] == 'NOT_VERIFIED'
    assert receipt['selectedRepositories'] == {
        name: {key: product[key] for key in ('repository', 'version', 'sourceRevision')}
        for name, product in manifest['repositories'].items()
    }
    for row in receipt['artifacts']:
        selected = manifest['repositories'][row['component']]['artifacts'][row['kind']]
        assert row['url'] == selected['url'] and row['sha256'] == selected['sha256']
        assert row['bytes'] > 0 and row['apiAuthorizationSupplied'] is True
    encoded = json.dumps(receipt)
    assert 'sentinel-never-publish' not in encoded and 'environment' not in receipt


@pytest.mark.parametrize('corruption', ['missing-file', 'changed-bytes', 'missing-owner', 'extra-artifact', 'rollback-bytes', 'missing-origin', 'wrong-origin-version', 'wrong-origin-digest', 'unauthenticated'])
def test_receipt_cannot_pass_with_incomplete_or_unverified_real_inputs(tmp_path, corruption):
    program = receipt_program()
    state, manifest, installed = installed_fixture(tmp_path)
    authenticated = True
    if corruption == 'missing-file': Path(state['artifacts']['Interface']['static']).unlink()
    elif corruption == 'changed-bytes': Path(state['artifacts']['Contracts']['npm']).write_bytes(b'changed')
    elif corruption == 'missing-owner': state['artifacts'].pop('FPGA')
    elif corruption == 'extra-artifact': state['artifacts']['Remote']['unexpected'] = 'unused'
    elif corruption == 'rollback-bytes': Path(state['rollback']['archive']).write_bytes(b'changed')
    elif corruption == 'missing-origin': installed.pop()
    elif corruption == 'wrong-origin-version': installed[0]['version'] = '0.1.0'
    elif corruption == 'wrong-origin-digest': installed[0]['selectedSha256'] = 'f' * 64
    elif corruption == 'unauthenticated': authenticated = False
    with pytest.raises((ValueError, FileNotFoundError)):
        program['create_receipt'](state, manifest, installed, authenticated_request=authenticated)


def test_actual_isolated_probe_ignores_checkout_shadowing_and_rejects_wrong_wheel_digest(tmp_path):
    from importlib.metadata import distribution
    program = receipt_program()
    probe = program['ORIGIN_PROBE']
    assert 'sys.flags.isolated' in probe
    assert "'dir_info'" in probe
    assert 'module.__file__' in probe
    assert 'product.locate_file' in probe
    assert 'sysconfig.get_paths()' in probe
    assert 'archive_info' in probe
    assert "'-I', '-B', '-c', ORIGIN_PROBE" in program['__source__']
    selected = []
    for name, module, version, component, kind in program['PACKAGES']:
        metadata = distribution(name)
        direct = json.loads(metadata.read_text('direct_url.json'))
        archive = direct['archive_info']
        digest = archive.get('hashes', {}).get('sha256') or archive['hash'].removeprefix('sha256=')
        selected.append({'name': name, 'module': module, 'version': version, 'sha256': digest})
        shadow = tmp_path / module
        shadow.mkdir()
        (shadow / '__init__.py').write_text("raise RuntimeError('checkout shadow was imported')\n", encoding='utf-8')
    environment = {**os.environ, 'PYTHONPATH': str(tmp_path)}
    result = subprocess.run([sys.executable, '-I', '-B', '-c', probe, json.dumps(selected)],
                            cwd=tmp_path, env=environment, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    installed = json.loads(result.stdout)
    assert len(installed) == 5
    assert all(not Path(row['origin']).is_relative_to(tmp_path) for row in installed)
    selected[0]['sha256'] = 'f' * 64
    rejected = subprocess.run([sys.executable, '-I', '-B', '-c', probe, json.dumps(selected)],
                              cwd=tmp_path, env=environment, capture_output=True, text=True)
    assert rejected.returncode != 0 and 'Installed wheel digest differs' in rejected.stderr


@pytest.mark.parametrize('cli_state', ['published', 'changed-bytes', 'missing-file', 'no-published-cli'])
def test_cleanup_after_allocated_dev_pip_failure_uses_published_canonical_cli(tmp_path, monkeypatch, cli_state):
    from importlib.metadata import distribution
    from scripts import bootstrap_contract_tools as bootstrap

    bash = Path('C:/Program Files/Git/bin/bash.exe') if os.name == 'nt' else Path(shutil.which('bash') or '')
    assert bash.is_file(), 'The workflow cleanup regression requires Git Bash/bash'
    consumer = tmp_path / 'fresh-consumer'
    (consumer / 'scripts').mkdir(parents=True)
    (consumer / 'integration').mkdir()
    shutil.copyfile(ROOT / 'scripts/artifact-paths.mjs', consumer / 'scripts/artifact-paths.mjs')
    shared_cleanup = ROOT / 'scripts/cleanup-artifact-session.mjs'
    assert shared_cleanup.is_file(), 'The shared bootstrap-safe cleanup helper is missing'
    shutil.copyfile(shared_cleanup, consumer / 'scripts/cleanup-artifact-session.mjs')
    shutil.copyfile(ROOT / 'integration/contracts-version.json', consumer / 'integration/contracts-version.json')
    direct = json.loads(distribution('netcircuit-artifact-paths').read_text('direct_url.json'))
    assert urlparse(direct['url']).scheme == 'file'
    wheel = Path(url2pathname(urlparse(direct['url']).path))
    pin = json.loads((ROOT / 'integration/contracts-version.json').read_text())['dev']
    parent = tmp_path / 'bootstrap-parent'
    parent.mkdir()
    github_env = tmp_path / 'github-env.txt'
    inherited_session = os.environ.get('NETCIRCUIT_ARTIFACTS_SESSION')
    inherited_cli = os.environ.get('NETCIRCUIT_ARTIFACTS_CLI')
    inherited_environment = dict(os.environ)
    real_run = subprocess.run
    pip_commands = []

    def fail_only_pip(command, *args, **kwargs):
        if command[1:5] == ['-B', '-m', 'pip', 'install']:
            pip_commands.append(command)
            kwargs['stdout'].write(b'SYNTHETIC_DEV_PIP_INSTALL_FAILURE\n')
            return subprocess.CompletedProcess(command, 42)
        return real_run(command, *args, **kwargs)

    with monkeypatch.context() as local:
        # Bootstrap mutates these values directly; register every prior value
        # so this fresh-session test cannot leak into the invoking release run.
        for key in ('NETCIRCUIT_ARTIFACTS_SESSION', 'NETCIRCUIT_ARTIFACTS_CLI', 'NETCIRCUIT_ARTIFACTS_CONTEXT',
                    'NETCIRCUIT_ARTIFACTS_DIR', 'GITHUB_ENV', 'TMP', 'TEMP', 'TMPDIR',
                    'PIP_CACHE_DIR', 'npm_config_cache', 'PYTHONDONTWRITEBYTECODE'):
            if key in os.environ: local.setenv(key, os.environ[key])
            else: local.delenv(key, raising=False)
        local.delenv('NETCIRCUIT_ARTIFACTS_SESSION', raising=False)
        local.delenv('NETCIRCUIT_ARTIFACTS_CLI', raising=False)
        local.setenv('NETCIRCUIT_ARTIFACTS_DIR', str(parent))
        local.setenv('GITHUB_ENV', str(github_env))
        local.setattr(bootstrap.subprocess, 'run', fail_only_pip)
        with pytest.raises(RuntimeError, match='SYNTHETIC_DEV_PIP_INSTALL_FAILURE'):
            bootstrap.bootstrap(wheel=wheel, digest=pin['wheel_sha256'], repository_root=ROOT, cache_root=consumer)
        published = dict(line.split('=', 1) for line in github_env.read_text().splitlines())
        cleanup_environment = {**os.environ, **published}

    assert os.environ.get('NETCIRCUIT_ARTIFACTS_SESSION') == inherited_session
    assert os.environ.get('NETCIRCUIT_ARTIFACTS_CLI') == inherited_cli
    changed_keys = [key for key in set(inherited_environment) | set(os.environ)
                    if inherited_environment.get(key) != os.environ.get(key)]
    assert not changed_keys, f'Bootstrap fixture leaked environment keys: {changed_keys}'
    assert len(pip_commands) == 1
    session = Path(published['NETCIRCUIT_ARTIFACTS_SESSION'])
    cli = Path(published['NETCIRCUIT_ARTIFACTS_CLI'])
    assert session.parent == parent.resolve() and str(session) != inherited_session
    assert cli == session / 'dev-bootstrap/allocator.mjs'
    canonical_source = cli.read_bytes()
    assert hashlib.sha256(canonical_source).hexdigest() == pin['node_sha256']
    assert not (consumer / '.build/contracts-tools').exists()
    # Inspect synthetic evidence before its owning session is cleaned.
    observed = (session / 'dev-bootstrap/install.log').read_text()
    assert observed == 'SYNTHETIC_DEV_PIP_INSTALL_FAILURE\n'
    (tmp_path / 'inspected-bootstrap-failure.log').write_text(observed, encoding='utf-8')
    if cli_state == 'changed-bytes':
        cli.write_text("console.log('UNVERIFIED_CLI_EXECUTED'); process.exit(0)\n", encoding='utf-8')
    elif cli_state == 'missing-file':
        cli.unlink()
    elif cli_state == 'no-published-cli':
        bootstrap.materialize_allocator(cache_root=consumer)
        cleanup_environment.pop('NETCIRCUIT_ARTIFACTS_CLI')
    cleanup = access_job()['steps'][-1]['run']
    try:
        result = real_run([str(bash), '--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', cleanup],
                          cwd=consumer, env=cleanup_environment, capture_output=True, text=True)
        (tmp_path / 'workflow-cleanup.log').write_text(result.stdout + result.stderr, encoding='utf-8')
        if cli_state in ('published', 'no-published-cli'):
            assert result.returncode == 0, result.stdout + result.stderr
            assert not session.exists(), 'The workflow left its allocated bootstrap session behind'
        else:
            assert result.returncode != 0
            assert session.exists(), 'Unverified CLI must not authorize cleanup'
            assert 'UNVERIFIED_CLI_EXECUTED' not in result.stdout + result.stderr
            assert 'DEV allocator unavailable or corrupt' not in result.stderr, 'An invalid designated CLI must not fall back to the adapter'
    finally:
        if session.exists():
            # RED also cleans only this fresh synthetic session, using its
            # actual verified CLI and marker; never remove the inherited one.
            cli.write_bytes(canonical_source)
            real_run(['node', str(cli), '--cleanup', str(session), '--context', published['NETCIRCUIT_ARTIFACTS_CONTEXT']],
                     env=cleanup_environment, check=True, capture_output=True, text=True)


@pytest.mark.parametrize('name', sorted(path.name for path in (ROOT / '.github/workflows').glob('*.yml')))
def test_every_root_workflow_uses_shared_bootstrap_safe_owned_cleanup(name):
    data = yaml.safe_load((ROOT / '.github/workflows' / name).read_text(encoding='utf-8'))
    for job_name, job in data['jobs'].items():
        cleanup = [step for step in job['steps'] if '--cleanup' in step.get('run', '')]
        assert len(cleanup) == 1, (name, job_name)
        assert cleanup[0]['run'] == 'node scripts/cleanup-artifact-session.mjs --cleanup "$NETCIRCUIT_ARTIFACTS_SESSION"'
        assert 'always()' in cleanup[0]['if'], (name, job_name)
        assert not cleanup[0].get('continue-on-error', False)
