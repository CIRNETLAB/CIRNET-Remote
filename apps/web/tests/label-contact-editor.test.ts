import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { Vector3 } from 'three'
import { wireHarness } from './helpers/wireHarness'
import { getPartForType, MM_TO_WORLD } from '../src/data/partCatalog'

test('native editor Label preview uses the exact board plane, updates in place, commits once and cancels without history', async () => {
  const h = wireHarness()
  try {
    h.workspace.setTool('select'); const boardId = h.circuit.placeModule('BREADBOARD', { x: 0, y: .4, z: 0 }, 37)
    await nextTick(); h.editor.sync(); h.circuit.past = []
    h.workspace.armPlacement('LABEL', { text: 'Nguồn 5 V' }); await nextTick()
    const event = h.eventAt({ x: 0, y: .73, z: 0 })
    h.editor.pointerMove(event)
    assert.equal(h.circuit.graph!.modules.length, 1)
    h.workspace.updatePlacementProperties({ text: 'Điện áp\n5 V' }); await nextTick()
    h.editor.pointerDown(event); await nextTick()
    const label = h.circuit.graph!.modules.find(module => module.type === 'LABEL')!
    assert.ok(label); assert.equal(label.properties!.text, 'Điện áp\n5 V'); assert.equal(label.properties!.boardId, boardId)
    assert.equal(label.rotation, 37); assert.ok(Math.abs(label.position!.y! - (.4 + .33 + .15 * MM_TO_WORLD)) < 1e-9)
    assert.equal(h.circuit.past.length, 1); assert.equal(label.mount, undefined)
    h.circuit.undo(); await nextTick(); assert.equal(h.circuit.graph!.modules.length, 1)
    h.workspace.armPlacement('LABEL', { text: 'Cancelled' }); await nextTick(); h.editor.pointerMove(event)
    const before = h.circuit.snapshot(), history = h.circuit.past.length
    h.editor.pointerCancel(event); h.editor.pointerUp(event); await nextTick()
    assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, history); assert.equal(h.workspace.placementType, null)
  } finally { h.dispose() }
})

test('tactile canvas capture holds through its own graph update and releases original draft on tab change', async () => {
  const h = wireHarness()
  try {
    h.workspace.setTool('select'); const oldDraft = h.circuit.activeId
    const id = h.circuit.placeModule('PUSH_BUTTON_B3F1000', { x: 0, y: 0, z: 0 }); await nextTick(); h.editor.sync(); h.circuit.past = []
    const model = h.manager.models.get(id)!, actuator = model.getObjectByName('package-switch-actuator')!
    const center = actuator.getWorldPosition(new Vector3()); center.y += getPartForType('PUSH_BUTTON_B3F1000')!.package.bodyMm.y * MM_TO_WORLD / 2
    const event = h.eventAt(center)
    assert.equal(h.manager.pickContactControl(event.clientX, event.clientY)?.property, 'pressed')
    h.editor.pointerDown(event); await nextTick()
    assert.equal(h.circuit.graph!.modules.find(module => module.id === id)!.properties!.pressed, true)
    assert.equal(h.captured.size, 1); assert.equal(h.circuit.past.length, 0)
    h.circuit.createDraft(); await nextTick()
    assert.equal(h.circuit.drafts.find(draft => draft.id === oldDraft)!.graph.modules.find(module => module.id === id)!.properties!.pressed, false)
    assert.equal(h.circuit.graph!.modules.length, 0); assert.equal(h.captured.size, 0)
    const history = h.circuit.past.length; h.editor.pointerUp(event); h.editor.pointerCancel(event); await nextTick()
    assert.equal(h.circuit.past.length, history)
  } finally { h.dispose() }
})

test('Label body and gizmo moves preserve sheet elevation instead of accumulating thickness or sinking to zero', async () => {
  const h = wireHarness()
  try {
    h.workspace.setTool('move'); h.workspace.snap = false
    const y = .33 + .15 * MM_TO_WORLD, id = h.circuit.placeModule('LABEL', { x: 0, y, z: 0 }, 0, { text: 'Giữ độ cao' })
    await nextTick(); h.editor.sync(); h.circuit.past = []
    const start = h.eventAt({ x: 0, y: y + .1 * MM_TO_WORLD, z: 0 })
    h.editor.pointerDown(start); h.editor.pointerMove(h.pointer(start.clientX + 25, start.clientY)); h.editor.pointerUp(h.pointer(start.clientX + 25, start.clientY)); await nextTick()
    const moved = h.circuit.graph!.modules.find(module => module.id === id)!
    assert.notEqual(moved.position!.x, 0); assert.equal(moved.position!.y, y); assert.equal(h.circuit.past.length, 1)
    h.workspace.selectModule(id); await nextTick(); h.editor.sync()
    const handle = h.manager.project(h.manager.gizmoHandlePosition('x')!), before = h.circuit.past.length
    h.editor.pointerDown(h.pointer(handle.x, handle.y)); h.editor.pointerMove(h.pointer(handle.x + 25, handle.y)); h.editor.pointerUp(h.pointer(handle.x + 25, handle.y)); await nextTick()
    assert.equal(h.circuit.graph!.modules.find(module => module.id === id)!.position!.y, y)
    assert.equal(h.circuit.past.length, before + 1)
  } finally { h.dispose() }
})

test('selected slide actuator takes priority over its central move grip and toggles repeatedly with one Undo each', async () => {
  const h = wireHarness()
  try {
    h.workspace.setTool('select'); const id = h.circuit.placeModule('SLIDE_SWITCH_SS12D10', { x: 0, y: .5, z: 0 })
    await nextTick(); h.editor.sync(); h.circuit.past = []
    for (const [index, state] of [true, false, true].entries()) {
      const actuator = h.manager.models.get(id)!.getObjectByName('package-switch-actuator')!
      const point = actuator.getWorldPosition(new Vector3()); point.y += 2 * MM_TO_WORLD
      const event = h.eventAt(point); h.editor.pointerDown(event); h.editor.pointerUp(event); await nextTick()
      assert.equal(h.circuit.graph!.modules.find(module => module.id === id)!.properties!.state, state)
      assert.equal(h.circuit.past.length, index + 1)
    }
  } finally { h.dispose() }
})

test('a visible Label consumes selection before the wire below while electrical endpoint picking passes through the note', async () => {
  const h = wireHarness()
  try {
    h.workspace.setTool('select'); const board = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const wire = { source: `${board}.contact:terminal:A:28`, destination: `${board}.contact:terminal:A:36` }
    h.circuit.connectEndpoints(wire.source, wire.destination); h.editor.sync()
    const a = h.manager.endpointPosition(wire.source)!, b = h.manager.endpointPosition(wire.destination)!
    const center = { x: (a.x + b.x) / 2, y: .6, z: a.z }, label = h.circuit.placeModule('LABEL', center, 0, { text: 'Không chọn dây bên dưới', fontSizeMm: 6, boardId: board })
    await nextTick(); h.editor.sync(); h.circuit.past = []
    const event = h.eventAt(center), hit = h.manager.pick(event.clientX, event.clientY)
    assert.ok(hit && hit.kind === 'module' && hit.id === label)
    h.editor.pointerDown(event); h.editor.pointerUp(event); await nextTick()
    assert.equal(h.workspace.selectedModuleId, label); assert.equal(h.workspace.selectedWire, null); assert.equal(h.circuit.past.length, 0)
    const endpoint = h.manager.project(a)
    assert.equal(h.manager.pickEndpoint(endpoint.x, endpoint.y)?.endpoint, wire.source)
  } finally { h.dispose() }
})
