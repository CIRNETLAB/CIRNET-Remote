from pathlib import Path
import re
import yaml

ROOT=Path(__file__).resolve().parents[2]


def test_major_subsystem_roots_exist():
    required=[
        'apps/web', 'services/api', 'services/hardware-service',
        'simulator/circuit-simulator', 'fpga', 'contracts',
        'device-library', 'deployment', 'docs'
    ]
    missing=[p for p in required if not (ROOT/p).exists()]
    assert not missing, missing


def test_frontend_contains_no_physical_transport_references():
    web=ROOT/'apps/web/src'
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
