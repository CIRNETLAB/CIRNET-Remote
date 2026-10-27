"""A retained checkout package must never shadow the selected Contracts wheel."""
import json
import os
from pathlib import Path
import subprocess
import sys

import pytest
from tests.support.release_inputs import installed_distribution

ROOT = Path(os.environ.get('NETCIRCUIT_CONSUMER_SOURCE_ROOT', Path(__file__).resolve().parents[2]))


def environment(tmp_path, *, version='0.1.1', editable=False, missing=False):
    shadow = tmp_path / 'remote'
    package = shadow / 'contracts'
    package.mkdir(parents=True)
    (package / '__init__.py').write_bytes((ROOT / 'contracts/__init__.py').read_bytes())
    (package / 'marker.py').write_text("raise AssertionError('legacy submodule executed')\n")
    (package / 'resource.json').write_text('{"origin":"legacy"}')
    installed = tmp_path / 'installed'
    installed.mkdir()
    if not missing:
        actual = installed / 'contracts'
        actual.mkdir()
        (actual / '__init__.py').write_text('from .marker import IDENTITY\n')
        (actual / 'marker.py').write_text("IDENTITY = 'wheel'\n")
        (actual / 'resource.json').write_text('{"origin":"wheel"}')
        metadata = installed / f'netcircuit_contracts-{version}.dist-info'
        metadata.mkdir()
        (metadata / 'METADATA').write_text(f'Metadata-Version: 2.1\nName: netcircuit-contracts\nVersion: {version}\n')
        (metadata / 'RECORD').write_text('contracts/__init__.py,,\ncontracts/marker.py,,\ncontracts/resource.json,,\n')
        if editable:
            (metadata / 'direct_url.json').write_text(json.dumps({'url': actual.as_uri(), 'dir_info': {'editable': True}}))
    return shadow, installed


def probe(shadow, installed, body):
    clean = {key: value for key, value in os.environ.items() if key not in {'PYTHONPATH', 'PYTHONHOME'}}
    return subprocess.run([sys.executable, '-S', '-c',
        "import site,sys; site.addsitedir(sys.argv[1]); " + body, str(installed)],
        cwd=shadow, env=clean, capture_output=True, text=True)


def test_root_import_and_resources_use_only_the_installed_distribution(tmp_path):
    shadow, installed = environment(tmp_path)
    result = probe(shadow, installed,
        "import contracts,json; from importlib.resources import files; "
        "from pathlib import Path; assert contracts.IDENTITY=='wheel'; "
        "assert Path(contracts.__file__).parent==Path(sys.argv[1])/'contracts'; "
        "assert list(contracts.__path__)==[str(Path(sys.argv[1])/'contracts')]; "
        "assert contracts.__spec__.origin==contracts.__file__; "
        "assert json.loads(files('contracts').joinpath('resource.json').read_text())['origin']=='wheel'")
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize(('options', 'reason'), [
    ({'missing': True}, 'not installed'),
    ({'version': '1.0.0'}, '0.1.1'),
    ({'editable': True}, 'editable'),
])
def test_unavailable_wrong_or_editable_artifact_cannot_fall_back_to_old_source(tmp_path, options, reason):
    shadow, installed = environment(tmp_path, **options)
    result = probe(shadow, installed, 'import contracts')
    assert result.returncode != 0, 'retained source unexpectedly served as runtime Contracts'
    assert reason in result.stderr, result.stderr


def test_reload_keeps_the_installed_package_and_resource_loader(tmp_path):
    shadow, installed = environment(tmp_path)
    result = probe(shadow, installed,
        "import contracts,importlib; from importlib.resources import files; "
        "contracts=importlib.reload(contracts); assert contracts.IDENTITY=='wheel'; "
        "assert 'wheel' in files('contracts').joinpath('resource.json').read_text()")
    assert result.returncode == 0, result.stdout + result.stderr


def test_distribution_metadata_cannot_redirect_to_retained_source(tmp_path):
    shadow, installed = environment(tmp_path, missing=True)
    metadata = shadow / 'netcircuit_contracts-0.1.1.dist-info'
    metadata.mkdir()
    (metadata / 'METADATA').write_text('Name: netcircuit-contracts\nVersion: 0.1.1\n')
    (metadata / 'RECORD').write_text('contracts/__init__.py,,\n')
    result = probe(shadow, installed, 'import contracts')
    assert result.returncode != 0
    assert 'retained Remote source' in result.stderr


def test_consumer_metadata_pins_the_same_artifact_version():
    import tomllib
    for relative in ('pyproject.toml', 'services/api/pyproject.toml'):
        metadata = tomllib.loads((ROOT / relative).read_text(encoding='utf-8'))
        assert 'netcircuit-contracts==0.1.1' in metadata['project']['dependencies'], relative
    assert 'netcircuit-contracts==0.1.1' in installed_distribution('netcircuit-hardware-service').requires
    assert tomllib.loads((ROOT / 'pyproject.toml').read_text())['project']['name'] == 'netcircuit-remote-dev'
    lock = json.loads((ROOT / 'integration/contracts-version.json').read_text())
    assert lock['python'] == {'name': 'netcircuit-contracts', 'version': '0.1.1'}
    assert lock['npm'] == {'name': '@tinihi-labs/contracts', 'version': '0.1.1'}
    simulator = json.loads((ROOT / 'integration/simulator-version.json').read_text(encoding='utf-8'))
    assert simulator['contracts'] == lock['python']
