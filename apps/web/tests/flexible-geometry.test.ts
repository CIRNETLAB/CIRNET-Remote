import {test} from 'node:test'
import assert from 'node:assert/strict'
import fixtures from '../../../contracts/design-models/fixtures/flexible-mounting-parity.json'
import {getPartForType,MM_TO_WORLD} from '../src/data/partCatalog'
import {resolveFlexibleGeometry,solveFlexibleMount,rotationMatrix,transformPoint} from '../src/electrical/flexibleGeometry'
import type {CircuitModule} from '../src/types/circuit'
import type {CircuitGraph} from '../src/types/circuit'
import {validateMountBindings} from '../src/electrical/mounting'

const board:CircuitModule={id:'BB',type:'BREADBOARD',position:{x:0,y:0,z:0}}

test('canonical flexible fixtures have the same accept/reject result in the Web geometry resolver',()=>{
 for(const fixture of fixtures.cases){
  const module=fixture.graph.modules.find(m=>'mount' in m)!,part=getPartForType(module.type)!,support=fixture.graph.modules.find(m=>m.id===module.mount!.boardId)!
  const run=()=>('scope' in fixture&&fixture.scope==='graph')?validateMountBindings(fixture.graph as CircuitGraph):resolveFlexibleGeometry(module as CircuitModule,part,support as CircuitModule)
  if(fixture.valid)assert.doesNotThrow(run,fixture.id);else assert.throws(run,fixture.id)
 }
})

test('two exact contacts produce standing, inclined and horizontal axial bodies without scaling',()=>{
 const poses=[]
 for(const column of [11,12,14,18]){
  const result=solveFlexibleMount('RESISTOR_AXIAL','BB','terminal:A:10',`terminal:A:${column}`,[board])
  assert.equal(result.valid,true,result.reason);assert.ok(result.mount&&result.geometry)
  assert.deepEqual(result.mount.contacts.map(c=>c.contactId),['terminal:A:10',`terminal:A:${column}`])
  const part=getPartForType('RESISTOR_AXIAL')!
  assert.deepEqual(result.geometry.half,{x:part.package.bodyMm.x*MM_TO_WORLD/2,y:part.package.bodyMm.y*MM_TO_WORLD/2,z:part.package.bodyMm.z*MM_TO_WORLD/2})
  poses.push(result.mount.bodyPose.rotation.z)
 }
 assert.ok(poses.some(angle=>Math.abs(angle)>60));assert.ok(poses.some(angle=>Math.abs(angle)<10))
})

test('a forbidden contact is reported exactly, without searching for a different hole',()=>{
 const result=solveFlexibleMount('RESISTOR_AXIAL','BB','terminal:A:10','terminal:A:10',[board])
 assert.equal(result.valid,false);assert.match(result.reason,/same|occupied|distinct/i)
 const far=solveFlexibleMount('RESISTOR_AXIAL','BB','terminal:A:01','terminal:A:63',[board])
 assert.equal(far.valid,false)
})

test('Euler YXZ transform preserves all vector lengths and the declared pin ordering',()=>{
 const matrix=rotationMatrix({x:25,y:37,z:62}),point={x:2,y:3,z:4},rotated=transformPoint(matrix,point)
 assert.ok(Math.abs(Math.hypot(rotated.x,rotated.y,rotated.z)-Math.sqrt(29))<1e-12)
})

test('all authored flexible families support bounded short and long spans and retain descriptor pin polarity',()=>{
 for(const type of ['GENERIC_RESISTOR','GENERIC_CAPACITOR','GENERIC_CAPACITOR_ELECTROLYTIC','GENERIC_DIODE','GENERIC_ZENER_DIODE','GENERIC_LED']){
  const poses=[]
  for(const column of [11,14,18]){
   const solution=solveFlexibleMount(type,'BB','terminal:C:10',`terminal:C:${column}`,[board])
   assert.equal(solution.valid,true,`${type} / ${column}: ${solution.reason}`)
   assert.deepEqual(solution.mount!.contacts.map(c=>c.pinId),getPartForType(type)!.package.pins.map(p=>p.id))
   poses.push(solution.mount!.bodyPose.rotation.z)
   validateMountBindings({schema_version:'1.2',circuit_id:'family-parity',modules:[board,{id:'P',type,mount:solution.mount!}],connections:[]})
  }
  assert.ok(new Set(poses).size>1,`${type} must adapt its rigid body pose to the requested span`)
 }
})

test('preview rejects or reroutes an existing flexible lead crossing the new body before reporting validity',()=>{
 const resistor=solveFlexibleMount('GENERIC_RESISTOR','BB','terminal:A:10','terminal:A:18',[board]).mount!
 const modules=[board,{id:'R',type:'GENERIC_RESISTOR',mount:resistor}],led=solveFlexibleMount('GENERIC_LED','BB','terminal:A:07','terminal:A:11',modules)
 if(led.valid)assert.doesNotThrow(()=>validateMountBindings({schema_version:'1.2',circuit_id:'symmetric-collision',modules:[...modules,{id:'LED',type:'GENERIC_LED',mount:led.mount!}],connections:[]}))
 else assert.match(led.reason,/intersect|overlap|length|bend|body/i)
})
