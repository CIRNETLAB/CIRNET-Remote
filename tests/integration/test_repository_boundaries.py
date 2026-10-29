from tests.support.release_inputs import interface_root, installed_distribution, sdk_resource
import importlib
import json
from pathlib import Path
import re
import tomllib
import pytest
import yaml

ROOT=Path(__file__).resolve().parents[2]
INTERFACE_CONTRACT_ADAPTERS = {'labelValidation.ts', 'structural.ts', 'validation.ts'}


def assert_interface_has_no_python_runtimes(interface):
    source = interface / 'src'
    for package in ('netcircuit_sim', 'hardware_service'):
        assert not (source / package).exists(), f'Interface contains foreign runtime {package}'
    assert not any(path.suffix.lower() in {'.py', '.pyc', '.pyo', '.pyd', '.so'}
                   for path in source.rglob('*') if path.is_file()), 'Interface contains Python runtime payload'
    # These are Interface-owned semantic TypeScript adapters, not the Python
    # Contracts distribution. Copied runtime/proto/generated files still fail.
    adapters = source / 'contracts'
    assert {path.relative_to(adapters).as_posix() for path in adapters.rglob('*') if path.is_file()} == INTERFACE_CONTRACT_ADAPTERS


def interface_adapter_tree(tmp_path):
    directory = tmp_path / 'src/contracts'; directory.mkdir(parents=True)
    for name in INTERFACE_CONTRACT_ADAPTERS:
        (directory / name).write_text('export {}\n', encoding='utf-8')
    return tmp_path


def test_interface_boundary_accepts_owned_typescript_contract_adapters(tmp_path):
    assert_interface_has_no_python_runtimes(interface_adapter_tree(tmp_path))


@pytest.mark.parametrize('relative', ['contracts/__init__.py', 'contracts/rpc.proto',
    'netcircuit_sim/__init__.py', 'hardware_service/rpc.py', 'private/runtime.py', 'contracts/native.pyd'])
def test_interface_boundary_rejects_copied_python_or_private_contract_payload(tmp_path, relative):
    interface = interface_adapter_tree(tmp_path)
    injected = interface / 'src' / relative; injected.parent.mkdir(parents=True, exist_ok=True)
    injected.write_bytes(b'# copied runtime\n')
    with pytest.raises(AssertionError):
        assert_interface_has_no_python_runtimes(interface)


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
    assert_interface_has_no_python_runtimes(interface)
    package = json.loads((interface / 'package.json').read_text(encoding='utf-8'))
    sdk_lock = json.loads((interface / 'integration/contracts-artifacts.json').read_text(encoding='utf-8'))
    assert package['dependencies']['@tinihi-labs/contracts'] == 'file:.artifacts/' + sdk_lock['npm']['filename']
    structural = (interface / 'src/contracts/structural.ts').read_text(encoding='utf-8')
    validation = (interface / 'src/contracts/validation.ts').read_text(encoding='utf-8')
    assert "from '@tinihi-labs/contracts/dto'" in validation
    for export, resource in [('dto', 'dto.d.ts'), ('validators.core', 'validators.core.js'),
                             ('validators.editor.core', 'validators.editor.core.js'),
                             ('validators.structural.core', 'validators.structural.core.js'),
                             ('public-contract-names', 'publicContractNames.js')]:
        assert "from '@tinihi-labs/contracts/" + export + "'" in structural
        assert sdk_resource(resource).is_file()  # archive SHA256 and installed bytes are checked
    from scripts.fpga_artifact import source_product
    fpga = source_product()
    assert fpga['identity']['name'] == 'netcircuit-fpga-scaffold'
    assert fpga['identity']['version'] == '0.1.1'
    remote = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))['project']
    api = tomllib.loads((ROOT / 'services/api/pyproject.toml').read_text(encoding='utf-8'))['project']
    assert remote['name'] == 'netcircuit-remote-dev' and remote['version'] == '0.1.2'
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
