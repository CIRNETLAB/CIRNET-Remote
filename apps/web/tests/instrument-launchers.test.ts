import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { createPinia } from 'pinia'
import { useUiStore } from '../src/stores/ui'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { useInstrumentStore } from '../src/stores/instrument'
import { windowDefinitions } from '../src/types/windows'
import { GENERATOR_LAYOUT, GENERATOR_CH1, GENERATOR_CH2, GENERATOR_SYNC } from '../src/three/FunctionGeneratorArtwork'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'

test('sidebar replaces only Delete button with two unique instrument launchers, preserving editing state', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const listeners = new Set<unknown>()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false, addEventListener: (_: string, f: unknown) => listeners.add(f), removeEventListener: (_: string, f: unknown) => listeners.delete(f) }) } })
  const pinia = createPinia(), workspace = useWorkspaceStore(pinia), ui = useUiStore(pinia), circuit = useCircuitStore(pinia)
  circuit.createDraft()
  const view = mountSfc(await loadSfc('components/workbench/ToolRail.vue'), pinia)
  try {
    assert.ok(!view.find('button', 'aria-label', 'Delete'), 'Delete button must be absent from the sidebar')
    const supply = view.find('button', 'aria-label', 'Power Supply'), generator = view.find('button', 'aria-label', 'Function Generator')
    assert.ok(supply); assert.ok(generator)
    assert.equal(supply.props['aria-pressed'], undefined); assert.equal(generator.props['aria-pressed'], undefined)
    const iconPath = (button: typeof supply) => button.children.find(node => node.tag === 'svg')!.children.find(node => node.tag === 'path')!.props.d
    assert.notEqual(iconPath(supply), iconPath(generator))
    for (const tool of ['select', 'wire', 'move', 'rotate'] as const) {
      workspace.tool = tool; workspace.selectedModuleId = 'selected'; workspace.pendingPort = 'selected.OUT'; workspace.zoomAreaActive = true
      const before = JSON.stringify(workspace.$state), graph = circuit.snapshot()
      dispatch(supply, 'onClick'); dispatch(generator, 'onClick'); await nextTick()
      assert.equal(JSON.stringify(workspace.$state), before); assert.equal(circuit.snapshot(), graph)
    }
    assert.equal(ui.windows.length, 2); assert.equal(ui.windows.find(w => w.kind === 'generator')!.activation, 4)
    assert.ok(ui.windows.some(w => String(w.kind) === 'power-supply' && w.open))
  } finally {
    view.app.unmount(); assert.equal(listeners.size, 0)
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('supply controls update canonical properties once, following selection, Undo/Redo and deletion', async () => {
  const pinia = createPinia(), circuit = useCircuitStore(pinia), workspace = useWorkspaceStore(pinia), instrument = useInstrumentStore(pinia)
  circuit.createDraft()
  const first = circuit.placeModule('POWER_SUPPLY', { x: 0, y: 0, z: 0 }), second = circuit.placeModule('POWER_SUPPLY', { x: 4, y: 0, z: 0 })
  const view = mountSfc(await loadSfc('components/windows/PowerSupplyWindow.vue'), pinia)
  const initialInstrument = JSON.stringify(instrument.$state)
  try {
    assert.match(view.text(), /NO SUPPLY SELECTED/)
    workspace.selectModule(first); await nextTick(); circuit.past = []
    assert.doesNotMatch(view.text(), /NO SUPPLY SELECTED/)
    dispatch(view.find('input', 'aria-label', 'Voltage knob'), 'onChange', '5.5'); await nextTick()
    assert.equal(circuit.graph!.modules[0].properties!.voltage_v, 5.5); assert.equal(circuit.past.length, 1)
    circuit.undo(); await nextTick(); assert.equal(view.find('input', 'aria-label', 'Voltage setpoint').props.value, 0)
    circuit.redo(); await nextTick(); assert.equal(view.find('input', 'aria-label', 'Voltage setpoint').props.value, 5.5)
    workspace.selectModule(second); await nextTick()
    dispatch(view.find('input', 'aria-label', 'Current limit'), 'onChange', '2'); dispatch(view.find('button', 'aria-label', 'Power switch'), 'onClick'); await nextTick()
    assert.equal(circuit.graph!.modules[1].properties!.current_limit_a, 2); assert.equal(circuit.graph!.modules[1].properties!.power_on, true)
    assert.equal(circuit.graph!.modules[0].properties!.current_limit_a, 0)
    assert.match(view.text(), /LOCAL SETPOINTS/); assert.match(view.text(), /NO TELEMETRY/)
    const wattRow = view.all().filter(node => node.props.class === 'supply-reading').at(-1)!
    assert.equal(wattRow.children.find(node => node.tag === 'b')!.text, '—', 'power is never computed from voltage/current setpoints')
    assert.equal(JSON.stringify(instrument.$state), initialInstrument, 'supply state must stay in Circuit Graph')
    circuit.removeModule(second); await nextTick(); assert.match(view.text(), /NO SUPPLY SELECTED/)
  } finally { view.app.unmount() }
})

test('invalid supply input cannot commit a graph edit; non-supply selection never binds implicitly', async () => {
  const pinia = createPinia(), circuit = useCircuitStore(pinia), workspace = useWorkspaceStore(pinia)
  circuit.createDraft(); const id = circuit.placeModule('POWER_SUPPLY', { x: 0, y: 0, z: 0 })
  workspace.selectModule(id)
  const view = mountSfc(await loadSfc('components/windows/PowerSupplyWindow.vue'), pinia)
  try {
    const before = circuit.snapshot(), history = circuit.past.length
    dispatch(view.find('input', 'aria-label', 'Voltage setpoint'), 'onChange', '16'); await nextTick()
    assert.equal(circuit.snapshot(), before); assert.equal(circuit.past.length, history); assert.ok(view.find('p', 'role', 'alert'))
    workspace.selectModule(null); await nextTick(); assert.match(view.text(), /NO SUPPLY SELECTED/)
    const led = circuit.placeModule('LED', { x: 3, y: 0, z: 0 }); workspace.selectModule(led); await nextTick()
    assert.match(view.text(), /NO SUPPLY SELECTED/)
  } finally { view.app.unmount() }
})

test('generator renders two independent configuration previews and shared controls without applying output', async () => {
  const pinia = createPinia(), instrument = useInstrumentStore(pinia), circuit = useCircuitStore(pinia)
  circuit.createDraft()
  const view = mountSfc(await loadSfc('components/windows/GeneratorWindow.vue'), pinia)
  try {
    for (const label of ['CONFIGURATION PREVIEW', 'OUTPUT UNAVAILABLE', 'CH1', 'CH2', 'FUNCTION', 'Frequency', 'Amplitude', 'Offset', 'Duty', 'Phase', ...GENERATOR_LAYOUT.buttons.map(b => b.label), ...GENERATOR_LAYOUT.outputs.map(o => o.label)]) assert.ok(view.text().includes(label), label)
    assert.ok(view.find('button', 'aria-label', 'Generator encoder'))
    for (const control of [view.find('fieldset', 'aria-label', 'Generator function controls'), view.find('fieldset', 'aria-label', 'Generator screen keys'), view.find('button', 'aria-label', 'Generator power unavailable')]) {
      assert.ok(control.props.disabled === true || control.props.disabled === '', 'HTML disabled attributes must be present')
    }
    assert.equal(view.all().filter(node => node.tag === 'canvas').length, 0)
    const root = view.all().find(node => node.props.class === 'generator-instrument')!
    const style = root.props.style as Record<string, string>
    assert.equal(style['--generator-ch1'], GENERATOR_CH1); assert.equal(style['--generator-ch2'], GENERATOR_CH2); assert.equal(style['--generator-sync'], GENERATOR_SYNC)
    const before = JSON.stringify(instrument.$state), graph = circuit.snapshot()
    dispatch(view.find('button', 'aria-label', 'Select CH2 configuration'), 'onClick'); await nextTick()
    assert.equal(view.find('button', 'aria-label', 'Select CH2 configuration').props['aria-pressed'], true)
    assert.equal(JSON.stringify(instrument.$state), before); assert.equal(circuit.snapshot(), graph)
    const ch2 = Reflect.get(instrument.generator, 'channel2')
    assert.ok(ch2 && ch2 !== instrument.generator)
    instrument.generator.frequency = 2500; await nextTick()
    assert.notEqual(ch2.frequency, instrument.generator.frequency)
    assert.ok(view.text().includes('2,500'))
    assert.equal(instrument.generator.waveform, 'Sine', 'legacy CH1 contract remains readable')
  } finally { view.app.unmount() }
})

test('power supply and larger generator defaults use the existing window lifecycle and safe areas', () => {
  const supply = Reflect.get(windowDefinitions, 'power-supply')
  assert.ok(supply); assert.equal(supply.title, 'Power Supply')
  assert.ok(windowDefinitions.generator.width >= 680)
  const pinia = createPinia(), ui = useUiStore(pinia)
  ui.setWorkbenchSize(1200, 800); ui.setViewport(1200, 800)
  ui.openWindow('generator')
  ui.setWorkbenchSize(320, 480); ui.setViewport(320, 350)
  const window = ui.windows[0]
  assert.ok(window.x >= 54 && window.y >= 96 && window.x + window.width <= 320 && window.y + window.height <= 350)
  ui.setWorkbenchSize(1200, 800); ui.setViewport(1200, 800)
  assert.equal(window.width, windowDefinitions.generator.width)
})
