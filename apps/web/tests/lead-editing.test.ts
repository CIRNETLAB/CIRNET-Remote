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

test('Edit Leads uses an explicit draft mode with Cancel, Reset, history and unchanged mounted connections', async () => {
  for (const type of ['RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC']) {
    const pinia = createPinia(); setActivePinia(pinia)
    const store = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
    store.createDraft(); store.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const id = store.placeModule(type, { x: 1, y: .309, z: .585 }); workspace.selectModule(id); ui.openWindow('component-info'); store.past = []
    const module = () => store.graph!.modules.find(m => m.id === id)!
    const mount = JSON.stringify(module().mount), nets = JSON.stringify(resolveElectricalNets(store.graph!))
    assert.ok(mount, 'fixture must be mounted')
    const view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), pinia)
    try {
      const edit = view.find('button', 'aria-label', 'Edit leads')
      assert.ok(edit, 'R/C Component Info exposes explicit Edit Leads')
      assert.equal(view.find('select', 'aria-label', 'Lead form'), undefined)
      dispatch(edit, 'onClick'); await nextTick()
      dispatch(view.find('select', 'aria-label', 'Lead form'), 'onChange', 'offset-s')
      dispatch(view.find('input', 'aria-label', 'Extra lead length'), 'onInput', '2')
      dispatch(view.find('input', 'aria-label', 'Body lift'), 'onInput', '3'); await nextTick()
      assert.equal(store.past.length, 0, 'preview is not graph history')
      assert.equal(module().properties!.leadForm, undefined)
      dispatch(view.find('button', 'aria-label', 'Cancel lead changes'), 'onClick'); await nextTick()
      assert.equal(view.find('select', 'aria-label', 'Lead form'), undefined)
      assert.equal(store.past.length, 0)
      dispatch(view.find('button', 'aria-label', 'Edit leads'), 'onClick'); await nextTick()
      dispatch(view.find('select', 'aria-label', 'Lead form'), 'onChange', 'offset-s')
      dispatch(view.find('input', 'aria-label', 'Extra lead length'), 'onInput', '2')
      dispatch(view.find('input', 'aria-label', 'Body lift'), 'onInput', '3')
      dispatch(view.find('button', 'aria-label', 'Update lead shape'), 'onClick'); await nextTick()
      assert.equal(module().properties!.leadForm, 'offset-s'); assert.equal(module().properties!.leadLengthMm, 2); assert.equal(module().properties!.bodyLiftMm, 3)
      assert.equal(store.past.length, 1)
      assert.equal(JSON.stringify(module().mount), mount); assert.equal(JSON.stringify(resolveElectricalNets(store.graph!)), nets)
      const reopened = parseCircuitFile(store.exportGraph()).modules.find(m => m.id === id)!
      assert.deepEqual(reopened.properties, module().properties)
      store.undo(); await nextTick(); assert.equal(module().properties!.leadForm, undefined)
      store.redo(); await nextTick(); assert.equal(module().properties!.leadForm, 'offset-s')
      dispatch(view.find('button', 'aria-label', 'Edit leads'), 'onClick'); await nextTick()
      dispatch(view.find('button', 'aria-label', 'Reset lead shape'), 'onClick'); await nextTick()
      assert.equal(view.find('select', 'aria-label', 'Lead form').props.value, 'formed90')
      assert.equal(store.past.length, 1, 'Reset changes only the draft until Update')
      dispatch(view.find('select', 'aria-label', 'Lead form'), 'onChange', 'straight'); await nextTick()
      assert.equal(view.find('input', 'aria-label', 'Extra lead length').props.disabled, true)
      dispatch(view.find('button', 'aria-label', 'Cancel lead changes'), 'onClick'); await nextTick()
      assert.equal(module().properties!.leadForm, 'offset-s')
      dispatch(view.find('button', 'aria-label', 'Edit leads'), 'onClick'); await nextTick()
      const section = view.find('section', 'aria-label', 'Lead appearance')
      assert.ok('data-workspace-text-input' in section.props, 'editing fields stay outside workspace shortcuts')
      ;(section.props.onKeydown as (event: unknown) => void)({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
      await nextTick()
      assert.equal(view.find('select', 'aria-label', 'Lead form'), undefined)
      assert.equal(ui.windows.find(w => w.kind === 'component-info')!.open, true, 'Escape cancels lead editing without closing Component Info')
      assert.equal(module().properties!.leadForm, 'offset-s')
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
