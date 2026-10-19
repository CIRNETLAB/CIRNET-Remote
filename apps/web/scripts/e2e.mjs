import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { readdir,readFile,writeFile } from 'node:fs/promises'
import { getArtifactDirectory } from '../../../scripts/artifact-paths.mjs'
import { stopOwnedBackend } from './e2e-lifecycle.mjs'
const root=resolve('../..'),args=process.argv.slice(2)
for(let index=0;index<args.length;index++) {
  const output=/^(--output|-o)(?:=(.*))?$/.exec(args[index])
  if(!output) continue
  const directory=output[2]??args[index+1]
  if(!directory||directory.startsWith('-')) throw new Error(`${output[1]} requires an external artifact parent directory.`)
  process.env.NETCIRCUIT_ARTIFACTS_SESSION=getArtifactDirectory('',{directory:resolve(directory)})
  const ownedOutput=getArtifactDirectory('playwright')
  if(output[2]!==undefined) args[index]=`${output[1]}=${ownedOutput}`
  else args[++index]=ownedOutput
}
getArtifactDirectory()
const environment={...process.env,PLAYWRIGHT_BROWSERS_PATH:resolve(root,'.runtime/playwright')}
function execute(command,arguments_,options={}) {
  const child=spawn(command,arguments_,{stdio:'inherit',windowsHide:true,...options})
  const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1))})
  return {child,closed}
}
let backend,vite,result=1,poll,processing=Promise.resolve(),generation=0,python,pollBusy=false,lifecycleFailed=false
const processed=new Set()
async function stopBackend() {
  if(!backend) return
  const previous=backend;backend=undefined
  await stopOwnedBackend(previous)
  console.log('E2E API shutdown complete (exit 0).')
}
async function startBackend() {
  backend=execute(python,[resolve(root,'scripts/e2e_web_server.py')],{env:environment,stdio:['pipe','inherit','inherit']})
  const deadline=Date.now()+60_000
  let lastError
  while(true) {
    if(backend.child.exitCode!==null) throw new Error('The real E2E API exited during startup.')
    try {const response=await fetch('http://127.0.0.1:18181/api/health',{signal:AbortSignal.timeout(1500)});if(response.ok) break}
    catch(error) {lastError=error}
    if(Date.now()>deadline) throw new Error('The real E2E API did not become ready.',{cause:lastError})
    await new Promise(resolve=>setTimeout(resolve,200))
  }
  const status={pid:backend.child.pid,generation:++generation}
  await writeFile(resolve(environment.NETCIRCUIT_E2E_DATA_DIR,'backend.json'),JSON.stringify(status))
  return status
}
async function restartCommands() {
  for(const file of await readdir(environment.NETCIRCUIT_E2E_DATA_DIR)) {
    if(!/^restart-[a-f0-9-]{36}\.json$/.test(file)||processed.has(file)) continue
    processed.add(file)
    const id=file.slice(8,-5)
    const command=JSON.parse(await readFile(resolve(environment.NETCIRCUIT_E2E_DATA_DIR,file),'utf8'))
    if(command.id!==id||command.action!=='restart') throw new Error('Invalid E2E lifecycle command.')
    try {
      await stopBackend()
      const status=await startBackend()
      await writeFile(resolve(environment.NETCIRCUIT_E2E_DATA_DIR,`reply-${id}.json`),JSON.stringify({id,ok:true,...status}))
    } catch(error) {
      await writeFile(resolve(environment.NETCIRCUIT_E2E_DATA_DIR,`reply-${id}.json`),JSON.stringify({id,ok:false,message:error.message}))
      throw error
    }
  }
}
try {
  if(args[0]==='test') {
    environment.NETCIRCUIT_E2E_ADMIN_PASSWORD??=randomBytes(24).toString('base64url')
    environment.NETCIRCUIT_E2E_DATA_DIR=getArtifactDirectory('e2e-runtime')
    python=environment.NETCIRCUIT_E2E_PYTHON??resolve(root,'.audit-runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python')
    await startBackend()
    poll=setInterval(()=>{if(pollBusy)return;pollBusy=true;processing=restartCommands().catch(error=>{console.error(error.message);lifecycleFailed=true}).finally(()=>{pollBusy=false})},200)
    process.env.NETCIRCUIT_DEV_API_TARGET='http://127.0.0.1:18181'
    const {createServer}=await import('vite')
    vite=await createServer({server:{host:'127.0.0.1',port:14173,strictPort:true}})
    await vite.listen()
  }
  result=await execute(process.execPath,['node_modules/@playwright/test/cli.js',...args],{env:environment}).closed
} finally {
  clearInterval(poll);await processing
  await vite?.close()
  await stopBackend()
}
process.exit(lifecycleFailed?1:result)
