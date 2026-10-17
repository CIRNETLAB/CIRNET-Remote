import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as document from '../src/domain/document/editorDocument'
import * as commands from '../src/domain/document/graphCommands'
import {solveFlexibleMount} from '../src/electrical/flexibleGeometry'
import {getBreadboardContact,getBreadboardTopology} from '../src/electrical/BreadboardTopology'
import {moduleLocalToWorld,moduleWorldPose} from '../src/electrical/modulePose'
import {solveMounting} from '../src/electrical/mounting'
import {buildFlexibleTransformCandidate} from '../src/electrical/flexibleTransforms'
import {parseCircuitFile} from '../src/domain/document/circuitFile'
import {withCircuitModules} from '../src/domain/document/graphVersion'
import {resolveElectricalNets} from '../src/electrical/nets'
import type {CircuitModule} from '../src/types/circuit'

const board={id:'BB',type:'BREADBOARD',position:{x:0,y:0,z:0}} satisfies CircuitModule
function setup(){const state=document.createEditorDocumentState();document.importGraph(state,'local',{schema_version:'1.1',circuit_id:'stable',modules:[board],connections:[],metadata:{extension:{retain:true}}});state.past=[];return state}
function mount(type='RESISTOR_AXIAL',first='terminal:A:10',second='terminal:A:14',modules:CircuitModule[]=[board],activeId?:string){const result=solveFlexibleMount(type,'BB',first,second,modules,{activeId});assert.equal(result.valid,true,result.reason);return result.mount!}

test('two-anchor placement enters1.2 atomically and undo restores the exact legacy document',()=>{
 const state=setup(),before=document.snapshotDocument(state)
 const id=commands.placeFlexibleModule(state,'RESISTOR_AXIAL',mount())
 assert.equal(document.currentGraph(state)!.schema_version,'1.2');assert.equal(state.past.length,1)
 assert.equal(document.currentGraph(state)!.modules[1].id,id)
 assert.equal(document.currentGraph(state)!.modules[1].position,undefined)
 document.undoDocument(state);assert.equal(document.snapshotDocument(state),before)
 document.redoDocument(state);assert.equal(document.currentGraph(state)!.modules[1].id,id)
 assert.equal(JSON.parse(document.exportGraph(state)).schema_version,'1.2')
})

test('reanchor keeps the untouched pin and malformed updates leave graph/history unchanged',()=>{
 const state=setup(),id=commands.placeFlexibleModule(state,'RESISTOR_AXIAL',mount()),graph=document.currentGraph(state)!
 const next=mount('RESISTOR_AXIAL','terminal:A:10','terminal:A:16',graph.modules,id)
 commands.updateFlexibleMount(state,id,next)
 const current=document.currentGraph(state)!.modules.find(m=>m.id===id)!
 assert.deepEqual(current.mount!.contacts[0],graph.modules[1].mount!.contacts[0]);assert.equal(state.past.length,2)
 const before=document.snapshotDocument(state),history=state.past.length,bad=structuredClone(next);bad.contacts[1].contactId='terminal:A:99'
 assert.throws(()=>commands.updateFlexibleMount(state,id,bad))
 assert.equal(document.snapshotDocument(state),before);assert.equal(state.past.length,history)
})

test('a changed component design remaps only its own stable pin endpoints atomically',()=>{
 const state=setup(),id=commands.placeFlexibleModule(state,'GENERIC_CAPACITOR',mount('GENERIC_CAPACITOR'))
 const graph=document.currentGraph(state)!
 document.commitGraph(state,{...graph,connections:[{source:id+'.A',destination:'BB.contact:terminal:B:01',metadata:{opaque:true}}]})
 const before=document.snapshotDocument(state),history=state.past.length
 assert.throws(()=>commands.changeComponentDesign(state,id,'GENERIC_CAPACITOR_ELECTROLYTIC',{capacitorType:'ELECTROLYTIC'}))
 assert.equal(document.snapshotDocument(state),before)
 commands.changeComponentDesign(state,id,'GENERIC_CAPACITOR_ELECTROLYTIC',{capacitorType:'ELECTROLYTIC'},{A:'PLUS',B:'MINUS'})
 const changed=document.currentGraph(state)!,part=changed.modules.find(m=>m.id===id)!
 assert.equal(part.type,'GENERIC_CAPACITOR_ELECTROLYTIC');assert.equal(part.id,id)
 assert.deepEqual(part.mount!.contacts.map(p=>[p.pinId,p.contactId]),[['PLUS','terminal:A:10'],['MINUS','terminal:A:14']])
 assert.equal(changed.connections[0].source,id+'.PLUS');assert.equal(changed.connections[0].metadata?.opaque,true)
 assert.equal(state.past.length,history+1);document.undoDocument(state);assert.equal(document.snapshotDocument(state),before)
})

test('whole-assembly moves preserve board-local body and every control while rebinding exact holes',()=>{
 const state=setup(),id=commands.placeFlexibleModule(state,'RESISTOR_AXIAL',mount()),before=document.currentGraph(state)!,old=before.modules[1].mount!
 assert.equal(old.kind,'breadboard-flexible');if(old.kind!=='breadboard-flexible')throw Error('fixture')
 const pitch=getBreadboardTopology('BREADBOARD')!.pitch,world=moduleWorldPose(before.modules[1],before.modules).position!
 commands.moveModule(state,id,{x:world.x!+2*pitch,y:world.y!,z:world.z!})
 const next=document.currentGraph(state)!.modules[1].mount!;assert.equal(next.kind,'breadboard-flexible');if(next.kind!=='breadboard-flexible')throw Error('fixture')
 assert.deepEqual(next.contacts.map(p=>[p.pinId,p.contactId]),[['A','terminal:A:12'],['B','terminal:A:16']])
 const close=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`)
 close(next.bodyPose.position.x,old.bodyPose.position.x+2*pitch);close(next.bodyPose.position.y,old.bodyPose.position.y)
 for(const [i,lead] of next.leads.entries())for(const [j,p]of lead.controlPoints.entries()){
  close(p.x,old.leads[i].controlPoints[j].x+2*pitch);close(p.y,old.leads[i].controlPoints[j].y);close(p.z,old.leads[i].controlPoints[j].z)
 }
 const saved=document.snapshotDocument(state),count=state.past.length,at=moduleWorldPose(document.currentGraph(state)!.modules[1],document.currentGraph(state)!.modules).position!
 assert.throws(()=>commands.moveModule(state,id,{x:at.x!+pitch/2,y:at.y!,z:at.z!}),/exact.*hole/i)
 assert.equal(document.snapshotDocument(state),saved);assert.equal(state.past.length,count)
})

test('pure rotated-board preview and180-degree commit keep stable pins and shape without document mutation',()=>{
 const state=setup(),support={...board,position:{x:3,y:.4,z:-2},rotation:37}
 document.commitGraph(state,withCircuitModules(document.currentGraph(state)!,[support]));state.past=[]
 const id=commands.placeFlexibleModule(state,'RESISTOR_AXIAL',mount('RESISTOR_AXIAL','terminal:A:10','terminal:A:14',[support])),graph=document.currentGraph(state)!,original=document.snapshotDocument(state)
 const old=graph.modules[1].mount!;if(old.kind!=='breadboard-flexible')throw Error('fixture')
 const pitch=getBreadboardTopology('BREADBOARD')!.pitch,target=moduleLocalToWorld({...old.bodyPose.position,x:old.bodyPose.position.x+pitch},support)
 const preview=buildFlexibleTransformCandidate(graph,id,target)
 assert.equal(document.snapshotDocument(state),original);assert.deepEqual(preview.mount!.contacts.map(p=>p.contactId),['terminal:A:11','terminal:A:15'])
 commands.rotateModule(state,id,180)
 const rotated=document.currentGraph(state)!.modules[1].mount!;if(rotated.kind!=='breadboard-flexible')throw Error('fixture')
 assert.deepEqual(rotated.contacts.map(p=>[p.pinId,p.contactId]),[['A','terminal:A:14'],['B','terminal:A:10']])
 assert.equal(rotated.bodyPose.rotation.x,old.bodyPose.rotation.x);assert.equal(rotated.bodyPose.rotation.z,old.bodyPose.rotation.z)
 assert.equal(rotated.bodyPose.rotation.y,(old.bodyPose.rotation.y+180)%360)
 document.undoDocument(state);assert.equal(document.snapshotDocument(state),original)
})

test('body lift preserves contacts, connections and nets; invalid body edits are atomic',()=>{
 const state=setup(),id=commands.placeFlexibleModule(state,'RESISTOR_AXIAL',mount()),graph=document.currentGraph(state)!,old=graph.modules[1].mount!
 if(old.kind!=='breadboard-flexible')throw Error('fixture')
 const nets=resolveElectricalNets(graph).endpointNetIds,pose=structuredClone(old.bodyPose);pose.position.y+=.025
 const solution=solveFlexibleMount('RESISTOR_AXIAL','BB',old.contacts[0].contactId,old.contacts[1].contactId,graph.modules,{bodyPose:pose,activeId:id})
 assert.equal(solution.valid,true,solution.reason);commands.updateFlexibleMount(state,id,solution.mount!)
 const updated=document.currentGraph(state)!
 assert.deepEqual(updated.modules[1].mount!.contacts,old.contacts);assert.deepEqual(updated.connections,graph.connections);assert.deepEqual(resolveElectricalNets(updated).endpointNetIds,nets)
 const saved=document.snapshotDocument(state),count=state.past.length,bad=structuredClone(solution.mount!);bad.bodyPose.position.y=99
 assert.throws(()=>commands.updateFlexibleMount(state,id,bad));assert.equal(document.snapshotDocument(state),saved);assert.equal(state.past.length,count)
})

test('legacy lead settings remain1.1 until explicit conversion retains IDs, properties and bonds',()=>{
 const state=setup(),a=getBreadboardContact('BREADBOARD','terminal:A:10')!,b=getBreadboardContact('BREADBOARD','terminal:A:14')!
 const center={x:(a.localPosition[0]+b.localPosition[0])/2,y:a.localPosition[1],z:a.localPosition[2]},rigid=solveMounting('RESISTOR_AXIAL',center,0,[board],'R')!
 assert.equal(rigid.valid,true,rigid.reason)
 const graph=parseCircuitFile(JSON.stringify({...document.currentGraph(state),modules:[board,{id:'R',type:'RESISTOR_AXIAL',mount:rigid.mount,properties:{resistance:2200,power:.25,leadForm:'offset-s',leadLengthMm:1,bodyLiftMm:2,extension:{retain:true}}}],connections:[{source:'R.A',destination:'BB.contact:terminal:B:10'}]}))
 document.importGraph(state,'legacy',graph);state.past=[]
 const before=document.snapshotDocument(state),nets=resolveElectricalNets(graph).endpointNetIds
 assert.equal(JSON.parse(document.exportGraph(state)).schema_version,'1.1')
 commands.convertModuleToFlexible(state,'R')
 const converted=document.currentGraph(state)!,part=converted.modules.find(m=>m.id==='R')!
 assert.equal(converted.schema_version,'1.2');assert.equal(part.mount?.kind,'breadboard-flexible');assert.deepEqual(part.mount!.contacts,rigid.mount.contacts)
 assert.deepEqual(part.properties,graph.modules[1].properties);assert.deepEqual(converted.connections,graph.connections);assert.deepEqual(resolveElectricalNets(converted).endpointNetIds,nets)
 const exported=parseCircuitFile(document.exportGraph(state));assert.deepEqual(exported.modules,converted.modules);assert.deepEqual(exported.connections,converted.connections);assert.deepEqual(exported.metadata?.extension,converted.metadata?.extension)
 assert.equal(state.past.length,1);assert.throws(()=>commands.detachModule(state,'R'),/belong.*breadboard/i);assert.equal(state.past.length,1)
 document.undoDocument(state);assert.equal(document.snapshotDocument(state),before)
})
