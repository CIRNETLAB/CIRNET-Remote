"""Real Remote orchestration repeats safely inside one owned artifact session."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import uuid

from scripts.artifact_paths import artifact_directory

ROOT=Path(__file__).resolve().parents[2]

# A browser-free exported product exercises the actual HTTP/auth/database and
# restart protocol. It neither starts a browser nor replaces API/RPC services.
PRODUCT_SCRIPT=r'''
import assert from 'node:assert/strict'
import {readFile,readdir,writeFile,rename} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
const data=process.env.NETCIRCUIT_E2E_DATA_DIR,target=process.env.NETCIRCUIT_E2E_API_TARGET
const owned=process.env.NETCIRCUIT_ARTIFACTS_SESSION
assert.deepEqual(process.argv.slice(2),['test','--forbid-only'],'Remote must consume output flags before child startup')
assert.equal(resolve(data,'..'),owned)
for(const key of ['TMP','TEMP','TMPDIR'])assert.equal(process.env[key],resolve(owned,'tmp'))
assert.equal(process.env.npm_config_cache,resolve(owned,'npm-cache'))
const origin='http://127.0.0.1:14173',cookies=new Map()
let session
async function request(path,{method='GET',body}={}) {
 const headers={Origin:origin,Cookie:[...cookies].map(([key,value])=>key+'='+value).join('; ')}
 if(session)headers['X-CSRF-Token']=session.csrf_token
 if(body)headers['Content-Type']='application/json'
 const response=await fetch(target+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)})
 for(const cookie of response.headers.getSetCookie()){
  const pair=cookie.split(';')[0],index=pair.indexOf('=');cookies.set(pair.slice(0,index),pair.slice(index+1))
 }
 return response
}
const before=JSON.parse(await readFile(resolve(data,'backend.json'),'utf8'))
assert.equal(before.generation,1)
assert.deepEqual((await readdir(data)).filter(name=>name.startsWith('restart-')),[],'a new invocation must not inherit restart commands')
session=await(await request('/api/auth/session')).json()
const login=await request('/api/auth/login',{method:'POST',body:{username:'e2e_admin',password:process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD}})
assert.equal(login.status,200,'fresh invocation admin credentials must authenticate')
session=await login.json()
assert.equal(session.authenticated,true)
const principal=session.principal.principal_id
assert.ok(principal)
assert.deepEqual((await(await request('/api/projects')).json()).items,[],'a new invocation must have a fresh database')
const created=await request('/api/projects',{method:'POST',body:{name:'Rerun isolation '+randomUUID()}})
assert.equal(created.status,201)
const project=await created.json(),id=randomUUID()
const temporary=resolve(data,'restart-'+id+'.tmp')
await writeFile(temporary,JSON.stringify({id,action:'restart'}));await rename(temporary,resolve(data,'restart-'+id+'.json'))
const deadline=Date.now()+45000
let reply
while(!reply){
 try{reply=JSON.parse(await readFile(resolve(data,'reply-'+id+'.json'),'utf8'))}
 catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error}
 if(Date.now()>deadline)throw new Error('Remote did not acknowledge the real API restart')
 if(!reply)await new Promise(resolve=>setTimeout(resolve,100))
}
assert.equal(reply.ok,true);assert.notEqual(reply.pid,before.pid);assert.equal(reply.generation,2)
const restored=await(await request('/api/auth/session')).json()
assert.equal(restored.authenticated,true)
assert.equal(restored.principal.principal_id,principal,'the same authenticated session must survive an in-run restart')
const projects=await(await request('/api/projects')).json()
assert.deepEqual(projects.items.map(item=>item.project_id),[project.project_id],'an in-run restart must preserve its database')
await new Promise(resolve=>setTimeout(resolve,650))
assert.equal(JSON.parse(await readFile(resolve(data,'backend.json'),'utf8')).generation,2,'processed restart commands must not replay')
await writeFile(process.env.NETCIRCUIT_RERUN_RESULT,JSON.stringify({data,project:project.project_id,
 owned,passwordHash:createHash('sha256').update(process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD).digest('hex'),before,after:reply}))
'''


def available_port():
    for _ in range(100):
        port=10000+secrets.randbelow(20000)
        with socket.socket() as listener:
            try:listener.bind(('127.0.0.1',port))
            except OSError:continue
            return port
    raise AssertionError('No isolated normal loopback port is available.')


def run_case(directory,*,constant=False,explicit_output=False):
    """constant=True reproduces the prior shared-directory design externally."""
    directory=Path(directory);directory.mkdir()
    product=directory/'product';(product/'scripts').mkdir(parents=True)
    (product/'package.json').write_text(json.dumps({'devDependencies':{'@playwright/test':'1.64.1'}}),encoding='utf-8')
    (product/'scripts/e2e.mjs').write_text(PRODUCT_SCRIPT,encoding='utf-8')
    http_port,rpc_port=available_port(),available_port()
    while rpc_port==http_port:rpc_port=available_port()
    source=(ROOT/'scripts/e2e-interface.mjs').read_text(encoding='utf-8')
    # Only the external fixture's ports/module location change, allowing this
    # real orchestration gate to coexist with the pinned full browser ports.
    source=source.replace("const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=",
        'const root='+json.dumps(str(ROOT))+',args=')
    for name in ('artifact-paths.mjs','e2e-lifecycle.mjs','e2e-interface-target.mjs'):
        source=source.replace("'./"+name+"'",json.dumps((ROOT/'scripts'/name).as_uri()))
    source=source.replace('18181',str(http_port)).replace('15151',str(rpc_port))
    if constant:
        unique="getArtifactDirectory('e2e-runtime-'+randomBytes(4).toString('hex'))"
        assert unique in source,'Update the reproduction when the unique runtime allocation changes.'
        source=source.replace(unique,"getArtifactDirectory('rerun-constant-"+uuid.uuid4().hex+"')")
    runner=directory/'owned-orchestrator.mjs';runner.write_text(source,encoding='utf-8')
    results=[]
    for attempt in range(2):
        result_file=directory/f'result-{attempt}.json';log_file=directory/f'invocation-{attempt}.log'
        environment={**os.environ,'NETCIRCUIT_INTERFACE_ROOT':str(product),
            'NETCIRCUIT_E2E_PYTHON':sys.executable,'NETCIRCUIT_RERUN_RESULT':str(result_file)}
        environment.pop('NETCIRCUIT_E2E_ADMIN_PASSWORD',None)
        with log_file.open('w',encoding='utf-8') as output:
            output_args=['--output',str(directory/f'output-parent-{attempt}')] if explicit_output else []
            result=subprocess.run(['node',str(runner),*output_args,'--forbid-only'],cwd=ROOT,env=environment,
                stdout=output,stderr=subprocess.STDOUT,timeout=110,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        assert result.returncode==0,log_file.read_text(encoding='utf-8')
        results.append(json.loads(result_file.read_text(encoding='utf-8')))
    assert results[0]['data']!=results[1]['data'],'Independent invocations must own separate backend state.'
    if explicit_output:
        assert results[0]['owned']!=results[1]['owned'],'Explicit output invocations must adopt independent sessions.'
    else:
        assert results[0]['owned']==results[1]['owned'],'Default invocations must exercise one inherited session.'
    assert results[0]['passwordHash']!=results[1]['passwordHash']
    assert results[0]['project']!=results[1]['project']
    return results


def test_real_orchestrator_repeats_with_fresh_state_but_preserves_in_run_restart():
    directory=artifact_directory('orchestrator-rerun-'+uuid.uuid4().hex)/'case'
    run_case(directory)


def test_real_orchestrator_adopts_explicit_output_before_backend_and_child_startup():
    directory=artifact_directory('orchestrator-output-'+uuid.uuid4().hex)/'case'
    run_case(directory,explicit_output=True)
