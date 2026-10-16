import { beforeEach,test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { useCircuitStore,configureExecutionPresentationAdapter } from '../src/stores/circuit'
import { deferred } from './helpers/capture'
import type { ExecutionPresentationResult } from '../src/services/execution/presentation'

beforeEach(()=>setActivePinia(createPinia()))

test('document edit generations advance after content, identity, rename and history changes',()=>{
  const store=useCircuitStore()
  const revisions:number[]=[]
  store.createDraft('First');revisions.push(store.documentRevision)
  store.renameCurrent('Renamed');revisions.push(store.documentRevision)
  const second=store.createDraft('Second');revisions.push(store.documentRevision)
  store.undo();revisions.push(store.documentRevision)
  store.redo();revisions.push(store.documentRevision)
  store.openDraft(store.drafts.find(draft=>draft.id!==second)!.id);revisions.push(store.documentRevision)
  assert.ok(revisions.every((revision,index)=>Number.isSafeInteger(revision)&&revision>(revisions[index-1]??-1)))
  assert.ok(store.drafts.every(draft=>Number.isSafeInteger(store.draftRevisions[draft.id])))
})

test('principal reset clears every draft, history and private projection and invalidates late preview results',async()=>{
  const preview=deferred<ExecutionPresentationResult>()
  configureExecutionPresentationAdapter(async()=>preview.promise)
  const store=useCircuitStore(),graph={schema_version:'1.0' as const,circuit_id:'private-graph',modules:[],connections:[]}
  try {
    store.importGraph(graph);store.renameCurrent('Private name');const before=store.documentRevision
    const pending=store.evaluatePhysical()
    assert.equal(typeof store.resetForPrincipal,'function')
    store.resetForPrincipal()
    assert.deepEqual(store.drafts,[]);assert.deepEqual(store.past,[]);assert.deepEqual(store.future,[]);assert.deepEqual(store.saved,{})
    assert.equal(store.graph,null);assert.equal(store.physicalPreview,null);assert.ok(store.documentRevision>before)
    store.importGraph(graph)
    preview.resolve({device_states:{private:{state:'ON'}},pin_values:{private:1},diagnostics:[]});await pending
    assert.equal(store.physicalStates,null)
  } finally {configureExecutionPresentationAdapter()}
})

test('server and recovery replacement use canonical graph validation and one existing draft authority',()=>{
  const store=useCircuitStore()
  assert.equal(typeof store.replaceDocument,'function')
  store.replaceDocument({name:'Server title',graph:{schema_version:'1.0',circuit_id:'embedded-id',modules:[],connections:[],metadata:{custom:{keep:true}}}})
  assert.equal(store.current?.name,'Server title');assert.equal(store.graph?.circuit_id,'embedded-id')
  assert.deepEqual(store.graph?.metadata,{custom:{keep:true}})
  const before=store.snapshot()
  assert.throws(()=>store.replaceDocument({name:'Invalid',graph:{schema_version:'1.0',circuit_id:'bad',modules:[{id:'duplicate',type:'LED'},{id:'duplicate',type:'LED'}],connections:[]}}))
  assert.equal(store.snapshot(),before)
})
