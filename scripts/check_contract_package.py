"""Install four wheels and exercise them physically outside the checkout.

Default scratch is the OS temporary directory; --temporary-root permits another
explicit writable external base. Build artifacts may stay in .build.
"""
import argparse
from contextlib import contextmanager
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory,gettempdir
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[1]
WHEEL_PROJECTS=('.','services/api','simulator/circuit-simulator','services/hardware-service')
REQUIRED_RESOURCES=(
    'contracts/manifest.json','contracts/profiles.json','contracts/boundary/models.py',
    'contracts/boundary/capture_layout.py','contracts/generated/rpc_v2_pb2.py','contracts/generated/rpc_v2_pb2_grpc.py',
    'contracts/api/openapi.json','contracts/capture/layout.json','contracts/capture/ncap.schema.json',
    'contracts/fixtures/capture/conformance.json','contracts/design-models/signal-port-catalog.json',
    'contracts/design-models/signal-domains.schema.json','contracts/signal_domains.py','contracts/capture_validation.py',
    'contracts/design-models/flexible-mount.schema.json','contracts/design-models/flexible-mechanics.json',
    'contracts/design-models/fixtures/flexible-mounting-parity.json','contracts/circuit-schema/circuit-v1.2.schema.json',
    'contracts/public/placement.schema.json','contracts/flexible_mounting.py',
    'contracts/public/assignments-v2.schema.json','contracts/fixtures/assignment-v2-conformance.json',
    'contracts/compatibility/2026-10-16/public-wire-baseline.json',
    'contracts/design-models/fixtures/physical-mounting-parity.json')


def verify_external_path(path,checkout=ROOT):
    target=Path(path).resolve();checkout=Path(checkout).resolve()
    if target==checkout or target.is_relative_to(checkout):
        raise ValueError('Installed package verification must run physically outside the checkout.')
    return target


def verify_contract_wheel(wheel):
    with ZipFile(wheel) as archive:present=set(archive.namelist())
    missing=sorted(set(REQUIRED_RESOURCES)-present)
    if missing:raise ValueError('Wheel resources missing: '+', '.join(missing))


def stage_project(project,target):
    """Rebuild from source with no cached build tree or ignored RPC bindings."""
    if project not in WHEEL_PROJECTS:raise ValueError('Unknown wheel project')
    source=ROOT/project;target=Path(target);target.mkdir(parents=True)
    names=('pyproject.toml','setup.py','MANIFEST.in','requirements-codegen.txt','LICENSE','README.md') if project=='.' else ('pyproject.toml','README.md')
    for name in names:
        if (source/name).is_file():shutil.copy2(source/name,target/name)
    package={'services/api':'app','services/hardware-service':'hardware_service','simulator/circuit-simulator':'netcircuit_sim'}.get(project,'contracts')
    shutil.copytree(source/package,target/package,ignore=shutil.ignore_patterns('__pycache__','*.pyc','generated','build','.build','*.egg-info'))
    if project=='.':
        (target/'scripts').mkdir()
        shutil.copy2(ROOT/'scripts/generate_hardware_rpc.py',target/'scripts/generate_hardware_rpc.py')
    return target


@contextmanager
def external_workspace(base=None):
    base=verify_external_path(base or gettempdir());base.mkdir(parents=True,exist_ok=True)
    owned=TemporaryDirectory(prefix='netcircuit-wheel-check-',dir=base)
    target=verify_external_path(owned.name)
    try:yield target
    finally:
        resolved=Path(owned.name).resolve()
        if resolved.parent!=base or resolved!=target or not resolved.name.startswith('netcircuit-wheel-check-'):
            raise RuntimeError('Refusing cleanup outside the explicitly owned package workspace.')
        owned.cleanup()


RUNTIME_PROBE=r'''
import importlib
from importlib.resources import files
import json
from pathlib import Path
import secrets
import sys

checkout=Path(sys.argv[1]).resolve()
assert sys.flags.isolated==1
assert not Path.cwd().resolve().is_relative_to(checkout)
assert not Path(sys.prefix).resolve().is_relative_to(checkout)
for path in sys.path:
    if path:assert not Path(path).resolve().is_relative_to(checkout),path
for name in ('contracts','app','netcircuit_sim','hardware_service'):
    module=importlib.import_module(name)
    assert module.__file__ and not Path(module.__file__).resolve().is_relative_to(checkout),name

from contracts.registry import check_manifest,validate_contract
from contracts.boundary.models import CircuitGraph,SimulationRequest,AnySupportedCircuitGraph
from contracts.design_validation import validate_design_graph
from contracts.generated import rpc_v2_pb2,rpc_v2_pb2_grpc
from contracts.physical_mounting import physical_parts
from contracts.capture_layout import CAPTURE_LAYOUT
from contracts.boundary.capture_layout import CAPTURE_LAYOUT as GENERATED_LAYOUT
from contracts.capture_codec import decode_digital,decode_sampled
from contracts.signal_domains import classify_graph
from contracts.public_compatibility import check_compatibility
from jsonschema import ValidationError
check_manifest()
resource=files('contracts')
check_compatibility(json.loads(resource.joinpath('api/openapi.json').read_text(encoding='utf-8')),
    json.loads(resource.joinpath('capture/layout.json').read_text(encoding='utf-8')),
    json.loads(resource.joinpath('compatibility/2026-10-16/public-wire-baseline.json').read_text(encoding='utf-8')))
graph={'schema_version':'1.1','circuit_id':'wheel','modules':[{'id':'D','type':'DIGITAL_SWITCH','properties':{'state':True}}],'connections':[],'metadata':{'retain':[None,True,10**50]}}
assert CircuitGraph.model_validate(graph).model_dump(exclude_unset=True)==graph
assert validate_contract('MemoryImage',{'version':'1.0','word_bits':8,'depth':1,'data':[0]})['data']==[0]
assert len(physical_parts())==63 and CAPTURE_LAYOUT==GENERATED_LAYOUT
assert {'SN74HC08N','RESISTOR_AXIAL','LED_LTL307EE','GENERIC_RESISTOR','GENERIC_LED'}<={part['editorType'] for part in physical_parts()}
placement=json.loads(resource.joinpath('design-models/fixtures/flexible-mounting-parity.json').read_text(encoding='utf-8'))
for case in placement['cases']:
    if case['valid']:
        validate_design_graph(case['graph'])
        assert AnySupportedCircuitGraph.model_validate(case['graph']).model_dump(exclude_unset=True)==case['graph']
assignment_cases=json.loads(resource.joinpath('fixtures/assignment-v2-conformance.json').read_text(encoding='utf-8'))
for case in assignment_cases['cases']:
    if case['valid']:assert validate_contract(case['contract'],case['value'])==case['value']
assert classify_graph(graph)['kind']=='DIGITAL'
assert rpc_v2_pb2.ClockConfiguration(period_ns=4294967295).period_ns==4294967295
assert rpc_v2_pb2_grpc.HardwareServiceStub is not None
try:validate_contract('ClockConfiguration',{'signal':'C.OUT','period_ns':4294967296,'cycles':1},profile='transport')
except ValidationError:pass
else:raise AssertionError('RPC overflow accepted')
corpus=json.loads(files('contracts').joinpath('fixtures/capture/conformance.json').read_text(encoding='utf-8'))
versions=set()
for case in corpus['cases']:
    if not case['valid']:continue
    versions.add(case['version']);payload=bytes.fromhex(case['payload_hex'])
    result=decode_digital(payload) if case['version']==1 else decode_sampled(payload,case['descriptor'])
    assert result['samples']==case['expected']['samples']
assert versions=={1,2}

from netcircuit_sim.dispatch import SimulationDispatcher
request=SimulationRequest.model_validate({'schema_version':'1.0','graph':graph,'capture_config':{'signals':['D.OUT'],'duration_ns':20}})
assert SimulationDispatcher().simulate(request).model_dump(exclude_unset=True)['capture']['samples']==[{'signal':'D.OUT','time_ns':0,'value':1}]
from hardware_service.station.virtual import VirtualHardwareStation
station=VirtualHardwareStation('wheel-virtual')
assert station.apply_circuit(graph)['accepted'] is True
assert station.get_capabilities().virtual_analog is False

from app.main import create_app
from app.config import Settings
schema=create_app(schema_only=True,configuration=Settings(database_url='not-a-runtime-database',hardware_grpc_target='unavailable-hardware:1'))
assert not hasattr(schema.state,'repository')
assert {'/api/projects','/api/auth/session','/api/assignment-documents','/api/v2/circuits/{document_id}','/api/v2/experiments','/api/v2/assignment-documents','/api/v2/assignments/{assignment_id}'}<=set(schema.openapi()['paths'])
from app.migrations import HEAD
from app.services.persistence import Repository
from app.services.auth import AuthService
from app.services.projects import ProjectService
from app.services.captures import CaptureService
from app.services.capture_store import FilesystemCaptureStore
from app.services.capture_maintenance import expire_payloads
repo=Repository('sqlite:///installed-runtime.sqlite')
auth=AuthService(repo,Settings());password=secrets.token_urlsafe(32)
auth.bootstrap_admin('installed-admin',password)
guest,_=auth.ensure_session(None);admin,_=auth.login(guest,'installed-admin',password)
projects=ProjectService(repo,authorize_session=auth.require_principal_session)
project=projects.create_project(admin.owner_id,{'name':'Installed project'},auth_session_id=admin.session_id)
document=projects.create_circuit(admin.owner_id,project['project_id'],{'name':'Original','graph':graph},auth_session_id=admin.session_id)
assert projects.get_circuit(admin.owner_id,document['document_id'])['graph']==graph
store=FilesystemCaptureStore('captures');capture=CaptureService(store).persist({'available':True,'duration_ns':10,'samples':[{'signal':'y','time_ns':0,'value':1}]},'simulation')
record={'experiment_id':'installed','state':'COMPLETE','revision':1,'capture':None}
repo.create_experiment(admin.owner_id,record);repo.save_experiment({**record,'capture':capture})
retired=repo.retire_capture(capture['capture_id'],admin.owner_id,auth_session_id=admin.session_id,authorize_session=auth.require_principal_session)
assert retired['changed'] and not retired['metadata']['available']
assert expire_payloads(repo,store,retention_seconds=0)['deleted']==1
assert not repo.capture_reference(capture['capture_id'])['cleanup_pending']
repo.close()
print(json.dumps({'installed_packages':4,'capture_versions':sorted(versions),'migration':HEAD,'outside_checkout':True,'isolated':sys.flags.isolated==1},sort_keys=True))
'''


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--temporary-root',type=Path)
    arguments=parser.parse_args(argv)
    workspace=ROOT/'.build';workspace.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix='package-build-',dir=workspace) as build,external_workspace(arguments.temporary_root) as target:
        build=Path(build);dist=build/'dist';dist.mkdir()
        log_path=workspace/f'package-check-{os.getpid()}.log'
        def checked(command,*,cwd):
            with log_path.open('ab+') as log:
                log.write((f'\nCommand: {command!r}\nWorking directory: {cwd}\n').encode('utf-8'))
                log.flush();start=log.tell()
                completed=subprocess.run(command,cwd=cwd,env=environment,stdout=log,stderr=subprocess.STDOUT)
                if completed.returncode:
                    log.flush();end=log.tell();log.seek(max(start,end-16000))
                    output=log.read().decode('utf-8',errors='replace')
                    raise RuntimeError(f'Installed package verification failed ({completed.returncode}). '
                        f'Command: {command!r}\nWorking directory: {cwd}\n'
                        f'Last command output (up to 16000 bytes):\n{output}\nFull log: {log_path}')
        environment={key:value for key,value in os.environ.items() if key not in {'PYTHONPATH','PYTHONHOME','PYTHONUSERBASE','VIRTUAL_ENV','PIP_TARGET','PIP_PREFIX'}}
        environment.update(TMP=str(target),TEMP=str(target),NETCIRCUIT_ENV='test',NETCIRCUIT_ALLOW_GUEST='true')
        for project in WHEEL_PROJECTS:
            staged=stage_project(project,build/'source'/('contracts' if project=='.' else Path(project).name))
            checked([sys.executable,'-m','build','--wheel','--no-isolation','--outdir',str(dist)],cwd=staged)
        wheels=sorted(dist.glob('*.whl'))
        if len(wheels)!=len(WHEEL_PROJECTS):raise ValueError('Expected exactly four distinct package wheels.')
        contracts=next(wheel for wheel in wheels if wheel.name.startswith('netcircuit_contracts-'))
        verify_contract_wheel(contracts)
        api=next(wheel for wheel in wheels if wheel.name.startswith('netcircuit_api-'))
        with ZipFile(api) as archive:
            for resource in ('app/migrations/versions/0005_captures.py','app/migrations/schema_v0005.py','app/db/schema.py','app/migrate.py','app/bootstrap_admin.py','app/capture_maintenance.py'):
                if resource not in archive.namelist():raise ValueError('API wheel resource missing: '+resource)
        checked([sys.executable,'-m','venv',str(target/'venv')],cwd=target)
        python=target/'venv'/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
        checked([str(python),'-I','-m','pip','--isolated','install','--disable-pip-version-check','--cache-dir',str(workspace/'pip-cache'),
                        *(str(wheel)+'[rpc]' if wheel==contracts else str(wheel) for wheel in wheels)],cwd=target)
        probe=target/'installed_probe.py';probe.write_text(RUNTIME_PROBE,encoding='utf-8')
        checked([str(python),'-I',str(probe),str(ROOT)],cwd=target)
        environment['NETCIRCUIT_DATABASE_URL']='sqlite:///'+(target/'installed-cli.sqlite').as_posix()
        environment['NETCIRCUIT_CAPTURE_DIR']=str(target/'cli-captures')
        for arguments in (['app.migrate'],['app.migrate','--check'],['app.bootstrap_admin','--help'],['app.capture_maintenance','--dry-run','--limit','1']):
            checked([str(python),'-I','-m',*arguments],cwd=target)
        print(f'Clean installed wheels PASS: isolated Python, cwd and venv outside checkout ({target.parent}); migrations/CLI/domain/NCAP1+2/RPC/resources. Log: {log_path}')


if __name__=='__main__':main()
