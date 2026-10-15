import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSceneManager, type SceneRenderer } from '../src/three/SceneManager'
import { Box3, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Raycaster, ShaderMaterial, Vector3, type Material } from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import type { CircuitGraph } from '../src/types/circuit'
import { createComponentTransformGizmo } from '../src/three/ComponentTransformGizmo'
import { applyPowerSupplyControls } from '../src/three/PowerSupplyModel'

test('supply display reuses its canvas texture while knobs, calibrated scale and logo follow local settings', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document'), labels: string[] = []
  let canvases = 0
  const ctx = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillText(text: string) { labels.push(text) } }
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() { canvases++; return { getContext: () => ctx } } } })
  const model = buildComponent({ id: 'PSU', type: 'POWER_SUPPLY', rotation: 30 })
  try {
    const screen = model.getObjectByName('supply-display') as Mesh<any, any>, texture = screen.material.map, initialVersion = texture.version
    let disposed = 0; texture.addEventListener('dispose', () => disposed++)
    const initialCanvases = canvases
    applyPowerSupplyControls(model, { voltage_v: 7.5, current_limit_a: 2.5, power_on: true })
    assert.equal(model.getObjectByName('supply-knob-0')!.rotation.z, -0)
    assert.equal(model.getObjectByName('supply-knob-1')!.rotation.z, -0)
    assert.equal(screen.material.map, texture); assert.ok(texture.version > initialVersion)
    assert.equal(canvases, initialCanvases); assert.equal(disposed, 0)
    assert.ok(!labels.some((text) => /LOCAL SETPOINT|VOLTAGE SET|CURRENT LIMIT|NOT MEASURED|VISUAL/.test(text)), 'front panel only shows its units and printed legends')
    assert.ok(labels.includes('net*CIRCUIT') || (labels.includes('net') && labels.includes('*CIRCUIT')))
    assert.ok(labels.includes('15') && labels.includes('5'), 'calibration rings show both upper limits')
    assert.ok(model.getObjectByName('supply-brand-icon') instanceof Mesh)
    const knob = model.getObjectByName('knob-body') as Mesh<any, any>
    assert.ok(knob.geometry.parameters.radiusTop < 0.18, 'compact knob leaves room for the calibration ring')
    applyPowerSupplyControls(model, { voltage_v: 30, current_limit_a: -1, power_on: false })
    assert.deepEqual(screen.userData.settings, [false, 15, 0])
    applyPowerSupplyControls(model, { voltage_v: NaN, current_limit_a: Infinity, power_on: 'on' })
    assert.deepEqual(screen.userData.settings, [false, 0, 0], 'malformed imports display safe defaults')
  } finally {
    disposeObject(model)
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('power OFF paints only black glass; ON lights digits and display/brand stay inside the front panel', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const drawings: { strokes: number; text: string[]; fills: string[] }[] = []
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() {
    const record = { strokes: 0, text: [] as string[], fills: [] as string[] }; drawings.push(record)
    const ctx = { fillStyle: '', fillRect() { record.fills.push(this.fillStyle) }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { record.strokes++ }, arc() {}, fill() {}, fillText(text: string) { record.text.push(text) } }
    return { getContext: () => ctx }
  } } })
  const model = buildComponent({ id: 'PSU', type: 'POWER_SUPPLY' })
  try {
    const glass = drawings[0]
    assert.deepEqual(glass.fills, ['#000000'])
    assert.equal(glass.strokes, 0); assert.deepEqual(glass.text, [])
    applyPowerSupplyControls(model, { voltage_v: 3.3, current_limit_a: 1, power_on: true })
    assert.ok(glass.strokes > 0); assert.deepEqual(glass.text, ['V', 'A', 'W'])
    glass.text = []; glass.strokes = 0; glass.fills = []
    applyPowerSupplyControls(model, { voltage_v: 3.3, current_limit_a: 1, power_on: false })
    assert.deepEqual(glass.fills, ['#000000']); assert.equal(glass.strokes, 0); assert.deepEqual(glass.text, [])
    const display = new Box3().setFromObject(model.getObjectByName('display-recess')!)
    assert.ok(display.max.y < 2.60, 'upper display edge has a real inset below the case header')
    assert.ok(display.min.y > 0.70, 'display keeps clearance above the output labels')
    assert.ok(new Box3().setFromObject(model.getObjectByName('control-strip')!).max.y < 2.60, 'both panel inserts fit below the header')
    const brand = model.getObjectByName('supply-brand-icon')!
    assert.ok(brand.position.x > 0, 'brand icon is on the right side')
    assert.ok(new Box3().setFromObject(brand).min.y > display.max.y, 'branding does not overprint the screen')
  } finally {
    disposeObject(model)
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('supply controls are occluded by their case and still pick correctly after moving and rotating the supply', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700)
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'supply', modules: [{ id: 'PSU', type: 'POWER_SUPPLY', rotation: 35, position: { x: 2, y: 0.3, z: -1 } }], connections: [] })
    const model = manager.models.get('PSU')!, front = model.localToWorld(new Vector3(0, 1.4, 10))
    const target = model.localToWorld(new Vector3(0, 1.4, 0)), knob = model.localToWorld(new Vector3(0.804, 2.128, 1.84))
    manager.camera.position.copy(front); manager.camera.lookAt(target)
    const start = manager.project(knob)
    assert.equal(manager.pick(start.x, start.y)?.kind, 'control')
    manager.camera.position.copy(model.localToWorld(new Vector3(0, 1.4, -10))); manager.camera.lookAt(target)
    const hidden = manager.project(knob)
    assert.equal(manager.pick(hidden.x, hidden.y)?.kind, 'module', 'cannot operate a knob through the rear metal case')
  } finally { manager.dispose() }
})

type TransformScene = ReturnType<typeof createSceneManager> & {
  fitCircuit?: () => boolean
  previewRotation?: (id: string, degrees: number) => void
  gizmoHandlePosition?: (handle: 'x' | 'z' | 'xz' | 'rotate-y' | 'delete') => Vector3 | null
  pickGizmo?: (x: number, y: number) => { id: string; handle: string } | null
  hoverGizmo?: (x: number, y: number) => string | null
}

test('fit entire circuit frames remote rotated components without changing graph or view heading', () => {
  const manager: TransformScene = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700)
    assert.equal(typeof manager.fitCircuit, 'function', 'fit must use circuit bounds rather than reset view')
    assert.equal(manager.fitCircuit!(), false)
    const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'fit', modules: [{ id: 'A', type: 'BREADBOARD', rotation: 35, position: { x: -16, y: 0, z: -12 } }, { id: 'B', type: 'POWER_SUPPLY', position: { x: 23, y: 2, z: 18 } }], connections: [] }
    manager.syncGraph(graph); manager.orbit(40); manager.setZoom(200)
    const before = manager.camera.quaternion.clone(), snapshot = JSON.stringify(graph)
    assert.equal(manager.fitCircuit!(), true)
    for (const model of manager.models.values()) {
      const bounds = new Box3().setFromObject(model)
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) assert.equal(manager.project(new Vector3(x, y, z)).visible, true)
    }
    assert.ok(manager.camera.quaternion.angleTo(before) < 0.001)
    assert.equal(JSON.stringify(graph), snapshot)
  } finally { manager.dispose() }
})

test('selected models expose pickable adjacent gizmo handles, stable screen scale and live rotation', () => {
  const manager: TransformScene = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700)
    const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'gizmo', modules: [{ id: 'A', type: 'CLOCK' }, { id: 'B', type: 'LED', position: { x: 3, y: 0, z: 0 } }], connections: [{ source: 'A.OUT', destination: 'B.IN' }] }
    manager.syncGraph(graph); manager.highlight('A')
    assert.equal(typeof manager.gizmoHandlePosition, 'function')
    const read = (handle: 'x' | 'z' | 'xz' | 'rotate-y' | 'delete') => manager.gizmoHandlePosition!(handle)!
    for (const handle of ['x', 'z', 'xz', 'rotate-y', 'delete'] as const) {
      const p = manager.project(read(handle))
      assert.equal(manager.pickGizmo!(p.x, p.y)?.handle, handle)
      assert.equal(manager.hoverGizmo!(p.x, p.y), handle)
    }
    const separation = () => { const a = manager.project(read('x')), b = manager.project(read('xz')); return Math.hypot(a.x - b.x, a.y - b.y) }
    const initial = separation()
    manager.setZoom(200)
    assert.ok(Math.abs(separation() - initial) < initial * 0.08)
    const anchor = read('xz').clone()
    manager.previewMove('A', { x: 1, y: 0.4, z: 1 })
    assert.ok(read('xz').distanceTo(anchor) > 0.5)
    const endpoint = manager.endpointPosition('A.OUT')!.clone(), snapshot = JSON.stringify(graph)
    manager.previewRotation!('A', 45)
    assert.ok(manager.endpointPosition('A.OUT')!.distanceTo(endpoint) > 0.2)
    assert.equal(JSON.stringify(graph), snapshot)
    manager.highlight(null)
    assert.equal(manager.gizmoHandlePosition!('xz'), null)
  } finally { manager.dispose() }
})

test('upright bench supply has two adjustment knobs, two output sockets and no logical source', () => {
  const supply = buildComponent({ id: 'P', type: 'POWER_SUPPLY' })
  try {
    const body = supply.children.find((child) => child.name === 'supply-enclosure') as Mesh | undefined
    assert.ok(body, 'supply needs a purpose-built enclosure')
    assert.ok(body.geometry.getAttribute('position').count > 24, 'enclosure corners should be rounded')
    assert.ok(supply.children.some((child) => child.name === 'supply-display'))
    const knobs = supply.children.filter((child) => child.name.startsWith('supply-knob'))
    const terminals = supply.children.filter((child) => child.name.startsWith('supply-terminal'))
    assert.equal(knobs.length, 2, 'Voltage and Ampe are the only adjustment knobs')
    assert.equal(terminals.length, 2, 'Vcc and Gnd are the only decorative binding posts')
    assert.ok(knobs.every((knob) => knob.position.x > 0), 'knobs belong to the right-hand vertical strip')
    assert.ok(Math.abs(knobs[0].position.y - knobs[1].position.y) > 0.7)
    assert.ok(terminals.every((terminal) => terminal.position.y < knobs[1].position.y))
    for (const terminal of terminals) {
      const origin = terminal.position.clone(); origin.z += 1
      const hit = new Raycaster(origin, new Vector3(0, 0, -1)).intersectObject(supply, true)[0]
      assert.equal(hit?.object.name, 'socket-floor', 'both socket bores must reveal a dark recessed floor, not a closed terminal cap')
      assert.ok(terminal.position.z + 0.19 - hit.point.z > 0.14)
    }
    const display = supply.getObjectByName('supply-display') as Mesh
    display.geometry.computeBoundingBox()
    const screen = display.geometry.boundingBox!.getSize(new Vector3())
    assert.ok(screen.y > screen.x, 'V/A/W display must have portrait proportions')
    assert.equal(supply.children.some((child) => /usb/i.test(child.name)), false)
    assert.equal(supply.children.some((child) => child.userData.kind === 'port'), false)
    const bounds = new Box3().setFromObject(supply)
    assert.ok(bounds.min.y >= 0 && bounds.max.y <= Number(supply.userData.size[1]) + 0.01)
    const size = bounds.getSize(new Vector3())
    assert.ok(size.y > size.x && size.z > size.x, 'case must be upright with a deep metal enclosure')
  } finally { disposeObject(supply) }
})

test('Y rotation grip follows preview yaw while its gesture center and world X/Z handles stay stable', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700)
    const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'grip', modules: [{ id: 'B', type: 'BREADBOARD' }], connections: [] }
    manager.syncGraph(graph); manager.highlight('B'); manager.activateGizmo('rotate-y')
    const center = manager.gizmoOrigin()!, radial = manager.gizmoHandlePosition('rotate-y')!.clone().sub(center)
    const x = manager.gizmoHandlePosition('x')!.clone(), z = manager.gizmoHandlePosition('z')!.clone()
    for (const angle of [45, 90, 180, 270]) {
      manager.previewRotation('B', angle)
      const grip = manager.gizmoHandlePosition('rotate-y')!
      assert.ok(grip.distanceTo(center.clone().add(radial.clone().applyAxisAngle(new Vector3(0, 1, 0), angle * Math.PI / 180))) < 0.001, 'grip must travel around the Y ring with object yaw')
      assert.ok(manager.gizmoOrigin()!.distanceTo(center) < 0.001)
      assert.ok(manager.gizmoHandlePosition('x')!.distanceTo(x) < 0.001)
      assert.ok(manager.gizmoHandlePosition('z')!.distanceTo(z) < 0.001)
      const p = manager.project(grip)
      assert.equal(manager.pickGizmo(p.x, p.y)?.handle, 'rotate-y')
    }
    assert.equal(graph.modules[0].rotation, undefined, 'preview must leave circuit truth unchanged')
    manager.syncGraph(graph)
    assert.ok(manager.gizmoHandlePosition('rotate-y')!.distanceTo(center.clone().add(radial)) < 0.001, 'cancel restores the original grip angle')
  } finally { manager.dispose() }
})

test('gizmo hover highlights only its handle and disposal releases tool geometry', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  manager.resize(1000, 700); manager.syncGraph({ schema_version: '1.0', circuit_id: 'hover', modules: [{ id: 'B', type: 'BREADBOARD_100' }], connections: [] }); manager.highlight('B')
  const p = manager.project(manager.gizmoHandlePosition('x')!)
  manager.hoverGizmo(p.x, p.y)
  const tool = manager.scene.children.find((child) => child.name === 'component-transform-gizmo')!
  const highlighted: string[] = [], materials = new Set<Material>()
  let geometry = 0, released = 0, releasedMaterials = 0
  tool.traverse((child) => {
    if (!(child instanceof Mesh)) return
    geometry++; child.geometry.addEventListener('dispose', () => released++)
    const owned: Material[] = Array.isArray(child.material) ? child.material : [child.material]
    for (const entry of owned) {
      materials.add(entry)
      if ((entry as MeshBasicMaterial).color.getHexString() === 'a6eee4') highlighted.push(child.name)
    }
  })
  assert.deepEqual(highlighted, ['x-face', 'x-face'], 'only the X triangle face and its bevel should highlight')
  for (const entry of materials) entry.addEventListener('dispose', () => releasedMaterials++)
  manager.dispose(); assert.equal(released, geometry); assert.equal(releasedMaterials, materials.size, 'all face, bevel and border materials are released once')
})

test('gizmo checks neighbors for every candidate even with a single-use model iterator', () => {
  const models = new Map<string, Group>()
  for (const [id, x, z] of [['A', 0, 0], ['B', 0, 3], ['C', 3, 0]] as const) { const model = new Group(); model.userData = { id, size: [2, 1, 2] }; model.position.set(x, 0, z); models.set(id, model) }
  const camera = new PerspectiveCamera(42, 1000 / 700, 0.1, 150); camera.position.set(0, 11, 10); camera.lookAt(0, 0, 0)
  const gizmo = createComponentTransformGizmo()
  try { gizmo.update(models.get('A'), models.values(), camera, 1000, 700); assert.ok(gizmo.root.position.x < 0, 'both front and right are occupied; the clear left candidate should win') }
  finally { disposeObject(gizmo.root) }
})

test('active translation maintains gizmo pixel size as the model approaches the camera', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700); manager.syncGraph({ schema_version: '1.0', circuit_id: 'scale', modules: [{ id: 'A', type: 'CLOCK' }], connections: [] }); manager.highlight('A')
    const width = () => { const a = manager.project(manager.gizmoHandlePosition('x')!), b = manager.project(manager.gizmoHandlePosition('xz')!); return Math.hypot(a.x - b.x, a.y - b.y) }
    const before = width(); manager.activateGizmo('xz'); manager.previewMove('A', { x: 0, y: 0, z: 7 })
    assert.ok(Math.abs(width() - before) / before < 0.08, 'active dragging must recompute camera-relative scale')
  } finally { manager.dispose() }
})

test('gizmo avoids a visible information window in canvas coordinates', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} }) as ReturnType<typeof createSceneManager> & { setGizmoObstacles?: (rects: { left: number; top: number; right: number; bottom: number }[]) => void }
  try {
    manager.resize(1000, 700); manager.syncGraph({ schema_version: '1.0', circuit_id: 'panel', modules: [{ id: 'A', type: 'CLOCK' }], connections: [] }); manager.highlight('A')
    const p = manager.project(manager.gizmoHandlePosition('xz')!)
    assert.equal(typeof manager.setGizmoObstacles, 'function')
    manager.setGizmoObstacles!([{ left: p.x - 65, top: p.y - 60, right: p.x + 65, bottom: p.y + 60 }])
    const moved = manager.project(manager.gizmoHandlePosition('xz')!)
    assert.ok(Math.abs(moved.x - p.x) > 120 || Math.abs(moved.y - p.y) > 115, 'choose a clear screen location outside the window')
  } finally { manager.dispose() }
})

test('adjacent gizmo clears the projected silhouette of a tall supply', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1280, 650)
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'tall', modules: [{ id: 'P', type: 'POWER_SUPPLY' }], connections: [] })
    manager.fitCircuit(); manager.highlight('P')
    const bounds = new Box3().setFromObject(manager.models.get('P')!), points = []
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) points.push(manager.project(new Vector3(x, y, z)))
    const left = Math.min(...points.map((p) => p.x)), right = Math.max(...points.map((p) => p.x))
    const top = Math.min(...points.map((p) => p.y)), bottom = Math.max(...points.map((p) => p.y))
    const center = manager.project(manager.gizmoOrigin()!)
    assert.ok(center.x + 60 < left || center.x - 60 > right || center.y + 55 < top || center.y - 55 > bottom, 'ring must not overlap the selected supply screen or controls')
  } finally { manager.dispose() }
})

test('rotated supply keeps the full gizmo within a small canvas', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(595, 390)
    const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'small', modules: [{ id: 'P', type: 'POWER_SUPPLY' }], connections: [] }
    manager.syncGraph(graph); manager.orbit(-45); manager.fitCircuit(); manager.highlight('P')
    manager.syncGraph({ ...graph, modules: [{ ...graph.modules[0], rotation: 120 }] })
    const center = manager.project(manager.gizmoOrigin()!)
    assert.ok(center.x >= 60 && center.x <= 535 && center.y >= 55 && center.y <= 335, 'handles and ring need screen clearance after yaw changes')
  } finally { manager.dispose() }
})

test('structure disposal releases instance buffers, not only geometry and material', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
    const board = buildComponent({ id: 'board', type })
    let buffers = 0
    board.traverse((object) => { if (object instanceof InstancedMesh) object.addEventListener('dispose', () => buffers++) })
    disposeObject(board)
    assert.equal(buffers, 1)
  }
})

test('placement reuses the ghost while moving; cancel removes it and releases its buffers', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  manager.setGhost('BREADBOARD', new Vector3(0, 0, 0))
  const ghost = manager.scene.children.find((object) => object.userData.id === 'PLACE')!
  let released = 0
  ghost.traverse((object) => { if (object instanceof InstancedMesh) object.addEventListener('dispose', () => released++) })
  manager.setGhost('BREADBOARD', new Vector3(2, 0, 1))
  assert.equal(manager.scene.children.find((object) => object.userData.id === 'PLACE')?.uuid, ghost.uuid)
  assert.deepEqual(ghost.position.toArray(), [2, 0, 1])
  manager.setGhost(null)
  assert.equal(released, 1)
  assert.equal(manager.scene.children.includes(ghost), false)
  manager.dispose()
})

test('placement model and gizmo follow in the same frame with a stable offset and cached layout', () => {
  let nextFrame: FrameRequestCallback | undefined, requests = 0
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame(callback) { nextFrame = callback; return ++requests }, cancelFrame() { nextFrame = undefined } })
  const draw = () => { const callback = nextFrame; nextFrame = undefined; callback?.(0) }
  try {
    manager.resize(1000, 700); manager.setGhost('CLOCK', new Vector3(), 0); draw()
    const ghost = manager.scene.children.find((item) => item.userData.id === 'PLACE')!
    const root = manager.scene.getObjectByName('component-transform-gizmo')!
    const offset = root.position.clone().sub(ghost.position), bounds = ghost.userData.visualBounds
    let layoutReads = 0
    Object.defineProperty(ghost.userData, 'visualBounds', { configurable: true, get() { layoutReads++; return bounds } })
    for (let i = 1; i <= 100; i++) {
      manager.setGhost('CLOCK', new Vector3(i / 100, 0, -i / 500), 0); draw()
      assert.ok(root.position.clone().sub(ghost.position).distanceTo(offset) < 0.00001, 'the rendered gizmo must move with the latest ghost')
      manager.gizmoOrigin(); manager.gizmoHandlePosition('x')
    }
    assert.equal(layoutReads, 0, 'ordinary follow and repeated picking queries must not solve candidates again')
    manager.dispose(); assert.equal(nextFrame, undefined); assert.equal(manager.gizmoOrigin(), null)
  } finally { manager.dispose() }
})

test('placement layout stays sticky under small score changes and relayouts for camera, viewport, yaw and obstacles', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700); manager.setGhost('BREADBOARD', new Vector3())
    const ghost = manager.scene.children.find((item) => item.userData.id === 'PLACE')!
    const bounds = ghost.userData.visualBounds; let layoutReads = 0
    Object.defineProperty(ghost.userData, 'visualBounds', { configurable: true, get() { layoutReads++; return bounds } })
    const initial = manager.gizmoOrigin()!.clone().sub(ghost.position), solved = layoutReads
    for (let i = 0; i < 80; i++) {
      manager.setGhost('BREADBOARD', new Vector3(i % 2 ? 0.02 : -0.02, 0, i % 2 ? 0.01 : -0.01), 0)
      assert.ok(manager.gizmoOrigin()!.sub(ghost.position).distanceTo(initial) < 0.00001, 'tiny score changes must not flip the chosen side')
    }
    assert.equal(layoutReads, solved)
    const changed = (action: () => void) => { const count = layoutReads; action(); manager.gizmoOrigin(); assert.ok(layoutReads > count); const current = layoutReads; manager.gizmoOrigin(); assert.equal(layoutReads, current) }
    changed(() => { manager.camera.position.set(9, 11, 1); manager.camera.lookAt(0, 0, 0) })
    changed(() => manager.resize(800, 600))
    changed(() => manager.setGhost('BREADBOARD', ghost.position.clone(), 90))
    const p = manager.project(manager.gizmoOrigin()!)
    changed(() => manager.setGizmoObstacles([{ left: p.x - 70, top: p.y - 65, right: p.x + 70, bottom: p.y + 65 }]))
    const relocated = manager.project(manager.gizmoOrigin()!)
    assert.ok(Math.abs(relocated.x - p.x) > 130 || Math.abs(relocated.y - p.y) > 120, 'an obstructed candidate must actually move out of the way')
  } finally { manager.dispose() }
})

test('placement yields an invalid candidate to a clear neighbor alternative regardless of hysteresis', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700); manager.setGhost('CLOCK', new Vector3())
    const origin = manager.gizmoOrigin()!
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'blocked', modules: [{ id: 'L', type: 'LED', position: { x: origin.x, y: 0, z: origin.z } }], connections: [] })
    assert.ok(manager.gizmoOrigin()!.distanceTo(origin) > 0.5, 'a new graph neighbor must not remain under the placement gizmo')
  } finally { manager.dispose() }
})

test('placement cached follow relayouts before its handles enter the model projected bounds', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.resize(1000, 700); manager.setGhost('CLOCK', new Vector3())
    const ghost = manager.scene.children.find((item) => item.userData.id === 'PLACE')!
    const bounds = ghost.userData.visualBounds; let solves = 0
    Object.defineProperty(ghost.userData, 'visualBounds', { configurable: true, get() { solves++; return bounds } })
    manager.setGhost('CLOCK', new Vector3(-2.3, 0, 0))
    const origin = manager.project(manager.gizmoOrigin()!), box = new Box3().setFromObject(ghost), projected = []
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) projected.push(manager.project(new Vector3(x, y, z)))
    const left = Math.min(...projected.map((p) => p.x)), right = Math.max(...projected.map((p) => p.x)), top = Math.min(...projected.map((p) => p.y)), bottom = Math.max(...projected.map((p) => p.y))
    assert.ok(origin.x + 60 <= left || origin.x - 60 >= right || origin.y + 55 <= top || origin.y - 55 >= bottom, 'pose follow must invalidate a cache that no longer clears the model')
    assert.ok(solves > 0)
  } finally { manager.dispose() }
})

test('scene reconciles by module ID, previews without changing graph and disposes removed models/wires', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'test', modules: [{ id: 'A', type: 'DIGITAL_SWITCH', position: { x: -2, y: 0, z: 0 } }, { id: 'B', type: 'LED', position: { x: 2, y: 0, z: 0 } }], connections: [{ source: 'A.OUT', destination: 'B.IN' }] }
  manager.syncGraph(graph)
  const model = manager.models.get('A')!
  const snapshot = JSON.stringify(graph)
  const before = manager.endpointPosition('A.OUT')!
  manager.previewMove('A', { x: -1, y: 0, z: 1 })
  assert.equal(JSON.stringify(graph), snapshot)
  assert.ok(manager.endpointPosition('A.OUT')!.distanceTo(before.clone().add(new Vector3(1, 0, 1))) < 0.001)
  manager.syncGraph(graph)
  assert.equal(manager.models.get('A'), model)
  assert.ok(manager.endpointPosition('A.OUT')!.distanceTo(before) < 0.001)
  assert.equal(manager.wires.children.length, 1)
  let disposed = 0
  model.traverse((object) => { if ('geometry' in object) (object.geometry as { addEventListener(type: string, callback: () => void): void }).addEventListener('dispose', () => disposed++) })
  manager.syncGraph({ ...graph, modules: [graph.modules[1]], connections: [] })
  assert.equal(manager.models.has('A'), false)
  assert.ok(disposed > 0)
  assert.equal(manager.wires.children.length, 0)
  manager.dispose()
})

test('named endpoint anchors rotate with geometry; screen picking and ground projection use camera only', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  manager.resize(1000, 700)
  manager.syncGraph({ schema_version: '1.0', circuit_id: 'test', modules: [{ id: 'S', type: 'DIGITAL_SWITCH', position: { x: 0, y: 0, z: 0 }, rotation: 90 }], connections: [] })
  const anchor = manager.endpointPosition('S.OUT')!
  assert.ok(Math.abs(anchor.x) < 0.001)
  assert.ok(anchor.z < 0)
  const screen = manager.project(anchor)
  assert.equal(manager.pick(screen.x, screen.y)?.kind, 'port')
  const ground = manager.groundPoint(500, 350)!
  assert.ok(Math.abs(ground.x) < 0.001 && Math.abs(ground.z) < 0.001)
  manager.dispose()
})

test('scene coalesces renders, ignores zero sizes and disposes all owned resources', () => {
  let nextId = 0
  const frames = new Map<number, FrameRequestCallback>()
  const calls: string[] = []
  const renderer: SceneRenderer = {
    setSize: (w, h) => { calls.push(`size ${w} ${h}`) },
    render: () => { calls.push('render') },
    dispose: () => { calls.push('dispose') },
  }
  const manager = createSceneManager({ renderer, requestFrame: (callback) => { frames.set(++nextId, callback); return nextId }, cancelFrame: (id) => { frames.delete(id) } })
  let geometryDisposed = false
  let materialDisposed = false
  manager.grid.geometry.addEventListener('dispose', () => { geometryDisposed = true })
  const materials = Array.isArray(manager.grid.material) ? manager.grid.material : [manager.grid.material]
  materials[0].addEventListener('dispose', () => { materialDisposed = true })
  manager.resize(0, 0)
  assert.equal(frames.size, 0)
  manager.resize(1200, 600)
  manager.setZoom(150)
  manager.resize(1200, 600)
  assert.equal(frames.size, 1)
  const [id, callback] = [...frames][0]
  frames.delete(id); callback(0)
  assert.equal(calls.filter((call) => call === 'render').length, 1)
  manager.setZoom(100)
  manager.dispose()
  manager.dispose()
  assert.equal(frames.size, 0)
  assert.equal(calls.filter((call) => call === 'dispose').length, 1)
  assert.equal(geometryDisposed, true)
  assert.equal(materialDisposed, true)
  manager.resize(500, 500)
  manager.setZoom(200)
  assert.equal(frames.size, 0)
})

test('keyboard view controls orbit and pan without touching graph; reset restores camera', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  const initial = manager.camera.position.clone()
  manager.orbit(15)
  assert.ok(manager.camera.position.distanceTo(initial) > 1)
  assert.ok(Math.abs(manager.camera.position.length() - initial.length()) < 0.001)
  const orbit = manager.camera.position.clone()
  manager.pan(1, 0)
  assert.ok(manager.camera.position.distanceTo(orbit) > 0.9)
  manager.resetView()
  assert.ok(manager.camera.position.distanceTo(initial) < 0.001)
  manager.dispose()
})

test('thin wires have a picking margin for normal pointer precision', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  manager.resize(1000, 700)
  manager.syncGraph({ schema_version: '1.0', circuit_id: 'wire', modules: [{ id: 'A', type: 'CLOCK', position: { x: -2, y: 0, z: 0 } }, { id: 'B', type: 'LED', position: { x: 2, y: 0, z: 0 } }], connections: [{ source: 'A.OUT', destination: 'B.IN' }] })
  const a = manager.endpointPosition('A.OUT')!, b = manager.endpointPosition('B.IN')!
  const middle = a.clone().add(b).multiplyScalar(0.5)
  const point = manager.project(middle)
  assert.equal(manager.pick(point.x, point.y + 4)?.kind, 'wire')
  manager.dispose()
})

test('axis directions follow camera orientation, ignore translation and reset with the view', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    const read = () => (manager as typeof manager & { orientationAxes?: () => { label: string; x: number; y: number; depth: number }[] }).orientationAxes?.()
    const initial = read()
    assert.ok(initial, 'scene must expose camera-oriented world axes')
    const x = initial.find((axis) => axis.label === 'X')!
    assert.ok(Math.abs(x.x - 1) < 0.001 && Math.abs(x.y) < 0.001)
    manager.orbit(90)
    const orbit = read()!
    assert.ok(Math.abs(orbit.find((axis) => axis.label === 'X')!.x) < 0.001)
    assert.ok(Math.abs(orbit.find((axis) => axis.label === 'Z')!.x) > 0.99)
    manager.pan(2, 3); manager.setZoom(160)
    for (const axis of orbit) {
      const panned = read()!.find((item) => item.label === axis.label)!
      assert.ok(Math.abs(axis.x - panned.x) < 0.001 && Math.abs(axis.y - panned.y) < 0.001)
    }
    manager.resetView()
    for (const axis of initial) {
      const reset = read()!.find((item) => item.label === axis.label)!
      assert.ok(Math.abs(axis.x - reset.x) < 0.001 && Math.abs(axis.y - reset.y) < 0.001)
    }
  } finally { manager.dispose() }
})

test('right-button OrbitControls pointer drag redraws axes, including after a left gesture lock', () => {
  const root = new EventTarget(), capture = new Set<number>()
  const canvas = Object.assign(new EventTarget(), {
    style: { touchAction: '' }, clientWidth: 1000, clientHeight: 700,
    getRootNode: () => root, setPointerCapture: (id: number) => capture.add(id), releasePointerCapture: (id: number) => capture.delete(id),
  })
  let frame: FrameRequestCallback | undefined, renders = 0
  let renderedX = 1
  const manager = createSceneManager({ canvas: canvas as unknown as HTMLCanvasElement, renderer: { setSize() {}, render() {}, dispose() {} },
    requestFrame: (callback) => { frame = callback; return 1 }, cancelFrame: () => { frame = undefined },
    onRender: () => { renders++; renderedX = manager.orientationAxes().find((axis) => axis.label === 'X')!.x },
  })
  const pointer = (type: string, button: number, x: number, y: number) => canvas.dispatchEvent(Object.assign(new Event(type), { button, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y }))
  try {
    manager.resize(1000, 700); frame?.(0)
    manager.lockPointer(true)
    const before = manager.camera.quaternion.clone()
    pointer('pointerdown', 2, 500, 350); pointer('pointermove', 2, 650, 420); pointer('pointerup', 2, 650, 420)
    assert.ok(manager.camera.quaternion.angleTo(before) < 0.0001)
    manager.lockPointer(false)
    pointer('pointerdown', 2, 500, 350); pointer('pointermove', 2, 650, 420); pointer('pointerup', 2, 650, 420)
    assert.ok(manager.camera.quaternion.angleTo(before) > 0.2)
    frame?.(0)
    assert.ok(renderedX < 0.5)
    assert.equal(renders, 2)
    assert.equal(capture.size, 0)
    manager.resetView(); frame?.(0)
    assert.ok(Math.abs(renderedX - 1) < 0.001)
  } finally { manager.dispose() }
})

test('selection uses thin geometry contours, retains body color and follows preview/rotation', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'outline', modules: [{ id: 'B', type: 'BREADBOARD', rotation: 90 }], connections: [] }
    manager.syncGraph(graph)
    const body = manager.models.get('B')!
    const colors: string[] = []
    body.traverse((object) => { if (object instanceof Mesh) colors.push((object.material as MeshStandardMaterial).emissive.getHexString()) })
    manager.highlight('B')
    const outline = body.children.find((child) => child.userData.isOutline)!
    assert.ok(outline)
    assert.ok(outline.children.every((child) => child instanceof LineSegments2), 'outline must be a screen-space contour, not a mesh cage')
    const line = outline.children[0] as LineSegments2
    assert.equal(line.userData.ignorePick, true)
    line.geometry.computeBoundingBox()
    assert.ok(line.geometry.boundingBox!.max.x > 4.5, 'contour must follow the actual end tab, not only catalog bounds')
    const selectedColors: string[] = []
    body.traverse((object) => { if (object instanceof Mesh && !object.userData.ignorePick) selectedColors.push((object.material as MeshStandardMaterial).emissive.getHexString()) })
    assert.deepEqual(selectedColors, colors)
    manager.previewMove('B', { x: 2, y: 0.25, z: 3 })
    assert.equal(outline.parent, body)
    assert.deepEqual(outline.getWorldPosition(new Vector3()).toArray(), [2, 0.25, 3])
    assert.ok(Math.abs(outline.getWorldQuaternion(body.quaternion.clone()).angleTo(body.quaternion)) < 0.001)
    let released = 0
    line.geometry.addEventListener('dispose', () => released++)
    manager.highlight(null)
    assert.equal(released, 1)
    assert.equal(body.children.includes(outline), false)
  } finally { manager.dispose() }
})

test('breadboard housing has a recessed channel and retains visual contact counts', () => {
  for (const [type, count] of [['BREADBOARD', 830], ['BREADBOARD_630', 630], ['BREADBOARD_100', 100]] as const) {
    const board = buildComponent({ id: 'B', type })
    try {
      const contacts = board.children.find((child) => child instanceof InstancedMesh) as InstancedMesh
      assert.equal(contacts.count, count)
      if (type !== 'BREADBOARD_100') {
        const deck = board.children.find((child) => child.userData.breadboardDeck) as Mesh | undefined
        assert.ok(deck, 'terminal strip must have an actual recessed IC channel')
        assert.equal(deck.geometry.type, 'ExtrudeGeometry')
      }
    } finally { disposeObject(board) }
  }
})

test('selection outline is rebuilt and disposed safely when a selected model changes', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'outline', modules: [{ id: 'A', type: 'LED' }], connections: [] }
    manager.syncGraph(graph); manager.highlight('A')
    const original = manager.models.get('A')!.children.find((child) => child.userData.isOutline)!
    let disposed = 0
    original.traverse((child) => { if (child instanceof LineSegments2) child.geometry.addEventListener('dispose', () => disposed++) })
    manager.syncGraph({ ...graph, modules: [{ id: 'A', type: 'LED', properties: { label: 'changed' } }] })
    const replacement = manager.models.get('A')!.children.find((child) => child.userData.isOutline)
    assert.ok(replacement && replacement !== original)
    assert.equal(disposed, 1)
    assert.ok(replacement.children.every((child) => child instanceof LineSegments2))
  } finally { manager.dispose() }
})

test('curved model contours follow the camera silhouette when orbiting', () => {
  let frame: FrameRequestCallback | undefined
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: (callback) => { frame = callback; return 1 }, cancelFrame() {} })
  try {
    manager.resize(1000, 700)
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'curve', modules: [{ id: 'L', type: 'LED' }], connections: [] })
    manager.highlight('L'); frame?.(0)
    const outline = manager.models.get('L')!.children.find((child) => child.userData.isOutline)!
    const line = outline.children[0] as LineSegments2
    const before = Array.from(line.geometry.getAttribute('instanceStart').array)
    assert.ok(before.length > 0)
    manager.orbit(75); frame?.(0)
    assert.notDeepEqual(Array.from(line.geometry.getAttribute('instanceStart').array), before, 'curved surfaces need view-dependent silhouette edges')
  } finally { manager.dispose() }
})

test('decorative resistor bands do not occlude its long selection contours', () => {
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'resistor', modules: [{ id: 'R', type: 'RESISTOR' }], connections: [] }); manager.highlight('R')
    manager.scene.updateMatrixWorld(true)
    const model = manager.models.get('R')!, outline = model.children.find((child) => child.userData.isOutline)!
    const line = outline.children[0] as LineSegments2
    const starts = line.geometry.getAttribute('instanceStart'), ends = line.geometry.getAttribute('instanceEnd')
    let samples = 0, hidden = 0
    const ray = new Raycaster()
    for (let i = 0; i < line.geometry.instanceCount; i++) {
      const a = new Vector3().fromBufferAttribute(starts, i), b = new Vector3().fromBufferAttribute(ends, i)
      if (a.distanceTo(b) < 0.7) continue
      for (let step = 1; step < 100; step++) {
        const point = model.localToWorld(a.clone().lerp(b, step / 100)), distance = point.distanceTo(manager.camera.position)
        ray.set(manager.camera.position, point.clone().sub(manager.camera.position).normalize())
        const hit = ray.intersectObjects(model.children, true).find((hit) => hit.object instanceof Mesh)
        samples++
        if (hit && hit.distance < distance - 0.0001) hidden++
      }
    }
    assert.ok(samples > 100)
    assert.equal(hidden, 0, 'decorative bands must stay behind the outer selection contour')
  } finally { manager.dispose() }
})

test('selection has a two CSS pixel medium gold stroke through resize and zoom', () => {
  let frame: FrameRequestCallback | undefined
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: (callback) => { frame = callback; return 1 }, cancelFrame() {} })
  try {
    manager.resize(1280, 720)
    manager.syncGraph({ schema_version: '1.0', circuit_id: 'gold', modules: [{ id: 'B', type: 'BREADBOARD' }], connections: [] }); manager.highlight('B'); frame?.(0)
    const stroke = manager.models.get('B')!.children.find((child) => child.userData.isOutline)!.children[0]
    assert.ok(stroke instanceof LineSegments2, 'native WebGL one-pixel lines cannot render the requested 2px border')
    assert.equal(stroke.material.linewidth, 2)
    assert.equal(stroke.material.worldUnits, false)
    assert.equal(stroke.material.color.getHexString(), 'd4af37')
    assert.deepEqual(stroke.material.resolution.toArray(), [1280, 720])
    manager.resize(900, 600); manager.setZoom(50); frame?.(0)
    assert.deepEqual(stroke.material.resolution.toArray(), [900, 600])
    assert.equal(stroke.material.linewidth, 2)
  } finally { manager.dispose() }
})

test('breadboard socket centers are genuinely recessed below the deck on all three sizes', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
    const board = buildComponent({ id: 'B', type })
    try {
      board.updateMatrixWorld(true)
      const contacts = board.children.find((child) => child instanceof InstancedMesh) as InstancedMesh
      const top = Number(board.userData.size[1]) + 0.03
      for (const index of [0, Math.floor(contacts.count / 2), contacts.count - 1]) {
        const matrix = new Matrix4(); contacts.getMatrixAt(index, matrix)
        const center = new Vector3().setFromMatrixPosition(matrix)
        const ray = new Raycaster(new Vector3(center.x, top + 1, center.z), new Vector3(0, -1, 0))
        const hit = ray.intersectObject(board, true)[0]
        assert.ok(hit, 'a socket needs a visible cavity floor')
        assert.ok(hit.point.y < top - 0.05, `${type} socket ${index} must not be a flat painted square or capped box`)
      }
      const normals = contacts.geometry.getAttribute('normal')
      assert.ok(Array.from({length: normals.count}, (_, i) => Math.abs(normals.getY(i))).some((y) => y > 0.05 && y < 0.95), 'socket entrances need sloped inner walls')
    } finally { disposeObject(board) }
  }
})

test('technical grid suppresses minor detail at distant zoom and preserves major spacing', () => {
  let frame: FrameRequestCallback | undefined
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: (callback) => { frame = callback; return 1 }, cancelFrame() {} })
  try {
    manager.resize(1280, 720); frame?.(0)
    const material = manager.grid.material
    assert.ok(material instanceof ShaderMaterial, 'uniform-brightness GridHelper must be replaced')
    assert.equal(material.uniforms.minorStep.value, 0.5)
    assert.equal(material.uniforms.majorStep.value, 2.5)
    assert.ok(material.uniforms.minorVisibility.value > 0.8)
    manager.setZoom(50); manager.camera.position.multiplyScalar(3); frame?.(0)
    assert.equal(material.uniforms.minorVisibility.value, 0)
    assert.equal(material.uniforms.majorStep.value, 2.5)
    manager.resetView(); frame?.(0)
    assert.ok(material.uniforms.minorVisibility.value > 0.8)
    assert.equal(material.depthWrite, false)
  } finally { manager.dispose() }
})

test('modular breadboards share mating keys with clearance for beveled joints', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100']) {
    const board = buildComponent({ id: 'B', type })
    try {
      const profile = board.userData.selectionProfile as [number, number][]
      const halfDepth = Number(board.userData.size[2]) / 2
      const tab = -halfDepth - Math.min(...profile.map(([, z]) => z))
      const notch = halfDepth - Math.min(...profile.filter(([x, z]) => Math.abs(x) < 0.2 && z > 0).map(([, z]) => z))
      assert.ok(notch - tab >= .0014 && notch - tab <= .0016, `${type} tab must fit with small clearance instead of a dark joint gap`)
      assert.equal(profile.filter(([, z]) => z < -halfDepth).length, 6, 'all strips share the same three mating keys')
    } finally { disposeObject(board) }
  }
})

test('docked breadboard bevels stay within their nominal mating edges', () => {
  for (const [first, second] of [['BREADBOARD', 'BREADBOARD'], ['BREADBOARD_630', 'BREADBOARD_100'], ['BREADBOARD_100', 'BREADBOARD_100']]) {
    const a = buildComponent({ id: 'A', type: first }), b = buildComponent({ id: 'B', type: second })
    try {
      const spacing = (Number(a.userData.size[2]) + Number(b.userData.size[2])) / 2
      b.position.z = spacing; b.updateMatrixWorld(true)
      // A straight portion between the keyed joints, below the socket floors.
      const aHit = new Raycaster(new Vector3(1, 0.2, 5), new Vector3(0, 0, -1)).intersectObject(a, true)[0]
      const bHit = new Raycaster(new Vector3(1, 0.2, -5), new Vector3(0, 0, 1)).intersectObject(b, true)[0]
      assert.ok(aHit && bHit)
      assert.ok(aHit.point.z <= bHit.point.z + 0.00001, `${first}/${second} housing bevels must not interpenetrate at the docked seam`)
    } finally { disposeObject(a); disposeObject(b) }
  }
})
