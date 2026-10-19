"""Real browser harness process: first spawned capture and pipe-owned shutdown."""
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import httpx
from contracts.capture_codec import decode_digital
from scripts.artifact_paths import artifact_directory, cleanup_artifact_session

ROOT=Path(__file__).resolve().parents[2]

def available_port():
    # Windows can allocate an ephemeral port inside a reserved range which a
    # later Uvicorn bind cannot reuse. Choose an available normal loopback port.
    for _ in range(100):
        port=10000+secrets.randbelow(20000)
        with socket.socket() as listener:
            try:listener.bind(('127.0.0.1',port))
            except OSError:continue
            return port
    raise AssertionError('No isolated loopback port was available.')

def test_actual_browser_harness_first_worker_capture_and_eof_shutdown(monkeypatch):
    artifact_session=artifact_directory(directory=os.environ.get('NETCIRCUIT_ARTIFACTS_DIR',tempfile.gettempdir()))
    monkeypatch.setenv('NETCIRCUIT_ARTIFACTS_SESSION',str(artifact_session))
    try:
        directory=artifact_directory('browser-harness-runtime')
        assert directory.is_relative_to(artifact_session) and not directory.is_relative_to(ROOT)
        http_port,rpc_port=available_port(),available_port()
        while rpc_port==http_port:rpc_port=available_port()
        password=secrets.token_urlsafe(32)
        environment={**os.environ,'NETCIRCUIT_E2E_DATA_DIR':str(directory),
            'NETCIRCUIT_E2E_ADMIN_PASSWORD':password,'NETCIRCUIT_E2E_HTTP_PORT':str(http_port),'NETCIRCUIT_E2E_RPC_PORT':str(rpc_port)}
        with (directory/'owned-harness.log').open('w',encoding='utf-8') as output:
            process=subprocess.Popen([sys.executable,str(ROOT/'scripts/e2e_web_server.py')],cwd=ROOT,env=environment,
                stdin=subprocess.PIPE,stdout=output,stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            try:
                with httpx.Client(base_url=f'http://127.0.0.1:{http_port}',timeout=20) as client:
                    deadline=time.monotonic()+30
                    while True:
                        assert process.poll() is None,'The owned harness exited before readiness.'
                        try:
                            if client.get('/api/health').status_code==200:break
                        except httpx.TransportError:pass
                        assert time.monotonic()<deadline,('The owned harness did not become ready.\n'+(directory/'owned-harness.log').read_text(encoding='utf-8'))
                        time.sleep(.1)
                    session=client.get('/api/auth/session').json()
                    def headers():return {'Origin':'http://127.0.0.1:14173','X-CSRF-Token':session['csrf_token'],'X-Control-Client':'worker-regression'}
                    response=client.post('/api/auth/login',json={'username':'e2e_admin','password':password},headers=headers())
                    assert response.status_code==200;session=response.json()
                    graph={'schema_version':'1.0','circuit_id':'browser-and','modules':[
                        {'id':'X','type':'DIGITAL_SWITCH','properties':{'state':False}},
                        {'id':'Y','type':'DIGITAL_SWITCH','properties':{'state':True}},
                        {'id':'G','type':'74HC08'},{'id':'L','type':'LED'},{'id':'BB','type':'BREADBOARD'}],
                        'connections':[{'source':'X.OUT','destination':'G.A1'},{'source':'Y.OUT','destination':'G.B1'},{'source':'G.Y1','destination':'L.IN'}]}
                    definition={'schema_version':'1.0','assignment_id':'browser-and','title':'Browser AND','assessment_policy':'FUNCTIONAL_ONLY',
                        'lab_endpoints':[{'endpoint_id':'x','role':'INPUT_SOURCE','design_port':'X.OUT'},{'endpoint_id':'y','role':'OUTPUT_SENSE','design_port':'L.IN'}],
                        'expected_behavior':{'expected_signals':[{'signal':'y','time_ns':10,'value':0}]}}
                    response=client.post('/api/assignments',json=definition,headers=headers());assert response.status_code==201,response.text
                    response=client.post('/api/experiments',headers=headers(),json={'station_id':'virtual-station-01','assignment_id':'browser-and',
                        'circuit_graph':graph,'capture_config':{'signals':['y'],'duration_ns':40}})
                    assert response.status_code==201,response.text;identity=response.json()['experiment_id']
                    assert client.post('/api/experiments/'+identity+'/run',headers=headers()).status_code==200
                    deadline=time.monotonic()+15
                    while True:
                        result=client.get('/api/experiments/'+identity).json()
                        if result['state'] in ('COMPLETE','FAULT') and result['lease_expires_at'] is None:break
                        assert time.monotonic()<deadline,'The real virtual run exceeded its existing completion bound.'
                        time.sleep(.1)
                    assert result['state']=='COMPLETE',(result['error_code'],result['state_history'])
                    assert result['functional_verification']['status']=='PASS'
                    response=client.get(result['capture']['payload_ref']);assert response.status_code==200
                    assert decode_digital(response.content)['samples']==[{'signal':'y','time_ns':0,'value':'X'},{'signal':'y','time_ns':8,'value':0}]
            finally:
                process.stdin.close()
                try:code=process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.terminate();process.wait(timeout=5)
                    raise AssertionError('The owned harness did not shut down after its parent pipe closed.\n'+(directory/'owned-harness.log').read_text(encoding='utf-8')) from None
                assert code==0,'The owned harness failed during orderly worker shutdown.'
    finally:
        cleanup_artifact_session(artifact_session)
