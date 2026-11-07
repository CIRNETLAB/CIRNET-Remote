"""A complete release lock is checked before bootstrap, downloads or installs."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
from zipfile import ZipFile

import pytest


@pytest.mark.parametrize('public_downloads', [False, True])
def test_ci_selection_overrides_stale_same_version_variables(monkeypatch, public_downloads):
    from scripts import system_release_manifest
    selected = release()
    monkeypatch.setenv('CIRNET_CONTRACTS_WHEEL_URL', 'https://example.invalid/stale.whl')
    monkeypatch.setenv('CIRNET_HARDWARE_WHEEL_SHA256', 'f' * 64)
    select = getattr(system_release_manifest, 'ci_environment', None)
    assert callable(select), 'CI dependencies must derive from the committed system lock before bootstrap.'
    environment = select(selected, public_downloads=public_downloads)
    for component, kind, prefix in (
        ('Contracts', 'python', 'CIRNET_CONTRACTS_WHEEL'),
        ('Contracts', 'dev', 'CIRNET_CONTRACTS_DEV_WHEEL'),
        ('Contracts', 'npm', 'CIRNET_CONTRACTS_NPM'),
        ('Contracts', 'sdist', 'CIRNET_CONTRACTS_SDIST'),
        ('Contracts', 'dev_npm', 'CIRNET_ARTIFACT_PATHS_NPM'),
        ('Simulator', 'python', 'CIRNET_SIMULATOR_WHEEL'),
        ('Hardware', 'python', 'CIRNET_HARDWARE_WHEEL'),
        ('FPGA', 'source', 'CIRNET_FPGA_ARTIFACT'),
    ):
        product = selected['repositories'][component]
        artifact = product['artifacts'][kind]
        expected_url = artifact['url']
        if public_downloads:
            expected_url = f"{product['repository']}/releases/download/{product['releaseTag']}/{artifact['filename']}"
        assert environment[prefix + '_URL'] == expected_url
        assert environment[prefix + '_SHA256'] == artifact['sha256']
        assert environment[prefix + '_FILENAME'] == artifact['filename']
    invalid = release()
    invalid['repositories']['Hardware']['artifacts']['python']['url'] = 'https://example.invalid/stale.whl'
    with pytest.raises(ValueError):
        select(invalid)


def release():
    from scripts.system_release_manifest import FILENAMES, PRODUCT_VERSIONS, ROLLBACK_POLICY
    repositories = {}
    asset = 100
    for component, entries in FILENAMES.items():
        slug = f'cirnetlab/cirnet-{component.lower()}'
        version = PRODUCT_VERSIONS[component]
        tag = 'v0.1.4' if component == 'Remote' else f'v{version}'
        artifacts = {}
        for kind, filename in entries.items():
            asset += 1
            artifacts[kind] = {'filename': filename, 'url': f'https://api.github.com/repos/{slug}/releases/assets/{asset}', 'sha256': 'a' * 64}
        repositories[component] = {
            'repository': 'https://github.com/' + slug, 'version': version,
            'releaseTag': tag, 'releaseTitle': slug.split('/')[1] + '-' + tag,
            'sourceRevision': 'b' * 40, 'artifacts': artifacts,
        }
    return {'schemaVersion': 1, 'releaseVersion': '0.1.4', 'repositories': repositories,
            'integration': {'repository': repositories['Remote']['repository'], 'version': '0.1.4', 'sourceRevision': 'f' * 40},
            'compatibility': {'contractsVersion': '0.1.2', 'hardwareRpcVersion': '2.0', 'fpgaLogicalProtocolVersion': '1.0-scaffold', 'fpgaRegisterMapVersion': '1.0-reserved', 'sameOrigin': True, 'apiSchedulerProcesses': 1, 'hardwareRpcScope': 'local-only'},
            'rollback': dict(ROLLBACK_POLICY)}


def test_current_system_release_keeps_exact_product_and_independent_dev_versions():
    from scripts.system_release_manifest import validate_manifest
    value = release()
    assert validate_manifest(value) is value
    assert value['repositories']['Contracts']['artifacts']['npm']['filename'] == 'cirnet-contracts-0.1.2.tgz'
    assert value['repositories']['Contracts']['artifacts']['dev']['filename'] == 'cirnet_artifact_paths-1.0.0a1-py3-none-any.whl'
    assert value['repositories']['Interface']['releaseTitle'] == 'cirnet-interface-v0.1.4'
    assert value['repositories']['Remote']['releaseTitle'] == 'cirnet-remote-v0.1.4'


@pytest.mark.parametrize('version', ['0.1.1', '0.1.2', '0.1.3'])
def test_previous_system_manifests_are_not_accepted(version):
    from scripts.system_release_manifest import validate_manifest
    value = release()
    value['releaseVersion'] = version
    with pytest.raises(ValueError, match='only system release'):
        validate_manifest(value)


def test_asset_route_cannot_identify_multiple_artifacts():
    from scripts.system_release_manifest import validate_manifest
    value = release()
    assets = value['repositories']['Remote']['artifacts']
    assets['sdist']['url'] = assets['python']['url']
    with pytest.raises(ValueError, match='cannot identify multiple artifacts'):
        validate_manifest(value)


@pytest.mark.parametrize('failure', ['missing-integration', 'wrong-integration-version', 'wrong-integration-revision', 'wrong-integration-owner', 'wrong-title', 'wrong-tag'])
def test_system_requires_exact_integration_and_publish_identity(failure):
    from scripts.system_release_manifest import validate_manifest
    value = release()
    if failure == 'missing-integration':
        value.pop('integration')
    elif failure == 'wrong-integration-version':
        value['integration']['version'] = '0.1.3'
    elif failure == 'wrong-integration-revision':
        value['integration']['sourceRevision'] = 'master'
    elif failure == 'wrong-integration-owner':
        value['integration']['repository'] = value['repositories']['Contracts']['repository']
    elif failure == 'wrong-title':
        value['repositories']['Remote']['releaseTitle'] = 'Remote'
    else:
        value['repositories']['Remote']['releaseTag'] = 'v0.1.2'
    with pytest.raises(ValueError):
        validate_manifest(value)


@pytest.mark.parametrize('state_version,manifest_version', [('0.1.4', '0.1.4'), ('0.1.3', '0.1.4'), ('0.1.4', '0.1.3')])
def test_rollback_state_is_bound_to_exact_system_release_version(tmp_path, state_version, manifest_version):
    from scripts.check_release_rollback import load_environment
    state, path = saved_environment(tmp_path)
    state['releaseVersion'] = state_version
    manifest = Path(state['manifest'])
    value = release()
    value['releaseVersion'] = manifest_version
    manifest.write_text(json.dumps(value), encoding='utf-8')
    state['manifestSha256'] = hashlib.sha256(manifest.read_bytes()).hexdigest()
    path.write_text(json.dumps(state), encoding='utf-8')
    if state_version == manifest_version:
        assert load_environment(path)['releaseVersion'] == state_version
    else:
        with pytest.raises(ValueError):
            load_environment(path)


@pytest.mark.parametrize('failure', ['missing-owner', 'wrong-version', 'missing-artifact', 'wrong-revision', 'legacy-namespace', 'latest-url', 'tag-url', 'wrong-asset-owner', 'credential-url', 'query-url', 'missing-digest', 'path-filename', 'wrong-filename', 'unsafe-compatibility', 'unsafe-rollback', 'missing-rollback-owner'])
def test_invalid_system_set_cannot_reach_bootstrap(tmp_path, monkeypatch, failure):
    from scripts import install_release
    value = release()
    artifact = value['repositories']['Contracts']['artifacts']['python']
    if failure == 'missing-owner': del value['repositories']['FPGA']
    elif failure == 'wrong-version': value['repositories']['Hardware']['version'] = '0.2.0'
    elif failure == 'missing-artifact': del value['repositories']['Interface']['artifacts']['static']
    elif failure == 'wrong-revision': value['repositories']['Simulator']['sourceRevision'] = 'master'
    elif failure == 'legacy-namespace': value['repositories']['Remote']['repository'] = 'https://github.com/net-Circuit-Remote/net-Circuit-Remote'
    elif failure == 'latest-url': artifact['url'] = 'https://github.com/cirnetlab/cirnet-contracts/releases/latest/download/example.whl'
    elif failure == 'tag-url': artifact['url'] = 'https://github.com/cirnetlab/cirnet-contracts/releases/download/v0.1.1/' + artifact['filename']
    elif failure == 'wrong-asset-owner': artifact['url'] = 'https://api.github.com/repos/cirnetlab/cirnet-hardware/releases/assets/100'
    elif failure == 'credential-url': artifact['url'] = 'https://secret@api.github.com/repos/cirnetlab/cirnet-contracts/releases/assets/100'
    elif failure == 'query-url': artifact['url'] += '?token=secret'
    elif failure == 'missing-digest': artifact.pop('sha256')
    elif failure == 'path-filename': artifact['filename'] = '../' + artifact['filename']
    elif failure == 'wrong-filename': artifact['filename'] = 'netcircuit_contracts-1.0.1-py3-none-any.whl'
    elif failure == 'unsafe-compatibility': value['compatibility']['apiSchedulerProcesses'] = 2
    elif failure == 'unsafe-rollback': value['rollback']['automaticStartReplay'] = True
    elif failure == 'missing-rollback-owner': value['rollback'].pop('matchingCaptureBackupRequired')
    path = tmp_path / 'release.json'; path.write_text(json.dumps(value), encoding='utf-8')
    monkeypatch.setattr(install_release, '_bootstrap', lambda *args, **kwargs: pytest.fail('invalid set reached bootstrap'))
    with pytest.raises(ValueError):
        install_release.install(path, tmp_path / 'environment.json')


def test_duplicate_manifest_properties_are_rejected(tmp_path):
    from scripts.system_release_manifest import load_manifest
    path = tmp_path / 'release.json'; path.write_text('{"schemaVersion":1,"schemaVersion":1}')
    with pytest.raises(ValueError, match='Duplicate'):
        load_manifest(path)


def archive_bytes(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        for name, contents in entries:
            member = tarfile.TarInfo(name); member.size = len(contents)
            archive.addfile(member, io.BytesIO(contents))
    return output.getvalue()


@pytest.mark.parametrize('entries', [[('../escape', b'x')], [('A/file', b'x'), ('a/other', b'y')], [('same', b'x'), ('same', b'y')], [('parent', b'x'), ('parent/child', b'y')], [('NUL.txt', b'x')], [('.git/HEAD', b'x')]])
def test_release_archives_reject_escape_windows_aliases_and_colliding_targets(entries):
    from scripts.install_release import _checked_tar
    with pytest.raises(ValueError):
        _checked_tar(archive_bytes(entries))


def test_package_archives_check_real_metadata_instead_of_renamed_filenames(tmp_path):
    from scripts.install_release import verify_package_archive
    sdist = tmp_path / 'cirnet_simulator-0.1.2.tar.gz'
    sdist.write_bytes(archive_bytes([('cirnet_simulator-0.1.2/PKG-INFO', b'Name: cirnet-simulator\nVersion: 0.2.0\n')]))
    with pytest.raises(ValueError, match='identity'):
        verify_package_archive(sdist, 'cirnet-simulator', '0.1.2')
    npm = tmp_path / 'cirnet-contracts-0.1.2.tgz'
    npm.write_bytes(archive_bytes([('package/package.json', b'{"name":"@cirnet/contracts","version":"0.1.2"}')]))
    assert verify_package_archive(npm, '@cirnet/contracts', '0.1.2', npm=True) == npm


def test_api_wheel_requires_actual_version_and_keeps_hardware_out_of_process(tmp_path):
    from scripts.install_release import verify_api_wheel
    path = tmp_path / 'cirnet_api-0.1.2-py3-none-any.whl'
    for version, extra in [('0.2.0', ''), ('0.1.2', 'Requires-Dist: cirnet-hardware-service==0.1.2\n'), ('0.1.2', '')]:
        with ZipFile(path, 'w') as archive:
            archive.writestr('app/__init__.py', '')
            archive.writestr('cirnet_api-0.1.2.dist-info/METADATA', f'Name: cirnet-api\nVersion: {version}\nRequires-Dist: cirnet-contracts==0.1.2\nRequires-Dist: cirnet-simulator==0.1.2\n' + extra)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if version != '0.1.2' or extra:
            with pytest.raises(ValueError): verify_api_wheel(path, digest)
        else:
            assert verify_api_wheel(path, digest) == path


def test_static_product_requires_exact_committed_source_identity(tmp_path):
    from scripts.install_release import _extract_static
    value = release()
    identity = {'name': 'cirnet-interface', 'kind': 'static', 'version': '0.1.4', 'contractsVersion': '0.1.2', 'sourceFingerprint': 'f' * 64,
                'source': {'repository': value['repositories']['Interface']['repository'] + '.git', 'revision': 'a' * 40, 'uncommittedMigration': False}}
    path = tmp_path / 'static.tar.gz'
    pages = [(name, b'<html>real release page</html>') for name in ('index.html', 'oscilloscope-preview.html', 'function-generator-preview.html')]
    path.write_bytes(archive_bytes([*pages, ('interface-artifact.json', json.dumps(identity).encode())]))
    with pytest.raises(ValueError, match='provenance'):
        _extract_static(path, tmp_path / 'product', value, identity)
    assert not (tmp_path / 'product').exists()
    identity['source']['revision'] = value['repositories']['Interface']['sourceRevision']
    path.write_bytes(archive_bytes([*pages, ('interface-artifact.json', json.dumps(identity).encode())]))
    assert _extract_static(path, tmp_path / 'product', value, identity) == tmp_path / 'product'
    assert (tmp_path / 'product/index.html').read_bytes() == pages[0][1]


def test_rollback_plan_registers_real_postgres_package_and_no_replay_checks_without_execution():
    from scripts.check_release_rollback import verification_plan, REPLAY
    commands = verification_plan(Path('ALLOCATOR_OWNED_RUNTIME'))
    assert commands[0]['command'][commands[0]['command'].index('-q') + 1] == 'services/api/tests/postgres_cases.py'
    assert any('check_contract_package.py' in part for part in commands[2]['command'])
    for selected in REPLAY:
        source, name = selected.split('::')
        assert 'def ' + name + '(' in Path(source).read_text(encoding='utf-8')
    assert any('without_replaying_start' in selected for selected in REPLAY)
    assert any('quarantine' in selected for selected in REPLAY)


def test_api_selected_archive_probe_detects_stale_same_version_bytes_and_wrong_digest(tmp_path):
    from scripts.install_release import API_INSTALL_PROBE
    virtualenv = tmp_path / 'isolated-api'
    subprocess.run([sys.executable, '-B', '-m', 'venv', '--without-pip', str(virtualenv)], check=True, capture_output=True)
    python = virtualenv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    location = subprocess.run([str(python), '-I', '-c', "import sysconfig; print(sysconfig.get_path('purelib'))"], check=True, capture_output=True, text=True)
    site = Path(location.stdout.strip())
    wheel = tmp_path / 'cirnet_api-0.1.2-py3-none-any.whl'
    payload = {'app/__init__.py': b"IDENTITY='selected-release'\n", 'cirnet_api-0.1.2.dist-info/METADATA': b'Name: cirnet-api\nVersion: 0.1.2\n'}
    with ZipFile(wheel, 'w') as archive:
        for name, contents in payload.items(): archive.writestr(name, contents)
    digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    for name, contents in payload.items():
        destination = site / name; destination.parent.mkdir(parents=True, exist_ok=True); destination.write_bytes(contents)
    direct = site / 'cirnet_api-0.1.2.dist-info/direct_url.json'
    direct.write_text(json.dumps({'url': wheel.as_uri(), 'archive_info': {'hashes': {'sha256': digest}}}), encoding='utf-8')
    command = [str(python), '-B', '-I', '-c', API_INSTALL_PROBE, str(wheel), digest]
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)['version'] == '0.1.2'
    (site / 'app/__init__.py').write_bytes(b"IDENTITY='stale-same-version-release'\n")
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode != 0 and 'bytes differ' in result.stderr
    (site / 'app/__init__.py').write_bytes(payload['app/__init__.py'])
    direct.write_text(json.dumps({'url': wheel.as_uri(), 'archive_info': {'hashes': {'sha256': '0' * 64}}}), encoding='utf-8')
    result = subprocess.run(command, capture_output=True, text=True)
    assert result.returncode != 0 and 'archive digest differs' in result.stderr


def test_rollback_gate_cannot_count_a_skipped_database_test_as_pass(tmp_path, monkeypatch):
    from scripts import check_release_rollback
    from scripts import artifact_paths
    monkeypatch.setenv('CIRNET_TEST_POSTGRES_URL', 'postgresql://unit-test-not-contacted/unit')
    process = {'TMP': str(tmp_path), 'TEMP': str(tmp_path), 'TMPDIR': str(tmp_path), 'PIP_CACHE_DIR': str(tmp_path / 'pip-cache'),
               'npm_config_cache': str(tmp_path / 'npm-cache'), 'PYTHONDONTWRITEBYTECODE': '1'}
    for key in process:
        monkeypatch.setenv(key, 'inherited-output-must-be-replaced')
    monkeypatch.setattr(check_release_rollback, 'load_environment', lambda path: {'releaseVersion': '0.1.4', 'environment': {}, 'processEnvironment': process})
    monkeypatch.setattr(artifact_paths, 'artifact_directory', lambda child: tmp_path)
    def skipped(command, **kwargs):
        child_environment = {key.casefold(): value for key, value in kwargs['env'].items()}
        for key, value in process.items():
            assert child_environment[key.casefold()] == value
        report = Path(command[command.index('--junitxml') + 1])
        report.write_text('<testsuites><testsuite><testcase><skipped/></testcase></testsuite></testsuites>', encoding='utf-8')
        return subprocess.CompletedProcess(command, 0)
    monkeypatch.setattr(check_release_rollback.subprocess, 'run', skipped)
    report, path = check_release_rollback.run(tmp_path / 'unused-environment.json')
    assert report['gateStatus'] == 'FAIL'
    assert report['releaseVersion'] == '0.1.4'
    assert [gate['status'] for gate in report['registeredGates']] == ['FAIL', 'NOT_RUN', 'NOT_RUN']
    assert report['registeredGates'][0]['skippedTests'] == 1
    assert report['fullPriorArtifactRollbackRehearsal'] == 'NOT_RUN'


def test_selected_contracts_manifest_hands_all_five_artifacts_to_interface(tmp_path):
    from scripts.install_release import _write_selected_manifests
    value = release()
    local = {component: {kind: tmp_path / component / selected['filename'] for kind, selected in product['artifacts'].items()}
             for component, product in value['repositories'].items()}
    manifests = _write_selected_manifests(value, local, tmp_path)
    selected = json.loads(manifests['Contracts'].read_text(encoding='utf-8'))
    assert set(selected) == {'schemaVersion', 'python', 'npm', 'sdist', 'dev', 'dev_npm'}
    for kind in ('python', 'npm', 'sdist', 'dev', 'dev_npm'):
        assert Path(selected[kind]['path']) == local['Contracts'][kind]
        assert selected[kind]['sha256'] == value['repositories']['Contracts']['artifacts'][kind]['sha256']


def test_generated_contracts_command_passes_the_real_selector_parser_before_pip(tmp_path, monkeypatch):
    from importlib.metadata import PackageNotFoundError
    from scripts import install_release, install_contracts
    path = tmp_path / 'cirnet_contracts-0.1.2-py3-none-any.whl'
    with ZipFile(path, 'w') as archive:
        archive.writestr('cirnet_contracts-0.1.2.dist-info/METADATA', 'Name: cirnet-contracts\nVersion: 0.1.2\n')
    value = release()
    value['repositories']['Contracts']['artifacts']['python']['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    command = install_release._component_install_command('Contracts', 'install_contracts.py', value, {'Contracts': {'python': path}})
    for name, contents in {'CIRNET_CONTRACTS_WHEEL_URL': 'https://invalid.example/inherited.whl', 'CIRNET_CONTRACTS_WHEEL_SHA256': '0' * 64,
                           'CIRNET_CONTRACTS_WHEEL_FILENAME': 'inherited.whl', 'CIRNET_CONTRACTS_NPM_URL': 'https://invalid.example/inherited.tgz'}.items():
        monkeypatch.setenv(name, contents)
    monkeypatch.setattr(install_contracts, 'download_artifact', lambda *args, **kwargs: pytest.fail('local wheel selection reached network'))
    monkeypatch.setattr(install_contracts.subprocess, 'run', lambda *args, **kwargs: pytest.fail('selector test reached pip'))
    # The release workflow invokes the generated command in a fresh venv.
    def fresh_environment():
        raise PackageNotFoundError
    monkeypatch.setattr(install_contracts, 'installed_contracts', fresh_environment)
    class SelectedWheelValidated(Exception): pass
    def before_pip(subdirectory):
        assert subdirectory == 'pip-cache'
        raise SelectedWheelValidated()
    monkeypatch.setattr(install_contracts, 'artifact_directory', before_pip)
    # Executes argparse and the real wheel digest/name/version checks. The old
    # empty --url alongside --wheel fails mutual exclusion before this barrier.
    with pytest.raises(SelectedWheelValidated):
        install_contracts.main(command[3:])


def saved_environment(tmp_path):
    from scripts.artifact_paths import artifact_context, artifact_directory
    if os.environ.get('CIRNET_ARTIFACTS_SESSION') and os.environ.get('CIRNET_ARTIFACTS_CONTEXT'):
        session = Path(os.environ['CIRNET_ARTIFACTS_SESSION'])
        context = json.loads(os.environ['CIRNET_ARTIFACTS_CONTEXT'])
    else:
        session = artifact_directory()
        context = artifact_context()
    manifest = tmp_path / 'release.json'; manifest.write_text(json.dumps(release()), encoding='utf-8')
    temporary = tmp_path / 'tmp'; temporary.mkdir()
    pip_cache = tmp_path / 'pip-cache'; pip_cache.mkdir()
    npm_cache = tmp_path / 'npm-cache'; npm_cache.mkdir()
    environment = {name: str(tmp_path / name) for name in ('CIRNET_CONTRACTS_ARTIFACT_MANIFEST', 'CIRNET_SIMULATOR_ARTIFACT_MANIFEST', 'CIRNET_HARDWARE_ARTIFACT_MANIFEST',
                   'CIRNET_FPGA_ARTIFACT_MANIFEST', 'CIRNET_INTERFACE_ROOT', 'CIRNET_FPGA_ROOT')}
    environment.update(CIRNET_ARTIFACTS_SESSION=str(session), CIRNET_ARTIFACTS_CONTEXT=json.dumps(context))
    state = {'schemaVersion': 1, 'releaseVersion': '0.1.4', 'python': sys.executable, 'manifest': str(manifest), 'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
             'environment': environment, 'processEnvironment': {'TMP': str(temporary), 'TEMP': str(temporary), 'TMPDIR': str(temporary), 'PIP_CACHE_DIR': str(pip_cache),
                                                                'npm_config_cache': str(npm_cache), 'PYTHONDONTWRITEBYTECODE': '1'}}
    path = tmp_path / 'environment.json'; path.write_text(json.dumps(state), encoding='utf-8')
    return state, path


def test_saved_release_environment_preserves_validated_parent_output_containment(tmp_path):
    from scripts.check_release_rollback import load_environment
    state, path = saved_environment(tmp_path)
    before = {key: os.environ.get(key) for key in state['processEnvironment']}
    assert load_environment(path)['processEnvironment'] == state['processEnvironment']
    assert {key: os.environ.get(key) for key in before} == before


@pytest.mark.parametrize('failure', ['missing', 'extra', 'bytecode', 'relative', 'repository', 'outside-session', 'missing-directory'])
def test_saved_release_environment_rejects_missing_or_escaping_process_outputs(tmp_path, failure):
    from scripts.check_release_rollback import load_environment, ROOT
    state, path = saved_environment(tmp_path)
    process = state['processEnvironment']
    if failure == 'missing': process.pop('npm_config_cache')
    elif failure == 'extra': process['CIRNET_ARTIFACTS_TOKEN'] = 'not-a-real-credential'
    elif failure == 'bytecode': process['PYTHONDONTWRITEBYTECODE'] = '0'
    elif failure == 'relative': process['TMP'] = 'relative-output'
    elif failure == 'repository': process['TMP'] = str(ROOT)
    elif failure == 'outside-session': process['TMP'] = str(Path(state['environment']['CIRNET_ARTIFACTS_SESSION']).parent)
    elif failure == 'missing-directory': process['TMP'] = str(tmp_path / 'not-created')
    path.write_text(json.dumps(state), encoding='utf-8')
    with pytest.raises((ValueError, RuntimeError)):
        load_environment(path)


def test_manual_installer_entry_does_not_compile_own_modules_before_bootstrap(tmp_path):
    from scripts import install_release
    scripts = tmp_path / 'runtime/scripts'; scripts.mkdir(parents=True)
    for name in ('install_release.py', 'system_release_manifest.py', 'artifact_download.py', 'environment.py'):
        (scripts / name).write_bytes((install_release.ROOT / 'scripts' / name).read_bytes())
    environment = {name: value for name, value in os.environ.items() if name not in {'PYTHONDONTWRITEBYTECODE', 'PYTHONPATH', 'PYTHONHOME'}}
    result = subprocess.run([sys.executable, str(scripts / 'install_release.py'), '--help'], cwd=scripts.parent, env=environment, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert '--environment-file' in result.stdout
    assert not list(scripts.rglob('*.pyc'))
