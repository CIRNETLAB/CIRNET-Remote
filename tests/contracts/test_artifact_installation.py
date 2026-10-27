"""Artifact selection verifies bytes and distribution identity before pip runs."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from zipfile import ZipFile

import pytest

ROOT = Path(os.environ.get('NETCIRCUIT_CONSUMER_SOURCE_ROOT', Path(__file__).resolve().parents[2]))


def helper():
    source = ROOT / 'scripts/contracts_artifact.py'
    assert source.is_file(), 'versioned artifact selection/provenance gate is missing'
    spec = importlib.util.spec_from_file_location('contract_artifact_test', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def wheel(tmp_path, version='0.1.1'):
    target = tmp_path / f'netcircuit_contracts-{version}-py3-none-any.whl'
    with ZipFile(target, 'w') as archive:
        archive.writestr(f'netcircuit_contracts-{version}.dist-info/METADATA',
                         f'Name: netcircuit-contracts\nVersion: {version}\n')
        archive.writestr('contracts/__init__.py', '')
    return target


def test_same_name_wrong_bytes_are_rejected_before_install(tmp_path):
    target = wheel(tmp_path)
    module = helper()
    with pytest.raises(ValueError, match='SHA256'):
        module.verify_wheel(target, '0' * 64)


def test_wrong_version_is_rejected_even_with_a_matching_digest(tmp_path):
    target = wheel(tmp_path, '1.0.0')
    with pytest.raises(ValueError, match='0.1.1'):
        helper().verify_wheel(target, hashlib.sha256(target.read_bytes()).hexdigest())


def test_verified_manifest_selects_exact_wheel_and_requires_absolute_paths(tmp_path):
    target = wheel(tmp_path)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    manifest = tmp_path / 'artifacts.json'
    manifest.write_text(json.dumps({'python': {'path': str(target), 'sha256': digest}}))
    assert helper().selected_wheel(manifest) == target
    manifest.write_text(json.dumps({'python': {'path': target.name, 'sha256': digest}}))
    with pytest.raises(ValueError, match='absolute'):
        helper().selected_wheel(manifest)
