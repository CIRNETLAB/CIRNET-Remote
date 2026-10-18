import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as document from '../src/domain/document/editorDocument'
import * as commands from '../src/domain/document/graphCommands'
import {getPartForModule,getPartForType,historicalPartCatalog,physicalDescriptorForPart} from '../src/data/partCatalog'
import {solveMounting} from '../src/electrical/mounting'
import {resolveElectricalNets} from '../src/electrical/nets'
import type {CircuitGraph,CircuitModule} from '../src/types/circuit'
import legacy from '../../../contracts/design-models/fixtures/component-mechanics-legacy.json'

test('a free historical package explicitly rebuilds with a pinned current solid, stable data and one Undo',()=>{
 const graph:CircuitGraph={schema_version:'1.1',circuit_id:'free-seal',modules:[{id:'Q',type:'GENERIC_BJT',position:{x:3,y:0,z:4},rotation:37,properties:{transistorType:'NPN',extension:{keep:true}}}],connections:[],metadata:{keep:'free'}}
 const state=document.createEditorDocumentState();document.importGraph(state,'free',graph);state.past=[]
 const before=document.snapshotDocument(state),old=document.currentGraph(state)!.modules[0],preview=commands.previewComponentGeometry(state,'Q')
 assert.equal(document.snapshotDocument(state),before)
 assert.equal(state.past.length,0)
 assert.deepEqual(preview.position,old.position);assert.equal(preview.rotation,old.rotation);assert.deepEqual(preview.properties,old.properties)
 assert.equal(getPartForModule(preview)!.package.shape!.family,'to92')
 commands.rebuildComponentGeometry(state,'Q',preview)
 assert.equal(state.past.length,1);assert.equal(document.currentGraph(state)!.schema_version,'1.2')
 document.undoDocument(state);assert.equal(document.snapshotDocument(state),before)
 document.redoDocument(state);assert.deepEqual(document.currentGraph(state)!.modules[0],preview)
})

test('DIP rebuild changes body and stamped sections without changing a single contact, connection or pin identity',()=>{
 const board:CircuitModule={id:'BB',type:'BREADBOARD',position:{x:0,y:0,z:0}},type='SN74HC08N'
 const old=historicalPartCatalog.find(part=>part.editorType===type&&!part.package.shape)!
 assert.ok(old)
 const mount=solveMounting(type,{x:0,y:.309,z:0},0,[board],'U',physicalDescriptorForPart(old))!
 assert.equal(mount.valid,true,mount.reason)
 const graph:CircuitGraph={schema_version:'1.2',circuit_id:'dip-seal',modules:[board,{id:'U',type,mount:mount.mount,properties:{opaque:'keep'}}],connections:[{source:'U.1',destination:'BB.contact:terminal:A:30',metadata:{keep:true}}]}
 const state=document.createEditorDocumentState();document.importGraph(state,'dip',graph);state.past=[]
 const before=document.snapshotDocument(state),nets=resolveElectricalNets(document.currentGraph(state)!).endpointNetIds,preview=commands.previewComponentGeometry(state,'U')
 assert.deepEqual(preview.mount!.contacts,mount.mount.contacts)
 assert.equal(getPartForModule(preview)!.package.shape!.family,'dip')
 assert.equal(document.snapshotDocument(state),before)
 commands.rebuildComponentGeometry(state,'U',preview)
 assert.equal(state.past.length,1)
 assert.deepEqual(resolveElectricalNets(document.currentGraph(state)!).endpointNetIds,nets)
 assert.deepEqual(document.currentGraph(state)!.connections,graph.connections)
 document.undoDocument(state);assert.equal(document.snapshotDocument(state),before)
})

test('free rebuild rejects a moved or malformed preview atomically',()=>{
 const state=document.createEditorDocumentState();document.importGraph(state,'free',{schema_version:'1.1',circuit_id:'free',modules:[{id:'R',type:'GENERIC_RESISTOR',position:{x:0,y:0,z:0}}],connections:[]});state.past=[]
 const before=document.snapshotDocument(state),preview=commands.previewComponentGeometry(state,'R')
 assert.equal(getPartForModule(preview)!.revision,getPartForType('GENERIC_RESISTOR')!.revision)
 preview.position={...preview.position,x:(preview.position?.x??0)+1}
 assert.throws(()=>commands.rebuildComponentGeometry(state,'R',preview),/preview|position|changed/i)
 assert.equal(document.snapshotDocument(state),before);assert.equal(state.past.length,0)
})

test('reanchor keeps the selected historical package while explicit rebuild alone adopts the new compact preset',()=>{
 const state=document.createEditorDocumentState();document.importGraph(state,'legacy',structuredClone(legacy) as CircuitGraph);state.past=[]
 const before=document.currentGraph(state)!.modules.find(module=>module.id==='R')!,pin=before.mount!.contacts[1]!.pinId
 const reanchor=commands.previewComponentGeometry(state,'R',pin,'terminal:A:16')
 assert.equal(getPartForModule(reanchor)!.id,getPartForModule(before)!.id)
 assert.equal(getPartForModule(reanchor)!.revision,getPartForModule(before)!.revision)
 assert.deepEqual(getPartForModule(reanchor)!.package.bodyMm,getPartForModule(before)!.package.bodyMm)
 const rebuilt=commands.previewComponentGeometry(state,'R')
 assert.equal(getPartForModule(rebuilt)!.revision,getPartForType('GENERIC_RESISTOR')!.revision)
})
