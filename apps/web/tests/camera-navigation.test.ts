import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Quaternion, Vector3 } from 'three'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useCircuitStore } from '../src/stores/circuit'
import { loadSfc, mountSfc } from './helpers/vueSfc'
import { createSceneManager } from '../src/three/SceneManager'
import { buildCubeGeometry, projectCube, ORIENTATION_DIRECTIONS } from '../src/components/workbench/viewCubeMath'

function setup(onZoomChange?: (percent: number) => void) {
  const canvas = Object.assign(new EventTarget(), {
    style: { touchAction: '' }, clientWidth: 1000, clientHeight: 700,
    getRootNode: () => new EventTarget(), setPointerCapture() {}, releasePointerCapture() {},
  })
  const options = { canvas: canvas as unknown as HTMLCanvasElement,
    renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {}, onZoomChange }
  const manager = createSceneManager(options)
  manager.resize(1000, 700)
  const wheel = (deltaY: number) => canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY, deltaMode: 0, ctrlKey: false, clientX: 500, clientY: 350 }))
  return { manager, wheel, canvas }
}

test('initial placement yaw faces the camera for cardinal and ViewCube corner views after panning', () => {
  const { manager } = setup()
  try {
    const facing = Reflect.get(manager, 'placementFacingYaw') as () => number
    assert.equal(typeof facing, 'function', 'SceneManager must provide the initial placement heading')
    manager.pan(5, -3)
    for (const [view, expected] of [
      ['FRONT', 0], ['RIGHT', 90], ['BACK', 180], ['LEFT', 270],
      ['TOP-FRONT-RIGHT', 45], ['TOP-BACK-RIGHT', 135],
      ['TOP-BACK-LEFT', 225], ['TOP-FRONT-LEFT', 315],
    ] as const) {
      manager.setViewOrientation(view, false)
      assert.ok(Math.abs(facing() - expected) < 1e-8, view)
    }
  } finally { manager.dispose() }
})

test('TOP initial placement yaw uses screen-down heading and ignores near-pole azimuth noise', () => {
  const { manager } = setup()
  try {
    const facing = Reflect.get(manager, 'placementFacingYaw') as () => number
    assert.equal(typeof facing, 'function')
    manager.setViewOrientation('TOP', false)
    assert.equal(facing(), 0, 'the existing TOP screen-down points toward world +Z')
    manager.camera.rotateZ(Math.PI / 2)
    assert.ok(Math.abs(facing() - 90) < 1e-8, 'a rolled TOP view follows screen-down toward +X')
    const origin = manager.target(), radius = manager.camera.position.distanceTo(origin)
    for (const [x, z] of [[1e-10, -1e-10], [-1e-10, 1e-10], [0, 0]]) {
      manager.camera.position.copy(origin).add(new Vector3(x * radius, radius, z * radius))
      const yaw = facing()
      assert.ok(Number.isFinite(yaw) && yaw >= 0 && yaw < 360)
      assert.ok(Math.abs(yaw - 90) < 1e-8, 'tiny XZ changes cannot flip the near-TOP draft')
    }
  } finally { manager.dispose() }
})

test('unchanged viewport sizes do not reset the drawing buffer or camera projection', () => {
  let sizes = 0, projections = 0, renders = 0, id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const manager = createSceneManager({ renderer: { setSize() { sizes++ }, render() { renders++ }, dispose() {} }, requestFrame(callback) { frames.set(++id, callback); return id }, cancelFrame(frame) { frames.delete(frame) } })
  const original = manager.camera.updateProjectionMatrix.bind(manager.camera)
  manager.camera.updateProjectionMatrix = () => { projections++; original() }
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
  try {
    manager.resize(900.5, 500.25); flush()
    for (let i = 0; i < 20; i++) manager.resize(900.5, 500.25)
    flush()
    assert.equal(sizes, 1, 'duplicate notifications must not reset WebGL drawing buffers')
    assert.equal(projections, 1); assert.equal(renders, 1)
    manager.resize(0, 0); manager.resize(0, 0); flush()
    assert.equal(sizes, 1, 'hidden canvases do not allocate a zero drawing buffer')
    manager.resize(900.5, 500.25); flush()
    assert.equal(sizes, 1, 'restoring the previous buffer size only requests a redraw')
    assert.equal(projections, 1); assert.equal(renders, 2)
    manager.resize(901.5, 500.25); flush()
    assert.equal(sizes, 2); assert.equal(projections, 2); assert.equal(renders, 3)
  } finally { manager.dispose() }
})

test('gizmo obstacles prepared before rendering do not schedule a redundant second frame', () => {
  let id = 0, renders = 0, prepared = 0
  const frames = new Map<number, FrameRequestCallback>()
  const manager = createSceneManager({
    renderer: { setSize() {}, render() { renders++ }, dispose() {} },
    requestFrame(callback) { frames.set(++id, callback); return id }, cancelFrame(id) { frames.delete(id) },
    onBeforeRender() { prepared++; manager.setGizmoObstacles([{ left: prepared, top: 20, right: 150, bottom: 180 }]) },
  })
  try {
    manager.resize(1000, 700)
    const first = [...frames.values()]; frames.clear(); first.forEach(callback => callback(0))
    assert.equal(prepared, 1); assert.equal(renders, 1); assert.equal(frames.size, 0)
    for (let i = 0; i < 20; i++) manager.requestRender()
    assert.equal(frames.size, 1)
    const next = [...frames.values()]; frames.clear(); next.forEach(callback => callback(0))
    assert.equal(prepared, 2); assert.equal(renders, 2); assert.equal(frames.size, 0)
    manager.requestRender(); manager.dispose(); assert.equal(frames.size, 0)
  } finally { manager.dispose() }
})

test('drawing buffer allocation and its redraw happen in the same frame, including resume', () => {
  let id = 0
  const calls: string[] = [], frames = new Map<number, FrameRequestCallback>()
  const manager = createSceneManager({
    renderer: { setSize(w, h) { calls.push(`size ${w} ${h}`) }, render() { calls.push('draw') }, dispose() {} },
    requestFrame(callback) { frames.set(++id, callback); return id }, cancelFrame(frame) { frames.delete(frame) },
  })
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(0)) }
  try {
    manager.resize(900, 500)
    assert.deepEqual(calls, [], 'do not clear the visible drawing buffer before its redraw frame')
    flush(); assert.deepEqual(calls, ['size 900 500', 'draw'])
    calls.length = 0
    manager.resize(700, 400); manager.resize(900, 500)
    flush(); assert.deepEqual(calls, ['draw'], 'returning to the drawn size needs no buffer allocation')
    calls.length = 0
    manager.resize(950, 550); manager.suspend(true); flush()
    assert.deepEqual(calls, [], 'a suspended scene keeps its last drawn buffer')
    manager.suspend(false); assert.deepEqual(calls, [])
    flush(); assert.deepEqual(calls, ['size 950 550', 'draw'])
    calls.length = 0
    manager.resize(1000, 600); manager.resize(0, 0); flush()
    assert.deepEqual(calls, [])
    manager.resize(1000, 600); flush(); assert.deepEqual(calls, ['size 1000 600', 'draw'])
  } finally { manager.dispose() }
})

test('actual viewport resizing preserves camera pose, magnification, models and connections', () => {
  const { manager } = setup()
  try {
    const graph = { schema_version: '1.0' as const, circuit_id: 'panels', modules: [{ id: 'A', type: 'CLOCK', position: { x: 0, y: 0, z: 0 } }, { id: 'B', type: 'LED', position: { x: 4, y: 0, z: 2 } }], connections: [{ source: 'A.OUT', destination: 'B.IN' }] }
    manager.syncGraph(graph); manager.pan(1, 2); manager.orbit(30); manager.setZoom(137.5)
    const snapshot = JSON.stringify(graph), position = manager.camera.position.clone(), heading = manager.camera.quaternion.clone(), zoom = manager.zoomPercent()
    const poses = [...manager.models.values()].map((model) => model.matrixWorld.clone())
    for (const [width, height] of [[900, 380], [1000, 700], [480, 600], [320, 150]]) {
      manager.resize(width, height)
      assert.ok(manager.camera.position.equals(position))
      assert.ok(manager.camera.quaternion.equals(heading))
      assert.ok(Math.abs(manager.zoomPercent() - zoom) < 1e-9)
      assert.equal(manager.camera.aspect, width / height)
      assert.equal(JSON.stringify(graph), snapshot)
      assert.ok([...manager.models.values()].every((model, index) => model.matrixWorld.equals(poses[index])))
    }
  } finally { manager.dispose() }
})

test('wheel and toolbar use target-relative dolly with one reported zoom and reversible limits', () => {
  const reports: number[] = [], { manager, wheel } = setup((value) => reports.push(value))
  try {
    const initial = manager.camera.position.clone(), distance = initial.length()
    manager.setZoom(150)
    assert.ok(Math.abs(manager.camera.position.length() - distance / 1.5) < 1e-6)
    assert.equal(manager.camera.zoom, 1, 'keep one perspective projection through all navigation')
    assert.equal(reports.at(-1), 150)
    wheel(-100)
    assert.ok(reports.at(-1)! > 150, 'wheel changes must be visible to the toolbar')
    for (let i = 0; i < 50; i++) wheel(-100)
    assert.ok(Math.abs(manager.camera.position.length() - distance / 10) < 1e-6)
    for (let i = 0; i < 60; i++) wheel(100)
    assert.ok(Math.abs(manager.camera.position.length() - distance * 2) < 1e-6)
    manager.setZoom(100)
    assert.ok(manager.camera.position.distanceTo(initial) < 1e-6)
    manager.pan(2, 3); manager.orbit(75)
    const before = manager.camera.position.clone(), heading = manager.camera.quaternion.clone()
    manager.setZoom(200); manager.setZoom(100)
    assert.ok(manager.camera.position.distanceTo(before) < 1e-6)
    assert.ok(manager.camera.quaternion.angleTo(heading) < 1e-6)
  } finally { manager.dispose() }
})

test('toolbar and wheel reach 1000 percent with a close near plane and preserve model world poses', () => {
  const { manager, wheel } = setup()
  try {
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'close', modules: [{ id: 'BB', type: 'BREADBOARD' }], connections: [] })
    manager.setViewOrientation('TOP', false)
    const model = manager.models.get('BB')!, pose = model.matrixWorld.clone(), reference = manager.camera.position.distanceTo(manager.target())
    manager.setZoom(1000)
    assert.ok(Math.abs(manager.zoomPercent() - 1000) < 1e-6)
    assert.ok(Math.abs(manager.camera.position.distanceTo(manager.target()) - reference / 10) < 1e-6)
    assert.ok(manager.camera.near <= .01)
    const p = manager.project(manager.endpointPosition('BB.contact:terminal:A:32')!)
    assert.equal(manager.pickEndpoint(p.x, p.y)?.endpoint, 'BB.contact:terminal:A:32')
    manager.setZoom(100)
    for (let i = 0; i < 80; i++) wheel(-100)
    assert.ok(Math.abs(manager.zoomPercent() - 1000) < 1e-6)
    assert.ok(model.matrixWorld.equals(pose)); assert.equal(model.scale.x, 1)
    assert.ok(manager.camera.position.toArray().every(Number.isFinite))
  } finally { manager.dispose() }
})

test('surface-plane panGrab keeps an elevated grabbed point under the pointer without changing zoom or heading', () => {
  const { manager } = setup()
  try {
    manager.setViewOrientation('TOP-FRONT', false); manager.setZoom(500)
    const anchor = new Vector3(0, .8, 0), camera = manager.camera.position.clone(), target = manager.target(), heading = manager.camera.quaternion.clone(), zoom = manager.zoomPercent()
    const screen = manager.project(anchor), x = screen.x + 40, y = screen.y + 20
    manager.panGrab(anchor, x, y)
    const moved = manager.project(anchor)
    assert.ok(Math.hypot(moved.x - x, moved.y - y) < 1e-6)
    assert.ok(manager.camera.position.clone().sub(camera).distanceTo(manager.target().sub(target)) < 1e-6)
    assert.ok(manager.camera.quaternion.angleTo(heading) < 1e-6)
    assert.ok(Math.abs(manager.zoomPercent() - zoom) < 1e-6)
  } finally { manager.dispose() }
})

test('close dolly stops before tall model surfaces for toolbar and native wheel, and zoom-out stays reversible', () => {
  const { manager, wheel } = setup()
  try {
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'collision', modules: [{ id: 'PS', type: 'POWER_SUPPLY' }], connections: [] })
    const initial = manager.camera.position.clone()
    manager.setZoom(1000)
    assert.ok(manager.camera.position.z > 1.6, 'camera must stay outside the power supply front face')
    const stopped = manager.camera.position.clone(), zoom = manager.zoomPercent()
    for (let i = 0; i < 30; i++) wheel(-100)
    assert.ok(manager.camera.position.distanceTo(stopped) < 1e-6, 'repeated zoom must not tunnel or jitter at a surface')
    assert.ok(Math.abs(manager.zoomPercent() - zoom) < 1e-6)
    wheel(100); assert.ok(manager.camera.position.z > stopped.z)
    manager.setZoom(100); assert.ok(manager.camera.position.distanceTo(initial) < 1e-6)
  } finally { manager.dispose() }
})

test('native right orbit is paused only during wire drawing while wheel dolly stays enabled', () => {
  const { manager, wheel, canvas } = setup()
  const event = (type: string, x: number, y: number) => canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, pointerType: 'mouse', button: 2, clientX: x, clientY: y, ctrlKey: false, metaKey: false, shiftKey: false }))
  const drag = () => { event('pointerdown', 500, 350); event('pointermove', 550, 370); event('pointerup', 550, 370) }
  try {
    const initial = manager.camera.quaternion.clone(); drag()
    assert.ok(manager.camera.quaternion.angleTo(initial) > .01)
    manager.setWireDrawingActive(true)
    const draftHeading = manager.camera.quaternion.clone(), zoom = manager.zoomPercent()
    drag(); assert.ok(manager.camera.quaternion.angleTo(draftHeading) < 1e-6)
    wheel(-100); assert.ok(manager.zoomPercent() > zoom)
    manager.setWireDrawingActive(false); drag()
    assert.ok(manager.camera.quaternion.angleTo(draftHeading) > .01)
  } finally { manager.dispose() }
})

test('Zoom To Area focuses the actual wire surface and close dolly cannot enter its tube', () => {
  const { manager, wheel } = setup()
  try {
    const wire = { source: 'BB.contact:terminal:A:30', destination: 'BB.contact:terminal:J:34', metadata: { wireVisual: { version: 1, color: '#d8493f', routeMode: 'AUTO', thickness: .052, height: .04, controlPoints: [] } } }
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'wire-inspection', modules: [{ id: 'BB', type: 'BREADBOARD' }], connections: [wire] })
    manager.setViewOrientation('TOP', false)
    const p = manager.project(new Vector3(.26, .37, 0))
    assert.equal(manager.pick(p.x, p.y)?.kind, 'wire')
    assert.equal(manager.zoomToArea(p.x - 6, p.y - 6, p.x + 6, p.y + 6), true)
    assert.ok(manager.target().y >= .394, 'camera focus uses the tube surface, not its electrical/route centerline')
    assert.ok(Math.abs(manager.zoomPercent() - 100) < 1e-6)
    manager.setZoom(1000)
    for (let i = 0; i < 30; i++) wheel(-100)
    assert.ok(manager.camera.position.y > .396, 'camera remains outside the .026-radius tube')
    assert.ok(Math.abs(manager.zoomPercent() - 1000) < 1e-6)
    assert.equal(manager.pick(500, 350)?.kind, 'wire', JSON.stringify({ camera: manager.camera.position.toArray(), target: manager.target().toArray(), route: manager.wireRoute(wire)?.points, projected: manager.project(new Vector3(.26, .37, 0)) }))
    manager.highlight(null, wire)
    assert.equal(manager.pickWireEdit(500, 350, wire)?.kind, 'segment', 'the visible tube remains editable away from its narrow centerline')
    for (let i = 0; i < 3; i++) {
      assert.equal(manager.zoomToArea(494, 344, 506, 356), true)
      assert.ok(Math.abs(manager.zoomPercent() - 100) < 1e-6, 'each area sets an accurate new reference')
      manager.setZoom(1000)
      assert.ok(Math.abs(manager.zoomPercent() - 1000) < 1e-6, 'close references remain compatible with the shared zoom range')
      assert.equal(manager.pick(500, 350)?.kind, 'wire')
    }
  } finally { manager.dispose() }
})

test('navigation and viewport aspect preserve uniform model and gizmo scale and pixel proportions', () => {
  const { manager, wheel } = setup()
  try {
    const graph = { schema_version: '1.0' as const, circuit_id: 'nav', modules: [{ id: 'A', type: 'CLOCK' }], connections: [] }
    const snapshot = JSON.stringify(graph)
    manager.syncGraph(graph); manager.highlight('A')
    const model = manager.models.get('A')!, pose = model.matrixWorld.clone()
    const squareRatio = () => {
      manager.camera.updateMatrixWorld()
      const center = manager.camera.position.clone().addScaledVector(manager.camera.getWorldDirection(new Vector3()), 10)
      const right = new Vector3(1, 0, 0).applyQuaternion(manager.camera.quaternion)
      const up = new Vector3(0, 1, 0).applyQuaternion(manager.camera.quaternion)
      const a = manager.project(center), b = manager.project(center.clone().add(right)), c = manager.project(center.clone().add(up))
      return Math.hypot(b.x - a.x, b.y - a.y) / Math.hypot(c.x - a.x, c.y - a.y)
    }
    for (const [w, h] of [[1000, 700], [480, 900], [1700, 400]]) {
      manager.resize(w, h); manager.pan(1, -0.5); manager.orbit(20); manager.setZoom(125); wheel(-30)
      assert.ok(Math.abs(squareRatio() - 1) < 1e-6, 'a camera-facing square must remain square in CSS pixels')
      assert.deepEqual(model.scale.toArray(), [1, 1, 1])
      model.updateWorldMatrix(true, true); assert.ok(model.matrixWorld.equals(pose))
      manager.gizmoOrigin()
      const scale = manager.scene.getObjectByName('component-transform-gizmo')!.scale
      assert.equal(scale.x, scale.y); assert.equal(scale.y, scale.z)
    }
    assert.equal(JSON.stringify(graph), snapshot)
    manager.fitCircuit(); assert.equal(manager.camera.zoom, 1)
  } finally { manager.dispose() }
})

test('non-finite zoom, resize, move and pointer inputs leave the valid scene usable', () => {
  const { manager } = setup()
  try {
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'invalid', modules: [{ id: 'A', type: 'CLOCK' }], connections: [] })
    const camera = manager.camera.position.clone(), projection = manager.camera.projectionMatrix.clone(), model = manager.models.get('A')!
    manager.setZoom(NaN); manager.setZoom(Infinity); manager.resize(Infinity, 700); manager.resize(1000, NaN)
    manager.previewMove('A', { x: NaN, y: 0, z: Infinity }); manager.panGrab(new Vector3(), NaN, Infinity)
    assert.ok(manager.camera.position.equals(camera)); assert.ok(manager.camera.projectionMatrix.equals(projection))
    assert.deepEqual(model.position.toArray(), [0, 0, 0])
    assert.equal(manager.groundPoint(NaN, 1), null)
    assert.equal(manager.pick(Infinity, 1), null)
    manager.resize(1000, 700); assert.ok(manager.groundPoint(500, 350))
  } finally { manager.dispose() }
})

test('pan near the ground horizon rejects remote intersections instead of throwing the view away', () => {
  const { manager } = setup()
  try {
    manager.camera.position.set(0, 1, 20); manager.camera.lookAt(0, 0, 0)
    const anchor = manager.groundPoint(500, 500)!, before = manager.camera.position.clone()
    assert.ok(anchor, 'start the grab on the visible foreground')
    const horizon = manager.project(new Vector3(0, 0, -1e9))
    manager.panGrab(anchor, horizon.x, horizon.y + 0.001)
    assert.ok(manager.camera.position.distanceTo(before) < 1e-6, 'an almost parallel ray cannot cause a huge jump')
    manager.panGrab(anchor, 510, 500)
    assert.ok(manager.camera.position.distanceTo(before) > 0.01, 'ordinary grab still pans')
  } finally { manager.dispose() }
})

test('captured orbit, unlock and resume cannot poison a temporarily zero-height viewport', () => {
  const { manager, canvas, wheel } = setup()
  const pointer = (type: string, x: number, y: number) => canvas.dispatchEvent(Object.assign(new Event(type), { button: 2, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }))
  try {
    const initial = manager.camera.position.clone()
    pointer('pointerdown', 500, 350)
    canvas.clientHeight = 0; manager.resize(1000, 0)
    manager.lockPointer(false); manager.suspend(false)
    pointer('pointermove', 600, 450); pointer('pointerup', 600, 450); wheel(-100)
    assert.ok(manager.camera.position.equals(initial), 'hidden viewport must ignore camera input, including after unlock/resume')
    assert.ok(manager.camera.quaternion.toArray().every(Number.isFinite))
    canvas.clientHeight = 700; manager.resize(1000, 700)
    pointer('pointerdown', 500, 350); pointer('pointermove', 600, 450); pointer('pointerup', 600, 450)
    assert.ok(manager.camera.position.distanceTo(initial) > 0.1, 'camera input recovers with the viewport')
    assert.ok(manager.camera.position.toArray().every(Number.isFinite))
  } finally { manager.dispose() }
})

test('area zoom centers an off-axis rectangle, preserves heading and fits both screen dimensions', () => {
  const { manager, wheel } = setup()
  const areaManager = manager
  try {
    assert.equal(typeof areaManager.zoomToArea, 'function', 'SceneManager must provide area framing')
    manager.pan(2, 1); manager.orbit(65)
    const heading = manager.camera.quaternion.clone(), fov = manager.camera.fov
    const forward = manager.camera.getWorldDirection(new Vector3()), distance = Math.hypot(11, 10)
    const viewPlane = manager.camera.position.clone().addScaledVector(forward, distance)
    const right = new Vector3(1, 0, 0).applyQuaternion(heading), up = new Vector3(0, 1, 0).applyQuaternion(heading)
    const halfHeight = distance * Math.tan(fov * Math.PI / 360)
    // Rectangle (600, 175)..(850, 525) has center (725, 350), height half the viewport.
    const center = viewPlane.clone().addScaledVector(right, halfHeight * 1000 / 700 * 0.45)
    const corner = center.clone().addScaledVector(right, halfHeight * 1000 / 700 * 0.25).addScaledVector(up, halfHeight * 0.5)
    assert.equal(areaManager.zoomToArea(850, 525, 600, 175), true, 'reverse dragging selects the same area')
    const projectedCenter = manager.project(center), projectedCorner = manager.project(corner)
    assert.ok(Math.abs(projectedCenter.x - 500) < 1e-6 && Math.abs(projectedCenter.y - 350) < 1e-6)
    assert.ok(projectedCorner.x > 500 && projectedCorner.x <= 750 + 1e-6 && projectedCorner.y >= -1e-6 && projectedCorner.y < 350, 'both dimensions fit without clipping')
    assert.ok(Math.abs((projectedCorner.x - 500) / (350 - projectedCorner.y) - 5 / 7) < 1e-6, 'perspective aspect remains uniform')
    assert.ok(manager.camera.quaternion.angleTo(heading) < 1e-6)
    assert.equal(manager.camera.fov, fov); assert.equal(manager.camera.zoom, 1)
    assert.ok(Math.abs(manager.zoomPercent() - 100) < 1e-6, 'a framed area becomes the new 100% reference, like Fit')
    const framed = manager.camera.position.clone()
    manager.setZoom(150); wheel(-30); manager.setZoom(100)
    assert.ok(manager.camera.position.distanceTo(framed) < 1e-6, 'toolbar and wheel remain reversible after framing')
  } finally { manager.dispose() }
})

test('area zoom clamps screen bounds and rejects tiny, invalid or inactive selections without moving the view', () => {
  const { manager } = setup()
  const areaManager = manager
  try {
    assert.equal(typeof areaManager.zoomToArea, 'function')
    const initial = manager.camera.position.clone(), heading = manager.camera.quaternion.clone()
    for (const rect of [[100, 100, 100, 400], [100, 100, 105, 110], [NaN, 0, 300, 300], [0, Infinity, 300, 300], [-100, 0, -20, 700]]) {
      assert.equal(areaManager.zoomToArea(...rect as [number, number, number, number]), false)
      assert.ok(manager.camera.position.equals(initial)); assert.ok(manager.camera.quaternion.equals(heading))
    }
    manager.suspend(true); assert.equal(areaManager.zoomToArea(100, 100, 500, 500), false)
    manager.suspend(false); manager.resize(0, 0); assert.equal(areaManager.zoomToArea(100, 100, 500, 500), false)
    manager.resize(480, 900)
    assert.equal(areaManager.zoomToArea(-100, -100, 1000, 1000), true, 'clamped full viewport keeps the original frame')
    assert.ok(manager.camera.position.distanceTo(initial) < 1e-6)
    manager.dispose(); assert.equal(areaManager.zoomToArea(0, 0, 480, 900), false)
  } finally { manager.dispose() }
})

test('area zoom focuses the selected foreground depth instead of passing through it', () => {
  const { manager } = setup()
  try {
    const ground = manager.groundPoint(500, 550)!, heading = manager.camera.quaternion.clone()
    assert.equal(manager.zoomToArea(450, 500, 550, 600), true)
    const centered = manager.project(ground)
    assert.ok(Math.abs(centered.x - 500) < 1e-6 && Math.abs(centered.y - 350) < 1e-6, 'selected foreground must remain at screen center')
    assert.ok(centered.visible); assert.ok(manager.camera.position.y > 0)
    assert.ok(manager.camera.quaternion.angleTo(heading) < 1e-6)
    manager.resetView()
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'area', modules: [{ id: 'A', type: 'CLOCK', position: { x: 0, y: 2, z: 3 } }], connections: [] })
    const screen = manager.project(new Vector3(0, 2.1, 3)), picked = manager.pick(screen.x, screen.y)!
    assert.equal(picked.kind, 'module')
    assert.equal(manager.zoomToArea(screen.x - 50, screen.y - 50, screen.x + 50, screen.y + 50), true)
    const focused = manager.project(picked.point)
    assert.ok(Math.abs(focused.x - 500) < 1e-6 && Math.abs(focused.y - 350) < 1e-6, 'elevated components supply their own focus depth')
    manager.resetView(); manager.camera.position.set(0, 1, 20); manager.camera.lookAt(0, 0, 0)
    assert.equal(manager.groundPoint(800, 100), null)
    assert.equal(manager.zoomToArea(700, 50, 900, 150), true, 'above-horizon empty space retains a finite fallback')
    assert.ok(manager.camera.position.toArray().every(Number.isFinite))
  } finally { manager.dispose() }
})

test('area framing contains the nearer rectangle edges at default and near-horizontal angles', () => {
  for (const lowAngle of [false, true]) {
    const { manager } = setup()
    try {
      if (lowAngle) { manager.camera.position.set(0, 1, 20); manager.camera.lookAt(0, 0, 0) }
      const top = lowAngle ? 400 : 500
      const samples = [[450, top], [550, top], [450, 600], [550, 600], [500, 590]].map(([x, y]) => manager.groundPoint(x, y)!)
      assert.ok(samples.every(Boolean))
      assert.equal(manager.zoomToArea(450, top, 550, 600), true)
      for (const point of samples) {
        const screen = manager.project(point)
        assert.ok(screen.x >= 0 && screen.x <= 1000 && screen.y >= 0 && screen.y <= 700, `selected surface point was clipped at (${screen.x},${screen.y})`)
      }
    } finally { manager.dispose() }
  }
})

test('ViewCube face mapping sets position and viewing direction independently of prior roll', () => {
  const { manager } = setup()
  try {
    const faces = [
      { name: 'TOP', expected: new Vector3(0, 1, 0) },
      { name: 'FRONT', expected: new Vector3(0, 0, 1) },
      { name: 'BACK', expected: new Vector3(0, 0, -1) },
      { name: 'LEFT', expected: new Vector3(-1, 0, 0) },
      { name: 'RIGHT', expected: new Vector3(1, 0, 0) },
    ]
    manager.pan(3, -2)
    const target = manager.target(), distance = manager.camera.position.distanceTo(target)
    for (const { name, expected } of faces) {
      manager.orbit(137, -37)
      manager.camera.up.set(1, 0, 0)
      manager.camera.rotateZ(0.8)
      manager.setViewOrientation(name, false)
      const dir = manager.cameraDirection()
      assert.ok(dir.distanceTo(expected) < 1e-9, `Face ${name} direction mismatch: ${dir.toArray()}`)
      assert.ok(manager.camera.position.distanceTo(target.clone().addScaledVector(expected, distance)) < 1e-8)
      assert.ok(manager.camera.getWorldDirection(new Vector3()).distanceTo(expected.clone().negate()) < 1e-9)
      assert.ok(manager.target().distanceTo(target) < 1e-9)
      assert.deepEqual(manager.camera.up.toArray(), [0, 1, 0], 'OrbitControls must retain the world Y orbit axis')
      if (name !== 'TOP') {
        assert.ok(new Vector3(0, 1, 0).applyQuaternion(manager.camera.quaternion).distanceTo(new Vector3(0, 1, 0)) < 1e-9)
      }
    }
  } finally { manager.dispose() }
})

test('ViewCube supports the four upper edge bisectors', () => {
  const { manager } = setup()
  try {
    const edges: [string, Vector3][] = [
      ['TOP-FRONT', new Vector3(0, 1, 1).normalize()],
      ['TOP-BACK', new Vector3(0, 1, -1).normalize()],
      ['TOP-LEFT', new Vector3(-1, 1, 0).normalize()],
      ['TOP-RIGHT', new Vector3(1, 1, 0).normalize()],
    ]
    for (const [edge, expected] of edges) {
      manager.setViewOrientation(edge, false)
      const dir = manager.cameraDirection()
      assert.ok(dir.distanceTo(expected) < 1e-9, `Edge ${edge} direction mismatch: ${dir.toArray()}`)
    }
  } finally { manager.dispose() }
})

test('ViewCube supports the four upper corner trisectors', () => {
  const { manager } = setup()
  try {
    const corners: [string, Vector3][] = [
      ['TOP-FRONT-LEFT', new Vector3(-1, 1, 1).normalize()],
      ['TOP-FRONT-RIGHT', new Vector3(1, 1, 1).normalize()],
      ['TOP-BACK-LEFT', new Vector3(-1, 1, -1).normalize()],
      ['TOP-BACK-RIGHT', new Vector3(1, 1, -1).normalize()],
    ]
    for (const [corner, expected] of corners) {
      manager.setViewOrientation(corner, false)
      const dir = manager.cameraDirection()
      assert.ok(dir.distanceTo(expected) < 1e-9, `Corner ${corner} direction mismatch: ${dir.toArray()}`)
    }
  } finally { manager.dispose() }
})

test('TOP has exact North-up and East-right screen axes after any previous view or roll', () => {
  for (const withControls of [false, true]) {
    const manager = withControls ? setup().manager : createSceneManager({
      renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {},
    })
    try {
      manager.resize(1000, 700); manager.pan(2, 3)
      for (const previous of ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP-BACK-LEFT']) {
        manager.setViewOrientation(previous, false)
        manager.camera.up.set(0, 0, 1); manager.camera.rotateZ(1.1)
        manager.setViewOrientation('TOP', false)
        const target = manager.target(), center = manager.project(target)
        const north = manager.project(target.clone().add(new Vector3(0, 0, -1)))
        const east = manager.project(target.clone().add(new Vector3(1, 0, 0)))
        assert.ok(Math.abs(north.x - center.x) < 1e-8 && north.y < center.y)
        assert.ok(Math.abs(east.y - center.y) < 1e-8 && east.x > center.x)
        assert.ok(new Vector3(0, 1, 0).applyQuaternion(manager.camera.quaternion).distanceTo(new Vector3(0, 0, -1)) < 1e-9)
        assert.ok(new Vector3(1, 0, 0).applyQuaternion(manager.camera.quaternion).distanceTo(new Vector3(1, 0, 0)) < 1e-9)
      }
    } finally { manager.dispose() }
  }
})

test('bottom presets, horizontal diagonal presets and below-board vectors cannot orient the camera', () => {
  const { manager } = setup()
  const removed = ['BOTTOM', 'BOTTOM-FRONT', 'BOTTOM-BACK', 'BOTTOM-LEFT', 'BOTTOM-RIGHT',
    'BOTTOM-FRONT-LEFT', 'BOTTOM-FRONT-RIGHT', 'BOTTOM-BACK-LEFT', 'BOTTOM-BACK-RIGHT',
    'FRONT-LEFT', 'FRONT-RIGHT', 'BACK-LEFT', 'BACK-RIGHT']
  try {
    const position = manager.camera.position.clone(), quaternion = manager.camera.quaternion.clone()
    for (const direction of [...removed, 'bottom', new Vector3(1, -0.1, 1), new Vector3(0, -1, 0)]) {
      manager.setViewOrientation(direction, false)
      assert.ok(manager.camera.position.equals(position), String(direction))
      assert.ok(manager.camera.quaternion.equals(quaternion))
      assert.equal(manager.isTransitioning(), false)
    }
    for (const direction of removed) assert.equal(Object.hasOwn(ORIENTATION_DIRECTIONS, direction), false)
    assert.ok(buildCubeGeometry().every(region => !region.id.includes('BOTTOM')))
  } finally { manager.dispose() }
})

test('custom orbit clamps to the upper hemisphere and preserves target and radius with or without controls', () => {
  for (const withControls of [false, true]) {
    const manager = withControls ? setup().manager : createSceneManager({
      renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {},
    })
    try {
      manager.resize(1000, 700); manager.pan(3, -2)
      const target = manager.target(), radius = manager.camera.position.distanceTo(target)
      for (const view of ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'TOP-BACK-RIGHT']) {
        manager.setViewOrientation(view, false)
        for (const pitch of [100, 170, -200, 721, -1081]) {
          manager.orbit(47, pitch)
          assert.ok(manager.camera.position.y >= 0 && manager.cameraDirection().y >= 0, `${view} pitch ${pitch}`)
          assert.ok(manager.target().distanceTo(target) < 1e-9)
          assert.ok(Math.abs(manager.camera.position.distanceTo(target) - radius) < 1e-8)
          assert.ok(manager.camera.quaternion.toArray().every(Number.isFinite))
        }
      }
    } finally { manager.dispose() }
  }
})

test('OrbitControls right-drag cannot cross below the board and TOP middle-pan stays on XZ', () => {
  const { manager, canvas } = setup()
  const pointer = (type: string, button: number, x: number, y: number) => canvas.dispatchEvent(Object.assign(new Event(type),
    { button, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }))
  try {
    for (const view of ['TOP', 'FRONT', 'BACK', 'LEFT', 'RIGHT']) {
      manager.setViewOrientation(view, false)
      pointer('pointerdown', 2, 500, 350)
      for (const y of [-1000, -3000, 5000, -5000]) {
        pointer('pointermove', 2, 700, y)
        assert.ok(manager.camera.position.y >= 0 && manager.cameraDirection().y >= 0, view)
      }
      pointer('pointerup', 2, 700, -5000)
    }
    manager.setViewOrientation('TOP', false)
    const target = manager.target()
    pointer('pointerdown', 1, 500, 350); pointer('pointermove', 1, 580, 440); pointer('pointerup', 1, 580, 440)
    assert.equal(manager.target().y, target.y)
    assert.ok(manager.target().distanceTo(target) > 0.1)
    assert.ok(manager.camera.position.y >= 0)
  } finally { manager.dispose() }
})

test('area zoom below the horizon keeps its target on the breadboard before later orbit and presets', () => {
  for (const withControls of [false, true]) {
    const manager = withControls ? setup().manager : createSceneManager({
      renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {},
    })
    try {
      manager.resize(1000, 700); manager.setViewOrientation('FRONT', false)
      assert.equal(manager.zoomToArea(450, 450, 550, 650), true)
      assert.ok(manager.target().y >= 0 && manager.camera.position.y >= 0)
      const target = manager.target()
      manager.orbit(0, 170); manager.setViewOrientation('RIGHT', false)
      assert.ok(manager.camera.position.y >= 0 && manager.target().equals(target))
    } finally { manager.dispose() }
  }
})

test('fitting models with negative Y never lowers the camera target below XZ or moves the models', () => {
  for (const withControls of [false, true]) {
    const manager = withControls ? setup().manager : createSceneManager({
      renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {},
    })
    try {
      manager.resize(1000, 700)
      const graph = { schema_version: '1.0' as const, circuit_id: 'low',
        modules: [{ id: 'A', type: 'CLOCK', position: { x: 0, y: -5, z: 0 } }], connections: [] }
      manager.syncGraph(graph)
      const snapshot = JSON.stringify(graph), pose = manager.models.get('A')!.matrixWorld.clone()
      assert.equal(manager.fitCircuit(), true)
      assert.ok(manager.target().y >= 0 && manager.camera.position.y >= 0)
      manager.orbit(0, 170); manager.setViewOrientation('FRONT', false)
      assert.ok(manager.camera.position.y >= 0)
      assert.equal(JSON.stringify(graph), snapshot)
      assert.ok(manager.models.get('A')!.matrixWorld.equals(pose))
    } finally { manager.dispose() }
  }
})

test('animated opposite face transitions stay above the board and finish with canonical screen axes', () => {
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const manager = createSceneManager({
    renderer: { setSize() {}, render() {}, dispose() {} },
    requestFrame(cb) { frames.set(++id, cb); return id }, cancelFrame(frame) { frames.delete(frame) },
  })
  try {
    manager.resize(1000, 700)
    for (const [start, end] of [['FRONT', 'BACK'], ['BACK', 'FRONT'], ['RIGHT', 'LEFT'], ['LEFT', 'RIGHT'], ['BACK', 'TOP']]) {
      manager.setViewOrientation(start, false)
      const before = performance.now()
      manager.setViewOrientation(end, true, 200)
      for (let elapsed = 10; elapsed <= 220; elapsed += 10) {
        const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(before + elapsed))
        assert.ok(manager.camera.position.y >= -1e-10 && manager.cameraDirection().y >= -1e-10, `${start} to ${end} at ${elapsed}`)
      }
      assert.equal(manager.isTransitioning(), false)
      const animated = manager.camera.quaternion.clone(), position = manager.camera.position.clone()
      manager.setViewOrientation(end, false)
      assert.ok(animated.angleTo(manager.camera.quaternion) < 1e-7)
      assert.ok(position.distanceTo(manager.camera.position) < 1e-8)
    }
  } finally { manager.dispose() }
})

test('cardinal ring follows camera heading while Cube presets and Home keep their behavior', async () => {
  const { manager } = setup()
  const Navigator = await loadSfc('components/workbench/WorkspaceNavigator.vue')
  const quaternion = ref(manager.cameraQuaternion()), emitted: string[] = []
  const mounted = mountSfc(defineComponent({ setup: () => () => h(Navigator, {
    cameraQuaternion: quaternion.value,
    onSetView(direction: string) { emitted.push(direction); manager.setViewOrientation(direction, false); quaternion.value = manager.cameraQuaternion() },
    onResetView() { manager.resetView(); quaternion.value = manager.cameraQuaternion() },
  }) }), createPinia())
  const click = (node: ReturnType<typeof mounted.find>) => (node.props.onClick as (event: unknown) => void)({ stopPropagation() {} })
  const allowed = new Set(['TOP', 'FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP-FRONT', 'TOP-BACK', 'TOP-LEFT', 'TOP-RIGHT',
    'TOP-FRONT-LEFT', 'TOP-FRONT-RIGHT', 'TOP-BACK-LEFT', 'TOP-BACK-RIGHT'])
  try {
    assert.ok(!mounted.text().includes('VIEWCUBE') && !mounted.text().includes('XZ'))
    assert.deepEqual(mounted.all().filter(node => node.props['data-compass']).map(node => node.props['data-compass']), ['W', 'N', 'E', 'S'])
    const marker = (label: string) => mounted.find('g', 'data-compass', label).children.find(node => node.tag === 'text')!
    const headings: Record<string, [number, number, number, number]> = {
      TOP: [55, 19, 104, 68], FRONT: [55, 19, 104, 68], BACK: [55, 117, 6, 68],
      RIGHT: [104, 68, 55, 117], LEFT: [6, 68, 55, 19],
    }
    for (const view of allowed) {
      manager.setViewOrientation(view, false); quaternion.value = manager.cameraQuaternion(); await nextTick()
      for (const node of mounted.all().filter(node => node.props['data-region-id'])) {
        assert.ok(!String(node.props['data-region-id']).includes('BOTTOM'))
        if (node.props.role === 'button') assert.ok(allowed.has(String(node.props['data-region-id'])))
      }
      const region = mounted.find('g', 'data-region-id', view)
      assert.ok(region && region.props.role === 'button', view)
      click(region); assert.equal(emitted.at(-1), view); await nextTick()
      assert.equal(region.props['aria-pressed'], true, 'the aligned preset must be visibly selected')
      if (headings[view]) {
        assert.deepEqual([marker('N').props.x, marker('N').props.y, marker('E').props.x, marker('E').props.y], headings[view])
      }
    }
    for (const [label, face, direction] of [
      ['W', 'LEFT', new Vector3(-1, 0, 0)], ['N', 'BACK', new Vector3(0, 0, -1)],
      ['E', 'RIGHT', new Vector3(1, 0, 0)], ['S', 'FRONT', new Vector3(0, 0, 1)],
    ] as const) {
      click(mounted.find('g', 'data-compass', label)); await nextTick()
      assert.equal(emitted.at(-1), face)
      assert.ok(manager.cameraDirection().distanceTo(direction) < 1e-9)
    }
    click(mounted.find('button', 'aria-label', 'Home view')); await nextTick()
    assert.ok(manager.camera.position.distanceTo(new Vector3(0, 11, 10)) < 1e-8)
    quaternion.value = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2).toArray(); await nextTick()
    assert.ok(!mounted.text().includes('BOTTOM'), 'even an invalid incoming quaternion cannot expose a bottom label')
  } finally { mounted.app.unmount(); manager.dispose() }
})

test('ViewCube face labels follow the face plane with East-right and North-up at TOP', () => {
  const geometry = buildCubeGeometry()
  for (const [quaternion, face] of [
    [new Quaternion(), 'FRONT'],
    [new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2), 'TOP'],
  ] as const) {
    const polygon = projectCube(geometry, quaternion).find(region => region.id === face)!
    const transform = (polygon as unknown as { labelTransform?: string }).labelTransform
    assert.ok(transform, `${face} label needs a face-plane transform`)
    const values = transform.replace(/^matrix\(|\)$/g, '').split(/[ ,]+/).map(Number)
    assert.deepEqual(values.slice(0, 4), [1, 0, 0, 1])
    assert.deepEqual(values.slice(4), [polygon.centerX, polygon.centerY])
  }
})

test('ViewCube pointer taps select a face while captured drags never become a face click', async () => {
  const Navigator = await loadSfc('components/workbench/WorkspaceNavigator.vue')
  const selected: string[] = [], orbits: number[] = []
  const mounted = mountSfc(defineComponent({ setup: () => () => h(Navigator, {
    cameraQuaternion: [0, 0, 0, 1], onSetView: (direction: string) => selected.push(direction),
    onOrbit: (degrees: number) => orbits.push(degrees),
  }) }), createPinia())
  let captured = false
  const widget = mounted.find('div', 'aria-label', 'Interactive 3D ViewCube')
  const face = mounted.find('g', 'data-region-id', 'FRONT')
  const pointer = (handler: string, x: number) => (widget.props[handler] as (event: unknown) => void)({
    button: 0, pointerId: 1, clientX: x, clientY: 70, stopPropagation() {},
    currentTarget: { setPointerCapture() { captured = true }, releasePointerCapture() { captured = false } },
  })
  const finish = () => {
    // Browser clicks are retargeted to the capturing widget when capture was active.
    const target = captured ? widget : face
    pointer('onPointerup', 80)
    let stopped = false
    const event = { stopPropagation() { stopped = true }, preventDefault() {} }
    ;(widget.props.onClickCapture as ((event: unknown) => void) | undefined)?.(event)
    if (!stopped) (target.props.onClick as ((event: unknown) => void) | undefined)?.(event)
  }
  try {
    pointer('onPointerdown', 80); finish()
    assert.deepEqual(selected, ['FRONT'], 'a simple tap must reach the face handler')
    pointer('onPointerdown', 80); pointer('onPointermove', 95); finish()
    assert.ok(orbits.length > 0)
    assert.deepEqual(selected, ['FRONT'], 'a drag must only orbit')
    const keydown = face.props.onKeydown as ((event: unknown) => void) | ((event: unknown) => void)[]
    for (const handler of Array.isArray(keydown) ? keydown : [keydown]) handler({ key: 'Enter', stopPropagation() {} })
    assert.deepEqual(selected, ['FRONT', 'FRONT'], 'keyboard alignment remains usable after dragging')
  } finally { mounted.app.unmount() }
})

test('Home view restores default camera position and target', () => {
  const { manager } = setup()
  try {
    manager.pan(4, -2)
    manager.orbit(50, 25)
    manager.setZoom(160)
    assert.ok(manager.camera.position.distanceTo(new Vector3(0, 11, 10)) > 1)
    manager.resetView()
    assert.ok(manager.camera.position.distanceTo(new Vector3(0, 11, 10)) < 0.001)
    assert.ok(Math.abs(manager.zoomPercent() - 100) < 0.01)
  } finally { manager.dispose() }
})

test('orbit supports combined yaw and pitch without drifting target or distance', () => {
  const { manager } = setup()
  try {
    manager.pan(2, 3)
    const target = manager.target()
    const distanceBefore = manager.camera.position.distanceTo(target)
    manager.orbit(35, 20)
    const distanceAfter = manager.camera.position.distanceTo(manager.target())
    assert.ok(Math.abs(distanceBefore - distanceAfter) < 0.01, 'Distance to target must be preserved during yaw+pitch orbit')
    assert.ok(manager.target().distanceTo(target) < 1e-4, 'Target position must be preserved during yaw+pitch orbit')
    // Extreme pitch bounds clamp safely without NaN
    manager.orbit(0, 100)
    assert.ok(manager.camera.position.toArray().every(Number.isFinite))
    manager.orbit(0, -200)
    assert.ok(manager.camera.position.toArray().every(Number.isFinite))
  } finally { manager.dispose() }
})

test('ViewCube synchronizes orientation when camera orbits via right-drag', () => {
  const { manager, canvas } = setup()
  const pointer = (type: string, x: number, y: number) => canvas.dispatchEvent(Object.assign(new Event(type), { button: 2, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }))
  try {
    const qBefore = manager.cameraQuaternion()
    pointer('pointerdown', 500, 350)
    pointer('pointermove', 580, 420)
    pointer('pointerup', 580, 420)
    const qAfter = manager.cameraQuaternion()
    assert.notDeepEqual(qBefore, qAfter, 'Camera quaternion must update when orbiting via right-drag')

    // ViewCube projection updates with the new camera orientation
    const regions = buildCubeGeometry(24, 6)
    const proj = projectCube(regions, new Quaternion(...qAfter), 68, 68)
    assert.ok(proj.length > 0, 'Visible polygons projected from updated quaternion')
  } finally { manager.dispose() }
})

test('face, edge and corner orientation changes preserve OrbitControls target and distance', () => {
  const { manager } = setup()
  try {
    manager.pan(3, -1)
    manager.setZoom(140)
    const target = manager.target()
    const initialDistance = manager.camera.position.distanceTo(target)
    const testViews = ['TOP', 'TOP-FRONT-RIGHT', 'TOP-BACK-LEFT', 'LEFT', 'TOP-BACK', 'FRONT']

    for (const view of testViews) {
      manager.setViewOrientation(view, false)
      assert.ok(manager.target().distanceTo(target) < 1e-4, `Target preserved for ${view}`)
      const currentDistance = manager.camera.position.distanceTo(manager.target())
      assert.ok(Math.abs(currentDistance - initialDistance) < 0.01, `Distance preserved for ${view}`)
    }
  } finally { manager.dispose() }
})

test('ViewCube navigation never mutates CircuitGraph, models or history snapshot', () => {
  const { manager } = setup()
  try {
    const graph = {
      schema_version: '1.0' as const,
      circuit_id: 'cad-cube',
      modules: [
        { id: 'CLK', type: 'CLOCK', position: { x: 1, y: 0, z: -2 } },
        { id: 'LED', type: 'LED', position: { x: 5, y: 0, z: 2 } },
      ],
      connections: [{ source: 'CLK.OUT', destination: 'LED.IN' }],
    }
    manager.syncGraph(graph)
    setActivePinia(createPinia())
    const store = useCircuitStore()
    store.importGraph(graph)
    store.moveModule('LED', { x: 6, y: 0, z: 2 }); store.undo()
    const history = JSON.stringify({ past: store.past, future: store.future }), state = store.snapshot()
    const snapshot = JSON.stringify(graph)
    const poses = [...manager.models.values()].map((m) => m.matrixWorld.clone())

    // Perform diverse ViewCube navigation actions
    for (const view of Object.keys(ORIENTATION_DIRECTIONS)) manager.setViewOrientation(view, false)
    manager.orbit(45, -15)
    manager.resetView()

    assert.equal(JSON.stringify(graph), snapshot, 'CircuitGraph must never be mutated by navigation')
    assert.ok([...manager.models.values()].every((m, idx) => m.matrixWorld.equals(poses[idx])), 'Component matrices must remain unchanged')
    assert.equal(store.snapshot(), state)
    assert.equal(JSON.stringify({ past: store.past, future: store.future }), history)
    store.redo(); assert.equal(store.graph!.modules[1].position!.x, 6)
    store.undo(); assert.equal(store.snapshot(), state)
  } finally { manager.dispose() }
})

test('rapid view switching cancels in-flight transition and converges to the latest target', () => {
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const manager = createSceneManager({
    renderer: { setSize() {}, render() {}, dispose() {} },
    requestFrame(cb) { frames.set(++id, cb); return id },
    cancelFrame(f) { frames.delete(f) },
  })
  try {
    manager.resize(1000, 700)
    // Start rapid switching
    manager.setViewOrientation('TOP', true, 200)
    assert.equal(manager.isTransitioning(), true)
    manager.setViewOrientation('LEFT', true, 200)
    assert.equal(manager.isTransitioning(), true)
    manager.setViewOrientation('RIGHT', true, 200)
    assert.equal(manager.isTransitioning(), true)

    // Complete transition
    manager.finishTransition()
    assert.equal(manager.isTransitioning(), false)
    const dir = manager.cameraDirection()
    assert.ok(dir.x > 0.99, 'Camera direction must match the latest target (RIGHT)')
  } finally { manager.dispose() }
})

test('manual camera interaction immediately cancels any active transition', () => {
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  const manager = createSceneManager({
    renderer: { setSize() {}, render() {}, dispose() {} },
    requestFrame(cb) { frames.set(++id, cb); return id },
    cancelFrame(f) { frames.delete(f) },
  })
  try {
    manager.resize(1000, 700)
    manager.setViewOrientation('BACK', true, 200)
    assert.equal(manager.isTransitioning(), true)

    // Manual orbit cancels transition
    manager.orbit(10, 0)
    assert.equal(manager.isTransitioning(), false)
  } finally { manager.dispose() }
})

test('orientation navigation remains stable across viewport resize', () => {
  const { manager } = setup()
  try {
    const sizes = [[1920, 1080], [1000, 700], [480, 600], [320, 150]]
    for (const [w, h] of sizes) {
      manager.resize(w, h)
      manager.setViewOrientation('TOP-FRONT', false)
      const dir = manager.cameraDirection()
      assert.ok(dir.distanceTo(ORIENTATION_DIRECTIONS['TOP-FRONT']!) < 0.01)
      assert.ok(manager.camera.projectionMatrix.elements.every(Number.isFinite))
    }
  } finally { manager.dispose() }
})

