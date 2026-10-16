"""Structured metadata is useful without logging credentials or private evidence."""
import json
import logging
from pathlib import Path
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.services.observability import correlation,current_correlation,log_event


def events(caplog):
    return [json.loads(record.getMessage()) for record in dict.fromkeys(caplog.records) if record.name=='netcircuit.api']


@pytest.fixture(autouse=True)
def direct_capture(caplog):
    logger=logging.getLogger('netcircuit.api')
    logger.addHandler(caplog.handler)
    try:yield
    finally:logger.removeHandler(caplog.handler)


def test_allowlisted_events_never_serialize_headers_sessions_credentials_or_payloads(caplog):
    caplog.set_level(logging.INFO,logger='netcircuit.api')
    private='PRIVATE_CREDENTIAL_GRAPH_EVIDENCE_SENTINEL'
    with correlation(request_id='request-1',experiment_id='experiment-1',session_id=private):
        log_event('capture.sealed',capture_id='capture-1',revision=2,session_id=private,
                  cookie=private,password=private,authorization=private,csrf_token=private,
                  graph={'private':private},payload=private,configuration=private,exception=RuntimeError(private))
    assert events(caplog)==[{'event':'capture.sealed','request_id':'request-1','experiment_id':'experiment-1','capture_id':'capture-1','revision':2}]
    assert private not in caplog.text
    assert current_correlation()=={}


def test_context_is_detached_nested_and_restored_without_cross_thread_leakage(caplog):
    caplog.set_level(logging.INFO,logger='netcircuit.api')
    with correlation(request_id='outer'):
        changed=current_correlation();changed['request_id']='mutated'
        with correlation(experiment_id='experiment-1'):log_event('experiment.transition',state='RUNNING')
        assert current_correlation()=={'request_id':'outer'}
        with ThreadPoolExecutor(max_workers=1) as executor:
            assert executor.submit(current_correlation).result(timeout=2)=={}
    assert events(caplog)[0]['request_id']=='outer'


def test_unknown_fields_and_invalid_metadata_are_dropped_without_breaking_control(caplog):
    caplog.set_level(logging.INFO,logger='netcircuit.api')
    log_event('http.completed',request_id='bad\nidentifier',status=200,duration_ms=float('nan'),
              route='/api/experiments/{experiment_id}',path='/private/raw/path',error_code='arbitrary-secret-text',count={'nested':'secret'})
    assert events(caplog)==[{'event':'http.completed','status':200,'route':'/api/experiments/{experiment_id}'}]


def test_http_logs_templates_and_correlation_without_raw_paths_credentials_or_unexpected_exception_text(caplog):
    from app.main import create_app
    from app.services.persistence import Repository
    from test_lab_lifecycle import LabGateway,DeferredJobs
    from csrf_client import CsrfTestClient
    caplog.set_level(logging.INFO,logger='netcircuit.api')
    application=create_app(repository=Repository('sqlite://'),gateway=LabGateway(),submit=DeferredJobs())
    private='PRIVATE_HTTP_PATH_PASSWORD_SENTINEL'
    with CsrfTestClient(application) as client:
        # Credentials are installed by explicit bootstrap, never an ordinary
        # read whose late response could overwrite a newer login cookie.
        assert client.get('/api/auth/session').status_code==200
        cookie=client.cookies.get('netcircuit_session')
        assert isinstance(cookie,str) and cookie
        reply=client.get('/api/unknown/'+private,headers={'X-Request-ID':'trace-request'})
        assert reply.status_code==404 and reply.headers['X-Request-ID']=='trace-request'
        def unexpected(*_,**__):raise RuntimeError(private)
        application.state.manager.history=unexpected
        failure=client.get('/api/experiments/history',headers={'X-Request-ID':'failure-request'})
        assert failure.status_code==500 and failure.json()['code']=='INTERNAL_ERROR'
    trace=events(caplog)
    assert any(event.get('event')=='http.completed' and event.get('request_id')=='trace-request' and event.get('route')=='/unmatched' for event in trace)
    assert any(event.get('event')=='http.error' and event.get('request_id')=='failure-request' and event.get('error_code')=='INTERNAL_ERROR' for event in trace)
    assert private not in caplog.text and cookie not in caplog.text


def test_real_worker_lifecycle_correlates_create_run_operation_and_sealed_capture(tmp_path,caplog):
    from test_lab_lifecycle import setup_manager,create
    caplog.set_level(logging.INFO,logger='netcircuit.api')
    manager,repo,_,jobs,_,_=setup_manager(tmp_path)
    try:
        with correlation(request_id='create-request'):
            record=manager.create('student-1',{'station_id':'p1','assignment_id':'a1'},operation_key='create-key')
        identity=record['experiment_id']
        with correlation(request_id='run-request'):
            manager.run(identity,'student-1',operation_key='run-key')
        # A real separate thread has no implicit ContextVar inheritance.
        with ThreadPoolExecutor(max_workers=1) as executor:executor.submit(jobs.run_one).result(timeout=5)
        capture=manager.get(identity,'student-1')['capture']
        trace=events(caplog)
        assert any(event.get('event')=='experiment.created' and event.get('request_id')=='create-request' and event.get('experiment_id')==identity for event in trace)
        assert any(event.get('event')=='operation.changed' and event.get('operation_key')=='run-key' for event in trace)
        assert any(event.get('event')=='experiment.transition' and event.get('state')=='RUNNING' and event.get('request_id')=='run-request' and event.get('experiment_id')==identity for event in trace)
        assert any(event.get('event')=='capture.sealed' and event.get('capture_id')==capture['capture_id'] and event.get('experiment_id')==identity and event.get('request_id')=='run-request' for event in trace)
        assert current_correlation()=={}
    finally:manager.close();repo.close()


@pytest.mark.parametrize('safe',[True,False])
def test_recovery_state_and_durable_audit_commit_together_and_failed_save_leaves_no_audit(tmp_path,monkeypatch,safe):
    from sqlalchemy import insert,select
    from test_lab_lifecycle import setup_manager,create
    from app.services.experiments import ExperimentManager
    manager,repo,gateway,_,_,_=setup_manager(tmp_path)
    identity=create(manager)['experiment_id'];value=repo.get_experiment(identity)
    value.update(state='RUNNING',state_history=['CREATED','RUNNING']);repo.save_experiment(value)
    with repo.engine.begin() as db:db.execute(insert(repo.lease_table).values(station_id='p1',slot=0,experiment_id=identity,expires_at=0,quarantined=False))
    manager.closed=True
    original=gateway.call
    def reply(station,eid,method,**kwargs):
        if method=='stop_execution':return {'accepted':safe,'hardware_applied':safe}
        return original(station,eid,method,**kwargs)
    gateway.call=reply
    recovered=ExperimentManager(repo,gateway,submit=lambda *_:None)
    try:
        with repo.engine.connect() as db:rows=list(db.execute(select(repo.audit.c.action,repo.audit.c.subject_id)).all())
        assert ('EXPERIMENT_RESTART_RECOVERED' if safe else 'EXPERIMENT_RESTART_QUARANTINED',identity) in rows
        baseline=repo.get_experiment(identity)
        import app.services.capture_repository as catalog
        def fail(*_):raise RuntimeError('fixture transaction rollback')
        monkeypatch.setattr(catalog,'sync_capture',fail)
        with pytest.raises(RuntimeError,match='rollback'):
            repo.recover_experiment({**baseline,'revision':baseline['revision']+1},safe=False)
        assert repo.get_experiment(identity)==baseline
        with repo.engine.connect() as db:assert len(list(db.execute(select(repo.audit)).all()))==len(rows)
    finally:recovered.close();repo.close()


def test_saturated_logging_queue_drops_metadata_instead_of_waiting_for_stream_io():
    from queue import Queue
    from app.services.observability import _BoundedHandler
    queue=Queue(maxsize=1);queue.put(logging.makeLogRecord({'msg':'queued'}));handler=_BoundedHandler(queue)
    with ThreadPoolExecutor(max_workers=1) as executor:
        executor.submit(handler.enqueue,logging.makeLogRecord({'msg':'bounded'})).result(timeout=.5)
    assert queue.qsize()==1 and handler.dropped==1


def test_recovery_audit_insert_failure_rolls_back_the_state_change():
    from sqlalchemy import event,select
    from sqlalchemy.sql.dml import Insert
    from app.services.persistence import Repository
    from test_capture_catalog import experiment
    repo=Repository('sqlite://');baseline=experiment();repo.create_experiment('historical-owner',baseline)
    def fail_audit(connection,clauseelement,*args):
        if isinstance(clauseelement,Insert) and clauseelement.table.name==repo.audit.name:raise RuntimeError('fixture audit failure')
    event.listen(repo.engine,'before_execute',fail_audit)
    try:
        with pytest.raises(RuntimeError,match='audit failure'):
            repo.recover_experiment({**baseline,'revision':3,'state':'FAULT','error_code':'RESTART_RECOVERY','lease_expires_at':None},safe=True)
        assert repo.get_experiment('e1')==baseline
        with repo.engine.connect() as db:assert list(db.execute(select(repo.audit)))==[]
    finally:event.remove(repo.engine,'before_execute',fail_audit);repo.close()


@pytest.mark.parametrize('safe',[True,False])
def test_restart_recovery_audit_failure_retains_lease_for_retry_without_replaying_start(tmp_path,safe):
    from sqlalchemy import event,insert,select
    from sqlalchemy.sql.dml import Insert
    from app.services.experiments import ExperimentManager
    from test_lab_lifecycle import setup_manager,create
    manager,repo,gateway,_,_,_=setup_manager(tmp_path)
    identity=create(manager)['experiment_id'];baseline=repo.get_experiment(identity)
    baseline.update(state='RUNNING',state_history=['CREATED','RUNNING']);repo.save_experiment(baseline)
    with repo.engine.begin() as db:
        db.execute(insert(repo.lease_table).values(station_id='p1',slot=0,experiment_id=identity,expires_at=0,quarantined=False))
    manager.closed=True
    original=gateway.call
    def reply(station,eid,method,**kwargs):
        if method=='stop_execution':
            gateway.calls.append(method)
            return {'accepted':safe,'hardware_applied':safe}
        return original(station,eid,method,**kwargs)
    gateway.call=reply
    leases=repo.leases()
    def fail_audit(connection,clauseelement,*args):
        if isinstance(clauseelement,Insert) and clauseelement.table.name==repo.audit.name:raise RuntimeError('fixture recovery audit failure')
    event.listen(repo.engine,'before_execute',fail_audit)
    try:
        with pytest.raises(RuntimeError,match='recovery audit failure'):
            ExperimentManager(repo,gateway,submit=lambda *_:None)
        assert repo.get_experiment(identity)==baseline
        assert repo.leases()==leases
        with repo.engine.connect() as db:assert list(db.execute(select(repo.audit)))==[]
    finally:event.remove(repo.engine,'before_execute',fail_audit)
    recovered=ExperimentManager(repo,gateway,submit=lambda *_:None)
    try:
        record=repo.get_experiment(identity)
        assert record['state']=='FAULT' and record['error_code']=='RESTART_RECOVERY'
        assert repo.leases()==([] if safe else [{**leases[0],'quarantined':True}])
        with repo.engine.connect() as db:
            assert list(db.execute(select(repo.audit.c.action,repo.audit.c.subject_id)))==[
                ('EXPERIMENT_RESTART_RECOVERED' if safe else 'EXPERIMENT_RESTART_QUARANTINED',identity)]
        assert gateway.calls.count('stop_execution')==2
        assert 'start_execution' not in gateway.calls
    finally:recovered.close();repo.close()


def test_runtime_subprocess_enables_json_info_and_correlates_a_real_worker_without_import_side_effects(tmp_path):
    root=Path(__file__).resolve().parents[3]
    script=tmp_path/'runtime_observability.py'
    script.write_text('''import json,logging,sys,time
from pathlib import Path
sys.path.insert(0,TESTS)
import app.main as main
import app.services.observability as observation
assert observation._runtime is None
assert not logging.getLogger('netcircuit.api').handlers
main.create_app(schema_only=True).openapi()
assert observation._runtime is None
from app.services.persistence import Repository
from app.services.capture_store import FilesystemCaptureStore
from test_lab_lifecycle import LabGateway,assignment
from csrf_client import CsrfTestClient,publish_fixture_assignment
application=main.create_app(repository=Repository('sqlite://'),gateway=LabGateway(),capture_store=FilesystemCaptureStore(CAPTURES))
fixture=assignment();fixture['title']='PRIVATE_SUBPROCESS_SENTINEL'
publish_fixture_assignment(application,fixture)
with CsrfTestClient(application) as client:
    denied=client.post('/api/auth/login',json={'username':'PRIVATE_SUBPROCESS_SENTINEL','password':'PRIVATE_SUBPROCESS_SENTINEL'},headers={'X-Request-ID':'login-request'})
    assert denied.status_code==401
    created=client.post('/api/experiments',json={'station_id':'physical-station-01','assignment_id':'a1'},headers={'X-Request-ID':'create-request','Idempotency-Key':'create-once'})
    assert created.status_code==201,created.text
    identity=created.json()['experiment_id']
    started=client.post('/api/experiments/'+identity+'/run',headers={'X-Request-ID':'run-request','Idempotency-Key':'run-once'})
    assert started.status_code==200,started.text
    deadline=time.monotonic()+5
    while True:
        record=application.state.manager.get(identity,application.state.repository.owner(identity))
        if record['state'] in ('COMPLETE','FAULT') and record['lease_expires_at'] is None:break
        assert time.monotonic()<deadline
        time.sleep(.01)
    assert record['state']=='COMPLETE',record['error_code']
    capture=record['capture']['capture_id']
    response=client.get('/api/captures/'+capture+'/payload',headers={'X-Request-ID':'capture-request'})
    assert response.status_code==200
observation.flush_logging(2)
print(json.dumps({'experiment_id':identity,'capture_id':capture}))
'''.replace('TESTS',repr(str(root/'services/api/tests'))).replace('CAPTURES',repr(str(tmp_path/'captures'))),encoding='utf-8')
    result=subprocess.run([sys.executable,str(script)],cwd=root,capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stderr
    ids=json.loads(result.stdout)
    trace=[]
    for line in result.stderr.splitlines():
        try:value=json.loads(line)
        except ValueError:continue
        if isinstance(value,dict) and 'event' in value:trace.append(value)
    assert any(event.get('event')=='http.completed' and event.get('request_id')=='create-request' for event in trace)
    assert any(event.get('event')=='operation.changed' and event.get('operation_key')=='run-once' for event in trace)
    assert any(event.get('event')=='capture.sealed' and event.get('capture_id')==ids['capture_id'] and event.get('experiment_id')==ids['experiment_id'] and event.get('request_id')=='run-request' for event in trace)
    assert any(event.get('event')=='capture.read' and event.get('capture_id')==ids['capture_id'] and event.get('request_id')=='capture-request' for event in trace)
    assert 'PRIVATE_SUBPROCESS_SENTINEL' not in result.stdout+result.stderr
