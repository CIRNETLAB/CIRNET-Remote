"""Versioned assignment HTTP parity on isolated copies of the pinned database."""
from hashlib import sha256
import json,os,shutil,subprocess,time
from pathlib import Path
from uuid import uuid4
from scripts.artifact_paths import artifact_directory
from tests.integration.native_remote_gate_cases import (
    REFERENCE_SHA256,SERVE_REFERENCE,WORKER_SHA256,ORIGIN,_environment,_http_service,_select_reference,
)
SEED_ASSIGN=r"""
import json
from app.config import Settings
from app.services.persistence import Repository
from app.services.auth import AuthService
repo=Repository(Settings().database_url)
try:
    auth=AuthService(repo,Settings());password="assignment-http-fixture-password"
    auth.bootstrap_admin("stage4_admin",password,"Administrator")
    ctx,_=auth.ensure_session(None);admin,token=auth.login(ctx,"stage4_admin",password,"fixture-admin")
    result={"admin":{"token":token,"csrf":admin.csrf_token}}
    for name,role in (("teacher","INSTRUCTOR"),("other","INSTRUCTOR"),("student","STUDENT")):
        auth.create_user("stage4_"+name,password,role=role,actor=admin)
        ctx,_=auth.ensure_session(None);ctx,token=auth.login(ctx,"stage4_"+name,password,name)
        result[name]={"token":token,"csrf":ctx.csrf_token}
    print(json.dumps(result))
finally:repo.close()
"""
OPERATIONS={"listAssignments","createAssignment","getAssignment","publishAssignment",
    "listAssignmentDocuments","createAssignmentDocument","getAssignmentDocument","saveAssignmentDocument","publishAssignmentDocument",
    "listAssignmentsV2","getAssignmentV2","listAssignmentDocumentsV2","createAssignmentDocumentV2","getAssignmentDocumentV2",
    "saveAssignmentDocumentV2","publishAssignmentDocumentV2"}
def definition(identity,title="Original"):
    return {"schema_version":"1.0","assignment_id":identity,"title":title,
        "lab_endpoints":[{"endpoint_id":"UNRESOLVED","role":"INPUT_SOURCE"}],"assessment_policy":"FUNCTIONAL_ONLY",
        "reference_design_graph":{"schema_version":"1.0","circuit_id":"reference","modules":[],"connections":[],
                                  "metadata":{"private-answer":"keep"}},
        "expected_behavior":{"truth_table":[{"inputs":{"A":0},"outputs":{"Y":1}}]}}
def exercise(client,seed):
    results={}
    def normalize(v):
        if isinstance(v,list):return [normalize(x) for x in v]
        if not isinstance(v,dict):return v
        out={}
        for key,x in v.items():
            if key in ("created_at","updated_at"):
                assert isinstance(x,(int,float)) and abs(time.time()-x)<180
                out[key]="<server-clock>"
            else:out[key]=normalize(x)
        return out
    def request(name,method,path,status,*,actor="teacher",**kwargs):
        who=seed[actor];rid="assignment:"+name
        response=client.request(method,path,headers={"Cookie":"cirnet_session="+who["token"],
            "Origin":ORIGIN,"X-CIRNET-CSRF":who["csrf"],"X-Request-ID":rid},**kwargs)
        assert response.status_code==status,(name,response.status_code,response.text)
        assert response.headers["X-Request-ID"]==rid and response.headers["Cache-Control"]=="no-store"
        assert "Set-Cookie" not in response.headers and "ETag" not in response.headers
        body=response.json();results[name]={"status":status,"body":normalize(body)}
        return body
    assert request("student-empty","GET","/api/assignments",200,actor="student")==[]
    request("student-authoring","GET","/api/assignment-documents",403,actor="student")
    request("legacy-create","POST","/api/assignments",201,json=definition("legacy-assignment"))
    request("legacy-publish","PATCH","/api/assignments/legacy-assignment/publication",200,
            json={"published":True,"feedback_policy":"observed_only"})
    legacy=request("legacy-student","GET","/api/assignments/legacy-assignment",200,actor="student")
    assert legacy["document_kind"]=="student" and "expected_behavior" not in legacy
    for version,prefix in (("v1","/api"),("v2","/api/v2")):
        identity="assignment-"+version;path=prefix+"/assignment-documents/"+identity
        made=request(version+"-create","POST",prefix+"/assignment-documents",201,json={"definition":definition(identity)})
        assert made["revision"]==1 and made["published_revision"] is None
        request(version+"-read","GET",path,200)
        request(version+"-admin-read","GET",path,200,actor="admin")
        request(version+"-foreign-read","GET",path,403,actor="other")
        request(version+"-student-document","GET",path,403,actor="student")
        request(version+"-student-unpublished","GET",prefix+"/assignments/"+identity,403,actor="student")
        published=request(version+"-publish","PATCH",path+"/publication",200,json={"base_revision":1.0,"published":True})
        assert published["revision"]==published["published_revision"]==2
        student=request(version+"-student-published","GET",prefix+"/assignments/"+identity,200,actor="student")
        assert student["title"]=="Original" and not {"definition","reference_design_graph","expected_behavior","revision","owner_id"}&set(student)
        request(version+"-list-published","GET",prefix+"/assignments",200,actor="student")
        request(version+"-list-documents","GET",prefix+"/assignment-documents",200,params={"limit":1})
        changed=definition(identity,"Future draft")
        saved=request(version+"-save","PUT",path,200,json={"base_revision":2.0,"definition":changed})
        assert saved["revision"]==3 and saved["published_revision"]==2
        still=request(version+"-still-published","GET",prefix+"/assignments/"+identity,200,actor="student")
        assert still["title"]=="Original"
        request(version+"-stale","PUT",path,409,json={"base_revision":2.0,"definition":changed})
        request(version+"-student-write","PUT",path,403,actor="student",json={"base_revision":3,"definition":changed})
        request(version+"-republish","PATCH",path+"/publication",200,json={"base_revision":3,"published":True,"feedback_policy":"detailed"})
        request(version+"-unpublish","PATCH",path+"/publication",200,json={"base_revision":4,"published":False})
        request(version+"-student-hidden","GET",prefix+"/assignments/"+identity,403,actor="student")
        request(version+"-missing","GET",prefix+"/assignment-documents/missing",404)
        request(version+"-bad-definition","POST",prefix+"/assignment-documents",422,json={"definition":{}})
    return results
def test_stage4_assignment_http_parity():
    root=artifact_directory("native-remote-assignments/"+uuid4().hex)
    print(f"Stage 4 assignment HTTP slice: {root}",flush=True)
    python,_,worker,contracts=_select_reference(root)
    native=Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    digest=sha256(native.read_bytes()).hexdigest()
    database=root/"seed.sqlite"
    seeded=subprocess.run([str(python),"-I","-B","-c",SEED_ASSIGN],cwd=root,env=_environment(root,database),capture_output=True,timeout=60)
    (root/"seed.stderr.log").write_bytes(seeded.stderr);assert seeded.returncode==0
    seed=json.loads(seeded.stdout);results={}
    for label,is_native in (("rust",True),("python",False)):
        lane=root/label;lane.mkdir();db=lane/"baseline.sqlite";shutil.copyfile(database,db)
        environment={**_environment(lane,db),"CIRNET_SIM_CPP_WORKER":str(worker),
            "CIRNET_SIM_CPP_WORKER_SHA256":WORKER_SHA256,"CIRNET_CONTRACTS_ROOT":str(contracts),
            "CIRNET_SIMULATION_BACKEND":"cpp","CIRNET_HARDWARE_GRPC_TARGET":"127.0.0.1:9",
            "CIRNET_REMOTE_READ_ONLY":"false"}
        command=[str(native),"--listen","127.0.0.1:0","--exit-on-stdin-eof"] if is_native else [
            str(python),"-I","-B","-c",SERVE_REFERENCE]
        with _http_service(command,lane,environment) as client:results[label]=exercise(client,seed)
        assert not any((lane/"captures").iterdir())
        (lane/"http-observations.json").write_text(json.dumps(results[label],indent=2)+"\n",encoding="utf-8")
    assert sha256(native.read_bytes()).hexdigest()==digest
    assert results["rust"]==results["python"]
    (root/"comparison.json").write_text(json.dumps({"status":"PASS","scope":"isolated assignment REST SQLite, no Hardware action",
        "candidate_sha256":digest,"reference_manifest_sha256":REFERENCE_SHA256,
        "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),"tested_operations":sorted(OPERATIONS),
        "observations_per_side":len(results["rust"]),"normalization":"Only server timestamps, independently bounded to 180s.",
        "full_gate4":"NOT RUN"},indent=2)+"\n",encoding="utf-8")
