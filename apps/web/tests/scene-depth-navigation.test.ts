import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Vector3 } from 'three'
import { createSceneManager } from '../src/three/SceneManager'
import type { CircuitGraph } from '../src/types/circuit'

function setup() {
  const frames: FrameRequestCallback[]=[]
  const manager=createSceneManager({renderer:{setSize(){},render(){},dispose(){}},requestFrame(callback){frames.push(callback);return frames.length},cancelFrame(){}})
  manager.resize(1200,800)
  const graph:CircuitGraph={schema_version:'1.0',circuit_id:'depth-navigation',modules:[{id:'scope',type:'OSCILLOSCOPE',position:{x:0,y:0,z:0}}],connections:[]}
  manager.syncGraph(graph)
  return {manager,graph,draw(){const pending=frames.splice(0);pending.forEach(callback=>callback(0))}}
}

test('projection updates content clipping synchronously after navigation and geometry changes',()=>{
  const {manager,graph,draw}=setup(),snapshot=JSON.stringify(graph)
  try {
    manager.setZoom(50)
    manager.project(new Vector3())
    assert.ok(manager.camera.near>.005,'zoom out recovers depth precision before a queued frame')
    manager.camera.position.set(0,2,30);manager.camera.lookAt(0,2,0)
    manager.previewMove('scope',{x:0,y:0,z:-400})
    assert.equal(manager.project(new Vector3(0,2,-400)).visible,true,'new distant geometry re-enters without old-frustum culling')
    assert.ok(manager.camera.far>430)
    manager.previewMove('scope',{x:0,y:0,z:0})
    manager.project(new Vector3(0,2,0))
    assert.ok(manager.camera.far<100,'removing distant extent tightens the range')
    const near=manager.camera.near,far=manager.camera.far
    draw()
    assert.equal(manager.camera.near,near);assert.equal(manager.camera.far,far,'render and synchronous projection share one policy')
    assert.equal(JSON.stringify(graph),snapshot,'render previews never change CircuitGraph')
  } finally {manager.dispose()}
})

test('visible placement previews participate in clipping and clearing them releases distant range',()=>{
  const {manager}=setup()
  try {
    manager.camera.position.set(0,2,30);manager.camera.lookAt(0,2,0)
    manager.setGhost('OSCILLOSCOPE',{x:0,y:0,z:-400})
    assert.equal(manager.project(new Vector3(0,2,-400)).visible,true)
    manager.setGhost(null)
    manager.project(new Vector3(0,2,0))
    assert.ok(manager.camera.far<100)
  } finally {manager.dispose()}
})

test('unpickable selection and wire previews expand clipping before the next render',()=>{
  const {manager,graph}=setup()
  try {
    manager.camera.position.set(0,2,30);manager.camera.lookAt(0,2,0)
    const candidate:CircuitGraph={...graph,modules:[{...graph.modules[0]!,id:'copy',position:{x:0,y:0,z:-400}}]}
    manager.setSelectionPreview(candidate,{moduleIds:['copy'],wires:[]},true)
    assert.equal(manager.project(new Vector3(0,2,-400)).visible,true)
    manager.clearSelectionPreview()
    manager.syncGraph({...graph,modules:[{id:'clock',type:'CLOCK'}]})
    manager.previewWireDrawing({source:'clock.OUT',destination:''},{version:1,color:'#ff0000',routeMode:'FREE',controlPoints:[],thickness:.05},{x:0,y:0,z:-400})
    assert.equal(manager.project(new Vector3(0,0,-400)).visible,true)
    manager.clearWireDrawing()
    manager.project(new Vector3())
    assert.ok(manager.camera.far<100)
  } finally {manager.dispose()}
})
