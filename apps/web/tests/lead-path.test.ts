import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { createFlexibleLeadGeometry } from '../src/three/package/LeadGeometry'
import { buildLeadPath, leadPathIntersectsItself, normalizeLeadPolyline } from '../src/electrical/leadPath'

test('a rendered circular fillet rejects a radius that cannot fit its straight runs', () => {
  assert.throws(() => createFlexibleLeadGeometry([
    new Vector3(0, 0, 0), new Vector3(0, .01, 0), new Vector3(.01, .01, 0),
  ], .002, .02), /radius|fit/i)
})

test('forward collinear subdivision leaves actual fillets, length and samples unchanged', () => {
  const points=[{x:0,y:0,z:0},{x:0,y:3,z:0},{x:4,y:3,z:0},{x:4,y:0,z:0}]
  const subdivided=[points[0]!,{x:0,y:.2,z:0},{x:0,y:2,z:0},points[1]!,{x:1,y:3,z:0},points[2]!,{x:4,y:1,z:0},points[3]!]
  assert.deepEqual(normalizeLeadPolyline(subdivided),points)
  assert.deepEqual(buildLeadPath(subdivided,.3,2,{start:.5,end:.5}),buildLeadPath(points,.3,2,{start:.5,end:.5}))
})

test('a U uses the widest symmetric fitted radii and retains true endpoint straights', () => {
  const path=buildLeadPath([{x:0,y:0,z:0},{x:0,y:3,z:0},{x:4,y:3,z:0},{x:4,y:0,z:0}],.3,3,{start:1,end:1})
  assert.ok(path.bendRadii.every(radius=>Math.abs(radius-2)<1e-12))
  assert.equal(path.bendRadii[0],path.bendRadii[1])
  assert.equal(path.segments[0]!.kind,'line')
  assert.ok(Math.abs(path.segments[0]!.length-1)<1e-12)
  assert.ok(Math.abs(path.segments.at(-1)!.length-1)<1e-12)
  assert.ok(Math.abs(path.length-(2+2*Math.PI))<1e-12)
  for(const segment of path.segments)if(segment.kind==='arc'){
    assert.ok(Math.abs(new Vector3(segment.start.x,segment.start.y,segment.start.z).distanceTo(new Vector3(segment.center.x,segment.center.y,segment.center.z))-segment.radius)<1e-12)
  }
})

test('normalization retains meaningful bends and rejects reversal and unfit endpoint straights', () => {
  const bent=[{x:0,y:0,z:0},{x:0,y:1,z:0},{x:1,y:1,z:0}]
  assert.deepEqual(normalizeLeadPolyline(bent),bent)
  assert.throws(()=>buildLeadPath([{x:0,y:0,z:0},{x:0,y:1,z:0},{x:0,y:.5,z:0}],.1),/reverses/)
  assert.throws(()=>buildLeadPath(bent,.3,.3,{start:.8,end:0}),/fit/)
})

test('arc samples have bounded chord error and retain exact analytic arclengths', () => {
  const path=buildLeadPath([{x:0,y:0,z:0},{x:0,y:3,z:0},{x:3,y:3,z:0}],.3,1)
  assert.equal(path.sampleDistances.at(-1),path.length)
  const arc=path.segments.find(segment=>segment.kind==='arc')!
  assert.equal(arc.kind,'arc')
  if(arc.kind!=='arc')throw Error('Expected circular bend')
  const arcPoints=path.samples.filter(p=>Math.abs(Math.hypot(p.x-arc.center.x,p.y-arc.center.y,p.z-arc.center.z)-arc.radius)<1e-8)
  for(let i=1;i<arcPoints.length;i++){
    const a=arcPoints[i-1]!,b=arcPoints[i]!,mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2}
    assert.ok(arc.radius-Math.hypot(mid.x-arc.center.x,mid.y-arc.center.y,mid.z-arc.center.z)<=path.sampleError+1e-12)
  }
})

test('a short 270 degree return cannot hide crossing long straight runs as local tube continuity', () => {
  const path=buildLeadPath([
    {x:-3,y:0,z:0},{x:0,y:0,z:0},{x:0,y:.6,z:0},{x:-.6,y:.6,z:0},{x:-.6,y:-3,z:0},
  ],.3)
  // The first and last straight runs cross at (-.6,0,0), although the
  // intervening three quarter circles total only 1.4137 mm (< pi * .5 mm).
  assert.equal(leadPathIntersectsItself(path,.5),true)
  const ordinary=buildLeadPath([{x:0,y:0,z:0},{x:0,y:3,z:0},{x:4,y:3,z:0},{x:4,y:0,z:0}],.3,2)
  assert.equal(leadPathIntersectsItself(ordinary,.5),false)
})
