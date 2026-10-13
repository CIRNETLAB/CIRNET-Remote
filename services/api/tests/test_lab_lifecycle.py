import copy
import importlib
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'services/api'))


def modules():
    assert (ROOT/'services/api/app/services/experiments.py').is_file(), 'backend lifecycle missing'
    return (importlib.import_module('app.services.experiments'),
            importlib.import_module('app.services.persistence'))


def assignment():
    return {'schema_version':'1.0','assignment_id':'a1','title':'AND lab',
            'lab_endpoints':[{'endpoint_id':'x','role':'INPUT_SOURCE','node_id':'N1'},
                             {'endpoint_id':'y','role':'OUTPUT_SENSE','node_id':'N2'}],
            'expected_component_set':['74HC08'], 'assessment_policy':'TOPOLOGY_AND_FUNCTION',
            'expected_behavior':{'expected_signals':[{'signal':'y','time_ns':0,'value':0}]}}


class LabGateway:
    """Controllable remote-station fixture for application orchestration tests."""
    def __init__(self,safety='SAFE',unknown=False,available=True):
        self.safety=safety; self.unknown=unknown; self.available=available; self.calls=[]
    def capabilities(self,station_id):
        return {'schema_version':'1.0','station_id':station_id,'mode':'hardware','available':self.available,
                'virtual_digital':False,'virtual_analog':False,'physical_digital':True,'physical_analog_routing':False,
                'physical_execution_slots':1,'topology_scan_supported':True,'safety_gate_supported':True,
                'guarded_run_supported':True,'component_resolution_modes':['HYBRID'],
                'instrument_capabilities':{'logic_analyzer':{'channels':2,'runtime_reconfiguration_supported':False},
                    'oscilloscope':{'channels':0,'runtime_reconfiguration_supported':False},
                    'generator':{'channels':0,'runtime_reconfiguration_supported':False}},
                'routing_resources':[{'resource_id':'r1','roles':['INPUT_SOURCE'],'node_ids':['N1']},
                                     {'resource_id':'r2','roles':['OUTPUT_SENSE'],'node_ids':['N2']}],
                'hardware_rpc_version':'2.0','fpga_protocol_version':'test','firmware_version':'test','hardware_profile_version':'test'}
    def call(self,station_id,experiment_id,method,**kwargs):
        self.calls.append(method)
        if method=='scan_topology':
            return {'schema_version':'1.0','scan_id':'s1','nodes':[{'node_id':'N1'},{'node_id':'N2'}],
                    'connections':[],'ambiguities':[],
                    'components':[{'component_id':'U1','kind':'OPAQUE_PHYSICAL_COMPONENT' if self.unknown else 'OBSERVED_PHYSICAL_COMPONENT',
                                   'identity':'UNKNOWN' if self.unknown else 'wrong-IC','node_ids':['N1']}]}
        if method=='read_runtime_safety':
            return {'schema_version':'1.0','status':self.safety,'issues':[]}
        if method=='read_capture':
            return {'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]}
        return {'accepted':True,'hardware_applied':True}


class DeferredJobs:
    def __init__(self): self.jobs=[]
    def __call__(self,job,*args): self.jobs.append((job,args))
    def run_one(self):
        job,args=self.jobs.pop(0); job(*args)


def setup_manager(tmp_path,**gateway_args):
    experiments,persistence=modules()
    repo=persistence.Repository('sqlite:///'+str(tmp_path/'lab.db'))
    repo.create_assignment(assignment())
    gateway=LabGateway(**gateway_args); jobs=DeferredJobs(); now=[0.0]; events=[]
    manager=experiments.ExperimentManager(repo,gateway,submit=jobs,clock=lambda:now[0],
                                          lease_seconds=10,emit=lambda owner,event:events.append(event))
    return manager,repo,gateway,jobs,now,events


def create(manager,owner='student-1',**extra):
    return manager.create(owner,{'station_id':'p1','assignment_id':'a1',**extra})


def test_assignment_persists_and_duplicate_id_cannot_overwrite(tmp_path):
    _,persistence=modules()
    url='sqlite:///'+str(tmp_path/'lab.db')
    repo=persistence.Repository(url)
    repo.create_assignment(assignment())
    repo.close()
    repo=persistence.Repository(url)
    assert repo.get_assignment('a1')==assignment()
    with pytest.raises(ValueError): repo.create_assignment(assignment())
    repo.close()


def test_fifo_one_physical_slot_and_state_events(tmp_path):
    m,repo,gateway,jobs,now,events=setup_manager(tmp_path)
    first=create(m,'student-1'); second=create(m,'student-2'); third=create(m,'student-3')
    m.run(first['experiment_id'],'student-1')
    m.run(second['experiment_id'],'student-2')
    m.run(third['experiment_id'],'student-3')
    assert m.get(first['experiment_id'],'student-1')['state']=='RESERVED'
    assert m.get(second['experiment_id'],'student-2')['state']=='QUEUED'
    assert m.queue('p1')==[second['experiment_id'],third['experiment_id']]
    jobs.run_one()
    assert m.get(first['experiment_id'],'student-1')['state']=='COMPLETE'
    assert m.get(second['experiment_id'],'student-2')['state']=='RESERVED'
    assert any(e['type']=='experiment.updated' and e['experiment']['state']=='RUNNING' for e in events)
    jobs.run_one(); jobs.run_one()
    assert not m.queue('p1') and repo.leases()==[]


@pytest.mark.parametrize('status',['UNSAFE','INDETERMINATE'])
def test_unsafe_safety_blocks_before_power_or_start(tmp_path,status):
    m,repo,g,jobs,now,events=setup_manager(tmp_path,safety=status)
    e=create(m); m.run(e['experiment_id'],'student-1'); jobs.run_one()
    result=m.get(e['experiment_id'],'student-1')
    assert result['execution_decision']['decision']=='BLOCK_SAFETY'
    assert 'guarded_power_up' not in g.calls and 'start_execution' not in g.calls


def test_safe_wrong_ic_topology_mismatch_runs_and_function_can_fail(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    e=create(m); m.run(e['experiment_id'],'student-1'); jobs.run_one()
    result=m.get(e['experiment_id'],'student-1')
    assert result['safety_verification']['status']=='SAFE'
    assert result['topology_verification']['status']=='MISMATCH'
    assert result['execution_decision']['decision']=='RUN_NORMAL'
    assert result['functional_verification']['status']=='FAIL'
    assert result['capture']['sample_count']==1


def test_safe_unknown_is_guarded_and_unroutable_is_blocked(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path,unknown=True)
    e=create(m); m.run(e['experiment_id'],'student-1'); jobs.run_one()
    assert m.get(e['experiment_id'],'student-1')['execution_decision']['decision']=='RUN_GUARDED'
    bad=assignment(); bad['assignment_id']='bad'; bad['lab_endpoints'][0]['node_id']='unroutable'
    repo.create_assignment(bad)
    now[0]=2
    e=m.create('student-1',{'station_id':'p1','assignment_id':'bad'})
    m.run(e['experiment_id'],'student-1'); jobs.run_one()
    assert m.get(e['experiment_id'],'student-1')['execution_decision']['decision']=='BLOCK_UNEXECUTABLE'


def test_owner_isolation_rate_limit_and_disconnect_cleanup(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    e=create(m); m.run(e['experiment_id'],'student-1')
    with pytest.raises(PermissionError): m.get(e['experiment_id'],'student-2')
    with pytest.raises(PermissionError): m.stop(e['experiment_id'],'student-2')
    another=create(m)
    with pytest.raises(ValueError): m.run(another['experiment_id'],'student-1')
    m.disconnect('student-1'); jobs.run_one()
    assert repo.leases()==[]
    assert m.get(e['experiment_id'],'student-1')['state']=='COMPLETE'


def test_expired_lease_stops_and_releases_only_after_safe_cleanup(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    e=create(m); m.run(e['experiment_id'],'student-1'); now[0]=11
    m.expire_leases(); jobs.run_one()
    result=m.get(e['experiment_id'],'student-1')
    assert result['error_code']=='TIMEOUT'
    assert repo.leases()==[]


def test_failed_safe_cleanup_quarantines_slot(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    original=g.call
    def failing_safe(station_id,experiment_id,method,**kwargs):
        if method=='stop_execution': return {'accepted':False,'hardware_applied':False,'code':'DRIVER_ERROR'}
        return original(station_id,experiment_id,method,**kwargs)
    g.call=failing_safe
    e=create(m); m.run(e['experiment_id'],'student-1'); jobs.run_one()
    assert m.get(e['experiment_id'],'student-1')['state']=='FAULT'
    assert repo.leases()[0]['quarantined'] is True


def test_assignment_api_and_experiment_ownership_use_server_session(tmp_path):
    import app.main as main
    assert hasattr(main,'create_app'), 'app lifecycle factory missing'
    experiments,persistence=modules()
    jobs=DeferredJobs()
    application=main.create_app(repository=persistence.Repository('sqlite://'),gateway=LabGateway(),submit=jobs)
    with TestClient(application) as first, TestClient(application) as second:
        assert first.post('/api/assignments',json=assignment()).status_code==201
        assert first.get('/api/assignments/a1').json()==assignment()
        response=first.post('/api/experiments',json={'station_id':'physical-station-01','assignment_id':'a1'})
        assert response.status_code==201
        eid=response.json()['experiment_id']
        assert second.get('/api/experiments/'+eid).status_code==403
        assert first.post('/api/experiments/'+eid+'/run').status_code==200
        jobs.run_one()
        assert first.get('/api/experiments/'+eid+'/results').json()['functional_verification']['status']=='FAIL'


def test_websocket_delivers_owner_lifecycle_and_disconnect_cleans_active_lease():
    import app.main as main
    _,persistence=modules(); jobs=DeferredJobs()
    application=main.create_app(repository=persistence.Repository('sqlite://'),gateway=LabGateway(),submit=jobs)
    with TestClient(application) as client:
        client.post('/api/assignments',json=assignment())
        eid=client.post('/api/experiments',json={'station_id':'physical-station-01','assignment_id':'a1'}).json()['experiment_id']
        with client.websocket_connect('/ws/events') as websocket:
            assert websocket.receive_json()['type']=='hello'
            client.post('/api/experiments/'+eid+'/run')
            event=websocket.receive_json()
            assert event['type']=='experiment.updated'
            assert event['experiment']['experiment_id']==eid
            assert event['experiment']['state']=='QUEUED'
        jobs.run_one()
        assert application.state.repository.leases()==[]


def test_restart_recovers_persisted_queue_in_fifo_order(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    first=create(m,'student-1'); second=create(m,'student-2')
    m.run(first['experiment_id'],'student-1'); m.run(second['experiment_id'],'student-2')
    experiments,_=modules(); recovered_jobs=DeferredJobs()
    recovered=experiments.ExperimentManager(repo,g,submit=recovered_jobs,clock=lambda:now[0])
    assert recovered.get(second['experiment_id'],'student-2')['state']=='RESERVED'
    assert len(recovered_jobs.jobs)==1
    third=create(recovered,'student-3'); recovered.run(third['experiment_id'],'student-3')
    assert recovered.get(second['experiment_id'],'student-2')['state']=='RESERVED'
    recovered.stop(second['experiment_id'],'student-2')
    recovered_jobs.run_one()
    assert 'start_execution' not in g.calls
    assert recovered.get(second['experiment_id'],'student-2')['error_code']=='STOPPED'


def test_restart_preserves_run_admission_order_instead_of_creation_order(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    active=create(m,'active'); first_created=create(m,'first'); second_created=create(m,'second')
    m.run(active['experiment_id'],'active')
    m.run(second_created['experiment_id'],'second'); m.run(first_created['experiment_id'],'first')
    recovered_jobs=DeferredJobs()
    experiments,_=modules()
    recovered=experiments.ExperimentManager(repo,g,submit=recovered_jobs,clock=lambda:now[0])
    assert recovered.get(second_created['experiment_id'],'second')['state']=='RESERVED'
    assert recovered.queue('p1')==[first_created['experiment_id']]


def test_runtime_unsafe_is_preserved_when_stop_arrives_at_the_same_time(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    e=create(m,'student'); eid=e['experiment_id']
    previous=g.call
    def call(station_id,experiment_id,method,**kwargs):
        if method=='start_execution':
            m.stop(eid,'student')
            return {'accepted':False,'code':'UNSAFE'}
        return previous(station_id,experiment_id,method,**kwargs)
    g.call=call
    m.run(eid,'student'); jobs.run_one()
    final=m.get(eid,'student')
    assert final['state']=='FAULT'
    assert final['error_code']=='UNSAFE'
    assert final['safety_verification']['status']=='UNSAFE'
    assert final['execution_decision']['decision']=='BLOCK_SAFETY'


def test_queue_position_changes_publish_a_new_revision(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    active=create(m,'active'); second=create(m,'second'); third=create(m,'third')
    for e,owner in [(active,'active'),(second,'second'),(third,'third')]: m.run(e['experiment_id'],owner)
    before=m.get(third['experiment_id'],'third')
    assert before['queue_position']==2
    m.stop(second['experiment_id'],'second')
    after=m.get(third['experiment_id'],'third')
    assert after['queue_position']==1 and after['revision']>before['revision']
    assert any(event['experiment']['experiment_id']==third['experiment_id'] and event['experiment']['revision']==after['revision'] for event in events)


def test_unavailable_generator_is_not_silently_accepted(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    configuration=[{'channel':1,'waveform':'SINE','frequency_hz':100,'amplitude_vpp':1,'offset_v':0,'enabled':True}]
    with pytest.raises(ValueError,match='UNEXECUTABLE'):
        create(m,generator_config=configuration)


def test_capture_preserves_unknown_logic_and_function_evaluates_held_values():
    from app.services.captures import CaptureService
    from app.services.verification import FunctionalVerificationService
    capture=CaptureService().normalize({'available':True,'duration_ns':40,'samples':[
        {'signal':'y','time_ns':0,'value':'X'},{'signal':'y','time_ns':8,'value':1}]},'simulation')
    assert capture['samples'][0]['value']=='X'
    a=assignment(); a['expected_behavior']={'expected_signals':[{'signal':'y','time_ns':20,'value':1}]}
    assert FunctionalVerificationService().verify(a,capture)['status']=='PASS'


def test_runtime_safety_fault_updates_safety_result_and_blocks_execution(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    original=g.call
    def unsafe_start(station_id,experiment_id,method,**kwargs):
        if method=='start_execution': return {'accepted':False,'code':'UNSAFE'}
        return original(station_id,experiment_id,method,**kwargs)
    g.call=unsafe_start
    e=create(m); m.run(e['experiment_id'],'student-1'); jobs.run_one()
    result=m.get(e['experiment_id'],'student-1')
    assert result['safety_verification']['status']=='UNSAFE'
    assert result['execution_decision']['decision']=='BLOCK_SAFETY'


def test_functional_truth_table_uses_exercised_vectors_and_observed_outputs():
    from app.services.verification import FunctionalVerificationService
    a=assignment(); a['expected_behavior']={'truth_table':[
        {'inputs':{'x':0},'outputs':{'y':0}},{'inputs':{'x':1},'outputs':{'y':1}}]}
    capture={'available':True,'duration_ns':40,'samples':[{'signal':'y','time_ns':0,'value':'X'},
             {'signal':'y','time_ns':8,'value':0},{'signal':'y','time_ns':28,'value':1}]}
    vectors=[{'time_ns':0,'inputs':{'x':0}},{'time_ns':20,'inputs':{'x':1}}]
    assert FunctionalVerificationService().verify(a,capture,vectors)['status']=='PASS'
    assert FunctionalVerificationService().verify(a,capture,vectors[:1])['status']!='PASS'


def test_lifecycle_revisions_increase_and_safe_release_is_observable(tmp_path):
    m,repo,g,jobs,now,events=setup_manager(tmp_path)
    e=create(m); m.run(e['experiment_id'],'student-1'); jobs.run_one()
    final=m.get(e['experiment_id'],'student-1')
    revisions=[event['experiment']['revision'] for event in events]
    assert revisions==sorted(set(revisions))
    assert final['state_history'][-3:]==['SAFE_STATE','RELEASE','COMPLETE']


def test_public_capabilities_redact_node_mapping_without_mutating_driver_profile():
    import app.main as main
    _,persistence=modules(); gateway=LabGateway()
    application=main.create_app(repository=persistence.Repository('sqlite://'),gateway=gateway,submit=DeferredJobs())
    with TestClient(application) as client:
        caps=client.get('/api/stations/physical-station-01/capabilities').json()
        assert all(r['node_ids']==[] for r in caps['routing_resources'])
        assert gateway.capabilities('physical-station-01')['routing_resources'][0]['node_ids']==['N1']
