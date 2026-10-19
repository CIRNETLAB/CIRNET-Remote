import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, Mesh, Vector3 } from 'three'
import { createSceneManager } from '../src/three/SceneManager'

test('camera framing uses a wide viewport for two separated committed instruments instead of fitting an empty sphere', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1680, 620)
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'tight-fit', modules: [
      { id: 'A', type: 'OSCILLOSCOPE', position: { x: -15, y: 0, z: 0 } },
      { id: 'B', type: 'FUNCTION_GENERATOR', position: { x: 15, y: 0, z: 0 } },
    ], connections: [] })
    assert.equal(manager.fitCircuit(), true)
    manager.camera.updateMatrixWorld(true)
    const projected = new Box3()
    for (const model of manager.models.values()) model.traverseVisible(object => {
      if (!(object instanceof Mesh) || object.userData.isOutline) return
      object.geometry.computeBoundingBox()
      const box = object.geometry.boundingBox!
      for (let i = 0; i < 8; i++) projected.expandByPoint(new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(object.matrixWorld).project(manager.camera))
    })
    const coverage = projected.getSize(new Vector3())
    assert.ok(Math.max(coverage.x, coverage.y) > 1.65, `tight overview must approach its padded edge; observed ${coverage.x.toFixed(3)} × ${coverage.y.toFixed(3)} NDC`)
  } finally { manager.dispose() }
})
