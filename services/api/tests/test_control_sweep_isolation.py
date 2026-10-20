"""Safety sweeps accept all cancellations before any remote Stop wait."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event,Barrier,Lock

import pytest
from app.services.auth import AuthService
from app.config import Settings
from sqlalchemy import update
from test_lab_lifecycle import setup_manager,assignment
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
