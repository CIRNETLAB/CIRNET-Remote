import test from 'node:test'
import assert from 'node:assert/strict'
import { createContactInteraction } from '../src/editor/contactInteraction'
import { displaySegmentsFromPinEvidence } from '../src/three/package/DisplayPinEvidence'
import { getPartForType, physicalDescriptorForPart } from '../src/data/partCatalog'
import { resolveElectricalNets } from '../src/electrical/nets'
import type { CircuitGraph, CircuitModule } from '../src/types/circuit'

function controller(type: string, properties: Record<string, boolean> = {}) {
  const part = getPartForType(type)!, module: CircuitModule = { id: 'SW', type, physicalDescriptor: physicalDescriptorForPart(part), properties }
  const commits: Record<string, boolean>[] = [], state = { document: 'D1' }
  const interaction = createContactInteraction({ module: id => id === module.id ? module : undefined, documentId: () => state.document, commit: (_id, patch) => { commits.push(patch); module.properties = { ...module.properties, ...patch } } })
  return { interaction, module, commits, state }
}

test('slide and DIP latching controls commit once on release and cancellation never toggles', () => {
  for (const [type, property] of [['SLIDE_SWITCH_SS12D10', 'state'], ['DIP_SWITCH_A6D4100', 'position2']] as const) {
    const { interaction, commits, module } = controller(type, { [property]: false })
    assert.equal(interaction.begin(4, { id: 'SW', property }), true); assert.equal(commits.length, 0)
    assert.equal(interaction.end(5), false); assert.equal(commits.length, 0)
    interaction.end(4); assert.deepEqual(commits, [{ [property]: true }]); assert.equal(module.properties?.[property], true)
    assert.equal(interaction.end(4), false)
    interaction.begin(6, { id: 'SW', property }); interaction.cancel(); assert.equal(commits.length, 1)
    interaction.begin(7, { id: 'SW', property }); interaction.end(7, false); assert.equal(commits.length, 1)
  }
})

test('tactile input commits actual press and release once, including cancelled or lost capture', () => {
  for (const finish of ['end', 'cancel'] as const) {
    const { interaction, commits, module } = controller('PUSH_BUTTON_B3F1000', { pressed: false })
    interaction.begin(1, { id: 'SW', property: 'pressed' }); assert.equal(module.properties?.pressed, true)
    interaction[finish](1); assert.equal(module.properties?.pressed, false)
    interaction.cancel(); interaction.end(1); assert.deepEqual(commits, [{ pressed: true }, { pressed: false }])
  }
})

test('contact gestures reject unrelated controls and cannot alter a changed document or newer state', () => {
  const { interaction, commits, module, state } = controller('SLIDE_SWITCH_SS12D10', { state: false })
  assert.equal(interaction.begin(1, { id: 'missing', property: 'state' }), false)
  assert.equal(interaction.begin(1, { id: 'SW', property: 'pressed' }), false)
  assert.equal(interaction.begin(1, { id: 'SW', property: 'state' }), true)
  assert.equal(interaction.begin(2, { id: 'SW', property: 'state' }), false)
  module.properties = { state: true }
  interaction.end(1); assert.deepEqual(commits, [], 'a newer edit cannot be overwritten by an old gesture')
  interaction.begin(3, { id: 'SW', property: 'state' }); state.document = 'D2'
  interaction.end(3); assert.deepEqual(commits, [], 'a pending gesture belongs to its original document')
  assert.equal(interaction.active(), null)
  const tactile = controller('PUSH_BUTTON_B3F1000', { pressed: false })
  tactile.interaction.begin(1, { id: 'SW', property: 'pressed' }); tactile.state.document = 'another'
  tactile.interaction.cancel(); assert.deepEqual(tactile.commits, [{ pressed: true }], 'cleanup cannot release an unrelated replacement document')
})

test('a rejected tactile press relinquishes pointer ownership before another gesture', () => {
  const part = getPartForType('PUSH_BUTTON_B3F1000')!, module: CircuitModule = { id: 'SW', type: part.editorType, physicalDescriptor: physicalDescriptorForPart(part), properties: { pressed: false } }
  let reject = true
  const interaction = createContactInteraction({ module: () => module, documentId: () => 'D', commit: (_id, patch) => { if (reject) throw Error('rejected'); module.properties = { ...module.properties, ...patch } } })
  assert.throws(() => interaction.begin(1, { id: 'SW', property: 'pressed' }), /rejected/)
  assert.equal(interaction.active(), null)
  reject = false; assert.equal(interaction.begin(2, { id: 'SW', property: 'pressed' }), true)
  interaction.cancel(); assert.equal(module.properties?.pressed, false)
})

test('momentary cancellation releases its original draft after a document switch exactly once', () => {
  for (const finish of ['end', 'cancel'] as const) {
    const part = getPartForType('PUSH_BUTTON_B3F1000')!
    const oldModule: CircuitModule = { id: 'SW', type: part.editorType, physicalDescriptor: physicalDescriptorForPart(part), properties: { pressed: false } }
    const newModule = structuredClone(oldModule), drafts: Record<string, CircuitModule> = { old: oldModule, next: newModule }
    let documentId = 'old'
    const commits: string[] = [], releases: [string, string | null][] = []
    const interaction = createContactInteraction({
      module: id => drafts[documentId]?.id === id ? drafts[documentId] : undefined,
      documentId: () => documentId,
      commit: (id, patch) => { commits.push(documentId); drafts[documentId]!.properties = { ...drafts[documentId]!.properties, ...patch } },
      releaseMomentary: (id, draftId) => { releases.push([id, draftId]); if (draftId && drafts[draftId]?.id === id) drafts[draftId]!.properties = { ...drafts[draftId]!.properties, pressed: false } },
    })
    interaction.begin(1, { id: 'SW', property: 'pressed' }); assert.equal(oldModule.properties?.pressed, true)
    documentId = 'next'; interaction[finish](1)
    assert.equal(oldModule.properties?.pressed, false, 'the stored old draft cannot retain a held key')
    assert.equal(newModule.properties?.pressed, false, 'the replacement module with the same ID stays untouched')
    interaction.cancel(); interaction.end(1)
    assert.deepEqual(commits, ['old']); assert.deepEqual(releases, [['SW', 'old']]); assert.equal(interaction.active(), null)
  }
})

test('changed-document cancellation of a latching gesture never calls momentary cleanup', () => {
  const { module } = controller('SLIDE_SWITCH_SS12D10', { state: false })
  let documentId = 'old', releases = 0, commits = 0
  const interaction = createContactInteraction({ module: () => module, documentId: () => documentId, commit: () => { commits++ }, releaseMomentary: () => { releases++ } })
  interaction.begin(1, { id: 'SW', property: 'state' }); documentId = 'next'; interaction.cancel(); interaction.end(1)
  assert.equal(commits, 0); assert.equal(releases, 0); assert.equal(module.properties?.state, false)
})

test('SPDT and DIP visual controls retain their declared passive contact nets', () => {
  const same = (graph: CircuitGraph, a: string, b: string) => { const nets = resolveElectricalNets(graph); return nets.endpointNetIds[a] === nets.endpointNetIds[b] }
  for (const state of [false, true]) {
    const { module } = controller('SLIDE_SWITCH_SS12D10', { state })
    const graph: CircuitGraph = { schema_version: '1.2', circuit_id: 'contacts', modules: [module], connections: [] }
    assert.equal(same(graph, 'SW.2', 'SW.1'), state); assert.equal(same(graph, 'SW.2', 'SW.3'), !state); assert.equal(same(graph, 'SW.1', 'SW.3'), false)
  }
  for (let bit = 0; bit < 4; bit++) {
    const { module } = controller('DIP_SWITCH_A6D4100', { [`position${bit}`]: true })
    const graph: CircuitGraph = { schema_version: '1.2', circuit_id: 'contacts', modules: [module], connections: [] }
    for (let index = 0; index < 4; index++) assert.equal(same(graph, `SW.${index + 1}`, `SW.${8 - index}`), index === bit)
  }
})

test('single, double and multiplex display illumination requires real catalog electrode observations', () => {
  for (const [type, expectedPins, digits] of [['SEGMENT_SC5611EWA', 10, 1], ['SEGMENT_DC5611EWA', 18, 2], ['SEGMENT_CC5612EWA', 12, 4]] as const) {
    const part = getPartForType(type)!; assert.equal(part.package.pins.length, expectedPins)
    const levels: Record<string, 0 | 1 | 'X'> = Object.fromEntries(part.package.pins.map(pin => [`DS.${pin.id}`, 'X']))
    for (const pin of part.package.pins) if (/^CC1?$/.test(pin.name)) levels[`DS.${pin.id}`] = 0
    for (const pin of part.package.pins) if (/^a1?$/.test(pin.name)) levels[`DS.${pin.id}`] = 1
    assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'POWERED'), ['0.a'])
    assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'UNKNOWN'), [])
    assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'UNSUPPORTED'), [])
    if (digits > 1) assert.equal(displaySegmentsFromPinEvidence(part, 'DS', levels, 'POWERED').some(segment => segment.startsWith('1.')), false)
  }
})

test('display pin evidence preserves common polarity and withholds missing, conflicting and OFF observations', () => {
  const cathode = getPartForType('SEGMENT_SC5611EWA')!, anode = structuredClone(cathode)
  for (const pin of anode.package.pins) pin.name = pin.name.replace(/^CC/, 'CA')
  for (const [part, activeCommon, activeSegment] of [[cathode, 0, 1], [anode, 1, 0]] as const) {
    const commons = part.package.pins.filter(pin => /^(CC|CA)$/.test(pin.name)), a = part.package.pins.find(pin => pin.name === 'a')!, dp = part.package.pins.find(pin => pin.name === 'DP')!
    assert.equal(commons.length, 2)
    const levels: Record<string, 0 | 1 | 'X'> = Object.fromEntries(part.package.pins.map(pin => [`DS.${pin.id}`, 'X']))
    for (const pin of commons) levels[`DS.${pin.id}`] = activeCommon
    levels[`DS.${a.id}`] = activeSegment; levels[`DS.${dp.id}`] = activeSegment
    assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'SUPPORTED'), ['0.a', '0.DP'])
    assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'OFF'), [])
    assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, undefined), [])
    levels[`DS.${commons[0]!.id}`] = 'X'; assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'SUPPORTED'), [])
    levels[`DS.${commons[0]!.id}`] = activeSegment; assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'SUPPORTED'), [])
    delete levels[`DS.${commons[0]!.id}`]; assert.deepEqual(displaySegmentsFromPinEvidence(part, 'DS', levels, 'SUPPORTED'), [])
  }
})
