import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { createSceneManager } from '../src/three/SceneManager'
import type { CircuitGraph } from '../src/types/circuit'

const fixture = (x=0,z=0): CircuitGraph => ({schema_version:'1.0',circuit_id:'unified-camera',modules:[
  {id:'L',type:'CLOCK',position:{x:x-50,y:0,z}},
  {id:'R',type:'CLOCK',position:{x:x+50,y:0,z:z+10}},
],connections:[]})
function setup(){const manager=createSceneManager({renderer:{setSize(){},render(){},dispose(){}},requestFrame:()=>1,cancelFrame(){}});manager.resize(1680,620);return manager}
function visible(manager:ReturnType<typeof setup>){for(const model of manager.models.values()){const box=new Box3().setFromObject(model);for(let i=0;i<8;i++){const p=new Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).project(manager.camera);assert.ok(Math.abs(p.x)<=1.0001&&Math.abs(p.y)<=1.0001&&p.z>=-1&&p.z<=1,`outside ${p.toArray()}`)}}}
const reference=(manager:ReturnType<typeof setup>)=>manager.zoomPercent()*manager.camera.position.distanceTo(manager.target())/100

test('unified camera Home frames a translated committed circuit and keeps graph/model poses',()=>{
  const manager=setup(),graph=fixture(800,-400),json=JSON.stringify(graph)
  try{manager.syncGraph(graph);const poses=[...manager.models.values()].map(m=>m.matrixWorld.clone());manager.resetView();visible(manager);assert.ok(manager.target().x>700);assert.ok(Math.abs(manager.zoomPercent()-100)<1e-9);assert.ok(manager.cameraDirection().distanceTo(new Vector3(0,11,10).normalize())<1e-8);assert.equal(JSON.stringify(graph),json);[...manager.models.values()].forEach((m,i)=>assert.ok(m.matrixWorld.equals(poses[i])))}finally{manager.dispose()}
})

test('unified camera Area retains circuit calibration and ordinary zoom preserves its inspection target',()=>{
  const manager=setup()
  try{manager.syncGraph(fixture());manager.fitCircuit();const overview=manager.target(),calibration=reference(manager);const p=manager.project(manager.models.get('R')!.position);assert.equal(manager.zoomToArea(p.x-28,p.y-28,p.x+28,p.y+28),true);assert.ok(manager.zoomPercent()>100);assert.ok(Math.abs(reference(manager)-calibration)<1e-8,'Area cannot replace the circuit reference');const focus=manager.target();manager.setZoom(50);assert.ok(manager.target().equals(focus));assert.ok(Math.abs(manager.camera.position.distanceTo(manager.target())-calibration*2)<1e-7);manager.fitCircuit();assert.ok(manager.target().distanceTo(overview)<1e-7);visible(manager);const camera=manager.camera.position.clone();manager.fitCircuit();assert.ok(manager.camera.position.distanceTo(camera)<1e-7)}finally{manager.dispose()}
})

test('unified camera full-viewport Area preserves pose and reference after inspect',()=>{
  const manager=setup()
  try{manager.syncGraph(fixture());manager.fitCircuit();manager.setZoom(250);const p=manager.camera.position.clone(),q=manager.camera.quaternion.clone(),r=reference(manager);manager.zoomToArea(1680,620,0,0);assert.ok(manager.camera.position.equals(p));assert.ok(manager.camera.quaternion.equals(q));assert.ok(Math.abs(reference(manager)-r)<1e-8);assert.ok(Math.abs(manager.zoomPercent()-250)<1e-8)}finally{manager.dispose()}
})

test('unified camera repeated committed synchronization reuses bounds calibration',()=>{
  const manager=setup(),graph=fixture()
  try{manager.syncGraph(graph);manager.fitCircuit();const revision=manager.navigationSnapshot().boundsRevision;for(let i=0;i<5;i++){manager.syncGraph(graph);manager.fitCircuit()}assert.equal(manager.navigationSnapshot().boundsRevision,revision,'an unchanged command bridge must not rebuild committed bounds');manager.syncGraph(fixture(20,30));assert.ok(manager.navigationSnapshot().boundsRevision>revision)}finally{manager.dispose()}
})

test('unified camera Area stays outside committed geometry beyond the original selection cone',()=>{
  const manager=setup()
  try{
    manager.syncGraph({schema_version:'1.0',circuit_id:'area-obstacle',modules:[{id:'A',type:'CLOCK'}],connections:[]})
    const model=manager.models.get('A')!,detail=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial()),obstacle=new Mesh(new BoxGeometry(.02,.02,.02),new MeshBasicMaterial())
    detail.position.set(15,5,0);obstacle.position.set(14.625,5,.5+manager.navigationSnapshot().referenceDistance/10);model.add(detail,obstacle);model.userData.onVisualChange()
    manager.camera.position.set(0,5,20);manager.camera.lookAt(0,5,0);manager.camera.updateMatrixWorld()
    const heading=manager.camera.quaternion.clone(),before=manager.camera.position.clone(),left=.6660514375491773,right=.7760514375491774
    assert.ok(obstacle.position.clone().project(manager.camera).x>right,'the blocker is outside the original Area')
    assert.equal(manager.zoomToArea((left+1)*840,(1-.08)*310,(right+1)*840,(1+.08)*310),false,'a blocked camera path is a no-op')
    assert.ok(manager.camera.position.equals(before))
    const local=obstacle.worldToLocal(manager.camera.position.clone())
    assert.equal(new Box3(new Vector3(-.01,-.01,-.01),new Vector3(.01,.01,.01)).containsPoint(local),false,'Area must never put the eye inside an unselected rendered mesh')
    assert.ok(manager.camera.position.z>obstacle.position.z+.01)
    assert.ok(manager.camera.quaternion.equals(heading))
  }finally{manager.dispose()}
})

test('unified camera empty Area ignores geometry behind a remote panned camera',()=>{
  const manager=setup()
  try{manager.syncGraph({schema_version:'1.0',circuit_id:'behind-area',modules:[{id:'A',type:'CLOCK'}],connections:[]});manager.setViewOrientation('FRONT',false);manager.fitCircuit();manager.pan(0,-1000);const position=manager.camera.position.clone();assert.equal(manager.zoomToArea(800,280,880,340),true);assert.ok(manager.camera.position.distanceTo(position)<10);assert.ok(manager.zoomPercent()>=50&&manager.zoomPercent()<=manager.navigationSnapshot().maxZoom)}finally{manager.dispose()}
})

test('unified camera inspection has a physical maximum and a stable reference through bounds and viewport changes',()=>{
  const manager=setup()
  try{manager.syncGraph(fixture());manager.fitCircuit();manager.pan(6,-3);const anchor=manager.target(),r=reference(manager);for(const value of [1e9,100,50,999999,200]){manager.setZoom(value);assert.ok(manager.target().equals(anchor));assert.ok(manager.zoomPercent()<=1000+1e-8);assert.ok(manager.camera.position.distanceTo(anchor)>=r/10-1e-8)}const position=manager.camera.position.clone();manager.resize(500,900);manager.orbit(70);manager.syncGraph(fixture(200,100));assert.ok(Math.abs(reference(manager)-r)<1e-8);assert.ok(manager.camera.position.distanceTo(manager.target())>=r/10-1e-8);assert.ok(position.toArray().every(Number.isFinite))}finally{manager.dispose()}
})
