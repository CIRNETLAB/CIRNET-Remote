"""Stage 4 isolated project writes through both HTTP implementations."""
from hashlib import sha256
import json, os, shutil, subprocess, time
from pathlib import Path
from uuid import uuid4
from scripts.artifact_paths import artifact_directory
from tests.integration.native_remote_gate_cases import (
    SEED, SERVE_REFERENCE, REFERENCE_SHA256, WORKER_SHA256, ORIGIN,
    _select_reference, _environment, _http_service,
)
from tests.integration.native_hardware_gate_cases import native_service

PROJECT_OPERATIONS={
    "createProject","updateProject","deleteProject","listCircuits","createCircuit","getCircuit",
    "saveCircuit","deleteCircuit","listCircuitsV2","createCircuitV2","getCircuitV2","saveCircuitV2",
}
def _exercise_projects(client,seed,graph):
    alice,bob=(seed[key] for key in ("stage4_alice","stage4_bob"))
    headers={"Cookie":"cirnet_session="+alice["token"],"Origin":ORIGIN,"X-CIRNET-CSRF":alice["csrf"]}
    foreign={"Cookie":"cirnet_session="+bob["token"],"Origin":ORIGIN,"X-CIRNET-CSRF":bob["csrf"]}
    ids={}; results={}
    def normalize(value):
        if isinstance(value,list):return [normalize(item) for item in value]
        if isinstance(value,dict):
            result={}
            for key,item in value.items():
                if key in ("created_at","updated_at"):
                    assert isinstance(item,(int,float)) and abs(time.time()-item)<120
                    result[key]="<server-clock>"
                else:result[key]=normalize(item)
            return result
        return ids.get(value,value) if isinstance(value,str) else value
    def request(name,method,path,status,*,authority=None,identity=None,**kwargs):
        rid="projects:"+name
        response=client.request(method,path,headers={**(authority or headers),"X-Request-ID":rid},**kwargs)
        assert response.status_code==status,(name,response.status_code,response.text)
        assert response.headers["X-Request-ID"]==rid and response.headers["Cache-Control"]=="no-store"
        assert "Set-Cookie" not in response.headers
        value=response.json()
        if identity:
            field,label=identity; assert len(value[field])==32
            assert value[field] not in ids; ids[value[field]]=label
            assert value["revision"]==1 and value["created_at"]==value["updated_at"]
        if method not in ("DELETE",) and status in (200,201) and "revision" in value:
            assert response.headers["ETag"]=='"'+str(value["revision"])+'"'
        results[name]={"status":response.status_code,"body":normalize(value),"etag":response.headers.get("ETag")}
        return value
    project=request("create","POST","/api/projects",201,json={"name":"Project","description":"Parity"},
                    identity=("project_id","<project>"))
    pid=project["project_id"]
    request("bad_name","POST","/api/projects",422,json={"name":17})
    request("blank_name","POST","/api/projects",422,json={"name":" \t\n"})
    request("extra_field","POST","/api/projects",422,json={"name":"Project","unknown":True})
    request("missing_body","POST","/api/projects",422)
    request("foreign_project","PATCH","/api/projects/"+pid,403,authority=foreign,json={"base_revision":1.0,"name":"Other"})
    request("update","PATCH","/api/projects/"+pid,200,json={"base_revision":1.0,"description":"Changed"})
    request("stale_project","PATCH","/api/projects/"+pid,409,json={"base_revision":1.0,"name":"Stale"})
    for version,prefix in (("v1","/api"),("v2","/api/v2")):
        document=request(version+"_create","POST",prefix+"/projects/"+pid+"/circuits",201,
                         json={"name":"Circuit","graph":graph},identity=("document_id","<"+version+"-document>"))
        did=document["document_id"];assert document["graph"]==graph
        request(version+"_read","GET",prefix+"/circuits/"+did,200)
        request(version+"_list","GET",prefix+"/projects/"+pid+"/circuits",200,params={"limit":1})
        request(version+"_foreign","GET",prefix+"/circuits/"+did,403,authority=foreign)
        saved=request(version+"_save","PUT",prefix+"/circuits/"+did,200,
                      json={"base_revision":1.0,"name":"Saved","graph":graph})
        assert saved["revision"]==2 and saved["graph"]==graph
        request(version+"_stale","PUT",prefix+"/circuits/"+did,409,
                json={"base_revision":1.0,"name":"Stale","graph":graph})
        request(version+"_delete","DELETE","/api/circuits/"+did,200,json={"base_revision":2.0})
        request(version+"_deleted","GET",prefix+"/circuits/"+did,404)
    request("delete_project","DELETE","/api/projects/"+pid,200,json={"base_revision":2.0})
    request("deleted_project","GET","/api/projects/"+pid,404)
    return results

def test_stage4_project_http_parity():
    root=artifact_directory("native-remote-projects/"+uuid4().hex)
    print(f"Stage 4 project HTTP slice: {root}",flush=True)
    python,hardware,worker,contracts=_select_reference(root)
    native=Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    native_sha=sha256(native.read_bytes()).hexdigest()
    database=root/"seed.sqlite"
    seeded=subprocess.run([str(python),"-I","-B","-c",SEED],cwd=root,env=_environment(root,database),
                          capture_output=True,timeout=30)
    (root/"seed.stderr.log").write_bytes(seeded.stderr)
    assert seeded.returncode==0
    seed=json.loads(seeded.stdout);contract_root=Path(seed.pop("contracts"))
    graph=json.loads((contract_root/"circuit-schema/examples/physical-hc08-led.json").read_bytes())
    results={}
    for label,is_native in (("rust",True),("python",False)):
        lane=root/label;lane.mkdir();db=lane/"baseline.sqlite";shutil.copyfile(database,db)
        environment={**_environment(lane,db),"CIRNET_SIM_CPP_WORKER":str(worker),
            "CIRNET_SIM_CPP_WORKER_SHA256":WORKER_SHA256,"CIRNET_CONTRACTS_ROOT":str(contracts),
            "CIRNET_SIMULATION_BACKEND":"cpp","CIRNET_HARDWARE_PREVIEW":"true","CIRNET_REMOTE_READ_ONLY":"false"}
        with native_service(lane,environment,{"executable":hardware,"contracts":contracts}) as (_, (port,_)):
            environment["CIRNET_HARDWARE_GRPC_TARGET"]=f"127.0.0.1:{port}"
            command=[str(native),"--listen","127.0.0.1:0","--exit-on-stdin-eof"] if is_native else [
                str(python),"-I","-B","-c",SERVE_REFERENCE]
            with _http_service(command,lane,environment) as client:
                results[label]=_exercise_projects(client,seed,graph)
        assert not any((lane/"captures").iterdir())
        (lane/"http-observations.json").write_text(json.dumps(results[label],indent=2)+"\n",encoding="utf-8")
    assert sha256(native.read_bytes()).hexdigest()==native_sha
    assert results["rust"]==results["python"]
    (root/"comparison.json").write_text(json.dumps({
        "status":"PASS","scope":"isolated modern-session project REST SQLite",
        "candidate_sha256":native_sha,"reference_manifest_sha256":REFERENCE_SHA256,
        "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),
        "tested_operations":sorted(PROJECT_OPERATIONS),"observations_per_side":len(results["rust"]),
        "normalization":"Only freshly generated project/document IDs and server timestamps; timestamps independently bounded to 120s and creation timestamps equal.",
        "full_gate4":"NOT RUN",
    },indent=2)+"\n",encoding="utf-8")
