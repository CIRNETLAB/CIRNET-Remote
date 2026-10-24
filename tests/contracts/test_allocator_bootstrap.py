"""DEV tooling bootstraps from verified bytes before any diagnostic file exists."""
import hashlib
import importlib.util
import io
import os
from pathlib import Path
from zipfile import ZipFile

import pytest

ROOT = Path(os.environ.get('NETCIRCUIT_CONSUMER_SOURCE_ROOT', Path(__file__).resolve().parents[2]))


def helper():
    source = ROOT / 'scripts/bootstrap_contract_tools.py'
    assert source.is_file(), 'independent DEV artifact bootstrap is missing'
    spec = importlib.util.spec_from_file_location('allocator_bootstrap_test', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def payload(version='1.0.0a1', *, resource=True):
    buffer = io.BytesIO()
    with ZipFile(buffer, 'w') as archive:
        archive.writestr(f'netcircuit_artifact_paths-{version}.dist-info/METADATA',
                         f'Name: netcircuit-artifact-paths\nVersion: {version}\n')
        if resource:
            archive.writestr('netcircuit_artifact_paths/artifact-paths.mjs', 'export const pinned=true;\n')
    return buffer.getvalue()


def test_bootstrap_rejects_changed_wheel_bytes_before_running_node():
    with pytest.raises(ValueError, match='SHA256'):
        helper().verified_dev_payload(payload(), '0' * 64)


def test_bootstrap_requires_the_selected_independent_dev_distribution():
    value = payload('2.0.0')
    with pytest.raises(ValueError, match='1.0.0a1'):
        helper().verified_dev_payload(value, hashlib.sha256(value).hexdigest())


def test_bootstrap_requires_the_wheel_owned_canonical_node_implementation():
    value = payload(resource=False)
    with pytest.raises(ValueError, match='canonical Node'):
        helper().verified_dev_payload(value, hashlib.sha256(value).hexdigest())


def test_verified_payload_exposes_only_selected_wheel_node_bytes():
    value = payload()
    result = helper().verified_dev_payload(value, hashlib.sha256(value).hexdigest())
    assert result == b'export const pinned=true;\n'
