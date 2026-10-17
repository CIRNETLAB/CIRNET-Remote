"""REST → real loopback RPC → process-worker simulator → unified result."""
import subprocess
import json
import sys
import time
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[2]
for relative in ['services/api','services/api/tests','services/hardware-service','simulator/circuit-simulator']:
    sys.path.insert(0,str(ROOT/relative))
from csrf_client import CsrfTestClient as TestClient, login_admin


def test_real_virtual_and_run_returns_capture_and_function_after_alias_mapping():
    subprocess.run([sys.executable,str(ROOT/'scripts/generate_hardware_rpc.py')],check=True)
    from hardware_service.server import build_server
    from app.main import create_app
    from app.services.persistence import Repository
    from app.services.hardware_client import HardwareServiceClient
    server=build_server(); port=server.add_insecure_port('127.0.0.1:0'); server.start()
    application=create_app(repository=Repository('sqlite://'),gateway=HardwareServiceClient(f'127.0.0.1:{port}'))
    try:
        with TestClient(application) as client:
            login_admin(client)
            assignment={'schema_version':'1.0','assignment_id':'virtual-and','title':'AND',
                        'assessment_policy':'FUNCTIONAL_ONLY',
                        'lab_endpoints':[{'endpoint_id':'x','role':'INPUT_SOURCE','design_port':'X.OUT'},
                                         {'endpoint_id':'y','role':'OUTPUT_SENSE','design_port':'L.IN'}],
                        'expected_behavior':{'expected_signals':[{'signal':'y','time_ns':10,'value':0},{'signal':'y','time_ns':30,'value':1}]}}
            assert client.post('/api/assignments',json=assignment).status_code==201
            graph={'schema_version':'1.0','circuit_id':'and','modules':[{'id':'X','type':'DIGITAL_SWITCH','properties':{'state':False}},
                   {'id':'Y','type':'DIGITAL_SWITCH','properties':{'state':True}}, {'id':'G','type':'74HC08'}, {'id':'L','type':'LED'}, {'id':'BB','type':'BREADBOARD'}],
                   'connections':[{'source':'X.OUT','destination':'G.A1'},{'source':'Y.OUT','destination':'G.B1'},{'source':'G.Y1','destination':'L.IN'}]}
            payload={'station_id':'virtual-station-01','assignment_id':'virtual-and','circuit_graph':graph,
                     'capture_config':{'signals':['y'],'duration_ns':40},'test_vectors':[{'time_ns':20,'inputs':{'x':1}}]}
            response=client.post('/api/experiments',json=payload)
            assert response.status_code==201,response.text
            eid=response.json()['experiment_id']
            assert client.post('/api/experiments/'+eid+'/run').status_code==200
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                result=client.get('/api/experiments/'+eid).json()
                if result['state'] in ('COMPLETE','FAULT') and result['lease_expires_at'] is None: break
                time.sleep(0.05)
            assert result['state']=='COMPLETE',(result['error_code'],result['state_history'])
            assert result['functional_verification']['status']=='PASS',result
            assert 'samples' not in result['capture']
            from contracts.capture_codec import decode_digital
            binary=client.get('/api/captures/'+result['capture']['capture_id']+'/payload')
            assert binary.status_code==200,binary.text
            assert decode_digital(binary.content)['samples']==[{'signal':'y','time_ns':0,'value':'X'},
                                                             {'signal':'y','time_ns':8,'value':0},{'signal':'y','time_ns':28,'value':1}]
            assert application.state.repository.leases()==[]
    finally:
        server.stop(0).wait()


@pytest.mark.parametrize('with_reference_assignment',[False,True])
def test_flexible_graph_12_runs_over_real_rest_rpc_and_retains_exact_saved_mount(tmp_path,with_reference_assignment):
    from hardware_service.server import build_server
    from app.main import create_app
    from app.services.persistence import Repository
    from app.services.hardware_client import HardwareServiceClient
    from contracts.capture_codec import decode_digital
    server=build_server();port=server.add_insecure_port('127.0.0.1:0');server.start()
    application=create_app(repository=Repository('sqlite:///'+(tmp_path/'flex-rpc.sqlite').as_posix()),gateway=HardwareServiceClient(f'127.0.0.1:{port}'))
    graph=json.loads((ROOT/'contracts/design-models/fixtures/flexible-mounting-parity.json').read_text(encoding='utf-8'))['cases'][0]['graph']
    graph['modules'] += [{'id':'X','type':'DIGITAL_SWITCH','properties':{'state':True}},{'id':'L','type':'LED'}]
    graph['connections']=[{'source':'X.OUT','destination':'L.IN'}]
    try:
        with TestClient(application) as client:
            if with_reference_assignment:
                login_admin(client)
                assignment={'schema_version':'2.0','assignment_id':'flex-rpc-reference','title':'Flexible reference',
                    'assessment_policy':'FUNCTIONAL_ONLY','reference_design_graph':graph,
                    'lab_endpoints':[{'endpoint_id':'L.IN','role':'OUTPUT_SENSE','design_port':'L.IN'}],
                    'expected_behavior':{'expected_signals':[{'signal':'L.IN','time_ns':0,'value':1}]}}
                authored=client.post('/api/v2/assignment-documents',json={'definition':assignment})
                assert authored.status_code==201,authored.text
                published=client.patch('/api/v2/assignment-documents/flex-rpc-reference/publication',json={'base_revision':1,'published':True})
                assert published.status_code==200,published.text
            created=client.post('/api/v2/experiments',json={'station_id':'virtual-station-01','circuit_graph':graph,
                **({'assignment_id':'flex-rpc-reference'} if with_reference_assignment else {}),
                'capture_config':{'signals':['L.IN'],'duration_ns':20}})
            assert created.status_code==201,created.text
            eid=created.json()['experiment_id']
            reference=client.get('/api/v2/experiments/'+eid+'/document-reference')
            assert reference.status_code==200 and reference.json()['graph_schema_version']=='1.2'
            assert client.get('/api/experiments/'+eid+'/document-reference').json()['code']=='UNSUPPORTED_DOCUMENT_VERSION'
            assert client.post('/api/experiments/'+eid+'/run').status_code==200
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                result=client.get('/api/experiments/'+eid).json()
                if result['state'] in ('COMPLETE','FAULT') and result['lease_expires_at'] is None:break
                time.sleep(.05)
            assert result['state']=='COMPLETE',(result['error_code'],result['state_history'])
            payload=client.get('/api/captures/'+result['capture']['capture_id']+'/payload')
            assert payload.status_code==200
            assert decode_digital(payload.content)['samples'][-1]=={'signal':'L.IN','time_ns':0,'value':1}
            assert application.state.repository.get_experiment(eid)['_circuit_graph']==graph
            if with_reference_assignment:
                stored=application.state.repository.get_experiment(eid)
                assert stored['_assignment_snapshot']==assignment
                assert stored['_assignment_reference']=={'assignment_id':'flex-rpc-reference','revision':2}
                assert result['functional_verification']['status']=='PASS',result
            assert application.state.repository.leases()==[]
    finally:server.stop(0).wait()
