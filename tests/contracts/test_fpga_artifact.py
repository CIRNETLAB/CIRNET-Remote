"""Immutable FPGA source selection is independent of Python runtime packaging."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile

import pytest

ROOT = Path(__file__).resolve().parents[2]


def archive(tmp_path, *, identity_change=None, payload_change=None, extra=None, omit=None):
    payload = {'README.md': b'scaffold\n', 'fpga/experiment-controller/rtl/top.v': b'module top; endmodule\n'}
    files = {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}
    identity = {'schemaVersion': 1, 'name': 'netcircuit-fpga-scaffold', 'version': '0.1.1',
        'kind': 'source', 'contractsVersion': '0.1.1', 'logicalProtocolVersion': '1.0-scaffold',
        'registerMapVersion': '1.0-reserved', 'physicalAvailable': False, 'files': files,
        'sourceFingerprint': hashlib.sha256(''.join(f'{files[name]}  {name}\n' for name in sorted(files)).encode()).hexdigest(),
        'source': {'repository': 'https://github.com/CIRNETLAB/CIRNET-FPGA.git', 'revision': 'a'*40,
            'originalRepository': 'https://github.com/net-Circuit-Remote/net-Circuit-Remote.git',
            'originalRevision': 'f43f92c7730d40040e717bf1bacd3a3773e2a131', 'uncommittedMigration': True}}
    if identity_change: identity.update(identity_change)
    if payload_change: payload.update(payload_change)
    if extra: payload.update(extra)
    if omit: payload.pop(omit)
    payload['fpga-artifact.json'] = json.dumps(identity).encode()
    target = tmp_path / 'netcircuit-fpga-scaffold-0.1.1.tar.gz'
    with tarfile.open(target, 'w:gz') as output:
        for name, contents in payload.items():
            member = tarfile.TarInfo(name); member.size = len(contents)
            output.addfile(member, io.BytesIO(contents))
    return target, hashlib.sha256(target.read_bytes()).hexdigest()


def consumer():
    from scripts import fpga_artifact
    return fpga_artifact


def manifest(tmp_path, target, digest):
    path = tmp_path / 'artifacts.json'
    path.write_text(json.dumps({'schemaVersion': 1, 'source': {'path': str(target), 'sha256': digest}}))
    return path


def test_exact_source_archive_and_manifest_are_required(tmp_path, monkeypatch):
    target, digest = archive(tmp_path)
    selected = manifest(tmp_path, target, digest)
    assert consumer().selected_source_details(selected) == (target, digest)
    assert consumer().verify_archive(target, digest)['identity']['version'] == '0.1.1'
    monkeypatch.delenv('NETCIRCUIT_FPGA_ARTIFACT_MANIFEST', raising=False)
    with pytest.raises(ValueError, match='explicit'): consumer().selected_source_details()
    with pytest.raises(ValueError, match='SHA256'): consumer().verify_archive(target, '0'*64)
    with pytest.raises(ValueError, match='absolute'): consumer().verify_archive(Path(target.name), digest)


def test_published_fpga_provenance_is_accepted_without_rewriting_its_repository(tmp_path):
    source = {'repository': 'https://github.com/TINIHI-Labs/net-Circuit-FPGA.git', 'revision': 'a'*40,
              'originalRepository': 'https://github.com/net-Circuit-Remote/net-Circuit-Remote.git',
              'originalRevision': 'f43f92c7730d40040e717bf1bacd3a3773e2a131', 'uncommittedMigration': False}
    target, digest = archive(tmp_path, identity_change={'source': source})
    assert consumer().verify_archive(target, digest)['identity']['source'] == source


@pytest.mark.parametrize('change', [
    {'version': '0.1.0'}, {'contractsVersion': '1.0.0'}, {'logicalProtocolVersion': '2.0-scaffold'},
    {'registerMapVersion': '2.0'}, {'physicalAvailable': True}, {'source': {}}, {'sourceFingerprint': '0'*64}])
def test_wrong_identity_or_source_fingerprint_is_rejected(tmp_path, change):
    target, digest = archive(tmp_path, identity_change=change)
    with pytest.raises(ValueError): consumer().verify_archive(target, digest)


@pytest.mark.parametrize('kwargs', [
    {'extra': {'injected.py': b'unreviewed'}}, {'omit': 'README.md'},
    {'payload_change': {'README.md': b'tampered'}}, {'extra': {'../escape': b'x'}},
    {'extra': {'C:/escape': b'x'}}, {'extra': {'folder\\escape': b'x'}},
    {'extra': {'.git/config': b'x'}}, {'extra': {'NUL.txt': b'x'}},
    {'extra': {'Readme.md': b'x'}}, {'extra': {'README.md/child': b'x'}},
    {'extra': {'bad./file': b'x'}}])
def test_unreviewed_missing_tampered_and_unsafe_archive_members_fail(tmp_path, kwargs):
    target, digest = archive(tmp_path, **kwargs)
    with pytest.raises(ValueError): consumer().verify_archive(target, digest)


@pytest.mark.parametrize('kind', ['symlink', 'hardlink', 'fifo', 'duplicate', 'oversize'])
def test_archive_rejects_alias_special_duplicate_and_oversize_members(tmp_path, kind, monkeypatch):
    target, _ = archive(tmp_path)
    with tarfile.open(target, 'r:gz') as source:
        entries = [(member, source.extractfile(member).read()) for member in source]
    with tarfile.open(target, 'w:gz') as output:
        for member, data in entries: output.addfile(member, io.BytesIO(data))
        member = tarfile.TarInfo('README.md' if kind == 'duplicate' else 'alias')
        if kind == 'symlink': member.type = tarfile.SYMTYPE; member.linkname = 'README.md'
        elif kind == 'hardlink': member.type = tarfile.LNKTYPE; member.linkname = 'README.md'
        elif kind == 'fifo': member.type = tarfile.FIFOTYPE
        elif kind == 'oversize': monkeypatch.setattr(consumer(), 'MAX_EXPANDED_BYTES', 1)
        output.addfile(member)
    with pytest.raises(ValueError): consumer().verify_archive(target, hashlib.sha256(target.read_bytes()).hexdigest())


def test_selected_product_checks_every_file_against_selected_archive(tmp_path, monkeypatch):
    target, digest = archive(tmp_path); selected = manifest(tmp_path, target, digest)
    monkeypatch.setattr(consumer(), 'artifact_directory', lambda *args: tmp_path / 'products')
    product = consumer().extract_product(target, digest)
    assert consumer().source_product(product, selected)['identity']['version'] == '0.1.1'
    (product / 'README.md').write_text('tampered')
    with pytest.raises(ValueError, match='payload'): consumer().source_product(product, selected)
    monkeypatch.delenv('NETCIRCUIT_FPGA_ROOT', raising=False)
    with pytest.raises(ValueError, match='explicit'): consumer().source_product(None, selected)


def test_product_rejects_unreviewed_empty_directory(tmp_path, monkeypatch):
    target, digest = archive(tmp_path); selected = manifest(tmp_path, target, digest)
    monkeypatch.setattr(consumer(), 'artifact_directory', lambda *args: tmp_path / 'products')
    product = consumer().extract_product(target, digest)
    (product / 'unreviewed').mkdir()
    with pytest.raises(ValueError, match='inventory'): consumer().source_product(product, selected)


def test_checker_rejects_wrong_installed_contracts_before_schema_validation(tmp_path, monkeypatch):
    from scripts import check_fpga_consumer
    target, digest = archive(tmp_path); selected = manifest(tmp_path, target, digest)
    monkeypatch.setattr(consumer(), 'artifact_directory', lambda *args: tmp_path / 'products')
    product = consumer().extract_product(target, digest)
    monkeypatch.setattr(check_fpga_consumer, 'installed_provenance', lambda: {'version': '1.0.0'})
    with pytest.raises(ValueError, match='Contracts 0.1.1'): check_fpga_consumer.check(product, selected)


def test_manifest_rejects_unsupported_schema_and_relative_archive(tmp_path):
    target, digest = archive(tmp_path); selected = manifest(tmp_path, target, digest)
    selected.write_text(json.dumps({'schemaVersion': 2, 'source': {'path': str(target), 'sha256': digest}}))
    with pytest.raises(ValueError, match='schemaVersion'): consumer().selected_source_details(selected)
    selected.write_text(json.dumps({'schemaVersion': 1, 'source': {'path': target.name, 'sha256': digest}}))
    with pytest.raises(ValueError, match='absolute'): consumer().selected_source_details(selected)


def test_installer_explicit_manifest_never_uses_inherited_url(tmp_path, monkeypatch, capsys):
    from scripts import install_fpga
    target, digest = archive(tmp_path); selected = manifest(tmp_path, target, digest)
    monkeypatch.setattr(consumer(), 'artifact_directory', lambda *args: tmp_path / 'products')
    monkeypatch.setenv('NETCIRCUIT_FPGA_ARTIFACT_URL', 'https://invalid.example/should-not-download.tar.gz')
    monkeypatch.setenv('NETCIRCUIT_FPGA_ARTIFACT_SHA256', '0'*64)
    assert install_fpga.main(['--manifest', str(selected)]) == 0
    value = json.loads(capsys.readouterr().out)
    assert Path(value['fpgaRoot']).is_dir()
    with pytest.raises(SystemExit): install_fpga.main(['--url', 'https://invalid.example/partial.tar.gz'])
    with pytest.raises(SystemExit): install_fpga.main(['--manifest', str(selected), '--sha256', digest])


def test_default_collection_excludes_frozen_fpga_tests(tmp_path):
    retained = tmp_path / 'tests/fpga'; retained.mkdir(parents=True)
    (retained / 'test_legacy.py').write_text("raise AssertionError('frozen FPGA tests imported')\n")
    (tmp_path / 'test_current.py').write_text('def test_current(): pass\n')
    environment = {key: value for key, value in os.environ.items() if key != 'PYTEST_ADDOPTS'}
    result = subprocess.run([sys.executable, '-B', '-m', 'pytest', '--collect-only', '-q',
        '-c', str(ROOT / 'pyproject.toml'), '--basetemp', str(tmp_path / 'pytest')],
        cwd=tmp_path, env=environment, capture_output=True, text=True, timeout=60)
    assert result.returncode == 0, result.stdout + result.stderr
    assert 'test_current.py::test_current' in result.stdout and 'test_legacy.py' not in result.stdout


def test_direct_script_entrypoints_work_without_checkout_pythonpath():
    environment = {key: value for key, value in os.environ.items() if key != 'PYTHONPATH'}
    for name in ('install_fpga.py', 'check_fpga_consumer.py'):
        result = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts' / name), '--help'],
            cwd=ROOT, env=environment, capture_output=True, text=True, timeout=30)
        assert result.returncode == 0, result.stdout + result.stderr
