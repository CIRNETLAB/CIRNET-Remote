import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, getActivePinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { Mesh, MeshStandardMaterial } from 'three'
import { configureExecutionPresentationAdapter, useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { createSceneManager } from '../src/three/SceneManager'
import { ribbonGroups } from '../src/data/ribbon'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'
import { resolveElectricalNets } from '../src/electrical/nets'
import { parseCircuitFile } from '../src/services/files/circuitFile'
import { getPartForType } from '../src/data/partCatalog'

beforeEach(() => setActivePinia(createPinia()))
test('canonical resistance changes update five bands through the store and retain body and unrelated instances', () => {
  const store = useCircuitStore(); store.createDraft()
  const id = store.placeModule('RESISTOR_AXIAL', { x: 0, y: 0, z: 0 }), other = store.placeModule('RESISTOR_AXIAL', { x: 2, y: 0, z: 0 })
  const manager = createSceneManager({ renderer: { setSize() {}, render() {}, dispose() {} }, requestFrame: () => 1, cancelFrame() {} })
  try {
    manager.syncGraph(store.graph)
    const model = manager.models.get(id)!, body = model.getObjectByName('package-body'), otherModel = manager.models.get(other)
    const initialOther = JSON.parse(JSON.stringify(store.graph!.modules[1].properties))
    for (const [value, expected] of [[1000, ['704725','1c1d20','1c1d20','704725','704725']], [4700, ['e9c83e','824986','1c1d20','704725','704725']]] as const) {
      store.updateModuleProperties(id, { resistanceOhms: value }); manager.syncGraph(store.graph)
      const changed = manager.models.get(id)!
      const bands = changed.children.filter(child => child.userData.resistorBand)
      assert.equal(bands.length, 5)
      assert.deepEqual(bands.map(mesh => ((mesh as Mesh).material as MeshStandardMaterial).color.getHexString()), expected)
      assert.ok(changed === model, 'property edits retain the component assembly'); assert.ok(changed.getObjectByName('package-body') === body, 'body identity stays stable')
      assert.ok(manager.models.get(other) === otherModel, 'unrelated model stays stable'); assert.deepEqual(store.graph!.modules[1].properties, initialOther)
    }
  } finally { manager.dispose() }
})

test('normal palette hides legacy-only families while legacy definitions still place and save', () => {
  for (const id of ['memory','logical-tools','embedded']) assert.equal(ribbonGroups.some(group => group.id === id), false, id)
  assert.ok(ribbonGroups.some(group => group.id === 'arithmetic'))
  const store = useCircuitStore(); store.createDraft()
  store.placeModule('MEMORY', { x: 0, y: 0, z: 0 }); store.placeModule('LED', { x: 2, y: 0, z: 0 })
  assert.equal(JSON.parse(store.exportGraph()).modules.length, 2)
})

test('Component Info updates resistor design properties in one transaction and empty fields never become zero', async () => {
  const store = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  store.createDraft(); const id = store.placeModule('RESISTOR_AXIAL', { x: 0, y: 0, z: 0 }); store.past = []
  workspace.selectModule(id); ui.openWindow('component-info')
  const view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), getActivePinia()!)
  try {
    const value = view.find('input', 'aria-label', 'Resistance')
    assert.ok(value, 'Component Info has a compact resistance form')
    dispatch(value, 'onInput', '1'); dispatch(view.find('select', 'aria-label', 'Resistance unit'), 'onChange', 'kΩ')
    dispatch(view.find('input', 'aria-label', 'Power rating'), 'onInput', '.5')
    dispatch(view.find('button', 'aria-label', 'Update component properties'), 'onClick')
    await nextTick()
    assert.equal(store.graph!.modules[0].properties!.resistanceOhms, 1000)
    assert.equal(store.graph!.modules[0].properties!.powerWatts, .5); assert.equal(store.past.length, 1)
    dispatch(view.find('input', 'aria-label', 'Resistance'), 'onInput', '')
    dispatch(view.find('button', 'aria-label', 'Update component properties'), 'onClick'); await nextTick()
    assert.equal(store.past.length, 1); assert.equal(store.graph!.modules[0].properties!.resistanceOhms, 1000)
    assert.ok(view.all().some(n => n.props.role === 'alert'))
    store.undo(); await nextTick(); assert.equal(store.graph!.modules[0].properties!.resistanceOhms, 330)
    store.redo(); assert.equal(JSON.parse(store.exportGraph()).modules[0].properties.resistanceOhms, 1000)
  } finally { view.app.unmount() }
})

test('capacitor units, voltage, Cancel and Update preserve mounted pin bonds and nets through history and save', async () => {
  for (const type of ['CAPACITOR_CERAMIC','CAPACITOR_ELECTROLYTIC']) {
    const pinia = createPinia(); setActivePinia(pinia)
    const store = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
    store.createDraft(); store.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 })
    const id = store.placeModule(type, { x: 1, y: .309, z: .585 }); store.past = []
    const beforeMount = JSON.stringify(store.graph!.modules[1].mount), beforeNets = JSON.stringify(resolveElectricalNets(store.graph!))
    assert.ok(beforeMount, 'fixture must be physically mounted')
    workspace.selectModule(id); ui.openWindow('component-info')
    const view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), pinia)
    try {
      dispatch(view.find('input','aria-label','Capacitance'), 'onInput', '47')
      dispatch(view.find('select','aria-label','Capacitance unit'), 'onChange', 'µF')
      dispatch(view.find('input','aria-label','Rated voltage'), 'onInput', '25')
      dispatch(view.find('button','aria-label','Cancel component property changes'), 'onClick'); await nextTick()
      assert.equal(store.past.length, 0)
      dispatch(view.find('input','aria-label','Capacitance'), 'onInput', '47')
      dispatch(view.find('select','aria-label','Capacitance unit'), 'onChange', 'µF')
      dispatch(view.find('input','aria-label','Rated voltage'), 'onInput', '25')
      dispatch(view.find('button','aria-label','Update component properties'), 'onClick'); await nextTick()
      assert.equal(store.graph!.modules[1].properties!.capacitanceFarads, 47e-6)
      assert.equal(store.graph!.modules[1].properties!.voltageRatingVolts, 25)
      // Electrolytic defaults may already be 47 µF / 25 V; unchanged commands stay out of history.
      assert.ok(store.past.length <= 1)
      assert.equal(JSON.stringify(store.graph!.modules[1].mount), beforeMount)
      assert.equal(JSON.stringify(resolveElectricalNets(store.graph!)), beforeNets)
      assert.deepEqual(parseCircuitFile(store.exportGraph()).modules[1].mount, store.graph!.modules[1].mount)
      if (store.canUndo) { store.undo(); store.redo(); assert.equal(store.graph!.modules[1].properties!.capacitanceFarads, 47e-6) }
    } finally { view.app.unmount() }
  }
})

test('Add carries validated form properties into one independent placement', async () => {
  const pinia = getActivePinia()!, store = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  store.createDraft(); const id = store.placeModule('RESISTOR_AXIAL', { x: 0, y: 0, z: 0 }); workspace.selectModule(id); ui.openWindow('component-info')
  const view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), pinia)
  try {
    dispatch(view.find('input','aria-label','Resistance'), 'onInput', '4.7')
    dispatch(view.find('select','aria-label','Resistance unit'), 'onChange', 'kΩ')
    const add = view.all().find(n => n.tag === 'button' && String(n.props['aria-label']).startsWith('Add '))!
    dispatch(add, 'onClick'); await nextTick()
    assert.equal(workspace.placementProperties!.resistanceOhms, 4700)
    assert.equal(store.graph!.modules[0].properties!.resistanceOhms, 330)
    const added = store.placeModule(workspace.placementType!, { x: 2, y: 0, z: 0 }, 0, workspace.placementProperties!)
    store.updateModuleProperties(added, { resistanceOhms: 1000 })
    assert.equal(store.graph!.modules[0].properties!.resistanceOhms, 330)
  } finally { view.app.unmount() }
})
test('Component Info Add also works for physical parts without an R/C property form', async () => {
  for (const type of ['LED_LTL307EE','SN74HC08N']) {
    const pinia = createPinia(); setActivePinia(pinia)
    const store = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
    store.createDraft(); const id = store.placeModule(type, { x: 0, y: 0, z: 0 }); workspace.selectModule(id); ui.openWindow('component-info')
    const view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), pinia)
    try {
      dispatch(view.all().find(n => n.tag === 'button' && String(n.props['aria-label']).startsWith('Add '))!, 'onClick')
      await nextTick(); assert.equal(workspace.placementType, type); assert.equal(workspace.editError, '')
    } finally { view.app.unmount() }
  }
})

test('authoring and result-driven display work with descriptors that have no execution profile', async () => {
  const store = useCircuitStore(); store.createDraft()
  const id = store.placeModule('LED_LTL307EE', { x: 0, y: 0, z: 0 })
  assert.equal(getPartForType('LED_LTL307EE')!.simulation, undefined)
  configureExecutionPresentationAdapter(async () => ({ device_states: { [id]: { state: 'ON' } }, pin_values: {}, diagnostics: [] }))
  try { await store.evaluatePhysical(); assert.equal(store.physicalStates?.[id]!.state, 'ON') }
  finally { configureExecutionPresentationAdapter() }
})
