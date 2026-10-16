"""Requested/accepted control is not evidence of applied physical output."""
from copy import deepcopy
import pytest
from test_lab_lifecycle import setup_manager,create

CONFIG={'channel':1,'waveform':'SINE','frequency_hz':1000,'amplitude_vpp':1,'offset_v':0,'enabled':True}

def ready(tmp_path,applied=True):
    manager,repo,gateway,_,_,_=setup_manager(tmp_path)
    original=gateway.capabilities
    def capabilities(identity):
        value=original(identity);value['instrument_capabilities']['generator']={'channels':2,'runtime_reconfiguration_supported':True}
        return value
    gateway.capabilities=capabilities
    record=create(manager,'alice');identity=record['experiment_id']
    record=repo.get_experiment(identity)
    record.update(state='RUNNING',state_history=['CREATED','RUNNING'],lease_expires_at=100,
        _control_session_id='session',_control_client_id='controller',
        _execution_plan={'instrument_allocations':[{'instrument':'GENERATOR','channel':1,'endpoint_id':'g'}]})
    repo.save_experiment(record);assert repo.reserve('p1',0,identity,100)
    call=gateway.call
    def invoke(station,eid,method,**kwargs):
        if method=='configure_instrument':
            gateway.calls.append(method);return {'accepted':True,'hardware_applied':applied,'code':'OK'}
        return call(station,eid,method,**kwargs)
    gateway.call=invoke
    return manager,repo,gateway,identity

@pytest.mark.parametrize('applied',[False,True])
def test_command_ack_requires_explicit_application_and_same_key_never_replays(tmp_path,applied):
    manager,repo,gateway,identity=ready(tmp_path,applied)
    result=manager.configure_generator_command(identity,'alice',CONFIG,'command',control_session_id='session',control_client_id='controller')
    assert result['status']==('APPLIED' if applied else 'ACCEPTED')
    assert result['hardware_applied'] is applied and result['configuration']==CONFIG
    assert manager.generator_command(identity,'alice','command')==result
    assert manager.configure_generator_command(identity,'alice',CONFIG,'command',control_session_id='session',control_client_id='controller')==result
    assert gateway.calls.count('configure_instrument')==1
    changed={**CONFIG,'frequency_hz':2000}
    with pytest.raises(ValueError,match='IDEMPOTENCY_CONFLICT'):
        manager.configure_generator_command(identity,'alice',changed,'command',control_session_id='session',control_client_id='controller')
    with pytest.raises(PermissionError):manager.generator_command(identity,'bob','command')
    manager.close();repo.close()

def test_access_is_owned_allocated_context_bound_and_explicitly_unavailable(tmp_path):
    manager,repo,gateway,identity=ready(tmp_path)
    access=manager.instrument_access(identity,'alice',control_session_id='session',control_client_id='controller')
    assert access['can_configure_generator'] and access['generator_channels']==[1] and access['reason']=='READY'
    viewer=manager.instrument_access(identity,'alice',control_session_id='session',control_client_id='viewer')
    assert not viewer['can_configure_generator'] and viewer['reason']=='CONTROL_CONTEXT_REQUIRED'
    with pytest.raises(PermissionError):manager.instrument_access(identity,'bob')
    with pytest.raises(PermissionError):
        manager.configure_generator_command(identity,'alice',CONFIG,'viewer-attempt',control_session_id='session',control_client_id='viewer')
    assert 'configure_instrument' not in gateway.calls
    original=gateway.capabilities
    def unavailable(station):
        value=original(station);value['instrument_capabilities']['generator']['channels']=0;return value
    gateway.capabilities=unavailable
    assert manager.instrument_access(identity,'alice',control_session_id='session',control_client_id='controller')['reason']=='GENERATOR_UNAVAILABLE'
    manager.close();repo.close()


def test_timeout_is_unknown_evidence_and_never_replays_after_recovery(tmp_path):
    from app.services.hardware_client import GatewayError
    manager,repo,gateway,identity=ready(tmp_path)
    calls=[]
    def timeout(*args,**kwargs):calls.append(args);raise GatewayError('TIMEOUT')
    gateway.call=timeout
    result=manager.configure_generator_command(identity,'alice',CONFIG,'unknown',control_session_id='session',control_client_id='controller')
    assert result['status']=='REQUESTED' and result['error_code']=='ACKNOWLEDGEMENT_UNKNOWN'
    assert not result['hardware_applied']
    assert manager.configure_generator_command(identity,'alice',CONFIG,'unknown',control_session_id='session',control_client_id='controller')==result
    assert len(calls)==1
    manager.closed=True;repo.close()


@pytest.mark.parametrize('lost_at',['before_rpc','after_rpc'])
def test_new_manager_recovers_a_durable_intent_without_replaying_output(tmp_path,lost_at):
    from app.services.experiments import ExperimentManager
    from app.services.persistence import Repository
    from app.services.operations import request_fingerprint
    from app.services.hardware_client import GatewayError
    from test_lab_lifecycle import LabGateway,DeferredJobs
    manager,repo,gateway,identity=ready(tmp_path)
    if lost_at=='before_rpc':
        record={'schema_version':'1.0','experiment_id':identity,'operation_key':'durable','status':'REQUESTED','revision':0,
            'accepted':False,'hardware_applied':False,'error_code':None,'configuration':deepcopy(CONFIG)}
        fingerprint=request_fingerprint({'experiment_id':identity,'configuration':CONFIG})
        repo.begin_instrument_command('alice',record,fingerprint,'session',None)
    else:
        def timeout(*args,**kwargs):raise GatewayError('TIMEOUT')
        gateway.call=timeout
        record=manager.configure_generator_command(identity,'alice',CONFIG,'durable',control_session_id='session',control_client_id='controller')
    # Simulate process loss: no graceful close can rewrite the intent.
    manager.closed=True;repo.close()
    restored=Repository('sqlite:///'+str(tmp_path/'lab.db'));new_gateway=LabGateway()
    recovered=ExperimentManager(restored,new_gateway,submit=DeferredJobs())
    assert recovered.generator_command(identity,'alice','durable')==record
    assert recovered.configure_generator_command(identity,'alice',CONFIG,'durable')==record
    assert 'configure_instrument' not in new_gateway.calls
    assert 'stop_execution' in new_gateway.calls and not restored.leases()
    assert recovered.get(identity,'alice')['error_code']=='RESTART_RECOVERY'
    recovered.close();restored.close()


def test_typed_http_control_access_ack_query_and_legacy_shape_are_isolated():
    from app.main import create_app
    from app.services.persistence import Repository
    from csrf_client import CsrfTestClient,publish_fixture_assignment
    from test_lab_lifecycle import LabGateway,DeferredJobs,assignment
    gateway=LabGateway();original=gateway.capabilities
    def capabilities(station):
        value=original(station);value['instrument_capabilities']['generator']={'channels':2,'runtime_reconfiguration_supported':True};return value
    gateway.capabilities=capabilities
    app=create_app(repository=Repository('sqlite://'),gateway=gateway,submit=DeferredJobs())
    publish_fixture_assignment(app,assignment())
    with CsrfTestClient(app) as owner,CsrfTestClient(app) as stranger:
        response=owner.post('/api/experiments',json={'station_id':'physical-station-01','assignment_id':'a1'})
        assert response.status_code==201,response.text
        identity=response.json()['experiment_id'];path='/api/experiments/'+identity+'/instruments'
        assert owner.post('/api/experiments/'+identity+'/run').status_code==200
        app.state.manager._transition(identity,'RUNNING',_execution_plan={'instrument_allocations':[{'instrument':'GENERATOR','channel':1,'endpoint_id':'approved-g'}]})
        access=owner.get(path+'/access',headers={'X-Control-Client':owner.control_client_id})
        assert access.status_code==200 and access.json()['can_configure_generator'],access.text
        assert not owner.get(path+'/access').json()['can_configure_generator']
        assert stranger.get(path+'/access').status_code==403
        response=owner.post(path+'/generator',json={'configuration':CONFIG},headers={'Idempotency-Key':'one-command'})
        assert response.status_code==200 and response.json()['status']=='APPLIED',response.text
        assert owner.get(path+'/commands/one-command').json()==response.json()
        assert stranger.get(path+'/commands/one-command').status_code==403
        assert stranger.post(path+'/generator',json={'configuration':CONFIG},headers={'Idempotency-Key':'one-command'}).status_code==403
        assert owner.post(path+'/generator',json={'configuration':CONFIG}).status_code==422
        assert owner.post(path+'/generator',json={'configuration':{**CONFIG,'frequency_hz':2000}},headers={'Idempotency-Key':'one-command'}).status_code==409
        legacy=owner.post(path,json={'instrument':'generator','configuration':CONFIG})
        assert legacy.status_code==200 and set(legacy.json())=={'accepted','code','status'}
