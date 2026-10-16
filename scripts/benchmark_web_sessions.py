"""Bounded local smoke: real accounts, HTTP, SQLite, Hardware RPC and virtual jobs.

This is an observed workload, not a production capacity or physical execution claim.
Install requirements-benchmark.txt in the configured application/test environment.
"""
import argparse
from collections import Counter,defaultdict,deque
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime,timezone
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import platform
import re
import secrets
import socket
import subprocess
import sys
from threading import Event,Lock,Thread
import time
import uuid
import httpx

ROOT=Path(__file__).resolve().parents[1]
ORIGIN='http://127.0.0.1:14173'
HTTP_CONNECTIONS_PER_SESSION=1
HTTP_KEEPALIVE_EXPIRY_SECONDS=1.0


class Metrics:
    def __init__(self):
        self.values=defaultdict(list);self.lock=Lock();self.transport_count=0;self.transport_recent=deque(maxlen=10)

    def record(self,group,elapsed,status,expected):
        with self.lock:self.values[group].append((elapsed*1000,status,expected))

    def transport_failure(self,group,method,request_id,error):
        # Keep bounded correlation only, never paths, credentials or error text.
        with self.lock:
            self.transport_count+=1
            self.transport_recent.append({'operation':group[:64],'method':method[:10],
                'request_id':request_id,'error_type':type(error).__name__[:80]})

    def transport_report(self):
        with self.lock:return {'count':self.transport_count,'recent':[dict(row) for row in self.transport_recent]}

    def report(self):
        result={}
        with self.lock:
            for group,rows in sorted(self.values.items()):
                durations=sorted(row[0] for row in rows)
                def percentile(percent):return round(durations[max(0,math.ceil(len(durations)*percent/100)-1)],3)
                result[group]={'count':len(rows),'unexpected':sum(not row[2] for row in rows),
                    'status_counts':dict(sorted(Counter(str(row[1]) for row in rows).items())),
                    'p50_ms':percentile(50),'p95_ms':percentile(95),'p99_ms':percentile(99),'max_ms':round(durations[-1],3)}
        return result


class LoginPacer:
    """Conservative rolling window for the unchanged shared loopback auth limit."""
    def __init__(self,limit=10,window_seconds=60.25,clock=time.monotonic,wait=time.sleep,on_admit=None):
        self.limit,self.window_seconds,self.clock,self.wait=limit,window_seconds,clock,wait
        self.times=deque();self.lock=Lock();self.on_admit=on_admit;self.admitted=0

    def acquire(self):
        with self.lock:
            while True:
                now=self.clock()
                while self.times and now-self.times[0]>=self.window_seconds:self.times.popleft()
                if len(self.times)<self.limit:
                    self.times.append(now);self.admitted+=1
                    if self.on_admit:self.on_admit(self.admitted)
                    return
                self.wait(max(.001,self.window_seconds-(now-self.times[0])))


def validate_options(sessions,concurrency,runs,rounds):
    if (any(type(value) is not int for value in (sessions,concurrency,runs,rounds))
            or not 30<=sessions<=50 or not 1<=concurrency<=sessions or not 1<=runs<=16 or not 1<=rounds<=20):
        raise ValueError('WORKLOAD_BOUNDS: sessions30..50, concurrency1..sessions, runs1..16, read-rounds1..20')


def verify_digital_evidence(metadata,binary):
    from contracts.capture_codec import decode_digital
    if (metadata.get('source')!='simulation' or metadata.get('available') is not True
            or len(binary)!=metadata.get('payload_byte_count') or sha256(binary).hexdigest()!=metadata.get('sha256')):
        raise ValueError('CAPTURE_INTEGRITY')
    data=decode_digital(binary)
    expected=[{'signal':'G.Y1','time_ns':0,'value':'X'},{'signal':'G.Y1','time_ns':8,'value':0},
        {'signal':'G.Y1','time_ns':28,'value':1}]
    if data['duration_ns']!=40 or data['samples']!=expected or metadata.get('sample_count')!=len(expected):
        raise ValueError('OBSERVATION_MISMATCH')
    return len(data['samples'])


def graph(index):
    return {'schema_version':'1.0','circuit_id':f'benchmark-{index}',
        'modules':[{'id':'X','type':'DIGITAL_SWITCH','properties':{'state':False}},
            {'id':'Y','type':'DIGITAL_SWITCH','properties':{'state':True}},
            {'id':'G','type':'74HC08'},{'id':'L','type':'LED'}],
        'connections':[{'source':'X.OUT','destination':'G.A1'},{'source':'Y.OUT','destination':'G.B1'},
            {'source':'G.Y1','destination':'L.IN'}],
        'metadata':{'benchmark_design':True,'opaque_extension':[None,True,7]}}


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0));return listener.getsockname()[1]


class ResourceMonitor:
    def __init__(self,pid):
        import psutil
        self.psutil=psutil;self.pid=pid;self.ended=Event();self.peak_rss=0;self.peak_processes=0;self.cpu={};self.samples=0;self.errors=Counter()
        self.thread=Thread(target=self.run,daemon=True);self.thread.start()

    def run(self):
        while not self.ended.is_set():
            try:
                root=self.psutil.Process(self.pid);processes=[root,*root.children(recursive=True)]
            except self.psutil.NoSuchProcess:break
            except self.psutil.AccessDenied:self.errors['process_tree_access_denied']+=1;break
            total=0;count=0
            for process in processes:
                try:
                    total+=process.memory_info().rss;cpu=process.cpu_times();count+=1
                    self.cpu[process.pid]=max(self.cpu.get(process.pid,0),cpu.user+cpu.system)
                except self.psutil.NoSuchProcess:continue
                except self.psutil.AccessDenied:self.errors['process_sample_access_denied']+=1;continue
            self.peak_rss=max(self.peak_rss,total);self.peak_processes=max(self.peak_processes,count);self.samples+=1
            self.ended.wait(.1)

    def finish(self):
        self.ended.set();self.thread.join(timeout=2)
        return {'peak_sum_rss_bytes':self.peak_rss,'sum_observed_cpu_seconds':round(sum(self.cpu.values()),3),
            'peak_processes':self.peak_processes,'samples':self.samples,'interval_seconds':.1,
            'coverage_errors':dict(self.errors),'complete_observed_access':not self.errors and self.samples>0,
            'scope':'owned API + local Hardware Service + descendant virtual workers; sum RSS counts shared pages per process'}


def stop_owned_backend(child,psutil,*,graceful_seconds=15,force_seconds=3):
    """Only the recorded child and its descendants are eligible for forced cleanup."""
    try:child.stdin.close()
    except (BrokenPipeError,OSError):pass
    inspection_denied=False;descendants=[]
    def inspect():
        nonlocal inspection_denied
        try:return psutil.Process(child.pid).children(recursive=True)
        except psutil.NoSuchProcess:return []
        except psutil.AccessDenied:inspection_denied=True;return []
    descendants=inspect()
    deadline=False
    try:child.wait(timeout=graceful_seconds)
    except subprocess.TimeoutExpired:deadline=True
    if deadline:
        descendants=list({process.pid:process for process in [*descendants,*inspect()]}.values())
    _,alive=psutil.wait_procs(descendants,timeout=1 if not deadline else 0)
    if deadline or alive:
        owned=[*alive]
        for process in owned:
            try:process.terminate()
            except psutil.NoSuchProcess:pass
        if child.poll() is None:child.terminate()
        _,remaining=psutil.wait_procs(owned,timeout=force_seconds)
        for process in remaining:
            try:process.kill()
            except psutil.NoSuchProcess:pass
        _,survivors=psutil.wait_procs(remaining,timeout=force_seconds)
        try:child.wait(timeout=force_seconds)
        except subprocess.TimeoutExpired:child.kill();child.wait(timeout=force_seconds)
        if survivors:raise ValueError('OWNED_BACKEND_PROCESSES_SURVIVED')
        raise ValueError('OWNED_BACKEND_SHUTDOWN_DEADLINE')
    if inspection_denied:raise ValueError('OWNED_BACKEND_INSPECTION_DENIED')
    if child.returncode!=0:raise ValueError('OWNED_BACKEND_SHUTDOWN_FAILED')
    return child.returncode


class Session:
    def __init__(self,url,metrics):
        self.metrics=metrics
        # Expire locally before the current Uvicorn five-second idle deadline.
        # This avoids reusing a socket across that server-close boundary; no
        # request, especially a mutation, is retried after a transport failure.
        limits=httpx.Limits(max_connections=HTTP_CONNECTIONS_PER_SESSION,max_keepalive_connections=HTTP_CONNECTIONS_PER_SESSION,
            keepalive_expiry=HTTP_KEEPALIVE_EXPIRY_SECONDS)
        self.client=httpx.Client(base_url=url,headers={'Origin':ORIGIN,'X-Control-Client':uuid.uuid4().hex},timeout=30,trust_env=False,limits=limits)

    def request(self,group,method,path,*,expected=(200,),**kwargs):
        began=time.perf_counter();status=0;valid=False;request_id='bench:'+uuid.uuid4().hex
        try:
            headers=httpx.Headers(kwargs.pop('headers',{}));headers['X-Request-ID']=request_id
            response=self.client.request(method,path,headers=headers,**kwargs)
            status=response.status_code;valid=status in expected
            if not valid:raise ValueError(f'UNEXPECTED_HTTP_{group}_{status}')
            return response
        except httpx.TransportError as error:
            self.metrics.transport_failure(group,method,request_id,error)
            raise
        finally:self.metrics.record(group,time.perf_counter()-began,status,valid)

    def authenticate(self,username,password,pacer):
        session=self.request('session','GET','/api/auth/session').json()
        self.client.headers['X-CSRF-Token']=session['csrf_token']
        pacer.acquire()
        authenticated=self.request('login','POST','/api/auth/login',json={'username':username,'password':password}).json()
        if authenticated['principal']['kind']!='USER':raise ValueError('AUTHENTICATION_MISMATCH')
        self.client.headers['X-CSRF-Token']=authenticated['csrf_token']
        return authenticated['principal']['principal_id']

    def close(self):self.client.close()


def workload(url,metrics,options,password):
    def progress(count):
        if count%10==0:print(f'Benchmark bootstrap: {count} logins admitted under unchanged address policy.',flush=True)
    admin=Session(url,metrics);clients=[];pacer=LoginPacer(on_admit=progress);bootstrap_began=time.perf_counter()
    try:
        admin.authenticate('e2e_admin',password,pacer)
        credentials=[]
        for index in range(options.sessions):
            username='load_'+uuid.uuid4().hex[:20];secret=secrets.token_urlsafe(24)
            admin.request('create_student','POST','/api/admin/users',expected=(201,),json={
                'username':username,'password':secret,'display_name':f'Load student {index}','role':'STUDENT'})
            credentials.append((username,secret));clients.append(Session(url,metrics))
        with ThreadPoolExecutor(max_workers=options.concurrency) as pool:
            principal_ids=list(pool.map(lambda pair:pair[0].authenticate(*pair[1],pacer),zip(clients,credentials)))
        if len(set(principal_ids))!=options.sessions:raise ValueError('SESSION_ISOLATION_MISMATCH')
        bootstrap_seconds=time.perf_counter()-bootstrap_began;workload_began=time.perf_counter()
        print(f'Benchmark: {len(principal_ids)} authenticated sessions ready; starting bounded active workload.',flush=True)
        def save(index):
            client=clients[index];project=client.request('create_project','POST','/api/projects',expected=(201,),json={'name':f'Load {index}'}).json()
            original=graph(index)
            document=client.request('create_circuit','POST',f"/api/projects/{project['project_id']}/circuits",expected=(201,),json={'name':'AND','graph':original}).json()
            edited=deepcopy(original);edited['metadata']['saved_revision']=2
            path='/api/circuits/'+document['document_id'];payload={'base_revision':1,'name':'AND edited','graph':edited}
            saved=client.request('save_circuit','PUT',path,json=payload).json()
            if saved['revision']!=2 or saved['graph']!=edited:raise ValueError('PERSISTENCE_MISMATCH')
            conflict=client.request('save_conflict','PUT',path,expected=(409,),json=payload).json()
            if conflict['code']!='REVISION_CONFLICT':raise ValueError('CONFLICT_MISMATCH')
            reopened=client.request('open_circuit','GET',path).json()
            if reopened!=saved:raise ValueError('PERSISTENCE_MISMATCH')
            return saved
        with ThreadPoolExecutor(max_workers=options.concurrency) as pool:documents=list(pool.map(save,range(options.sessions)))
        def reads(index):
            client=clients[index]
            for _ in range(options.read_rounds):
                for label,path,bound in (('projects','/api/projects?limit=10',10),('history','/api/experiments/history?limit=10',10),
                        ('active','/api/experiments/active',100),('stations','/api/stations',None)):
                    response=client.request('read_'+label,'GET',path).json()
                    if bound is not None and isinstance(response,dict) and 'items' in response and len(response['items'])>bound:raise ValueError('PAGE_BOUND_MISMATCH')
            forbidden=client.request('foreign_document','GET','/api/circuits/'+documents[(index+1)%options.sessions]['document_id'],expected=(403,)).json()
            if forbidden['code']!='FORBIDDEN':raise ValueError('OWNERSHIP_MISMATCH')
        with ThreadPoolExecutor(max_workers=options.concurrency) as pool:list(pool.map(reads,range(options.sessions)))
        def execute(index):
            client=clients[index];document=documents[index];key=uuid.uuid4().hex
            created=client.request('create_experiment','POST','/api/experiments',expected=(201,),headers={'Idempotency-Key':key+':create'},json={
                'station_id':'virtual-station-01','circuit_document_id':document['document_id'],'circuit_revision':document['revision'],
                'capture_config':{'signals':['G.Y1'],'duration_ns':40,'max_events':100},
                'test_vectors':[{'time_ns':20,'inputs':{'X.OUT':1}}]}).json()
            path='/api/experiments/'+created['experiment_id']
            client.request('run','POST',path+'/run',headers={'Idempotency-Key':key+':run'})
            deadline=time.monotonic()+30
            while True:
                result=client.request('poll_experiment','GET',path).json()
                if result['state']=='FAULT':raise ValueError('VIRTUAL_EXECUTION_FAULT')
                if result['state']=='COMPLETE' and result['lease_expires_at'] is None:break
                if time.monotonic()>deadline:raise ValueError('VIRTUAL_EXECUTION_DEADLINE')
                time.sleep(.05)
            metadata=result['capture'];payload=client.request('capture_payload','GET',metadata['payload_ref'])
            if not payload.headers.get('content-type','').startswith('application/vnd.netcircuit.capture; version=1'):raise ValueError('CAPTURE_MEDIA_MISMATCH')
            count=verify_digital_evidence(metadata,payload.content)
            client.request('stop_terminal','POST',path+'/stop',headers={'Idempotency-Key':key+':stop'})
            retained=client.request('capture_after_stop','GET',metadata['payload_ref'])
            if retained.content!=payload.content:raise ValueError('CAPTURE_RETENTION_MISMATCH')
            return count
        with ThreadPoolExecutor(max_workers=min(4,options.concurrency)) as pool:counts=list(pool.map(execute,range(options.runs)))
        return {'authenticated_distinct_principals':len(set(principal_ids)),'saved_and_reopened_documents':len(documents),
            'cas_conflicts_verified':len(documents),'foreign_document_denials_verified':options.sessions,
            'real_virtual_captures_verified':len(counts),'observed_samples_verified':sum(counts),'captures_retained_after_stop':len(counts),
            'paced_bootstrap_seconds':round(bootstrap_seconds,3),'active_workload_seconds':round(time.perf_counter()-workload_began,3)}
    finally:
        for client in clients:client.close()
        admin.close()


def run(options):
    import psutil
    validate_options(options.sessions,options.concurrency,options.runs,options.read_rounds)
    run_id=uuid.uuid4().hex;directory=ROOT/'.runtime/e2e'/('benchmark-'+run_id);directory.mkdir(parents=True)
    http_port,rpc_port=free_port(),free_port()
    while rpc_port==http_port:rpc_port=free_port()
    url=f'http://127.0.0.1:{http_port}';password=secrets.token_urlsafe(32)
    environment={**os.environ,'NETCIRCUIT_E2E_DATA_DIR':str(directory),'NETCIRCUIT_E2E_ADMIN_PASSWORD':password,
        'NETCIRCUIT_E2E_HTTP_PORT':str(http_port),'NETCIRCUIT_E2E_RPC_PORT':str(rpc_port),
        'NETCIRCUIT_SIMULATION_WORKERS':'4','PYTHONUNBUFFERED':'1'}
    metrics=Metrics();began=time.perf_counter();monitor=None;child=None
    report={'status':'FAIL','started_at':datetime.now(timezone.utc).isoformat(),'environment':{
        'platform':platform.platform(),'python':platform.python_version(),'logical_cpus':os.cpu_count(),'host_ram_bytes':psutil.virtual_memory().total,
        'database':'isolated development SQLite','api_workers':1,'virtual_worker_limit':4,'physical_executions':0},
        'workload':{'sessions':options.sessions,'max_inflight_http':options.concurrency,'read_rounds':options.read_rounds,
            'bootstrap_login_policy':'shared loopback address paced to10 logins/60.25seconds including administrator; server10/60s policy unchanged',
            'real_virtual_runs':options.runs,'max_concurrent_virtual_runs':min(4,options.concurrency),
            'graph':'switches → 74HC08 AND → LED; x changes at20ns; observed X@0,0@8,1@28ns'},
        'http_transport':{'protocol':'HTTP/1.1','max_connections_per_session':HTTP_CONNECTIONS_PER_SESSION,
            'max_keepalive_connections_per_session':HTTP_CONNECTIONS_PER_SESSION,'keepalive_expiry_seconds':HTTP_KEEPALIVE_EXPIRY_SECONDS,
            'automatic_retries':0},
        'artifacts':{'data_directory':directory.relative_to(ROOT).as_posix(),'backend_log':(directory/'backend.log').relative_to(ROOT).as_posix()}}
    try:
        with (directory/'backend.log').open('wb') as log:
            child=subprocess.Popen([sys.executable,str(ROOT/'scripts/e2e_web_server.py')],cwd=ROOT,env=environment,
                stdin=subprocess.PIPE,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            try:
                monitor=ResourceMonitor(child.pid)
                deadline=time.monotonic()+60
                with httpx.Client(base_url=url,timeout=1,trust_env=False) as probe:
                    while True:
                        if child.poll() is not None:raise ValueError('OWNED_BACKEND_STARTUP_FAILED')
                        try:
                            if probe.get('/api/health').status_code==200:break
                        except httpx.TransportError:pass
                        if time.monotonic()>deadline:raise ValueError('OWNED_BACKEND_STARTUP_DEADLINE')
                        time.sleep(.1)
                report['verification']=workload(url,metrics,options,password)
                report['status']='PASS'
            finally:
                report['backend_exit_code']=stop_owned_backend(child,psutil)
    except Exception as error:
        report['status']='FAIL'
        report['error']=str(error) if isinstance(error,ValueError) and re.fullmatch('[A-Z_0-9:-]{1,160}',str(error)) else type(error).__name__
    finally:
        if monitor:
            report['resources']=monitor.finish()
            if not report['resources']['complete_observed_access']:
                report['status']='FAIL';report['resource_error']='INCOMPLETE_PROCESS_SAMPLE_ACCESS'
        report['duration_seconds']=round(time.perf_counter()-began,3);report['latency_by_operation']=metrics.report()
        report['transport_errors']=metrics.transport_report()
        files=[path for path in directory.rglob('*') if path.is_file()]
        report['disk']={'total_bytes':sum(path.stat().st_size for path in files),
            'capture_payload_bytes':sum(path.stat().st_size for path in files if path.suffix=='.ncap'),
            'capture_payload_count':sum(path.suffix=='.ncap' for path in files)}
        report['limitations']=['One bounded local run; not a sustained-load, production PostgreSQL, TLS or target Mini PC capacity benchmark.',
            'HTTP session count is distinct from virtual job concurrency; no physical execution or analog acquisition is exercised.',
            'Resource samples cover the owned backend tree, not browser, other tools or unique physical memory.']
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sessions',type=int,default=50);parser.add_argument('--concurrency',type=int,default=10)
    parser.add_argument('--runs',type=int,default=8);parser.add_argument('--read-rounds',type=int,default=3)
    parser.add_argument('--output',type=Path,required=True)
    options=parser.parse_args()
    try:validate_options(options.sessions,options.concurrency,options.runs,options.read_rounds)
    except ValueError as error:parser.error(str(error))
    report=run(options);options.output.parent.mkdir(parents=True,exist_ok=True)
    options.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'duration_seconds':report['duration_seconds'],'report':str(options.output)}))
    return 0 if report['status']=='PASS' else 1


if __name__=='__main__':raise SystemExit(main())
