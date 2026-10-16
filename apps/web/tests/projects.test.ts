import { beforeEach,test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { useProjectStore } from '../src/stores/projects'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { configureApiClient } from '../src/services/api/client'
import { deferred } from './helpers/capture'
import type { Project,CircuitDocument } from '../src/contracts/generated/dto'

const project:Project={schema_version:'1.0',project_id:'p1',owner_id:'owner',name:'Project',description:'',revision:1,created_at:1,updated_at:1,access_scope:'private'}
const document=(revision=1,name='Server name'):CircuitDocument=>({schema_version:'1.0',document_id:'doc1',project_id:'p1',owner_id:'owner',name,revision,graph_schema_version:'1.0',created_at:1,updated_at:revision,
  graph:{schema_version:'1.0',circuit_id:'embedded-id',modules:[],connections:[],metadata:{extension:{retained:true}}}})
beforeEach(()=>setActivePinia(createPinia()))

test('Pinia tracking proxy action contexts share the same principal-scoped controller',async()=>{
  const store=useProjectStore();await store.setPrincipal('owner')
  const first=new Proxy(store,{}),second=new Proxy(store,{})
  assert.equal(store.controller.call(first),store.controller.call(second))
  assert.equal(store.controller.call(second).state().principalId,'owner')
  store.dispose()
})

test('a disposed workspace can establish the same principal on a fresh controller',async()=>{
  const store=useProjectStore();await store.setPrincipal('owner');store.dispose()
  await store.setPrincipal('owner')
  assert.equal(store.controller().state().principalId,'owner')
  store.dispose()
})

test('project identity change clears all prior drafts and caches synchronously while preserving one editor authority',async()=>{
  const projects=useProjectStore(),circuit=useCircuitStore()
  await projects.setPrincipal('first')
  circuit.renameCurrent('Private first draft');circuit.createDraft('Private inactive draft')
  useWorkspaceStore().placementProperties={private:'prior principal value'}
  projects.projects=[project];projects.selectedProjectId='p1'
  const changed=projects.setPrincipal('second')
  assert.equal(circuit.drafts.some(draft=>draft.name.startsWith('Private')),false)
  assert.deepEqual(circuit.past.length<=1,true);assert.deepEqual(projects.projects,[])
  assert.equal(useWorkspaceStore().placementProperties,null)
  await changed;assert.equal(projects.saveState.principalId,'second')
})

test('late project discovery cannot restore another principal private list',async()=>{
  const response=deferred<Response>();let calls=0
  configureApiClient({fetcher:async()=>{calls++;return response.promise}})
  const projects=useProjectStore();await projects.setPrincipal('first')
  const pending=projects.loadProjects();assert.equal(calls,1);await projects.setPrincipal('second')
  response.resolve(Response.json({schema_version:'1.0',items:[project],next_cursor:null}));await pending
  assert.deepEqual(projects.projects,[]);assert.equal(projects.projectsLoading,false)
})

test('save acknowledgement updates the server base without marking a newer local edit saved or adding history',async()=>{
  const response=deferred<Response>(),requests:string[]=[]
  configureApiClient({fetcher:async(url,options)=>{requests.push(String(url));return options?.method==='PUT'?response.promise:Response.json(document())}})
  const projects=useProjectStore(),circuit=useCircuitStore();await projects.setPrincipal('owner')
  assert.equal(await projects.openDocument('doc1',true),true)
  circuit.renameCurrent('Version N');const pending=projects.saveCurrent()
  circuit.renameCurrent('Version N+1');const history=circuit.past.length
  response.resolve(Response.json(document(2,'Version N')));assert.equal(await pending,true)
  assert.equal(projects.saveState.binding?.serverRevision,2);assert.equal(projects.saveState.dirty,true)
  assert.equal(circuit.current?.name,'Version N+1');assert.equal(circuit.past.length,history)
  assert.deepEqual(requests,['/api/circuits/doc1','/api/circuits/doc1'])
})

test('CAS conflicts keep local graph and metadata while exposing explicit conflict state',async()=>{
  configureApiClient({fetcher:async(_url,options)=>options?.method==='PUT'
    ?Response.json({code:'REVISION_CONFLICT',message:'Server revision changed.',current_revision:3},{status:409}):Response.json(document())})
  const projects=useProjectStore(),circuit=useCircuitStore();await projects.setPrincipal('owner');await projects.openDocument('doc1',true)
  circuit.renameCurrent('Keep this local name');const before=circuit.snapshot()
  assert.equal(await projects.saveCurrent(),false);assert.equal(projects.saveState.phase,'conflict')
  assert.equal(circuit.snapshot(),before);assert.equal(projects.saveState.dirty,true)
})

test('a principal switch during recovery cannot dispatch a prior-principal deletion',async()=>{
  let requests=0
  configureApiClient({fetcher:async()=>{requests++;return Response.json({schema_version:'1.0',project_id:'p1',deleted:true,revision:1})}})
  const projects=useProjectStore();await projects.setPrincipal('first');projects.projects=[project];projects.selectedProjectId='p1'
  const recovery=deferred<boolean>();projects.controller().checkpoint=()=>recovery.promise
  const pending=projects.deleteProject(true);await projects.setPrincipal('second');recovery.resolve(true)
  assert.equal(await pending,false);assert.equal(requests,0)
})
