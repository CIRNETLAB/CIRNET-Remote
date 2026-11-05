"""Pinned producer builds admit reviewed 3.14 wheels without relaxing hashes."""
from copy import deepcopy
import hashlib
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def builder(monkeypatch):
    monkeypatch.syspath_prepend(str(ROOT / 'scripts'))
    spec = importlib.util.spec_from_file_location('ci_dependency_python_test', ROOT / 'scripts/build_ci_dependency.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def pinned_source(tmp_path):
    payload = ('--require-hashes\n--only-binary=:all:\n\n'
               'native-tool==1.2.3 \\\n    --hash=sha256:' + 'a' * 64 + '\n\n'
               'unchanged==4.5.6 \\\n    --hash=sha256:' + 'b' * 64 + '\n').encode()
    name = 'requirements-build.lock'
    (tmp_path / name).write_bytes(payload)
    profile = {'sha256': hashlib.sha256(payload).hexdigest(),
               'hashes': {'native-tool==1.2.3': ['c' * 64, 'd' * 64]}}
    pin = {'buildWheelHashes': {'3.14': {name: profile}}}
    return tmp_path, pin, payload


def test_reviewed_hashes_extend_only_existing_exact_pins(builder, pinned_source):
    source, pin, original = pinned_source
    receipt = builder.prepare_build_requirements(source, pin, python_version=(3, 14))
    updated = (source / 'requirements-build.lock').read_bytes()
    assert updated != original
    assert updated.count(b'native-tool==1.2.3') == 1
    assert b'--require-hashes' in updated and b'--only-binary=:all:' in updated
    for value in ('a', 'b', 'c', 'd'):
        assert ('sha256:' + value * 64).encode() in updated
    assert receipt['requirements-build.lock'] == {
        'originalSha256': hashlib.sha256(original).hexdigest(),
        'sha256': hashlib.sha256(updated).hexdigest(),
    }


@pytest.mark.parametrize('version', [(3, 11), (3, 12), (3, 13), (3, 15)])
def test_other_interpreters_keep_the_original_requirements(builder, pinned_source, version):
    source, pin, original = pinned_source
    assert builder.prepare_build_requirements(source, pin, python_version=version) == {}
    assert (source / 'requirements-build.lock').read_bytes() == original


@pytest.mark.parametrize('failure', ['source-digest', 'package-version', 'hash', 'traversal', 'unknown-file'])
def test_unreviewed_source_or_hash_profile_fails_before_writing(builder, pinned_source, failure):
    source, pin, original = pinned_source
    profile = pin['buildWheelHashes']['3.14']
    item = profile['requirements-build.lock']
    if failure == 'source-digest':
        item['sha256'] = '0' * 64
    elif failure == 'package-version':
        item['hashes'] = {'native-tool==9.9.9': ['c' * 64]}
    elif failure == 'hash':
        item['hashes']['native-tool==1.2.3'] = ['invalid']
    else:
        profile['../outside.lock' if failure == 'traversal' else 'other.lock'] = deepcopy(item)
    with pytest.raises(ValueError):
        builder.prepare_build_requirements(source, pin, python_version=(3, 14))
    assert (source / 'requirements-build.lock').read_bytes() == original


def test_all_files_are_checked_before_any_requirements_are_modified(builder, pinned_source):
    source, pin, original = pinned_source
    pin['buildWheelHashes']['3.14']['requirements-runtime.lock'] = {
        'sha256': '0' * 64, 'hashes': {'native-tool==1.2.3': ['c' * 64]}}
    (source / 'requirements-runtime.lock').write_bytes(original)
    with pytest.raises(ValueError):
        builder.prepare_build_requirements(source, pin, python_version=(3, 14))
    assert (source / 'requirements-build.lock').read_bytes() == original
