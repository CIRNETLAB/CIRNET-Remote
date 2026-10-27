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


def product(tmp_path):
    contents = b'{"name":"@net-circuit/web","version":"0.1.1"}\n'
    (tmp_path / 'package.json').write_bytes(contents)
    fingerprint = hashlib.sha256((hashlib.sha256(contents).hexdigest() + '  package.json\n').encode()).hexdigest()
    identity = {'schema': 1, 'name': 'netcircuit-interface', 'version': '0.1.1', 'contractsVersion': '0.1.1',
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
