import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createPinia} from 'pinia'
import {defineComponent,nextTick} from 'vue'
import {mountSfc} from './helpers/vueSfc'
import {sessionFixture} from './helpers/auth'
import {deferred} from './helpers/capture'
import type {SocketLike} from '../src/services/websocket/client'

const runtime=(async()=>{
 const outfile=resolve('.test-build',`${process.pid}-notification-connection-runtime.mjs`)
 await build({stdin:{contents:`export {useLabConnection} from './src/composables/useLabConnection';export {useWorkspaceMessages} from './src/composables/useWorkspaceMessages';export {useAuthStore} from './src/stores/auth';export {useWorkspaceMessageStore} from './src/stores/workspaceMessages';export {useInstrumentStore} from './src/stores/instrument';export {configureApiClient} from './src/services/api/client'`,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':'{}'}})
 return await import(pathToFileURL(outfile).href) as typeof import('../src/composables/useLabConnection')&typeof import('../src/composables/useWorkspaceMessages')&typeof import('../src/stores/auth')&typeof import('../src/stores/workspaceMessages')&typeof import('../src/stores/instrument')&typeof import('../src/services/api/client')
})()

async function until(predicate:()=>boolean){
 for(let count=0;count<1200;count++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}
 assert.fail('Notification state did not settle within six seconds.')
}
async function setup(fetcher:typeof fetch){
 const r=await runtime,pinia=createPinia(),auth=r.useAuthStore(pinia),sockets:SocketLike[]=[]
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousSocket=globalThis.WebSocket
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{protocol:'http:',host:'testserver'}}})
 class Socket implements SocketLike{
  onopen:SocketLike['onopen']=null;onclose:SocketLike['onclose']=null;onerror:SocketLike['onerror']=null;onmessage:SocketLike['onmessage']=null
  constructor(){sockets.push(this)}close(){}send(){}
 }
 globalThis.WebSocket=Socket as unknown as typeof WebSocket
 auth.acceptSession(sessionFixture('STUDENT'))
 r.configureApiClient({fetcher})
 const view=mountSfc(defineComponent({setup(){r.useWorkspaceMessages();r.useLabConnection();return()=>null}}),pinia)
 return {auth,sockets,messages:r.useWorkspaceMessageStore(pinia),instrument:r.useInstrumentStore(pinia),async dispose(){view.app.unmount();await nextTick();globalThis.WebSocket=previousSocket;if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window')}}
}
function snapshot(url:string){return Response.json(/\/(history|active)(\?|$)/.test(url)?{schema_version:'1.0',items:[],next_cursor:null}:[])}

test('remote snapshot failures resolve after recovery without leaving a duplicate console error',async()=>{
 let unavailable=true
 const f=await setup(async url=>String(url).endsWith('/stations')&&unavailable?Response.json({code:'OFFLINE',message:'Snapshots unavailable.'},{status:503}):snapshot(String(url)))
 try{
  await until(()=>!!f.messages.hints['remote-snapshot'])
  assert.match(f.messages.current?.text??'',/Cannot refresh remote snapshots/)
  unavailable=false
  await until(()=>!f.messages.hints['remote-snapshot'])
  await nextTick()
  assert.equal(f.messages.events.some(message=>message.source==='remote-snapshot'),false)
  assert.equal(f.messages.current?.level==='error',false)
 }finally{await f.dispose()}
})

test('retiring a connection clears its remote hint and late failures cannot enter the next scope',async()=>{
 const late=deferred<Response>();let defer=false,healthy=false,deferredRequests=0
 const f=await setup(async url=>{
  if(String(url).endsWith('/stations')){
   if(defer){deferredRequests++;return late.promise}
   if(!healthy)return Response.json({code:'OFFLINE',message:'Prior session failure.'},{status:503})
  }
  return snapshot(String(url))
 })
 try{
  await until(()=>!!f.messages.hints['remote-snapshot'])
  defer=true
  f.auth.pending=true
  assert.equal(f.messages.hints['remote-snapshot'],undefined)
  f.auth.pending=false
  await until(()=>f.sockets.length===2&&deferredRequests===1)
  defer=false;healthy=true
  const session=sessionFixture('STUDENT')
  f.auth.acceptSession({...session,principal:{...session.principal!,principal_id:'replacement'}})
  late.resolve(Response.json({code:'OFFLINE',message:'Late private failure.'},{status:503}))
  await new Promise(resolve=>setTimeout(resolve,20));await nextTick()
  assert.equal(f.messages.hints['remote-snapshot'],undefined)
  assert.equal(f.instrument.entries.some(entry=>entry.source==='remote-snapshot'),false)
 }finally{late.resolve(Response.json([]));await f.dispose()}
})
