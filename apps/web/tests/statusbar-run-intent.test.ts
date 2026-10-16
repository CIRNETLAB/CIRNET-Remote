import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useCircuitStore } from '../src/stores/circuit'
import { useStationStore } from '../src/stores/station'
import { useExperimentStore } from '../src/stores/experiment'
import { useInstrumentStore } from '../src/stores/instrument'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useAuthStore } from '../src/stores/auth'
import { configureApiClient } from '../src/services/api/client'
import { mountSfc,loadSfc } from './helpers/vueSfc'
import { stationFixture,runningExperiment } from './helpers/station'
import { sessionFixture } from './helpers/auth'
import type { ExecutionPresentationResult } from '../src/application/ports/execution'

const Component=await loadSfc('components/workbench/SimulationStatusBar.vue')
function setup(){
  const pinia=createPinia();setActivePinia(pinia)
  const circuit=useCircuitStore(),station=useStationStore(),experiment=useExperimentStore(),instrument=useInstrumentStore(),auth=useAuthStore(),workspace=useWorkspaceStore()
  auth.acceptSession(sessionFixture('STUDENT'));circuit.importGraph({schema_version:'1.1',circuit_id:'admitted',modules:[],connections:[]})
  let resolve!:(value:ExecutionPresentationResult)=>void,reject!:(error:Error)=>void
  const preview=new Promise<ExecutionPresentationResult>((yes,no)=>{resolve=yes;reject=no})
  circuit.attachExecutionPresentation(async()=>preview);station.setStations([stationFixture('v1'),stationFixture('v2')]);station.selectStation('v1');station.setEventsConnected(true)
  const calls:{url:string;body:unknown}[]=[]
  configureApiClient({fetcher:async(url,options)=>{calls.push({url:String(url),body:options?.body?JSON.parse(String(options.body)):null});const state=String(url).endsWith('/run')?'QUEUED':'CREATED';return Response.json({...runningExperiment(state),state_history:state==='CREATED'?['CREATED']:['CREATED','QUEUED'],revision:state==='CREATED'?0:2,lease_expires_at:null})}})
  const view=mountSfc(Component,pinia),run=()=> (view.find('button','aria-label','Run').props.onClick as ()=>Promise<unknown>)()
  return {pinia,circuit,station,experiment,instrument,auth,workspace,calls,view,run,resolve:()=>resolve({device_states:{},pin_values:{},diagnostics:[]}),reject}
}

for(const change of ['principal','request scope','draft','content','target','assignment','capture configuration'] as const){
  test(`a pending physical preflight cannot submit Run after ${change} changes`,async()=>{
    const context=setup(),{circuit,station,experiment,instrument,auth,view,calls}=context
    try{
      const pending=context.run();await Promise.resolve()
      if(change==='principal'){auth.acceptSession(sessionFixture());experiment.cancelPending();experiment.$reset();circuit.resetForPrincipal();circuit.createDraft('New principal')}
      if(change==='request scope')experiment.cancelPending()
      if(change==='draft')circuit.createDraft('Different draft')
      if(change==='content')circuit.graph!.metadata={edited:true}
      if(change==='target')station.selectStation('v2')
      if(change==='assignment')experiment.assignmentId='different-assignment'
      if(change==='capture configuration')instrument.captureDurationNs++
      context.resolve();await pending;assert.deepEqual(calls,[])
    }finally{view.app.unmount();experiment.cancelPending()}
  })
}

test('a stale physical preflight failure cannot replace the current workspace error',async()=>{
  const context=setup()
  try{const pending=context.run();await Promise.resolve();context.auth.acceptSession(sessionFixture());context.workspace.editError='Current principal message';context.reject(new Error('Old private error'));await pending;assert.equal(context.workspace.editError,'Current principal message');assert.deepEqual(context.calls,[])}
  finally{context.view.app.unmount();context.experiment.cancelPending()}
})

test('repeated Run clicks cannot bypass a pending physical preflight and unchanged intent submits once',async()=>{
  const context=setup()
  try{const first=context.run();await Promise.resolve();await context.run();assert.equal(context.calls.length,0);context.resolve();assert.equal(await first,true);assert.deepEqual(context.calls.map(call=>call.url),['/api/experiments','/api/experiments/e1/run']);assert.equal((context.calls[0]!.body as {circuit_graph:{circuit_id:string}}).circuit_graph.circuit_id,'admitted')}
  finally{context.view.app.unmount();context.experiment.cancelPending()}
})

test('an unmounted status bar cannot submit its late preflight result',async()=>{
  const context=setup(),pending=context.run();await Promise.resolve();context.view.app.unmount();context.resolve();await pending
  assert.deepEqual(context.calls,[]);context.experiment.cancelPending()
})

test('Stop during a pending physical preflight cancels that Run intent while retaining the preparation latch',async()=>{
  const context=setup()
  try{
    const pending=context.run();await nextTick()
    const stop=context.view.find('button','aria-label','Stop')
    assert.equal(stop.props.disabled,false)
    await (stop.props.onClick as ()=>Promise<unknown>)();await nextTick()
    assert.equal(context.view.find('button','aria-label','Run').props.disabled,true)
    context.resolve();await pending;assert.equal(context.calls.length,0)
  }finally{context.view.app.unmount();context.resolve();context.experiment.cancelPending()}
})

test('after preflight finishes the Stop button preserves pending Create transport until its identity can be stopped',async()=>{
  const context=setup();let acknowledge!:(response:Response)=>void,signal:AbortSignal|null|undefined
  const created=new Promise<Response>(resolve=>{acknowledge=resolve}),calls:string[]=[]
  configureApiClient({fetcher:async(url,options)=>{calls.push(String(url));if(String(url)==='/api/experiments'){signal=options?.signal;return created}return Response.json({...runningExperiment('COMPLETE'),state_history:['CREATED','COMPLETE'],revision:4,lease_expires_at:null})}})
  try{
    const pending=context.run();context.resolve()
    for(let i=0;i<20&&!calls.length;i++)await new Promise(resolve=>setTimeout(resolve,0))
    await nextTick();await (context.view.find('button','aria-label','Stop').props.onClick as ()=>Promise<unknown>)()
    assert.equal(signal?.aborted,false)
    acknowledge(Response.json({...runningExperiment('CREATED'),state_history:['CREATED'],revision:0,lease_expires_at:null}));await pending
    assert.deepEqual(calls,['/api/experiments','/api/experiments/e1/stop'])
  }finally{context.view.app.unmount();context.experiment.cancelPending()}
})

test('Run submits the full immutable pre-run configuration rather than only capture fields',async()=>{
 const context=setup()
 try{context.instrument.clockDraft={enabled:true,signal:'clock.OUT',period_ns:20,cycles:2};context.instrument.testVectors=[{time_ns:10,inputs:{x:1}}]
 const pending=context.run();context.resolve();await pending
 const body=context.calls[0]!.body as {clock_config:unknown;test_vectors:unknown;capture_config:unknown}
 assert.deepEqual(body.clock_config,{signal:'clock.OUT',period_ns:20,cycles:2});assert.deepEqual(body.test_vectors,[{time_ns:10,inputs:{x:1}}]);assert.deepEqual(body.capture_config,{signals:[],duration_ns:1000000})
 }finally{context.view.app.unmount();context.experiment.cancelPending()}
})
for(const change of ['clock','generator','trigger','test vectors','restored capture','invalid numeric intent'] as const){
 test(`physical preflight cancels its captured Run intent when ${change} draft changes`,async()=>{
  const context=setup()
  try{const pending=context.run();await Promise.resolve()
   if(change==='invalid numeric intent')context.instrument.setRequestedInputError('capture.duration_ns','9007199254740993','Numeric precision would be lost.')
   if(change==='clock')context.instrument.clockDraft.period_ns++
   if(change==='generator')context.instrument.generator.frequency++
   if(change==='trigger')context.instrument.triggerDraft.signal='other'
   if(change==='test vectors')context.instrument.testVectors.push({time_ns:10,inputs:{x:1}})
   if(change==='restored capture'){const previous=context.instrument.captureDurationNs;context.instrument.captureDurationNs++;context.instrument.captureDurationNs=previous}
   context.resolve();await pending;assert.equal(context.calls.length,0)
  }finally{context.view.app.unmount();context.experiment.cancelPending()}
 })
}

test('invalid numeric form intent blocks footer Create across remount and a corrected field restores Run',async()=>{
 const context=setup();context.circuit.importGraph({schema_version:'1.0',circuit_id:'valid-form',modules:[],connections:[]})
 const Form=await loadSfc('components/windows/InstrumentConfigurationForm.vue');let form=mountSfc(Form,context.pinia)
 try{const input=form.find('input','aria-label','Capture duration (ns)');(input.props.onChange as (event:{target:{value:string}})=>void)({target:{value:'9007199254740993'}});assert.equal(await context.run(),false);assert.equal(context.calls.length,0)
 form.app.unmount();form=mountSfc(Form,context.pinia);assert.equal(form.find('input','aria-label','Capture duration (ns)').props.value,'9007199254740993');assert.equal(await context.run(),false);assert.equal(context.calls.length,0)
 ;(form.find('input','aria-label','Capture duration (ns)').props.onChange as (event:{target:{value:string}})=>void)({target:{value:'40'}});assert.equal(await context.run(),true);assert.equal(context.calls.length,2)
 }finally{form.app.unmount();context.view.app.unmount();context.experiment.cancelPending()}
})
