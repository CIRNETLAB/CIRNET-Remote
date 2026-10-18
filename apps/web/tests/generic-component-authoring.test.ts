import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { normalizeComponentProperties } from '../src/data/componentProperties'
import { getPartForType } from '../src/data/partCatalog'
import { validateProperties } from '../src/data/editorCatalog'
import { ribbonGroups } from '../src/data/ribbon'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'

test('generic enum/color design values are validated without coercing or removing unknown metadata', () => {
  const valid = { color: '#42b567', forwardVoltageVolts: 2.1, maxCurrentAmps: .015, custom: { note: 'keep' } }
  assert.deepEqual(normalizeComponentProperties('GENERIC_LED', valid), valid)
  for (const patch of [{ color: 'green' }, { color: '#ffffff\n' }, { maxCurrentAmps: 0 }, { forwardVoltageVolts: Infinity }, { maxCurrentAmps: '20 mA' }]) {
    assert.throws(() => normalizeComponentProperties('GENERIC_LED', { ...valid, ...patch }))
  }
  for (const [type, properties] of [['GENERIC_BUZZER', { buzzerType: 'ACTIVE' }], ['GENERIC_BJT', { transistorType: 'PNP' }]] as const) {
    assert.doesNotThrow(() => validateProperties(type, properties))
    assert.throws(() => validateProperties(type, { ...properties, [type === 'GENERIC_BJT' ? 'transistorType' : 'buzzerType']: 'unsupported' }))
  }
  assert.throws(() => normalizeComponentProperties('GENERIC_CAPACITOR', { capacitorType: 'ELECTROLYTIC' }))
  assert.deepEqual(normalizeComponentProperties('LED_LTL307EE', { color: 'legacy arbitrary metadata' }), { color: 'legacy arbitrary metadata' })
  assert.deepEqual(normalizeComponentProperties('GENERIC_IMPORTED_CUSTOM', { color: 'opaque custom field' }), { color: 'opaque custom field' })
})

test('normal palette exposes independent ceramic and electrolytic capacitors while keeping logic search entries', () => {
  assert.deepEqual(ribbonGroups.find(group => group.id === 'passive')!.items.map(item => [item.type, item.name]), [['GENERIC_RESISTOR', 'Resistor'], ['GENERIC_CAPACITOR', 'Ceramic Capacitor'], ['GENERIC_CAPACITOR_ELECTROLYTIC', 'Electrolytic Capacitor']])
  assert.deepEqual(ribbonGroups.find(group => group.id === 'active')!.items.map(item => item.name), ['Transistor', 'Diode', 'Zener Diode'])
  assert.deepEqual(ribbonGroups.find(group => group.id === 'output')!.items.map(item => item.name), ['LED', 'Buzzer'])
  assert.ok(ribbonGroups.find(group => group.id === 'logic')!.items.some(item => item.type === 'SN74HC08N'))
})

test('Component Info exposes validated draft properties before creating any instance or undo entry', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft(); circuit.past = []
  workspace.armPlacement('GENERIC_RESISTOR'); ui.openWindow('component-info', { activate: false })
  const view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), pinia)
  try {
    assert.ok(view.find('input', 'aria-label', 'Resistance'), 'draft form opens before placement')
    dispatch(view.find('input', 'aria-label', 'Resistance'), 'onInput', '4.7')
    dispatch(view.find('select', 'aria-label', 'Resistance unit'), 'onChange', 'kΩ')
    dispatch(view.find('button', 'aria-label', 'Update component properties'), 'onClick'); await nextTick()
    assert.equal(workspace.placementProperties?.resistanceOhms, 4700)
    assert.equal(circuit.graph!.modules.length, 0); assert.equal(circuit.past.length, 0)
    assert.equal(view.find('button', 'aria-label', 'Edit leads'), undefined)
    assert.equal(view.all().filter(node => node.tag === 'button' && node.text === 'Update').length, 1)
  } finally { view.app.unmount() }
})

test('capacitor value updates preserve the armed family, placement epoch and selected anchor', () => {
  setActivePinia(createPinia())
  const workspace = useWorkspaceStore()
  workspace.armPlacement('GENERIC_CAPACITOR')
  const epoch = workspace.placementEpoch
  workspace.pendingPort = 'board.a1'
  workspace.updatePlacementProperties({ capacitanceFarads: 47e-6 })
  assert.equal(workspace.placementEpoch, epoch)
  assert.equal(workspace.placementType, 'GENERIC_CAPACITOR')
  assert.equal(workspace.pendingPort, 'board.a1')
  assert.equal(workspace.selectedModuleId, null)
  const before = JSON.stringify(workspace.placementProperties)
  assert.throws(() => workspace.updatePlacementProperties({ capacitanceFarads: '' }))
  assert.equal(JSON.stringify(workspace.placementProperties), before)
  assert.throws(() => workspace.updatePlacementProperties({ capacitorType: 'ELECTROLYTIC' }, 'GENERIC_CAPACITOR_ELECTROLYTIC'), /Passive/)
  assert.equal(JSON.stringify(workspace.placementProperties), before)
  assert.throws(() => workspace.updatePlacementProperties({ color: '#ffffff' }, 'GENERIC_LED'), 'unrelated design changes require a new Add session')
  assert.equal(workspace.placementType, 'GENERIC_CAPACITOR')
  workspace.armPlacement('GENERIC_LED'); assert.equal(workspace.placementEpoch, epoch + 1)
})

test('untouched long-precision resistor Update preserves the exact SI number', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const value = 12345.678901234567
  let patch: Record<string, unknown> | undefined
  const view = mountSfc(await loadSfc('components/windows/ComponentPropertiesForm.vue'), pinia, {
    module: { id: 'R', type: 'RESISTOR_AXIAL', properties: { resistanceOhms: value, powerWatts: .25, tolerancePercent: 1 } },
    descriptor: getPartForType('RESISTOR_AXIAL'), onUpdate: (next: Record<string, unknown>) => { patch = next },
  })
  try {
    dispatch(view.find('button', 'aria-label', 'Update component properties'), 'onClick')
    assert.equal(patch?.resistanceOhms, value)
  } finally { view.app.unmount() }
})

test('all generic draft forms update SI values without converting capacitor families or creating an instance', async () => {
  const component = await loadSfc('components/windows/ComponentInfoWindow.vue')
  for (const scenario of [
    { type: 'GENERIC_CAPACITOR', input: 'Capacitance', value: '22', unitLabel: 'Capacitance unit', unit: 'µF', expected: { capacitanceFarads: 22e-6, capacitorType: 'CERAMIC' } },
    { type: 'GENERIC_CAPACITOR_ELECTROLYTIC', input: 'Capacitance', value: '47', unitLabel: 'Capacitance unit', unit: 'µF', expected: { capacitanceFarads: 47e-6, capacitorType: 'ELECTROLYTIC' } },
    { type: 'GENERIC_DIODE', input: 'Forward voltage', value: '.65', expected: { forwardVoltageVolts: .65 } },
    { type: 'GENERIC_ZENER_DIODE', input: 'Zener voltage', value: '6.2', expected: { zenerVoltageVolts: 6.2 } },
    { type: 'GENERIC_LED', input: 'Max current', value: '15', unitLabel: 'Max current unit', unit: 'mA', swatch: 'Blue LED', expected: { maxCurrentAmps: .015, color: '#3a78dc' } },
    { type: 'GENERIC_BUZZER', select: 'Type', option: 'ACTIVE', expected: { buzzerType: 'ACTIVE' } },
    { type: 'GENERIC_BJT', select: 'Type', option: 'PNP', expected: { transistorType: 'PNP' } },
  ]) {
    const pinia = createPinia(); setActivePinia(pinia)
    const workspace = useWorkspaceStore(), circuit = useCircuitStore(), ui = useUiStore()
    circuit.createDraft(); circuit.past = []; workspace.armPlacement(scenario.type, { custom: { retained: true } }); ui.openWindow('component-info', { activate: false })
    const epoch = workspace.placementEpoch, view = mountSfc(component, pinia)
    try {
      if (scenario.input) dispatch(view.find('input', 'aria-label', scenario.input), 'onInput', scenario.value)
      if (scenario.unitLabel) dispatch(view.find('select', 'aria-label', scenario.unitLabel), 'onChange', scenario.unit)
      if (scenario.select) dispatch(view.find('select', 'aria-label', scenario.select), 'onChange', scenario.option)
      if (scenario.swatch) dispatch(view.find('button', 'aria-label', scenario.swatch), 'onClick')
      if (scenario.type.startsWith('GENERIC_CAPACITOR')) assert.equal(view.find('select', 'aria-label', 'Type'), undefined)
      dispatch(view.find('button', 'aria-label', 'Update component properties'), 'onClick'); await nextTick()
      for (const [key, value] of Object.entries(scenario.expected)) assert.equal(workspace.placementProperties?.[key], value, `${scenario.type}.${key}`)
      assert.deepEqual(workspace.placementProperties?.custom, { retained: true })
      assert.equal(workspace.placementType, scenario.type); assert.equal(workspace.placementEpoch, epoch)
      assert.equal(circuit.graph!.modules.length, 0); assert.equal(circuit.past.length, 0)
      assert.equal(view.text().includes('Mounted on'), false); assert.equal(view.text().includes('INFORMATION'), false)
      assert.equal(view.find('button', 'aria-label', 'Edit leads'), undefined)
    } finally { view.app.unmount() }
  }
})

test('Inspector Add arms an editable draft without creating an origin module or history entry', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft(); circuit.past = []
  const view = mountSfc(await loadSfc('components/windows/InspectorWindow.vue'), pinia)
  try {
    const add = view.all().find(node => node.tag === 'button' && node.text === 'Add component')!
    dispatch(add, 'onClick'); await nextTick()
    assert.equal(workspace.placementType, 'GENERIC_RESISTOR')
    assert.equal(ui.windows.find(window => window.kind === 'component-info')?.open, true)
    assert.equal(circuit.graph!.modules.length, 0); assert.equal(circuit.past.length, 0)
  } finally { view.app.unmount() }
})
