"""Safety sweeps accept all cancellations before any remote Stop wait."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event,Barrier,Lock

import pytest
from app.services.auth import AuthService
from app.config import Settings
from sqlalchemy import update
from test_lab_lifecycle import setup_manager,assignment,create
from test_instrument_lifecycle import configuration


@pytest.mark.parametrize('sweep',['leases','sessions','revocation'])
def test_two_station_sweep_is_not_held_by_first_station_configuration(tmp_path,sweep):
    manager,repo,gateway,_,now,_=setup_manager(tmp_path)
    definition=assignment();definition['assignment_id']='generator'
    definition['lab_endpoints'][0].update(role='GENERATOR',channel=1)
    repo.create_assignment(definition)
    original_caps=gateway.capabilities;original_call=gateway.call
    parked={'A':Event(),'B':Event()};finish_workers=Event();entered=Event();finish_configuration=Event();other_stopped=Event()
    slow=[None]
    def capabilities(station):
        value=original_caps(station)
        value['instrument_capabilities']['generator']={'channels':1,'runtime_reconfiguration_supported':True}
        value['routing_resources'][0]['roles'].append('GENERATOR')
        return value
    def call(station,eid,method,**kwargs):
        if method=='start_execution':parked[station].set();assert finish_workers.wait(10)
        if method=='configure_instrument' and station==slow[0]:entered.set();assert finish_configuration.wait(10)
        if method=='stop_execution' and station!=slow[0]:other_stopped.set()
        return original_call(station,eid,method,**kwargs)
    gateway.capabilities=capabilities;gateway.call=call
    workers=ThreadPoolExecutor(max_workers=6);manager.submit=workers.submit
    contexts={}
    if sweep=='revocation':
        auth=AuthService(repo,Settings())
        for station in ('A','B'):contexts[station]=auth.ensure_session(None)[0]
        manager.control_session_active=auth.session_active
    records={station:manager.create(station,{'station_id':station,'assignment_id':'generator'}) for station in ('A','B')}
    for station in ('A','B'):
        manager.run(records[station]['experiment_id'],station,
            control_session_id=contexts[station].session_id if contexts else station,control_client_id='tab')
        assert parked[station].wait(3)
    slow[0]=min(records,key=lambda station:records[station]['experiment_id'])
    other=next(station for station in records if station!=slow[0]);other_id=records[other]['experiment_id']
    try:
        remote=workers.submit(manager.configure_instrument,records[slow[0]]['experiment_id'],slow[0],{'instrument':'generator','configuration':configuration()})
        assert entered.wait(3)
        if sweep=='leases':
            now[0]=11;invoke=manager.expire_leases
        elif sweep=='sessions':invoke=lambda:manager.expire_control_sessions(lambda session:False)
        else:
            # Wire the application callback exactly as production initialize()
            # does, without constructing another scheduler over live leases.
            from app.main import bind_session_revocation
            bind_session_revocation(auth,manager)
            ids=[contexts[station].session_id for station in (slow[0],other)]
            with repo.engine.begin() as db:db.execute(update(repo.auth_sessions).values(revoked=True))
            invoke=lambda:auth._revoke_callback(ids)
        pending=workers.submit(invoke)
        assert other_stopped.wait(2),'An unrelated cancellation/Stop waited behind the first configure RPC.'
        assert manager.cancel[other_id].is_set()
        assert manager.get(other_id,other)['state']=='STOPPING'
        assert len(repo.leases())==2,'A queued Stop must not release an executing lease.'
        pending.result(2)
    finally:
        finish_configuration.set();finish_workers.set();workers.shutdown(wait=True)
        manager.close();repo.close()


def test_stop_dispatch_budget_retains_and_retries_excess_cancellations(tmp_path):
    manager,repo,gateway,jobs,_,_=setup_manager(tmp_path)
    original=gateway.call;entered=Barrier(5);release=Event();first_batch=Event();all_stopped=Event();guard=Lock();calls=[]
    def call(station,eid,method,**kwargs):
        if method=='stop_execution':
            with guard:calls.append(eid);ordinal=len(calls)
            if ordinal<=4:entered.wait(5)
            assert release.wait(5)
            if ordinal==16:first_batch.set()
            if ordinal==20:all_stopped.set()
        return original(station,eid,method,**kwargs)
    gateway.call=call
    records=[]
    for index in range(20):
        owner='owner-'+str(index)
        record=manager.create(owner,{'station_id':'station-'+str(index),'assignment_id':'a1'})
        manager.run(record['experiment_id'],owner,control_session_id='expired',control_client_id='tab')
        records.append((owner,record['experiment_id']))
    try:
        manager.disconnect_controls(['expired'])
        entered.wait(5)
        assert len(manager.stop_pending)==16
        assert all(manager.cancel[eid].is_set() for _,eid in records)
        manager.dispatch_cancelled_stops()
        assert len(manager.stop_pending)==16
        assert len(repo.leases())==20
        release.set();assert first_batch.wait(5)
        manager.dispatch_cancelled_stops();assert all_stopped.wait(5)
        assert len(calls)==20
        assert len(repo.leases())==20,'Accepted remote Stop must not release an unfinalized worker.'
    finally:
        release.set()
        while jobs.jobs:jobs.run_one()
        manager.close();repo.close()


def test_concurrent_stops_at_full_admission_queue_keep_lease_until_safe_cleanup(tmp_path):
    manager, repo, gateway, jobs, _, _ = setup_manager(tmp_path)
    started, stop_entered, cleanup_entered = Event(), Event(), Event()
    finish_start, finish_stop, finish_cleanup = Event(), Event(), Event()
    original_call = gateway.call
    stop_targets = []
    active = create(manager, 'active')['experiment_id']

    def call(station, eid, method, **kwargs):
        if method == 'stop_execution':
            stop_targets.append(eid)
        if eid == active:
            if method == 'start_execution':
                started.set()
                assert finish_start.wait(15)
            elif method == 'stop_execution' and not stop_entered.is_set():
                stop_entered.set()
                assert finish_stop.wait(15)
                return {'accepted': True, 'hardware_applied': False}
            elif method == 'stop_execution':
                cleanup_entered.set()
                assert finish_cleanup.wait(15)
            elif method == 'read_capture':
                pytest.fail('The late Start reply must not reach capture.')
        return original_call(station, eid, method, **kwargs)

    gateway.call = call
    manager.control_session_active = lambda session: session != 'revoked'
    try:
        manager.run(active, 'active', control_session_id='active-session', control_client_id='active-tab')
        lease = repo.leases()
        assert len(lease) == 1 and lease[0]['experiment_id'] == active
        queued = []
        for index in range(50):
            owner = f'queued-{index}'
            eid = create(manager, owner)['experiment_id']
            assert manager.run(eid, owner)['state'] == 'QUEUED'
            queued.append((owner, eid))
        queue_ids = [eid for _, eid in queued]
        overflow = create(manager, 'overflow')['experiment_id']
        with pytest.raises(ValueError, match='QUEUE_FULL'):
            manager.run(overflow, 'overflow')
        with pytest.raises(ValueError, match='SESSION_EXPIRED'):
            manager.run(overflow, 'overflow', control_session_id='revoked', control_client_id='active-tab')
        assert manager.get(overflow, 'overflow')['state'] == 'CREATED'

        with ThreadPoolExecutor(max_workers=2) as workers:
            worker = workers.submit(jobs.run_one)
            try:
                assert started.wait(5)
                tail_owner, tail = queued[-1]
                with pytest.raises(PermissionError, match='FORBIDDEN'):
                    manager.stop(active, 'intruder', operation_key='foreign-active-stop')
                with pytest.raises(PermissionError, match='FORBIDDEN'):
                    manager.stop(tail, 'intruder', operation_key='foreign-queued-stop')
                manager.disconnect_control('active-session', 'different-tab')
                manager.disconnect_control('different-session', 'active-tab')
                assert manager.get(active, 'active')['state'] == 'RUNNING'
                assert manager.queue('p1') == queue_ids and repo.leases() == lease
                assert not stop_targets

                pending = workers.submit(manager.stop, active, 'active', operation_key='active-stop')
                assert stop_entered.wait(5)
                assert manager.queue('p1') == queue_ids and repo.leases() == lease
                assert not pending.done() and manager.get(active, 'active')['state'] == 'STOPPING'
                cancelled = manager.stop(tail, tail_owner, operation_key='queued-stop')
                assert cancelled['state'] == 'COMPLETE' and cancelled['error_code'] == 'STOPPED'
                assert manager.queue('p1') == queue_ids[:-1] and repo.leases() == lease
                assert stop_targets == [active] and not pending.done()
                assert manager.run(overflow, 'overflow')['state'] == 'QUEUED'
                assert manager.queue('p1') == queue_ids[:-1] + [overflow]

                finish_stop.set()
                assert pending.result(5)['state'] == 'STOPPING'
                assert active not in manager.stop_acknowledged and repo.leases() == lease
                finish_start.set()
                assert cleanup_entered.wait(5)
                assert repo.leases() == lease and not worker.done()
                finish_cleanup.set()
                worker.result(5)
            finally:
                finish_start.set()
                finish_stop.set()
                finish_cleanup.set()

        stopped = manager.get(active, 'active')
        assert stopped['state'] == 'COMPLETE' and stopped['error_code'] == 'STOPPED'
        assert stopped['capture'] is None and stop_targets == [active, active]
        first = queue_ids[0]
        assert [row['experiment_id'] for row in repo.leases()] == [first]
        assert manager.get(first, queued[0][0])['state'] == 'RESERVED'
        assert manager.queue('p1') == queue_ids[1:-1] + [overflow]

        manager.stop(overflow, 'overflow')
        for owner, eid in reversed(queued[1:-1]):
            manager.stop(eid, owner)
        jobs.run_one()
        assert not manager.queue('p1') and not repo.leases() and not jobs.jobs
    finally:
        manager.close()
        repo.close()
