import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Vector3,Mesh,TubeGeometry,CurvePath} from 'three'
import fixtures from '../../../contracts/design-models/fixtures/flexible-mounting-parity.json'
import {buildComponent,disposeObject} from '../src/three/ComponentModel'
import {moduleWorldPose,moduleLocalToWorld} from '../src/electrical/modulePose'
import {getBreadboardContact} from '../src/electrical/BreadboardTopology'
import {createSceneManager} from '../src/three/SceneManager'
import type {CircuitGraph} from '../src/types/circuit'
import {updateFlexiblePackageGeometry} from '../src/three/package/FlexiblePackageGeometry'
import {isFlexibleMount,solveFlexibleMount} from '../src/electrical/flexibleGeometry'
import {getPartForType} from '../src/data/partCatalog'
import {packagePinAnchor} from '../src/three/PackageModel'
import {solveMounting} from '../src/electrical/mounting'

test('flexible rendered targets and connected wire endpoints follow exact contact tips instead of the rigid footprint',()=>{
 const graph=structuredClone(fixtures.cases.find(f=>f.valid)!.graph) as CircuitGraph,module=graph.modules.find(m=>m.mount)!,board=graph.modules[0],model=buildComponent(module,graph.modules)
 const manager=createSceneManager({renderer:{setSize(){},render(){},dispose(){}},requestFrame:()=>1,cancelFrame(){}})
 try{
  manager.syncGraph(graph)
  for(const binding of module.mount!.contacts){
   const contact=getBreadboardContact(board.type,binding.contactId)!,expected=moduleLocalToWorld({x:contact.localPosition[0],y:contact.localPosition[1],z:contact.localPosition[2]},board)
   assert.ok(manager.endpointPosition(`${module.id}.${binding.pinId}`)!.distanceTo(new Vector3(expected.x,expected.y,expected.z))<1e-8)
  }
  assert.equal(model.getObjectByName('flexible-rigid-body')!.scale.lengthSq(),3)
  for(const lead of module.mount!.contacts){const sweep=model.getObjectByName(`package-lead-${lead.pinId}`)!.getObjectByName('lead-metal') as Mesh;assert.ok(sweep.geometry.getAttribute('position').count>0)}
 }finally{manager.dispose();disposeObject(model)}
})

test('mount edits replace only owned lead geometry and update all pin consumers without scaling the body',()=>{
 const graph=structuredClone(fixtures.cases.find(f=>f.valid)!.graph) as CircuitGraph,module=graph.modules.find(m=>m.mount)!,model=buildComponent(module,graph.modules)
 if(!isFlexibleMount(module.mount))throw Error('fixture')
 const body=model.getObjectByName('flexible-rigid-body')!,surface=model.getObjectByName(`package-lead-${module.mount.contacts[0].pinId}`)!.getObjectByName('lead-metal') as Mesh,old=surface.geometry
 let disposals=0;old.addEventListener('dispose',()=>disposals++)
 try{
  const changed=structuredClone(module);if(!isFlexibleMount(changed.mount))throw Error('fixture');changed.mount.bodyPose.position.y+=.01
  updateFlexiblePackageGeometry(model,changed,graph.modules)
  assert.equal(model.getObjectByName('flexible-rigid-body'),body);assert.equal(body.scale.lengthSq(),3);assert.equal(disposals,1)
  const replacement=surface.geometry;updateFlexiblePackageGeometry(model,changed,graph.modules);assert.equal(surface.geometry,replacement)
  for(const binding of changed.mount.contacts){const resolved=packagePinAnchor(changed.type,binding.pinId,changed,graph.modules)!;assert.ok(resolved.distanceTo(new Vector3(...model.userData.resolvedPinAnchors[binding.pinId]))<1e-10);assert.ok(model.getObjectByName(`package-pin-target-${binding.pinId}`)!.position.distanceTo(resolved)<1e-10)}
 }finally{disposeObject(model)}
})

test('Undo conversion and same-ID document switches restore rigid lead targets instead of reusing a flexible model',()=>{
 const graph=structuredClone(fixtures.cases.find(f=>f.valid)!.graph) as CircuitGraph,module=graph.modules.find(m=>m.mount)!,board=graph.modules[0]
 const rigid=solveMounting(module.type,moduleLocalToWorld({x:-2.6,y:.309,z:-.715},board),board.rotation??0,[board],module.id)!;assert.equal(rigid.valid,true)
 const manager=createSceneManager({renderer:{setSize(){},render(){},dispose(){}},requestFrame:()=>1,cancelFrame(){}})
 try{
  manager.syncGraph(graph);const previous=manager.models.get(module.id)
  assert.equal(board.mount,undefined);const {mount:_boardMount,...legacyBoard}=board
  manager.syncGraph({schema_version:'1.1',circuit_id:'legacy',modules:[legacyBoard,{id:module.id,type:module.type,mount:rigid.mount,properties:module.properties}],connections:[]})
  assert.notEqual(manager.models.get(module.id),previous);assert.equal(manager.models.get(module.id)!.getObjectByName('flexible-rigid-body'),undefined)
  for(const binding of rigid.mount.contacts){const contact=getBreadboardContact(board.type,binding.contactId)!,expected=moduleLocalToWorld({x:contact.localPosition[0],y:contact.localPosition[1],z:contact.localPosition[2]},board);assert.ok(manager.endpointPosition(`${module.id}.${binding.pinId}`)!.distanceTo(new Vector3(expected.x,expected.y,expected.z))<1e-8)}
 }finally{manager.dispose()}
})

test('automatic templates sweep the validated analytic centerline in the correct board frame',()=>{
 const board={id:'BB',type:'BREADBOARD',position:{x:2,y:1,z:-3},rotation:37}
 for(const type of ['GENERIC_RESISTOR','GENERIC_DIODE','GENERIC_ZENER_DIODE','GENERIC_CAPACITOR','GENERIC_CAPACITOR_ELECTROLYTIC','GENERIC_LED'])for(const column of [11,13]){
  const solution=solveFlexibleMount(type,'BB','terminal:C:10',`terminal:C:${column}`,[board])
  assert.equal(solution.valid,true,`${type} ${column}: ${solution.reason}`)
  const module={id:'P',type,mount:solution.mount!},model=buildComponent(module,[board,module])
  try{
   assert.deepEqual(model.scale.toArray(),[1,1,1])
   assert.deepEqual(model.getObjectByName('flexible-rigid-body')!.scale.toArray(),[1,1,1])
   for(const lead of solution.geometry!.leads){
    const surface=model.getObjectByName(`package-lead-${lead.pinId}`)!.getObjectByName('lead-metal') as Mesh<TubeGeometry>
    const path=surface.geometry.parameters.path as CurvePath<Vector3>
    for(const [t,expected] of [[0,lead.path.samples[0]!],[1,lead.path.samples.at(-1)!]] as const){
     const actual=surface.localToWorld(path.getPoint(t)),world=moduleLocalToWorld(expected,board)
     assert.ok(actual.distanceTo(new Vector3(world.x,world.y,world.z))<1e-8,`${type} rigid frame endpoint`)
    }
    assert.equal(path.curves.length,lead.path.segments.length,'renderer uses every validated straight and circular arc')
    assert.ok(Math.abs(path.getLength()-lead.path.length)<1e-5,'rendered and validated physical lengths agree')
   }
   assert.equal(getPartForType(type,module.mount)!.package.id,module.mount.packageId)
  }finally{disposeObject(model)}
 }
})
