import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { createSceneManager } from '../src/three/SceneManager'
import type { CircuitGraph } from '../src/types/circuit'

const setup = () => {
  let callback: FrameRequestCallback | null = null
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: cb => { callback = cb; return 1 }, cancelFrame() { callback = null } })
  manager.resize(1000, 700)
  return Object.assign(manager, { flushFrame() { const next = callback; callback = null; next?.(0) } })
}
const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'wires', modules: [
  { id: 'A', type: 'CLOCK', position: { x: -3, y: 0, z: 0 } }, { id: 'B', type: 'LED' },
  { id: 'C', type: 'CLOCK', position: { x: -3, y: 0, z: -4 } }, { id: 'D', type: 'LED', position: { x: 0, y: 0, z: -4 } },
], connections: [{ source: 'A.OUT', destination: 'B.IN' }, { source: 'C.OUT', destination: 'D.IN' }] }

test('movement updates incident wires only and retains selection, material and unrelated GPU buffers', () => {
  const manager = setup()
  try {
    manager.syncGraph(graph)
    const [moved, unrelated] = manager.wires.children as Mesh[]
    const untouchedGeometry = unrelated.geometry, oldGeometry = moved.geometry, material = moved.material
    let incidentDisposals = 0, unrelatedDisposals = 0
    oldGeometry.addEventListener('dispose', () => incidentDisposals++)
    untouchedGeometry.addEventListener('dispose', () => unrelatedDisposals++)
    manager.highlight(null, graph.connections[0])
    manager.previewMove('A', { x: -4, y: 0.2, z: 1 })
    manager.flushFrame()
    assert.ok(manager.wires.children[1] === unrelated, 'unrelated wire identity must survive movement'); assert.ok(unrelated.geometry === untouchedGeometry)
    assert.equal(unrelatedDisposals, 0); assert.equal(incidentDisposals, 1)
    assert.ok(manager.wires.children[0] === moved); assert.ok(moved.material === material)
    assert.equal((moved.material as MeshStandardMaterial).color.getHexString(), '71b3ce', 'selection keeps the saved wire color')
    assert.equal(manager.scene.getObjectByName('wire-selection-outline')?.visible, true)
    assert.notEqual(moved.geometry, oldGeometry)
    manager.syncGraph(graph)
    const restoredGeometry = moved.geometry
    manager.syncGraph(graph)
    assert.equal(moved.geometry, restoredGeometry, 'unchanged graph sync does not allocate wire buffers')
    manager.syncGraph({ ...graph, modules: graph.modules.filter((module) => module.id !== 'C'), connections: [graph.connections[0]] })
    assert.equal(unrelatedDisposals, 1); assert.equal(manager.wires.children.length, 1)
  } finally { manager.dispose() }
})

test('disposed scenes cannot recreate placement or selected resources', () => {
  const manager = setup()
  manager.syncGraph(graph); manager.setGhost('CLOCK', new Vector3()); manager.highlight('A')
  manager.dispose()
  manager.setGhost('CLOCK', new Vector3()); manager.highlight('A'); manager.activateGizmo('x')
  assert.equal(manager.scene.children.length, 0)
  assert.equal(manager.models.size, 0)
  assert.equal(manager.endpointPosition('A.OUT'), null)
})

test('finite extreme imported and preview rotations cannot poison model matrices or wire geometry', () => {
  const manager = setup()
  try {
    manager.syncGraph({ ...graph, modules: graph.modules.map((module) => ({ ...module, rotation: Number.MAX_VALUE })) })
    const finiteScene = () => {
      for (const model of manager.models.values()) assert.ok(model.matrixWorld.elements.every(Number.isFinite), 'all imported model matrices stay finite')
      for (const object of manager.wires.children as Mesh[]) assert.ok([...object.geometry.getAttribute('position').array].every(Number.isFinite), 'wires follow finite endpoints')
    }
    finiteScene()
    manager.previewRotation('A', -Number.MAX_VALUE); finiteScene()
  } finally { manager.dispose() }
})

test('committing supply settings updates its controls without rebuilding the enclosure or selection', () => {
  const manager = setup()
  try {
    const initial: CircuitGraph = { schema_version: '1.0', circuit_id: 'settings', modules: [{ id: 'P', type: 'POWER_SUPPLY', properties: { voltage_v: 0, current_limit_a: 0, power_on: false } }], connections: [] }
    manager.syncGraph(initial); manager.highlight('P')
    const model = manager.models.get('P')!, enclosure = model.getObjectByName('supply-enclosure') as Mesh
    const outline = model.getObjectByName('selection-outline'), screen = model.getObjectByName('supply-display')!
    let disposed = 0; enclosure.geometry.addEventListener('dispose', () => disposed++)
    manager.syncGraph({ ...initial, modules: [{ ...initial.modules[0], properties: { voltage_v: 3.3, current_limit_a: 1.5, power_on: true } }] })
    assert.ok(manager.models.get('P') === model, 'a setting commit must retain the existing supply assembly')
    assert.ok(model.getObjectByName('selection-outline') === outline)
    assert.deepEqual(screen.userData.settings, [true, 3.3, 1.5]); assert.equal(disposed, 0)
    manager.syncGraph(initial)
    assert.ok(manager.models.get('P') === model); assert.deepEqual(screen.userData.settings, [false, 0, 0])
  } finally { manager.dispose() }
})
