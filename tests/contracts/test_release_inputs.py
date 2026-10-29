"""Release-test inputs cannot silently resolve to retained or sibling sources."""
import pytest
import hashlib
import json


def test_interface_input_requires_an_explicit_artifact_selection(monkeypatch):
    from tests.support.release_inputs import interface_root
    monkeypatch.delenv('NETCIRCUIT_INTERFACE_ROOT', raising=False)
    with pytest.raises(RuntimeError, match='NETCIRCUIT_INTERFACE_ROOT'):
        interface_root()


def test_interface_input_rejects_checkout_and_unidentified_directory(tmp_path, monkeypatch):
    from tests.support.release_inputs import interface_root
    monkeypatch.setenv('NETCIRCUIT_INTERFACE_ROOT', str(tmp_path))
    with pytest.raises((RuntimeError, FileNotFoundError)):
        interface_root()


def product(tmp_path, *, version='0.1.1', identity_version=None, contracts='0.1.1'):
    contents = (json.dumps({'name': '@net-circuit/web', 'version': version}) + '\n').encode()
    (tmp_path / 'package.json').write_bytes(contents)
    fingerprint = hashlib.sha256((hashlib.sha256(contents).hexdigest() + '  package.json\n').encode()).hexdigest()
    identity = {'schema': 1, 'name': 'netcircuit-interface', 'version': identity_version or version, 'contractsVersion': contracts,
                'kind': 'source', 'source': {'revision': 'a' * 40, 'uncommittedMigration': False}, 'sourceFingerprint': fingerprint}
    (tmp_path / 'interface-artifact.json').write_text(json.dumps(identity), encoding='utf-8')
    return tmp_path


def test_interface_input_checks_real_exported_bytes_and_detects_later_tampering(tmp_path, monkeypatch):
    from tests.support.release_inputs import interface_root
    root = product(tmp_path)
    monkeypatch.setenv('NETCIRCUIT_INTERFACE_ROOT', str(root))
    assert interface_root() == root.resolve()
    (root / 'package.json').write_bytes((root / 'package.json').read_bytes() + b' ')
    with pytest.raises(RuntimeError, match='fingerprint'):
        interface_root()


def test_interface_input_rejects_git_checkout_even_with_valid_identity(tmp_path, monkeypatch):
    from tests.support.release_inputs import interface_root
    root = product(tmp_path)
    (root / '.git').mkdir()
    monkeypatch.setenv('NETCIRCUIT_INTERFACE_ROOT', str(root))
    with pytest.raises(RuntimeError, match='Git checkout'):
        interface_root()


def test_interface_input_rejects_relative_path(monkeypatch):
    from tests.support.release_inputs import interface_root
    monkeypatch.setenv('NETCIRCUIT_INTERFACE_ROOT', 'relative-product')
    with pytest.raises(RuntimeError, match='absolute'):
        interface_root()


@pytest.mark.parametrize('version', ['0.1.1', '0.1.2'])
def test_interface_input_accepts_reviewed_product_version_with_unchanged_contracts(tmp_path, monkeypatch, version):
    from tests.support.release_inputs import interface_root
    root = product(tmp_path, version=version)
    monkeypatch.setenv('NETCIRCUIT_INTERFACE_ROOT', str(root))
    assert interface_root() == root.resolve()


@pytest.mark.parametrize('changes', [
    {'version': '0.1.2', 'identity_version': '0.1.1'},
    {'version': '0.1.1', 'identity_version': '0.1.2'},
    {'version': '0.1.3'},
    {'version': '0.1.2', 'contracts': '0.1.2'},
])
def test_interface_input_rejects_unreviewed_or_mismatched_product_and_contracts_versions(tmp_path, monkeypatch, changes):
    from tests.support.release_inputs import interface_root
    root = product(tmp_path, **changes)
    monkeypatch.setenv('NETCIRCUIT_INTERFACE_ROOT', str(root))
    with pytest.raises(RuntimeError, match='identity'):
        interface_root()
