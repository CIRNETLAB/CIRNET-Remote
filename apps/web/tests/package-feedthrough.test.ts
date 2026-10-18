import {test} from 'node:test'
import assert from 'node:assert/strict'
import {type BufferGeometry} from 'three'
import {buildLeadPath} from '../src/electrical/leadPath'
import {createFlexibleLeadPathGeometry} from '../src/three/package/LeadGeometry'
import {countUnsealedEdges} from './helpers/packageSolids'

test('declared embed extends the rendered lead inside the seal without changing its validated external path',()=>{
 const path=buildLeadPath([{x:0,y:0,z:0},{x:0,y:-1,z:0}],.1),before=structuredClone(path)
 const geometry=Reflect.apply(createFlexibleLeadPathGeometry,undefined,[path,.5,undefined,undefined,{embeddedDepth:.15,section:{kind:'round',width:.5,thickness:.5}}]) as BufferGeometry
 try{
  geometry.computeBoundingBox()
  assert.ok(Math.abs(geometry.boundingBox!.max.y-.15)<1e-6,'metal begins 0.15 inside the body')
  assert.ok(Math.abs(geometry.boundingBox!.min.y+1)<1e-6,'contact tip remains exact')
  assert.deepEqual(path,before,'render-only embed must not enter validated external length/path')
 }finally{geometry.dispose()}
})

test('a square lead sweep contains square corners instead of a round tube',()=>{
 const path=buildLeadPath([{x:0,y:0,z:0},{x:0,y:-1,z:0}],.1)
 const geometry=Reflect.apply(createFlexibleLeadPathGeometry,undefined,[path,.5,undefined,undefined,{embeddedDepth:.15,section:{kind:'rectangular',width:.5,thickness:.5}}]) as BufferGeometry
 try{
  const positions=geometry.getAttribute('position');let corner=false
  for(let i=0;i<positions.count;i++)if(Math.abs(Math.hypot(positions.getX(i),positions.getZ(i))-.5/Math.sqrt(2))<1e-6)corner=true
  assert.ok(corner,'0.50 x 0.50 square cross-section corners are present')
 }finally{geometry.dispose()}
})

test('sealed round end faces reuse the actual sweep rings for arbitrary 3D tangents',()=>{
 for(const points of [[{x:0,y:0,z:0},{x:1,y:2,z:3}],[{x:0,y:0,z:0},{x:1,y:2,z:3},{x:2,y:2,z:3}]]){
  const path=buildLeadPath(points,.1,.2),geometry=createFlexibleLeadPathGeometry(path,.5,undefined,undefined,{embeddedDepth:.15,section:{kind:'round',width:.5,thickness:.5}})
  try{assert.equal(countUnsealedEdges(geometry,1e-6),0,'end caps must meet the transported ring, including rotated segments')}
  finally{geometry.dispose()}
 }
})
