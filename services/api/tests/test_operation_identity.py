"""Lost acknowledgements reconcile durable operations without replaying Run."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest

from app.services.persistence import Repository
from app.services.experiments import ExperimentManager
from test_lab_lifecycle import LabGateway, DeferredJobs, assignment


def setup(tmp_path):
    repo=Repository('sqlite:///'+str(tmp_path/'operations.db'))
    repo.create_assignment(assignment())
    jobs=DeferredJobs()
    manager=ExperimentManager(repo,LabGateway(),submit=jobs)
    return repo,manager,jobs


def test_create_lost_ack_is_durable_and_principal_scoped(tmp_path):
    repo,manager,jobs=setup(tmp_path)
    payload={'station_id':'physical-station-01','assignment_id':'a1'}
    first=manager.create('alice',payload,operation_key='lost-create')
    assert manager.create('alice',payload,operation_key='lost-create')['experiment_id']==first['experiment_id']
    assert len(repo.list_experiments('alice'))==1
    with pytest.raises(ValueError,match='IDEMPOTENCY_CONFLICT'):
        manager.create('alice',{**payload,'capture_config':{'signals':[],'duration_ns':1}},operation_key='lost-create')
    other=manager.create('bob',payload,operation_key='lost-create')
    assert other['experiment_id']!=first['experiment_id']
    manager.close(); repo.close()
    repo=Repository('sqlite:///'+str(tmp_path/'operations.db'))
    manager=ExperimentManager(repo,LabGateway(),submit=jobs)
    assert manager.create('alice',payload,operation_key='lost-create')['experiment_id']==first['experiment_id']
    assert manager.operation('alice','lost-create')['status']=='APPLIED'
    manager.close(); repo.close()


def test_concurrent_create_with_one_key_has_one_record(tmp_path):
    repo,manager,_=setup(tmp_path)
    payload={'station_id':'physical-station-01','assignment_id':'a1'}
    with ThreadPoolExecutor(max_workers=8) as pool:
        ids=list(pool.map(lambda _:manager.create('alice',payload,operation_key='same')['experiment_id'],range(12)))
    assert len(set(ids))==1
    assert len(repo.list_experiments('alice'))==1
    manager.close(); repo.close()


def test_run_and_stop_lost_ack_do_not_replay_side_effects(tmp_path):
    repo,manager,jobs=setup(tmp_path)
    created=manager.create('alice',{'station_id':'physical-station-01','assignment_id':'a1'})
    eid=created['experiment_id']
    manager.run(eid,'alice',operation_key='run-once')
    manager.run(eid,'alice',operation_key='run-once')
    assert len(jobs.jobs)==1
    assert manager.operation('alice','run-once',kind='run',experiment_id=eid)['status']=='ACCEPTED'
    manager.stop(eid,'alice',operation_key='stop-once')
    count=len(manager.gateway.calls)
    manager.stop(eid,'alice',operation_key='stop-once')
    assert len(manager.gateway.calls)==count
    jobs.run_one()
    assert manager.operation('alice','run-once',kind='run',experiment_id=eid)['status']=='FAILED'
    with pytest.raises(ValueError,match='STOPPED'):
        manager.run(eid,'alice',operation_key='run-once')
    assert not jobs.jobs
    with pytest.raises(KeyError):
        manager.operation('bob','run-once',kind='run',experiment_id=eid)
    manager.close(); repo.close()


def test_slow_create_does_not_serialize_an_unrelated_stop(tmp_path):
    repo,manager,_=setup(tmp_path)
    eid=manager.create('alice',{'station_id':'physical-station-01','assignment_id':'a1'})['experiment_id']
    entered=Event(); release=Event()
    original=manager.gateway.capabilities
    def blocked(station):
        entered.set()
        if not release.wait(5): raise RuntimeError('test did not release slow capability request')
        return original(station)
    manager.gateway.capabilities=blocked
    with ThreadPoolExecutor(max_workers=2) as pool:
        create=pool.submit(manager.create,'bob',{'station_id':'physical-station-01','assignment_id':'a1'},operation_key='slow-create')
        assert entered.wait(2)
        stop=pool.submit(manager.stop,eid,'alice',operation_key='independent-stop')
        try:
            assert stop.result(timeout=1)['state']=='COMPLETE'
        finally: release.set()
        create.result(timeout=2)
    manager.close(); repo.close()


def test_new_run_key_cannot_claim_a_completed_experiments_old_execution(tmp_path):
    repo,manager,jobs=setup(tmp_path)
    eid=manager.create('alice',{'station_id':'physical-station-01','assignment_id':'a1'})['experiment_id']
    manager.run(eid,'alice',operation_key='original-run')
    jobs.run_one()
    assert manager.get(eid,'alice')['state']=='COMPLETE'
    starts=manager.gateway.calls.count('start_execution')
    with pytest.raises(ValueError,match='INVALID_STATE'):
        manager.run(eid,'alice',operation_key='unrelated-new-key')
    assert manager.gateway.calls.count('start_execution')==starts
    assert manager.operation('alice','unrelated-new-key',kind='run',experiment_id=eid)['status']=='FAILED'
    manager.close(); repo.close()


def test_create_and_operation_commit_in_one_transaction(tmp_path,monkeypatch):
    repo,manager,_=setup(tmp_path)
    from sqlalchemy import event
    def fail_operation_insert(conn,cursor,statement,parameters,context,executemany):
        if statement.startswith('INSERT INTO lab_operations'):
            raise RuntimeError('injected operation persistence failure')
    event.listen(repo.engine,'before_cursor_execute',fail_operation_insert)
    with pytest.raises(RuntimeError,match='injected'):
        manager.create('alice',{'station_id':'physical-station-01','assignment_id':'a1'},operation_key='atomic')
    event.remove(repo.engine,'before_cursor_execute',fail_operation_insert)
    assert not repo.list_experiments('alice')
    manager.close(); repo.close()


@pytest.mark.parametrize('poll_before_failure',[False,True])
def test_run_acknowledgement_is_independent_of_later_capture_failure(tmp_path,poll_before_failure):
    repo,manager,jobs=setup(tmp_path)
    from app.services.hardware_client import GatewayError
    eid=manager.create('alice',{'station_id':'physical-station-01','assignment_id':'a1'})['experiment_id']
    original=manager.gateway.call
    def fail_capture(station_id,experiment_id,method,**kwargs):
        if method=='read_capture':
            if poll_before_failure:
                assert manager.operation('alice','started',kind='run',experiment_id=eid)['status']=='APPLIED'
            raise GatewayError('DRIVER_ERROR')
        return original(station_id,experiment_id,method,**kwargs)
    manager.gateway.call=fail_capture
    manager.run(eid,'alice',operation_key='started'); jobs.run_one()
    result=manager.operation('alice','started',kind='run',experiment_id=eid)
    assert result['status']=='APPLIED' and result['error_code'] is None
    assert result['experiment']['state']=='FAULT' and result['experiment']['error_code']=='DRIVER_ERROR'
    manager.close(); repo.close()


def test_stop_ack_requires_actual_safe_lease_release(tmp_path):
    repo,manager,jobs=setup(tmp_path)
    eid=manager.create('alice',{'station_id':'physical-station-01','assignment_id':'a1'})['experiment_id']
    original=manager.gateway.call
    def unsafe_cleanup(station_id,experiment_id,method,**kwargs):
        if method=='stop_execution': return {'accepted':False,'hardware_applied':False}
        if method=='guarded_power_up': manager.stop(eid,'alice',operation_key='stopped')
        return original(station_id,experiment_id,method,**kwargs)
    manager.gateway.call=unsafe_cleanup
    manager.run(eid,'alice',operation_key='started')
    jobs.run_one()
    assert repo.leases()[0]['quarantined']
    result=manager.operation('alice','stopped',kind='stop',experiment_id=eid)
    assert result['status']=='FAILED' and result['error_code']=='SAFE_STATE_FAILED'
    manager.close(); repo.close()


def test_stop_success_keeps_prior_execution_error_on_experiment(tmp_path):
    repo,manager,jobs=setup(tmp_path)
    eid=manager.create('alice',{'station_id':'physical-station-01','assignment_id':'a1'})['experiment_id']
    manager.run(eid,'alice',operation_key='started')
    manager.stop(eid,'alice',operation_key='stopped'); jobs.run_one()
    result=manager.operation('alice','stopped',kind='stop',experiment_id=eid)
    assert result['status']=='APPLIED' and result['error_code'] is None
    assert result['experiment']['error_code']=='STOPPED'
    manager.close(); repo.close()
