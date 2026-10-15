import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick, type Ref } from 'vue'
import { wireHarness } from './helpers/wireHarness'
import type { CircuitConnection, WireIdentity, WireVisual } from '../src/types/circuit'
import { readWireVisual } from '../src/wires/wireVisual'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { shiftedWireCopy } from '../src/wires/wireClipboard'

interface MenuApi {
  contextMenuState: Ref<{ x: number; y: number; wire: WireIdentity } | null>
  canPaste: Ref<boolean>
  openContextMenu(x: number, y: number, wire: WireIdentity): boolean
  closeContextMenu(): void
  menuDuplicate(): boolean
  menuPaste(): boolean
  menuDelete(): boolean
  commitDuplicatePreview(): boolean
  cancelDuplicatePreview(): void
  duplicatePreviewState: Ref<{ active: boolean; valid: boolean; message: string }>
}
function menu(h: ReturnType<typeof wireHarness>): MenuApi {
  assert.equal(typeof Reflect.get(h.editor.wireRouting, 'openContextMenu'), 'function', 'existing wires need a context menu command API')
  return h.editor.wireRouting as unknown as MenuApi
}
function setupWire(h: ReturnType<typeof wireHarness>, rotation = 0, first = '01', last = '08') {
  const board = h.circuit.placeModule('BREADBOARD', { x: 2, y: .1, z: 3 }, rotation)
  const visual: WireVisual = { version: 1, color: '#8656a8', routeMode: 'FREE', thickness: .052, height: .07, layer: 2, frameModuleId: board, controlPoints: [
    { space: 'module', moduleId: board, position: { x: -3.5, y: .6, z: -.4 } },
    { space: 'world', position: { x: 2, y: .75, z: 3 } },
  ] }
  const wire = { source: `${board}.contact:terminal:A:${first}`, destination: `${board}.contact:terminal:J:${last}` }
  h.circuit.connectEndpoints(wire.source, wire.destination, visual)
  h.editor.sync()
  h.circuit.past = []
  return { board, wire, visual }
}

test('Duplicate snapshots one wire without a graph command; consecutive preview commits shift contacts with one Undo each', async () => {
  const h = wireHarness()
  try {
    const { wire, visual } = setupWire(h), api = menu(h)
    await nextTick()
    assert.equal(api.canPaste.value, false)
    assert.equal(api.openContextMenu(40, 50, wire), true)
    const before = h.circuit.snapshot()
    assert.equal(api.menuDuplicate(), true)
    assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
    assert.equal(api.contextMenuState.value, null)
    assert.equal(api.canPaste.value, true)
    api.cancelDuplicatePreview(); h.circuit.updateWireVisual(wire, { ...visual, color: '#24272a', controlPoints: [] }); h.circuit.past = []
    for (const [step, expected] of [[1, ['02', '09']], [2, ['03', '10']]] as const) {
      api.openContextMenu(40, 50, wire); assert.equal(api.menuPaste(), true)
      assert.equal(h.circuit.graph!.connections.length, step); assert.equal(api.commitDuplicatePreview(), true)
      const pasted = h.circuit.graph!.connections[step], copy = readWireVisual(pasted)
      assert.equal(pasted.source, `${wire.source.slice(0, -2)}${expected[0]}`)
      assert.equal(pasted.destination, `${wire.destination.slice(0, -2)}${expected[1]}`)
      assert.equal(copy.color, '#8656a8'); assert.equal(copy.routeMode, 'FREE'); assert.equal(copy.height, .07)
      assert.equal(copy.thickness, .052); assert.ok((copy.layer ?? 0) >= 2); assert.equal(copy.frameModuleId, visual.frameModuleId)
      assert.ok(Math.abs(copy.controlPoints[0].position.x - (-3.5 + .13 * step)) < 1e-10)
      assert.ok(Math.abs(copy.controlPoints[1].position.x - (2 + .13 * step)) < 1e-10)
      assert.equal(copy.controlPoints[0].position.y, .6); assert.equal(copy.controlPoints[1].position.z, 3)
      assert.equal(h.circuit.past.length, step)
    }
    const exported = h.circuit.exportGraph()
    assert.deepEqual(parseCircuitFile(exported).connections, h.circuit.graph!.connections)
    assert.equal(exported.includes('clipboard'), false)
    h.circuit.undo(); assert.equal(h.circuit.graph!.connections.length, 2)
    h.circuit.redo(); assert.equal(h.circuit.graph!.connections.length, 3)
  } finally { h.dispose() }
})

test('rotated breadboard Paste advances local X and transforms world anchors without changing height or point ownership', () => {
  const h = wireHarness()
  try {
    const { wire } = setupWire(h, 90), api = menu(h)
    api.openContextMenu(0, 0, wire); api.menuDuplicate()
    assert.equal(api.commitDuplicatePreview(), true)
    const copy = readWireVisual(h.circuit.graph!.connections[1])
    assert.ok(Math.abs(copy.controlPoints[0].position.x + 3.37) < 1e-10)
    assert.equal(copy.controlPoints[0].space, 'module')
    assert.ok(Math.abs(copy.controlPoints[1].position.x - 2) < 1e-10)
    assert.ok(Math.abs(copy.controlPoints[1].position.z - 2.87) < 1e-10)
    assert.equal(copy.controlPoints[1].position.y, .75)
  } finally { h.dispose() }
})

test('duplicate endpoints reject Paste atomically and do not consume the next pitch step', () => {
  const h = wireHarness()
  try {
    const { wire, board } = setupWire(h), api = menu(h)
    const blocked = { source: `${board}.contact:terminal:A:02`, destination: `${board}.contact:terminal:J:09` }
    h.circuit.connectEndpoints(blocked.destination, blocked.source); h.circuit.past = []
    api.openContextMenu(0, 0, wire); api.menuDuplicate()
    const before = h.circuit.snapshot()
    assert.equal(api.duplicatePreviewState.value.active, true); assert.equal(api.duplicatePreviewState.value.valid, false)
    assert.equal(api.commitDuplicatePreview(), false); assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
    assert.match(h.workspace.editError, /already connected/i)
    h.circuit.disconnectPorts(blocked.destination, blocked.source); h.circuit.past = []
    api.openContextMenu(0, 0, wire); assert.equal(api.menuPaste(), true); assert.equal(api.commitDuplicatePreview(), true)
    assert.equal(h.circuit.graph!.connections[1].source, blocked.source, 'failed Paste must retry step one')
    assert.equal(h.circuit.past.length, 1)
  } finally { h.dispose() }
})

test('the last contact and non-contact ports reject Paste without fabricating endpoints, graph data or history', () => {
  const h = wireHarness()
  try {
    const { wire } = setupWire(h, 0, '63', '60'), api = menu(h)
    api.openContextMenu(0, 0, wire); api.menuDuplicate()
    const before = h.circuit.snapshot()
    assert.equal(api.commitDuplicatePreview(), false); assert.match(h.workspace.editError, /next.*contact|contact.*pitch/i)
    assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
    const source = h.circuit.placeModule('DIGITAL_SWITCH', { x: -8, y: 0, z: 0 }), destination = h.circuit.placeModule('LED', { x: 8, y: 0, z: 0 })
    h.circuit.connectEndpoints(`${source}.OUT`, `${destination}.IN`); h.circuit.past = []
    const portWire = h.circuit.graph!.connections[1]
    api.openContextMenu(0, 0, portWire); api.menuDuplicate()
    const ports = h.circuit.snapshot()
    assert.equal(api.commitDuplicatePreview(), false); assert.match(h.workspace.editError, /breadboard contacts/i)
    assert.equal(h.circuit.snapshot(), ports); assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('Delete targets the clicked wire, clears selection and is one reversible command; circuit changes clear temporary clipboard', () => {
  const h = wireHarness()
  try {
    const { wire } = setupWire(h), api = menu(h)
    api.openContextMenu(20, 30, wire); api.menuDuplicate(); api.cancelDuplicatePreview(); api.openContextMenu(20, 30, wire)
    assert.equal(api.menuDelete(), true)
    assert.equal(h.circuit.graph!.connections.length, 0); assert.equal(h.workspace.selectedWire, null); assert.equal(h.circuit.past.length, 1)
    assert.equal(api.contextMenuState.value, null)
    h.circuit.undo(); assert.equal(h.circuit.graph!.connections.length, 1)
    h.circuit.redo(); assert.equal(h.circuit.graph!.connections.length, 0)
    h.circuit.undo(); assert.equal(api.canPaste.value, true)
    api.openContextMenu(20, 30, wire); h.circuit.createDraft('Other circuit')
    assert.equal(api.contextMenuState.value, null); assert.equal(api.canPaste.value, false)
    h.circuit.undo(); assert.equal(api.canPaste.value, false, 'Undo of a circuit switch cannot resurrect transient clipboard')
  } finally { h.dispose() }
})

test('wire drawing, placement and zoom retain priority over the existing-wire menu', () => {
  const h = wireHarness()
  try {
    const { wire } = setupWire(h), api = menu(h)
    h.editor.connect(wire.source)
    assert.equal(api.openContextMenu(0, 0, wire), false); assert.equal(api.contextMenuState.value, null)
    assert.equal(h.editor.wireRouting.drawing.value, true)
    h.editor.wireRouting.cancel(); h.workspace.armPlacement('BREADBOARD')
    assert.equal(api.openContextMenu(0, 0, wire), false)
    h.workspace.cancelPlacement(); h.workspace.toggleZoomArea()
    assert.equal(api.openContextMenu(0, 0, wire), false)
  } finally { h.dispose() }
})

test('same-orientation boards support a shared rigid Paste; unequal local-X directions reject without deforming the route', () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: -4 }, 90)
    const b = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 4 }, 90)
    const wire: CircuitConnection = { source: `${a}.contact:terminal:A:01`, destination: `${b}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination, { version: 1, color: '#397ec6', routeMode: 'ORTHOGONAL', thickness: .04, controlPoints: [{ space: 'module', moduleId: b, position: { x: 0, y: .5, z: 0 } }] })
    h.editor.sync()
    const api = menu(h)
    api.openContextMenu(0, 0, wire); api.menuDuplicate()
    assert.equal(api.commitDuplicatePreview(), true)
    assert.ok(Math.abs(readWireVisual(h.circuit.graph!.connections[1]).controlPoints[0].position.x - .13) < 1e-10)
    h.circuit.rotateModule(b, 90); h.circuit.past = []; api.openContextMenu(0, 0, wire)
    const before = h.circuit.snapshot()
    assert.equal(api.menuPaste(), true); assert.equal(api.commitDuplicatePreview(), false); assert.match(h.workspace.editError, /different.*direction|same.*direction/i)
    assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('declared power-rail contacts advance by one pitch and reject physical gaps rather than jumping to the next numeric ID', () => {
  const visual: WireVisual = { version: 1, color: '#397ec6', routeMode: 'AUTO', thickness: .04, controlPoints: [] }
  for (const [type, source, destination, nextSource, nextDestination] of [
    ['BREADBOARD_830', 'rail:top-positive:01', 'rail:bottom-negative:01', 'rail:top-positive:02', 'rail:bottom-negative:02'],
    ['BREADBOARD_630', 'terminal:A:01', 'terminal:J:01', 'terminal:A:02', 'terminal:J:02'],
    ['BREADBOARD_100', 'rail:positive:01', 'rail:negative:01', 'rail:positive:02', 'rail:negative:02'],
  ]) {
    const graph = { schema_version: '1.1' as const, circuit_id: 'fixture', modules: [{ id: 'BOARD', type, position: { x: 0, y: 0, z: 0 } }], connections: [] }
    assert.deepEqual(shiftedWireCopy(graph, { source: `BOARD.contact:${source}`, destination: `BOARD.contact:${destination}` }, visual, 1).wire,
      { source: `BOARD.contact:${nextSource}`, destination: `BOARD.contact:${nextDestination}` })
  }
  const rails = { schema_version: '1.1' as const, circuit_id: 'fixture', modules: [{ id: 'BOARD', type: 'BREADBOARD_100' }], connections: [] }
  assert.throws(() => shiftedWireCopy(rails, { source: 'BOARD.contact:rail:positive:05', destination: 'BOARD.contact:rail:negative:05' }, visual, 1), /No next contact/)
  assert.throws(() => shiftedWireCopy(rails, { source: 'BOARD.contact:rail:positive:99', destination: 'BOARD.contact:rail:negative:01' }, visual, 1), /breadboard contacts/)
})

test('menu Escape, tool changes and graph edits close the transient menu while preserving the same-circuit clipboard', () => {
  const h = wireHarness()
  try {
    const { wire } = setupWire(h), api = menu(h)
    api.openContextMenu(10, 20, wire); api.menuDuplicate(); api.cancelDuplicatePreview(); api.openContextMenu(10, 20, wire)
    assert.equal(h.editor.wireRouting.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} } as KeyboardEvent), true)
    assert.equal(api.contextMenuState.value, null); assert.equal(h.circuit.past.length, 0)
    api.openContextMenu(10, 20, wire); h.workspace.setTool('move')
    assert.equal(api.contextMenuState.value, null); assert.equal(api.canPaste.value, true)
    api.openContextMenu(10, 20, wire); h.circuit.updateWireVisual(wire, { ...readWireVisual(h.circuit.graph!.connections[0]), color: '#d8493f' })
    assert.equal(api.contextMenuState.value, null); assert.equal(api.canPaste.value, true)
    assert.equal(api.openContextMenu(10, 20, { ...wire, destination: 'MISSING.contact:terminal:A:01' }), false)
    assert.equal(api.contextMenuState.value, null)
  } finally { h.dispose() }
})
