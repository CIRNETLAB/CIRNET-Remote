import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { Mesh, MeshStandardMaterial } from 'three'
import { wireHarness } from './helpers/wireHarness'
import type { CircuitGraph, Point3 } from '../src/types/circuit'
import { buildPasteCandidate, PasteCandidateError } from '../src/editor/batchCommands'
import { captureSelectionClipboard } from '../src/editor/selectionClipboard'
import { createSelectionPreview } from '../src/three/SelectionPreview'
import { buildSelectionGhostRoutes } from '../src/three/SelectionGhostRoutes'
import { defaultWireVisual } from '../src/wires/wireVisual'

const near = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-7
const ghostMeshes = (h: ReturnType<typeof wireHarness>) => {
  const meshes: Mesh[] = []
  h.manager.scene.traverse(object => { if (object instanceof Mesh && object.name === 'wire-duplicate-preview' && object.visible) meshes.push(object) })
  return meshes
}
const sourceOf = (mesh: Mesh) => (mesh.userData.route as { points: Point3[] }).points[0]

test('an invalid end-of-board wire ghost stays rigid at the chosen contact and follows an off-board cursor', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 0 })
    const wire = { source: `${board}.contact:terminal:A:01`, destination: `${board}.contact:terminal:J:08` }
    h.circuit.connectEndpoints(wire.source, wire.destination,{...defaultWireVisual(),routeMode:'FREE'})
    await nextTick(); h.flush(); h.circuit.past = []
    const api = h.editor.wireRouting
    api.openContextMenu(0, 0, wire); api.menuDuplicate()
    const before = h.circuit.snapshot(), target = `${board}.contact:terminal:A:63`, expected = h.manager.endpointPosition(target)!
    api.previewPointerMove(h.endpointEvent(target))
    assert.equal(api.duplicatePreviewState.value.valid, false)
    let ghost = ghostMeshes(h)[0]
    assert.ok(ghost); assert.ok(near(sourceOf(ghost), expected), 'invalid wire source must stay at the attempted contact instead of jumping to the copied source')
    assert.equal((ghost.material as MeshStandardMaterial).color.getHexString(), 'f16365')
    const cursorEvent = h.pointer(970, 80), cursor = h.manager.placementPoint(970, 80)!
    assert.ok(cursor)
    api.previewPointerMove(cursorEvent)
    ghost = ghostMeshes(h)[0]
    assert.ok(near(sourceOf(ghost), cursor), 'invalid wire source must follow the world cursor without fabricating a contact')
    assert.equal(api.duplicatePreviewState.value.valid, false); assert.equal(api.commitDuplicatePreview(), false)
    assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
    api.previewPointerMove(h.endpointEvent(`${board}.contact:terminal:A:05`))
    assert.equal(api.duplicatePreviewState.value.valid, true)
    assert.equal(ghostMeshes(h).length, 1)
  } finally { h.dispose() }
})

test('invalid mixed-group wire ghosts and module bodies share the attempted contact transform', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 0 })
    const led = h.circuit.placeModule('LED', { x: -8, y: 0, z: 3 })
    const wires = [
      { source: `${board}.contact:terminal:A:01`, destination: `${board}.contact:terminal:J:08` },
      { source: `${board}.contact:terminal:B:02`, destination: `${board}.contact:terminal:I:09` },
    ]
    for (const wire of wires) h.circuit.connectEndpoints(wire.source, wire.destination)
    await nextTick(); h.flush(); h.circuit.past = []
    h.workspace.setSelection({ moduleIds: [led], wires }); h.editor.wireRouting.menuDuplicate()
    const before = h.circuit.snapshot()
    h.editor.wireRouting.previewPointerMove(h.endpointEvent(`${board}.contact:terminal:A:63`))
    assert.equal(h.editor.wireRouting.duplicatePreviewState.value.valid, false)
    const ghosts = ghostMeshes(h)
    assert.equal(ghosts.length, 2)
    assert.ok(near(sourceOf(ghosts[0]), h.manager.endpointPosition(`${board}.contact:terminal:A:63`)!))
    assert.ok(Math.abs(sourceOf(ghosts[1]).x - sourceOf(ghosts[0]).x - .13) < 1e-7)
    const projection = h.manager.scene.getObjectByName('selection-duplicate-preview')!
    const body = projection.children.find(child => child.userData.type === 'LED')!
    assert.ok(body); assert.ok(Math.abs(body.position.x - .06) < 1e-7)
    assert.equal(projection.userData.valid, false)
    assert.equal(h.editor.wireRouting.commitDuplicatePreview(), false)
    assert.equal(h.circuit.snapshot(), before); assert.equal(h.circuit.past.length, 0)
    h.editor.wireRouting.cancelDuplicatePreview()
    assert.equal(ghostMeshes(h).length, 0)
  } finally { h.dispose() }
})

test('invalid multiwire projection survives deleted originals, reuses its renderers and disposes their resources once', () => {
  const graph: CircuitGraph = { schema_version: '1.0', circuit_id: 'deleted-source', modules: [{ id: 'BB', type: 'BREADBOARD_630' }], connections: [
    { source: 'BB.contact:terminal:A:01', destination: 'BB.contact:terminal:J:08' },
    { source: 'BB.contact:terminal:B:02', destination: 'BB.contact:terminal:I:09' },
  ] }
  const snapshot = captureSelectionClipboard(graph, { moduleIds: [], wires: graph.connections })!
  const current = { ...graph, connections: [] }, before = JSON.stringify(current)
  const preview = createSelectionPreview()
  const errorAt = (targetContact: string) => {
    let error: unknown
    try { buildPasteCandidate(current, snapshot, { targetContact }) } catch (caught) { error = caught }
    assert.ok(error instanceof PasteCandidateError)
    return error
  }
  const show = (error: PasteCandidateError) => preview.show(error.previewGraph, error.selection, false, buildSelectionGhostRoutes(error.snapshot, error.transformPoint))
  try {
    show(errorAt('BB.contact:terminal:A:63'))
    const ghosts: Mesh[] = []
    preview.root.traverse(object => { if (object instanceof Mesh && object.name === 'wire-duplicate-preview') ghosts.push(object) })
    assert.equal(ghosts.length, 2)
    assert.ok(Math.abs(sourceOf(ghosts[0]).x - 4.03) < 1e-7)
    assert.equal(preview.root.getObjectByName('committed-wires')!.children.length, 0, 'source wires are context only and must not appear as original-position ghosts')
    let oldGeometryDisposals = 0, latestGeometryDisposals = 0, materialDisposals = 0
    ghosts[0].geometry.addEventListener('dispose', () => oldGeometryDisposals++)
    ;(ghosts[0].material as MeshStandardMaterial).addEventListener('dispose', () => materialDisposals++)
    show(errorAt('BB.contact:terminal:A:62'))
    assert.ok(ghosts[0].parent); assert.equal(oldGeometryDisposals, 1)
    ghosts[0].geometry.addEventListener('dispose', () => latestGeometryDisposals++)
    preview.clear(); preview.clear()
    assert.equal(latestGeometryDisposals, 1); assert.equal(materialDisposals, 1)
    assert.equal(JSON.stringify(current), before)
  } finally { preview.dispose() }
})
