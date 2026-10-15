import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitStore } from '../src/stores/circuit'
import type { CircuitGraph, CircuitModule, Point3, WireIdentity } from '../src/types/circuit'
import { solveMounting, validateMountBindings } from '../src/electrical/mounting'
import { moduleLocalToWorld, moduleWorldPose } from '../src/electrical/modulePose'
import { defaultWireVisual, readWireVisual } from '../src/wires/wireVisual'
import { buildPasteCandidate, PasteCandidateError } from '../src/editor/batchCommands'
import { captureSelectionClipboard } from '../src/editor/selectionClipboard'

type Selection = { moduleIds: string[]; wires: WireIdentity[] }
interface BatchApi {
  captureSelection(selection: Selection): { modules: CircuitModule[]; connections: CircuitGraph['connections']; anchor: Point3 }
  pasteSelection(snapshot: unknown, options?: { step?: number; delta?: Point3; targetContact?: string }): { graph: CircuitGraph; selection: Selection }
  deleteSelection(selection: Selection): Selection
}
function setup(graph: CircuitGraph) {
  const store = useCircuitStore(); store.importGraph(graph); store.past = []
  assert.equal(typeof Reflect.get(store, 'pasteSelection'), 'function', 'selection paste needs one atomic graph command')
  assert.equal(typeof Reflect.get(store, 'captureSelection'), 'function', 'selection capture needs an immutable clipboard snapshot')
  return { store, api: store as unknown as BatchApi }
}
const empty = (): CircuitGraph => ({ schema_version: '1.0', circuit_id: 'batch', modules: [], connections: [] })
function mountedGraph(rotation = 0): CircuitGraph {
  const board: CircuitModule = { id: 'BB', type: 'BREADBOARD', position: { x: 2, y: .2, z: 3 }, rotation }
  const mount = solveMounting('RESISTOR_AXIAL', moduleLocalToWorld({ x: -.52, y: .309, z: -.715 }, board), rotation + 90, [board], 'R')!
  assert.equal(mount.valid, true, mount.reason)
  return { ...empty(), schema_version: '1.1', modules: [board, { id: 'R', type: 'RESISTOR_AXIAL', mount: mount.mount, properties: { resistanceOhms: 1234 } }] }
}
beforeEach(() => setActivePinia(createPinia()))

test('mixed copy keeps only explicit selection and remaps deeply cloned modules and wire relationships in one undo', () => {
  const visual = { ...defaultWireVisual(), frameModuleId: 'S', controlPoints: [
    { space: 'module' as const, moduleId: 'S', position: { x: .1, y: .8, z: .2 } },
    { space: 'world' as const, position: { x: 1, y: 1, z: 2 } },
  ] }
  const wire = { source: 'S.OUT', destination: 'L.IN', metadata: { wireVisual: visual, custom: { values: [4] } } }
  const graph = { ...empty(), modules: [
    { id: 'S', type: 'DIGITAL_SWITCH', position: { x: 0, y: 0, z: 0 }, properties: { on: true, nested: { values: [1] } } },
    { id: 'L', type: 'LED', position: { x: 2, y: 0, z: 0 } },
    { id: 'OTHER', type: 'LED' },
  ], connections: [wire, { source: 'S.OUT', destination: 'OTHER.IN' }] }
  const { store, api } = setup(graph)
  const before = store.snapshot()
  const snapshot = api.captureSelection({ moduleIds: ['S', 'L', 'S', 'gone'], wires: [wire, wire] })
  assert.equal(store.snapshot(), before); assert.equal(store.past.length, 0)
  assert.deepEqual(snapshot.modules.map(m => m.id), ['S', 'L']); assert.equal(snapshot.connections.length, 1)
  ;(store.graph!.modules[0].properties!.nested as { values: number[] }).values[0] = 9
  const result = api.pasteSelection(snapshot, { delta: { x: 3, y: 0, z: 1 } })
  assert.equal(store.graph!.modules.length, 5); assert.equal(store.graph!.connections.length, 3); assert.equal(store.past.length, 1)
  const [s, l] = result.selection.moduleIds
  assert.notEqual(s, 'S'); assert.notEqual(l, 'L')
  const copied = store.graph!.modules.find(m => m.id === s)!
  assert.deepEqual(copied.properties!.nested, { values: [1] }); assert.deepEqual(copied.position, { x: 3, y: 0, z: 1 })
  const pasted = store.graph!.connections[2]
  assert.deepEqual(result.selection.wires, [{ source: `${s}.OUT`, destination: `${l}.IN` }])
  assert.equal(readWireVisual(pasted).frameModuleId, s)
  assert.deepEqual(readWireVisual(pasted).controlPoints[0], { space: 'module', moduleId: s, position: { x: .1, y: .8, z: .2 } })
  assert.deepEqual(readWireVisual(pasted).controlPoints[1].position, { x: 4, y: 1, z: 3 })
  ;(pasted.metadata!.custom as { values: number[] }).values.push(5)
  assert.deepEqual((snapshot.connections[0].metadata!.custom as { values: number[] }).values, [4])
  store.undo(); assert.equal(store.graph!.modules.length, 3); assert.equal(store.graph!.connections.length, 2)
  store.redo(); assert.equal(store.graph!.modules.length, 5)
})

test('mounted part copy retains its unselected board and advances by local X pitch on a rotated board', () => {
  const { store, api } = setup(mountedGraph(90))
  const snapshot = api.captureSelection({ moduleIds: ['R'], wires: [] })
  assert.equal(snapshot.modules.length, 1)
  const original = moduleWorldPose(store.graph!.modules[1], store.graph!.modules)
  const result = api.pasteSelection(snapshot, { step: 1 })
  const pasted = store.graph!.modules.find(m => m.id === result.selection.moduleIds[0])!
  assert.equal(pasted.mount!.boardId, 'BB'); assert.equal(pasted.position, undefined)
  assert.ok(Math.abs(pasted.mount!.pose.position.x - store.graph!.modules[1].mount!.pose.position.x - .13) < 1e-8)
  const pose = moduleWorldPose(pasted, store.graph!.modules)
  assert.ok(Math.abs(pose.position!.x! - original.position!.x!) < 1e-8)
  assert.ok(Math.abs(pose.position!.z! - original.position!.z! + .13) < 1e-8)
  validateMountBindings(store.graph!); assert.equal(store.past.length, 1)
})

test('copying a board only never expands selection to mounted children, while explicit children remap mount board IDs', () => {
  const { store, api } = setup(mountedGraph())
  const boardOnly = api.captureSelection({ moduleIds: ['BB'], wires: [] })
  const first = api.pasteSelection(boardOnly, { delta: { x: 0, y: 0, z: 6 } })
  assert.equal(store.graph!.modules.length, 3); assert.equal(first.selection.moduleIds.length, 1)
  const together = api.captureSelection({ moduleIds: ['BB', 'R'], wires: [] })
  const second = api.pasteSelection(together, { delta: { x: 0, y: 0, z: 12 } })
  const [board, resistor] = second.selection.moduleIds
  assert.equal(store.graph!.modules.find(m => m.id === resistor)!.mount!.boardId, board)
  assert.deepEqual(store.graph!.modules.find(m => m.id === resistor)!.mount!.contacts, store.graph!.modules[1].mount!.contacts)
  validateMountBindings(store.graph!)
})

test('a late wire validation failure rolls back every copied object and preserves history', () => {
  const graph = { ...empty(), modules: [{ id: 'S', type: 'DIGITAL_SWITCH' }, { id: 'L', type: 'LED' }], connections: [{ source: 'S.OUT', destination: 'L.IN' }] }
  const { store, api } = setup(graph)
  const snapshot = api.captureSelection({ moduleIds: ['S'], wires: graph.connections })
  const before = store.snapshot()
  assert.throws(() => api.pasteSelection(snapshot), /driver/)
  assert.equal(store.snapshot(), before); assert.equal(store.past.length, 0)
})

test('batch deletion detaches surviving mounted parts and world-rebases surviving route ownership in one undo', () => {
  const graph = mountedGraph(90)
  graph.modules.push({ id: 'L', type: 'LED' })
  const visual = { ...defaultWireVisual(), frameModuleId: 'BB', controlPoints: [{ space: 'module' as const, moduleId: 'BB', position: { x: 1, y: .8, z: 2 } }] }
  graph.connections.push({ source: 'R.A', destination: 'L.IN', metadata: { wireVisual: visual } }, { source: 'BB.contact:terminal:A:01', destination: 'R.B' })
  const { store, api } = setup(graph)
  assert.deepEqual(api.deleteSelection({ moduleIds: ['BB', 'BB'], wires: [] }), { moduleIds: [], wires: [] })
  assert.equal(store.graph!.modules.length, 2); assert.equal(store.graph!.connections.length, 1); assert.equal(store.past.length, 1)
  assert.equal(store.graph!.modules[0].mount, undefined)
  const route = readWireVisual(store.graph!.connections[0])
  assert.equal(route.frameModuleId, null)
  assert.equal(route.controlPoints[0].space, 'world')
  assert.ok(Math.abs(route.controlPoints[0].position.x - 4) < 1e-8)
  assert.ok(Math.abs(route.controlPoints[0].position.z - 2) < 1e-8)
  store.undo(); assert.equal(store.graph!.modules.length, 3); validateMountBindings(store.graph!)
})

test('wire-only batch copy reuses declared contact shifts and rejects the whole batch at a rail gap', () => {
  const graph: CircuitGraph = { ...empty(), modules: [{ id: 'BB', type: 'BREADBOARD_100' }], connections: [
    { source: 'BB.contact:rail:positive:01', destination: 'BB.contact:rail:negative:01', metadata: { custom: { keep: true } } },
    { source: 'BB.contact:rail:positive:05', destination: 'BB.contact:rail:negative:05' },
  ] }
  const { store, api } = setup(graph)
  const snapshot = api.captureSelection({ moduleIds: [], wires: graph.connections })
  const before = store.snapshot()
  assert.throws(() => api.pasteSelection(snapshot), /No next contact/)
  assert.equal(store.snapshot(), before); assert.equal(store.past.length, 0)
  const valid = api.captureSelection({ moduleIds: [], wires: [graph.connections[0]] })
  const result = api.pasteSelection(valid)
  assert.deepEqual(result.selection.wires, [{ source: 'BB.contact:rail:positive:02', destination: 'BB.contact:rail:negative:02' }])
  assert.deepEqual(store.graph!.connections[2].metadata!.custom, { keep: true }); assert.equal(store.past.length, 1)
})

test('invalid mounted placement returns a visible candidate without changing the graph or clipboard', () => {
  const graph = mountedGraph(), snapshot = captureSelectionClipboard(graph, { moduleIds: ['R'], wires: [] })!
  const before = JSON.stringify(graph), clipboardBefore = JSON.stringify(snapshot)
  let error: unknown
  try { buildPasteCandidate(graph, snapshot, { delta: { x: 100, y: 0, z: 100 } }) } catch (caught) { error = caught }
  assert.ok(error instanceof PasteCandidateError)
  const preview = error.previewGraph.modules.find(module => error.selection.moduleIds.includes(module.id))
  assert.ok(preview, 'an invalid group placement still needs a component ghost')
  assert.ok(Math.abs(moduleWorldPose(preview, error.previewGraph.modules).position!.x! - snapshot.anchor.x - 100) < 1e-8)
  assert.equal(JSON.stringify(graph), before); assert.equal(JSON.stringify(snapshot), clipboardBefore)
})

test('explicit contact placement moves a mounted part and its selected wire to a rotated target board', () => {
  const graph = mountedGraph()
  graph.modules.push({ id: 'TARGET', type: 'BREADBOARD', position: { x: 10, y: .2, z: 3 }, rotation: 90 })
  graph.connections.push({ source: 'R.A', destination: 'BB.contact:terminal:A:01', metadata: { wireVisual: { ...defaultWireVisual(), frameModuleId: 'BB', controlPoints: [{ space: 'module', moduleId: 'BB', position: { x: -.52, y: .8, z: -.7 } }] } } })
  const { store, api } = setup(graph), snapshot = api.captureSelection({ moduleIds: ['R'], wires: graph.connections })
  const contact = graph.modules[1].mount!.contacts[0].contactId
  const result = api.pasteSelection(snapshot, { targetContact: `TARGET.contact:${contact}` })
  const part = store.graph!.modules.find(module => module.id === result.selection.moduleIds[0])!
  assert.equal(part.mount!.boardId, 'TARGET')
  assert.deepEqual(part.mount!.contacts, graph.modules[1].mount!.contacts)
  assert.equal(result.selection.wires[0].source, `${part.id}.A`)
  assert.equal(result.selection.wires[0].destination, 'TARGET.contact:terminal:A:01')
  const visual = readWireVisual(store.graph!.connections[1])
  assert.equal(visual.frameModuleId, 'TARGET'); assert.equal(visual.controlPoints[0].space, 'module')
  validateMountBindings(store.graph!); assert.equal(store.past.length, 1)
})

test('mounted clipboard placements follow the current board pose while preserving copied properties', () => {
  const { store, api } = setup(mountedGraph())
  const snapshot = api.captureSelection({ moduleIds: ['R'], wires: [] })
  store.moveModule('BB', { x: 8, y: .2, z: 5 }); store.rotateModule('BB', 90); store.past = []
  const result = api.pasteSelection(snapshot)
  const original = store.graph!.modules.find(module => module.id === 'R')!, copied = store.graph!.modules.find(module => module.id === result.selection.moduleIds[0])!
  assert.equal(copied.mount!.boardId, 'BB')
  assert.ok(Math.abs(copied.mount!.pose.position.x - original.mount!.pose.position.x - .13) < 1e-8)
  assert.equal(copied.mount!.pose.rotation, original.mount!.pose.rotation)
  validateMountBindings(store.graph!); assert.equal(store.past.length, 1)
})

test('a copied physical output cannot add a second driver through mounting bonds without a selected wire', () => {
  const board: CircuitModule = { id: 'BB', type: 'BREADBOARD' }
  const candidate = solveMounting('SN74HC08N', { x: -.52, y: .309, z: 0 }, 0, [board], 'U')!
  assert.equal(candidate.valid, true)
  const output = candidate.mount.contacts.find(binding => binding.pinId === '3')!
  const [, row, column] = output.contactId.split(':')
  const freeRow = row === 'E' ? 'A' : 'J', targetColumn = String(Number(column) + 10).padStart(2, '0')
  const graph: CircuitGraph = { ...empty(), schema_version: '1.1', modules: [board, { id: 'U', type: 'SN74HC08N', mount: candidate.mount }, { id: 'S', type: 'DIGITAL_SWITCH', position: { x: 10, y: 0, z: 0 } }], connections: [{ source: 'S.OUT', destination: `BB.contact:terminal:${freeRow}:${targetColumn}` }] }
  const { store, api } = setup(graph), snapshot = api.captureSelection({ moduleIds: ['U'], wires: [] }), before = store.snapshot()
  assert.throws(() => api.pasteSelection(snapshot, { step: 10 }), /driver/i)
  assert.equal(store.snapshot(), before); assert.equal(store.past.length, 0)
})

test('wire-only port copy reports the explicit breadboard-contact restriction', () => {
  const graph = { ...empty(), modules: [{ id: 'S', type: 'DIGITAL_SWITCH' }, { id: 'L', type: 'LED' }], connections: [{ source: 'S.OUT', destination: 'L.IN' }] }
  const { api } = setup(graph), snapshot = api.captureSelection({ moduleIds: [], wires: graph.connections })
  assert.throws(() => api.pasteSelection(snapshot), /breadboard contacts/i)
})

test('endpoint direction normalization preserves unknown future routing metadata', () => {
  const future = { version: 2, futureRoute: { anchors: [1, 2, 3] } }
  const graph = { ...empty(), modules: [{ id: 'S', type: 'DIGITAL_SWITCH' }, { id: 'L', type: 'LED' }], connections: [{ source: 'L.IN', destination: 'S.OUT', metadata: { wireVisual: future } }] }
  const { store, api } = setup(graph), snapshot = api.captureSelection({ moduleIds: ['S', 'L'], wires: graph.connections })
  const result = api.pasteSelection(snapshot)
  assert.equal(result.selection.wires[0].source, `${result.selection.moduleIds[0]}.OUT`)
  assert.deepEqual(store.graph!.connections[1].metadata!.wireVisual, future)
})

test('wire-only port-to-contact copy retains an explicit output port and shifts the selected contact for valid fanout', () => {
  const visual = { ...defaultWireVisual(), frameModuleId: 'BB', controlPoints: [{ space: 'world' as const, position: { x: 0, y: .8, z: 0 } }] }
  const graph: CircuitGraph = { ...empty(), modules: [{ id: 'BB', type: 'BREADBOARD', rotation: 90 }, { id: 'S', type: 'DIGITAL_SWITCH', position: { x: -8, y: 0, z: 0 } }], connections: [{ source: 'S.OUT', destination: 'BB.contact:terminal:A:01', metadata: { wireVisual: visual } }] }
  const { store, api } = setup(graph), snapshot = api.captureSelection({ moduleIds: [], wires: graph.connections })
  const result = api.pasteSelection(snapshot)
  assert.deepEqual(result.selection.wires, [{ source: 'S.OUT', destination: 'BB.contact:terminal:A:02' }])
  const copy = readWireVisual(store.graph!.connections[1])
  assert.ok(Math.abs(copy.controlPoints[0].position.x) < 1e-8)
  assert.ok(Math.abs(copy.controlPoints[0].position.z + .13) < 1e-8)
  assert.equal(store.graph!.modules.length, 2); assert.equal(store.past.length, 1)
})

test('multiple explicitly selected port-contact wires paste as one command without copying endpoint modules', () => {
  const graph: CircuitGraph = { ...empty(), modules: [{ id: 'BB', type: 'BREADBOARD' }, { id: 'S', type: 'DIGITAL_SWITCH' }, { id: 'T', type: 'DIGITAL_SWITCH' }], connections: [
    { source: 'S.OUT', destination: 'BB.contact:terminal:A:01' },
    { source: 'T.OUT', destination: 'BB.contact:terminal:J:08' },
  ] }
  const { store, api } = setup(graph), snapshot = api.captureSelection({ moduleIds: [], wires: graph.connections })
  const result = api.pasteSelection(snapshot)
  assert.deepEqual(result.selection, { moduleIds: [], wires: [
    { source: 'S.OUT', destination: 'BB.contact:terminal:A:02' },
    { source: 'T.OUT', destination: 'BB.contact:terminal:J:09' },
  ] })
  assert.equal(store.graph!.modules.length, 3); assert.equal(store.graph!.connections.length, 4); assert.equal(store.past.length, 1)
  store.undo(); assert.equal(store.graph!.connections.length, 2)
})

test('an invalid copied wire remains renderable after its original connection is deleted', () => {
  const graph: CircuitGraph = { ...empty(), modules: [{ id: 'BB', type: 'BREADBOARD' }], connections: [{ source: 'BB.contact:terminal:A:63', destination: 'BB.contact:terminal:J:60', metadata: { wireVisual: { ...defaultWireVisual(), color: '#d8493f' } } }] }
  const snapshot = captureSelectionClipboard(graph, { moduleIds: [], wires: graph.connections })!
  let error: unknown
  try { buildPasteCandidate({ ...graph, connections: [] }, snapshot) } catch (caught) { error = caught }
  assert.ok(error instanceof PasteCandidateError)
  const wire = error.previewGraph.connections.find(wire => wire.source === error.selection.wires[0].source && wire.destination === error.selection.wires[0].destination)
  assert.ok(wire, 'invalid wire preview must carry the snapshotted connection even if it no longer exists in the graph')
  assert.equal(readWireVisual(wire).color, '#d8493f')
})

test('a wire visual rebinds owners mapped by another wire in the copied group', () => {
  const graph: CircuitGraph = { ...empty(), modules: [
    { id: 'A', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 } },
    { id: 'B', type: 'BREADBOARD', position: { x: 10, y: 0, z: 0 } },
    { id: 'C', type: 'BREADBOARD', position: { x: 20, y: 0, z: 0 } },
    { id: 'D', type: 'BREADBOARD', position: { x: 30, y: 0, z: 0 } },
  ], connections: [
    { source: 'A.contact:terminal:A:01', destination: 'A.contact:terminal:J:08', metadata: { wireVisual: { ...defaultWireVisual(), frameModuleId: 'B', controlPoints: [{ space: 'module', moduleId: 'B', position: { x: 0, y: .8, z: 0 } }] } } },
    { source: 'B.contact:terminal:A:01', destination: 'B.contact:terminal:J:08' },
  ] }
  const { store, api } = setup(graph), snapshot = api.captureSelection({ moduleIds: [], wires: graph.connections })
  api.pasteSelection(snapshot, { targetContact: 'C.contact:terminal:A:01' })
  const visual = readWireVisual(store.graph!.connections[2]), control = visual.controlPoints[0]
  assert.equal(visual.frameModuleId, 'D'); assert.equal(control.space, 'module')
  assert.ok(control.space === 'module'); assert.equal(control.moduleId, 'D')
  assert.ok(Math.abs(control.position.x) < 1e-7)
  const world = () => moduleLocalToWorld(control.position, moduleWorldPose(store.graph!.modules.find(module => module.id === control.moduleId)!, store.graph!.modules))
  assert.equal(world().x, 30)
  store.moveModule('B', { x: 100, y: 0, z: 0 }); assert.equal(world().x, 30)
  store.moveModule('D', { x: 31, y: 0, z: 0 }); assert.equal(world().x, 31)
})
