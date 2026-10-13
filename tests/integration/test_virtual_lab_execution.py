"""REST → real loopback RPC → process-worker simulator → unified result."""
import subprocess
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[2]
for relative in ['services/api','services/hardware-service','simulator/circuit-simulator']:
    sys.path.insert(0,str(ROOT/relative))


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
