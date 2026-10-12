import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitStore } from '../src/stores/circuit'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { componentCatalog, getDefinition } from '../src/data/editorCatalog'
import { createMemoryImage, parseMemoryImage } from '../src/services/files/memoryImage'

beforeEach(() => { setActivePinia(createPinia()); useCircuitStore().createDraft(); useCircuitStore().past = [] })
test('placement accepts a finite initial rotation in one command and rejects invalid rotation before history', () => {
  const store = useCircuitStore(), position = { x: 2, y: 0, z: 3 }
  const place = store.placeModule
  const snapshot = store.snapshot()
  for (const rotation of [NaN, Infinity, -Infinity]) {
    assert.throws(() => place('BREADBOARD', position, rotation), /Rotation must be finite/)
    assert.equal(store.snapshot(), snapshot); assert.equal(store.past.length, 0)
  }
  const id = place('BREADBOARD', position, -270)
  assert.equal(store.graph!.modules[0].rotation, 90); assert.equal(store.past.length, 1)
  store.undo(); assert.equal(store.graph!.modules.length, 0)
  store.redo(); assert.equal(store.graph!.modules[0].id, id); assert.equal(store.graph!.modules[0].rotation, 90)
})
test('visual supply controls are bounded, isolated and survive file round-trip without electrical ports', () => {
  const store = useCircuitStore(), position = { x: 0, y: 0, z: 0 }
  store.placeModule('POWER_SUPPLY', position); store.placeModule('POWER_SUPPLY', position)
  const id = store.graph!.modules[0].id
  store.updateModuleProperties(id, { voltage_v: 12, current_limit_a: 2, power_on: true })
  assert.deepEqual(store.graph!.modules[1].properties, { voltage_v: 0, current_limit_a: 0, power_on: false })
  const snapshot = store.snapshot(), steps = store.past.length
  for (const patch of [{ voltage_v: 15.1 }, { voltage_v: -0.1 }, { current_limit_a: 5.1 }, { current_limit_a: -0.1 }, { power_on: 1 }]) assert.throws(() => store.updateModuleProperties(id, patch))
  assert.equal(store.snapshot(), snapshot); assert.equal(store.past.length, steps)
  assert.deepEqual(parseCircuitFile(store.exportGraph()).modules[0].properties, { voltage_v: 12, current_limit_a: 2, power_on: true })
  assert.deepEqual(getDefinition('POWER_SUPPLY')!.ports, [])
})
test('required families have explicit functional contracts; visual structures never create ports', () => {
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100', 'BOARD', 'POWER_SUPPLY', 'RESISTOR', 'CAPACITOR', 'PUSH_BUTTON', 'DIGITAL_SWITCH', 'DIP_SWITCH', 'CLOCK', 'LED', 'SEGMENT_1', 'PROBE', 'DISPLAY', '74HC08', 'ADDER', 'MULTIPLIER', 'MEMORY']) assert.ok(getDefinition(type), type)
  for (const type of ['BREADBOARD', 'BREADBOARD_630', 'BREADBOARD_100', 'BOARD', 'POWER_SUPPLY']) assert.deepEqual(getDefinition(type)?.ports, [])
  assert.equal(getDefinition('74HC08')?.ports.length, 12)
  assert.equal(getDefinition('ADDER')?.partNumber, undefined)
  assert.equal(getDefinition('MULTIPLIER')?.partNumber, undefined)
  assert.equal(new Set(componentCatalog.map((item) => item.type)).size, componentCatalog.length)
})
test('place, move, rotate, delete and undo/redo keep electrical identities stable', () => {
  const store = useCircuitStore()
  const a = store.placeModule('DIGITAL_SWITCH', { x: -2, y: 0, z: 0 })
  const b = store.placeModule('LED', { x: 2, y: 0, z: 0 })
  store.connectPorts(`${a}.OUT`, `${b}.IN`)
  const wires = JSON.stringify(store.graph!.connections)
  const steps = store.past.length
  store.moveModule(a, { x: -1, y: 0, z: 2 })
  store.rotateModule(a)
  assert.equal(store.past.length, steps + 2)
  assert.equal(JSON.stringify(store.graph!.connections), wires)
  store.removeModule(a)
  assert.equal(store.graph!.connections.length, 0)
  store.undo()
  assert.equal(JSON.stringify(store.graph!.connections), wires)
  assert.equal(store.graph!.modules[0].rotation, 90)
  store.redo()
  assert.equal(store.graph!.modules.length, 1)
  const reopened = parseCircuitFile(store.exportGraph())
  assert.equal(reopened.modules[0].id, b)
})
test('failed or unchanged commands never mutate graph, validation or history', () => {
  const store = useCircuitStore()
  const a = store.placeModule('DIGITAL_SWITCH', { x: 0, y: 0, z: 0 })
  const b = store.placeModule('DIGITAL_SWITCH', { x: 1, y: 0, z: 0 })
  store.validationResult = { valid: true, code: 'VALID', message: 'structural' }
  store.validatedSnapshot = JSON.stringify(store.graph)
  const snapshot = store.snapshot(), steps = store.past.length
  for (const command of [() => store.connectPorts(`${a}.OUT`, `${b}.OUT`), () => store.connectPorts(`${a}.MISSING`, `${b}.OUT`), () => store.placeModule('UNKNOWN', { x: 0, y: 0, z: 0 }), () => store.moveModule(a, { x: NaN, y: 0, z: 0 })]) assert.throws(command)
  store.moveModule(a, { x: 0, y: 0, z: 0 }); store.removeModule('missing')
  assert.equal(store.snapshot(), snapshot); assert.equal(store.past.length, steps); assert.ok(store.validation)
})
test('fanout works; duplicate and multiple-driver connections fail; unwire is undoable', () => {
  const store = useCircuitStore(), pos = { x: 0, y: 0, z: 0 }
  const a = store.placeModule('CLOCK', pos), b = store.placeModule('LED', pos), c = store.placeModule('LED', pos), d = store.placeModule('DIGITAL_SWITCH', pos)
  store.connectPorts(`${a}.OUT`, `${b}.IN`); store.connectPorts(`${a}.OUT`, `${c}.IN`)
  assert.throws(() => store.connectPorts(`${a}.OUT`, `${b}.IN`), /already/i)
  assert.throws(() => store.connectPorts(`${d}.OUT`, `${b}.IN`), /driver/i)
  store.disconnectPorts(`${a}.OUT`, `${b}.IN`); assert.equal(store.graph!.connections.length, 1)
  store.undo(); assert.equal(store.graph!.connections.length, 2)
  store.updateModuleProperties(d, { state: true }); assert.equal(store.canRedo, false); assert.equal(store.validation, null)
})
test('memory contract isolates instances, round-trips and rejects invalid bytes atomically', () => {
  const store = useCircuitStore(), pos = { x: 0, y: 0, z: 0 }
  const a = store.placeModule('MEMORY', pos), b = store.placeModule('MEMORY', pos)
  const memory = createMemoryImage(16); memory.data[0] = 0xAF
  store.setMemoryImage(a, memory)
  assert.equal((store.graph!.modules[1].properties!.memory as typeof memory).data[0], 0)
  assert.deepEqual(parseMemoryImage(JSON.stringify(memory)), memory)
  const snapshot = store.snapshot(), steps = store.past.length
  assert.throws(() => store.setMemoryImage(a, { ...memory, data: [256] }))
  assert.equal(store.snapshot(), snapshot); assert.equal(store.past.length, steps)
  store.undo(); assert.equal((store.graph!.modules[0].properties!.memory as typeof memory).data[0], 0)
  store.redo(); assert.equal((store.graph!.modules[0].properties!.memory as typeof memory).data[0], 0xAF)
  assert.equal(parseCircuitFile(store.exportGraph()).modules[1].id, b)
})
test('import rejects ambiguous IDs, dangling references and malformed editor fields before mutation', () => {
  const store = useCircuitStore(), base = { schema_version: '1.0', circuit_id: 'test', modules: [{ id: 'A', type: 'unknown' }], connections: [] }
  const snapshot = store.snapshot()
  for (const bad of [{ ...base, modules: [base.modules[0], base.modules[0]] }, { ...base, connections: [{ source: 'A.OUT', destination: 'B.IN' }] }, { ...base, modules: [{ ...base.modules[0], rotation: 'bad' }] }]) {
    assert.throws(() => store.importGraph(parseCircuitFile(JSON.stringify(bad))))
    assert.equal(store.snapshot(), snapshot)
  }
  store.importGraph(parseCircuitFile(JSON.stringify({ ...base, modules: [{ id: 'Legacy', type: 'unknown', properties: { untouched: 123 } }] })))
  assert.equal(store.graph!.modules[0].properties!.untouched, 123)
})
