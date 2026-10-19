import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSceneManager } from '../src/three/SceneManager'

test('grid fade and footprint follow the camera rather than selected model bounds or movement',()=>{
  const frames:FrameRequestCallback[]=[]
  const manager=createSceneManager({renderer:{setSize(){},render(){},dispose(){}},requestFrame(callback){frames.push(callback);return frames.length},cancelFrame(){}})
  const draw=()=>{const pending=frames.splice(0);pending.forEach(callback=>callback(0))}
  try {
    manager.resize(1000,700)
    manager.syncGraph({schema_version:'1.0',circuit_id:'grid-independence',modules:[{id:'A',type:'CLOCK'}],connections:[]})
    manager.highlight('A');draw()
    const grid=manager.grid, geometry=grid.geometry, material=grid.material
    const focus=material.uniforms.focus.value.clone(),scale=grid.scale.clone(),pose=manager.camera.matrixWorld.clone()
    const uniforms=()=>Object.fromEntries(Object.entries(material.uniforms).map(([key,uniform])=>[key,typeof uniform.value?.toArray==='function'?uniform.value.toArray():uniform.value]))
    const before=uniforms()
    manager.previewMove('A',{x:300,y:0,z:-400});draw()
    assert.ok(manager.camera.matrixWorld.equals(pose),'model movement does not move the camera')
    assert.ok(material.uniforms.focus.value.equals(focus),'selecting and moving a model cannot move the fade center')
    assert.deepEqual(uniforms(),before,'model-dependent clip changes cannot alter grid appearance')
    assert.ok(grid.scale.equals(scale))
    manager.syncGraph(null);draw()
    assert.deepEqual(uniforms(),before,'empty workspace keeps the same camera-owned grid')
    assert.equal(grid.geometry,geometry);assert.equal(grid.material,material,'updates allocate no grid resources')
  } finally {manager.dispose()}
})
