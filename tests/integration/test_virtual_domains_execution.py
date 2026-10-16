"""Schema 1.1 bounded DC/digital designs traverse the real Lab lifecycle."""
from copy import deepcopy
from pathlib import Path
import sys
import time
import pytest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'services/api/tests'))
from csrf_client import CsrfTestClient,login_admin


def physical_graph(*,powered=True,led=False):
    value={'schema_version':'1.1','circuit_id':'physical-digital','modules':[
        {'id':'PS','type':'DC_SUPPLY','properties':{'voltage':5}},
        {'id':'U','type':'SN74HC08N'},
        {'id':'A','type':'DIGITAL_SWITCH','properties':{'state':True}},
        {'id':'B','type':'DIGITAL_SWITCH','properties':{'state':True}}],
        'connections':[{'source':'PS.MINUS','destination':'U.7'},
            {'source':'A.OUT','destination':'U.1'},{'source':'B.OUT','destination':'U.2'}],
        'metadata':{'retained-author-data':{'voltage-is-design-only':True}}}
    if powered:value['connections'].append({'source':'PS.PLUS','destination':'U.14'})
    if led:
        value['modules']=[value['modules'][0],{'id':'R','type':'RESISTOR_AXIAL','properties':{'resistanceOhms':330}},{'id':'L','type':'LED_LTL307EE'}]
        value['connections']=[{'source':'PS.PLUS','destination':'R.A'},
            {'source':'R.B','destination':'L.A'},{'source':'L.K','destination':'PS.MINUS'}]
    return value


@pytest.mark.parametrize('powered,led,port,expected',[
    (True,False,'U.3',[{'signal':'y','time_ns':0,'value':'X'},{'signal':'y','time_ns':8,'value':1}]),
    (False,False,'U.3',[{'signal':'y','time_ns':0,'value':'X'}]),
    (True,True,'PS.PLUS',[{'signal':'y','time_ns':0,'value':1}]),
])
def test_real_rest_rpc_worker_admits_supported_11_graphs_without_retagging(powered,led,port,expected,tmp_path):
    from hardware_service.server import build_server
    from app.main import create_app
    from app.services.persistence import Repository
    from app.services.hardware_client import HardwareServiceClient
    from app.config import Settings
    from contracts.capture_codec import decode_digital
    server=build_server();rpc_port=server.add_insecure_port('127.0.0.1:0');server.start()
    repository=Repository('sqlite://')
    application=create_app(repository=repository,gateway=HardwareServiceClient(f'127.0.0.1:{rpc_port}'),
        configuration=Settings(capture_dir=str(tmp_path/'captures')))
    graph=physical_graph(powered=powered,led=led);saved=deepcopy(graph)
    try:
        with CsrfTestClient(application) as client:
            login_admin(client)
            assignment={'schema_version':'1.0','assignment_id':'physical-domain','title':'Explicit powered package',
                'assessment_policy':'FUNCTIONAL_ONLY','lab_endpoints':[{'endpoint_id':'y','role':'OUTPUT_SENSE','design_port':port}]}
            assert client.post('/api/assignments',json=assignment).status_code==201
            response=client.post('/api/experiments',json={'station_id':'virtual-station-01','assignment_id':'physical-domain',
                'circuit_graph':graph,'capture_config':{'signals':['y'],'duration_ns':30}})
            assert response.status_code==201,response.text
            identity=response.json()['experiment_id']
            assert client.post(f'/api/experiments/{identity}/run').status_code==200
            deadline=time.monotonic()+15
            while True:
                result=client.get(f'/api/experiments/{identity}').json()
                if result['state'] in ('COMPLETE','FAULT') and result['lease_expires_at'] is None:break
                assert time.monotonic()<deadline,'The real virtual worker failed to complete.'
                time.sleep(.05)
            assert result['state']=='COMPLETE',(result['error_code'],result['state_history'])
            assert result['capture']['encoding']=='digital_events'
            payload=client.get(result['capture']['payload_ref'])
            assert payload.status_code==200 and decode_digital(payload.content)['samples']==expected
            assert repository.get_experiment(identity)['_circuit_graph']==saved==graph
            reference=client.get(f'/api/experiments/{identity}/document-reference').json()
            assert reference['graph_schema_version']=='1.1' and reference['execution_mode']=='simulation'
    finally:server.stop(0).wait()
