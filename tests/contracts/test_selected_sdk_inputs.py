"""Source conformance selects a matching SDK without rewriting released inputs."""
import hashlib
import io
import json
import tarfile

import pytest


def archive(path, value):
    with tarfile.open(path, 'w:gz') as product:
        for name, content in {
            'package/package.json': json.dumps({'name': '@tinihi-labs/contracts', 'version': '0.1.1'}).encode(),
            'package/dist/data/sample.json': json.dumps(value).encode(),
        }.items():
            member = tarfile.TarInfo(name)
            member.size = len(content)
            product.addfile(member, io.BytesIO(content))
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def sdk_inputs(tmp_path, monkeypatch):
    from tests.support import release_inputs
    from scripts import artifact_paths
    product = tmp_path / 'interface'
    (product / 'integration').mkdir(parents=True)
    (product / '.artifacts').mkdir()
    package = product / 'node_modules/@tinihi-labs/contracts'
    (package / 'dist/data').mkdir(parents=True)
    (package / 'package.json').write_text(json.dumps({'name': '@tinihi-labs/contracts', 'version': '0.1.1'}))
    (package / 'dist/data/sample.json').write_text(json.dumps({'prefix': 'legacy'}))
    legacy = product / '.artifacts/legacy.tgz'
    digest = archive(legacy, {'prefix': 'legacy'})
    lock = product / 'integration/contracts-artifacts.json'
    lock.write_text(json.dumps({'contractsVersion': '0.1.1', 'npm': {'filename': legacy.name, 'sha256': digest}}))
    current = tmp_path / 'current.tgz'
    digest = archive(current, {'prefix': 'current'})
    manifest = tmp_path / 'selected.json'
    manifest.write_text(json.dumps({'npm': {'path': str(current), 'sha256': digest}}))
    monkeypatch.setenv('CIRNET_CONTRACTS_ARTIFACT_MANIFEST', str(manifest))
    monkeypatch.setattr(release_inputs, 'interface_root', lambda: product)
    monkeypatch.setattr(artifact_paths, 'artifact_directory', lambda name: tmp_path / 'output' / name)
    return manifest, lock, package / 'dist/data/sample.json'


def test_current_sdk_selection_preserves_released_lock_and_installed_bytes(sdk_inputs):
    from tests.support.release_inputs import sdk_resource
    _, lock, installed = sdk_inputs
    before = lock.read_bytes(), installed.read_bytes()
    selected = sdk_resource('data/sample.json')
    assert json.loads(selected.read_text()) == {'prefix': 'current'}
    assert (lock.read_bytes(), installed.read_bytes()) == before
    selected.write_bytes(b'tampered cache')
    with pytest.raises(RuntimeError, match='Materialized'):
        sdk_resource('data/sample.json')


def test_changed_selected_sdk_never_falls_back_to_released_bytes(sdk_inputs):
    from tests.support.release_inputs import sdk_resource
    manifest, _, _ = sdk_inputs
    selected = json.loads(manifest.read_text())
    selected['npm']['sha256'] = '0' * 64
    manifest.write_text(json.dumps(selected))
    with pytest.raises(RuntimeError, match='digest'):
        sdk_resource('data/sample.json')
