import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CircuitGraph, CircuitDocument } from '../src/contracts/generated/dto'
import { ProjectSaveController, type DocumentPort, type DocumentSnapshot, type ProjectDocumentRepository } from '../src/application/projects/saveController'
import { BoundedRecoveryRepository, type RecoveryStorage } from '../src/application/projects/recovery'

const graph = (value = 0): CircuitGraph => ({schema_version:'1.0',circuit_id:'graph',modules:[],connections:[],metadata:{value}})
function deferred<T>() {let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function document(value = 0, revision = 1): CircuitDocument {
  return {schema_version:'1.0',document_id:'remote',project_id:'project',owner_id:'alice',name:'Circuit',
    graph_schema_version:'1.0',revision,created_at:1,updated_at:revision,graph:graph(value)}
}
class Documents implements DocumentPort {
  drafts:DocumentSnapshot[]=[];active:string|null=null;serial=0
  read() {return this.drafts.find(item=>item.draftId===this.active)??null}
  readAll() {return this.drafts}
  replace(value:{name:string;graph:CircuitGraph},_source:'server'|'recovery') {
    const item={draftId:'local-'+(++this.serial),name:value.name,graph:structuredClone(value.graph),revision:this.serial}
    this.drafts.push(item);this.active=item.draftId
  }
  clearForPrincipal() {this.drafts=[];this.active=null}
  edit(value:number) {const item=this.read()!;item.graph=graph(value);item.revision++}
}
class Storage implements RecoveryStorage {
  rows:unknown[]=[]
  async read() {return structuredClone(this.rows)}
  async update(change:(rows:unknown[])=>unknown[]) {this.rows=structuredClone(change(structuredClone(this.rows)))}
}
function setup(maxBindings?:number) {
  const documents=new Documents(),storage=new Storage(),recovery=new BoundedRecoveryRepository(storage)
  const calls:{revision:number;value:number}[]=[]
  const remote:ProjectDocumentRepository={get:async()=>document(),create:async(_id,body)=>({...document(),name:body.name,graph:body.graph}),
    save:async(_id,revision,body)=>{calls.push({revision,value:Number(body.graph.metadata?.value)});return {...document(Number(body.graph.metadata?.value),revision+1),name:body.name}}}
  const controller=new ProjectSaveController({documents,remote,recovery,recoveryDelayMs:0,maxBindings})
  return {controller,documents,storage,recovery,remote,calls}
}
async function opened() {const fixture=setup();await fixture.controller.setPrincipal('alice');assert.equal(await fixture.controller.open('remote'),true);return fixture}

test('save ACK for N cannot mark later edits N+1 as saved; next CAS uses the acknowledged server revision',async()=>{
  const {controller,documents,remote,calls}=await opened(),ack=deferred<CircuitDocument>()
  documents.edit(1);controller.documentChanged()
  remote.save=async(_id,revision,body)=>{calls.push({revision,value:Number(body.graph.metadata?.value)});return ack.promise}
  const saving=controller.save();documents.edit(2);controller.documentChanged()
  ack.resolve(document(1,2));assert.equal(await saving,true)
  assert.equal(controller.state().dirty,true);assert.equal(controller.state().phase,'dirty')
  assert.equal(controller.state().binding?.serverRevision,2)
  remote.save=async(_id,revision,body)=>{calls.push({revision,value:Number(body.graph.metadata?.value)});return document(2,3)}
  assert.equal(await controller.save(),true);assert.deepEqual(calls,[{revision:1,value:1},{revision:2,value:2}])
  assert.equal(controller.state().phase,'saved');controller.dispose()
})

test('explicit save requests coalesce the latest graph with no parallel writes and edits alone do not autosave',async()=>{
  const {controller,documents,remote}=await opened(),first=deferred<CircuitDocument>(),calls:number[]=[]
  let active=0,maximum=0
  remote.save=async(_id,revision,body)=>{active++;maximum=Math.max(active,maximum);calls.push(Number(body.graph.metadata?.value));
    const result=calls.length===1?await first.promise:document(Number(body.graph.metadata?.value),revision+1);active--;return result}
  documents.edit(1);controller.documentChanged();await Promise.resolve();assert.deepEqual(calls,[])
  const one=controller.save();documents.edit(2);controller.documentChanged();const two=controller.save();
  documents.edit(3);controller.documentChanged();const three=controller.save()
  first.resolve(document(1,2));assert.deepEqual(await Promise.all([one,two,three]),[true,true,true])
  assert.deepEqual(calls,[1,3]);assert.equal(maximum,1);assert.equal(controller.state().phase,'saved');controller.dispose()
})

test('conflict preserves the document, suppresses queued retries, and Save As forks without mutating the graph',async()=>{
  const {controller,documents,remote}=await opened(),ack=deferred<CircuitDocument>();let saves=0
  remote.save=async()=>{saves++;return ack.promise}
  documents.edit(7);controller.documentChanged();const one=controller.save(),two=controller.save()
  ack.reject({status:409,code:'REVISION_CONFLICT',current_revision:9})
  assert.deepEqual(await Promise.all([one,two]),[false,false]);assert.equal(saves,1)
  assert.equal(documents.read()!.graph.metadata?.value,7);assert.equal(controller.state().phase,'conflict')
  assert.equal(await controller.save(),false);assert.equal(saves,1)
  remote.create=async(project,body)=>({...document(7),document_id:'fork',project_id:project,name:body.name,graph:body.graph})
  assert.equal(await controller.saveAs('new-project'),true)
  assert.equal(controller.state().binding?.documentId,'fork');assert.equal(controller.state().phase,'saved')
  assert.equal(documents.read()!.graph.circuit_id,'graph');controller.dispose()
})

test('remote open requires explicit discard and cannot replace edits made after confirmation',async()=>{
  const {controller,documents,remote}=await opened();documents.edit(1);controller.documentChanged()
  assert.equal(await controller.open('other'),false);assert.equal(documents.read()!.graph.metadata?.value,1)
  const load=deferred<CircuitDocument>();remote.get=async()=>load.promise
  const opening=controller.open('other',{discardLocal:true});documents.edit(2);controller.documentChanged()
  load.resolve({...document(9),document_id:'other'})
  assert.equal(await opening,false);assert.equal(documents.read()!.graph.metadata?.value,2);controller.dispose()
})

test('principal switch checkpoints all old drafts and synchronously clears before storage or stale save ACK resolves',async()=>{
  const {controller,documents,remote,recovery}=await opened(),ack=deferred<CircuitDocument>()
  documents.edit(8);controller.documentChanged();remote.save=async()=>ack.promise;const saving=controller.save()
  documents.replace({name:'Inactive scratch',graph:graph(10)},'recovery');controller.documentChanged()
  const switching=controller.setPrincipal('bob')
  assert.equal(documents.read(),null);assert.deepEqual(documents.readAll(),[])
  ack.resolve(document(8,2));await switching;assert.equal(await saving,false)
  assert.equal(controller.state().principalId,'bob');assert.equal(controller.state().binding,null)
  assert.equal((await recovery.list('alice')).length,2);assert.equal((await controller.listRecovery()).length,0)
  assert.equal(await controller.recover('local-1'),false);assert.equal(documents.read(),null);controller.dispose()
})

test('same principal session rotation preserves document and save binding',async()=>{
  const {controller,documents}=await opened(),before=documents.read()
  await controller.setPrincipal('alice')
  assert.equal(documents.read(),before);assert.equal(controller.state().binding?.documentId,'remote');controller.dispose()
})

test('legacy direct mutation during save cannot receive a clean ACK even without a revision increment',async()=>{
  const {controller,documents,remote}=await opened(),ack=deferred<CircuitDocument>()
  documents.edit(1);controller.documentChanged();remote.save=async()=>ack.promise
  const saving=controller.save();documents.read()!.graph.metadata={value:99}
  ack.resolve(document(1,2));await saving
  assert.equal(controller.state().dirty,true);assert.equal(documents.read()!.graph.metadata?.value,99);controller.dispose()
})

test('switching to a different local draft unbinds the old server target instead of overwriting it',async()=>{
  const {controller,documents,calls}=await opened()
  documents.replace({name:'Imported JSON',graph:graph(11)},'recovery');controller.documentChanged()
  assert.equal(controller.state().binding,null);assert.equal(await controller.save(),false);assert.deepEqual(calls,[])
  assert.equal(documents.read()!.graph.metadata?.value,11);controller.dispose()
})

test('offline save retains local graph and durable owned recovery without automatic replay',async()=>{
  const {controller,documents,remote,recovery}=await opened();documents.edit(4);controller.documentChanged()
  remote.save=async()=>{throw new TypeError('network offline')}
  assert.equal(await controller.save(),false);assert.equal(controller.state().phase,'offline')
  assert.equal(await controller.checkpoint(),true)
  assert.equal((await recovery.load('alice',documents.read()!.draftId))?.graph.metadata?.value,4)
  assert.equal(documents.read()!.graph.metadata?.value,4);controller.dispose()
})

test('owned recovery needs explicit selection and remains dirty against its saved base revision',async()=>{
  const {controller,documents}=await opened();documents.edit(5);controller.documentChanged()
  const oldId=documents.read()!.draftId;await controller.setPrincipal('bob');await controller.setPrincipal('alice')
  assert.equal(documents.read(),null);assert.equal(await controller.recover(oldId),true)
  assert.equal(documents.read()!.graph.metadata?.value,5);assert.equal(controller.state().dirty,true)
  assert.equal(controller.state().binding?.serverRevision,1);controller.dispose()
})

test('a pending Save As creates only one server document and cannot be superseded by its stale open response',async()=>{
  const {controller,documents,remote}=await opened(),load=deferred<CircuitDocument>(),created=deferred<CircuitDocument>()
  remote.get=async()=>load.promise;let creates=0
  const opening=controller.open('other')
  remote.create=async()=>{creates++;return created.promise}
  const first=controller.saveAs('copy-project'),second=controller.saveAs('copy-project')
  load.resolve({...document(8),document_id:'other'})
  created.resolve({...document(0),document_id:'copy',project_id:'copy-project'})
  assert.equal(await opening,false);assert.equal(await first,true);assert.equal(await second,false)
  assert.equal(creates,1);assert.equal(controller.state().binding?.documentId,'copy')
  assert.equal(documents.read()!.graph.metadata?.value,0);controller.dispose()
})

test('confirmed remote deletion detaches only server metadata and preserves local graph identity',async()=>{
  const {controller,documents,calls}=await opened(),current=documents.read()
  controller.detach()
  assert.equal(documents.read(),current);assert.equal(controller.state().binding,null)
  assert.equal(controller.state().dirty,true);assert.equal(controller.state().phase,'local')
  assert.equal(await controller.save(),false);assert.deepEqual(calls,[]);controller.dispose()
})

test('recovery cleanup is confined to the current principal and never clears the active document',async()=>{
  const {controller,documents,recovery}=await opened()
  documents.edit(6);controller.documentChanged();await controller.checkpoint()
  const current=documents.read()!,id=current.draftId
  await recovery.save('bob',[{...current,graph:graph(77)}])
  assert.equal(await controller.removeRecovery(id),true)
  assert.deepEqual(await controller.listRecovery(),[])
  assert.equal((await recovery.load('bob',id))?.graph.metadata?.value,77)
  assert.equal(documents.read(),current);controller.dispose()
})

test('changing local drafts while Save is pending associates its ACK with the original draft',async()=>{
  const {controller,documents,remote}=await opened(),ack=deferred<CircuitDocument>()
  const original=documents.active
  documents.edit(2);controller.documentChanged();remote.save=async()=>ack.promise
  const pending=controller.save()
  documents.replace({name:'Other draft',graph:graph(7)},'recovery');controller.documentChanged()
  ack.resolve(document(2,2));assert.equal(await pending,true)
  assert.equal(controller.state().phase,'local');assert.equal(controller.state().binding,null)
  assert.equal(documents.readAll().length,2);assert.equal(documents.read()!.graph.metadata?.value,7)
  documents.active=original;controller.documentChanged()
  assert.equal(controller.state().binding?.serverRevision,2);assert.equal(controller.state().phase,'saved');controller.dispose()
})

test('server A to local B to A retains only A binding and checkpoints both draft scopes',async()=>{
  const {controller,documents,recovery,calls}=await opened(),original=documents.active!
  documents.replace({name:'Scratch',graph:graph(8)},'recovery');const scratch=documents.active!
  controller.documentChanged();assert.equal(controller.state().binding,null)
  assert.equal(await controller.save(),false)
  documents.active=original;controller.documentChanged()
  assert.equal(controller.state().binding?.documentId,'remote');assert.equal(controller.state().dirty,false)
  documents.edit(3);controller.documentChanged();assert.equal(await controller.save(),true)
  assert.deepEqual(calls,[{revision:1,value:3}])
  await controller.checkpoint()
  assert.equal((await recovery.load('alice',original))?.binding?.serverRevision,2)
  assert.equal((await recovery.load('alice',scratch))?.binding,undefined)
  controller.dispose()
})

test('a conflict arriving while B is active remains attached to A after switching back',async()=>{
  const {controller,documents,remote}=await opened(),original=documents.active!,ack=deferred<CircuitDocument>()
  documents.edit(1);controller.documentChanged();remote.save=async()=>ack.promise
  const pending=controller.save();documents.replace({name:'Scratch',graph:graph(9)},'recovery');controller.documentChanged()
  ack.reject({status:409,code:'REVISION_CONFLICT'});assert.equal(await pending,false)
  assert.equal(controller.state().phase,'local');assert.equal(controller.state().error,null)
  documents.active=original;controller.documentChanged()
  assert.equal(controller.state().phase,'conflict');assert.equal(controller.state().binding?.serverRevision,1)
  assert.equal(await controller.save(),false);controller.dispose()
})

test('confirmed deletion detaches inactive bindings without deleting either local document',async()=>{
  const {controller,documents}=await opened(),original=documents.active!
  documents.replace({name:'Scratch',graph:graph(8)},'recovery');controller.documentChanged()
  controller.detach({documentId:'remote'})
  documents.active=original;controller.documentChanged()
  assert.equal(controller.state().binding,null);assert.equal(documents.readAll().length,2)
  assert.equal(documents.read()!.graph.metadata?.value,0);controller.dispose()
})

test('bounded binding metadata rejects extra documents without evicting a live draft binding',async()=>{
  const {controller,documents}=setup(2);await controller.setPrincipal('alice')
  assert.equal(await controller.open('remote'),true);const first=documents.active!
  assert.equal(await controller.open('remote'),true)
  assert.equal(await controller.open('remote'),false)
  assert.match(controller.state().error??'',/limit/)
  documents.active=first;controller.documentChanged()
  assert.equal(controller.state().binding?.documentId,'remote');assert.equal(controller.state().phase,'saved')
  await controller.setPrincipal('bob');assert.equal(await controller.open('remote'),true)
  controller.dispose()
})

test('recovery retains each server draft binding independently after a principal round trip',async()=>{
  const {controller,documents,remote,recovery}=await opened(),first=documents.active!
  remote.get=async id=>({...document(7,4),document_id:id,project_id:'other-project',name:'Other server draft'})
  assert.equal(await controller.open('other'),true);const second=documents.active!
  await controller.checkpoint()
  assert.equal((await recovery.load('alice',first))?.binding?.documentId,'remote')
  assert.equal((await recovery.load('alice',second))?.binding?.documentId,'other')
  await controller.setPrincipal('bob');await controller.setPrincipal('alice')
  assert.equal(await controller.recover(first),true);const recoveredFirst=documents.active!
  assert.equal(await controller.recover(second,{discardLocal:true}),true)
  assert.equal(controller.state().binding?.documentId,'other');assert.equal(controller.state().binding?.serverRevision,4)
  documents.active=recoveredFirst;controller.documentChanged()
  assert.equal(controller.state().binding?.documentId,'remote');assert.equal(controller.state().binding?.serverRevision,1)
  assert.equal(controller.currentSavedReference(),null);controller.dispose()
})

test('stale save rejection from the previous principal cannot cancel the current principal coalesced save',async()=>{
  const {controller,documents,remote}=await opened(),old=deferred<CircuitDocument>(),current=deferred<CircuitDocument>()
  remote.save=async()=>old.promise;documents.edit(1);controller.documentChanged();const stale=controller.save()
  await controller.setPrincipal('bob');await controller.open('remote')
  const values:number[]=[]
  remote.save=async(_id,revision,body)=>{values.push(Number(body.graph.metadata?.value));return values.length===1?current.promise:document(3,revision+1)}
  documents.edit(2);controller.documentChanged();const first=controller.save()
  documents.edit(3);controller.documentChanged();const second=controller.save()
  old.reject(new TypeError('old network failure'));assert.equal(await stale,false)
  current.resolve(document(2,2));assert.deepEqual(await Promise.all([first,second]),[true,true])
  assert.deepEqual(values,[2,3]);assert.equal(controller.state().phase,'saved');controller.dispose()
})

test('Run saved reference is available only for the exact clean bound graph and name at click time',async()=>{
  const {controller,documents}=await opened()
  assert.deepEqual(controller.currentSavedReference(),{document_id:'remote',revision:1})
  const current=documents.read()!;current.graph.metadata={value:4}
  assert.equal(controller.currentSavedReference(),null,'legacy mutation without a revision bump is not a saved graph')
  current.graph.metadata={value:0};assert.deepEqual(controller.currentSavedReference(),{document_id:'remote',revision:1})
  documents.edit(5);controller.documentChanged();assert.equal(controller.currentSavedReference(),null)
  controller.detach();assert.equal(controller.currentSavedReference(),null);controller.dispose()
})

test('an unchanged graph cannot use a saved Run reference after a failed or conflicting save',async()=>{
  for(const error of [new TypeError('offline'),{status:409,code:'REVISION_CONFLICT'}]) {
    const {controller,remote}=await opened()
    remote.save=async()=>{throw error}
    assert.equal(await controller.save(),false)
    assert.equal(controller.state().dirty,true)
    assert.equal(controller.currentSavedReference(),null)
    controller.dispose()
  }
})

function reverseObjectKeys(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(reverseObjectKeys)
  if(value!==null&&typeof value==='object') return Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverseObjectKeys(item)]))
  return value
}

test('server ACK and Open object-key ordering cannot change saved state or the exact saved Run reference',async()=>{
  const {controller,documents,remote}=await opened()
  const rich:CircuitGraph={schema_version:'1.1',circuit_id:'preserve-identity',modules:[
    {id:'P',type:'CUSTOM',position:{x:1,y:1.25,z:0},properties:{nested:{z:3,a:1},unknown:[{second:2,first:1},0,false,null]}}],
    connections:[],metadata:{unicode:'mạch',value:9007199254740991,negativeZero:0,extension:{b:2,a:1}}}
  documents.read()!.graph=rich;documents.read()!.revision++;controller.documentChanged()
  remote.save=async(_id,revision,body)=>({...document(0,revision+1),name:body.name,
    graph:reverseObjectKeys(body.graph) as CircuitGraph,graph_schema_version:'1.1'})
  assert.equal(await controller.save(),true)
  assert.equal(controller.state().phase,'saved');assert.equal(controller.state().dirty,false)
  assert.deepEqual(controller.currentSavedReference(),{document_id:'remote',revision:2})
  assert.deepEqual(documents.read()!.graph,rich,'ACK must not rewrite canonical graph, unknown metadata, numbers or arrays')
  const originalReplace=documents.replace.bind(documents)
  documents.replace=(value,source)=>originalReplace({...value,graph:reverseObjectKeys(value.graph) as CircuitGraph},source)
  remote.get=async()=>({...document(0,3),graph:rich,graph_schema_version:'1.1'})
  assert.equal(await controller.open('remote'),true)
  assert.equal(controller.state().phase,'saved');assert.equal(controller.state().dirty,false)
  assert.deepEqual(controller.currentSavedReference(),{document_id:'remote',revision:3})
  documents.read()!.graph.modules[0].properties!.unknown=[null,false,0,{second:2,first:1}]
  assert.equal(controller.currentSavedReference(),null,'array order remains semantic and cannot be sorted away')
  controller.dispose()
})
