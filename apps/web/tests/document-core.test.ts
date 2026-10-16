import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as document from '../src/domain/document/editorDocument'
import * as commands from '../src/domain/document/graphCommands'

test('framework-free commands operate on the caller graph with atomic history and stable identities',()=>{
  const state=document.createEditorDocumentState();document.createDraft(state,'caller-owned','Circuit');state.past=[]
  const first=commands.placeModule(state,'DIGITAL_SWITCH',{x:0,y:0,z:0}),second=commands.placeModule(state,'LED',{x:2,y:0,z:0})
  commands.connectPorts(state,first+'.OUT',second+'.IN')
  const before=document.snapshotDocument(state),revision=state.documentRevision
  assert.equal(document.currentGraph(state),state.drafts[0]!.graph)
  commands.moveModule(state,first,{x:1,y:0,z:0});assert.equal(state.documentRevision,revision+1)
  document.undoDocument(state);assert.equal(document.snapshotDocument(state),before)
  document.redoDocument(state);assert.equal(document.currentGraph(state)!.modules[0]!.id,first)
  const unchanged=document.snapshotDocument(state),history=state.past.length
  assert.throws(()=>commands.connectPorts(state,first+'.OUT',first+'.OUT'))
  assert.equal(document.snapshotDocument(state),unchanged);assert.equal(state.past.length,history)
})

test('pure serialization retains opaque metadata and memory while explicit restore reconciles save markers',()=>{
  const state=document.createEditorDocumentState()
  document.importGraph(state,'imported',{schema_version:'1.0',circuit_id:'embedded',modules:[{id:'M',type:'MEMORY',properties:{memory:{version:'1.0',word_bits:8,depth:2,data:[1,255]}}}],connections:[],metadata:{name:'Imported',extension:{values:['x',3]}}})
  assert.equal(document.isDocumentDirty(state),false)
  const graph=document.currentGraph(state)!
  commands.setMemoryImage(state,'M',{version:'1.0',word_bits:8,depth:2,data:[2,254]})
  assert.equal(document.isDocumentDirty(state),true);document.undoDocument(state)
  assert.equal(document.isDocumentDirty(state),false)
  const exported=JSON.parse(document.exportGraph(state))
  assert.deepEqual(exported,graph);assert.equal(exported.circuit_id,'embedded')
  assert.ok(state.past.length+state.future.length<=50)
})
