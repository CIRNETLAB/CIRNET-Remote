"""Explicit installation selection cannot be replaced by inherited CI settings."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

import pytest

import importlib.util
ROOT = Path(__file__).resolve().parents[2]
@pytest.fixture(autouse=True)
def load_installer():
    global installer, MODULES
    path = ROOT / 'scripts/install_hardware.py'
    assert path.is_file(), 'M4 Hardware installer is missing'
    spec = importlib.util.spec_from_file_location('install_hardware', path)
    installer = importlib.util.module_from_spec(spec); spec.loader.exec_module(installer)
    from scripts.hardware_artifact import MODULES


class ReachedInstaller(Exception):
    def __init__(self, command, environment=None):
        self.command = command
        self.environment = environment


@pytest.fixture
def candidate(tmp_path, monkeypatch):
    wheel = tmp_path / 'netcircuit_hardware_service-0.1.1-py3-none-any.whl'
    with ZipFile(wheel, 'w') as archive:
        for module in MODULES:
            archive.writestr('hardware_service/' + module, '')
        archive.writestr('netcircuit_hardware_service-0.1.1.dist-info/METADATA',
            'Name: netcircuit-hardware-service\nVersion: 0.1.1\n'
            'Requires-Dist: netcircuit-contracts==1.0.1\nRequires-Dist: netcircuit-simulator==0.2.0\nRequires-Dist: grpcio==1.84.0\nRequires-Dist: protobuf==7.36.2\nRequires-Dist: jsonschema==4.26.0\n')
    digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    manifest = tmp_path / 'selected.json'
    manifest.write_text(json.dumps({'schemaVersion': 1, 'python': {'path': str(wheel), 'sha256': digest}}), encoding='utf-8')
    for suffix in ('ARTIFACT_MANIFEST', 'WHEEL_URL', 'WHEEL_SHA256', 'WHEEL_FILENAME'):
        monkeypatch.delenv('NETCIRCUIT_HARDWARE_' + suffix, raising=False)
    monkeypatch.setenv('NETCIRCUIT_HARDWARE_WHEEL_URL', 'https://example.invalid/inherited-b.whl')
    monkeypatch.setenv('NETCIRCUIT_HARDWARE_WHEEL_SHA256', digest)
    monkeypatch.setenv('NETCIRCUIT_HARDWARE_WHEEL_FILENAME', 'inherited-b.whl')

    def directory(name):
        path = tmp_path / name
        path.mkdir(exist_ok=True)
        return path

    def stop_before_pip(command, **kwargs):
        raise ReachedInstaller(command, kwargs.get('env'))

    monkeypatch.setattr(installer, 'artifact_directory', directory)
    monkeypatch.setattr(installer.subprocess, 'run', stop_before_pip)
    return wheel, digest, manifest


def test_explicit_manifest_ignores_inherited_download_url_hash_and_filename(candidate, monkeypatch):
    wheel, _, manifest = candidate

    def unexpected_download(*args, **kwargs):
        pytest.fail('Inherited artifact B was downloaded despite explicit manifest A')

    monkeypatch.setattr(installer, 'download_artifact', unexpected_download)
    with pytest.raises(ReachedInstaller) as selected:
        installer.main(['--manifest', str(manifest)])
    assert selected.value.command[-1] == str(wheel)


@pytest.mark.parametrize('arguments', ['wheel', 'url', 'hash', 'filename', 'manifest_url', 'manifest_hash'])
def test_incomplete_or_conflicting_cli_selectors_fail_before_download_or_install(candidate, monkeypatch, arguments):
    wheel, digest, manifest = candidate
    options = {
        'wheel': ['--wheel', str(wheel)],
        'url': ['--url', 'https://example.invalid/explicit-a.whl'],
        'hash': ['--sha256', digest],
        'filename': ['--filename', wheel.name],
        'manifest_url': ['--manifest', str(manifest), '--url', 'https://example.invalid/explicit-a.whl', '--sha256', digest],
        'manifest_hash': ['--manifest', str(manifest), '--sha256', digest],
    }
    monkeypatch.setattr(installer, 'download_artifact', lambda *args, **kwargs: pytest.fail('invalid selector downloaded an artifact'))
    with pytest.raises(SystemExit) as failure:
        installer.main(options[arguments])
    assert failure.value.code == 2


def test_explicit_url_and_hash_ignore_inherited_filename(candidate, monkeypatch):
    wheel, digest, _ = candidate
    url = 'https://example.invalid/' + wheel.name
    downloads = []

    def download(selected, actual_digest):
        downloads.append((selected, actual_digest))
        return wheel.read_bytes()

    monkeypatch.setattr(installer, 'download_artifact', download)
    with pytest.raises(ReachedInstaller) as selected:
        installer.main(['--url', url, '--sha256', digest])
    assert downloads == [(url, digest)]
    assert Path(selected.value.command[-1]).name == wheel.name


def test_no_cli_selector_preserves_exact_environment_download(candidate, monkeypatch):
    wheel, digest, _ = candidate
    url = 'https://example.invalid/' + wheel.name
    monkeypatch.setenv('NETCIRCUIT_HARDWARE_WHEEL_URL', url)
    monkeypatch.setenv('NETCIRCUIT_HARDWARE_WHEEL_FILENAME', wheel.name)
    downloads = []

    def download(selected, actual_digest):
        downloads.append((selected, actual_digest))
        return wheel.read_bytes()

    monkeypatch.setattr(installer, 'download_artifact', download)
    with pytest.raises(ReachedInstaller) as selected:
        installer.main([])
    assert downloads == [(url, digest)]
    assert Path(selected.value.command[-1]).name == wheel.name


def test_installer_overrides_hostile_inherited_temp_for_children_only(candidate, monkeypatch):
    wheel, digest, _ = candidate
    for name in ('TMP', 'TEMP', 'TMPDIR'):
        monkeypatch.setenv(name, str(ROOT))
    before = {name: __import__('os').environ[name] for name in ('TMP', 'TEMP', 'TMPDIR')}
    with pytest.raises(ReachedInstaller) as selected:
        installer.main(['--wheel', str(wheel), '--sha256', digest])
    assert selected.value.environment is not None, 'pip inherited unsafe temporary paths'
    for name in before:
        assert Path(selected.value.environment[name]) == wheel.parent / 'hardware-install-temp'
    assert {name: __import__('os').environ[name] for name in before} == before
