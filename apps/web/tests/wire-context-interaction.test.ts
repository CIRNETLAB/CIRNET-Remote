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

test('stationary right release on an existing wire opens its menu while its press remains available for Orbit', async () => {
  const { h, wire, p } = await setupWire()
  try {
    const before = h.circuit.exportGraph(), camera = h.manager.camera.position.clone()
    let consumed = false
    const event = h.pointer(p.x, p.y, 1, 2); event.stopImmediatePropagation = () => { consumed = true }
    h.editor.pointerDown(event); await nextTick()
    assert.equal(Boolean(h.editor.wireRouting.contextMenuState.value), false, 'right press waits for release')
    assert.equal(consumed, false, 'OrbitControls receives the right press')
    h.editor.contextMenu({ ...event, type: 'contextmenu' } as unknown as MouseEvent)
    assert.equal(Boolean(h.editor.wireRouting.contextMenuState.value), false, 'native contextmenu cannot bypass release')
    h.editor.pointerUp(event)
    assert.ok(h.editor.wireRouting.contextMenuState.value, 'wire hit opens a context menu')
    assert.deepEqual(h.editor.wireRouting.contextMenuState.value!.wire, wire)
    assert.equal(consumed, false)
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
    h.editor.contextMenu({ ...event, type: 'contextmenu' } as unknown as MouseEvent)
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
    h.editor.pointerDown(h.pointer(p.x, p.y, 1, 2))
    assert.equal(h.workspace.placementType, 'RESISTOR_AXIAL', 'the press remains available for Orbit until a short release is known')
    h.editor.pointerUp(h.pointer(p.x, p.y, 1, 2)); assert.equal(h.workspace.placementType, null)
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

test('right Orbit drag preserves a flexible placement draft and cannot open a wire menu', async () => {
  const {h,p}=await setupWire()
  try {
    h.workspace.armPlacement('RESISTOR_AXIAL');await nextTick()
    const before=h.circuit.exportGraph(),epoch=h.workspace.placementEpoch
    let consumed=false
    const down=h.pointer(p.x,p.y,1,2);down.stopImmediatePropagation=()=>{consumed=true}
    h.editor.pointerDown(down);h.editor.pointerMove(h.pointer(p.x+15,p.y+8,1,2));h.editor.pointerUp(h.pointer(p.x+15,p.y+8,1,2))
    assert.equal(consumed,false,'the real Orbit listener must receive the right press')
    assert.equal(h.workspace.placementType,'RESISTOR_AXIAL');assert.equal(h.workspace.placementEpoch,epoch)
    assert.equal(h.editor.wireRouting.contextMenuState.value,null)
    assert.equal(h.circuit.exportGraph(),before);assert.equal(h.circuit.past.length,0)
  }finally{h.dispose()}
})

test('editor pointer priority commits and repeats duplicate previews; invalid click and right cancel never open another menu', async () => {
  const { h, board, wire, p } = await setupWire()
  try {
    const open = h.pointer(p.x, p.y, 1, 2)
    h.editor.pointerDown(open); h.editor.pointerUp(open)
    assert.equal(h.editor.wireRouting.menuDuplicate(), true)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, true)
    assert.equal(h.circuit.graph!.connections.length, 1); assert.equal(h.circuit.past.length, 0)
    h.editor.pointerDown(h.pointer(p.x, p.y)); h.editor.pointerUp(h.pointer(p.x, p.y))
    await nextTick(); h.flush()
    assert.equal(h.circuit.graph!.connections.length, 2); assert.equal(h.circuit.past.length, 1)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, true, 'root graph watcher preserves its own committed preview session')
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.candidate!.wire.source, `${board}.contact:terminal:A:03`)
    // Moving back to the source would recreate the original edge. A left click
    // cannot select that edge, add history, or advance the next paste offset.
    h.editor.pointerMove(h.endpointEvent(wire.source))
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.valid, false)
    h.editor.pointerDown(h.endpointEvent(wire.source)); await nextTick()
    assert.equal(h.circuit.graph!.connections.length, 2); assert.equal(h.circuit.past.length, 1)
    const right = h.pointer(p.x, p.y, 1, 2)
    h.editor.pointerDown(right)
    h.editor.contextMenu(right as unknown as MouseEvent)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false)
    assert.equal(h.editor.wireRouting.contextMenuState.value, null)
    assert.equal(h.editor.wireRouting.canPaste.value, true)
    h.editor.pointerDown(right); h.editor.pointerUp(right); assert.ok(h.editor.wireRouting.contextMenuState.value)
    h.editor.wireRouting.menuPaste()
    assert.equal(h.circuit.graph!.connections.length, 3); assert.equal(h.circuit.past.length, 2)
    assert.equal(h.circuit.graph!.connections[2].source, `${board}.contact:terminal:A:03`)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false, 'menu Paste commits without a confirmation ghost')
    h.editor.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} } as KeyboardEvent)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false); assert.equal(h.editor.wireRouting.canPaste.value, true)
  } finally { h.dispose() }
})

test('native double-click after repeated pastes cannot enter bend editing or delete the selected committed wire', async () => {
  const { h, wire } = await setupWire()
  try {
    h.manager.setZoom(50)
    h.editor.wireRouting.openContextMenu(0, 0, wire); h.editor.wireRouting.menuDuplicate(); h.flush()
    const route = h.manager.scene.getObjectByName('wire-duplicate-preview')!.userData.route as { segments: { editable: boolean; start: Vector3; end: Vector3 }[] }
    const segment = route.segments.filter(item => item.editable).sort((a, b) => Math.hypot(b.end.x - b.start.x, b.end.z - b.start.z) - Math.hypot(a.end.x - a.start.x, a.end.z - a.start.z))[0]
    const p = h.manager.project(new Vector3(segment.start.x, segment.start.y, segment.start.z).lerp(new Vector3(segment.end.x, segment.end.y, segment.end.z), .5))
    const click = h.pointer(p.x, p.y)
    for (let i = 0; i < 2; i++) { h.editor.pointerDown(click); h.editor.pointerUp(click); await nextTick(); h.flush() }
    assert.ok(h.manager.pickWireEdit(p.x, p.y, h.workspace.selectedWire!), 'fixture reaches an editable segment under the next ghost')
    const graph = h.circuit.exportGraph(), history = h.circuit.past.length
    h.editor.wireRouting.doubleClick(click as unknown as MouseEvent); await nextTick()
    assert.equal(h.circuit.exportGraph(), graph); assert.equal(h.circuit.past.length, history)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, true)
    h.editor.keydown({ key: 'Delete', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} } as KeyboardEvent)
    assert.equal(h.circuit.exportGraph(), graph); assert.equal(h.circuit.past.length, history)
  } finally { h.dispose() }
})
