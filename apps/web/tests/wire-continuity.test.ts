import test from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { MM_TO_WORLD as mm } from '../src/data/partCatalog'
import { getBreadboardContact } from '../src/electrical/BreadboardTopology'
import { moduleLocalToWorld } from '../src/electrical/modulePose'
import { wireCenterline } from '../src/wires/wireCenterline'
import { defaultWireVisual, readWireVisual } from '../src/wires/wireVisual'
import { renderWireDiameter } from '../src/wires/wireAppearance'
import { solveWireRoute, type WireRouteContext } from '../src/wires/wireRouting'
import { solveFeasibleWireRoute } from '../src/wires/wireFeasibility'
import { buildWireGeometry, wireGeometryEnvelope } from '../src/three/WireGeometry'
import { deriveWireParts } from '../src/three/WireTerminals'
import { assertHealthyWireGeometry } from './helpers/wireGeometryAssertions'
import type { CircuitModule } from '../src/types/circuit'

test('new wire preset is 1.50/0.62 mm and old explicit appearance remains intact',()=>{
  const fresh=defaultWireVisual();assert.equal(fresh.thickness,1.5*mm)
  const custom={...fresh,thickness:.12,color:'#123456'}
  assert.deepEqual(readWireVisual({source:'A',destination:'B',metadata:{wireVisual:custom}}),custom)
  assert.equal(readWireVisual({source:'A',destination:'B'}).thickness,.036)
})

test('one analytic line/arc centerline has C1 joins, full sections and radius at least 1mm for valid straight/90/near/diagonal/custom routes',()=>{
  const paths=[
    [{x:0,y:.5,z:0},{x:1,y:.5,z:0}],
    [{x:0,y:.5,z:0},{x:.3,y:.5,z:0},{x:.3,y:.5,z:.3}],
    [{x:0,y:.5,z:0},{x:.3,y:.5,z:0},{x:.3,y:.5,z:.18},{x:.8,y:.5,z:.18}],
    [{x:0,y:.5,z:0},{x:.3,y:.7,z:.3},{x:.8,y:.7,z:.3}],
  ]
  for(const diameter of [1.5*mm,.052,.12])for(const points of paths){
    const path=wireCenterline(points,diameter),geometry=buildWireGeometry({points},diameter)
    try{
      assertHealthyWireGeometry(geometry)
      for(const arc of path.segments)if(arc.kind==='arc'){assert.ok(arc.radius>=mm-1e-10);assert.ok(arc.radius>diameter/2)}
      for(let i=1;i<path.segments.length;i++){
        const before=path.segments[i-1]!,after=path.segments[i]!
        const tangent=(segment:typeof before,end:boolean)=>segment.kind==='line'?new Vector3(segment.end.x-segment.start.x,segment.end.y-segment.start.y,segment.end.z-segment.start.z).normalize():new Vector3(segment.axis.x,segment.axis.y,segment.axis.z).cross(new Vector3((end?segment.end:segment.start).x-segment.center.x,(end?segment.end:segment.start).y-segment.center.y,(end?segment.end:segment.start).z-segment.center.z)).normalize()
        assert.ok(tangent(before,true).dot(tangent(after,false))>1-1e-9)
      }
      assert.ok(wireGeometryEnvelope(points,diameter).every(section=>section.radius===diameter/2))
    }finally{geometry.dispose()}
  }
})

test('automatic adjacent-hole wires allocate valid bends with fixed canonical endpoints and true buried tips on yawed boards',()=>{
  for(const type of ['BREADBOARD','BREADBOARD_630','BREADBOARD_100']){
    const board:CircuitModule={id:'BB',type,position:{x:3,y:.4,z:-2},rotation:37}
    const contacts=type==='BREADBOARD_100'?['rail:positive:01','rail:positive:02']:['terminal:A:01','terminal:A:02']
    const context:WireRouteContext={modulePose:()=>board,endpoint:endpoint=>{
      const contact=getBreadboardContact(type,endpoint.split('.contact:')[1]);if(!contact)return null
      return{endpoint,contactModuleId:'BB',position:moduleLocalToWorld({x:contact.localPosition[0],y:contact.localPosition[1],z:contact.localPosition[2]},board)}
    }}
    const wire={source:`BB.contact:${contacts[0]}`,destination:`BB.contact:${contacts[1]}`},visual=defaultWireVisual(),route=solveWireRoute(wire,visual,context)
    assert.ok(route,`${type}: adjacent span`)
    const parts=deriveWireParts(route,renderWireDiameter(visual))
    assert.deepEqual(parts.corePath.samples[0],parts.terminals[0].tip,'core samples include the buried source tip')
    assert.deepEqual(parts.corePath.samples.at(-1),parts.terminals[1].tip,'core samples include the buried destination tip')
    assert.equal(parts.corePath.sampleDistances[0],0)
    assert.ok(Math.abs(parts.corePath.sampleDistances.at(-1)!-parts.corePath.length)<1e-10)
    assert.equal(parts.corePath.samples.length,parts.corePath.sampleDistances.length)
    assert.ok(parts.corePath.sampleDistances.slice(1).every((distance,index)=>distance>parts.corePath.sampleDistances[index]!),'sample distances remain strictly increasing through the inserted tails')
    for(const [index,name]of ['source','destination'].entries()){
      const endpoint=context.endpoint(wire[name as 'source'|'destination'])!.position,terminal=parts.terminals[index]
      assert.deepEqual(terminal.endpoint,endpoint)
      assert.ok(Math.abs(terminal.tip.y-(.4+.330-3*mm))<1e-9)
      assert.ok(Math.abs(terminal.junction.y-(.4+.330+.4*mm))<1e-9)
      assert.ok(Math.abs(terminal.radius-.31*mm)<1e-9)
    }
    const geometry=buildWireGeometry({points:parts.bodyPoints},visual.thickness,{path:parts.bodyPath,capHoleRadius:parts.capHoleRadius})
    try{
      assertHealthyWireGeometry(geometry)
      const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal')
      const start=new Vector3(parts.terminals[0].junction.x,parts.terminals[0].junction.y,parts.terminals[0].junction.z)
      let annular=0
      for(let i=0;i<positions.count;i++)if(normals.getY(i)<-.99){const p=new Vector3().fromBufferAttribute(positions,i);if(Math.abs(p.y-start.y)<1e-7){assert.ok(p.distanceTo(start)>=parts.capHoleRadius-1e-7,'plastic cap never covers the metal core');annular++}}
      assert.ok(annular>=32)
    }finally{geometry.dispose()}
  }
})

test('unfit short or intersecting manual routes return invalid without moving contacts or deleting bends',()=>{
  const points=[{x:0,y:.5,z:0},{x:.02,y:.5,z:0},{x:.02,y:.5,z:.02},{x:.3,y:.5,z:.02}]
  const visual={...defaultWireVisual(),routeMode:'FREE' as const,controlPoints:points.slice(1,-1).map(position=>({space:'world' as const,position}))},wire={source:'A',destination:'B'}
  const context:WireRouteContext={modulePose:()=>null,endpoint:endpoint=>({endpoint,position:endpoint==='A'?points[0]:points.at(-1)!})}
  const before=JSON.stringify(visual)
  assert.equal(solveWireRoute(wire,visual,context),null)
  assert.equal(solveFeasibleWireRoute(wire,visual,[],context),null)
  assert.equal(JSON.stringify(visual),before)
})
