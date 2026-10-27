"""M4 consumes an identified wheel and never the retained Hardware source."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tomllib
from zipfile import ZipFile

import pytest

ROOT = Path(__file__).resolve().parents[2]
MODULES = ('__init__.py', 'fpga_transport.py', 'models.py', 'rpc.py', 'server.py', 'station/__init__.py', 'station/base.py', 'station/physical.py', 'station/virtual.py')


def consumer():
    path = ROOT / 'scripts/hardware_artifact.py'
    assert path.is_file(), 'M4 Hardware artifact selector is missing'
    spec = importlib.util.spec_from_file_location('hardware_artifact', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def wheel(tmp_path, *, name='netcircuit-hardware-service', version='0.1.1', contracts='1.0.1', simulator='0.2.0', grpcio='1.84.0', protobuf='7.36.2', jsonschema='4.26.0', missing=None):
    path = tmp_path / 'netcircuit_hardware_service-0.1.1-py3-none-any.whl'
    with ZipFile(path, 'w') as archive:
        for module in MODULES:
            if module != missing:
                archive.writestr('hardware_service/' + module, '')
        archive.writestr('netcircuit_hardware_service-0.1.1.dist-info/METADATA',
            f'Metadata-Version: 2.1\nName: {name}\nVersion: {version}\nRequires-Dist: netcircuit-contracts=={contracts}\nRequires-Dist: netcircuit-simulator=={simulator}\nRequires-Dist: grpcio=={grpcio}\nRequires-Dist: protobuf=={protobuf}\nRequires-Dist: jsonschema=={jsonschema}\n')
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def test_manifest_selects_exact_identity_digest_and_dependency(tmp_path, monkeypatch):
    artifact, digest = wheel(tmp_path)
    manifest = tmp_path / 'artifacts.json'
    manifest.write_text(json.dumps({'schemaVersion': 1, 'python': {'path': str(artifact), 'sha256': digest}}), encoding='utf-8')
    monkeypatch.setenv('NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST', str(manifest))
    selected = consumer()
    assert selected.selected_wheel_details() == (artifact, digest)
    assert selected.selected_wheel() == artifact


@pytest.mark.parametrize('change,reason', [
    ({'name': 'different'}, 'netcircuit-hardware-service'),
    ({'version': '0.1.0'}, '0.1.1'),
    ({'contracts': '1.0.0'}, 'Contracts'),
    ({'missing': 'rpc.py'}, 'rpc.py'),
    ({'simulator': '0.1.1'}, 'Simulator'),
    ({'grpcio': '1.83.0'}, 'grpcio'),
    ({'protobuf': '7.35.0'}, 'protobuf'),
    ({'jsonschema': '4.25.0'}, 'jsonschema'),
])
def test_wheel_rejects_wrong_identity_dependency_or_missing_runtime(tmp_path, change, reason):
    artifact, digest = wheel(tmp_path, **change)
    with pytest.raises(ValueError, match=reason):
        consumer().verify_wheel(artifact, digest)


def test_selection_has_no_latest_or_source_fallback_and_checks_digest(tmp_path, monkeypatch):
    selected = consumer()
    monkeypatch.delenv('NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST', raising=False)
    with pytest.raises(ValueError, match='NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST'):
        selected.selected_wheel()
    artifact, digest = wheel(tmp_path)
    with pytest.raises(ValueError, match='SHA256'):
        selected.verify_wheel(artifact, '0' * 64)
    with pytest.raises(ValueError, match='absolute'):
        selected.verify_wheel(Path(artifact.name), digest)


def fake_install(tmp_path, *, version='0.1.1', editable=False, tampered=False, source_metadata=False):
    installed = tmp_path / 'site'
    package = installed / 'hardware_service'
    package.mkdir(parents=True)
    records = []
    for module in MODULES:
        value = b''
        (package / module).parent.mkdir(parents=True, exist_ok=True)
        (package / module).write_bytes(value)
        digest = base64.urlsafe_b64encode(hashlib.sha256(value).digest()).rstrip(b'=').decode()
        records.append(f'hardware_service/{module},sha256={digest},0')
    metadata = installed / f'netcircuit_hardware_service-{version}.dist-info'
    metadata.mkdir()
    (metadata / 'METADATA').write_text(f'Name: netcircuit-hardware-service\nVersion: {version}\n', encoding='utf-8')
    (metadata / 'RECORD').write_text('\n'.join(records), encoding='utf-8')
    if not source_metadata:
        (metadata / 'WHEEL').write_text('Wheel-Version: 1.0\n', encoding='utf-8')
    if editable:
        (metadata / 'direct_url.json').write_text(json.dumps({'url': package.as_uri(), 'dir_info': {'editable': True}}), encoding='utf-8')
    if tampered:
        (package / 'rpc.py').write_text('# changed\n', encoding='utf-8')
    return installed


def installed_probe(tmp_path, installed, *, shadow=False):
    consumer()
    cwd = tmp_path / 'cwd'
    cwd.mkdir()
    if shadow:
        package = cwd / 'hardware_service'
        package.mkdir()
        (package / '__init__.py').write_text('', encoding='utf-8')
    environment = {key: value for key, value in os.environ.items()
        if key not in {'PYTHONPATH', 'PYTHONHOME', 'NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST'}}
    return subprocess.run([sys.executable, '-S', '-c',
        "import sys,site,importlib.util; site.addsitedir(sys.argv[1]); "
        "spec=importlib.util.spec_from_file_location('hardware_artifact',sys.argv[2]); "
        "module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module); "
        "print(module.installed_provenance())", str(installed), str(ROOT / 'scripts/hardware_artifact.py')],
        cwd=cwd, env=environment, capture_output=True, text=True)


def test_installed_wheel_passes_real_metadata_record_and_import_checks(tmp_path):
    result = installed_probe(tmp_path, fake_install(tmp_path))
    assert result.returncode == 0, result.stdout + result.stderr
    assert '0.1.1' in result.stdout


@pytest.mark.parametrize('options,shadow,reason', [
    ({'version': '0.1.0'}, False, '0.1.1'),
    ({'editable': True}, False, 'editable'),
    ({'tampered': True}, False, 'RECORD'),
    ({'source_metadata': True}, False, 'source egg-info'),
    ({}, True, 'shadow'),
])
def test_old_editable_tampered_or_shadowed_installation_fails(tmp_path, options, shadow, reason):
    result = installed_probe(tmp_path, fake_install(tmp_path, **options), shadow=shadow)
    assert result.returncode != 0
    assert reason in result.stderr, result.stderr


def test_consumers_pin_one_hardware_and_default_collection_excludes_retained_units():
    for relative in ('pyproject.toml',):
        metadata = tomllib.loads((ROOT / relative).read_text(encoding='utf-8'))
        assert 'netcircuit-hardware-service==0.1.1' in metadata['project']['dependencies'], relative
    root = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))
    assert 'services/hardware-service' in root['tool']['pytest']['ini_options']['norecursedirs']
    lock = json.loads((ROOT / 'integration/hardware-version.json').read_text(encoding='utf-8'))
    assert lock['python'] == {'name': 'netcircuit-hardware-service', 'version': '0.1.1'}
    assert lock['contracts'] == {'name': 'netcircuit-contracts', 'version': '1.0.1'}
    assert lock['simulator'] == {'name': 'netcircuit-simulator', 'version': '0.2.0'}
    api = tomllib.loads((ROOT / 'services/api/pyproject.toml').read_text(encoding='utf-8'))
    assert not any(value.startswith('netcircuit-hardware') for value in api['project']['dependencies'])


def test_default_pytest_discovery_never_imports_the_retained_hardware_tree(tmp_path):
    retained = tmp_path / 'services/hardware-service'
    retained.mkdir(parents=True)
    (retained / 'test_legacy.py').write_text("raise AssertionError('retained Hardware source imported')\n", encoding='utf-8')
    (tmp_path / 'test_current.py').write_text('def test_current(): pass\n', encoding='utf-8')
    environment = {key: value for key, value in os.environ.items() if key != 'PYTEST_ADDOPTS'}
    result = subprocess.run([sys.executable, '-B', '-m', 'pytest', '--collect-only', '-q',
        '-c', str(ROOT / 'pyproject.toml'), '--basetemp', str(tmp_path / 'pytest')],
        cwd=tmp_path, env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'test_current.py::test_current' in result.stdout
    assert 'test_legacy.py' not in result.stdout


def test_real_default_collection_excludes_frozen_hardware_tests(tmp_path):
    result = subprocess.run([sys.executable, '-B', '-m', 'pytest', '--collect-only', '-q',
        '--basetemp', str(tmp_path / 'collection')], cwd=ROOT, capture_output=True, text=True, timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'tests/integration/test_virtual_lab_execution.py::' in result.stdout
    assert 'services/hardware-service/tests/' not in result.stdout.replace('\\', '/')


def test_supported_integration_tests_never_add_retained_hardware_source():
    for directory in ('tests/integration', 'tests/fpga'):
        for path in (ROOT / directory).glob('*.py'):
            if path.name == 'test_repository_boundaries.py': continue
            value = path.read_text(encoding='utf-8')
            assert 'services/hardware-service' not in value, path
            assert 'generate_hardware_rpc.py' not in value, path


def test_unowned_installed_runtime_module_is_rejected(tmp_path):
    installed = fake_install(tmp_path)
    (installed / 'hardware_service/unowned.py').write_text('# source injection\n', encoding='utf-8')
    result = installed_probe(tmp_path, installed)
    assert result.returncode != 0
    assert 'inventory' in result.stderr


def test_wheel_rejects_unreviewed_runtime_module(tmp_path):
    artifact, _ = wheel(tmp_path)
    with ZipFile(artifact, 'a') as archive:
        archive.writestr('hardware_service/injected.py', '')
    with pytest.raises(ValueError, match='inventory'):
        consumer().verify_wheel(artifact, hashlib.sha256(artifact.read_bytes()).hexdigest())


def test_record_owned_but_unreviewed_installed_module_is_rejected_without_manifest(tmp_path):
    installed = fake_install(tmp_path)
    value = b'# unreviewed but correctly hashed\n'
    (installed / 'hardware_service/injected.py').write_bytes(value)
    digest = base64.urlsafe_b64encode(hashlib.sha256(value).digest()).rstrip(b'=').decode()
    record = installed / 'netcircuit_hardware_service-0.1.1.dist-info/RECORD'
    with record.open('a', encoding='utf-8') as output:
        output.write(f'\nhardware_service/injected.py,sha256={digest},{len(value)}\n')
    result = installed_probe(tmp_path, installed)
    assert result.returncode != 0
    assert 'inventory' in result.stderr
