"""A saved revision runs through the real API/RPC/simulator after later edits."""
from copy import deepcopy
from pathlib import Path
import sys
import time
from sqlalchemy import update

ROOT=Path(__file__).resolve().parents[2]
for relative in ('services/api','services/api/tests','services/hardware-service'):
    sys.path.insert(0,str(ROOT/relative))
from csrf_client import CsrfTestClient,login_admin


def test_saved_revision_and_assignment_are_immutable_execution_context(tmp_path):
    from app.main import create_app
    from app.services.persistence import Repository
    from app.services.hardware_client import HardwareServiceClient
    from app.services.capture_store import FilesystemCaptureStore
    from contracts.capture_codec import decode_digital
    from hardware_service.server import build_server
    from hardware_service.station.virtual import close_simulation_pool
    server=build_server(); port=server.add_insecure_port('127.0.0.1:0'); server.start()
    application=create_app(repository=Repository('sqlite:///'+str(tmp_path/'saved.db')),
        gateway=HardwareServiceClient(f'127.0.0.1:{port}'),capture_store=FilesystemCaptureStore(tmp_path/'captures'))
    try:
        with CsrfTestClient(application) as client:
            login_admin(client)
            assignment={'schema_version':'1.0','assignment_id':'saved-and','title':'Saved AND',
                'assessment_policy':'FUNCTIONAL_ONLY','lab_endpoints':[
                    {'endpoint_id':'x','role':'INPUT_SOURCE','design_port':'X.OUT'},
                    {'endpoint_id':'y','role':'OUTPUT_SENSE','design_port':'L.IN'}],
                'expected_behavior':{'expected_signals':[{'signal':'y','time_ns':10,'value':0},{'signal':'y','time_ns':30,'value':1}]}}
            assert client.post('/api/assignments',json=assignment).status_code==201
            graph={'schema_version':'1.0','circuit_id':'logical-saved-and','metadata':{'future':{'preserve':True}},
                'modules':[{'id':'X','type':'DIGITAL_SWITCH','properties':{'state':False}},
                           {'id':'Y','type':'DIGITAL_SWITCH','properties':{'state':True}},
                           {'id':'G','type':'74HC08'},{'id':'L','type':'LED'}],
                'connections':[{'source':'X.OUT','destination':'G.A1'},
                               {'source':'Y.OUT','destination':'G.B1'},{'source':'G.Y1','destination':'L.IN'}]}
            project=client.post('/api/projects',json={'name':'Real persisted execution'}).json()
            saved=client.post('/api/projects/'+project['project_id']+'/circuits',json={'name':'AND v1','graph':graph})
            assert saved.status_code==201,saved.text
            document=saved.json()
            admitted=client.post('/api/experiments',headers={'Idempotency-Key':'saved-admission'},json={
                'station_id':'virtual-station-01','assignment_id':'saved-and',
                'circuit_document_id':document['document_id'],'circuit_revision':1,
                'capture_config':{'signals':['y'],'duration_ns':40},'test_vectors':[{'time_ns':20,'inputs':{'x':1}}]})
            assert admitted.status_code==201,admitted.text
            eid=admitted.json()['experiment_id']
            edited=deepcopy(graph); edited['modules'][0]['properties']['state']=True
            assert client.put('/api/circuits/'+document['document_id'],json={'base_revision':1,'name':'AND v2','graph':edited}).status_code==200
            changed=deepcopy(assignment)
            changed['expected_behavior']['expected_signals'][0]['value']=1
            with application.state.repository.engine.begin() as db:
                table=application.state.repository.assignments
                db.execute(update(table).where(table.c.assignment_id=='saved-and').values(payload=changed))
            reference=client.get('/api/experiments/'+eid+'/document-reference')
            assert reference.status_code==200,reference.text
            assert reference.json()['source']=='SAVED_DOCUMENT' and reference.json()['revision']==1
            assert reference.json()['document_id']==document['document_id'] and reference.json()['execution_mode']=='simulation'
            assert client.post('/api/experiments/'+eid+'/run',headers={'Idempotency-Key':'saved-run'}).status_code==200
            deadline=time.monotonic()+15
            while time.monotonic()<deadline:
                result=client.get('/api/experiments/'+eid).json()
                if result['state'] in ('COMPLETE','FAULT') and result['lease_expires_at'] is None: break
                time.sleep(0.05)
            assert result['state']=='COMPLETE' and result['functional_verification']['status']=='PASS',result
            payload=client.get('/api/captures/'+result['capture']['capture_id']+'/payload')
            assert payload.status_code==200
            assert decode_digital(payload.content)['samples']==[
                {'signal':'y','time_ns':0,'value':'X'},{'signal':'y','time_ns':8,'value':0},{'signal':'y','time_ns':28,'value':1}]
            assert application.state.repository.get_experiment(eid)['_circuit_graph']==graph
            assert client.post('/api/experiments/'+eid+'/stop').status_code==200
            assert client.get('/api/captures/'+result['capture']['capture_id']+'/payload').content==payload.content
    finally:
        server.stop(0).wait(); close_simulation_pool()
