"""Real worker control waits must not hold another station's cancellation."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest

from app.services.experiments import ExperimentManager
from test_lab_lifecycle import setup_manager,assignment
from test_instrument_lifecycle import configuration


@pytest.mark.parametrize('wait_for',['capabilities','configure_instrument','control_access','generator_command'])
@pytest.mark.parametrize('action',['stop','disconnect','revoke'])
def test_unrelated_remote_wait_does_not_delay_real_worker_stop(tmp_path,wait_for,action):
    manager,repo,gateway,_,_,_=setup_manager(tmp_path)
    definition=assignment();definition['assignment_id']='generator'
    definition['lab_endpoints'][0].update(role='GENERATOR',channel=1)
    repo.create_assignment(definition)
    original_caps=gateway.capabilities;original_call=gateway.call
    parked={'A':Event(),'B':Event()};release_workers=Event();entered=Event();release=Event();stopped=Event()
    slow=[False]
    def capabilities(station):
        if slow[0] and station=='A' and wait_for in ('capabilities','control_access','generator_command'):
            entered.set();assert release.wait(5)
        value=original_caps(station)
        value['instrument_capabilities']['generator']={'channels':1,'runtime_reconfiguration_supported':True}
        value['routing_resources'][0]['roles'].append('GENERATOR')
        return value
    def call(station,eid,method,**kwargs):
        if method=='start_execution':
            parked[station].set();assert release_workers.wait(5)
        if method=='configure_instrument' and station=='A' and slow[0]:
            entered.set();assert release.wait(5)
        if method=='stop_execution' and station=='B':stopped.set()
        return original_call(station,eid,method,**kwargs)
    gateway.capabilities=capabilities;gateway.call=call
    workers=ThreadPoolExecutor(max_workers=4)
    manager.submit=workers.submit
    records={station:manager.create(station,{'station_id':station,'assignment_id':'generator'}) for station in ('A','B')}
    for station in ('A','B'):
        manager.run(records[station]['experiment_id'],station,control_session_id=station,control_client_id='tab')
        assert parked[station].wait(2)
    extra=manager.create('another',{'station_id':'A','assignment_id':'generator'}) if wait_for=='capabilities' else None
    slow[0]=True
    try:
        if wait_for=='capabilities':
            remote=workers.submit(manager.run,extra['experiment_id'],'another')
        elif wait_for=='control_access':
            remote=workers.submit(manager.instrument_access,records['A']['experiment_id'],'A',control_session_id='A',control_client_id='tab')
        elif wait_for=='generator_command':
            remote=workers.submit(manager.configure_generator_command,records['A']['experiment_id'],'A',configuration(),'key',control_session_id='A',control_client_id='tab')
        else:
            remote=workers.submit(manager.configure_instrument,records['A']['experiment_id'],'A',{'instrument':'generator','configuration':configuration()})
        assert entered.wait(2)
        eid=records['B']['experiment_id']
        operation=(lambda:manager.stop(eid,'B')) if action=='stop' else (lambda:manager.disconnect('B')) if action=='disconnect' else (lambda:manager.disconnect_control('B',code='SESSION_EXPIRED'))
        cancellation=workers.submit(operation)
        assert stopped.wait(1),'Stop dispatch waited for an unrelated remote call'
        assert manager.cancel[eid].is_set()
        assert manager.get(eid,'B')['state']=='STOPPING'
        assert any(value['experiment_id']==eid for value in repo.leases()),'Stop ACK alone cannot release a running worker'
        cancellation.result(2)
    finally:
        release.set();release_workers.set();workers.shutdown(wait=True)
        manager.close();repo.close()


def test_late_configure_ack_cannot_apply_after_stop_or_release_slot_early(tmp_path):
    manager,repo,gateway,_,_,_=setup_manager(tmp_path)
    definition=assignment();definition['assignment_id']='generator'
    definition['lab_endpoints'][0].update(role='GENERATOR',channel=1)
    repo.create_assignment(definition)
    original_caps=gateway.capabilities;original_call=gateway.call
    running=Event();finish_run=Event();entered=Event();finish_configuration=Event();cancelled=Event()
    stop_ack=Event();permit_stop=Event()
    def capabilities(station):
        value=original_caps(station)
        value['instrument_capabilities']['generator']={'channels':1,'runtime_reconfiguration_supported':True}
        value['routing_resources'][0]['roles'].append('GENERATOR')
        return value
    def call(station,eid,method,**kwargs):
        if method=='start_execution':running.set();assert finish_run.wait(5)
        if method=='configure_instrument':entered.set();assert finish_configuration.wait(5)
        if method=='stop_execution':stop_ack.set();assert permit_stop.wait(5)
        return original_call(station,eid,method,**kwargs)
    gateway.capabilities=capabilities;gateway.call=call
    previous_emit=manager.emit
    def emit(owner,event):
        previous_emit(owner,event)
        if event['experiment']['state']=='STOPPING':cancelled.set()
    manager.emit=emit
    pool=ThreadPoolExecutor(max_workers=3);manager.submit=pool.submit
    record=manager.create('owner',{'station_id':'A','assignment_id':'generator'});eid=record['experiment_id']
    manager.run(eid,'owner',control_session_id='session',control_client_id='tab');assert running.wait(2)
    try:
        command=pool.submit(manager.configure_generator_command,eid,'owner',configuration(),'intent',control_session_id='session',control_client_id='tab')
        assert entered.wait(2)
        stopping=pool.submit(manager.stop,eid,'owner')
        assert cancelled.wait(2) and manager.cancel[eid].is_set()
        assert manager.get(eid,'owner')['state']=='STOPPING'
        assert repo.leases() and not stop_ack.is_set()
        finish_run.set();finish_configuration.set()
        outcome=command.result(2)
        assert outcome['status']!='APPLIED' and outcome['hardware_applied'] is False
        assert stop_ack.wait(2)
        assert manager.get(eid,'owner')['state']=='STOPPING' and repo.leases()
        permit_stop.set();stopping.result(2)
    finally:
        finish_run.set();finish_configuration.set();permit_stop.set();pool.shutdown(wait=True)
        manager.close();repo.close()
