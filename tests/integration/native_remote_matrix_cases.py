"""SQLite/PostgreSQL HTTP groups on fresh copies of one exact Python seed.

Each backend gets isolated processes and databases. These are compatibility
checks; timing is diagnostic and this suite is not the loaded Stop gate.
"""
from hashlib import sha256
import json,os,shutil,subprocess
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4
import pytest
import psycopg
from scripts.artifact_paths import artifact_directory
from tests.integration import native_remote_auth_cases as auth
from tests.integration import native_remote_assignments_cases as assignments
from tests.integration import native_remote_projects_cases as projects
from tests.integration import native_remote_experiments_cases as experiments
from tests.integration.native_remote_gate_cases import (
 SEED,SERVE_REFERENCE,REFERENCE_SHA256,WORKER_SHA256,_select_reference,_environment,_http_service,
)
from tests.integration.native_hardware_gate_cases import native_service

def _database(root,backend):
 if backend=="sqlite":
  source=root/"seed.sqlite"
  def copy(label):
   lane=root/label;lane.mkdir();target=lane/"remote.sqlite";shutil.copyfile(source,target)
   return lane,"sqlite:///"+target.as_posix()
  return "sqlite:///"+source.as_posix(),copy,{}
 state=json.loads(Path(os.environ["CIRNET_REMOTE_PG_STATE"]).read_bytes())
 password=Path(state["password_file"]).read_text().strip()
 def connection():
  return psycopg.connect(host=state["host"],port=state["port"],user=state["admin_user"],
   password=password,dbname="postgres",autocommit=True)
 def url(name):
  return f"postgresql+psycopg://{quote(state['admin_user'])}:{quote(password)}@{state['host']}:{state['port']}/{name}"
 source="stage4_http_"+uuid4().hex[:16]
 with connection() as db:
  db.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(source)))
 databases={"seed":source}
 def copy(label):
  lane=root/label;lane.mkdir();name="stage4_http_"+uuid4().hex[:16]
  with connection() as db:
   assert db.execute("SELECT COUNT(*) FROM pg_stat_activity WHERE datname=%s",(source,)).fetchone()[0]==0
   db.execute(psycopg.sql.SQL("CREATE DATABASE {} TEMPLATE {}").format(psycopg.sql.Identifier(name),psycopg.sql.Identifier(source)))
  databases[label]=name
  return lane,url(name)
 return url(source),copy,databases

def environment(lane,url):
 return {**_environment(lane,lane/"unused.sqlite"),"CIRNET_DATABASE_URL":url,"CIRNET_REMOTE_READ_ONLY":"false"}

@pytest.mark.parametrize("backend",["sqlite","postgres"])
@pytest.mark.parametrize("group",["auth","projects","assignments","experiments"])
def test_stage4_native_database_http_matrix(backend,group):
 selected=os.environ.get("CIRNET_STAGE4_MATRIX_BACKEND")
 if selected and selected!=backend:pytest.skip("other backend runs in its own lane")
 root=artifact_directory("native-remote-matrix/"+backend+"-"+group+"-"+uuid4().hex)
 print(f"Stage 4 HTTP matrix {backend}/{group}: {root}",flush=True)
 python,hardware,worker,contracts=_select_reference(root)
 native=Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
 assert native.is_relative_to(artifact_directory())
 candidate_sha=sha256(native.read_bytes()).hexdigest()
 url,copy,databases= _database(root,backend)
 script={"auth":auth.SEED_AUTH,"assignments":assignments.SEED_ASSIGN}.get(group,SEED)
 seeded=subprocess.run([str(python),"-I","-B","-c",script],cwd=root,env=environment(root,url),capture_output=True,timeout=60)
 (root/"seed.stderr.log").write_bytes(seeded.stderr);assert seeded.returncode==0
 seed=json.loads(seeded.stdout);results={};payloads={}
 graph=None
 if group=="projects":
  graph=json.loads((Path(seed["contracts"])/"circuit-schema/examples/physical-hc08-led.json").read_bytes())
 for label,is_native in (("python",False),("rust",True)):
  lane,url=copy(label)
  env={**environment(lane,url),"CIRNET_CONTRACTS_ROOT":str(contracts),"CIRNET_SIM_CPP_WORKER":str(worker),
   "CIRNET_SIM_CPP_WORKER_SHA256":WORKER_SHA256,"CIRNET_SIMULATION_BACKEND":"cpp"}
  with native_service(lane,env,{"executable":hardware,"contracts":contracts}) as (_, (port,_)):
   env["CIRNET_HARDWARE_GRPC_TARGET"]=f"127.0.0.1:{port}"
   command=[str(native),"--listen","127.0.0.1:0","--exit-on-stdin-eof"] if is_native else [str(python),"-I","-B","-c",SERVE_REFERENCE]
   with _http_service(command,lane,env) as client:
    if group=="auth":results[label]={"http":auth._exercise_auth(client,seed),"cors":auth._exercise_cors(client)}
    elif group=="projects":results[label]=projects._exercise_projects(client,seed,graph)
    elif group=="assignments":results[label]=assignments.exercise(client,seed)
    else:results[label],payloads[label]=experiments.exercise(client,seed)
   if group!="experiments":assert not any((lane/"captures").iterdir())
  (lane/"observations.json").write_text(json.dumps(results[label],indent=2)+"\n",encoding="utf-8")
 assert sha256(native.read_bytes()).hexdigest()==candidate_sha
 matching=results["python"]==results["rust"] and (not payloads or payloads["python"]==payloads["rust"])
 (root/"comparison.json").write_text(json.dumps({"status":"PASS" if matching else "FAIL","backend":backend,"group":group,
  "candidate_sha256":candidate_sha,"reference_manifest_sha256":REFERENCE_SHA256,
  "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),"seed_script_sha256":sha256(script.encode()).hexdigest(),
  "exercise_sha256":sha256(Path({"auth":auth,"projects":projects,"assignments":assignments,"experiments":experiments}[group].__file__).read_bytes()).hexdigest(),
  "database_copies":databases,"loaded_stop":"NOT RUN","full_gate4":"NOT RUN"},indent=2)+"\n",encoding="utf-8")
 assert matching,"HTTP group mismatch; inspect bounded group observations in owned receipt"
