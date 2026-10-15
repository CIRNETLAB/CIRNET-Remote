import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick, provide } from 'vue'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { getPartForType } from '../src/data/partCatalog'
import { createPackageThumbnailCache, packageThumbnailCacheKey } from '../src/three/PackageThumbnails'
import { dispatch, loadSfc, mountSfc } from './helpers/vueSfc'

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await nextTick() }

test('Add carries the independent value and lead drafts while preview remains outside CircuitGraph', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft()
  const id = circuit.placeModule('RESISTOR_AXIAL', { x: 0, y: 0, z: 0 })
  workspace.selectModule(id); ui.openWindow('component-info'); circuit.past = []
  const before = circuit.exportGraph(), defaults = JSON.stringify(getPartForType('RESISTOR_AXIAL')!.editor.defaults)
  const previews: Record<string, unknown>[] = []
  const cache = createPackageThumbnailCache({ createRenderer: () => ({ render(model) {
    previews.push(JSON.parse(model.userData.signature)[1]); return 'data:image/png;base64,preview'
  }, dispose() {} }) })
  const info = await loadSfc('components/windows/ComponentInfoWindow.vue')
  const wrapper = defineComponent({ setup() { provide(packageThumbnailCacheKey, cache); return () => h(info) } })
  const view = mountSfc(wrapper, pinia)
  try {
    await flush()
    dispatch(view.find('button', 'aria-label', 'Edit leads'), 'onClick'); await nextTick()
    dispatch(view.find('input', 'aria-label', 'Resistance'), 'onInput', '1.5')
    dispatch(view.find('select', 'aria-label', 'Resistance unit'), 'onChange', 'kΩ')
    dispatch(view.find('select', 'aria-label', 'Lead form'), 'onChange', 'offset-s')
    dispatch(view.find('input', 'aria-label', 'Extra lead length'), 'onInput', '2')
    dispatch(view.find('input', 'aria-label', 'Body lift'), 'onInput', '3')
    await flush()
    for (let attempt = 0; !previews.some(properties => properties.bodyLiftMm === 3) && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 0))
    assert.ok(previews.some(properties => properties.bodyLiftMm === 3 && properties.leadForm === 'offset-s'), 'the thumbnail receives the lead draft')
    assert.equal(circuit.exportGraph(), before, 'the preview must not mutate graph truth')
    assert.equal(circuit.past.length, 0)
    const add = view.all().find(node => node.tag === 'button' && String(node.props['aria-label']).startsWith('Add '))!
    dispatch(add, 'onClick'); await nextTick()
    assert.equal(workspace.placementType, 'RESISTOR_AXIAL')
    assert.equal(workspace.placementProperties?.resistanceOhms, 1500)
    assert.equal(workspace.placementProperties?.leadForm, 'offset-s')
    assert.equal(workspace.placementProperties?.leadLengthMm, 2)
    assert.equal(workspace.placementProperties?.bodyLiftMm, 3)
    assert.equal(circuit.exportGraph(), before, 'Add arms placement without editing its source instance')
    assert.equal(JSON.stringify(getPartForType('RESISTOR_AXIAL')!.editor.defaults), defaults)
  } finally { view.app.unmount() }
})

test('invalid lead input cannot Update or Add, and changing selection or closing cancels the edit mode', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft()
  const resistor = circuit.placeModule('RESISTOR_AXIAL', { x: 0, y: 0, z: 0 })
  const capacitor = circuit.placeModule('CAPACITOR_CERAMIC', { x: 1, y: 0, z: 0 })
  workspace.selectModule(resistor); ui.openWindow('component-info'); circuit.past = []
  const before = circuit.exportGraph()
  const view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), pinia)
  try {
    dispatch(view.find('button', 'aria-label', 'Edit leads'), 'onClick'); await nextTick()
    dispatch(view.find('input', 'aria-label', 'Extra lead length'), 'onInput', '')
    dispatch(view.find('button', 'aria-label', 'Update lead shape'), 'onClick'); await nextTick()
    assert.ok(view.all().some(node => node.props.role === 'alert'))
    assert.ok(view.find('select', 'aria-label', 'Lead form'), 'invalid input leaves the draft available for correction')
    const add = view.all().find(node => node.tag === 'button' && String(node.props['aria-label']).startsWith('Add '))!
    dispatch(add, 'onClick'); await nextTick()
    assert.equal(workspace.placementType, null)
    assert.equal(workspace.selectedModuleId, resistor)
    assert.ok(workspace.editError.includes('Extra lead length'))
    assert.equal(circuit.exportGraph(), before)
    assert.equal(circuit.past.length, 0)
    workspace.selectModule(capacitor); await nextTick()
    assert.equal(view.find('select', 'aria-label', 'Lead form'), undefined)
    dispatch(view.find('button', 'aria-label', 'Edit leads'), 'onClick'); await nextTick()
    assert.equal(view.find('input', 'aria-label', 'Extra lead length').props.value, '0')
    ui.closeWindow('component-info'); await nextTick()
    ui.openWindow('component-info', { activate: false }); await nextTick()
    assert.equal(view.find('select', 'aria-label', 'Lead form'), undefined)
    assert.ok(view.find('button', 'aria-label', 'Edit leads'))
    assert.equal(circuit.exportGraph(), before)
    assert.equal(circuit.past.length, 0)
  } finally { view.app.unmount() }
})
