import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InstancedMesh, Vector3 } from 'three'
import { createSceneManager } from '../src/three/SceneManager'
import type { CircuitGraph } from '../src/types/circuit'
import { defaultWireVisual } from '../src/wires/wireVisual'

function setup() {
  let callback: FrameRequestCallback | null = null
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: cb => { callback = cb; return 1 }, cancelFrame() { callback = null } })
  manager.resize(1000, 700)
  manager.camera.position.set(0, 12, 0); manager.camera.lookAt(0, 0, 0); manager.camera.updateMatrixWorld()
  return { manager, flush() { const next = callback; callback = null; next?.(0) } }
}
const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'contacts', modules: [{ id: 'BB', type: 'BREADBOARD' }], connections: [] }

test('real socket instance raycasts resolve exact contact IDs and retain normal body selection', () => {
  const { manager } = setup()
  try {
    for (const [type, endpoint] of [['BREADBOARD', 'terminal:E:12'], ['BREADBOARD_630', 'terminal:J:03'], ['BREADBOARD_100', 'rail:negative:50']]) {
      manager.syncGraph({ ...graph, modules: [{ id: 'BB', type }] })
      const serialized = `BB.contact:${endpoint}`, anchor = manager.endpointPosition(serialized)!
      assert.ok(anchor, serialized)
      const screen = manager.project(anchor)
      assert.equal(manager.pickEndpoint(screen.x, screen.y)?.endpoint, serialized)
      assert.equal(manager.pick(screen.x, screen.y)?.kind, 'module')
      manager.hoverEndpoint(serialized)
      assert.equal(manager.scene.getObjectByName('contact-hover')?.visible, true)
      let sockets: InstancedMesh | null = null
      manager.models.get('BB')!.traverse(o => { if (o instanceof InstancedMesh && o.userData.breadboardSockets) sockets = o })
      assert.ok(sockets)
    }
    manager.hoverEndpoint(null); assert.equal(manager.scene.getObjectByName('contact-hover')?.visible, false)
  } finally { manager.dispose() }
})

test('board-local wire endpoints and bends follow live move and arbitrary rotation then rollback', () => {
  const { manager, flush } = setup()
  const wire: CircuitGraph['connections'][number] = { source: 'BB.contact:terminal:A:01', destination: 'BB.contact:terminal:J:03', metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', controlPoints: [{ space: 'module', moduleId: 'BB', position: { x: -3.51, y: .36, z: -.455 } }] } } }
  const g: CircuitGraph = { ...graph, connections: [wire] }
  try {
    manager.syncGraph(g); flush()
    const before = manager.wireRoute(wire)!.points.map(p => ({ ...p }))
    manager.previewMove('BB', { x: 1, y: .2, z: 2 }); manager.previewRotation('BB', 37); flush()
    const after = manager.wireRoute(wire)!
    assert.ok(new Vector3(after.points[0].x, after.points[0].y, after.points[0].z).distanceTo(manager.endpointPosition(wire.source)!) < 1e-8)
    assert.notDeepEqual(after.points, before)
    const p = manager.project(manager.endpointPosition(wire.destination)!)
    assert.equal(manager.pickEndpoint(p.x, p.y)?.endpoint, wire.destination)
    manager.syncGraph(g); assert.deepEqual(manager.wireRoute(wire)!.points, before)
    assert.equal(g.connections[0].source, wire.source)
  } finally { manager.dispose() }
})

test('an occluding component prevents contact picking through its body', () => {
  const { manager } = setup()
  try {
    manager.syncGraph({ ...graph, modules: [...graph.modules, { id: 'BLOCK', type: 'BOARD', position: { x: 0, y: 1, z: 0 } }] })
    const point = manager.project(manager.endpointPosition('BB.contact:terminal:A:32')!)
    assert.equal(manager.pickEndpoint(point.x, point.y), null)
  } finally { manager.dispose() }
})

test('cross-board endpoints and support-only board bends update incident routes through live poses', () => {
  const { manager, flush } = setup()
  const jumper: CircuitGraph['connections'][number] = { source: 'BB.contact:terminal:A:01', destination: 'BB2.contact:terminal:J:03', metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', controlPoints: [{ space: 'module', moduleId: 'BB2', position: { x: 1, y: .36, z: 0 } }] } } }
  const supported: CircuitGraph['connections'][number] = { source: 'S.OUT', destination: 'L.IN', metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', controlPoints: [{ space: 'module', moduleId: 'BB2', position: { x: 2, y: .36, z: 1 } }] } } }
  const g: CircuitGraph = { ...graph, modules: [...graph.modules, { id: 'BB2', type: 'BREADBOARD', position: { x: 0, y: 0, z: 4 } }, { id: 'S', type: 'CLOCK', position: { x: -6, y: 0, z: 4 } }, { id: 'L', type: 'LED', position: { x: 6, y: 0, z: 4 } }], connections: [jumper, supported] }
  try {
    manager.syncGraph(g); flush()
    const source = manager.endpointPosition(jumper.source)!.clone(), snapshot = JSON.stringify(g)
    manager.previewMove('BB2', { x: 1, y: .2, z: 6 }); manager.previewRotation('BB2', 37); flush()
    assert.ok(manager.endpointPosition(jumper.source)!.equals(source))
    const end = manager.wireRoute(jumper)!.points.at(-1)!
    assert.ok(new Vector3(end.x, end.y, end.z).distanceTo(manager.endpointPosition(jumper.destination)!) < 1e-8)
    const bend = manager.wireRoute(supported)!.handles[0].position
    assert.ok(new Vector3(bend.x, bend.y, bend.z).distanceTo(manager.models.get('BB2')!.localToWorld(new Vector3(2, .36, 1))) < 1e-8)
    assert.equal(JSON.stringify(g), snapshot)
  } finally { manager.dispose() }
})

test('oblique segment picks project back to the exact clicked CSS position', () => {
  const { manager } = setup()
  const wire: CircuitGraph['connections'][number] = { source: 'A.OUT', destination: 'B.IN', metadata: { wireVisual: { ...defaultWireVisual(), routeMode: 'FREE', controlPoints: [{ space: 'world', position: { x: -2, y: .5, z: -4 } }, { space: 'world', position: { x: 2, y: .5, z: 4 } }] } } }
  try {
    manager.syncGraph({ ...graph, modules: [{ id: 'A', type: 'CLOCK', position: { x: -5, y: 0, z: -4 } }, { id: 'B', type: 'LED', position: { x: 5, y: 0, z: 4 } }], connections: [wire] })
    manager.highlight(null, wire); manager.camera.position.set(0, 7, 10); manager.camera.lookAt(0, 0, 0)
    const a = manager.project(new Vector3(-2, .5, -4)), b = manager.project(new Vector3(2, .5, 4))
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2
    const hit = manager.pickWireEdit(x, y, wire)!
    assert.equal(hit.kind, 'segment')
    const projected = manager.project(hit.point)
    assert.ok(Math.hypot(projected.x - x, projected.y - y) < 1e-6, 'perspective pick must remain under the pointer')
  } finally { manager.dispose() }
})
