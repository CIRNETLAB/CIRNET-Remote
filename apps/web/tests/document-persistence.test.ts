import test from 'node:test'
import assert from 'node:assert/strict'
import * as document from '../src/domain/document/editorDocument'
import { getPartForType,physicalDescriptorForPart } from '../src/data/partCatalog'
import { ProjectSaveController,type DocumentPort,type ProjectDocumentRepository } from '../src/application/projects/saveController'
import { BoundedRecoveryRepository,type RecoveryStorage } from '../src/application/projects/recovery'
import type { CircuitDocument } from '../src/types/projects'
import type { CircuitGraph } from '../src/types/circuit'

function fixture(persistent=false) {
  const state=document.createEditorDocumentState(),part=getPartForType('PUSH_BUTTON_B3F1000')!
  const graph:CircuitGraph={schema_version:'1.2',circuit_id:'authored',modules:[
    {id:'SW',type:part.editorType,position:{x:0,y:0,z:0},physicalDescriptor:physicalDescriptorForPart(part),properties:{...part.editor.defaults,pressed:persistent}},
  ],connections:[]}
  let rows:unknown[]=[],serial=0
  const storage:RecoveryStorage={read:async()=>structuredClone(rows),update:async change=>{rows=structuredClone(change(rows))}}
  const recovery=new BoundedRecoveryRepository(storage)
  const snapshot=(draft:document.CircuitDraft)=>({draftId:draft.id,name:draft.name,revision:state.draftRevisions[draft.id]??0,graph:document.authoredDocument(state,draft)!.graph})
  const documents:DocumentPort={revisioned:true,read:()=>{const current=document.currentDocument(state);return current?snapshot(current):null},
    readAll:()=>state.drafts.map(snapshot),replace:value=>document.replaceDocument(state,'local-'+(++serial),value),
    clearForPrincipal:()=>{document.releaseMomentaryInputs(state);Object.assign(state,document.createEditorDocumentState())}}
  const response=(value:{name:string;graph:CircuitGraph},revision=1):CircuitDocument=>({schema_version:'1.0',document_id:'remote',project_id:'project',owner_id:'alice',
    graph_schema_version:'1.2',revision,created_at:1,updated_at:1,...value})
  const remote:ProjectDocumentRepository={get:async()=>response({name:'Button',graph}),create:async(_project,value)=>response(value),save:async(_id,revision,value)=>response(value,revision+1)}
  const controller=new ProjectSaveController({documents,remote,recovery,recoveryDelayMs:350})
  const pressed=(value:CircuitGraph)=>value.modules[0].properties?.pressed
  return {state,documents,recovery,remote,controller,response,pressed}
}

test('hold through a recovery checkpoint and export preserves authored input after recovery reload',async()=>{
  const h=fixture();await h.controller.setPrincipal('alice');await h.controller.open('remote')
  document.setMomentaryModule(h.state,'SW',true);h.controller.documentChanged()
  await new Promise(resolve=>setTimeout(resolve,375))
  assert.equal(h.pressed(document.currentGraph(h.state)!),true)
  assert.equal(h.pressed(JSON.parse(document.exportGraph(h.state))),false)
  const id=h.state.activeId!,recovered=await h.recovery.load('alice',id)
  assert.equal(h.pressed(recovered!.graph),false)
  assert.equal(h.controller.state().dirty,false)
  assert.deepEqual(h.controller.currentSavedReference(),{document_id:'remote',revision:1})
  await h.controller.setPrincipal('bob');await h.controller.setPrincipal('alice')
  assert.equal(await h.controller.recover(id),true)
  assert.equal(h.pressed(document.currentGraph(h.state)!),false)
  assert.equal(h.controller.currentSavedReference(),null,'recovery metadata does not authorize a saved execution reference')
  h.controller.dispose()
})

test('hold, authored edit, pending Save then release persists only the authored snapshot and saved reference',async()=>{
  const h=fixture();await h.controller.setPrincipal('alice');await h.controller.open('remote')
  document.setMomentaryModule(h.state,'SW',true)
  document.renameCurrent(h.state,'Authored while held')
  h.controller.documentChanged()
  let resolve!:(value:CircuitDocument)=>void,body:{name:string;graph:CircuitGraph}|undefined
  h.remote.save=async(_id,_revision,value)=>{body=value;return new Promise(yes=>{resolve=yes})}
  const pending=h.controller.save()
  assert.equal(h.pressed(body!.graph),false);assert.equal(body!.name,'Authored while held')
  document.releaseMomentaryModule(h.state,h.state.activeId,'SW');h.controller.documentChanged()
  resolve(h.response(body!,2));assert.equal(await pending,true)
  assert.equal(h.controller.state().dirty,false)
  assert.deepEqual(h.controller.currentSavedReference(),{document_id:'remote',revision:2})
  await h.controller.checkpoint()
  assert.equal(h.pressed((await h.recovery.load('alice',h.state.activeId!))!.graph),false)
  h.controller.dispose()
})

test('imported persistent pressed=true survives hold, Save As, checkpoint and release',async()=>{
  const h=fixture(true);await h.controller.setPrincipal('alice');await h.controller.open('remote')
  document.setMomentaryModule(h.state,'SW',true);h.controller.documentChanged()
  let written:CircuitGraph|undefined
  h.remote.create=async(_id,value)=>{written=value.graph;return h.response(value)}
  assert.equal(await h.controller.saveAs('project'),true);assert.equal(h.pressed(written!),true)
  await h.controller.checkpoint();assert.equal(h.pressed((await h.recovery.load('alice',h.state.activeId!))!.graph),true)
  document.releaseMomentaryModule(h.state,h.state.activeId,'SW');h.controller.documentChanged()
  assert.equal(h.pressed(document.currentGraph(h.state)!),true);assert.equal(h.controller.state().dirty,false)
  h.controller.dispose()
})
