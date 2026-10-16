"""Real bounded cleanup and its hardware-free CLI use the persistent catalog."""
import json
import os
from pathlib import Path
import subprocess
import sys
from sqlalchemy import insert,select
from contracts.capture_codec import encode_digital
from app.services.capture_maintenance import expire_payloads
from app.services.capture_store import FilesystemCaptureStore
from app.services.persistence import Repository
from test_capture_catalog import metadata,experiment

ROOT=Path(__file__).resolve().parents[3]


def seeded(tmp_path):
    database=tmp_path/'application.sqlite';directory=tmp_path/'captures'
    repository=Repository('sqlite:///'+database.as_posix());store=FilesystemCaptureStore(directory)
    binary=encode_digital([{'signal':'y','time_ns':0,'value':1}],10)
    for index,state in enumerate(('COMPLETE','FAULT','CAPTURING','FAULT')):
        identity=f'{index:032x}';capture=metadata(identity);capture['timestamp_ns']='0'
        store.put(capture,binary);repository.create_experiment('historical-owner',experiment(f'e{index}'))
        repository.save_experiment(experiment(f'e{index}',capture,state))
    with repository.engine.begin() as db:
        db.execute(insert(repository.lease_table).values(station_id='station',slot=0,experiment_id='e3',expires_at=0,quarantined=True))
    return repository,store,database,directory


def test_maintenance_dry_run_and_bounded_batches_preserve_active_and_quarantined_payloads(tmp_path):
    repo,store,_,directory=seeded(tmp_path)
    report=expire_payloads(repo,store,retention_seconds=1,limit=1,now=100,dry_run=True)
    assert report=={'scanned':1,'deleted':0,'failed':0,'dry_run':True}
    assert len(list(directory.glob('*.ncap')))==4 and repo.capture_reference('0'*32)['metadata']['available'] is True
    first=expire_payloads(repo,store,retention_seconds=1,limit=1,now=100)
    assert first=={'scanned':1,'deleted':1,'failed':0,'dry_run':False}
    second=expire_payloads(repo,store,retention_seconds=1,limit=100,now=100)
    assert second['deleted']==1 and len(list(directory.glob('*.ncap')))==2
    for index in (2,3):assert repo.capture_reference(f'{index:032x}')['metadata']['available'] is True
    with repo.engine.connect() as db:
        audits=list(db.execute(select(repo.audit.c.action,repo.audit.c.actor_id)).all())
    assert audits==[('CAPTURE_RETENTION',None),('CAPTURE_RETENTION',None)]


def test_failed_actual_filesystem_cleanup_keeps_tombstone_and_retries_when_expiry_disabled(tmp_path):
    repo,store,_,directory=seeded(tmp_path);identity='0'*32
    path=directory/(identity+'.ncap');binary=path.read_bytes();path.unlink();path.mkdir()
    report=expire_payloads(repo,store,retention_seconds=1,limit=1,now=100)
    assert report['failed']==1 and report['deleted']==0
    reference=repo.capture_reference(identity)
    assert reference['metadata']['available'] is False and reference['cleanup_pending'] is True
    path.rmdir();path.write_bytes(binary)
    retry=expire_payloads(repo,store,retention_seconds=0,limit=1,now=100)
    assert retry['deleted']==1 and retry['failed']==0 and not path.exists()
    assert repo.capture_reference(identity)['cleanup_pending'] is False
    assert repo.capture_reference(f'{1:032x}')['metadata']['available'] is True


def test_installed_cli_is_bounded_and_dry_run_never_initializes_hardware(tmp_path):
    repo,_,database,directory=seeded(tmp_path)
    environment={**os.environ,'NETCIRCUIT_ENV':'test','NETCIRCUIT_ALLOW_GUEST':'true',
        'NETCIRCUIT_DATABASE_URL':'sqlite:///'+database.as_posix(),'NETCIRCUIT_CAPTURE_DIR':str(directory),
        'NETCIRCUIT_CAPTURE_RETENTION_SECONDS':'1','NETCIRCUIT_HARDWARE_GRPC_TARGET':'not-a-loopback-hardware-target:1'}
    def invoke(*arguments):
        result=subprocess.run([sys.executable,'-m','app.capture_maintenance',*arguments],cwd=ROOT,env=environment,capture_output=True,text=True,timeout=20)
        assert result.returncode==0,'The isolated maintenance CLI failed.'
        return json.loads(result.stdout)
    assert invoke('--limit','1','--dry-run')=={'scanned':1,'deleted':0,'failed':0,'dry_run':True}
    assert len(list(directory.glob('*.ncap')))==4
    assert invoke('--limit','1')=={'scanned':1,'deleted':1,'failed':0,'dry_run':False}
    assert len(list(directory.glob('*.ncap')))==3
    assert repo.capture_reference(f'{2:032x}')['metadata']['available'] is True
    assert repo.capture_reference(f'{3:032x}')['metadata']['available'] is True
