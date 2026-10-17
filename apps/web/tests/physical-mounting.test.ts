import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { useCircuitStore } from '../src/stores/circuit'
import { solveMounting, validateMountBindings } from '../src/electrical/mounting'
import { moduleLocalToWorld, moduleWorldPose } from '../src/electrical/modulePose'
import { resolveElectricalNets } from '../src/electrical/nets'
import type { CircuitModule, CircuitGraph } from '../src/contracts/generated/dto'
import { getPartForType, MM_TO_WORLD } from '../src/data/partCatalog'
import { getBreadboardContact } from '../src/electrical/BreadboardTopology'
import parity from '../../../contracts/design-models/fixtures/physical-mounting-parity.json'
import { createSceneManager } from '../src/three/SceneManager'
import { endpointLeadPosition } from '../src/wires/wireRouting'
import { defaultWireVisual } from '../src/wires/wireVisual'

beforeEach(() => setActivePinia(createPinia()))
test('file import refuses unvalidated mounting data on legacy or unknown parts', () => {
  const raw = { schema_version: '1.0', circuit_id: 'forged', modules: [{ id: 'L', type: 'LED', mount: { version: 1, boardId: 'missing' } }], connections: [] }
  assert.throws(() => parseCircuitFile(JSON.stringify(raw)), /mount|schema|physical/i)
})
test('file import refuses physical components without schema 1.1', () => {
  const raw = { schema_version: '1.0', circuit_id: 'legacy', modules: [{ id: 'U', type: 'SN74HC08N' }], connections: [] }
  assert.throws(() => parseCircuitFile(JSON.stringify(raw)), /1.1|physical/i)
})
const board = (): CircuitModule => ({ id: 'BB', type: 'BREADBOARD', position: { x: 3, y: .2, z: -2 }, rotation: 37 })
function mounted(): CircuitGraph {
  const b = board(), target = moduleLocalToWorld({ x: -.52, y: .309, z: 0 }, b)
  const solution = solveMounting('SN74HC08N', target, 37, [b])!
  assert.equal(solution.valid, true, solution.reason)
  return { schema_version: '1.1', circuit_id: 'mount', modules: [b, { id: 'U', type: 'SN74HC08N', mount: solution.mount }], connections: [] }
}
test('DIP14 rigid footprint fits all holes across the gap on a translated rotated board', () => {
  const g = mounted(), u = g.modules[1], b = g.modules[0]
  assert.equal(u.mount!.contacts.length, 14)
  const world = moduleWorldPose(u, g.modules)
  for (const pin of getPartForType(u.type)!.package.pins) {
    const contact = getBreadboardContact(b.type, u.mount!.contacts.find(c => c.pinId === pin.id)!.contactId)!
    const actual = moduleLocalToWorld({ x: pin.positionMm.x * MM_TO_WORLD, y: 0, z: pin.positionMm.z * MM_TO_WORLD }, world)
    const expected = moduleLocalToWorld({ x: contact.localPosition[0], y: contact.localPosition[1], z: contact.localPosition[2] }, b)
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y, actual.z - expected.z) < 1e-8)
  }
  assert.equal(u.position, undefined)
  assert.ok(u.mount!.contacts.some(c => c.contactId.startsWith('terminal:E:')))
  assert.ok(u.mount!.contacts.some(c => c.contactId.startsWith('terminal:F:')))
  assert.equal(solveMounting(u.type, world.position as { x: number; y: number; z: number }, 127, [b])!.valid, false)
})
test('mounting adds electrical bonds through a free strip hole without adding visible jumpers', () => {
  const g = mounted(), binding = g.modules[1].mount!.contacts[0]
  const [, row, column] = binding.contactId.split(':')
  const freeRow = row === 'F' ? 'J' : 'A'
  g.modules.push({ id: 'R', type: 'RESISTOR_AXIAL' })
  g.connections = [{ source: `BB.contact:terminal:${freeRow}:${column}`, destination: 'R.A' }]
  const nets = resolveElectricalNets(g).endpointNetIds
  assert.equal(nets['U.1'], nets['R.A'])
  assert.notEqual(nets['R.A'], nets['R.B'])
  assert.notEqual(nets['U.1'], nets['U.14'])
  assert.equal(g.connections.length, 1)
})
test('forged geometry, stale revisions, duplicate pins and occupied holes fail validation', () => {
  for (const mutate of [
    (g: CircuitGraph) => { g.modules[1].mount!.packageRevision++ },
    (g: CircuitGraph) => { g.modules[1].mount!.pose.position.x += .01 },
    (g: CircuitGraph) => { g.modules[1].mount!.contacts[0].contactId = 'terminal:A:01' },
    (g: CircuitGraph) => { g.modules[1].mount!.contacts[1].pinId = '1' },
    (g: CircuitGraph) => { g.modules.push({ ...structuredClone(g.modules[1]), id: 'U2' }) },
    (g: CircuitGraph) => { g.modules[1].position = { x: 0 } },
  ]) { const g = mounted(); mutate(g); assert.throws(() => validateMountBindings(g), /mount|pose|occupied|binding|revision|footprint/i) }
})
test('board moves, detach, delete and undo redo change pose and bonds atomically', () => {
  const store = useCircuitStore(); store.importGraph(mounted()); store.past = []
  const before = moduleWorldPose(store.graph!.modules[1], store.graph!.modules)
  store.moveModule('BB', { x: 5, y: .2, z: -1 })
  assert.equal(store.past.length, 1)
  const after = moduleWorldPose(store.graph!.modules[1], store.graph!.modules)
  assert.ok(Math.abs(after.position!.x! - before.position!.x! - 2) < 1e-9)
  store.rotateModule('BB', 90); assert.equal(store.graph!.modules[1].position, undefined)
  const mountedNets = resolveElectricalNets(store.graph!).endpointNetIds
  store.detachModule('U'); assert.equal(store.graph!.modules[1].mount, undefined)
  assert.notEqual(resolveElectricalNets(store.graph!).endpointNetIds['U.1'], mountedNets['U.1'])
  store.undo(); assert.ok(store.graph!.modules[1].mount)
  store.removeModule('BB'); assert.equal(store.graph!.modules[0].mount, undefined)
  assert.ok(store.graph!.modules[0].position)
  store.undo(); assert.equal(store.graph!.modules.length, 2); validateMountBindings(store.graph!)
  store.redo(); assert.equal(store.graph!.modules.length, 1)
})
test('physical save/open retains exact mounting while legacy roundtrip remains schema 1.0', () => {
  const g = mounted(); assert.deepEqual(parseCircuitFile(JSON.stringify(g)), g)
  const legacy: CircuitGraph = { schema_version: '1.0', circuit_id: 'old', modules: [{ id: 'L', type: 'LED', properties: { foo: 1 } }], connections: [] }
  assert.deepEqual(parseCircuitFile(JSON.stringify(legacy)), legacy)
})
test('shared TS/Python fixture has identical mount, switch and jumper connectivity', () => {
  const graph = parity.graph as CircuitGraph
  const groups = resolveElectricalNets(graph).nets.map(n => n.endpoints).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  assert.deepEqual(groups, parity.expectedGroups)
  assert.deepEqual(parseCircuitFile(JSON.stringify(graph)), graph)
})
test('mounted pin jumpers inherit their board support and rise above the deck', () => {
  const graph = mounted(), manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.syncGraph(graph)
    const endpoint = manager.wireContext.endpoint('U.1')!
    assert.equal(endpoint.contactModuleId, 'BB')
    const lead = endpointLeadPosition(endpoint, defaultWireVisual(), manager.wireContext)
    assert.ok(lead.y > graph.modules[0].position!.y! + .33)
  } finally { manager.dispose() }
})
test('component rotation and removal off-board atomically replace mount bonds and one history entry', () => {
  const store = useCircuitStore(); store.importGraph(mounted()); store.past = []
  store.rotateModule('U', 180)
  assert.equal(store.past.length, 1); validateMountBindings(store.graph!)
  const snapshot = store.snapshot()
  assert.throws(() => store.rotateModule('U', 90), /gap|aligned|fit/)
  assert.equal(store.snapshot(), snapshot); assert.equal(store.past.length, 1)
  store.moveModule('U', { x: 20, y: 0, z: 20 })
  assert.equal(store.graph!.modules[1].mount, undefined); assert.equal(store.past.length, 2)
  store.undo(); assert.ok(store.graph!.modules[1].mount); validateMountBindings(store.graph!)
  store.redo(); assert.equal(store.graph!.modules[1].mount, undefined)
})
test('occupancy belongs to each hole while separate holes on one strip remain available', () => {
  const b: CircuitModule = { id: 'BB', type: 'BREADBOARD' }, modules = [b]
  for (const [id, z] of [['R1', -.715], ['R2', -.195]] as const) {
    const candidate = solveMounting('RESISTOR_AXIAL', { x: 0, y: .309, z }, 0, modules, id)!
    assert.equal(candidate.valid, true, candidate.reason)
    modules.push({ id, type: 'RESISTOR_AXIAL', mount: candidate.mount })
  }
  const g: CircuitGraph = { schema_version: '1.1', circuit_id: 'holes', modules, connections: [] }
  validateMountBindings(g)
  const ids = resolveElectricalNets(g).endpointNetIds
  assert.equal(ids['R1.A'], ids['R2.A']); assert.notEqual(ids['R1.A'], ids['R1.B'])
})
test('half-turn mounting around the zero coordinate does not shift a legal footprint', () => {
  const b: CircuitModule = { id: 'BB', type: 'BREADBOARD' }
  const result = solveMounting('SN74HC08N', { x: 0, y: .309, z: 0 }, 180, [b])!
  assert.equal(result.valid, true, result.reason)
  assert.ok(Math.abs(result.position.x) < 1e-8, `unexpected footprint shift ${result.position.x}`)
  assert.ok(Math.abs(result.position.z) < 1e-8)
})
