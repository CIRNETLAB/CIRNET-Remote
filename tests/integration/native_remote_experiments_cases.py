"""Real Rust Remote/Hardware/C++ route smoke compared to exact Python r8.

This short suite is functional evidence only; it is not the loaded Stop gate.
"""
from hashlib import sha256
import json,os,shutil,subprocess,time
from pathlib import Path
from uuid import uuid4
from websockets.sync.client import connect
from scripts.artifact_paths import artifact_directory
from scripts.benchmark_web_sessions import graph,verify_digital_evidence,ORIGIN
from tests.integration.native_hardware_gate_cases import native_service
from tests.integration.native_remote_gate_cases import (
    REFERENCE_SHA256,WORKER_SHA256,SEED,SERVE_REFERENCE,_environment,_http_service,_select_reference,
)
OPERATIONS={"createExperiment","listExperiments","listExperimentHistory","listActiveExperiments","getExperiment",
    "runExperiment","stopExperiment","getExperimentResults","getExperimentDocumentReference",
    "configureExperimentInstrument","getExperimentInstrumentAccess","configureExperimentGenerator",
    "getExperimentInstrumentCommand","createExperimentV2","getExperimentDocumentReferenceV2",
    "getOperation","getCapturePayload","deleteCapturePayload"}
def exercise(client,seed):
    owner=seed["stage4_alice"];foreign=seed["stage4_bob"]
    ids={};results={};captured=[];capture_clocks={};control="stage4-control"
    def normalize(value):
        if isinstance(value,str):
            for identity,label in ids.items():value=value.replace(identity,label)
            return value
        if isinstance(value,list):return [normalize(v) for v in value]
        if isinstance(value,dict):
            if "timestamp_ns" in value:
                identity=value["capture_id"]
                assert capture_clocks.setdefault(identity,value["timestamp_ns"])==value["timestamp_ns"]
            result={}
            for key,v in value.items():
                if key=="timestamp_ns":
                    assert isinstance(v,str) and v.isascii() and v.isdigit() and str(int(v))==v
                    assert abs(time.time()-int(v)/1_000_000_000)<180
                    result[key]="<capture-wall-clock-ns>"
                elif key in ("created_at","updated_at"):
                    assert isinstance(v,(int,float)) and abs(time.time()-v)<180
                    result[key]="<server-clock>"
                else:result[key]=normalize(v)
            return result
        return value
    def request(name,method,path,status=200,*,actor=owner,key=None,record=True,identity=None,**kw):
        headers={"Cookie":"cirnet_session="+actor["token"],"X-CIRNET-CSRF":actor["csrf"],
                 "Origin":ORIGIN,"X-Control-Client":control,"X-Request-ID":"experiment:"+name}
        if key is not None:headers["Idempotency-Key"]=key
        response=client.request(method,path,headers=headers,**kw)
        assert response.status_code==status,(name,response.status_code,response.text)
        assert response.headers["X-Request-ID"]=="experiment:"+name
        assert response.headers["Cache-Control"]=="no-store"
        value=response.json()
        if identity:
            token=value["experiment_id"];assert len(token)==32;ids[token]=identity
        if record:results[name]={"status":status,"body":normalize(value)}
        return value
    assert request("list-empty","GET","/api/experiments")==[]
    assert request("history-empty","GET","/api/experiments/history")["items"]==[]
    assert request("active-empty","GET","/api/experiments/active")["items"]==[]
    payload={"station_id":"virtual-station-01","circuit_graph":graph("native-remote"),
             "capture_config":{"signals":["G.Y1"],"duration_ns":40,"max_events":100},
             "test_vectors":[{"time_ns":20,"inputs":{"X.OUT":1}}]}
    created=request("create","POST","/api/experiments",201,key="create-one",json=payload,identity="<experiment>")
    eid=created["experiment_id"];path="/api/experiments/"+eid
    request("same-create","POST","/api/experiments",201,key="create-one",json=payload)
    request("conflicting-create","POST","/api/experiments",409,key="create-one",json={**payload,"test_vectors":[]})
    request("create-operation","GET","/api/operations/create-one")
    request("created-get","GET",path)
    request("foreign-get","GET",path,403,actor=foreign)
    request("document-v1","GET",path+"/document-reference")
    request("document-v2","GET","/api/v2/experiments/"+eid+"/document-reference")
    request("instrument-access-before","GET",path+"/instruments/access")
    generator={"channel":1,"waveform":"SINE","frequency_hz":1000,"amplitude_vpp":1,"offset_v":0,"enabled":True}
    request("instrument-before","POST",path+"/instruments",403,json={"instrument":"generator","configuration":generator})
    request("generator-before","POST",path+"/instruments/generator",403,key="generator-one",json={"configuration":generator})
    request("generator-missing","GET",path+"/instruments/commands/generator-one",404)
    second=request("create-v2","POST","/api/v2/experiments",201,json=payload,identity="<second>")
    request("created-stop","POST","/api/experiments/"+second["experiment_id"]+"/stop",key="stop-created")
    ws_url=str(client.base_url).rstrip("/").replace("http://","ws://")+"/ws/events"
    with connect(ws_url,origin=ORIGIN,additional_headers={"Cookie":"cirnet_session="+owner["token"]},
                 open_timeout=5,close_timeout=5,proxy=None) as websocket:
        hello=json.loads(websocket.recv(timeout=5))
        assert hello["type"]=="hello" and hello["sequence"]==0 and hello["resync_required"] is True
        ids[hello["stream_id"]]="<stream>";results["ws-hello"]=normalize(hello)
        websocket.send(json.dumps({"type":"client.hello","protocol_version":"1.0","control_client_id":control}))
        websocket.send("ready")
        assert json.loads(websocket.recv(timeout=5))=={"type":"echo","payload":"ready"}
        admitted=request("run","POST",path+"/run",key="run-one",record=False)
        assert admitted["experiment_id"]==eid and admitted["state"] not in ("FAULT","STOPPED")
        deadline=time.monotonic()+20
        while True:
            final=request("poll","GET",path,record=False)
            assert final["state"]!="FAULT",final
            if final["state"]=="COMPLETE" and final["lease_expires_at"] is None:break
            assert time.monotonic()<deadline,final
            time.sleep(.025)
        metadata=final["capture"];ids[metadata["capture_id"]]="<capture>"
        results["completed"]=normalize(final)
        request("results","GET",path+"/results")
        request("run-operation","GET","/api/operations/run-one",params={"kind":"run","experiment_id":eid})
        request("history","GET","/api/experiments/history",params={"limit":1})
        request("active","GET","/api/experiments/active")
        request("list","GET","/api/experiments")
        response=client.get(metadata["payload_ref"],headers={"Cookie":"cirnet_session="+owner["token"],
            "Accept":"application/vnd.cirnet.capture","X-Request-ID":"capture-read"})
        assert response.status_code==200 and response.headers["X-Content-Type-Options"]=="nosniff"
        assert response.headers["Content-Type"]=="application/vnd.cirnet.capture; version=1"
        verify_digital_evidence(metadata,response.content);captured.append(response.content)
        results["payload"]={"sha256":sha256(response.content).hexdigest(),"bytes":len(response.content)}
        request("stop-complete","POST",path+"/stop",key="stop-complete")
        request("stop-operation","GET","/api/operations/stop-complete",params={"kind":"stop","experiment_id":eid})
        retained=client.get(metadata["payload_ref"],headers={"Cookie":"cirnet_session="+owner["token"]})
        assert retained.content==response.content
        request("delete-capture","DELETE",metadata["payload_ref"])
        request("unavailable-capture","GET",metadata["payload_ref"],422)
        sequence=0
        while True:
            event=json.loads(websocket.recv(timeout=5))
            assert event["stream_id"]==hello["stream_id"] and event["sequence"]>sequence
            sequence=event["sequence"]
            if event.get("type")=="experiment.updated" and event["experiment"]["state"]=="COMPLETE":
                assert event["experiment"]["experiment_id"]==eid
                results["ws-complete-state"]=event["experiment"]["state"]
                break
    return results,captured
def test_stage4_experiment_http_and_control_parity():
    root=artifact_directory("native-remote-experiments/"+uuid4().hex)
    print(f"Stage 4 experiment HTTP/control slice: {root}",flush=True)
    python,hardware,worker,contracts=_select_reference(root)
    native=Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    digest=sha256(native.read_bytes()).hexdigest();database=root/"seed.sqlite"
    seeded=subprocess.run([str(python),"-I","-B","-c",SEED],cwd=root,env=_environment(root,database),
                          capture_output=True,timeout=60)
    (root/"seed.stderr.log").write_bytes(seeded.stderr);assert seeded.returncode==0
    seed=json.loads(seeded.stdout);results={};captures={}
    for label,is_native in (("rust",True),("python",False)):
        lane=root/label;lane.mkdir();db=lane/"baseline.sqlite";shutil.copyfile(database,db)
        environment={**_environment(lane,db),"CIRNET_SIM_CPP_WORKER":str(worker),
            "CIRNET_SIM_CPP_WORKER_SHA256":WORKER_SHA256,"CIRNET_CONTRACTS_ROOT":str(contracts),
            "CIRNET_SIMULATION_BACKEND":"cpp","CIRNET_REMOTE_READ_ONLY":"false"}
        with native_service(lane,environment,{"executable":hardware,"contracts":contracts}) as (_, (port,_)):
            environment["CIRNET_HARDWARE_GRPC_TARGET"]=f"127.0.0.1:{port}"
            command=[str(native),"--listen","127.0.0.1:0","--exit-on-stdin-eof"] if is_native else [
                str(python),"-I","-B","-c",SERVE_REFERENCE]
            with _http_service(command,lane,environment) as client:results[label],captures[label]=exercise(client,seed)
        (lane/"http-observations.json").write_text(json.dumps(results[label],indent=2)+"\n",encoding="utf-8")
    assert sha256(native.read_bytes()).hexdigest()==digest
    assert captures["rust"]==captures["python"]
    assert results["rust"]==results["python"]
    (root/"comparison.json").write_text(json.dumps({"status":"PASS","scope":"isolated SQLite actual HTTP/control with exact R2/C++",
        "candidate_sha256":digest,"reference_manifest_sha256":REFERENCE_SHA256,
        "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),"tested_operations":sorted(OPERATIONS),
        "observations_per_side":len(results["rust"]),"normalization":"Only new resource/stream identities and bounded server clocks. Immediate asynchronous Run shape asserted separately; final state and histories compared.",
        "loaded_stop":"NOT RUN","full_gate4":"NOT RUN"},indent=2)+"\n",encoding="utf-8")
