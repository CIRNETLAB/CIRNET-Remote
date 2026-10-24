/** Remote owns the integrated API/RPC/Simulator lifetime. Interface owns browsers. */
import {spawn} from 'node:child_process'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomBytes} from 'node:crypto'
import {readdir,readFile,writeFile,rename} from 'node:fs/promises'
import {getArtifactDirectory} from './artifact-paths.mjs'
import {stopOwnedBackend} from './e2e-lifecycle.mjs'
import {prepareInterfaceRun} from './e2e-interface-target.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2)
const index=args.indexOf('--interface-root')
if(index!==-1) {
  if(!args[index+1]||args[index+1].startsWith('-'))throw new Error('--interface-root requires an absolute Interface product path.')
  process.env.NETCIRCUIT_INTERFACE_ROOT=args[index+1];args.splice(index,2)
}
const {product,context}=prepareInterfaceRun(args)
const environment={...process.env,NETCIRCUIT_ARTIFACTS_CONTEXT:JSON.stringify(context),
  NETCIRCUIT_E2E_ADMIN_PASSWORD:process.env.NETCIRCUIT_E2E_ADMIN_PASSWORD??randomBytes(24).toString('base64url'),
  NETCIRCUIT_E2E_DATA_DIR:getArtifactDirectory('e2e-runtime-'+randomBytes(4).toString('hex')),
  NETCIRCUIT_E2E_API_TARGET:'http://127.0.0.1:18181',
  // The origin stays fixed so cookie, CSRF and WebSocket tests share the
  // application's real same-origin Vite proxy and exact configured Origin.
  NETCIRCUIT_E2E_HTTP_PORT:'18181',NETCIRCUIT_E2E_RPC_PORT:'15151'}
const python=environment.NETCIRCUIT_E2E_PYTHON??resolve(root,'.audit-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python')
function execute(command,arguments_,options={}) {
  const child=spawn(command,arguments_,{cwd:root,stdio:'inherit',windowsHide:true,...options})
  const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1))})
  return {child,closed}
}
let backend,poll,processing=Promise.resolve(),generation=0,pollBusy=false,lifecycleFailed=false,result=1
const processed=new Set()
async function atomicStatus(name,value) {
  const temporary=resolve(environment.NETCIRCUIT_E2E_DATA_DIR,`${name}.tmp`)
  await writeFile(temporary,JSON.stringify(value))
  await rename(temporary,resolve(environment.NETCIRCUIT_E2E_DATA_DIR,name))
}
async function stopBackend() {
  if(!backend)return
  const previous=backend;backend=undefined
  await stopOwnedBackend(previous)
  console.log('E2E API shutdown complete (exit 0).')
}
async function startBackend() {
  backend=execute(python,[resolve(root,'scripts/e2e_web_server.py')],{env:environment,stdio:['pipe','inherit','inherit']})
  const deadline=Date.now()+60_000
  let lastError
  while(true) {
    if(backend.child.exitCode!==null)throw new Error('The real E2E API exited during startup.')
    try {const response=await fetch(`${environment.NETCIRCUIT_E2E_API_TARGET}/api/health`,{signal:AbortSignal.timeout(1500)});if(response.ok)break}
    catch(error){lastError=error}
    if(Date.now()>deadline)throw new Error('The real E2E API did not become ready.',{cause:lastError})
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  const status={pid:backend.child.pid,generation:++generation}
  await atomicStatus('backend.json',status)
  return status
}
async function restartCommands() {
  for(const file of await readdir(environment.NETCIRCUIT_E2E_DATA_DIR)) {
    if(!/^restart-[a-f0-9-]{36}\.json$/.test(file)||processed.has(file))continue
    processed.add(file)
    const id=file.slice(8,-5),command=JSON.parse(await readFile(resolve(environment.NETCIRCUIT_E2E_DATA_DIR,file),'utf8'))
    if(command.id!==id||command.action!=='restart')throw new Error('Invalid E2E lifecycle command.')
    try {await stopBackend();const status=await startBackend();await atomicStatus(`reply-${id}.json`,{id,ok:true,...status})}
    catch(error){await atomicStatus(`reply-${id}.json`,{id,ok:false,message:error.message});throw error}
  }
}
try {
  await startBackend()
  poll=setInterval(()=>{if(pollBusy)return;pollBusy=true;processing=restartCommands().catch(error=>{console.error(error.message);lifecycleFailed=true}).finally(()=>{pollBusy=false})},200)
  result=await execute(process.execPath,[resolve(product,'scripts/e2e.mjs'),'test',...args],{cwd:product,env:environment}).closed
} finally {
  clearInterval(poll);await processing
  await stopBackend()
}
process.exit(lifecycleFailed?1:result)
