import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { wireHarness } from './helpers/wireHarness'
import { readWireVisual } from '../src/wires/wireVisual'
import { resolveElectricalNets } from '../src/electrical/nets'
import { Mesh, Vector3 } from 'three'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { assertHealthyWireGeometry } from './helpers/wireGeometryAssertions'

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
    assert.ok(handle); assert.ok(Math.abs(handle.position.y - .36) < 1e-8)
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

test('RMB toggles the last provisional corner by snapped position or small motion without cancelling the draft', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush(); h.circuit.past = []
    const first = `${bb}.contact:terminal:A:01`
    h.editor.connect(first)
    const point = h.eventAt({ x: -3.25, y: .37, z: -.845 }, 1, 2)
    h.editor.pointerDown(point); assert.equal(h.editor.wireRouting.controlPoints.value.length, 1)
    h.editor.pointerDown(point); assert.equal(h.editor.wireRouting.controlPoints.value.length, 0)
    assert.equal(h.workspace.pendingPort, first)
    h.editor.pointerDown(h.eventAt({ x: -3.25, y: .37, z: -.845 }, 1, 2, true))
    h.editor.pointerMove(h.pointer(point.clientX + 1, point.clientY + 1, 1, 0, true))
    h.editor.pointerDown(h.pointer(point.clientX + 1, point.clientY + 1, 1, 2, true))
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 0)
    for (const p of [{ x: -3.25, y: .37, z: -.845 }, { x: -3, y: .37, z: -.2 }, { x: -3.5, y: .37, z: .4 }, { x: -2.8, y: .37, z: .9 }]) {
      const event = h.eventAt(p, 1, 2); h.editor.pointerMove(event); h.editor.pointerDown(event)
    }
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 4)
    assert.equal(h.workspace.pendingPort, first); assert.equal(h.circuit.past.length, 0)
    assert.equal(h.editor.wireRouting.routeMode.value, 'FREE')
    h.editor.keydown({ key: 'Escape' } as KeyboardEvent); assert.equal(h.workspace.pendingPort, null)
  } finally { h.dispose() }
})

test('fifty completed bend and segment gestures keep stable user anchors, geometry, nets and v1 history/files', async () => {
  for (const mode of ['FREE', 'ORTHOGONAL'] as const) {
    const h = wireHarness()
    try {
      const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
      const wire = { source: `${bb}.contact:terminal:A:01`, destination: `${bb}.contact:terminal:J:08` }
      h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, routeMode: mode, color: '#d8493f', thickness: .052, height: .04, controlPoints: [
        { space: 'module', moduleId: bb, position: { x: -3.25, y: .37, z: -.845 } },
        { space: 'module', moduleId: bb, position: { x: -2.99, y: .37, z: .845 } },
      ] })
      h.workspace.setTool('select'); h.workspace.selectWire(wire.source, wire.destination); await nextTick(); h.flush(); h.circuit.past = []
      const nets = resolveElectricalNets(h.circuit.graph!).nets
      for (let i = 0; i < 50; i++) {
        const route = h.manager.wireRoute(wire)!, sign = i % 4 < 2 ? 1 : -1
        let start: { x: number; y: number; z: number }
        if (i % 2 === 0) start = route.handles.find(handle => handle.index === 0)!.position
        else {
          const segment = route.segments.filter(segment => segment.beforeUserIndex === 0 && segment.afterUserIndex === 1).sort((a, b) => Math.hypot(b.end.x - b.start.x, b.end.z - b.start.z) - Math.hypot(a.end.x - a.start.x, a.end.z - a.start.z))[0]
          start = { x: (segment.start.x + segment.end.x) / 2, y: .37, z: (segment.start.z + segment.end.z) / 2 }
        }
        const end = { ...start, x: start.x + .13 * sign, z: start.z + .13 * sign }
        h.editor.pointerDown(h.eventAt(start)); assert.equal(h.editor.wireRouting.editing.value, true)
        const history = h.circuit.past.length
        for (let burst = 0; burst < 3; burst++) h.editor.pointerMove(h.eventAt(end, 1, 0, true))
        assert.equal(h.circuit.past.length, history)
        h.editor.pointerUp(h.eventAt(end, 1, 0, true)); await nextTick(); h.flush()
        assert.equal(h.circuit.past.length, i + 1, 'one history entry per completed gesture')
        assert.equal(readWireVisual(h.circuit.graph!.connections[0]).controlPoints.length, 2)
        assert.deepEqual({ source: h.circuit.graph!.connections[0].source, destination: h.circuit.graph!.connections[0].destination }, wire)
        assert.deepEqual(resolveElectricalNets(h.circuit.graph!).nets, nets)
        assertHealthyWireGeometry((h.manager.wires.children[0] as Mesh).geometry)
        assert.equal(h.captured.size, 0)
      }
      const current = h.circuit.snapshot()
      h.circuit.undo(); h.circuit.redo(); await nextTick(); assert.equal(h.circuit.snapshot(), current)
      const saved = h.circuit.exportGraph(), reopened = parseCircuitFile(saved)
      assert.deepEqual(reopened.connections, h.circuit.graph!.connections)
      h.circuit.importGraph(reopened); await nextTick(); h.flush()
      assert.deepEqual(resolveElectricalNets(h.circuit.graph!).nets, nets)
      assertHealthyWireGeometry((h.manager.wires.children[0] as Mesh).geometry)
    } finally { h.dispose() }
  }
})

test('draft copper appears on start and its free tip stays at the preview end through provisional corners', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush()
    h.editor.connect(`${bb}.contact:terminal:A:01`); h.flush()
    const preview = h.manager.scene.getObjectByName('wire-drawing-preview') as Mesh
    assert.ok(preview.getObjectByName('wire-terminal-source')); assert.ok(preview.getObjectByName('wire-terminal-free'))
    for (const point of [{ x: -3.25, y: .36, z: -.845 }, { x: -3, y: .36, z: 0 }]) {
      const event = h.eventAt(point, 1, 2, true); h.editor.pointerMove(event); h.editor.pointerDown(event); h.flush()
      const tip = preview.getObjectByName('wire-terminal-free') as Mesh
      assert.ok(tip.localToWorld(new Vector3(0, -.5, 0)).distanceTo(new Vector3(point.x, point.y, point.z)) < 1e-8)
      assertHealthyWireGeometry(preview.geometry)
    }
  } finally { h.dispose() }
})

test('fifty terminal-adjacent segment gestures seed anchors once without changing connectivity', async () => {
  for (const mode of ['FREE', 'ORTHOGONAL'] as const) {
    const h = wireHarness()
    try {
      const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
      const wire = { source: `${bb}.contact:terminal:A:01`, destination: `${bb}.contact:terminal:J:08` }
      h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, routeMode: mode, color: '#d8493f', thickness: .052, height: .04, controlPoints: [] })
      h.workspace.setTool('select'); h.workspace.selectWire(wire.source, wire.destination)
      await nextTick(); h.flush(); h.circuit.past = []
      h.manager.setZoom(250)
      const nets = resolveElectricalNets(h.circuit.graph!).nets
      for (let i = 0; i < 50; i++) {
        const segment = h.manager.wireRoute(wire)!.segments.find(segment => segment.editable)!
        const start = { x: (segment.start.x + segment.end.x) / 2, y: .37, z: (segment.start.z + segment.end.z) / 2 }
        const end = { ...start, x: start.x + .13 + i * .003, z: start.z + .17 + i * .003 }
        h.editor.pointerDown(h.eventAt(start)); assert.equal(h.editor.wireRouting.editing.value, true)
        const history = h.circuit.past.length
        h.editor.pointerMove(h.eventAt(end, 1, 0, true)); assert.equal(h.circuit.past.length, history)
        h.editor.pointerUp(h.eventAt(end, 1, 0, true)); await nextTick(); h.flush()
        assert.equal(h.circuit.past.length, i + 1)
        assert.equal(readWireVisual(h.circuit.graph!.connections[0]).controlPoints.length, 2)
        assert.deepEqual({ source: h.circuit.graph!.connections[0].source, destination: h.circuit.graph!.connections[0].destination }, wire)
        assert.deepEqual(resolveElectricalNets(h.circuit.graph!).nets, nets)
        assertHealthyWireGeometry((h.manager.wires.children[0] as Mesh).geometry)
      }
    } finally { h.dispose() }
  }
})

test('same snapped corner toggles after larger screen travel and blocked surfaces retain the last valid preview', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    h.circuit.placeModule('POWER_SUPPLY', { x: 4, y: 0, z: 0 }); await nextTick(); h.flush()
    h.manager.setZoom(250)
    h.editor.connect(`${bb}.contact:terminal:A:01`)
    const event = h.eventAt({ x: -3.25, y: .37, z: -.845 }, 1, 2)
    h.editor.pointerDown(event); assert.equal(h.editor.wireRouting.controlPoints.value.length, 1)
    h.editor.pointerMove(h.pointer(event.clientX + 5, event.clientY)); h.editor.pointerDown(h.pointer(event.clientX + 1, event.clientY, 1, 2))
    assert.equal(h.editor.wireRouting.controlPoints.value.length, 0, 'same snap can toggle after traveling beyond the threshold')
    h.manager.setZoom(100)
    h.editor.pointerMove(h.eventAt({ x: -3, y: .37, z: 0 }, 1, 0, true)); h.flush()
    const preview = h.manager.scene.getObjectByName('wire-drawing-preview') as Mesh, geometry = preview.geometry
    h.editor.pointerMove(h.eventAt({ x: 4, y: 2.8, z: 0 })); h.flush()
    assert.equal(preview.visible, true, 'an obstructed drawing plane cannot hide the source copper and entire wire')
    assert.equal(preview.geometry, geometry)
    assert.equal(h.editor.wireRouting.drawing.value, true)
  } finally { h.dispose() }
})

test('coincident wires retain order priorities while lane reordering preserves nets, history and v1 files', async () => {
  const h = wireHarness()
  try {
    const wires = Array.from({ length: 3 }, () => ({ source: `${h.circuit.placeModule('DIGITAL_SWITCH', { x: -2, y: 0, z: 0 })}.OUT`, destination: `${h.circuit.placeModule('LED', { x: 2, y: 0, z: 0 })}.IN` }))
    await nextTick(); h.flush()
    for (const [index, wire] of wires.entries()) {
      h.editor.connect(wire.source); h.editor.connect(wire.destination); await nextTick(); h.flush()
      assert.equal(readWireVisual(h.circuit.graph!.connections[index]).layer ?? 0, index)
    }
    const nets = resolveElectricalNets(h.circuit.graph!).nets, electrical = h.circuit.graph!.connections.map(({ source, destination }) => ({ source, destination }))
    h.workspace.setTool('select'); h.workspace.selectWire(wires[0].source, wires[0].destination); await nextTick(); h.circuit.past = []
    const stack = Reflect.get(h.editor.wireRouting, 'setStackLayer') as (action: 'up' | 'down' | 'top') => void
    assert.equal(typeof stack, 'function')
    stack('up'); await nextTick(); assert.equal(readWireVisual(h.circuit.graph!.connections[0]).layer, 1)
    assert.equal(new Set(h.circuit.graph!.connections.map(wire => readWireVisual(wire).layer ?? 0)).size, 3, 'priority swap keeps a deterministic lane order')
    stack('down'); await nextTick(); assert.equal(readWireVisual(h.circuit.graph!.connections[0]).layer, 0)
    stack('down'); await nextTick(); assert.equal(h.circuit.past.length, 2, 'clamped no-op creates no history')
    stack('top'); await nextTick(); h.flush(); assert.equal(readWireVisual(h.circuit.graph!.connections[0]).layer, 2)
    assert.equal(h.circuit.past.length, 3)
    const route = h.manager.wireRoute(wires[0])!, p = route.renderSegments!.filter(segment => segment.editable).sort((a, b) => Math.hypot(b.end.x - b.start.x, b.end.z - b.start.z) - Math.hypot(a.end.x - a.start.x, a.end.z - a.start.z))[0]
    const hit = h.manager.pick(h.eventAt(p.start).clientX, h.eventAt(p.start).clientY)
    assert.ok(hit)
    const midpoint = { x: (p.start.x + p.end.x) / 2, y: (p.start.y + p.end.y) / 2, z: (p.start.z + p.end.z) / 2 }, pointer = h.eventAt(midpoint)
    const top = h.manager.pick(pointer.clientX, pointer.clientY)
    assert.equal(top?.kind, 'wire'); assert.equal((top as { source: string }).source, wires[0].source)
    assert.equal(h.circuit.past.length, 3, 'picking the top visible wire does not create a circuit command')
    assert.deepEqual(resolveElectricalNets(h.circuit.graph!).nets, nets)
    assert.deepEqual(h.circuit.graph!.connections.map(({ source, destination }) => ({ source, destination })), electrical)
    const current = h.circuit.snapshot(); h.circuit.undo(); h.circuit.redo(); await nextTick(); assert.equal(h.circuit.snapshot(), current)
    const loaded = parseCircuitFile(h.circuit.exportGraph()); assert.deepEqual(loaded.connections, h.circuit.graph!.connections)
  } finally { h.dispose() }
})

test('fifty elevated layer bend edits preserve the stored height, constant geometry and electrical endpoints', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wire = { source: `${bb}.contact:terminal:A:01`, destination: `${bb}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#397ec6', routeMode: 'FREE', thickness: .052, height: .04, layer: 2, controlPoints: [
      { space: 'module', moduleId: bb, position: { x: -3.25, y: .6, z: -.4 } }, { space: 'world', position: { x: -2.99, y: .65, z: .4 } },
    ] })
    h.workspace.setTool('select'); h.workspace.selectWire(wire.source, wire.destination); await nextTick(); h.flush(); h.circuit.past = []
    const nets = resolveElectricalNets(h.circuit.graph!).nets
    for (let i = 0; i < 50; i++) {
      const start = h.manager.wireRoute(wire)!.handles[0].position, end = { ...start, x: start.x + (i % 2 ? -.065 : .065) }
      h.editor.pointerDown(h.eventAt(start)); h.editor.pointerMove(h.eventAt(end, 1, 0, true)); h.editor.pointerUp(h.eventAt(end, 1, 0, true)); await nextTick(); h.flush()
      const visual = readWireVisual(h.circuit.graph!.connections[0])
      assert.ok(Math.abs(visual.controlPoints[0].position.y - .6) < 1e-8, 'XZ edit must not flatten a raised anchor or bake in layer offset')
      assert.equal(visual.controlPoints[1].position.y, .65); assert.equal(visual.layer, 2); assert.equal(visual.controlPoints.length, 2)
      assert.equal(h.circuit.past.length, i + 1); assert.deepEqual(resolveElectricalNets(h.circuit.graph!).nets, nets)
      assertHealthyWireGeometry((h.manager.wires.children[0] as Mesh).geometry)
    }
  } finally { h.dispose() }
})

test('ninety-degree contact crossing puts the later body above without creating a junction', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush()
    const wires = [{ source: `${bb}.contact:terminal:C:01`, destination: `${bb}.contact:terminal:C:12` }, { source: `${bb}.contact:terminal:A:06`, destination: `${bb}.contact:terminal:J:06` }]
    for (const wire of wires) { h.editor.connect(wire.source); h.editor.connect(wire.destination); await nextTick(); h.flush() }
    assert.deepEqual(h.circuit.graph!.connections.map(wire => readWireVisual(wire).layer), [0, 1])
    const resolved = resolveElectricalNets(h.circuit.graph!)
    assert.notEqual(resolved.endpointNetIds[wires[0].source], resolved.endpointNetIds[wires[1].source])
    const first = h.manager.wireRoute(wires[0])!, second = h.manager.wireRoute(wires[1])!
    assert.equal(second.terminalLeads.source!.y, first.terminalLeads.source!.y)
    assert.ok(second.renderPoints!.some(point => point.y > .41), 'upper wire only lifts at the crossing')
    assert.ok(second.renderPoints!.some(point => point.y === second.terminalLeads.source!.y))
    h.workspace.setTool('select'); h.workspace.selectWire(wires[0].source, wires[0].destination); await nextTick()
    h.editor.wireRouting.setStackLayer('top'); await nextTick()
    assert.deepEqual(resolveElectricalNets(h.circuit.graph!), resolved)
  } finally { h.dispose() }
})

test('manual crossing order swaps priorities atomically and derived bridges resolve the remaining ties', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush()
    const wires = [
      { source: `${bb}.contact:terminal:C:01`, destination: `${bb}.contact:terminal:C:12` },
      { source: `${bb}.contact:terminal:H:01`, destination: `${bb}.contact:terminal:H:12` },
      { source: `${bb}.contact:terminal:A:06`, destination: `${bb}.contact:terminal:J:06` },
    ]
    for (const wire of wires) { h.editor.connect(wire.source); h.editor.connect(wire.destination); await nextTick(); h.flush() }
    const layers = () => h.circuit.graph!.connections.map(wire => readWireVisual(wire).layer ?? 0)
    assert.deepEqual(layers(), [0, 0, 1])
    const nets = resolveElectricalNets(h.circuit.graph!)
    h.workspace.setTool('select'); h.workspace.selectWire(wires[0].source, wires[0].destination); await nextTick(); h.circuit.past = []
    h.editor.wireRouting.setStackLayer('up'); await nextTick(); h.flush()
    assert.deepEqual(layers(), [2, 0, 1], 'priority reorder preserves all other relative ordering without global heights')
    assert.equal(h.circuit.past.length, 1); assert.deepEqual(resolveElectricalNets(h.circuit.graph!), nets)
    h.circuit.undo(); await nextTick(); assert.deepEqual(layers(), [0, 0, 1])
    h.circuit.redo(); await nextTick(); assert.deepEqual(layers(), [2, 0, 1])
  } finally { h.dispose() }
})

test('dragging and inserting on a displayed bundle maps back to semantic anchors without baking in lane offsets', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wires = ['A', 'B'].map(row => ({ source: `${bb}.contact:terminal:${row}:01`, destination: `${bb}.contact:terminal:${row}:20` }))
    for (const [layer, wire] of wires.entries()) h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#397ec6', routeMode: 'FREE', thickness: .052, layer, controlPoints: [
      { space: 'module', moduleId: bb, position: { x: -3.5, y: .36, z: 0 } }, { space: 'module', moduleId: bb, position: { x: -2, y: .36, z: 0 } },
    ] })
    h.workspace.setTool('select'); h.workspace.selectWire(wires[0].source, wires[0].destination); await nextTick(); h.flush(); h.circuit.past = []
    h.manager.setZoom(250)
    const nets = resolveElectricalNets(h.circuit.graph!)
    for (let index = 0; index < 12; index++) {
      const before = readWireVisual(h.circuit.graph!.connections[0]), start = h.manager.wireRoute(wires[0])!.renderHandles![0].position
      const dx = index % 2 ? -.065 : .065, end = { ...start, x: start.x + dx }
      h.editor.pointerDown(h.eventAt(start)); assert.equal(h.editor.wireRouting.editing.value, true)
      h.editor.pointerMove(h.eventAt(end, 1, 0, true)); h.editor.pointerUp(h.eventAt(end, 1, 0, true)); await nextTick(); h.flush()
      const after = readWireVisual(h.circuit.graph!.connections[0])
      assert.ok(Math.abs(after.controlPoints[0].position.x - before.controlPoints[0].position.x - dx) < 1e-8)
      assert.ok(Math.abs(after.controlPoints[0].position.z) < 1e-8, 'lateral lane displacement must not become a saved bend')
      assert.equal(after.controlPoints.length, 2); assert.deepEqual(resolveElectricalNets(h.circuit.graph!), nets)
      assertHealthyWireGeometry((h.manager.wires.children[0] as Mesh).geometry)
    }
    const route = h.manager.wireRoute(wires[0])!, span = route.renderSegments!.filter(segment => segment.beforeUserIndex === 0 && segment.afterUserIndex === 1).sort((a, b) => Math.hypot(b.end.x - b.start.x, b.end.z - b.start.z) - Math.hypot(a.end.x - a.start.x, a.end.z - a.start.z))[0]
    const midpoint = { x: (span.start.x + span.end.x) / 2, y: .36, z: (span.start.z + span.end.z) / 2 }
    h.editor.wireRouting.doubleClick(h.eventAt(midpoint) as unknown as MouseEvent); await nextTick(); h.flush()
    const saved = readWireVisual(h.circuit.graph!.connections[0])
    assert.equal(saved.controlPoints.length, 3); assert.ok(Math.abs(saved.controlPoints[1].position.z) < 1e-8)
    assert.equal(h.circuit.past.length, 13)
    assert.deepEqual(parseCircuitFile(h.circuit.exportGraph()).connections, h.circuit.graph!.connections)
  } finally { h.dispose() }
})

test('adding a bend on a local bridge stores its base height rather than the derived lift', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); await nextTick(); h.flush()
    const wires = [{ source: `${bb}.contact:terminal:C:01`, destination: `${bb}.contact:terminal:C:12` }, { source: `${bb}.contact:terminal:A:06`, destination: `${bb}.contact:terminal:J:06` }]
    for (const wire of wires) { h.editor.connect(wire.source); h.editor.connect(wire.destination); await nextTick(); h.flush() }
    h.workspace.setTool('select'); h.workspace.selectWire(wires[1].source, wires[1].destination); await nextTick(); h.flush(); h.circuit.past = []
    const route = h.manager.wireRoute(wires[1])!, point = route.renderPoints!.reduce((highest, value) => value.y > highest.y ? value : highest)
    h.editor.wireRouting.doubleClick(h.eventAt(point) as unknown as MouseEvent); await nextTick(); h.flush()
    const visual = readWireVisual(h.circuit.graph!.connections[1])
    assert.equal(visual.controlPoints.length, 1)
    assert.ok(Math.abs(visual.controlPoints[0].position.y - .36) < 1e-8, 'derived bridge height is never persisted')
    assert.equal(h.circuit.past.length, 1)
  } finally { h.dispose() }
})

test('reordering one crossing preserves the relative order of other wires in its connected conflict group', async () => {
  const h = wireHarness()
  try {
    const bb = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wires = [
      { source: `${bb}.contact:terminal:A:06`, destination: `${bb}.contact:terminal:J:06` },
      { source: `${bb}.contact:terminal:H:01`, destination: `${bb}.contact:terminal:H:12` },
      { source: `${bb}.contact:terminal:C:01`, destination: `${bb}.contact:terminal:C:12` },
    ]
    for (const [index, wire] of wires.entries()) h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#397ec6', routeMode: 'FREE', thickness: .052, layer: index === 0 ? 1 : 0, controlPoints: [] })
    h.workspace.setTool('select'); h.workspace.selectWire(wires[2].source, wires[2].destination); await nextTick(); h.flush(); h.circuit.past = []
    const nets = resolveElectricalNets(h.circuit.graph!)
    h.editor.wireRouting.setStackLayer('up'); await nextTick(); h.flush()
    const priorities = h.circuit.graph!.connections.map(wire => readWireVisual(wire).layer ?? 0)
    assert.ok(priorities[2] > priorities[0], 'selected horizontal wire moves above its crossing')
    assert.ok(priorities[0] > priorities[1], 'the crossing must remain above its other horizontal neighbor')
    assert.equal(h.circuit.past.length, 1); assert.deepEqual(resolveElectricalNets(h.circuit.graph!), nets)
  } finally { h.dispose() }
})
