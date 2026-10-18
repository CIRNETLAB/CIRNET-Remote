import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { Vector3 } from 'three'
import type { WireIdentity } from '../src/types/circuit'
import { wireHarness } from './helpers/wireHarness'
import { defaultWireVisual } from '../src/wires/wireVisual'

type Harness = ReturnType<typeof wireHarness>
const key = (name: string) => ({ key: name, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }) as KeyboardEvent

function wirePoint(h: Harness, wire: WireIdentity) {
  const points = h.manager.wireRoute(wire)!.points
  for (let i = 1; i < points.length; i++) for (const fraction of [.5, .25, .75]) {
    const point = new Vector3(points[i - 1].x, points[i - 1].y, points[i - 1].z).lerp(new Vector3(points[i].x, points[i].y, points[i].z), fraction)
    const screen = h.manager.project(point), hit = h.manager.pick(screen.x, screen.y)
    if (hit?.kind === 'wire' && hit.source === wire.source && hit.destination === wire.destination) return screen
  }
  assert.fail('fixture must hit a rendered existing wire')
}

async function mixedGroup() {
  const h = wireHarness()
  // Each +X duplicate has room beside this Z corridor for full-diameter insulation.
  const a = h.circuit.placeModule('CLOCK', { x: -3, y: 0, z: -3 })
  const b = h.circuit.placeModule('LED', { x: -3, y: 0, z: 3 })
  const wire = { source: `${a}.OUT`, destination: `${b}.IN` }
  h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#8656a8', routeMode: 'FREE', thickness: .052, controlPoints: [{ space: 'world', position: { x: -3, y: .9, z: 0 } }] })
  h.workspace.setTool('select'); await nextTick(); h.flush()
  h.workspace.setSelection({ moduleIds: [a, b], wires: [wire] })
  await nextTick(); h.flush(); h.circuit.past = []
  return { h, a, b, wire, selection: { moduleIds: [a, b], wires: [wire] } }
}

function rightClick(h: Harness, point: { x: number; y: number }) {
  const event = h.pointer(point.x, point.y, 1, 2)
  h.editor.pointerDown(event); h.editor.pointerUp(event)
}

test('right-clicking a selected mixed group preserves its selection and Duplicate creates a deep render-only snapshot', async () => {
  const { h, a, wire, selection } = await mixedGroup()
  try {
    const before = h.circuit.exportGraph(), point = wirePoint(h, wire)
    rightClick(h, point)
    assert.deepEqual(h.workspace.selection, selection)
    assert.ok(h.editor.wireRouting.contextMenuState.value)
    assert.equal(h.editor.wireRouting.menuDuplicate(), true)
    const preview = h.editor.wireRouting.duplicatePreviewState.value
    assert.equal(preview.active, true); assert.equal(preview.valid, true)
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
    const candidate = preview.candidate!, copyId = candidate.selection.moduleIds[0]
    const copied = candidate.graph.modules.find(module => module.id === copyId)!
    copied.properties!.frequency_hz = 1234
    const copiedWire = candidate.graph.connections.find(connection => connection.source !== wire.source)!
    ;(copiedWire.metadata!.wireVisual as { controlPoints: { position: { x: number } }[] }).controlPoints[0].position.x = 999
    assert.equal(h.circuit.exportGraph(), before, 'editing candidate properties or route points cannot mutate source graph data')
    assert.equal(h.manager.models.has(copyId), false, 'preview modules stay out of editable models')
    const ghost = h.manager.scene.getObjectByName('selection-duplicate-preview')!
    assert.ok(ghost.visible); assert.equal(ghost.userData.ignorePick, true)
    h.editor.keydown(key('Escape'))
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false)
    assert.equal(h.editor.wireRouting.canPaste.value, true)
    rightClick(h, h.manager.project(h.manager.models.get(a)!.position))
    assert.deepEqual(h.workspace.selection, selection, 'right-clicking a selected model also retains the group')
  } finally { h.dispose() }
})

test('right drags of four pixels over selected models or wires preserve Orbit input and never open a menu', async () => {
  const { h, a, wire, selection } = await mixedGroup()
  try {
    const before = h.circuit.exportGraph()
    for (const point of [h.manager.project(h.manager.models.get(a)!.position), wirePoint(h, wire)]) {
      let consumed = false
      const press = h.pointer(point.x, point.y, 1, 2)
      press.stopImmediatePropagation = () => { consumed = true }
      h.editor.pointerDown(press)
      const release = h.pointer(point.x + 4, point.y, 1, 2)
      h.editor.pointerMove(release); h.editor.pointerUp(release)
      h.editor.contextMenu(release as unknown as MouseEvent)
      assert.equal(consumed, false); assert.equal(h.editor.wireRouting.contextMenuState.value, null)
      assert.deepEqual(h.workspace.selection, selection)
      assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
    }
  } finally { h.dispose() }
})

test('mixed duplicate preview commits once per press and keeps the next ghost until Escape', async () => {
  const { h, wire } = await mixedGroup()
  try {
    rightClick(h, wirePoint(h, wire)); h.editor.wireRouting.menuDuplicate()
    const click = h.pointer(30, 30)
    h.editor.pointerDown(click); h.editor.pointerDown(click); await nextTick(); h.flush()
    assert.equal(h.circuit.graph!.modules.length, 4); assert.equal(h.circuit.graph!.connections.length, 2)
    assert.equal(h.circuit.past.length, 1, 'duplicate pointerdown cannot commit twice before release')
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, true)
    h.editor.pointerUp(click); await nextTick()
    assert.equal(h.circuit.past.length, 1, 'release cannot commit again')
    h.editor.pointerDown(click); h.editor.pointerUp(click); await nextTick(); h.flush()
    assert.equal(h.circuit.graph!.modules.length, 6); assert.equal(h.circuit.graph!.connections.length, 3)
    assert.equal(h.circuit.past.length, 2)
    assert.deepEqual(h.circuit.graph!.modules.filter(module => module.type === 'CLOCK').map(module => module.position!.x), [-3, -2.5, -2])
    h.editor.keydown(key('Escape'))
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false)
    assert.equal(h.editor.wireRouting.canPaste.value, true)
  } finally { h.dispose() }
})

test('repeated mixed menu Paste commits the next shared offset directly with one Undo each', async () => {
  const { h, wire } = await mixedGroup()
  try {
    rightClick(h, wirePoint(h, wire)); h.editor.wireRouting.menuDuplicate(); h.editor.keydown(key('Escape'))
    for (let step = 1; step <= 3; step++) {
      rightClick(h, { x: 20, y: 20 })
      assert.equal(h.editor.wireRouting.menuPaste(), true); await nextTick(); h.flush()
      assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false)
      assert.equal(h.circuit.graph!.modules.length, 2 + step * 2)
      assert.equal(h.circuit.graph!.connections.length, 1 + step)
      assert.equal(h.circuit.past.length, step)
    }
    assert.deepEqual(h.circuit.graph!.modules.filter(module => module.type === 'CLOCK').map(module => module.position!.x), [-3, -2.5, -2, -1.5])
    const pasted = h.circuit.exportGraph()
    h.circuit.undo(); assert.equal(h.circuit.graph!.modules.length, 6)
    h.circuit.redo(); assert.equal(h.circuit.exportGraph(), pasted)
  } finally { h.dispose() }
})

test('Delete removes mixed modules and their wires atomically and Undo/Redo restores the whole group', async () => {
  const { h, selection } = await mixedGroup()
  try {
    const spare = h.circuit.placeModule('PROBE', { x: 0, y: 0, z: -3 })
    await nextTick(); h.workspace.setSelection(selection); h.circuit.past = []
    const before = h.circuit.exportGraph()
    h.editor.keydown(key('Delete')); await nextTick(); h.flush()
    assert.deepEqual(h.circuit.graph!.modules.map(module => module.id), [spare])
    assert.equal(h.circuit.graph!.connections.length, 0); assert.equal(h.circuit.past.length, 1)
    assert.equal(h.workspace.selectionCount, 0)
    const after = h.circuit.exportGraph()
    h.circuit.undo(); assert.equal(h.circuit.exportGraph(), before)
    h.circuit.redo(); assert.equal(h.circuit.exportGraph(), after)
  } finally { h.dispose() }
})

test('an invalid mixed contact preview cannot commit, and right cancel retains the clipboard for direct Paste', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const clock = h.circuit.placeModule('CLOCK', { x: 0, y: 0, z: 4 })
    const wire = { source: `${board}.contact:terminal:A:01`, destination: `${board}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination,{...defaultWireVisual(),routeMode:'FREE'})
    h.workspace.setTool('select'); await nextTick(); h.flush()
    h.workspace.setSelection({ moduleIds: [clock], wires: [wire] })
    await nextTick(); h.flush(); h.circuit.past = []
    const before = h.circuit.exportGraph()
    rightClick(h, wirePoint(h, wire)); h.editor.wireRouting.menuDuplicate()
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.valid, true)
    h.editor.pointerMove(h.endpointEvent(wire.source))
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.valid, false)
    assert.equal(h.manager.scene.getObjectByName('selection-duplicate-preview')!.userData.valid, false)
    const click = h.pointer(20, 20)
    h.editor.pointerDown(click); h.editor.pointerUp(click)
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
    h.editor.pointerDown(h.pointer(20, 20, 1, 2))
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false)
    assert.equal(h.editor.wireRouting.contextMenuState.value, null)
    assert.equal(h.editor.wireRouting.canPaste.value, true)
    assert.equal(h.editor.wireRouting.menuPaste(), true)
    assert.equal(h.circuit.graph!.modules.length, 3); assert.equal(h.circuit.graph!.connections.length, 2)
    assert.equal(h.circuit.past.length, 1)
  } finally { h.dispose() }
})

test('Ctrl and Meta click real wire geometry to add and remove it from mixed or single selection', async () => {
  const { h, a, b, wire } = await mixedGroup()
  try {
    h.workspace.setSelection({ moduleIds: [a, b], wires: [] }); await nextTick(); h.flush()
    const before = h.circuit.exportGraph(), point = wirePoint(h, wire)
    const toggle = async (modifier: 'ctrlKey' | 'metaKey') => {
      const click = Object.assign(h.pointer(point.x, point.y), { [modifier]: true })
      h.editor.pointerDown(click); h.editor.pointerUp(click); await nextTick(); h.flush()
    }
    await toggle('ctrlKey')
    assert.deepEqual(h.workspace.selection, { moduleIds: [a, b], wires: [wire] })
    await toggle('metaKey')
    assert.deepEqual(h.workspace.selection, { moduleIds: [a, b], wires: [] })
    h.workspace.selectWire(wire.source, wire.destination); await nextTick(); h.flush()
    await toggle('ctrlKey')
    assert.deepEqual(h.workspace.selection, { moduleIds: [], wires: [] }, 'modifier click removes a sole selected wire instead of entering bend editing')
    assert.equal(h.editor.wireRouting.editing.value, false)
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('a duplicate pointer above the ground horizon invalidates the ghost instead of committing its previous position', async () => {
  const { h, wire } = await mixedGroup()
  try {
    rightClick(h, wirePoint(h, wire)); h.editor.wireRouting.menuDuplicate()
    const before = h.circuit.exportGraph()
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.valid, true)
    h.manager.camera.position.set(0, 4, 10); h.manager.camera.lookAt(0, 4, 0)
    const unavailable = h.pointer(500, 100)
    assert.equal(h.manager.groundPoint(unavailable.clientX, unavailable.clientY), null, 'fixture has no forward ray intersection with the placement plane')
    h.editor.pointerMove(unavailable)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, true)
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.valid, false)
    assert.equal(h.manager.scene.getObjectByName('selection-duplicate-preview')!.userData.valid, false)
    h.editor.pointerDown(unavailable); h.editor.pointerUp(unavailable)
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
    h.editor.keydown(key('Escape')); assert.equal(h.editor.wireRouting.canPaste.value, true)
  } finally { h.dispose() }
})

test('placement, zoom and marquee keep priority over clipboard shortcuts and retain the copied group', async () => {
  for (const mode of ['placement', 'zoom', 'marquee'] as const) {
    const { h, wire } = await mixedGroup()
    try {
      rightClick(h, wirePoint(h, wire)); h.editor.wireRouting.menuDuplicate(); h.editor.keydown(key('Escape'))
      if (mode === 'placement') h.workspace.armPlacement('GENERATOR')
      else if (mode === 'zoom') h.workspace.toggleZoomArea()
      else h.workspace.toggleMarquee()
      await nextTick(); h.flush()
      const before = h.circuit.exportGraph()
      const activeMode = () => mode === 'placement' ? h.workspace.placementType : mode === 'zoom' ? h.workspace.zoomAreaActive : h.workspace.marqueeActive
      const active = activeMode()
      assert.ok(active)
      for (const shortcut of ['c', 'd', 'v']) {
        h.editor.keydown(Object.assign(key(shortcut), { ctrlKey: true }))
        assert.equal(h.circuit.exportGraph(), before, `${mode} preserves graph on Ctrl+${shortcut}`)
        assert.equal(h.circuit.past.length, 0)
        assert.equal(activeMode(), active, `${mode} keeps its current input mode on Ctrl+${shortcut}`)
        assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false)
      }
      h.editor.keydown(key('Escape')); await nextTick()
      assert.equal(h.editor.wireRouting.canPaste.value, true)
      assert.equal(h.editor.wireRouting.menuPaste(), true)
      assert.equal(h.circuit.graph!.modules.length, 4); assert.equal(h.circuit.graph!.connections.length, 2)
      assert.equal(h.circuit.past.length, 1)
    } finally { h.dispose() }
  }
})

test('direct model picking has no history command and a toggled sole component stays selected across repeated keyboard moves', async () => {
  const { h, a } = await mixedGroup()
  try {
    h.workspace.clearSelection(); await nextTick(); h.flush()
    const before = h.circuit.exportGraph(), point = h.manager.project(h.manager.models.get(a)!.position)
    const click = h.pointer(point.x, point.y)
    h.editor.pointerDown(click); h.editor.pointerUp(click); await nextTick()
    assert.deepEqual(h.workspace.selection, { moduleIds: [a], wires: [] })
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
    h.workspace.clearSelection(); h.workspace.toggleModule(a); await nextTick()
    for (const expectedX of [-2.5, -2]) {
      h.editor.keydown(key('ArrowRight')); await nextTick(); h.flush()
      assert.deepEqual(h.workspace.selection, { moduleIds: [a], wires: [] })
      assert.equal(h.workspace.selectedModuleId, a)
      assert.equal(h.circuit.graph!.modules.find(module => module.id === a)!.position!.x, expectedX)
    }
    assert.equal(h.circuit.past.length, 2)
  } finally { h.dispose() }
})

test('a pasted sole component stays selected for later keyboard edits', async () => {
  const { h, a } = await mixedGroup()
  try {
    h.workspace.setSelection({ moduleIds: [a], wires: [] }); await nextTick()
    h.editor.wireRouting.menuDuplicate(); h.editor.keydown(key('Escape'))
    assert.equal(h.editor.wireRouting.menuPaste(), true); await nextTick(); h.flush()
    const pasted = h.circuit.graph!.modules.find(module => module.type === 'CLOCK' && module.id !== a)!
    assert.deepEqual(h.workspace.selection, { moduleIds: [pasted.id], wires: [] })
    h.editor.keydown(key('ArrowRight')); await nextTick(); h.flush()
    assert.deepEqual(h.workspace.selection, { moduleIds: [pasted.id], wires: [] })
    assert.equal(h.circuit.graph!.modules.find(module => module.id === pasted.id)!.position!.x, -2)
    assert.equal(h.circuit.past.length, 2)
  } finally { h.dispose() }
})

test('mixed selection survives property edits and graph changes remove only missing selected objects', async () => {
  const { h, a, b, selection } = await mixedGroup()
  try {
    h.circuit.updateModuleProperties(a, { frequency_hz: 2000 }); await nextTick(); h.flush()
    assert.deepEqual(h.workspace.selection, selection)
    h.circuit.removeModule(b); await nextTick(); h.flush()
    assert.deepEqual(h.workspace.selection, { moduleIds: [a], wires: [] })
    assert.equal(h.workspace.selectedModuleId, a)
    assert.equal(h.circuit.graph!.modules.find(module => module.id === a)!.properties!.frequency_hz, 2000)
    assert.equal(h.circuit.past.length, 2)
  } finally { h.dispose() }
})

test('a right release alone detects drag distance and lost pointer capture cannot later open a selection menu', async () => {
  const { h, a, wire, selection } = await mixedGroup()
  try {
    const before = h.circuit.exportGraph()
    for (const point of [h.manager.project(h.manager.models.get(a)!.position), wirePoint(h, wire)]) {
      const press = h.pointer(point.x, point.y, 1, 2)
      const release = h.pointer(point.x + 4, point.y, 1, 2)
      h.editor.pointerDown(press); h.editor.pointerUp(release)
      h.editor.contextMenu(release as unknown as MouseEvent)
      assert.equal(h.editor.wireRouting.contextMenuState.value, null, 'release travel cancels menu without a preceding move event')
      h.editor.pointerDown(press); h.editor.lostPointerCapture(press); h.editor.pointerUp(press)
      h.editor.contextMenu(press as unknown as MouseEvent)
      assert.equal(h.editor.wireRouting.contextMenuState.value, null, 'lost capture cancels the pending right press')
      assert.deepEqual(h.workspace.selection, selection)
    }
    assert.equal(h.circuit.exportGraph(), before); assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('clipboard shortcuts during a gizmo drag preserve the gesture and previous clipboard until its single move commit', async () => {
  const { h, a, b } = await mixedGroup()
  try {
    h.workspace.setSelection({ moduleIds: [a], wires: [] }); await nextTick()
    h.editor.keydown(Object.assign(key('c'), { ctrlKey: true }))
    assert.equal(h.editor.wireRouting.canPaste.value, true)
    h.workspace.selectModule(b); await nextTick(); h.flush()
    const grip = h.manager.gizmoHandlePosition('x')!, start = h.manager.project(grip)
    assert.equal(h.manager.pickGizmo(start.x, start.y)?.handle, 'x')
    const end = h.manager.project(grip.clone().add(new Vector3(1, 0, 0)))
    const before = h.circuit.exportGraph()
    h.editor.pointerDown(h.pointer(start.x, start.y)); h.editor.pointerMove(h.pointer(end.x, end.y))
    assert.equal(h.editor.dragging.value, 'transform'); assert.equal(h.captured.size, 1)
    for (const shortcut of ['c', 'd', 'v']) {
      h.editor.keydown(Object.assign(key(shortcut), { ctrlKey: true }))
      assert.equal(h.circuit.exportGraph(), before, `Ctrl+${shortcut} cannot change the graph during a drag`)
      assert.equal(h.editor.wireRouting.duplicatePreviewState.value.active, false)
      assert.equal(h.editor.dragging.value, 'transform'); assert.equal(h.captured.size, 1)
      assert.equal(h.circuit.past.length, 0)
    }
    h.editor.pointerUp(h.pointer(end.x, end.y)); await nextTick(); h.flush()
    assert.equal(h.editor.dragging.value, null); assert.equal(h.captured.size, 0)
    assert.equal(h.circuit.graph!.modules.find(module => module.id === b)!.position!.x, -2)
    assert.equal(h.circuit.past.length, 1)
    assert.equal(h.workspace.selectedModuleId, b)
    assert.equal(h.editor.wireRouting.menuPaste(), true); await nextTick(); h.flush()
    assert.equal(h.circuit.graph!.modules.length, 3)
    assert.equal(h.circuit.graph!.modules.filter(module => module.type === 'CLOCK').length, 2, 'blocked Ctrl+C keeps the earlier CLOCK clipboard instead of replacing it with the dragged LED')
    assert.equal(h.circuit.graph!.modules.filter(module => module.type === 'LED').length, 1)
    assert.equal(h.circuit.past.length, 2)
  } finally { h.dispose() }
})
