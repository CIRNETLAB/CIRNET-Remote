import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildPasteCandidate,buildDeleteCandidate,buildMoveSelectionCandidate} from '../src/editor/batchCommands'
import {captureSelectionClipboard} from '../src/editor/selectionClipboard'
import {solveFlexibleMount,isFlexibleMount} from '../src/electrical/flexibleGeometry'
import type {CircuitGraph} from '../src/types/circuit'
function fixture():CircuitGraph{const board={id:'BB',type:'BREADBOARD'},mount=solveFlexibleMount('GENERIC_RESISTOR','BB','terminal:A:10','terminal:A:14',[board]).mount!;return{schema_version:'1.2',circuit_id:'flex-batch',modules:[board,{id:'R',type:'GENERIC_RESISTOR',mount}],connections:[]}}
test('batch copy keeps flexible pose/controls and transforms exact contacts without changing original',()=>{
 const graph=fixture(),snapshot=captureSelectionClipboard(graph,{moduleIds:['R'],wires:[]})!,copy=buildPasteCandidate(graph,snapshot,{step:10}).graph.modules.at(-1)!
 assert.ok(isFlexibleMount(copy.mount));assert.deepEqual(copy.mount.contacts.map(c=>c.contactId),['terminal:A:20','terminal:A:24']);assert.equal(graph.modules.length,2)
 const original=graph.modules[1].mount!;if(!isFlexibleMount(original))throw Error('fixture');assert.equal(copy.mount.bodyPose.position.y,original.bodyPose.position.y);assert.equal(copy.mount.leads[0].controlPoints.length,original.leads[0].controlPoints.length)
})
test('board batch delete removes its flexible assemblies and related edges together',()=>{const graph=fixture();graph.connections=[{source:'R.A',destination:'BB.contact:terminal:A:10'}];const next=buildDeleteCandidate(graph,{moduleIds:['BB'],wires:[]});assert.deepEqual(next.modules,[]);assert.deepEqual(next.connections,[])})
test('selection move keeps flexible assembly and exact pin order',()=>{const graph=fixture(),moved=buildMoveSelectionCandidate(graph,{moduleIds:['R'],wires:[]},{x:.13,y:0,z:0}).graph.modules.find(m=>m.id==='R')!;assert.deepEqual(moved.mount!.contacts.map(c=>c.contactId),['terminal:A:11','terminal:A:15']);assert.equal(moved.mount!.kind,'breadboard-flexible')})
