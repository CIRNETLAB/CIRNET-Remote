import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { wireHarness } from './helpers/wireHarness'
import { Vector3 } from 'three'

async function setupWire() {
  const h = wireHarness(), board = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
  const wire = { source: `${board}.contact:terminal:A:01`, destination: `${board}.contact:terminal:J:08` }
  h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#37aadd', routeMode: 'FREE', thickness: .04, height: .2, controlPoints: [{ space: 'world', position: { x: -2, y: .9, z: 0 } }] })
  h.workspace.setTool('select'); await nextTick(); h.flush(); h.circuit.past = []
  const points = h.manager.wireRoute(wire)!.points
  const p = points.slice(1).map((point, index) => h.manager.project(new Vector3((point.x + points[index]!.x) / 2, (point.y + points[index]!.y) / 2, (point.z + points[index]!.z) / 2))).find(p => h.manager.pick(p.x, p.y)?.kind === 'wire')
  assert.ok(p, 'fixture must hit a rendered existing wire')
  return { h, board, wire, p }
}

test('right-click on an existing wire opens its menu before Orbit without a graph or history mutation', async () => {
  const { h, wire, p } = await setupWire()
  try {
    const before = h.circuit.exportGraph(), camera = h.manager.camera.position.clone()
    let consumed = false
    const event = h.pointer(p.x, p.y, 1, 2); event.stopImmediatePropagation = () => { consumed = true }
    h.editor.pointerDown(event); await nextTick()
    assert.ok(h.editor.wireRouting.contextMenuState.value, 'wire hit opens a context menu')
    assert.deepEqual(h.editor.wireRouting.contextMenuState.value!.wire, wire)
    assert.equal(consumed, true, 'OrbitControls must not see this press')
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
    h.editor.contextMenu({ ...event, type: 'contextmenu' } as unknown as MouseEvent)
    h.editor.pointerUp(event)
    assert.ok(h.manager.camera.position.equals(camera))
    h.editor.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} } as KeyboardEvent)
    assert.equal(h.editor.wireRouting.contextMenuState.value, null)
  } finally { h.dispose() }
})

test('drawing, placement and zoom cancellation win over wire menus while empty right-drag stays available for Orbit', async () => {
  const { h, board, p } = await setupWire()
  try {
    h.editor.connect(`${board}.contact:terminal:A:03`)
    h.editor.pointerDown(h.pointer(p.x, p.y, 1, 2)); await nextTick()
    assert.equal(h.editor.wireRouting.contextMenuState.value, null)
    assert.equal(h.editor.wireRouting.drawing.value, true); assert.equal(h.editor.wireRouting.controlPoints.value.length, 1)
    h.editor.cancel(); h.workspace.armPlacement('RESISTOR_AXIAL')
    h.editor.pointerDown(h.pointer(p.x, p.y, 1, 2)); assert.equal(h.workspace.placementType, null)
    assert.equal(h.editor.wireRouting.contextMenuState.value, null)
    h.workspace.toggleZoomArea(); h.editor.pointerDown(h.pointer(p.x, p.y, 1, 2))
    assert.equal(h.workspace.zoomAreaActive, false); assert.equal(h.editor.wireRouting.contextMenuState.value, null)
    let consumed = false
    const empty = h.pointer(20, 30, 1, 2); empty.stopImmediatePropagation = () => { consumed = true }
    assert.equal(h.manager.pick(20, 30), null)
    h.editor.pointerDown(empty); h.editor.pointerMove(h.pointer(p.x, p.y, 1, 2)); h.editor.pointerUp(empty)
    h.editor.contextMenu({ ...empty, clientX: p.x, clientY: p.y } as unknown as MouseEvent)
    assert.equal(consumed, false, 'empty right press remains with existing OrbitControls')
    assert.equal(h.editor.wireRouting.contextMenuState.value, null, 'ending Orbit over a wire does not open a menu')
  } finally { h.dispose() }
})
