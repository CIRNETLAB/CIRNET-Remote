"""HTTP edge semantics against the exact installed Python boundary."""
from hashlib import sha256
import json,os,shutil,sqlite3,subprocess
from pathlib import Path
from uuid import uuid4
from scripts.artifact_paths import artifact_directory
from tests.integration.native_remote_gate_cases import REFERENCE_SHA256,WORKER_SHA256,ORIGIN,SERVE_REFERENCE,_select_reference,_environment,_http_service
CASES=[
 ("unknown","GET","/api/not-a-route",{}),
 ("method","PUT","/api/projects",{}),
 ("head","HEAD","/api/health",{}),
 ("options","OPTIONS","/api/projects",{}),
 ("slash","GET","/api/projects/",{}),
 ("slash-query","GET","/api/projects/",{"params":{"limit":"1"}}),
 ("float-limit","GET","/api/projects",{"params":{"limit":"1.0"}}),
 ("underscore-limit","GET","/api/projects",{"params":{"limit":"1_0"}}),
 ("large-limit","GET","/api/projects",{"params":{"limit":"99999999999999999999999"}}),
 ("negative-limit","GET","/api/projects",{"params":{"limit":"-99999999999999999999999"}}),
 ("exponent-limit","GET","/api/projects",{"params":{"limit":"1e0"}}),
 ("space-limit","GET","/api/projects",{"params":{"limit":" 1 "}}),
 ("json-eof","POST","/api/projects",{"content":b'{"name":',"headers":{"Content-Type":"application/json"}}),
 ("json-token","POST","/api/projects",{"content":b'{"name":wat}',"headers":{"Content-Type":"application/json"}}),
 ("json-trailing","POST","/api/projects",{"content":b'{"name":"x"} extra',"headers":{"Content-Type":"application/json"}}),
 ("json-newline","POST","/api/projects",{"content":b'{\n"name": }',"headers":{"Content-Type":"application/json"}}),
 ("json-unicode","POST","/api/projects",{"content":'{"name":"Việt",oops}'.encode(),"headers":{"Content-Type":"application/json"}}),
 ("json-nan","POST","/api/projects",{"content":b'{"name":NaN}',"headers":{"Content-Type":"application/json"}}),
 ("null","POST","/api/projects",{"json":None}),
 ("array","POST","/api/projects",{"json":[]}),
 ("plain-text","POST","/api/projects",{"content":b'{"name":"plain"}',"headers":{"Content-Type":"text/plain"}}),
]
def observe(client,owner,csrf):
 result={}
 for name,method,path,options in CASES:
  options=options.copy();headers={"Cookie":"cirnet_session="+owner["token"],"X-CIRNET-CSRF":csrf,
   "Origin":ORIGIN,"X-Request-ID":"edge:"+name,**options.pop("headers",{})}
  response=client.request(method,path,headers=headers,**options)
  try:body=response.json()
  except ValueError:body=response.text
  location=response.headers.get("Location")
  if location:location=location.removeprefix(str(client.base_url).rstrip("/"))
  result[name]={"status":response.status_code,"body":body,"location":location,
   "cache":response.headers.get("Cache-Control"),"allow":response.headers.get("Allow"),
   "request_id":response.headers.get("X-Request-ID"),"cookies":response.headers.get_list("Set-Cookie")}
 return result
def test_stage4_http_edges():
 root=artifact_directory("native-remote-http-edges/"+uuid4().hex);print("Stage 4 HTTP edges:",root,flush=True)
 python,_,worker,contracts=_select_reference(root)
 fixture=json.loads(Path(os.environ["CIRNET_REMOTE_PROJECT_FIXTURE"]).read_bytes())
 owner=fixture["sqlite"]["owner"];source=Path(fixture["sqlite"]["url"].removeprefix("sqlite:///"))
 source_sha=sha256(source.read_bytes()).hexdigest()
 with sqlite3.connect("file:"+source.as_posix()+"?mode=ro",uri=True) as db:
  csrf=db.execute("SELECT csrf_token FROM auth_sessions WHERE session_id=?",(owner["session_id"],)).fetchone()[0]
 native=Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
 assert native.is_relative_to(artifact_directory());digest=sha256(native.read_bytes()).hexdigest();results={}
 for label,is_native in (("python",False),("rust",True)):
  lane=root/label;lane.mkdir();db=lane/"baseline.sqlite";shutil.copyfile(source,db)
  environment={**_environment(lane,db),"CIRNET_SIM_CPP_WORKER":str(worker),"CIRNET_SIM_CPP_WORKER_SHA256":WORKER_SHA256,
   "CIRNET_CONTRACTS_ROOT":str(contracts),"CIRNET_SIMULATION_BACKEND":"cpp","CIRNET_HARDWARE_GRPC_TARGET":"127.0.0.1:9",
   "CIRNET_REMOTE_READ_ONLY":"false"}
  command=[str(native),"--listen","127.0.0.1:0","--exit-on-stdin-eof"] if is_native else [str(python),"-I","-B","-c",SERVE_REFERENCE]
  with _http_service(command,lane,environment) as client:results[label]=observe(client,owner,csrf)
  (lane/"observations.json").write_text(json.dumps(results[label],indent=2)+"\n",encoding="utf-8")
 assert sha256(source.read_bytes()).hexdigest()==source_sha
 assert sha256(native.read_bytes()).hexdigest()==digest
 mismatches=[name for name,_,_,_ in CASES if results["rust"][name]!=results["python"][name]]
 (root/"comparison.json").write_text(json.dumps({"status":"FAIL" if mismatches else "PASS","mismatches":mismatches,
  "candidate_sha256":digest,"reference_manifest_sha256":REFERENCE_SHA256,"reused_fixture_sha256":source_sha,
  "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),"cases":len(CASES),"full_gate4":"NOT RUN"},indent=2)+"\n",encoding="utf-8")
 assert not mismatches,mismatches
