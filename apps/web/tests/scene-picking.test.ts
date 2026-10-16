import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Group,Mesh,BoxGeometry,MeshBasicMaterial,PerspectiveCamera,Raycaster,Vector3 } from 'three'
import { createScenePicking } from '../src/three/ScenePicking'

function setup() {
  const camera=new PerspectiveCamera(42,1,.01,100);camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld(true)
  const content=new Group(),wires=new Group(),raycaster=new Raycaster()
  return {camera,content,raycaster,picking:createScenePicking({camera,content,wires,raycaster,viewport:()=>({width:500,height:500}),target:()=>new Vector3()})}
}
test('picking resolves complete module owners and excludes ignored ancestor subtrees',()=>{
  const {content,picking}=setup(),root=new Group();root.userData.kind='module';root.userData.id='part'
  const body=new Mesh(new BoxGeometry(),new MeshBasicMaterial());root.add(body);content.add(root);content.updateMatrixWorld(true)
  assert.equal(picking.pickOwner(body),root);assert.equal(picking.contentHit(250,250)?.object,body)
  root.userData.ignorePick=true;assert.equal(picking.contentHit(250,250),null)
  body.geometry.dispose();body.material.dispose()
})
test('segment picking preserves perspective interpolation and rejects geometry behind the camera',()=>{
  const {picking}=setup(),a={x:-1,y:0,z:1},b={x:1,y:0,z:-2},p=picking.screenPoint(a),q=picking.screenPoint(b)
  const hit=picking.segmentHit(a,b,(p.x+q.x)/2,(p.y+q.y)/2)!
  const projected=picking.screenPoint(hit.point)
  assert.ok(Math.abs(projected.x-(p.x+q.x)/2)<1e-6);assert.ok(hit.pixels<1e-6)
  assert.equal(picking.segmentHit({x:0,y:0,z:11},{x:1,y:1,z:12},250,250),null)
})
