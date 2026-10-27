"""M3 consumes an identified wheel and never the retained Simulator source."""
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
MODULES = ('__init__.py', 'analog.py', 'backends.py', 'circuit.py', 'dispatch.py', 'engine.py', 'logic.py', 'nets.py', 'waveform.py')


def consumer():
    path = ROOT / 'scripts/simulator_artifact.py'
    assert path.is_file(), 'M3 Simulator artifact selector is missing'
    spec = importlib.util.spec_from_file_location('simulator_artifact', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def wheel(tmp_path, *, name='netcircuit-simulator', version='0.2.0', contracts='1.0.1', missing=None):
    path = tmp_path / 'netcircuit_simulator-0.2.0-py3-none-any.whl'
    with ZipFile(path, 'w') as archive:
        for module in MODULES:
            if module != missing:
                archive.writestr('netcircuit_sim/' + module, '')
        archive.writestr('netcircuit_simulator-0.2.0.dist-info/METADATA',
            f'Metadata-Version: 2.1\nName: {name}\nVersion: {version}\nRequires-Dist: netcircuit-contracts=={contracts}\nRequires-Dist: jsonschema==4.26.0\n')
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def test_manifest_selects_exact_identity_digest_and_dependency(tmp_path, monkeypatch):
    artifact, digest = wheel(tmp_path)
    manifest = tmp_path / 'artifacts.json'
    manifest.write_text(json.dumps({'schemaVersion': 1, 'python': {'path': str(artifact), 'sha256': digest}}), encoding='utf-8')
    monkeypatch.setenv('NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST', str(manifest))
    selected = consumer()
    assert selected.selected_wheel_details() == (artifact, digest)
    assert selected.selected_wheel() == artifact


@pytest.mark.parametrize('change,reason', [
    ({'name': 'different'}, 'netcircuit-simulator'),
    ({'version': '0.1.1'}, '0.2.0'),
    ({'contracts': '1.0.0'}, 'Contracts'),
    ({'missing': 'engine.py'}, 'engine.py'),
])
def test_wheel_rejects_wrong_identity_dependency_or_missing_runtime(tmp_path, change, reason):
    artifact, digest = wheel(tmp_path, **change)
    with pytest.raises(ValueError, match=reason):
        consumer().verify_wheel(artifact, digest)


def test_selection_has_no_latest_or_source_fallback_and_checks_digest(tmp_path, monkeypatch):
    selected = consumer()
    monkeypatch.delenv('NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST', raising=False)
    with pytest.raises(ValueError, match='NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST'):
        selected.selected_wheel()
    artifact, digest = wheel(tmp_path)
    with pytest.raises(ValueError, match='SHA256'):
        selected.verify_wheel(artifact, '0' * 64)
    with pytest.raises(ValueError, match='absolute'):
        selected.verify_wheel(Path(artifact.name), digest)


def fake_install(tmp_path, *, version='0.2.0', editable=False, tampered=False, source_metadata=False):
    installed = tmp_path / 'site'
    package = installed / 'netcircuit_sim'
    package.mkdir(parents=True)
    records = []
    for module in MODULES:
        value = b''
        (package / module).write_bytes(value)
        digest = base64.urlsafe_b64encode(hashlib.sha256(value).digest()).rstrip(b'=').decode()
        records.append(f'netcircuit_sim/{module},sha256={digest},0')
    metadata = installed / f'netcircuit_simulator-{version}.dist-info'
    metadata.mkdir()
    (metadata / 'METADATA').write_text(f'Name: netcircuit-simulator\nVersion: {version}\n', encoding='utf-8')
    (metadata / 'RECORD').write_text('\n'.join(records), encoding='utf-8')
    if not source_metadata:
        (metadata / 'WHEEL').write_text('Wheel-Version: 1.0\n', encoding='utf-8')
    if editable:
        (metadata / 'direct_url.json').write_text(json.dumps({'url': package.as_uri(), 'dir_info': {'editable': True}}), encoding='utf-8')
    if tampered:
        (package / 'engine.py').write_text('# changed\n', encoding='utf-8')
    return installed


def installed_probe(tmp_path, installed, *, shadow=False):
    consumer()
    cwd = tmp_path / 'cwd'
    cwd.mkdir()
    if shadow:
        package = cwd / 'netcircuit_sim'
        package.mkdir()
        (package / '__init__.py').write_text('', encoding='utf-8')
    environment = {key: value for key, value in os.environ.items()
        if key not in {'PYTHONPATH', 'PYTHONHOME', 'NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST'}}
    return subprocess.run([sys.executable, '-S', '-c',
        "import sys,site,importlib.util; site.addsitedir(sys.argv[1]); "
        "spec=importlib.util.spec_from_file_location('simulator_artifact',sys.argv[2]); "
        "module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module); "
        "print(module.installed_provenance())", str(installed), str(ROOT / 'scripts/simulator_artifact.py')],
        cwd=cwd, env=environment, capture_output=True, text=True)


def test_installed_wheel_passes_real_metadata_record_and_import_checks(tmp_path):
    result = installed_probe(tmp_path, fake_install(tmp_path))
    assert result.returncode == 0, result.stdout + result.stderr
    assert '0.2.0' in result.stdout


@pytest.mark.parametrize('options,shadow,reason', [
    ({'version': '0.1.1'}, False, '0.2.0'),
    ({'editable': True}, False, 'editable'),
    ({'tampered': True}, False, 'RECORD'),
    ({'source_metadata': True}, False, 'source egg-info'),
    ({}, True, 'shadow'),
])
def test_old_editable_tampered_or_shadowed_installation_fails(tmp_path, options, shadow, reason):
    result = installed_probe(tmp_path, fake_install(tmp_path, **options), shadow=shadow)
    assert result.returncode != 0
    assert reason in result.stderr, result.stderr


def test_consumers_pin_one_simulator_and_default_collection_excludes_retained_units():
    for relative in ('pyproject.toml', 'services/api/pyproject.toml', 'services/hardware-service/pyproject.toml'):
        metadata = tomllib.loads((ROOT / relative).read_text(encoding='utf-8'))
        assert 'netcircuit-simulator==0.2.0' in metadata['project']['dependencies'], relative
    root = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))
    assert 'simulator/circuit-simulator' in root['tool']['pytest']['ini_options']['norecursedirs']
    lock = json.loads((ROOT / 'integration/simulator-version.json').read_text(encoding='utf-8'))
    assert lock['python'] == {'name': 'netcircuit-simulator', 'version': '0.2.0'}
    assert lock['contracts'] == {'name': 'netcircuit-contracts', 'version': '1.0.1'}


def test_default_pytest_discovery_never_imports_the_retained_simulator_tree(tmp_path):
    retained = tmp_path / 'simulator/circuit-simulator'
    retained.mkdir(parents=True)
    (retained / 'test_legacy.py').write_text("raise AssertionError('retained Simulator source imported')\n", encoding='utf-8')
    (tmp_path / 'test_current.py').write_text('def test_current(): pass\n', encoding='utf-8')
    environment = {key: value for key, value in os.environ.items() if key != 'PYTEST_ADDOPTS'}
    result = subprocess.run([sys.executable, '-B', '-m', 'pytest', '--collect-only', '-q',
        '-c', str(ROOT / 'pyproject.toml'), '--basetemp', str(tmp_path / 'pytest')],
        cwd=tmp_path, env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'test_current.py::test_current' in result.stdout
    assert 'test_legacy.py' not in result.stdout
