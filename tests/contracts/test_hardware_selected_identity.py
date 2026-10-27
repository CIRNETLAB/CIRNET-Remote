"""Synthetic installer fixtures prove same-version Hardware archive replacement.

Dependency wheels here contain metadata only. These assertions establish package
selection behavior; real Hardware/Contracts/Simulator execution has its own gate.
"""
import base64
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import venv
from zipfile import ZipFile

import pytest

ROOT = Path(__file__).resolve().parents[2]


def tool(name):
    path = ROOT / 'scripts' / (name + '.py')
    assert path.is_file(), 'Hardware artifact tool is missing'
    spec = importlib.util.spec_from_file_location('hardware_identity_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def wheel(directory, name, version, package=None, marker=None, dependencies=()):
    directory.mkdir(exist_ok=True)
    normalized = name.replace('-', '_')
    metadata = f'{normalized}-{version}.dist-info'
    entries = {
        metadata + '/METADATA': (f'Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n'
            + ''.join('Requires-Dist: ' + value + '\n' for value in dependencies)).encode(),
        metadata + '/WHEEL': b'Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n',
    }
    if package:
        for module in tool('hardware_artifact').MODULES:
            entries[package + '/' + module] = b''
        entries[package + '/__init__.py'] = f'VALUE={marker!r}\n'.encode()
    records = [f'{name},sha256={base64.urlsafe_b64encode(hashlib.sha256(value).digest()).rstrip(b"=").decode()},{len(value)}'
        for name, value in entries.items()]
    entries[metadata + '/RECORD'] = ('\n'.join(records) + f'\n{metadata}/RECORD,,\n').encode()
    path = directory / f'{normalized}-{version}-py3-none-any.whl'
    with ZipFile(path, 'w') as archive:
        for name, value in entries.items(): archive.writestr(name, value)
    return path, hashlib.sha256(path.read_bytes()).hexdigest()


def test_same_version_hardware_candidate_replaces_payload_and_rejects_stale_selection(tmp_path, monkeypatch):
    root = tmp_path / 'venv'
    venv.EnvBuilder(with_pip=True).create(root)
    python = root / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    dependencies = ('netcircuit-contracts==1.0.1', 'netcircuit-simulator==0.2.0',
        'grpcio==1.84.0', 'protobuf==7.36.2', 'jsonschema==4.26.0')
    dependency_root = tmp_path / 'dependencies'
    for item in dependencies:
        name, version = item.split('==')
        wheel(dependency_root, name, version)
    first, first_digest = wheel(tmp_path / 'first', 'netcircuit-hardware-service', '0.1.1',
        'hardware_service', 'first', dependencies)
    second, second_digest = wheel(tmp_path / 'second', 'netcircuit-hardware-service', '0.1.1',
        'hardware_service', 'second', dependencies)
    installer = tool('install_hardware')
    monkeypatch.setattr(installer, 'sys', SimpleNamespace(executable=str(python)))
    monkeypatch.setenv('PIP_NO_INDEX', '1')
    monkeypatch.setenv('PIP_FIND_LINKS', str(dependency_root))
    monkeypatch.setenv('PIP_DISABLE_PIP_VERSION_CHECK', '1')
    monkeypatch.delenv('GITHUB_ENV', raising=False)
    assert installer.main(['--wheel', str(first), '--sha256', first_digest]) == 0
    checker = tool('hardware_artifact')
    with pytest.raises(RuntimeError, match='archive|payload'):
        checker.verify_selected_install(second, second_digest, python=python)
    assert installer.main(['--wheel', str(second), '--sha256', second_digest]) == 0
    value = subprocess.run([str(python), '-I', '-c', 'import hardware_service; print(hardware_service.VALUE)'],
        cwd=tmp_path, capture_output=True, text=True, check=True)
    assert value.stdout.strip() == 'second'
    with pytest.raises(RuntimeError, match='archive|payload'):
        checker.verify_selected_install(first, first_digest, python=python)
