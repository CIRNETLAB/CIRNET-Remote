import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { Sprite, Vector3, type Object3D } from 'three'
import { placementInitialRotation } from '../src/geometry/placementRotation'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { useCircuitStore } from '../src/stores/circuit'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { createSceneManager } from '../src/three/SceneManager'
import type { CircuitGraph } from '../src/types/circuit'

for (const type of ['OSCILLOSCOPE', 'GENERATOR']) {
  test(`${type} starts Y-up with its panel facing world +Z for every camera heading`, () => {
    for (const heading of [0, 45, 90, 180, 270, 315]) {
      const model = buildComponent({ id: 'I', type, rotation: placementInitialRotation(type, () => heading) })
      try {
        assert.ok(new Vector3(0, 1, 0).transformDirection(model.matrixWorld).distanceTo(new Vector3(0, 1, 0)) < 1e-8)
        const screen = model.getObjectByName('screen')!
        const front = new Vector3(0, 0, 1).transformDirection(screen.matrixWorld)
        assert.ok(Math.abs(front.x) < 1e-8 && front.z > 0.98, `heading ${heading} must not turn the front away from +Z`)
        assert.ok(front.y > 0.13, 'the front retains its intentional upward chassis pitch')
        model.traverse(node => assert.equal(node instanceof Sprite, false, `${node.name} uses model geometry rather than a billboard`))
      } finally { disposeObject(model) }
    }
  })

  test(`${type} keeps manual world yaw and translation when saved and reopened`, () => {
    setActivePinia(createPinia())
    const store = useCircuitStore(); store.createDraft()
    const id = store.placeModule(type, { x: 4, y: 0.5, z: -3 }, placementInitialRotation(type))
    store.rotateModule(id, 90)
    const reopened = parseCircuitFile(store.exportGraph())
    const model = buildComponent(reopened.modules[0])
    try {
      assert.equal(reopened.modules[0].rotation, 90)
      assert.deepEqual(model.position.toArray(), [4, 0.5, -3])
      assert.equal(model.rotation.y, Math.PI / 2)
      const front = new Vector3(0, 0, 1).transformDirection(model.getObjectByName('screen')!.matrixWorld)
      assert.ok(front.x > 0.98 && Math.abs(front.z) < 1e-8, 'saved yaw rotates the front toward world +X')
    } finally { disposeObject(model) }
  })
}

test('Orbit, Pan, Zoom, ViewCube and Reset preserve placed instrument geometry and saved graph transforms', () => {
  let frameId = 0
  const frames = new Map<number, FrameRequestCallback>()
  const manager = createSceneManager({
    renderer: { setSize() {}, render() {}, dispose() {} },
    requestFrame(callback) { frames.set(++frameId, callback); return frameId },
    cancelFrame(id) { frames.delete(id) },
  })
  const graph: CircuitGraph = {
    schema_version: '1.0', circuit_id: 'orientation', connections: [],
    modules: [
      { id: 'SCOPE', type: 'OSCILLOSCOPE', position: { x: -4, y: 0, z: 2 }, rotation: 90 },
      { id: 'FG', type: 'GENERATOR', position: { x: 4, y: 0.25, z: -2 }, rotation: 225 },
    ],
  }
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
  try {
    manager.resize(1000, 700); manager.syncGraph(graph); flush()
    const serialized = JSON.stringify(graph)
    const snapshots = new Map<Object3D, number[]>()
    for (const model of manager.models.values()) model.traverse(node => snapshots.set(node, node.matrixWorld.toArray()))
    const actions = [
      () => manager.orbit(73, 16),
      () => manager.pan(2, -3),
      () => manager.setZoom(175),
      () => manager.setViewOrientation('BACK', false),
      () => manager.setViewOrientation('TOP', false),
      () => manager.resetView(),
    ]
    for (const action of actions) {
      const previousCamera = manager.camera.matrixWorld.clone()
      action(); flush()
      assert.equal(manager.camera.matrixWorld.equals(previousCamera), false, 'navigation changes the camera')
      assert.equal(JSON.stringify(graph), serialized, 'navigation preserves saved module transforms')
      for (const [node, matrix] of snapshots) assert.deepEqual(node.matrixWorld.toArray(), matrix, `${node.name} retains its world transform`)
    }
  } finally { manager.dispose() }
})
