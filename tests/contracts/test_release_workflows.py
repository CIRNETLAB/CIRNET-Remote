"""Shared contract changes must reach each real consumer's independent gate."""
from fnmatch import fnmatchcase
from copy import deepcopy
from pathlib import Path
import tomllib
import yaml
import pytest

ROOT=Path(__file__).resolve().parents[2]
SHARED=('contracts/public/auth.schema.json','contracts/signal_domains.py','contracts/capture/layout.json',
    'contracts/hardware/v2/rpc_v2.proto','scripts/generate_python_contracts.py',
    'device-library/parts/physical-parts.json','pyproject.toml','requirements-codegen.txt',
    'requirements-verification.txt','requirements-benchmark.txt','setup.py','MANIFEST.in','Makefile','.gitattributes')

OWNED_PYTEST_JOBS=(('backend.yml','test'),('hardware-service.yml','test'),('frontend.yml','build'),
    ('integration.yml','repository-contracts'),('integration.yml','postgresql-migrations'),
    ('contracts.yml','canonical-boundaries'),('docs.yml','context'))


def assert_owned_test_runtime(job):
    steps=job['steps']
    allocation=next((index for index,step in enumerate(steps) if 'ci_runtime=' in step.get('run','')),None)
    assert allocation is not None,'job must allocate owned application defaults before verification'
    assert steps[allocation].get('env',{}).get('NETCIRCUIT_ARTIFACTS_DIR','').startswith('${{ runner.temp }}/'), 'allocator parent must be runner.temp in step env; job env cannot use runner context'
    command=steps[allocation]['run']
    assert 'NETCIRCUIT_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)"\n' in command
    assert 'export NETCIRCUIT_ARTIFACTS_SESSION\n' in command
    assert 'export NETCIRCUIT_ARTIFACTS_SESSION=' not in command,'export must not mask allocator failure'
    session_export='echo "NETCIRCUIT_ARTIFACTS_SESSION=$NETCIRCUIT_ARTIFACTS_SESSION" >> "$GITHUB_ENV"'
    assert command.index(session_export)<command.index('ci_runtime='),'publish ownership before any later allocation can fail'
    for variable in ('NETCIRCUIT_ARTIFACTS_SESSION','NETCIRCUIT_DATABASE_URL','NETCIRCUIT_CAPTURE_DIR'):
        assert 'echo "'+variable+'=' in command and '"$GITHUB_ENV"' in command,variable
    assert 'sqlite:///$ci_runtime/default.sqlite' in command and '$ci_runtime/captures' in command
    assert any(index<allocation and step.get('uses','').startswith('actions/setup-node@')
        and step.get('with',{}).get('node-version')=='22' for index,step in enumerate(steps)),'pinned Node must precede allocator'
    writers=[(index,step['run']) for index,step in enumerate(steps) if any(marker in step.get('run','')
        for marker in ('pytest -q','check_release.py --group','npm test'))]
    assert writers and all(index>allocation for index,_ in writers),'verification ran before isolated defaults'
    for _,run in writers:
        if 'pytest -q' in run:assert '--basetemp "$NETCIRCUIT_ARTIFACTS_SESSION/pytest"' in run,'pytest must use the owned session'
    cleanup=next(((index,step) for index,step in enumerate(steps) if '--cleanup' in step.get('run','')),None)
    assert cleanup is not None,'owned session cleanup is missing'
    index,step=cleanup
    assert index>max(index for index,_ in writers)
    assert step.get('if')=="always() && env.NETCIRCUIT_ARTIFACTS_SESSION != ''",'cleanup must run after failures'
    assert 'node scripts/artifact-paths.mjs --cleanup "$NETCIRCUIT_ARTIFACTS_SESSION"' in step['run']
    assert not step.get('continue-on-error',False)


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


@pytest.mark.parametrize('name,job_id',OWNED_PYTEST_JOBS)
def test_state_writing_ci_jobs_isolate_defaults_pytest_and_owned_cleanup(name,job_id):
    assert_owned_test_runtime(workflow(name)['jobs'][job_id])


def test_owned_runtime_gate_rejects_missing_capture_default_and_success_only_cleanup():
    job=workflow('backend.yml')['jobs']['test']
    missing=deepcopy(job)
    allocation=next(step for step in missing['steps'] if 'ci_runtime=' in step.get('run',''))
    allocation['run']='\n'.join(line for line in allocation['run'].splitlines() if 'NETCIRCUIT_CAPTURE_DIR' not in line)
    with pytest.raises(AssertionError,match='NETCIRCUIT_CAPTURE_DIR'):assert_owned_test_runtime(missing)
    unsafe=deepcopy(job)
    next(step for step in unsafe['steps'] if '--cleanup' in step.get('run',''))['if']='success()'
    with pytest.raises(AssertionError,match='cleanup must run after failures'):assert_owned_test_runtime(unsafe)


def test_owned_runtime_gate_rejects_runner_context_at_job_scope():
    job=deepcopy(workflow('backend.yml')['jobs']['test'])
    allocation=next(step for step in job['steps'] if 'ci_runtime=' in step.get('run',''))
    job.setdefault('env',{})['NETCIRCUIT_ARTIFACTS_DIR']=allocation.pop('env',{}).get(
        'NETCIRCUIT_ARTIFACTS_DIR','${{ runner.temp }}/netcircuit-verification')
    with pytest.raises(AssertionError,match='job env cannot use runner context'):
        assert_owned_test_runtime(job)


def test_postgres_job_keeps_real_database_gate_while_isolating_only_application_defaults():
    job=workflow('integration.yml')['jobs']['postgresql-migrations']
    assert job['env']['NETCIRCUIT_TEST_POSTGRES_URL'].startswith('postgresql+psycopg://')
    assert 'postgres:18.6' in {service['image'] for service in job['services'].values()}
    commands='\n'.join(step.get('run','') for step in job['steps'])
    assert 'services/api/tests/postgres_cases.py' in commands
    assert 'NETCIRCUIT_TEST_POSTGRES_URL=' not in commands
