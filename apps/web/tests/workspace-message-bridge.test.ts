import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { effectScope,nextTick } from 'vue'
import { useWorkspaceMessages } from '../src/composables/useWorkspaceMessages'
import { useWorkspaceMessageStore } from '../src/stores/workspaceMessages'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useInstrumentStore } from '../src/stores/instrument'
import { useCircuitStore } from '../src/stores/circuit'
import { useProjectStore } from '../src/stores/projects'
import { useAuthStore } from '../src/stores/auth'
import { useUiStore } from '../src/stores/ui'
import { useExperimentStore } from '../src/stores/experiment'
import { sessionFixture } from './helpers/auth'
import { runningExperiment } from './helpers/station'

function replacementSession(id:string){const session=sessionFixture('STUDENT');return {...session,principal:{...session.principal!,principal_id:id}}}
function execution(id:string,state:ReturnType<typeof runningExperiment>['state'],revision:number,error_code:string|null=null){
 return {...runningExperiment(state),experiment_id:id,revision,error_code,lease_expires_at:['COMPLETE','FAULT'].includes(state)?null:10000}
}

function setup(){
 setActivePinia(createPinia());useAuthStore().acceptSession(sessionFixture('STUDENT'));useCircuitStore().createDraft()
 const scope=effectScope();scope.run(()=>useWorkspaceMessages())
 return {scope,messages:useWorkspaceMessageStore(),workspace:useWorkspaceStore(),instrument:useInstrumentStore(),projects:useProjectStore(),auth:useAuthStore(),circuit:useCircuitStore()}
}
test('editor and project errors follow their actual source lifecycle and cleanup removes subscriptions',async()=>{
 const f=setup()
 f.workspace.editError='Invalid edit.';await nextTick();assert.equal(f.messages.current?.text,'Invalid edit.')
 f.workspace.editError='';await nextTick();assert.equal(f.messages.current,null)
 f.projects.saveState.error='Save conflict.';await nextTick();assert.equal(useWorkspaceMessageStore().current?.text,'Save conflict.')
 f.projects.saveState.error=null;await nextTick();assert.equal(f.messages.current,null)
 f.scope.stop();f.workspace.editError='After disposal.';await nextTick();assert.equal(f.messages.current,null)
})
test('one-way console bridging deduplicates messages and cannot republish an old principal entry',async()=>{
 const f=setup()
 try{
  f.instrument.log('Private failure.','error');await nextTick();assert.equal(f.messages.current?.text,'Private failure.')
  const id=f.messages.current!.id;f.instrument.log('Private failure.','error');await nextTick();assert.equal(f.messages.current!.id,id)
  assert.equal(f.instrument.entries.length,2,'notification bridge never writes back into the console')
  f.auth.acceptSession(replacementSession('new-principal'))
  await nextTick();assert.equal(f.messages.current,null)
 }finally{f.scope.stop()}
})
test('draft-scoped file events disappear on New while active recovery failures remain session scoped',async()=>{
 const f=setup()
 try{
  f.messages.publish('file','Opened private-file.json.');f.projects.saveState.recoveryError='Browser recovery storage is unavailable.'
  await nextTick();f.circuit.createDraft();await nextTick()
  assert.equal(f.messages.current?.text,'Browser recovery storage is unavailable.')
  assert.equal(f.messages.events.some(message=>message.source==='file'),false)
 }finally{f.scope.stop()}
})

test('queued console entries retain their originating draft while session entries survive New',async()=>{
 const f=setup()
 try{
  f.instrument.log('Old draft failure.','error',{scope:'draft'})
  f.instrument.log('Session diagnostic.','info',{scope:'session'})
  f.circuit.createDraft();await nextTick()
  assert.equal(f.messages.events.some(message=>message.text==='Old draft failure.'),false)
  assert.equal(f.messages.current?.text,'Session diagnostic.')
 }finally{f.scope.stop()}
})

test('resolved execution errors never turn back into console events in the same tick',async()=>{
 const f=setup(),experiment=useExperimentStore()
 try{
  f.instrument.log('Run was denied.','error',{source:'execution',scope:'session'})
  experiment.error='Run was denied.'
  experiment.error=null
  await nextTick()
  assert.equal(f.messages.current,null)
  assert.equal(f.messages.events.length,0)
 }finally{f.scope.stop()}
})

test('a completed save cannot publish into a replacement principal scope',async()=>{
 const f=setup()
 try{
  f.projects.saveState.phase='saving';await nextTick()
  f.projects.saveState.phase='saved'
  f.auth.acceptSession(replacementSession('replacement'))
  await nextTick()
  assert.equal(f.messages.current,null)
 }finally{f.scope.stop()}
})

test('the connection hint reflects a connection established before the shell bridge mounts',async()=>{
 setActivePinia(createPinia());useAuthStore().acceptSession(sessionFixture('STUDENT'));useUiStore().connectionState='connected'
 const scope=effectScope();scope.run(()=>useWorkspaceMessages())
 try{await nextTick();assert.equal(useWorkspaceMessageStore().current?.text,'Event connection established.')}
 finally{scope.stop()}
})

test('authoritative log sources do not duplicate active hints or revive resolved failures',async()=>{
 const f=setup()
 try{
  for(const source of ['file','connection','remote-snapshot']){
   f.messages.setHint(source,'Source failure.',{level:'error',scope:'session'})
   f.instrument.log('Source failure.','error',{source,scope:'session'})
   f.messages.clearSource(source)
  }
  await nextTick()
  assert.equal(f.messages.current,null);assert.equal(f.messages.events.length,0)
  assert.equal(f.instrument.entries.length,3)
 }finally{f.scope.stop()}
})

test('owned execution FAULT records report the server error code and History action after ownership releases',()=>{
 const f=setup(),experiment=useExperimentStore()
 try{
  experiment.receive(execution('run-1','RUNNING',1))
  experiment.receive(execution('run-1','FAULT',2,'SAFETY_REJECTED'))
  assert.equal(experiment.currentExecution,null)
  assert.equal(experiment.error,null,'remote lifecycle faults do not use the command error field')
  assert.equal(f.messages.current?.level,'error')
  assert.equal(f.messages.current?.window,'history')
  assert.match(f.messages.current?.text??'',/run-1/)
  assert.match(f.messages.current?.text??'',/fault/i)
  assert.match(f.messages.current?.text??'',/SAFETY_REJECTED/)
 }finally{f.scope.stop()}
})

test('two runs in one session each announce queued running and complete without reusing old event IDs',()=>{
 const f=setup(),experiment=useExperimentStore()
 try{
  const ids:number[]=[]
  for(const id of ['run-1','run-2']){
   for(const [revision,state] of ['QUEUED','RUNNING','COMPLETE'].entries()){
    experiment.receive(execution(id,state as 'QUEUED'|'RUNNING'|'COMPLETE',revision+1))
    assert.match(f.messages.current?.text??'',new RegExp(state.toLowerCase()))
    ids.push(f.messages.current!.id)
   }
  }
  assert.equal(new Set(ids).size,6)
  assert.equal(f.messages.events.filter(message=>message.source==='execution-state').length,6)
 }finally{f.scope.stop()}
})

test('execution heartbeat revisions and historical selection do not replay lifecycle notifications',()=>{
 const f=setup(),experiment=useExperimentStore()
 try{
  experiment.receive(execution('owned','RUNNING',1));const id=f.messages.current!.id
  for(let revision=2;revision<10;revision++)experiment.receive(execution('owned','RUNNING',revision))
  experiment.receive(execution('history','FAULT',20,'HISTORICAL_FAILURE'),'history')
  experiment.selectExperiment('history')
  assert.equal(f.messages.current?.id,id)
  assert.equal(f.messages.events.filter(message=>message.source==='execution-state').length,1)
  experiment.receive(execution('owned','RUNNING',2),'event')
  assert.equal(f.messages.current?.id,id)
 }finally{f.scope.stop()}
})

test('fault detail changes announce once and a subsequent owned run resolves the previous fault presentation',()=>{
 const f=setup(),experiment=useExperimentStore()
 try{
  experiment.receive(execution('faulted','RUNNING',1))
  experiment.receive({...execution('faulted','FAULT',2,'INITIAL_FAULT'),lease_expires_at:10000})
  const faultId=f.messages.current!.id
  experiment.receive({...execution('faulted','FAULT',3,'REFINED_FAULT'),lease_expires_at:10000})
  assert.notEqual(f.messages.current?.id,faultId)
  assert.match(f.messages.current?.text??'',/REFINED_FAULT/)
  experiment.receive(execution('faulted','COMPLETE',4))
  experiment.receive(execution('next-run','QUEUED',1))
  assert.equal(f.messages.current?.level,'info')
  assert.match(f.messages.current?.text??'',/queued/i)
 }finally{f.scope.stop()}
})

test('a released fault can refine its error code without reannouncing heartbeat revisions or surviving bridge disposal',()=>{
 const f=setup(),experiment=useExperimentStore()
 try{
  experiment.receive(execution('released','RUNNING',1))
  experiment.receive(execution('released','FAULT',2,'INITIAL_FAULT'))
  const original=f.messages.current!.id
  experiment.receive(execution('released','FAULT',3,'REFINED_FAULT'))
  assert.match(f.messages.current?.text??'',/REFINED_FAULT/)
  const refined=f.messages.current!.id;assert.notEqual(refined,original)
  experiment.receive(execution('released','FAULT',4,'REFINED_FAULT'))
  assert.equal(f.messages.current?.id,refined)
  f.scope.stop()
  experiment.receive(execution('later','RUNNING',1))
  assert.equal(f.messages.current,null)
 }finally{f.scope.stop()}
})

for(const state of ['COMPLETE','FAULT'] as const)test(`history polling can authoritatively finish an owned run with ${state} while unrelated history stays silent`,()=>{
 const f=setup(),experiment=useExperimentStore()
 try{
  experiment.receive(execution('poll-owned','RUNNING',1))
  const runningId=f.messages.current!.id
  experiment.receive(execution('unrelated','FAULT',40,'UNRELATED_FAILURE'),'history')
  assert.equal(f.messages.current?.id,runningId)
  experiment.receive(execution('poll-owned',state,2,state==='FAULT'?'POLLING_FAULT':null),'history')
  assert.equal(experiment.currentExecution,null)
  assert.match(f.messages.current?.text??'',new RegExp(state.toLowerCase()))
  assert.match(f.messages.current?.text??'',/poll-owned/)
  assert.equal(f.messages.current?.level,state==='FAULT'?'error':'info')
  assert.equal(f.messages.current?.window,'history')
  if(state==='FAULT')assert.match(f.messages.current?.text??'',/POLLING_FAULT/)
  const terminalId=f.messages.current!.id
  experiment.receive(execution('unrelated','COMPLETE',41),'history')
  experiment.selectExperiment('unrelated')
  assert.equal(f.messages.current?.id,terminalId)
 }finally{f.scope.stop()}
})
