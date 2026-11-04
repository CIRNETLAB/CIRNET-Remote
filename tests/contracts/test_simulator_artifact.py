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
from tests.support.release_inputs import installed_distribution

ROOT = Path(__file__).resolve().parents[2]
MODULES = ('__init__.py', 'analog.py', 'backends.py', 'circuit.py', 'dispatch.py', 'engine.py', 'logic.py', 'nets.py', 'waveform.py')


def consumer():
    path = ROOT / 'scripts/simulator_artifact.py'
    assert path.is_file(), 'M3 Simulator artifact selector is missing'
    spec = importlib.util.spec_from_file_location('simulator_artifact', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SHIM = b"import importlib,sys\nsys.modules[__name__]=importlib.import_module('cirnet_sim')\n"


def wheel(tmp_path, *, name='cirnet-simulator', version='0.1.1', contracts='0.1.1', contracts_name=None, missing=None, shim=True):
    namespace = 'netcircuit_sim' if name == 'netcircuit-simulator' else 'cirnet_sim'
    contracts_name = contracts_name or ('netcircuit-contracts' if name == 'netcircuit-simulator' else 'cirnet-contracts')
    path = tmp_path / (name.replace('-', '_') + '-0.1.1-py3-none-any.whl')
    with ZipFile(path, 'w') as archive:
        for module in MODULES:
            if module != missing:
                archive.writestr(namespace + '/' + module, '')
        if namespace == 'cirnet_sim' and shim:
            archive.writestr('netcircuit_sim/__init__.py', SHIM)
        archive.writestr(name.replace('-', '_') + '-0.1.1.dist-info/METADATA',
            f'Metadata-Version: 2.1\nName: {name}\nVersion: {version}\nRequires-Dist: {contracts_name}=={contracts}\nRequires-Dist: jsonschema==4.26.0\n')
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def test_manifest_selects_exact_identity_digest_and_dependency(tmp_path, monkeypatch):
    artifact, digest = wheel(tmp_path)
    manifest = tmp_path / 'artifacts.json'
    manifest.write_text(json.dumps({'schemaVersion': 1, 'python': {'path': str(artifact), 'sha256': digest}}), encoding='utf-8')
    monkeypatch.setenv('CIRNET_SIMULATOR_ARTIFACT_MANIFEST', str(manifest))
    selected = consumer()
    assert selected.selected_wheel_details() == (artifact, digest)
    assert selected.selected_wheel() == artifact


@pytest.mark.parametrize('change,reason', [
    ({'name': 'different'}, 'cirnet-simulator'),
    ({'version': '0.1.0'}, '0.1.1'),
    ({'contracts': '1.0.0'}, 'Contracts'),
    ({'missing': 'engine.py'}, 'engine.py'),
])
def test_wheel_rejects_wrong_identity_dependency_or_missing_runtime(tmp_path, change, reason):
    artifact, digest = wheel(tmp_path, **change)
    with pytest.raises(ValueError, match=reason):
        consumer().verify_wheel(artifact, digest)


def test_selection_has_no_latest_or_source_fallback_and_checks_digest(tmp_path, monkeypatch):
    selected = consumer()
    monkeypatch.delenv('CIRNET_SIMULATOR_ARTIFACT_MANIFEST', raising=False)
    monkeypatch.delenv('NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST', raising=False)
    with pytest.raises(ValueError, match='CIRNET_SIMULATOR_ARTIFACT_MANIFEST'):
        selected.selected_wheel()
    artifact, digest = wheel(tmp_path)
    with pytest.raises(ValueError, match='SHA256'):
        selected.verify_wheel(artifact, '0' * 64)
    with pytest.raises(ValueError, match='absolute'):
        selected.verify_wheel(Path(artifact.name), digest)


def fake_install(tmp_path, *, version='0.1.1', editable=False, tampered=False, source_metadata=False, name='cirnet-simulator'):
    installed = tmp_path / 'site'
    namespace = 'netcircuit_sim' if name == 'netcircuit-simulator' else 'cirnet_sim'
    package = installed / namespace
    package.mkdir(parents=True)
    records = []
    for module in MODULES:
        value = b''
        (package / module).write_bytes(value)
        digest = base64.urlsafe_b64encode(hashlib.sha256(value).digest()).rstrip(b'=').decode()
        records.append(f'{namespace}/{module},sha256={digest},0')
    if namespace == 'cirnet_sim':
        legacy = installed / 'netcircuit_sim'
        legacy.mkdir()
        (legacy / '__init__.py').write_bytes(SHIM)
        digest = base64.urlsafe_b64encode(hashlib.sha256(SHIM).digest()).rstrip(b'=').decode()
        records.append(f'netcircuit_sim/__init__.py,sha256={digest},{len(SHIM)}')
    metadata = installed / f"{name.replace('-', '_')}-{version}.dist-info"
    metadata.mkdir()
    contracts_name = 'netcircuit-contracts' if name == 'netcircuit-simulator' else 'cirnet-contracts'
    (metadata / 'METADATA').write_text(f'Name: {name}\nVersion: {version}\nRequires-Dist: {contracts_name}==0.1.1\nRequires-Dist: jsonschema==4.26.0\n', encoding='utf-8')
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
        package = cwd / 'cirnet_sim'
        package.mkdir()
        (package / '__init__.py').write_text('', encoding='utf-8')
    environment = {key: value for key, value in os.environ.items()
        if key not in {'PYTHONPATH', 'PYTHONHOME', 'CIRNET_SIMULATOR_ARTIFACT_MANIFEST', 'NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST'}}
    return subprocess.run([sys.executable, '-B', '-S', '-c',
        "import sys,site,importlib.util; site.addsitedir(sys.argv[1]); "
        "sys.path.insert(0,str(__import__('pathlib').Path(sys.argv[2]).parent)); "
        "spec=importlib.util.spec_from_file_location('simulator_artifact',sys.argv[2]); "
        "module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module); "
        "print(module.installed_provenance())", str(installed), str(ROOT / 'scripts/simulator_artifact.py')],
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


def test_consumers_pin_one_simulator_and_default_collection_excludes_retained_units():
    for relative in ('pyproject.toml', 'services/api/pyproject.toml'):
        metadata = tomllib.loads((ROOT / relative).read_text(encoding='utf-8'))
        assert 'cirnet-simulator==0.1.1' in metadata['project']['dependencies'], relative
    assert 'cirnet-simulator==0.1.1' in installed_distribution('cirnet-hardware-service').requires
    root = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))
    assert 'simulator/circuit-simulator' in root['tool']['pytest']['ini_options']['norecursedirs']
    lock = json.loads((ROOT / 'integration/simulator-version.json').read_text(encoding='utf-8'))
    assert lock['python'] == {'name': 'cirnet-simulator', 'version': '0.1.1'}
    assert lock['contracts'] == {'name': 'cirnet-contracts', 'version': '0.1.1'}


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


@pytest.mark.parametrize('name', ['cirnet-simulator', 'netcircuit-simulator'])
def test_canonical_and_immutable_legacy_wheels_and_installations_are_supported(tmp_path, name):
    artifact, digest = wheel(tmp_path, name=name)
    assert consumer().verify_wheel(artifact, digest) == artifact
    result = installed_probe(tmp_path, fake_install(tmp_path, name=name))
    assert result.returncode == 0, result.stderr
    assert name in result.stdout


def test_coinstalled_canonical_and_legacy_distribution_identity_is_rejected(tmp_path):
    installed = fake_install(tmp_path)
    other = installed / 'netcircuit_simulator-0.1.1.dist-info'
    other.mkdir()
    (other / 'METADATA').write_text('Name: netcircuit-simulator\nVersion: 0.1.1\n')
    result = installed_probe(tmp_path, installed)
    assert result.returncode != 0 and 'share an import namespace' in result.stderr


@pytest.mark.parametrize('name', ['cirnet-simulator', 'netcircuit-simulator'])
def test_selected_archive_probe_uses_distribution_and_namespace_from_wheel(tmp_path, name):
    selected = consumer()
    artifact, digest = wheel(tmp_path, name=name)
    installed = fake_install(tmp_path, name=name)
    metadata = installed / (name.replace('-', '_') + '-0.1.1.dist-info')
    (metadata / 'direct_url.json').write_text(json.dumps({'url': artifact.as_uri(), 'archive_info': {'hashes': {'sha256': digest}}}))
    other = selected.LEGACY_NAME if name == selected.NAME else selected.NAME
    program = 'import sys,site; site.addsitedir(sys.argv[1]); sys.argv=sys.argv[2:]; exec(sys.argv.pop(0))'
    result = subprocess.run([sys.executable, '-B', '-S', '-c', program, str(installed), selected.SELECTED_INSTALL_PROBE,
        'probe', str(artifact), digest, name, other, json.dumps(selected.NAMESPACES[name])], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data['selected_sha256'] == digest
    assert data['selected_files'] == len(selected.runtime_modules(name))


@pytest.mark.parametrize('options', [
    {'name':'cirnet-simulator','contracts_name':'netcircuit-contracts'},
    {'shim':False},
])
def test_canonical_simulator_requires_new_contracts_and_legacy_import_shim(tmp_path, options):
    artifact, digest = wheel(tmp_path, **options)
    with pytest.raises(ValueError):
        consumer().verify_wheel(artifact, digest)


def test_legacy_simulator_accepts_reviewed_contracts_transition(tmp_path):
    artifact, digest = wheel(tmp_path, name='netcircuit-simulator', contracts_name='cirnet-contracts')
    assert consumer().verify_wheel(artifact, digest) == artifact
