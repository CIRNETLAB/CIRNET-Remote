from tests.support.release_inputs import interface_root, installed_distribution
import importlib
import json
from pathlib import Path
import re
import tomllib
import yaml

ROOT=Path(__file__).resolve().parents[2]


def test_six_product_owners_are_explicit_and_installed_packages_do_not_cross_boundaries():
    owners = {
        'netcircuit-contracts': 'contracts',
        'netcircuit-simulator': 'netcircuit_sim',
        'netcircuit-hardware-service': 'hardware_service',
    }
    for name, package in owners.items():
        product = installed_distribution(name)
        entries = {str(path).replace('\\', '/') for path in product.files or ()}
        assert package + '/__init__.py' in entries, name
        module = importlib.import_module(package)
        assert Path(module.__file__).resolve() == Path(product.locate_file(package + '/__init__.py')).resolve()
        foreign = {'contracts', 'netcircuit_sim', 'hardware_service', 'app'} - {package}
        assert not any(entry.split('/')[0] in foreign for entry in entries), name
    from contracts.resources import resource_json
    assert resource_json('manifest.json')
    assert resource_json('catalog-source/editor/components.json')['components']
    interface = interface_root()
    identity = json.loads((interface / 'interface-artifact.json').read_text(encoding='utf-8'))
    assert identity['name'] == 'netcircuit-interface'
    assert not any((interface / 'src' / package).exists() for package in owners.values())
    from scripts.fpga_artifact import source_product
    fpga = source_product()
    assert fpga['identity']['name'] == 'netcircuit-fpga-scaffold'
    assert fpga['identity']['version'] == '0.1.1'
    remote = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))['project']
    api = tomllib.loads((ROOT / 'services/api/pyproject.toml').read_text(encoding='utf-8'))['project']
    assert remote['name'] == 'netcircuit-remote-dev' and remote['version'] == '0.1.1'
    assert api['name'] == 'netcircuit-api' and api['version'] == '0.1.1'
    assert 'netcircuit-contracts==0.1.1' in api['dependencies']
    assert 'netcircuit-simulator==0.1.1' in api['dependencies']
    assert not any(value.startswith('netcircuit-hardware') for value in api['dependencies'])


def test_frontend_contains_no_physical_transport_references():
    web=interface_root() / 'src'
    text='\n'.join(p.read_text(errors='ignore').lower() for p in web.rglob('*') if p.is_file())
    forbidden=['/dev/spidev','fpga_register','register_map','mux_address','raw_mux']
    for marker in forbidden:
        assert marker not in text, marker


def test_ci_workflows_exist_for_each_subsystem():
    workflows=ROOT/'.github/workflows'
    required=['frontend.yml','backend.yml','hardware-service.yml','simulator.yml','integration.yml','docs.yml','fpga.yml']
    missing=[name for name in required if not (workflows/name).is_file()]
    assert not missing, missing

def test_frontend_workflow_provisions_pytest_for_python_boundary_check():
    document=yaml.safe_load((ROOT/'.github/workflows/frontend.yml').read_text(encoding='utf-8'))
    steps=document['jobs']['build']['steps']
    assert any(step.get('uses')=='actions/setup-python@v5' for step in steps)
    commands='\n'.join(step.get('run','') for step in steps)
    assert 'python -m pip install -r requirements-verification.txt' in commands
    pins=(ROOT/'requirements-verification.txt').read_text(encoding='utf-8')
    assert re.search(r'(?m)^pytest==[0-9]+\.[0-9]+\.[0-9]+$',pins)
    assert 'python -m pytest -q tests/frontend' in commands
