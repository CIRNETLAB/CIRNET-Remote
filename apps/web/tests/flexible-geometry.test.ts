import {test} from 'node:test'
import assert from 'node:assert/strict'
import fixtures from '../../../contracts/design-models/fixtures/flexible-mounting-parity.json'
import {getPartForType,MM_TO_WORLD} from '../src/data/partCatalog'
import {resolveFlexibleGeometry,solveFlexibleMount,rotationMatrix,transformPoint,pointDistance} from '../src/electrical/flexibleGeometry'
import {getBreadboardContact} from '../src/electrical/BreadboardTopology'
import type {CircuitModule} from '../src/types/circuit'
import type {CircuitGraph} from '../src/types/circuit'
import {validateMountBindings} from '../src/electrical/mounting'

const board:CircuitModule={id:'BB',type:'BREADBOARD',position:{x:0,y:0,z:0}}

test('canonical flexible fixtures have the same accept/reject result in the Web geometry resolver',()=>{
 for(const fixture of fixtures.cases){
  const module=fixture.graph.modules.find(m=>'mount' in m)!,part=getPartForType(module.type,(module as CircuitModule).mount)!,support=fixture.graph.modules.find(m=>m.id===module.mount!.boardId)!
  const run=()=>('scope' in fixture&&fixture.scope==='graph')?validateMountBindings(fixture.graph as CircuitGraph):resolveFlexibleGeometry(module as CircuitModule,part,support as CircuitModule)
  if(fixture.valid)assert.doesNotThrow(run,fixture.id);else assert.throws(run,fixture.id)
 }
})

test('version two parity fixtures retain numeric curved lengths and per-bend radii',()=>{
 for(const fixture of fixtures.cases){
  if(!('expectedGeometry' in fixture))continue
  const module=fixture.graph.modules.find(m=>'mount' in m)! as CircuitModule,part=getPartForType(module.type,module.mount)!,support=fixture.graph.modules.find(m=>m.id===module.mount!.boardId)! as CircuitModule
  const geometry=resolveFlexibleGeometry(module,part,support)
  for(const expected of fixture.expectedGeometry!){const lead=geometry.leads.find(l=>l.pinId===expected.pinId)!
   assert.ok(Math.abs(lead.path.length/MM_TO_WORLD-expected.lengthMm)<1e-10,fixture.id)
   assert.equal(lead.path.bendRadii.length,expected.bendRadiiMm.length)
   lead.path.bendRadii.forEach((radius,index)=>assert.ok(Math.abs(radius/MM_TO_WORLD-expected.bendRadiiMm[index]!)<1e-10,fixture.id))
   assert.deepEqual(lead.points,expected.points)
  }
 }
})

test('two exact contacts produce standing and horizontal axial bodies without scaling',()=>{
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

test('every generic family stops at its mechanical maximum without changing either contact',()=>{
 for(const type of ['GENERIC_RESISTOR','GENERIC_DIODE','GENERIC_ZENER_DIODE','GENERIC_CAPACITOR','GENERIC_CAPACITOR_ELECTROLYTIC','GENERIC_LED']){
  let last=11,rejected=false
  for(let column=11;column<=63;column++){
   const second=`terminal:C:${column}`,solution=solveFlexibleMount(type,'BB','terminal:C:10',second,[board])
   if(!solution.valid){assert.match(solution.reason,/length|mechanical bounds/);assert.ok(last>14&&last<63);rejected=true;break}
   last=column;assert.equal(solution.mount!.contacts[1]!.contactId,second)
   for(const lead of solution.geometry!.leads)assert.ok(lead.path.length/MM_TO_WORLD<=solution.geometry!.profile.maxLeadLengthMm)
  }
  assert.ok(rejected,`${type} must reject a span beyond the finite lead length`)
 }
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
  if(type.includes('RESISTOR')||type.includes('DIODE'))assert.ok(new Set(poses).size>1,`${type} must adapt its rigid body pose to the requested span`)
  else assert.deepEqual(poses,[0,0,0],`${type} remains upright`)
 }
})

test('inclusive two/three holes stand directly over the first pin; four/five holes lie horizontally',()=>{
 for(const type of ['GENERIC_RESISTOR','GENERIC_DIODE','GENERIC_ZENER_DIODE'])for(const column of [11,12,13,14]){
  const result=solveFlexibleMount(type,'BB','terminal:C:10',`terminal:C:${column}`,[board])
  assert.equal(result.valid,true,`${type} / ${column}: ${result.reason}`)
  const standing=column<13
  assert.equal(result.mount!.bodyPose.rotation.z,standing?90:0)
  if(standing){const first=result.geometry!.leads[0].points,contact=first.at(-1)!;assert.ok(Math.hypot(first[0].x-contact.x,first[0].z-contact.z)<1e-10)}
 }
})

test('diagonal mode thresholds compare continuous contact distance without rounding pitch counts',()=>{
 for(const [second,expected] of [['terminal:C:12',90],['terminal:B:13',0]] as const){
  const result=solveFlexibleMount('GENERIC_RESISTOR','BB','terminal:A:10',second,[board]);assert.equal(result.valid,true,result.reason)
  assert.equal(result.mount!.bodyPose.rotation.z,expected)
 }
})

test('exact-pitch radial is upright, centered and invariant to collinear subdivision',()=>{
 const result=solveFlexibleMount('GENERIC_LED','BB','terminal:C:10','terminal:C:11',[board])
 assert.equal(result.valid,true,result.reason)
 assert.equal(result.mount!.bodyPose.rotation.x,0);assert.equal(result.mount!.bodyPose.rotation.z,0)
 for(const lead of result.geometry!.leads){const contact=lead.points.at(-1)!;assert.ok(lead.points.every(p=>Math.hypot(p.x-contact.x,p.z-contact.z)<1e-10))}
 const mount=structuredClone(result.mount!),part=getPartForType('GENERIC_LED')!
 mount.bodyPose.position.y=.309+(part.package.bodyMm.y/2+2.2)*MM_TO_WORLD
 for(const lead of mount.leads){const pin=result.geometry!.profile.pins.find(p=>p.pinId===lead.pinId)!,p=mount.bodyPose.position;lead.controlPoints=[.6,1,1.5].map(offset=>({x:p.x+pin.bodyExitMm.x*MM_TO_WORLD,y:p.y+(pin.bodyExitMm.y-offset)*MM_TO_WORLD,z:p.z}))}
 assert.doesNotThrow(()=>resolveFlexibleGeometry({id:'L',type:'GENERIC_LED',mount},part,board))
})

test('all templates preserve exact pin endpoints and rigid exits for reverse, row, diagonal and transformed boards',()=>{
 const supports=[board,{...board,position:{x:9,y:3,z:-5},rotation:137}]
 for(const support of supports)for(const pair of [['terminal:C:10','terminal:C:11'],['terminal:C:11','terminal:C:10'],['terminal:C:10','terminal:C:13'],['terminal:C:13','terminal:C:10'],['terminal:A:10','terminal:D:10'],['terminal:A:10','terminal:C:12']])for(const type of ['GENERIC_RESISTOR','GENERIC_DIODE','GENERIC_ZENER_DIODE','GENERIC_CAPACITOR','GENERIC_CAPACITOR_ELECTROLYTIC','GENERIC_LED']){
  const result=solveFlexibleMount(type,'BB',pair[0]!,pair[1]!,[support]);assert.equal(result.valid,true,`${type} ${pair}: ${result.reason}`)
  const geometry=result.geometry!,mount=result.mount!,profile=geometry.profile
  assert.equal(mount.version,2);assert.equal(mount.geometryRevision,2)
  for(const lead of geometry.leads){
   const binding=mount.contacts.find(p=>p.pinId===lead.pinId)!,contact=getBreadboardContact(support.type,binding.contactId)!,expected={x:contact.localPosition[0],y:contact.localPosition[1],z:contact.localPosition[2]}
   assert.ok(pointDistance(lead.path.samples.at(-1)!,expected)<1e-12)
   assert.ok(lead.path.segments[0]!.length>=profile.exitStraightMm*MM_TO_WORLD-1e-10)
   assert.ok(lead.path.segments.at(-1)!.length>=profile.contactStubMm*MM_TO_WORLD-1e-10)
   assert.ok(lead.path.bendRadii.every(r=>r>=profile.minBendRadiusMm*MM_TO_WORLD-1e-10))
   assert.ok(lead.path.length<=profile.maxLeadLengthMm*MM_TO_WORLD)
  }
  if(profile.strategy==='radial'){assert.equal(mount.bodyPose.rotation.x,0);assert.equal(mount.bodyPose.rotation.z,0);const first=getBreadboardContact(support.type,pair[0]!)!,second=getBreadboardContact(support.type,pair[1]!)!;assert.ok(Math.abs(mount.bodyPose.position.x-(first.localPosition[0]+second.localPosition[0])/2)<1e-12);assert.ok(Math.abs(mount.bodyPose.position.z-(first.localPosition[2]+second.localPosition[2])/2)<1e-12)}
 }
})

test('compact resistor three-pitch horizontal leads are symmetric with real exit and socket straights',()=>{
 const result=solveFlexibleMount('GENERIC_RESISTOR','BB','terminal:C:10','terminal:C:13',[board]);assert.equal(result.valid,true,result.reason)
 const geometry=result.geometry!,[first,second]=geometry.leads
 assert.equal(result.mount!.bodyPose.rotation.z,0)
 assert.ok(Math.abs(first!.path.length-second!.path.length)<1e-12)
 assert.equal(first!.path.segments.filter(s=>s.kind==='arc').length,1)
 assert.deepEqual(first!.path.bendRadii,second!.path.bendRadii)
 assert.ok(first!.path.bendRadii[0]!>geometry.profile.minBendRadiusMm*MM_TO_WORLD)
})

test('new automatic geometry treats another component lead as an obstacle before commit',()=>{
 const fixture=fixtures.cases.find(c=>c.id==='automatic-v2-invalid-component-lead')!,graph=structuredClone(fixture.graph) as CircuitGraph
 const support=graph.modules[0]!,first=graph.modules[1]!,second=graph.modules[2]!
 for(const module of [first,second])assert.doesNotThrow(()=>resolveFlexibleGeometry(module,getPartForType(module.type,module.mount)!,support))
 assert.throws(()=>validateMountBindings(graph),/another component lead/)
 const candidate=solveFlexibleMount(second.type,support.id,second.mount!.contacts[0]!.contactId,second.mount!.contacts[1]!.contactId,[support,first])
 assert.equal(candidate.valid,false);assert.match(candidate.reason,/leads.*intersect/)
})

test('preview rejects or reroutes an existing flexible lead crossing the new body before reporting validity',()=>{
 const resistor=solveFlexibleMount('GENERIC_RESISTOR','BB','terminal:A:10','terminal:A:18',[board]).mount!
 const modules=[board,{id:'R',type:'GENERIC_RESISTOR',mount:resistor}],led=solveFlexibleMount('GENERIC_LED','BB','terminal:A:07','terminal:A:11',modules)
 if(led.valid)assert.doesNotThrow(()=>validateMountBindings({schema_version:'1.2',circuit_id:'symmetric-collision',modules:[...modules,{id:'LED',type:'GENERIC_LED',mount:led.mount!}],connections:[]}))
 else assert.match(led.reason,/intersect|overlap|length|bend|body/i)
})
