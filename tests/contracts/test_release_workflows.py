"""Shared contract changes must reach each real consumer's independent gate."""
from fnmatch import fnmatchcase
from pathlib import Path
import tomllib
import yaml
import pytest

ROOT=Path(__file__).resolve().parents[2]
SHARED=('contracts/public/auth.schema.json','contracts/signal_domains.py','contracts/capture/layout.json',
    'contracts/hardware/v2/rpc_v2.proto','scripts/generate_python_contracts.py',
    'device-library/parts/physical-parts.json','pyproject.toml','requirements-codegen.txt',
    'requirements-verification.txt','requirements-benchmark.txt','setup.py','MANIFEST.in','Makefile','.gitattributes')


def workflow(name):
    path=ROOT/'.github/workflows'/name
    assert path.exists(),f'Independent workflow {name} is missing.'
    return yaml.safe_load(path.read_text(encoding='utf-8'))


def assert_shared_coverage(data,name):
    events=data.get('on',data.get(True))
    for event in ('push','pull_request'):
        configuration=events[event]
        patterns=configuration.get('paths') if configuration else None
        for path in SHARED:
            assert patterns is None or any(fnmatchcase(path,pattern) for pattern in patterns),(name,event,path)


@pytest.mark.parametrize('name',['contracts.yml','backend.yml','hardware-service.yml','simulator.yml','frontend.yml','integration.yml'])
def test_shared_changes_trigger_the_contract_gate_and_every_consumer(name):
    assert_shared_coverage(workflow(name),name)


def test_contract_workflow_checks_artifacts_compatibility_and_outside_packages():
    data=workflow('contracts.yml');commands='\n'.join(step.get('run','') for job in data['jobs'].values() for step in job['steps'])
    assert 'check_release.py --group contracts' in commands
    assert 'check_contract_package.py' in commands
    assert 'npm ci' in commands and 'requirements-verification.txt' in commands


def test_contract_workflow_triggers_browser_compiler_and_runner_configuration():
    data=workflow('contracts.yml');events=data.get('on',data.get(True))
    for event in ('push','pull_request'):
        for path in ('apps/web/tsconfig.json','apps/web/tsconfig.e2e.json','apps/web/vite.config.ts','apps/web/playwright.config.ts'):
            assert any(fnmatchcase(path,pattern) for pattern in events[event]['paths']),(event,path)


def test_api_consumer_installs_the_local_simulator_and_uses_compatible_wire_runtimes():
    commands='\n'.join(step.get('run','') for step in workflow('backend.yml')['jobs']['test']['steps'])
    assert 'simulator/circuit-simulator' in commands
    for relative in ('services/api/pyproject.toml','services/hardware-service/pyproject.toml'):
        metadata=tomllib.loads((ROOT/relative).read_text(encoding='utf-8'))
        assert 'grpcio==1.84.0' in metadata['project']['dependencies']
        assert 'protobuf==7.36.2' in metadata['project']['dependencies']
    api=tomllib.loads((ROOT/'services/api/pyproject.toml').read_text(encoding='utf-8'))
    assert 'fastapi==0.143.0' in api['project']['dependencies']


def test_postgres_workflow_executes_the_explicit_no_skip_migration_and_race_suite():
    data=workflow('integration.yml');jobs=data['jobs']
    candidates=[job for job in jobs.values() if any('postgres' in service.get('image','') for service in job.get('services',{}).values())]
    assert candidates,'The real PostgreSQL gate is missing.'
    commands='\n'.join(step.get('run','') for job in candidates for step in job['steps'])
    assert 'postgres_cases.py' in commands and 'postgresql-client-18' in commands
    assert any('NETCIRCUIT_TEST_POSTGRES_URL' in job.get('env',{}) for job in candidates)


def test_negative_shared_file_removal_is_detected_by_trigger_coverage():
    # The same assertion used by real workflows rejects the previous narrow gate.
    data=workflow('backend.yml');events=data.get('on',data.get(True))
    events['push']['paths']=['services/api/**','contracts/circuit-schema/**']
    with pytest.raises(AssertionError,match='auth.schema.json'):assert_shared_coverage(data,'backend.yml')


def test_shared_verification_installs_benchmark_process_cleanup_dependency():
    verification=(ROOT/'requirements-verification.txt').read_text(encoding='utf-8')
    assert '-r requirements-benchmark.txt' in verification
    assert 'psutil==7.2.2' in (ROOT/'requirements-benchmark.txt').read_text(encoding='utf-8')
