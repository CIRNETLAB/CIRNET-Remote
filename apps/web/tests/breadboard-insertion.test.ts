import test from 'node:test'
import assert from 'node:assert/strict'
import { Group, InstancedMesh, Matrix4, Mesh, Raycaster, Vector3 } from 'three'
import { getPartForType, MM_TO_WORLD as mm, physicalDescriptorForPart } from '../src/data/partCatalog'
import { getBreadboardTopology } from '../src/electrical/BreadboardTopology'
import { moduleLocalToWorld, moduleWorldPose, worldToModuleLocal } from '../src/electrical/modulePose'
import { isFlexibleMount, moduleRigidLeadSegments, resolveFlexibleGeometry, solveFlexibleMount } from '../src/electrical/flexibleGeometry'
import { solveMounting, validateMountBindings } from '../src/electrical/mounting'
import { fixedPackageLeadPath, rigidPackageLeadStations } from '../src/electrical/rigidPackageLeads'
import { boardContactMechanics, conductorFitsContactCavity, validateBoardConductorSegment } from '../src/geometry/BreadboardMechanicalProfile'
import { addBreadboardHousing, BREADBOARD_PLASTIC_COLOR } from '../src/three/BreadboardHousing'
import { addPackageModel, packagePinAnchor } from '../src/three/PackageModel'
import { updateMountedPackageInsertion } from '../src/three/package/MountedPackageInsertion'
import { disposeObject } from '../src/three/ComponentModel'
import type { CircuitModule } from '../src/types/circuit'

const near = (a: number, b: number) => assert.ok(Math.abs(a-b) < 2e-7, `${a} != ${b}`)
const point = (p: readonly number[]) => ({ x:p[0],y:p[1],z:p[2] })

test('830/630/100 actual sockets have 3 mm buried tips, 3.5 mm floors and a closed rear housing', () => {
  for(const type of ['BREADBOARD','BREADBOARD_630','BREADBOARD_100']) {
    const topology=getBreadboardTopology(type)!, contact=topology.contacts[0]!, mechanics=boardContactMechanics(type,contact.contactId), group=new Group()
    addBreadboardHousing(group,type,BREADBOARD_PLASTIC_COLOR,null); group.updateMatrixWorld(true)
    try {
      assert.deepEqual(mechanics.contact,point(contact.localPosition))
      near(mechanics.surface.y-mechanics.tip.y,3*mm); near(mechanics.surface.y-mechanics.floor.y,3.5*mm); near(mechanics.tip.y-mechanics.floor.y,.5*mm)
      const sockets=group.children.find(child=>child.userData.breadboardSockets) as InstancedMesh
      const matrix=new Matrix4(); sockets.getMatrixAt(0,matrix)
      const positions=sockets.geometry.getAttribute('position')
      near(Math.min(...Array.from({length:positions.count},(_,i)=>new Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix).y)),mechanics.floor.y)
      const plastic=group.children.filter(child=>child instanceof Mesh&&!child.userData.breadboardSockets)
      const tip=new Vector3(mechanics.tip.x,mechanics.tip.y,mechanics.tip.z)
      const hits=new Raycaster(tip,new Vector3(0,1,0)).intersectObjects(plastic)
      assert.equal(hits.length,0,'there is no hidden plastic plate through the tip')
      const rear=new Raycaster(tip,new Vector3(0,-1,0)).intersectObjects(plastic)[0]
      assert.ok(rear&&rear.point.y<mechanics.floor.y,'cavity fits above the retained rear case')
    } finally {disposeObject(group)}
  }
})

test('cavity exception admits only the selected normal conductor and rejects wrong holes, plastic crossings and floor penetration',()=>{
  for(const type of ['BREADBOARD','BREADBOARD_630','BREADBOARD_100']) {
    const contact=getBreadboardTopology(type)!.contacts[0]!.contactId,{contact:anchor,tip,floor}=boardContactMechanics(type,contact),radius=.31*mm
    assert.equal(conductorFitsContactCavity(type,contact,anchor,tip,radius),true)
    assert.equal(conductorFitsContactCavity(type,contact,{...anchor,x:anchor.x+.13},{...tip,x:tip.x+.13},radius),false)
    assert.throws(()=>validateBoardConductorSegment(type,contact,{...anchor,x:anchor.x+.13},tip,radius),/plastic/)
    assert.throws(()=>validateBoardConductorSegment(type,contact,anchor,{...tip,y:floor.y-.01},radius),/plastic/)
  }
})

test('new rigid family sweeps remain in their own cavities after board move and yaw with unchanged electrical targets',()=>{
  const types=['GENERIC_RESISTOR','GENERIC_CAPACITOR','GENERIC_CAPACITOR_ELECTROLYTIC','GENERIC_DIODE','GENERIC_ZENER_DIODE','GENERIC_LED','GENERIC_BJT','SN74HC08N','PUSH_BUTTON_B3F1000','SLIDE_SWITCH_SS12D10','DIP_SWITCH_A6D4100','SEGMENT_SC5611EWA','SEGMENT_DC5611EWA','SEGMENT_CC5612EWA','BUZZER_PS1240','RESISTOR_AXIAL','LED_LTL307EE','TRANSISTOR_2N3904','DIODE_1N4148','ZENER_1N4733A','CAPACITOR_CERAMIC','CAPACITOR_ELECTROLYTIC']
  for(const type of types){
    const part=getPartForType(type); assert.ok(part,`part ${type}`)
    for(const boardType of ['BREADBOARD','BREADBOARD_630']){
      const board:CircuitModule={id:'BB',type:boardType,position:{x:3,y:.4,z:-2},rotation:37}
      const desired=moduleLocalToWorld({x:0,y:.309,z:0},board),candidate=solveMounting(type,desired,37,[board])
      assert.ok(candidate?.valid,`${type}: ${candidate?.reason}`)
      const module:CircuitModule={id:'P',type,mount:candidate.mount},modules=[board,module]
      assert.doesNotThrow(()=>validateMountBindings({schema_version:'1.2',circuit_id:'deep',modules,connections:[]}),type)
      let segments:ReturnType<typeof moduleRigidLeadSegments>=[]
      assert.doesNotThrow(()=>{segments=moduleRigidLeadSegments(module,modules)},type)
      const group=new Group(); addPackageModel(group,module,part)
      try {
        updateMountedPackageInsertion(group,module,modules)
        const pose=moduleWorldPose(module,modules)
        for(const pin of part.package.pins){
          const binding=module.mount!.contacts.find(item=>item.pinId===pin.id)!,mechanics=boardContactMechanics(boardType,binding.contactId)
          const anchor=packagePinAnchor(type,pin.id,module,modules)!
          near(worldToModuleLocal(moduleLocalToWorld(anchor,pose),board).y,mechanics.contact.y)
          const tipWorld=moduleLocalToWorld(mechanics.tip,board)
          assert.ok(segments.some(segment=>Math.hypot(segment.end.x-tipWorld.x,segment.end.y-tipWorld.y,segment.end.z-tipWorld.z)<1e-7),`${type}/${pin.id} reaches its 3mm tip`)
          const mesh=group.getObjectByName(`package-lead-${pin.id}`)?.getObjectByName('lead-metal') as Mesh
          mesh.geometry.computeBoundingBox(); near(mesh.geometry.boundingBox!.min.y+candidate.mount.pose.position.y,mechanics.tip.y)
        }
      } finally {disposeObject(group)}
    }
  }
})

test('flexible leads bury only metal and packagePinAnchor stays at the canonical contact',()=>{
  const board:CircuitModule={id:'BB',type:'BREADBOARD'},part=getPartForType('GENERIC_RESISTOR')!
  const solved=solveFlexibleMount(part.editorType,'BB','terminal:C:10','terminal:C:14',[board]);assert.ok(solved.valid,solved.reason)
  const module:CircuitModule={id:'R',type:part.editorType,mount:solved.mount!},geometry=resolveFlexibleGeometry(module,part,board)
  assert.ok(isFlexibleMount(module.mount))
  for(const lead of geometry.leads){
    near(lead.path.points.at(-1)!.y,.330-3*mm)
    const anchor=packagePinAnchor(module.type,lead.pinId,module,[board,module])!
    near(anchor.y+module.mount.bodyPose.position.y,lead.contact.y)
  }
})

test('short declared lead budgets are rejected instead of extending exact metal indefinitely',()=>{
  for(const type of ['GENERIC_RESISTOR','GENERIC_BJT','DIP_SWITCH_A6D4100']){
    const part=structuredClone(getPartForType(type)!);part.package.boardInsertion!.maxExternalLeadMm=.2
    assert.throws(()=>part.package.shape!.family==='to92'?rigidPackageLeadStations(part,part.package.pins[0]!,3*mm):fixedPackageLeadPath(part,part.package.pins[0]!.id,3*mm),/short/)
  }
  const old=getPartForType('GENERIC_RESISTOR',{...physicalDescriptorForPart(getPartForType('GENERIC_RESISTOR')!),partRevision:1,packageRevision:1})
  assert.equal(old?.package.boardInsertion,undefined)
})

test('moving a rigid preview within one profile retains buffers and detaching restores a free metal tip',()=>{
  const board:CircuitModule={id:'BB',type:'BREADBOARD'},part=getPartForType('GENERIC_RESISTOR')!,first=solveMounting(part.editorType,{x:-1,y:.309,z:-.715},0,[board])!
  const module:CircuitModule={id:'R',type:part.editorType,mount:first.mount},group=new Group();addPackageModel(group,module,part)
  try{
    updateMountedPackageInsertion(group,module,[board,module])
    const mesh=group.getObjectByName('package-lead-A')!.getObjectByName('lead-metal') as Mesh,geometry=mesh.geometry
    let disposed=0;geometry.addEventListener('dispose',()=>disposed++)
    const moved=solveMounting(part.editorType,{x:-.5,y:.309,z:-.715},0,[board])!
    updateMountedPackageInsertion(group,{...module,mount:moved.mount},[board,module])
    assert.equal(mesh.geometry,geometry);assert.equal(disposed,0)
    updateMountedPackageInsertion(group,{id:'R',type:part.editorType,physicalDescriptor:physicalDescriptorForPart(part)},[board])
    assert.notEqual(mesh.geometry,geometry);assert.equal(disposed,1)
    mesh.geometry.computeBoundingBox();near(mesh.geometry.boundingBox!.min.y,0)
  }finally{disposeObject(group)}
})
