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
import {stationFixture,runningExperiment} from './helpers/station'

const runtime=(async()=>{
 const outfile=resolve('.test-build',`${process.pid}-notification-connection-runtime.mjs`)
 await build({stdin:{contents:`export {useLabConnection} from './src/composables/useLabConnection';export {useWorkspaceMessages} from './src/composables/useWorkspaceMessages';export {useAuthStore} from './src/stores/auth';export {useWorkspaceMessageStore} from './src/stores/workspaceMessages';export {useInstrumentStore} from './src/stores/instrument';export {useStationStore} from './src/stores/station';export {useExperimentStore} from './src/stores/experiment';export {useUiStore} from './src/stores/ui';export {configureApiClient} from './src/services/api/client'`,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':'{}'}})
 return await import(pathToFileURL(outfile).href) as typeof import('../src/composables/useLabConnection')&typeof import('../src/composables/useWorkspaceMessages')&typeof import('../src/stores/auth')&typeof import('../src/stores/workspaceMessages')&typeof import('../src/stores/instrument')&typeof import('../src/stores/station')&typeof import('../src/stores/experiment')&typeof import('../src/stores/ui')&typeof import('../src/services/api/client')
})()

async function until(predicate:()=>boolean){
 for(let count=0;count<1200;count++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5))}
 assert.fail('Notification state did not settle within six seconds.')
}
async function setup(fetcher:typeof fetch){
 const r=await runtime,pinia=createPinia(),auth=r.useAuthStore(pinia),sockets:SocketLike[]=[]
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousSocket=globalThis.WebSocket,previousStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
 const storage=new Map<string,string>()
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value)}}})
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{protocol:'http:',host:'testserver'}}})
 class Socket implements SocketLike{
  onopen:SocketLike['onopen']=null;onclose:SocketLike['onclose']=null;onerror:SocketLike['onerror']=null;onmessage:SocketLike['onmessage']=null
  constructor(){sockets.push(this)}close(){}send(){}
 }
 globalThis.WebSocket=Socket as unknown as typeof WebSocket
 auth.acceptSession(sessionFixture('STUDENT'))
 r.configureApiClient({fetcher})
 const view=mountSfc(defineComponent({setup(){r.useWorkspaceMessages();r.useLabConnection();return()=>null}}),pinia)
 return {auth,sockets,messages:r.useWorkspaceMessageStore(pinia),instrument:r.useInstrumentStore(pinia),station:r.useStationStore(pinia),experiment:r.useExperimentStore(pinia),ui:r.useUiStore(pinia),async dispose(){view.app.unmount();await nextTick();globalThis.WebSocket=previousSocket;if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');if(previousStorage)Object.defineProperty(globalThis,'localStorage',previousStorage);else Reflect.deleteProperty(globalThis,'localStorage')}}
}
function snapshot(url:string){return Response.json(/\/(history|active)(\?|$)/.test(url)?{schema_version:'1.0',items:[],next_cursor:null}:[])}

test('hello requires a fresh scoped snapshot before controls become ready and late snapshots preserve newer events',async()=>{
 const held=deferred<Response>();let discoveries=0
 const f=await setup(async url=>{
  const path=String(url)
  if(path.endsWith('/stations')){discoveries++;return discoveries===1?Response.json([stationFixture()]):held.promise}
  if(path.includes('/queue'))return Response.json({schema_version:'1.0',station_id:'v1',busy:false,queued_count:0,own_positions:[]})
  return snapshot(path)
 })
 const hello={type:'hello',service:'netcircuit-api',protocol_version:'1.0',stream_id:'fresh-stream',sequence:0,resync_required:true,
  supported_protocol_versions:['1.0'],capabilities:{snapshot_resync:true,ordered_stream:true,replay_commands:false}}
 try{
  await until(()=>f.station.loaded&&f.sockets.length===1)
  assert.equal(f.station.canExecute,false)
  f.sockets[0]!.onopen?.({} as Event);assert.equal(f.ui.connectionState,'negotiating')
  f.sockets[0]!.onmessage?.({data:JSON.stringify(hello)} as MessageEvent)
  await until(()=>discoveries>=2)
  assert.equal(f.ui.connectionState,'reconciling');assert.equal(f.station.canExecute,false)
  f.sockets[0]!.onmessage?.({data:JSON.stringify({type:'station.updated',protocol_version:'1.0',stream_id:'fresh-stream',sequence:1,
    station:stationFixture('v1','simulation','busy')})} as MessageEvent)
  f.sockets[0]!.onmessage?.({data:JSON.stringify({type:'experiment.updated',protocol_version:'1.0',stream_id:'fresh-stream',sequence:2,
    aggregate_id:'e1',aggregate_revision:5,experiment:{...runningExperiment('CREATED'),revision:5}})} as MessageEvent)
  held.resolve(Response.json([stationFixture()]))
  await until(()=>f.ui.connectionState==='connected')
  assert.equal(f.station.eventsConnected,true);assert.equal(f.station.selected?.state??f.station.executionTarget?.state,'busy')
  assert.equal(f.experiment.experiments.find(value=>value.experiment_id==='e1')?.revision,5)
 }finally{held.resolve(Response.json([stationFixture()]));await f.dispose()}
})

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
  assert.equal(f.messages.current?.level==='error',false,JSON.stringify(f.messages.current))
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
