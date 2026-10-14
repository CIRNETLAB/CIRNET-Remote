import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { wireHarness } from './helpers/wireHarness'
import { readWireVisual } from '../src/wires/wireVisual'
import { resolveElectricalNets } from '../src/electrical/nets'

test('right-click adds repeated corners, left empty clicks do not bend, and endpoint commit stays atomic', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush(); h.circuit.past = []
    const first = `${bb}.contact:terminal:A:01`, last = `${bb}.contact:terminal:J:08`
    h.editor.pointerDown(h.endpointEvent(first))
    for (const [index, point] of [{ x: -3.25, y: .36, z: -.845 }, { x: -3.25, y: .36, z: 0 }, { x: -3.25, y: .36, z: .845 }].entries()) {
      const event = h.eventAt(point, 1, 2, true)
      h.editor.pointerMove(event); h.editor.pointerDown(event)
      let prevented = false
      h.editor.contextMenu({ clientX: event.clientX, clientY: event.clientY, preventDefault() { prevented = true }, stopPropagation() {}, stopImmediatePropagation() {} } as unknown as MouseEvent)
      assert.equal(prevented, true); assert.equal(h.workspace.pendingPort, first)
      assert.equal(h.editor.wireRouting.controlPoints.value.length, index + 1, 'contextmenu cannot add the same corner twice')
    }
    h.editor.pointerDown(h.eventAt({ x: -2, y: .36, z: 0 }))
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 3)
    h.editor.keydown({ key: 'Backspace', preventDefault() {} } as KeyboardEvent)
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 2)
    assert.equal(h.circuit.past.length, 0)
    h.editor.pointerDown(h.endpointEvent(last)); await nextTick()
    assert.equal(h.circuit.graph!.connections.length, 1); assert.equal(h.circuit.past.length, 1)
    h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.connections.length, 0)
    h.editor.connect(first); h.editor.keydown({ key: 'Escape' } as KeyboardEvent)
    assert.equal(h.workspace.pendingPort, null)
  } finally { h.dispose() }
})

test('Wire clicks exact holes and multiple right-click bends before one atomic commit', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush(); h.circuit.past = []
    const first = `${bb}.contact:terminal:A:01`, second = `${bb}.contact:terminal:J:08`
    h.editor.pointerDown(h.endpointEvent(first))
    assert.equal(h.workspace.pendingPort, first)
    for (const point of [{ x: -3.25, y: .36, z: -.845 }, { x: -3.25, y: .36, z: .845 }]) {
      const event = h.eventAt(point, 1, 2, true)
      h.editor.pointerMove(event); h.editor.pointerDown(event); h.editor.pointerUp(event)
    }
    h.editor.pointerMove(h.endpointEvent(second)); h.flush()
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 2)
    assert.ok(h.manager.scene.getObjectByName('wire-drawing-preview'))
    assert.equal(h.circuit.graph!.connections.length, 0); assert.equal(h.circuit.past.length, 0)
    h.editor.pointerDown(h.endpointEvent(second)); await nextTick(); h.flush()
    assert.equal(h.circuit.graph!.connections.length, 1); assert.equal(h.circuit.past.length, 1)
    assert.equal(readWireVisual(h.circuit.graph!.connections[0]).controlPoints.length, 2)
    assert.equal(h.workspace.pendingPort, null)
    h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.connections.length, 0)
    h.circuit.redo(); await nextTick(); assert.equal(h.circuit.graph!.connections.length, 1)
  } finally { h.dispose() }
})

test('right-click adds corners and keyboard cancels without pan or history; logical ports still connect', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }), sw = h.circuit.placeModule('DIGITAL_SWITCH', { x: -6, y: 0, z: 0 })
    await nextTick(); h.flush(); h.circuit.past = []
    const first = `${bb}.contact:terminal:A:01`
    h.editor.connect(first)
    const camera = h.manager.camera.position.clone(), empty = h.eventAt({ x: -3.25, y: .37, z: -.845 }, 1, 2)
    h.editor.pointerMove(empty); h.editor.pointerDown(empty); h.editor.pointerUp(empty)
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 1)
    h.editor.keydown({ key: 'Backspace', preventDefault() {} } as KeyboardEvent)
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 0); assert.equal(h.workspace.pendingPort, first)
    h.editor.pointerDown(h.pointer(500, 350, 1, 2))
    assert.equal(h.workspace.pendingPort, first); assert.equal(h.editor.wireRouting.controlPoints.value.length, 1)
    h.editor.keydown({ key: 'Escape' } as KeyboardEvent)
    assert.equal(h.workspace.pendingPort, null); assert.equal(h.circuit.past.length, 0); assert.ok(h.manager.camera.position.equals(camera))
    h.editor.connect(`${sw}.OUT`); h.editor.connect(first); await nextTick()
    assert.equal(h.circuit.graph!.connections.length, 1); assert.equal(h.circuit.past.length, 1)
    assert.equal(resolveElectricalNets(h.circuit.graph!).nets.find(n => n.drivers.includes(`${sw}.OUT`))!.endpoints.includes(first), true)
    h.editor.connect(first); h.editor.keydown({ key: 'Escape' } as KeyboardEvent)
    assert.equal(h.workspace.pendingPort, null); assert.equal(h.circuit.past.length, 1)
  } finally { h.dispose() }
})

test('bend and segment dragging commit once each while endpoints and electrical nets remain fixed', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wire = { source: `${bb}.contact:terminal:A:01`, destination: `${bb}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#d8493f', routeMode: 'FREE', thickness: .036, height: .03, controlPoints: [
      { space: 'module', moduleId: bb, position: { x: -3.51, y: .36, z: -.845 } },
      { space: 'module', moduleId: bb, position: { x: -3.51, y: .36, z: .845 } },
    ] })
    h.workspace.setTool('select'); h.workspace.selectWire(wire.source, wire.destination)
    await nextTick(); h.flush(); h.circuit.past = []
    const nets = resolveElectricalNets(h.circuit.graph!).nets
    const handle = h.manager.wireRoute(wire)!.handles[0]
    h.editor.pointerDown(h.eventAt(handle.position))
    assert.equal(h.captured.size, 1)
    for (let i = 0; i < 20; i++) h.editor.pointerMove(h.eventAt({ x: -3.25, y: .36, z: -.845 }, 1, 0, true))
    assert.equal(h.circuit.past.length, 0)
    h.editor.pointerUp(h.eventAt({ x: -3.25, y: .36, z: -.845 }, 1, 0, true)); await nextTick(); h.flush()
    assert.equal(h.circuit.past.length, 1); assert.equal(h.captured.size, 0)
    assert.ok(Math.abs(readWireVisual(h.circuit.graph!.connections[0]).controlPoints[0].position.x + 3.25) < 1e-8)
    const route = h.manager.wireRoute(wire)!, segment = route.segments.find(s => s.fromHandle === 0 && s.toHandle === 1)!
    const middle = { x: (segment.start.x + segment.end.x) / 2, y: .36, z: 0 }
    h.editor.pointerDown(h.eventAt(middle)); h.editor.pointerMove(h.eventAt({ ...middle, x: middle.x + .26 }, 1, 0, true)); h.editor.pointerUp(h.eventAt({ ...middle, x: middle.x + .26 }, 1, 0, true)); await nextTick()
    assert.equal(h.circuit.past.length, 2)
    assert.deepEqual(resolveElectricalNets(h.circuit.graph!).nets, nets)
    assert.deepEqual({ source: h.circuit.graph!.connections[0].source, destination: h.circuit.graph!.connections[0].destination }, wire)
    h.circuit.undo(); h.circuit.redo(); await nextTick()
    assert.deepEqual(resolveElectricalNets(h.circuit.graph!).nets, nets)
  } finally { h.dispose() }
})

test('add/remove bends color and mode edit visuals only, and cancelled or stale captured edits do not commit', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wire = { source: `${bb}.contact:terminal:A:01`, destination: `${bb}.contact:terminal:J:08` }
    const visual = { version: 1 as const, color: '#d8493f', routeMode: 'FREE' as const, thickness: .036, height: .03, controlPoints: [
      { space: 'module' as const, moduleId: bb, position: { x: -3.51, y: .36, z: -.845 } },
      { space: 'module' as const, moduleId: bb, position: { x: -3.51, y: .36, z: .845 } },
    ] }
    h.circuit.connectEndpoints(wire.source, wire.destination, visual)
    h.workspace.setTool('select'); h.workspace.selectWire(wire.source, wire.destination); await nextTick(); h.flush(); h.circuit.past = []
    const middle = h.eventAt({ x: -3.51, y: .36, z: 0 })
    h.editor.wireRouting.doubleClick(middle as unknown as MouseEvent); await nextTick()
    assert.equal(readWireVisual(h.circuit.graph!.connections[0]).controlPoints.length, 3)
    h.workspace.selectedWireBend = 1; h.editor.keydown({ key: 'Delete', preventDefault() {} } as KeyboardEvent); await nextTick()
    assert.equal(h.circuit.graph!.connections.length, 1); assert.equal(readWireVisual(h.circuit.graph!.connections[0]).controlPoints.length, 2)
    h.editor.wireRouting.setColor('#8656a8'); h.editor.wireRouting.setRouteMode('ORTHOGONAL'); await nextTick()
    assert.equal(h.circuit.past.length, 4)
    assert.equal(readWireVisual(h.circuit.graph!.connections[0]).color, '#8656a8')
    const handle = h.manager.wireRoute(wire)!.handles[0], before = h.circuit.snapshot()
    h.editor.pointerDown(h.eventAt(handle.position)); h.editor.pointerMove(h.eventAt({ x: -3, y: .36, z: -.845 }))
    h.editor.pointerUp(h.eventAt({ x: -3, y: .36, z: -.845 }, 2)); assert.equal(h.captured.size, 1)
    h.editor.keydown({ key: 'Escape' } as KeyboardEvent); assert.equal(h.captured.size, 0); assert.equal(h.circuit.snapshot(), before)
    h.editor.pointerDown(h.eventAt(h.manager.wireRoute(wire)!.handles[0].position))
    h.circuit.disconnectPorts(wire.source, wire.destination); h.circuit.connectEndpoints(wire.source, wire.destination, visual)
    const history = h.circuit.past.length
    h.editor.pointerUp(h.eventAt({ x: -2, y: .36, z: -.845 })); await nextTick()
    assert.equal(h.circuit.past.length, history); assert.equal(readWireVisual(h.circuit.graph!.connections[0]).color, '#d8493f')
  } finally { h.dispose() }
})

test('input-first orthogonal preview keeps its exact shape when canonical endpoints reverse on commit', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('DIGITAL_SWITCH', { x: -3, y: 0, z: -2 }), b = h.circuit.placeModule('LED', { x: 3, y: 0, z: 2 })
    h.workspace.wireRouteMode = 'ORTHOGONAL'; await nextTick(); h.flush()
    h.editor.connect(`${b}.IN`); h.editor.pointerMove(h.endpointEvent(`${a}.OUT`)); h.flush()
    const preview = h.manager.scene.getObjectByName('wire-drawing-preview')!.userData.route.points.map((p: { x: number; y: number; z: number }) => ({ ...p }))
    h.editor.connect(`${a}.OUT`); await nextTick(); h.flush()
    const wire = h.circuit.graph!.connections[0]
    const route = h.manager.wireRoute(wire)!
    assert.deepEqual(route.points, preview.reverse())
    assert.ok(route.handles.every(handle => Math.hypot(handle.position.x - route.points.at(-1)!.x, handle.position.y - route.points.at(-1)!.y, handle.position.z - route.points.at(-1)!.z) > 1e-8), 'pinned endpoint cannot become a bend handle')
  } finally { h.dispose() }
})

test('a bend drag returning to its starting route creates no history entry', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wire = { source: `${bb}.contact:terminal:A:01`, destination: `${bb}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#d8493f', routeMode: 'FREE', thickness: .036, controlPoints: [{ space: 'module', moduleId: bb, position: { x: -3.51, y: .36, z: -.845 } }] })
    h.workspace.setTool('select'); h.workspace.selectWire(wire.source, wire.destination); await nextTick(); h.flush(); h.circuit.past = []
    const handle = h.manager.wireRoute(wire)!.handles[0].position, snapshot = h.circuit.snapshot()
    h.editor.pointerDown(h.eventAt(handle)); h.editor.pointerMove(h.eventAt({ ...handle, x: handle.x + .26 }, 1, 0, true)); h.editor.pointerUp(h.eventAt(handle, 1, 0, true))
    assert.equal(h.circuit.past.length, 0); assert.equal(h.circuit.snapshot(), snapshot)
  } finally { h.dispose() }
})

test('outside-board bends are world anchored and use the outside grid after the board moves', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush()
    h.editor.connect(`${bb}.contact:terminal:A:01`)
    h.editor.pointerDown(h.eventAt({ x: 6, y: .37, z: 3 }, 1, 2))
    const point = h.editor.wireRouting.controlPoints.value[0]
    assert.equal(point.space, 'world')
    assert.ok(Math.abs(point.position.x - 5.98) < 1e-8); assert.ok(Math.abs(point.position.z - 2.99) < 1e-8)
    h.editor.connect(`${bb}.contact:terminal:J:08`); await nextTick()
    const wire = h.circuit.graph!.connections[0]
    h.circuit.moveModule(bb, { x: 1, y: .2, z: 2 }); h.circuit.rotateModule(bb, 37); await nextTick(); h.flush()
    const stored = readWireVisual(h.circuit.graph!.connections[0]).controlPoints[0]
    assert.deepEqual(stored, point)
    const handle = h.manager.wireRoute(wire)!.handles.find(p => Math.abs(p.position.x - 5.98) < 1e-8 && Math.abs(p.position.z - 2.99) < 1e-8)
    assert.ok(handle); assert.ok(Math.abs(handle.position.y - .37) < 1e-8)
  } finally { h.dispose() }
})

test('Wire mode endpoints win over selected segment margins at occupied and adjacent sockets', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wire = { source: `${bb}.contact:terminal:A:01`, destination: `${bb}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#d8493f', routeMode: 'FREE', thickness: .036, controlPoints: [] })
    h.workspace.selectWire(wire.source, wire.destination); await nextTick(); h.flush(); h.circuit.past = []
    for (const endpoint of [wire.source, `${bb}.contact:terminal:B:01`]) {
      h.editor.pointerMove(h.endpointEvent(endpoint)); h.editor.pointerDown(h.endpointEvent(endpoint))
      assert.equal(h.workspace.pendingPort, endpoint)
      assert.equal(h.editor.wireRouting.editing.value, false); assert.equal(h.editor.wireRouting.drawing.value, true)
      h.editor.keydown({ key: 'Escape' } as KeyboardEvent)
      h.workspace.selectWire(wire.source, wire.destination); await nextTick(); h.flush()
    }
    assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})
