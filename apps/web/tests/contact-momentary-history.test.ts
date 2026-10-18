import test from 'node:test'
import assert from 'node:assert/strict'
import { createContactInteraction } from '../src/editor/contactInteraction'
import { getPartForType, physicalDescriptorForPart } from '../src/data/partCatalog'
import * as document from '../src/domain/document/editorDocument'
import { removeModule, updateModuleProperties } from '../src/domain/document/graphCommands'
import { createPinia, setActivePinia } from 'pinia'
import { useCircuitStore } from '../src/stores/circuit'
import type { CircuitGraph } from '../src/types/circuit'

function fixture(initial = false) {
  const state = document.createEditorDocumentState(), button = getPartForType('PUSH_BUTTON_B3F1000')!, resistor = getPartForType('GENERIC_RESISTOR')!
  const graph = (id: string): CircuitGraph => ({ schema_version: '1.2', circuit_id: id, modules: [
    { id: 'SW', type: button.editorType, position: { x: -2, y: 0, z: 0 }, physicalDescriptor: physicalDescriptorForPart(button), properties: { ...button.editor.defaults, pressed: initial } },
    { id: 'R', type: resistor.editorType, position: { x: 2, y: 0, z: 0 }, physicalDescriptor: physicalDescriptorForPart(resistor), properties: { ...resistor.editor.defaults, resistanceOhms: 330 } },
  ], connections: [] })
  document.importGraph(state, 'old', graph('old')); document.importGraph(state, 'next', graph('next')); document.openDraft(state, 'old'); state.past = []; state.future = []
  const interaction = createContactInteraction({
    module: id => document.currentGraph(state)?.modules.find(module => module.id === id), documentId: () => state.activeId,
    commit: (id, patch) => updateModuleProperties(state, id, patch),
    momentary: (id, pressed) => document.setMomentaryModule(state, id, pressed),
    releaseMomentary: (id, draftId) => document.releaseMomentaryModule(state, draftId, id),
  })
  const pressed = (draft = state.activeId) => state.drafts.find(item => item.id === draft)!.graph.modules.find(module => module.id === 'SW')!.properties?.pressed
  const resistance = () => document.currentGraph(state)!.modules.find(module => module.id === 'R')!.properties?.resistanceOhms
  return { state, interaction, pressed, resistance }
}

test('release then Undo cannot resurrect a completed momentary press', () => {
  const h = fixture(); updateModuleProperties(h.state, 'R', { resistanceOhms: 1000 }); const history = h.state.past.length
  h.interaction.begin(1, { id: 'SW', property: 'pressed' }); assert.equal(h.pressed(), true)
  h.interaction.end(1); assert.equal(h.pressed(), false); assert.equal(h.interaction.active(), null)
  document.undoDocument(h.state); assert.equal(h.pressed(), false); assert.equal(h.resistance(), 330)
  document.redoDocument(h.state); assert.equal(h.pressed(), false); assert.equal(h.resistance(), 1000)
  assert.equal(h.state.past.length, history)
})

test('cross-draft cancellation then Undo cannot restore a stale held input in either draft', () => {
  const h = fixture(); h.interaction.begin(1, { id: 'SW', property: 'pressed' }); document.openDraft(h.state, 'next'); h.interaction.cancel()
  assert.equal(h.pressed('old'), false); assert.equal(h.pressed('next'), false)
  document.undoDocument(h.state); assert.equal(h.pressed('old'), false); assert.equal(h.state.activeId, 'old')
  document.redoDocument(h.state); assert.equal(h.state.activeId, 'next'); assert.equal(h.pressed('old'), false); assert.equal(h.pressed('next'), false)
})

test('an intervening authored edit survives release and its Undo/Redo snapshots exclude the held press', () => {
  const h = fixture(); h.interaction.begin(1, { id: 'SW', property: 'pressed' }); updateModuleProperties(h.state, 'R', { resistanceOhms: 2200 })
  assert.equal(h.pressed(), true); h.interaction.cancel(); assert.equal(h.pressed(), false); assert.equal(h.resistance(), 2200)
  document.undoDocument(h.state); assert.equal(h.pressed(), false); assert.equal(h.resistance(), 330)
  document.redoDocument(h.state); assert.equal(h.pressed(), false); assert.equal(h.resistance(), 2200)
})

test('ordinary imported persistent pressed values remain intact outside captured input', () => {
  const h = fixture(true); updateModuleProperties(h.state, 'R', { resistanceOhms: 1000 })
  document.undoDocument(h.state); assert.equal(h.pressed(), true)
  document.redoDocument(h.state); assert.equal(h.pressed(), true)
  assert.equal(JSON.parse(document.exportGraph(h.state)).modules.find((module: { id: string }) => module.id === 'SW').properties.pressed, true)
})

test('repeated captured transitions are idempotent and deletion Undo restores an unpressed module', () => {
  const h = fixture(); h.interaction.begin(1, { id: 'SW', property: 'pressed' }); document.setMomentaryModule(h.state, 'SW', true)
  removeModule(h.state, 'SW'); h.interaction.cancel(); h.interaction.cancel()
  document.undoDocument(h.state); assert.equal(h.pressed(), false)
  document.redoDocument(h.state); assert.equal(document.currentGraph(h.state)!.modules.some(module => module.id === 'SW'), false)
})

test('a captured release in one draft preserves the other draft same-ID persistent input', () => {
  const h = fixture(), other = h.state.drafts.find(draft => draft.id === 'next')!.graph.modules.find(module => module.id === 'SW')!
  other.properties = { ...other.properties, pressed: true }
  h.interaction.begin(1, { id: 'SW', property: 'pressed' }); document.openDraft(h.state, 'next'); h.interaction.cancel()
  assert.equal(h.pressed('old'), false); assert.equal(h.pressed('next'), true)
  document.undoDocument(h.state); assert.equal(h.pressed('old'), false); assert.equal(h.pressed('next'), true)
})

test('the validated input action rejects non-momentary components without history or mutations', () => {
  const h = fixture(), before = document.snapshotDocument(h.state)
  assert.throws(() => document.setMomentaryModule(h.state, 'R', true), /supported momentary/)
  assert.throws(() => Reflect.apply(document.setMomentaryModule, undefined, [h.state, 'SW', 'true']), /boolean/)
  assert.equal(document.snapshotDocument(h.state), before); assert.equal(h.state.past.length, 0)
  document.releaseMomentaryModule(h.state, 'old', 'SW'); assert.equal(h.pressed(), false)
})

test('Pinia captured input invalidates graph revisions while retaining Redo and restoring a clean document', () => {
  const h = fixture(); setActivePinia(createPinia()); const store = useCircuitStore()
  try {
    store.importGraph(document.currentGraph(h.state)!); store.past = []; store.future = []; store.markSaved()
    const revision = store.graphRevision
    store.setMomentaryModule('SW', true); assert.equal(store.graph!.modules.find(module => module.id === 'SW')!.properties?.pressed, true)
    assert.ok(store.graphRevision > revision); assert.equal(store.past.length, 0); assert.equal(store.dirty, true)
    store.setMomentaryModule('SW', false); assert.equal(store.graph!.modules.find(module => module.id === 'SW')!.properties?.pressed, false)
    assert.equal(store.past.length, 0); assert.equal(store.dirty, false)
    store.updateModuleProperties('R', { resistanceOhms: 1000 }); store.undo(); assert.equal(store.future.length, 1)
    store.setMomentaryModule('SW', true); store.setMomentaryModule('SW', false); assert.equal(store.future.length, 1)
    store.redo(); assert.equal(store.graph!.modules.find(module => module.id === 'R')!.properties?.resistanceOhms, 1000)
    assert.equal(store.graph!.modules.find(module => module.id === 'SW')!.properties?.pressed, false)
  } finally { store.$dispose() }
})
