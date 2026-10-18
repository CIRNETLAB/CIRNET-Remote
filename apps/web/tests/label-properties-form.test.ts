import test from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { defaultLabelProperties } from '../src/data/labelProperties'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { dispatch, loadSfc, mountSfc, type HostNode } from './helpers/vueSfc'

// Invoke the compiled production v-model assignment at the minimal host boundary.
const enter = (node: HostNode, value: string | number) => {
  // A native text input updates the element value before Vue's v-model listener.
  Object.assign(node, { value })
  ;(node.props['onUpdate:modelValue'] as (value: string | number) => void)(value)
}
const escape = (node: HostNode) => (node.props.onKeydown as (event: unknown) => void)({ key: 'Escape', stopPropagation() {}, preventDefault() {} })

test('Escape in the armed Label input cancels placement and preview without history and returns focus to the canvas', async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let canvasFocus = 0
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => ({ focus() { canvasFocus++ } }) } })
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft(); circuit.past = []
  workspace.armPlacement('LABEL', { text: 'Discard this draft' }); ui.openWindow('component-info', { activate: false })
  const before = circuit.snapshot(), view = mountSfc(await loadSfc('components/windows/ComponentInfoWindow.vue'), pinia)
  Object.assign(view.find('textarea', 'aria-label', 'Label text'), { focus() {}, select() {} })
  try {
    await nextTick()
    escape(view.find('section', 'aria-label', 'Label properties')); await nextTick()
    assert.equal(workspace.placementType, null)
    assert.equal(workspace.placementProperties, null); assert.equal(workspace.previewType, null)
    assert.equal(ui.windows.find(window => window.kind === 'component-info')?.open, false)
    assert.equal(circuit.snapshot(), before); assert.equal(circuit.past.length, 0)
    assert.equal(canvasFocus, 1)
  } finally {
    view.app.unmount()
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('Escape while editing a placed Label resets its draft without emitting cancellation or a property update', async () => {
  const emitted: Record<string, unknown>[] = [], cancellations: true[] = []
  const view = mountSfc(await loadSfc('components/windows/LabelPropertiesForm.vue'), createPinia(), {
    properties: { ...defaultLabelProperties, text: 'Saved note', boardId: 'B' },
    onUpdate: (patch: Record<string, unknown>) => emitted.push(patch), onCancel: () => cancellations.push(true),
  })
  try {
    enter(view.find('textarea', 'aria-label', 'Label text'), 'Uncommitted change')
    escape(view.find('section', 'aria-label', 'Label properties'))
    assert.equal(emitted.length, 0); assert.equal(cancellations.length, 0)
    dispatch(view.find('button', 'aria-label', 'Update Label'), 'onClick')
    assert.equal(emitted[0]!.text, 'Saved note', 'the next Update reads the reset draft')
  } finally { view.app.unmount() }
})

test('Label form emits Unicode multiline text and preserves association, pose and custom formatting through Update', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore()
  const properties = { ...defaultLabelProperties, text: 'Old note', boardId: 'B', fontSizeMm: 4.5, textColor: '#123456', backgroundColor: '#fedcba' }
  circuit.importGraph({ schema_version: '1.2', circuit_id: 'label-form', modules: [
    { id: 'B', type: 'BREADBOARD', position: { x: 2, y: 0, z: 3 }, rotation: 37 },
    { id: 'L', type: 'LABEL', position: { x: 2.5, y: .35, z: 3.2 }, rotation: 127, properties },
  ], connections: [] })
  circuit.past = []
  const before = circuit.snapshot(), emitted: Record<string, unknown>[] = []
  const view = mountSfc(await loadSfc('components/windows/LabelPropertiesForm.vue'), pinia, {
    properties, contextKey: 'L', onUpdate: (patch: Record<string, unknown>) => { emitted.push(patch); circuit.updateModuleProperties('L', patch) },
  })
  try {
    const text = 'Điện trở < 1 kΩ\nNguồn 5 V\n😀 đèn xanh\nhttps://example.test/ chỉ là chữ'
    enter(view.find('textarea', 'aria-label', 'Label text'), text)
    await nextTick()
    dispatch(view.find('button', 'aria-label', 'Update Label'), 'onClick'); await nextTick()
    assert.deepEqual(emitted, [{ text, fontSizeMm: 4.5, textColor: '#123456', backgroundColor: '#fedcba' }])
    const label = circuit.graph!.modules.find(module => module.id === 'L')!
    assert.deepEqual(label.properties, { ...properties, text })
    assert.deepEqual(label.position, { x: 2.5, y: .35, z: 3.2 }); assert.equal(label.rotation, 127)
    assert.equal(circuit.past.length, 1)
    circuit.undo(); assert.equal(circuit.snapshot(), before)
  } finally { view.app.unmount() }
})

test('Label form enforces codepoint and line limits without emitting an invalid update', async () => {
  const emitted: Record<string, unknown>[] = []
  const view = mountSfc(await loadSfc('components/windows/LabelPropertiesForm.vue'), createPinia(), {
    properties: { ...defaultLabelProperties, boardId: 'B' }, onUpdate: (patch: Record<string, unknown>) => emitted.push(patch),
  })
  try {
    for (const text of ['😀'.repeat(257), '1\n2\n3\n4\n5']) {
      enter(view.find('textarea', 'aria-label', 'Label text'), text)
      dispatch(view.find('button', 'aria-label', 'Update Label'), 'onClick'); await nextTick()
      assert.equal(emitted.length, 0)
      assert.ok(view.find('p', 'role', 'alert'))
    }
    const text = '😀'.repeat(253) + '\n\n\n'
    enter(view.find('textarea', 'aria-label', 'Label text'), text)
    dispatch(view.find('button', 'aria-label', 'Update Label'), 'onClick'); await nextTick()
    assert.equal(emitted.length, 1); assert.equal(emitted[0]!.text, text)
    assert.equal(view.find('p', 'role', 'alert'), undefined)
    assert.equal('boardId' in emitted[0]!, false, 'an editable-fields patch cannot detach the existing association')
    assert.equal('version' in emitted[0]!, false); assert.equal('paddingMm' in emitted[0]!, false)
  } finally { view.app.unmount() }
})
