import { test } from 'node:test'
import assert from 'node:assert/strict'
import historicalFixture from '../../../contracts/design-models/fixtures/component-mechanics-legacy.json'
import { parseCircuitFile } from '../src/domain/document/circuitFile'
import { getPartForType, MM_TO_WORLD } from '../src/data/partCatalog'
import { buildComponent, disposeObject } from '../src/three/ComponentModel'
import { packagePinAnchor } from '../src/three/PackageModel'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitStore } from '../src/stores/circuit'

test('unmarked free generic snapshots retain historical body and pin positions on open', () => {
  for (const [type, body, span] of [['GENERIC_RESISTOR', [6.5, 2.5, 2.5], 10.16], ['GENERIC_CAPACITOR_ELECTROLYTIC', [10, 12.5, 10], 5.08]] as const) {
    const original = { schema_version: '1.1', circuit_id: 'oldfree', modules: [{ id: 'M', type, position: { x: 2, y: 0, z: 3 }, properties: { opaque: { keep: true } } }], connections: [] }
    const graph = parseCircuitFile(JSON.stringify(original)), module = graph.modules[0]!, model = buildComponent(module, graph.modules)
    try {
      assert.deepEqual(model.userData.size, body.map(mm => mm * MM_TO_WORLD))
      const pins = type === 'GENERIC_RESISTOR' ? ['A', 'B'] : ['PLUS', 'MINUS']
      assert.ok(Math.abs(packagePinAnchor(type, pins[0]!, module)!.distanceTo(packagePinAnchor(type, pins[1]!, module)!) / MM_TO_WORLD - span) < 1e-8)
      assert.deepEqual(graph, original)
      assert.deepEqual(parseCircuitFile(JSON.stringify(graph)), original)
    } finally { disposeObject(model) }
  }
})

test('new free generic placement explicitly pins the compact descriptor and schema version', () => {
  setActivePinia(createPinia())
  const store = useCircuitStore(); store.importGraph({ schema_version: '1.0', circuit_id: 'newfree', modules: [], connections: [] })
  const id = store.placeModule('GENERIC_RESISTOR', { x: 20, y: 0, z: 20 })
  const module = store.graph!.modules.find(module => module.id === id)!
  assert.equal(store.graph!.schema_version, '1.2')
  assert.deepEqual(module.physicalDescriptor, { version: 1, partId: 'GENERIC-RESISTOR-AXIAL', partRevision: 2, packageId: 'GENERIC-AXIAL-R50-762', packageRevision: 1 })
  const model = buildComponent(module, store.graph!.modules)
  try { assert.deepEqual(model.userData.size, [5, 2, 2].map(mm => mm * MM_TO_WORLD)) }
  finally { disposeObject(model) }
})

test('explicit free capacitor design changes replace the pinned descriptor atomically', () => {
  setActivePinia(createPinia())
  const store = useCircuitStore(); store.importGraph({ schema_version: '1.0', circuit_id: 'free-capacitor', modules: [], connections: [] })
  const id = store.placeModule('GENERIC_CAPACITOR', { x: 20, y: 0, z: 20 })
  store.changeComponentDesign(id, 'GENERIC_CAPACITOR_ELECTROLYTIC', { capacitorType: 'ELECTROLYTIC' }, { A: 'PLUS', B: 'MINUS' })
  const module = store.graph!.modules.find(module => module.id === id)!
  assert.deepEqual(module.physicalDescriptor, { version: 1, partId: 'GENERIC-CAPACITOR-ELECTROLYTIC', partRevision: 2, packageId: 'GENERIC-RADIAL-D63-H11-254', packageRevision: 1 })
  assert.deepEqual(parseCircuitFile(JSON.stringify(store.graph)), store.graph)
})

test('historical manual pose and controls survive parse/save/reload with pinned body dimensions', () => {
  const original = structuredClone(historicalFixture)
  const graph = parseCircuitFile(JSON.stringify(original))
  assert.deepEqual(graph, original)
  assert.deepEqual(parseCircuitFile(JSON.stringify(graph)), original)
  const module = graph.modules[1]!, part = getPartForType(module.type, module.mount)!
  assert.equal(part.revision, 1)
  assert.equal(part.package.bodyMm.x, 6.5)
  const model = buildComponent(module, graph.modules)
  try {
    assert.equal(model.userData.definitionId, part.id)
    assert.deepEqual(model.userData.size, [6.5, 2.5, 2.5].map(mm => mm * MM_TO_WORLD))
    assert.equal(model.getObjectByName('flexible-rigid-body')!.scale.lengthSq(), 3)
  } finally { disposeObject(model) }
})
