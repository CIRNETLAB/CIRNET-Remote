"""Explicit installation selection cannot be replaced by inherited CI settings."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

import pytest

from scripts import install_contracts as installer
MODULES = ('__init__.py',)


class ReachedInstaller(Exception):
    def __init__(self, command):
        self.command = command


@pytest.fixture
def candidate(tmp_path, monkeypatch):
    wheel = tmp_path / 'netcircuit_contracts-0.1.1-py3-none-any.whl'
    with ZipFile(wheel, 'w') as archive:
        for module in MODULES:
            archive.writestr('contracts/' + module, '')
        archive.writestr('netcircuit_contracts-0.1.1.dist-info/METADATA',
            'Name: netcircuit-contracts\nVersion: 0.1.1\n'
            'Provides-Extra: rpc\nRequires-Dist: jsonschema==4.26.0\n')
    digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    manifest = tmp_path / 'selected.json'
    manifest.write_text(json.dumps({'schemaVersion': 1, 'python': {'path': str(wheel), 'sha256': digest}}), encoding='utf-8')
    for suffix in ('ARTIFACT_MANIFEST', 'WHEEL_URL', 'WHEEL_SHA256', 'WHEEL_FILENAME'):
        monkeypatch.delenv('NETCIRCUIT_CONTRACTS_' + suffix, raising=False)
    monkeypatch.setenv('NETCIRCUIT_CONTRACTS_WHEEL_URL', 'https://example.invalid/inherited-b.whl')
    monkeypatch.setenv('NETCIRCUIT_CONTRACTS_WHEEL_SHA256', digest)
    monkeypatch.setenv('NETCIRCUIT_CONTRACTS_WHEEL_FILENAME', 'inherited-b.whl')

    def directory(name):
        path = tmp_path / name
        path.mkdir(exist_ok=True)
        return path

    def stop_before_pip(command, **kwargs):
        raise ReachedInstaller(command)

    monkeypatch.setattr(installer, 'artifact_directory', directory, raising=False)
    monkeypatch.setattr(installer.subprocess, 'run', stop_before_pip)
    return wheel, digest, manifest


def test_explicit_manifest_ignores_inherited_download_url_hash_and_filename(candidate, monkeypatch):
    wheel, _, manifest = candidate

    def unexpected_download(*args, **kwargs):
        pytest.fail('Inherited artifact B was downloaded despite explicit manifest A')

    monkeypatch.setattr(installer, 'download_artifact', unexpected_download)
    with pytest.raises(ReachedInstaller) as selected:
        installer.main(['--manifest', str(manifest)])
    assert selected.value.command[-1] == str(wheel) + '[rpc]'


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
    assert Path(selected.value.command[-1].removesuffix('[rpc]')).name == wheel.name


def test_no_cli_selector_preserves_exact_environment_download(candidate, monkeypatch):
    wheel, digest, _ = candidate
    url = 'https://example.invalid/' + wheel.name
    monkeypatch.setenv('NETCIRCUIT_CONTRACTS_WHEEL_URL', url)
    monkeypatch.setenv('NETCIRCUIT_CONTRACTS_WHEEL_FILENAME', wheel.name)
    downloads = []

    def download(selected, actual_digest):
        downloads.append((selected, actual_digest))
        return wheel.read_bytes()

    monkeypatch.setattr(installer, 'download_artifact', download)
    with pytest.raises(ReachedInstaller) as selected:
        installer.main([])
    assert downloads == [(url, digest)]
    assert Path(selected.value.command[-1].removesuffix('[rpc]')).name == wheel.name
