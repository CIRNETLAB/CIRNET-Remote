import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector3 } from 'three'
import { createSceneManager } from '../src/three/SceneManager'
import { createFramingBounds } from '../src/three/CameraFraming'
import { createViewportNavigation } from '../src/three/ViewportNavigation'
import type { CircuitGraph } from '../src/types/circuit'

const fixture = (): CircuitGraph => ({ schema_version: '1.0', circuit_id: 'controller-regression', modules: [
  { id: 'L', type: 'OSCILLOSCOPE', position: { x: 600, y: 0, z: -400 } },
  { id: 'R', type: 'FUNCTION_GENERATOR', rotation: 35, position: { x: 800, y: 2, z: -370 } },
], connections: [] })
function setup(controls = true) {
  const canvas = Object.assign(new EventTarget(), { style: { touchAction: '' }, clientWidth: 1680, clientHeight: 620, getRootNode: () => new EventTarget(), setPointerCapture() {}, releasePointerCapture() {} })
  const reports: number[] = []
  const manager = createSceneManager({ canvas: controls ? canvas as unknown as HTMLCanvasElement : undefined, renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {}, onZoomChange: value => reports.push(value) })
  manager.resize(1680, 620)
  const wheel = (deltaY: number) => canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY, deltaMode: 0, ctrlKey: false, clientX: 840, clientY: 310 }))
  return { manager, canvas, reports, wheel }
}
function assertCommittedVisible(manager: ReturnType<typeof setup>['manager']) {
  for (const model of manager.models.values()) model.traverseVisible(object => {
    if (!(object instanceof Mesh) || object.userData.isOutline || object.userData.pinLabel) return
    object.geometry.computeBoundingBox(); const box = object.geometry.boundingBox
    if (!box) return
    for (let i = 0; i < 8; i++) {
      const point = new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(object.matrixWorld), projected = point.project(manager.camera)
      assert.ok(Math.abs(projected.x) <= 1 + 1e-7 && Math.abs(projected.y) <= 1 + 1e-7 && projected.z >= -1 && projected.z <= 1, `committed point outside viewport ${projected.toArray()}`)
    }
  })
}

test('viewport navigation never returns a negative workplane target when fitting negative-Y committed geometry', () => {
  for (const controls of [false, true]) {
    const { manager } = setup(controls)
    try {
      manager.syncGraph({ schema_version: '1.0', circuit_id: 'negative-Y', modules: [{ id: 'A', type: 'CLOCK', position: { x: 0, y: -5, z: 0 } }], connections: [] })
      assert.equal(manager.fitCircuit(), true)
      assert.ok(manager.target().y >= 0 && manager.camera.position.y >= 0, JSON.stringify({ target: manager.target().toArray(), position: manager.camera.position.toArray(), controls }))
      assertCommittedVisible(manager)
    } finally { manager.dispose() }
  }
})

test('viewport navigation Fit and Area preserve rolled TOP axes while ordinary zoom keeps the inspection target', () => {
  const { manager } = setup()
  try {
    manager.syncGraph(fixture()); manager.setViewOrientation('TOP', false); manager.camera.rotateZ(.63)
    const heading = manager.camera.quaternion.clone()
    manager.fitCircuit(); const calibration = manager.navigationSnapshot().referenceDistance
    assert.ok(manager.camera.quaternion.equals(heading), JSON.stringify({ before: heading.toArray(), after: manager.camera.quaternion.toArray() }))
    const p = manager.project(manager.models.get('R')!.position.clone().add(new Vector3(0, 1, 0)))
    assert.equal(manager.zoomToArea(p.x - 20, p.y - 20, p.x + 20, p.y + 20), true)
    assert.ok(manager.camera.quaternion.equals(heading))
    assert.ok(Math.abs(manager.navigationSnapshot().referenceDistance - calibration) < 1e-8)
    manager.pan(25, -40); const inspectionTarget = manager.target(); manager.setZoom(50)
    assert.ok(manager.target().equals(inspectionTarget), 'zooming out retains the current inspection anchor')
    assert.ok(manager.camera.quaternion.equals(heading))
    assert.ok(manager.camera.position.y >= manager.target().y)
    manager.setZoom(100); assert.ok(manager.target().equals(inspectionTarget), '100% is also an ordinary dolly command')
    manager.fitCircuit(); assertCommittedVisible(manager)
    manager.resetView(); assertCommittedVisible(manager)
  } finally { manager.dispose() }
})

test('viewport navigation recalibration updates full precision readback without moving a manual pose', () => {
  const { manager } = setup()
  try {
    const graph = fixture(); manager.syncGraph(graph); manager.fitCircuit(); manager.setZoom(350); manager.pan(2, 3)
    const position = manager.camera.position.clone(), target = manager.target(), heading = manager.camera.quaternion.clone(), oldRevision = manager.navigationSnapshot().boundsRevision
    graph.modules.push({ id: 'OUTLIER', type: 'LED', position: { x: 20000, y: 0, z: -40000 } }); manager.syncGraph(graph)
    const state = manager.navigationSnapshot()
    assert.ok(state.boundsRevision > oldRevision); assert.ok(Number.isFinite(state.zoom) && state.zoom > 0)
    assert.ok(manager.camera.position.equals(position) && manager.target().equals(target) && manager.camera.quaternion.equals(heading))
    manager.resize(620, 1680)
    assert.ok(manager.camera.position.equals(position) && manager.target().equals(target))
    manager.setZoom(50); assert.ok(manager.target().equals(target)); manager.fitCircuit(); assertCommittedVisible(manager)
  } finally { manager.dispose() }
})

test('viewport navigation ignores transient drag/placement positions until the next committed graph snapshot', () => {
  const { manager } = setup()
  try {
    const graph = fixture(); manager.syncGraph(graph); manager.fitCircuit()
    const before = manager.navigationSnapshot(), position = manager.camera.position.clone()
    manager.previewMove('R', { x: 100000, y: 0, z: -100000 }); manager.setGhost('BREADBOARD', { x: -200000, y: 0, z: 0 })
    assert.equal(manager.navigationSnapshot().boundsRevision, before.boundsRevision)
    assert.equal(manager.navigationSnapshot().referenceDistance, before.referenceDistance)
    assert.ok(manager.camera.position.equals(position))
    manager.setGhost(null); manager.syncGraph(graph); manager.fitCircuit(); assertCommittedVisible(manager)
    graph.modules[1].position = { x: 3000, y: 0, z: -1000 }; manager.syncGraph(graph)
    assert.ok(manager.camera.position.equals(position), 'a committed bounds change recalibrates but cannot auto-fit')
    manager.fitCircuit(); assertCommittedVisible(manager)
  } finally { manager.dispose() }
})

test('viewport navigation finite commands are atomic and invalid commands cannot corrupt calibration', () => {
  const { manager, reports, wheel } = setup()
  try {
    manager.syncGraph(fixture()); manager.fitCircuit(); manager.setZoom(500)
    const position = manager.camera.position.clone(), target = manager.target(), state = manager.navigationSnapshot(), count = reports.length
    for (const invalid of [NaN, Infinity, -Infinity]) { manager.setZoom(invalid); manager.resize(invalid, 620); manager.zoomToArea(0, 0, invalid, 40); wheel(invalid) }
    assert.ok(manager.camera.position.equals(position) && manager.target().equals(target)); assert.deepEqual(manager.navigationSnapshot(), state); assert.equal(reports.length, count)
    manager.setZoom(50)
    assert.equal(reports.length, count + 1, 'one command publishes only its settled camera zoom')
    assert.ok(Math.abs(manager.zoomPercent() - 50) < 1e-8)
  } finally { manager.dispose() }
})

test('viewport navigation collision stop is stable and Fit restores all committed geometry', () => {
  const { manager, wheel } = setup()
  try {
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'surface-stop', modules: [{ id: 'PSU', type: 'POWER_SUPPLY' }], connections: [] }); manager.fitCircuit(); manager.setZoom(100000)
    const stopped = manager.camera.position.clone(), state = manager.navigationSnapshot()
    const visibleSurface = new Raycaster(stopped, manager.camera.getWorldDirection(new Vector3())).intersectObject(manager.models.get('PSU')!, true).find(hit => hit.object instanceof Mesh && !hit.object.userData.isOutline)
    assert.ok(visibleSurface && visibleSurface.distance > 1e-6, 'camera keeps a positive gap before the rendered surface')
    assert.ok(state.zoom < 100000, 'actual close-up stops at collision clearance')
    for (let i = 0; i < 20; i++) wheel(-100)
    assert.ok(manager.camera.position.distanceTo(stopped) < 1e-7); assert.ok(manager.zoomPercent() <= state.maxZoom + 1e-7)
    const inspectionTarget = manager.target(); manager.setZoom(50); assert.ok(manager.target().equals(inspectionTarget)); manager.fitCircuit(); assertCommittedVisible(manager)
  } finally { manager.dispose() }
})

test('viewport navigation ordinary zoom retains panned collision focus and explicit Fit clears it', () => {
  const { manager } = setup()
  try {
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'panned-collision', modules: [{ id: 'PSU', type: 'POWER_SUPPLY' }], connections: [] }); manager.setViewOrientation('FRONT', false); manager.fitCircuit()
    const overview = manager.target()
    manager.setZoom(50); manager.pan(0, -5); manager.setZoom(500)
    const stopped = manager.navigationSnapshot()
    assert.ok(stopped.maxZoom < 100, `fixture must collide before overview distance around its panned focal target: ${JSON.stringify(stopped)}`)
    const inspectionTarget = manager.target()
    manager.setZoom(100)
    assert.ok(manager.target().equals(inspectionTarget), '100% cannot change the active inspection focal point')
    manager.setZoom(50); assert.ok(manager.target().equals(inspectionTarget), 'minimum zoom cannot change the active inspection focal point')
    manager.fitCircuit(); assert.ok(Math.abs(manager.zoomPercent() - 100) < 1e-7)
    assert.ok(manager.target().distanceTo(overview) < 1e-7)
    assertCommittedVisible(manager)
  } finally { manager.dispose() }
})

test('viewport controller ordinary commands preserve target and enforce the real fifty-to-one-thousand distance range', () => {
  const camera = new PerspectiveCamera(42, 2, .005, 150); camera.position.set(0, 11, 10); camera.lookAt(0, 0, 0)
  const body = new Mesh(new BoxGeometry(4, 3, 2), new MeshBasicMaterial()); body.position.y = 1.5
  const snapshot = createFramingBounds(() => [body]).snapshot(camera), target = new Vector3(100, 0, 0), navigation = createViewportNavigation(camera, () => target, () => snapshot)
  const overview = navigation.overview(), inspectionTarget = target.clone()
  navigation.commitOverview(overview)
  assert.ok(navigation.snapshot().maxZoom <= 1000)
  for (const requested of [50, 100, 75, 900, 1e9, -1]) {
    const pose = navigation.zoomPose(requested)!
    assert.ok(pose.target.equals(inspectionTarget), `target changed at requested zoom ${requested}`)
    assert.ok(pose.distance >= overview.distance / 10 - 1e-9 && pose.distance <= overview.distance * 2 + 1e-9, `actual distance outside allowed range at ${requested}: ${pose.distance}`)
    camera.position.copy(pose.position)
  }
})

test('viewport navigation repeated wheel and toolbar zoom preserve calibration and active target after a pan', () => {
  const { manager, wheel } = setup()
  try {
    manager.syncGraph(fixture()); manager.fitCircuit(); manager.pan(200, 100)
    const target = manager.target(), reference = manager.navigationSnapshot().referenceDistance
    for (let cycle = 0; cycle < 4; cycle++) {
      for (const requested of [50, 100, 200, 500, 1000, 150, 75]) {
        manager.setZoom(requested)
        assert.ok(manager.target().equals(target), `active target changed at ${requested}`)
        assert.ok(Math.abs(manager.navigationSnapshot().referenceDistance - reference) < 1e-9)
        assert.ok(manager.zoomPercent() <= 1000 + 1e-7 && manager.zoomPercent() >= 50 - 1e-7)
      }
      for (const delta of [-100, -100, 100, 100]) {
        wheel(delta); assert.ok(manager.target().equals(target)); assert.ok(Math.abs(manager.navigationSnapshot().referenceDistance - reference) < 1e-9)
      }
    }
    manager.fitCircuit(); assertCommittedVisible(manager)
  } finally { manager.dispose() }
})
