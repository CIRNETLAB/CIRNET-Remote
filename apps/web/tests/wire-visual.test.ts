import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitStore } from '../src/stores/circuit'
import { defaultWireVisual, readWireVisual } from '../src/wires/wireVisual'
import { resolveElectricalNets } from '../src/electrical/nets'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import type { WireVisual } from '../src/types/circuit'

beforeEach(() => { setActivePinia(createPinia()); useCircuitStore().createDraft() })
function fixture() {
  const store = useCircuitStore()
  const board = store.placeModule('BREADBOARD', { x: 2, y: 0, z: 3 }, 90)
  const first = `${board}.contact:terminal:A:01`, second = `${board}.contact:terminal:J:03`
  const visual: WireVisual = { ...defaultWireVisual(), color: '#d8493f', routeMode: 'ORTHOGONAL', controlPoints: [
    { space: 'module', moduleId: board, position: { x: 1, y: .36, z: 2 } },
    { space: 'world', position: { x: 5, y: .36, z: 6 } },
  ] }
  store.past = []
  return { store, board, first, second, visual }
}

test('contact creation and visual edits round-trip with one history entry and unchanged electrical nets', () => {
  const { store, first, second, visual } = fixture()
  store.connectEndpoints(first, second, visual)
  assert.equal(store.past.length, 1)
  const wire = store.graph!.connections[0], nets = resolveElectricalNets(store.graph!).nets
  wire.metadata!.custom = { retained: true }
  const changed = { ...visual, color: '#397ec6', controlPoints: [...visual.controlPoints, { space: 'world' as const, position: { x: 7, y: .36, z: 1 } }] }
  store.updateWireVisual(wire, changed)
  assert.equal(store.past.length, 2)
  assert.deepEqual(resolveElectricalNets(store.graph!).nets, nets)
  assert.deepEqual(store.graph!.connections[0].metadata!.custom, { retained: true })
  store.updateWireVisual(wire, changed); assert.equal(store.past.length, 2)
  store.undo(); assert.equal(readWireVisual(store.graph!.connections[0]).color, '#d8493f')
  store.redo(); assert.equal(readWireVisual(store.graph!.connections[0]).color, '#397ec6')
  assert.deepEqual(parseCircuitFile(store.exportGraph()).connections, store.graph!.connections)
  store.importGraph(parseCircuitFile(store.exportGraph()))
  assert.deepEqual(readWireVisual(store.graph!.connections[0]), changed)
})

test('logical endpoint normalization reverses asymmetric bends and malformed visuals never mutate history', () => {
  const { store, visual } = fixture()
  const a = store.placeModule('DIGITAL_SWITCH', { x: 0, y: 0, z: 0 }), b = store.placeModule('LED', { x: 4, y: 0, z: 0 })
  store.connectEndpoints(`${b}.IN`, `${a}.OUT`, visual)
  const wire = store.graph!.connections[0]
  assert.equal(wire.source, `${a}.OUT`)
  assert.deepEqual(readWireVisual(wire).controlPoints, [...visual.controlPoints].reverse())
  const snapshot = store.snapshot(), history = store.past.length
  for (const patch of [{ color: 'oops' }, { thickness: 0 }, { thickness: Infinity }, { routeMode: 'CURVE' }, { controlPoints: [{ space: 'module', moduleId: 'MISSING', position: { x: 0, y: 0, z: 0 } }] }]) {
    assert.throws(() => store.updateWireVisual(wire, { ...visual, ...patch } as WireVisual))
    assert.equal(store.snapshot(), snapshot); assert.equal(store.past.length, history)
  }
})

test('deleting a supporting board converts its local bends without disconnecting other endpoints', () => {
  const { store, board, visual } = fixture()
  const a = store.placeModule('CLOCK', { x: 0, y: 0, z: 0 }), b = store.placeModule('LED', { x: 5, y: 0, z: 0 })
  store.connectEndpoints(`${a}.OUT`, `${b}.IN`, visual)
  store.removeModule(board)
  const wire = store.graph!.connections[0]
  assert.equal(wire.source, `${a}.OUT`); assert.equal(wire.destination, `${b}.IN`)
  const point = readWireVisual(wire).controlPoints[0]
  assert.equal(point.space, 'world')
  assert.ok(Math.abs(point.position.x - 4) < 1e-9)
  assert.ok(Math.abs(point.position.z - 2) < 1e-9)
  store.undo(); assert.equal(readWireVisual(store.graph!.connections[0]).controlPoints[0].space, 'module')
})

test('future visual versions and unrelated metadata survive files with safe legacy rendering', () => {
  const { store, first, second } = fixture()
  store.connectEndpoints(first, second)
  const wire = store.graph!.connections[0]
  wire.metadata = { custom: 123, wireVisual: { version: 9, future: ['keep', 'all'] } }
  assert.deepEqual(parseCircuitFile(store.exportGraph()).connections[0].metadata, wire.metadata)
  assert.equal(readWireVisual(wire).routeMode, 'AUTO')
  const bad = JSON.parse(JSON.stringify(store.graph!))
  bad.connections[0].metadata = { wireVisual: { ...defaultWireVisual(), controlPoints: [{ space: 'world', position: { x: null, y: 0, z: 0 } }] } }
  assert.throws(() => parseCircuitFile(JSON.stringify(bad)))
})
