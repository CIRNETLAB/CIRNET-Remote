import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { Mesh, Vector3 } from 'three'
import { wireHarness } from './helpers/wireHarness'
import { createWireLayer } from '../src/three/WireLayer'
import { defaultWireVisual } from '../src/wires/wireVisual'
import type { CircuitGraph, WireIdentity, WireVisual } from '../src/types/circuit'
import { wireCopyAtContact } from '../src/wires/wireClipboard'

test('Duplicate starts an uncommitted ghost; valid clicks continue with one Undo each and Escape preserves clipboard', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 0 })
    const wire = { source: `${board}.contact:terminal:A:01`, destination: `${board}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination)
    await nextTick(); h.flush(); h.circuit.past = []
    const api = h.editor.wireRouting as unknown as {
      duplicatePreviewState: { value: { active: boolean; valid: boolean; candidate: { wire: typeof wire } | null } }
      openContextMenu(x: number, y: number, identity: WireIdentity): boolean; menuDuplicate(): boolean
      commitDuplicatePreview(): boolean; cancelDuplicatePreview(): void; canPaste: { value: boolean }
    }
    assert.ok(api.duplicatePreviewState, 'duplicate needs an explicit transient preview state')
    api.openContextMenu(0, 0, wire); assert.equal(api.menuDuplicate(), true)
    assert.equal(api.duplicatePreviewState.value.active, true); assert.equal(api.duplicatePreviewState.value.valid, true)
    assert.equal(h.circuit.graph!.connections.length, 1); assert.equal(h.circuit.past.length, 0)
    assert.equal(api.duplicatePreviewState.value.candidate!.wire.source, `${board}.contact:terminal:A:02`)
    for (let step = 1; step <= 2; step++) {
      assert.equal(api.commitDuplicatePreview(), true)
      await nextTick(); h.flush()
      assert.equal(h.circuit.graph!.connections.length, step + 1); assert.equal(h.circuit.past.length, step)
      assert.equal(api.duplicatePreviewState.value.active, true)
      assert.equal(api.duplicatePreviewState.value.candidate!.wire.source, `${board}.contact:terminal:A:${String(step + 2).padStart(2, '0')}`)
    }
    api.cancelDuplicatePreview(); assert.equal(api.duplicatePreviewState.value.active, false); assert.equal(api.canPaste.value, true)
    h.circuit.undo(); assert.equal(h.circuit.graph!.connections.length, 2)
    h.circuit.redo(); assert.equal(h.circuit.graph!.connections.length, 3)
  } finally { h.dispose() }
})

test('duplicate preview reuses its Mesh, never enters picking/committed records, and disposes on cancel', () => {
  const layer = createWireLayer(endpoint => endpoint === 'A.OUT' ? new Vector3(0, .4, 0) : new Vector3(2, .4, 1))
  const api = layer as unknown as {
    previewDuplicate(wire: { source: string; destination: string }, visual: ReturnType<typeof defaultWireVisual>, valid: boolean): void
    clearDuplicate(): void
  }
  try {
    assert.equal(typeof api.previewDuplicate, 'function', 'duplicate needs its own preview layer')
    const wire = { source: 'A.OUT', destination: 'B.IN' }, visual = defaultWireVisual()
    api.previewDuplicate(wire, visual, true)
    const mesh = layer.tools.getObjectByName('wire-duplicate-preview') as Mesh
    assert.ok(mesh); assert.equal(mesh.userData.ignorePick, true); assert.equal(layer.group.children.length, 0)
    assert.equal(layer.route(wire), null)
    const material = mesh.material, geometry = mesh.geometry
    let disposed = 0; geometry.addEventListener('dispose', () => disposed++)
    api.previewDuplicate(wire, { ...visual, controlPoints: [{ space: 'world', position: { x: 1, y: .7, z: 0 } }] }, false)
    assert.ok(layer.tools.getObjectByName('wire-duplicate-preview') === mesh); assert.ok(mesh.material === material)
    assert.equal(disposed, 1); assert.equal(mesh.userData.valid, false)
    let lastDisposed = 0; mesh.geometry.addEventListener('dispose', () => lastDisposed++)
    api.clearDuplicate(); assert.equal(layer.tools.getObjectByName('wire-duplicate-preview'), undefined); assert.equal(lastDisposed, 1)
  } finally { layer.dispose() }
})

test('pointer movement snaps a rotated board contact, rejects invalid/duplicate positions without history, then commits', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD_630', { x: 2, y: 0, z: 1 }, 90)
    const wire = { source: `${board}.contact:terminal:A:01`, destination: `${board}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination, { ...defaultWireVisual(), color: '#8656a8', controlPoints: [{ space: 'module', moduleId: board, position: { x: -3, y: .7, z: 0 } }] })
    await nextTick(); h.flush(); h.circuit.past = []
    const api = h.editor.wireRouting
    api.openContextMenu(0, 0, wire); api.menuDuplicate()
    const before = h.circuit.snapshot()
    api.previewPointerMove(h.endpointEvent(`${board}.contact:terminal:A:05`))
    assert.equal(api.duplicatePreviewState.value.valid, true)
    assert.deepEqual(api.duplicatePreviewState.value.candidate!.wire, { source: `${board}.contact:terminal:A:05`, destination: `${board}.contact:terminal:J:12` })
    assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
    api.previewPointerMove(h.pointer(10, 10))
    assert.equal(api.duplicatePreviewState.value.active, true); assert.equal(api.duplicatePreviewState.value.valid, false)
    assert.equal(api.commitDuplicatePreview(), false); assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
    api.previewPointerMove(h.endpointEvent(wire.source))
    assert.equal(api.duplicatePreviewState.value.valid, false); assert.match(api.duplicatePreviewState.value.message, /already connected/)
    assert.equal(api.commitDuplicatePreview(), false)
    api.previewPointerMove(h.endpointEvent(`${board}.contact:terminal:A:05`)); assert.equal(api.commitDuplicatePreview(), true)
    await nextTick(); h.flush()
    assert.equal(api.duplicatePreviewState.value.active, true); assert.equal(h.circuit.past.length, 1)
    assert.equal(api.duplicatePreviewState.value.candidate!.wire.source, `${board}.contact:terminal:A:06`)
    api.cancelDuplicatePreview(); assert.equal(api.canPaste.value, true)
    assert.equal(h.manager.scene.getObjectByName('wire-duplicate-preview'), undefined)
  } finally { h.dispose() }
})

test('copying onto a differently rotated board rebases contact identities, frame and user anchors without generated elbows', () => {
  const graph: CircuitGraph = { schema_version: '1.1', circuit_id: 'rebase', modules: [
    { id: 'A', type: 'BREADBOARD_630', position: { x: 0, y: 0, z: 0 } },
    { id: 'B', type: 'BREADBOARD_630', position: { x: 10, y: .2, z: 2 }, rotation: 90 },
  ], connections: [] }
  const visual: WireVisual = { ...defaultWireVisual(), color: '#8656a8', thickness: .052, height: .07, routeMode: 'ORTHOGONAL', frameModuleId: 'A', controlPoints: [
    { space: 'module', moduleId: 'A', position: { x: -1, y: .6, z: .4 } },
    { space: 'world', position: { x: 0, y: .75, z: 0 } },
  ] }
  const before = JSON.stringify({ graph, visual })
  const copy = wireCopyAtContact(graph, { source: 'A.contact:terminal:A:01', destination: 'A.contact:terminal:J:08' }, visual, 'B.contact:terminal:A:04')
  assert.deepEqual(copy.wire, { source: 'B.contact:terminal:A:04', destination: 'B.contact:terminal:J:11' })
  assert.equal(copy.visual.frameModuleId, 'B'); assert.equal(copy.visual.controlPoints.length, 2)
  const anchor = copy.visual.controlPoints[0]
  assert.equal(anchor.space, 'module'); assert.ok(anchor.space === 'module' && anchor.moduleId === 'B')
  assert.ok(Math.abs(anchor.position.x + .61) < 1e-9); assert.ok(Math.abs(anchor.position.y - .6) < 1e-9); assert.ok(Math.abs(anchor.position.z - .4) < 1e-9)
  assert.equal(copy.visual.controlPoints[1].space, 'world')
  assert.ok(Math.abs(copy.visual.controlPoints[1].position.x - 10) < 1e-9)
  assert.ok(Math.abs(copy.visual.controlPoints[1].position.z - 1.61) < 1e-9)
  assert.equal(copy.visual.color, visual.color); assert.equal(copy.visual.height, visual.height); assert.equal(copy.visual.thickness, visual.thickness)
  assert.equal(JSON.stringify({ graph, visual }), before)
  assert.throws(() => wireCopyAtContact(graph, copy.wire, visual, 'B.contact:terminal:A:63'), /destination contact/)
})
