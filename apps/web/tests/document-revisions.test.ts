import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { useCircuitStore } from '../src/stores/circuit'
import { useProjectStore } from '../src/stores/projects'
import { configureApiClient } from '../src/services/api/client'
import { effectScope,nextTick } from 'vue'
import { deferred } from './helpers/capture'
import type { ExecutionPresentationResult } from '../src/application/ports/execution'
import { loadSfc,mountSfc } from './helpers/vueSfc'

test('document getters use content generations without serializing the live document',()=>{
  setActivePinia(createPinia());const store=useCircuitStore();store.createDraft();store.markSaved()
  const original=JSON.stringify;let serializations=0
  JSON.stringify=((...args:Parameters<typeof JSON.stringify>)=>{serializations++;return original(...args)}) as typeof JSON.stringify
  try {for(let i=0;i<20;i++){assert.equal(store.dirty,false);assert.equal(store.validation,null);assert.equal(store.physicalStates,null)}}finally{JSON.stringify=original}
  assert.equal(serializations,0)
})

test('legacy nested graph edits invalidate revisions synchronously while unrelated application changes do not',async()=>{
  setActivePinia(createPinia());const store=useCircuitStore();store.createDraft();store.graph!.metadata={nested:{value:1}}
  store.markSaved();const before=store.documentRevision
  ;(store.graph!.metadata!.nested as {value:number}).value=2
  assert.ok(store.documentRevision>before);assert.equal(store.dirty,true)
  const revision=store.documentRevision;store.validating=true;store.physicalPreviewBusy=true
  await nextTick();assert.equal(store.documentRevision,revision)
})

test('project dirty reconciliation avoids graph serialization on revisioned editor events',async()=>{
  setActivePinia(createPinia());const projects=useProjectStore(),store=useCircuitStore();await projects.setPrincipal('owner')
  configureApiClient({fetcher:async()=>Response.json({schema_version:'1.0',document_id:'d1',project_id:'p1',owner_id:'owner',name:'Saved',graph:{schema_version:'1.0',circuit_id:'inner',modules:[],connections:[]},graph_schema_version:'1.0',revision:1,created_at:1,updated_at:1})})
  await projects.openDocument('d1',true)
  const original=JSON.stringify;let serializations=0
  JSON.stringify=((...args:Parameters<typeof JSON.stringify>)=>{serializations++;return original(...args)}) as typeof JSON.stringify
  try{for(let i=0;i<10;i++){projects.controller().documentChanged();projects.controller().state()}}finally{JSON.stringify=original;projects.dispose()}
  assert.equal(serializations,0)
})

test('logical commands emit one generation and obsolete graph objects cannot invalidate their replacement',()=>{
  setActivePinia(createPinia());const store=useCircuitStore();store.createDraft()
  const before=store.documentRevision;store.placeModule('DIGITAL_SWITCH',{x:0,y:0,z:0})
  assert.equal(store.documentRevision,before+1)
  const old=store.graph!;store.commitGraph({...old,metadata:{fresh:true}})
  const revision=store.documentRevision;old.metadata={obsolete:true}
  assert.equal(store.documentRevision,revision);assert.deepEqual(store.graph!.metadata,{fresh:true})
})

test('repeated nested aliases and inactive drafts retain their own revision ownership',async()=>{
  setActivePinia(createPinia());const store=useCircuitStore();store.createDraft('Inactive')
  const shared={value:1};store.graph!.metadata={first:shared,second:shared};const inactive=store.current!,before=store.documentRevision
  ;(store.graph!.metadata!.first as typeof shared).value=2
  assert.equal(store.documentRevision,before+1)
  assert.equal((store.graph!.metadata!.second as typeof shared).value,2)
  store.createDraft('Active');store.markSaved();const activeRevision=store.graphRevision
  ;(inactive.graph.metadata!.first as typeof shared).value=3
  await nextTick();assert.equal(store.graphRevision,activeRevision);assert.equal(store.dirty,false)
  Object.freeze(store.graph!.metadata={frozen:Object.freeze({value:1})})
  assert.equal((store.graph!.metadata.frozen as typeof shared).value,1)
})

test('name edits preserve graph evidence while direct nested content edits abort and invalidate pending evidence',async()=>{
  setActivePinia(createPinia());const store=useCircuitStore();store.createDraft();store.graph!.metadata={value:1}
  configureApiClient({fetcher:async()=>Response.json({valid:true,code:'VALID',message:'Valid graph'})})
  store.attachExecutionPresentation(async()=>({device_states:{LED:{state:'ON'}},pin_values:{},diagnostics:[]}))
  await store.validateCurrent();await store.evaluatePhysical();assert.ok(store.validation);assert.equal(store.physicalStates?.LED?.state,'ON')
  const revision=store.graphRevision;store.renameCurrent('Renamed');assert.equal(store.graphRevision,revision);assert.ok(store.validation);assert.equal(store.physicalStates?.LED?.state,'ON')
  const preview=deferred<ExecutionPresentationResult>();let signal:AbortSignal|undefined
  store.attachExecutionPresentation(async(_graph,currentSignal)=>{signal=currentSignal;return preview.promise})
  const pending=store.evaluatePhysical();store.graph!.metadata!.value=2
  assert.equal(signal?.aborted,true);assert.equal(store.validation,null);assert.equal(store.physicalStates,null)
  preview.resolve({device_states:{LED:{state:'OFF'}},pin_values:{},diagnostics:[]});await pending
  assert.equal(store.physicalStates,null);assert.equal(store.physicalPreviewBusy,false)
})

test('switching drafts preserves saved content generations while advancing navigation generation',()=>{
  setActivePinia(createPinia());const store=useCircuitStore(),first=store.createDraft();store.markSaved()
  const content=store.draftRevisions[first];store.createDraft();const navigation=store.documentRevision
  store.openDraft(first)
  assert.ok(store.documentRevision>navigation);assert.equal(store.draftRevisions[first],content);assert.equal(store.dirty,false)
  store.createDraft();store.activeId=first
  assert.equal(store.draftRevisions[first],content);assert.equal(store.dirty,false)
})

test('document observation belongs to the store lifecycle rather than its first consuming component',()=>{
  setActivePinia(createPinia());const component=effectScope();let store!:ReturnType<typeof useCircuitStore>
  component.run(()=>{store=useCircuitStore();store.createDraft();store.graph!.metadata={value:1}})
  component.stop();const revision=store.documentRevision;store.graph!.metadata!.value=2
  assert.ok(store.documentRevision>revision)
  store.$dispose()
})

test('replacing the presentation port aborts its old request and cannot publish an obsolete adapter reply',async()=>{
  setActivePinia(createPinia());const store=useCircuitStore();store.createDraft();const old=deferred<ExecutionPresentationResult>();let signal:AbortSignal|undefined
  store.attachExecutionPresentation(async(_graph,currentSignal)=>{signal=currentSignal;return old.promise})
  const pending=store.evaluatePhysical()
  store.attachExecutionPresentation(async()=>({device_states:{LED:{state:'NEW'}},pin_values:{},diagnostics:[]}))
  assert.equal(signal?.aborted,true);assert.equal(store.physicalPreviewBusy,false)
  await store.evaluatePhysical();old.resolve({device_states:{LED:{state:'OLD'}},pin_values:{},diagnostics:[]});await pending
  assert.equal(store.physicalStates?.LED?.state,'NEW')
})

test('project change events survive the disposal of the first temporary consuming scope',async()=>{
  setActivePinia(createPinia());const temporary=effectScope();let projects!:ReturnType<typeof useProjectStore>
  await temporary.run(async()=>{projects=useProjectStore();await projects.setPrincipal('owner')})
  configureApiClient({fetcher:async()=>Response.json({schema_version:'1.0',document_id:'d1',project_id:'p1',owner_id:'owner',name:'Saved',graph:{schema_version:'1.0',circuit_id:'inner',modules:[],connections:[]},graph_schema_version:'1.0',revision:1,created_at:1,updated_at:1})})
  temporary.stop();await projects.openDocument('d1',true);useCircuitStore().renameCurrent('Changed after scope disposal');await nextTick()
  assert.equal(projects.saveState.dirty,true);projects.dispose()
})

test('legacy removal of the active draft detaches its server binding through a content event',async()=>{
  setActivePinia(createPinia());const projects=useProjectStore();await projects.setPrincipal('owner')
  configureApiClient({fetcher:async()=>Response.json({schema_version:'1.0',document_id:'d1',project_id:'p1',owner_id:'owner',name:'Saved',graph:{schema_version:'1.0',circuit_id:'inner',modules:[],connections:[]},graph_schema_version:'1.0',revision:1,created_at:1,updated_at:1})})
  await projects.openDocument('d1',true);const store=useCircuitStore();store.drafts.splice(store.drafts.findIndex(draft=>draft.id===store.activeId),1);await nextTick()
  assert.equal(projects.saveState.binding,null);projects.dispose()
})

test('independently compiled consumers share one observer without changing the document during render',async()=>{
  const pinia=createPinia();setActivePinia(pinia);const store=useCircuitStore();store.createDraft();store.markSaved()
  const before=JSON.stringify(store.$state)
  const view=mountSfc(await loadSfc('components/windows/SignalMonitorWindow.vue'),pinia)
  try{assert.equal(JSON.stringify(store.$state),before);const revision=store.documentRevision;store.placeModule('DIGITAL_SWITCH',{x:0,y:0,z:0});assert.equal(store.documentRevision,revision+1)}
  finally{view.app.unmount()}
})

test('separate Pinia owners retain independent document observers and save markers',()=>{
  const first=useCircuitStore(createPinia()),second=useCircuitStore(createPinia())
  first.createDraft();second.createDraft();first.markSaved();second.markSaved()
  const untouched=second.documentRevision;first.placeModule('DIGITAL_SWITCH',{x:0,y:0,z:0})
  assert.equal(first.dirty,true);assert.equal(second.documentRevision,untouched);assert.equal(second.dirty,false);assert.equal(second.graph!.modules.length,0)
  first.$dispose();second.$dispose()
})
