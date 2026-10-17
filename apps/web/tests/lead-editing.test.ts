import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'
import { resolveElectricalNets } from '../src/electrical/nets'
import { parseCircuitFile } from '../src/services/files/circuitFile'

test('compact Component Info hides lead editing while imported lead appearance and mounted connections survive property Update', async () => {
  const component = await loadSfc('components/windows/ComponentInfoWindow.vue')
  for (const type of ['RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC']) {
    const pinia = createPinia(); setActivePinia(pinia)
    const store = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
    store.createDraft(); store.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const id = store.placeModule(type, { x: 1, y: .309, z: .585 })
    store.updateModuleProperties(id, { leadForm: 'offset-s', leadLengthMm: 2, bodyLiftMm: 3 })
    const module = () => store.graph!.modules.find(m => m.id === id)!
    const mount = JSON.stringify(module().mount), nets = JSON.stringify(resolveElectricalNets(store.graph!))
    assert.ok(mount, 'fixture must be mounted')
    workspace.selectModule(id); ui.openWindow('component-info'); store.past = []
    const view = mountSfc(component, pinia)
    try {
      assert.equal(view.find('button', 'aria-label', 'Edit leads'), undefined)
      assert.equal(view.find('select', 'aria-label', 'Lead form'), undefined)
      assert.equal(view.find('input', 'aria-label', 'Body lift'), undefined)
      dispatch(view.find('input', 'aria-label', type === 'RESISTOR_AXIAL' ? 'Resistance' : 'Capacitance'), 'onInput', type === 'RESISTOR_AXIAL' ? '470' : '22')
      dispatch(view.find('button', 'aria-label', 'Update component properties'), 'onClick'); await nextTick()
      assert.equal(store.past.length, 1)
      assert.equal(module().properties!.leadForm, 'offset-s'); assert.equal(module().properties!.leadLengthMm, 2); assert.equal(module().properties!.bodyLiftMm, 3)
      assert.equal(JSON.stringify(module().mount), mount); assert.equal(JSON.stringify(resolveElectricalNets(store.graph!)), nets)
      assert.deepEqual(parseCircuitFile(store.exportGraph()).modules.find(m => m.id === id)!.properties, module().properties)
      store.undo(); store.redo()
      assert.equal(module().properties!.leadForm, 'offset-s'); assert.equal(module().properties!.leadLengthMm, 2); assert.equal(module().properties!.bodyLiftMm, 3)
      assert.equal(module().type, type, 'editing retains the legacy descriptor identity')
    } finally { view.app.unmount() }
  }
})

test('invalid lead properties reject atomically at store and file boundaries', () => {
  setActivePinia(createPinia()); const store = useCircuitStore(); store.createDraft()
  const id = store.placeModule('RESISTOR_AXIAL', { x: 0, y: 0, z: 0 }); store.past = []
  const saved = store.exportGraph()
  for (const patch of [{ bodyLiftMm: -1 }, { leadLengthMm: 5 }, { leadForm: 'random' }, { leadForm: 'straight', leadLengthMm: 1 }]) {
    assert.throws(() => store.updateModuleProperties(id, patch))
    assert.equal(store.exportGraph(), saved); assert.equal(store.past.length, 0)
    const graph = JSON.parse(saved); Object.assign(graph.modules[0].properties, patch)
    assert.throws(() => parseCircuitFile(JSON.stringify(graph)))
  }
  store.updateModuleProperties(id, { leadForm: 'offset-s', leadLengthMm: 2 })
  assert.throws(() => store.updateModuleProperties(id, { leadForm: 'straight' }), 'merged properties must be validated too')
})
