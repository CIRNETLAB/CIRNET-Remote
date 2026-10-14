import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { dispatch, loadSfc, mountSfc } from './helpers/vueSfc'

test('status bar +/- reaches 1000 and 50 percent, displays the full value and keeps circuit history untouched', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore(), circuit = useCircuitStore()
  circuit.createDraft(); circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); circuit.past = []
  const graph = circuit.snapshot(), view = mountSfc(await loadSfc('components/workbench/SimulationStatusBar.vue'), pinia)
  try {
    for (let i = 0; i < 90; i++) dispatch(view.find('button', 'aria-label', 'Zoom In'), 'onClick')
    await nextTick()
    assert.equal(workspace.zoom, 1000)
    assert.equal(view.find('button', 'aria-label', 'Zoom In').props.disabled, true)
    assert.equal(view.find('output', 'aria-label', 'Workspace magnification').text, '1000%')
    for (let i = 0; i < 95; i++) dispatch(view.find('button', 'aria-label', 'Zoom Out'), 'onClick')
    await nextTick()
    assert.equal(workspace.zoom, 50)
    assert.equal(view.find('button', 'aria-label', 'Zoom Out').props.disabled, true)
    dispatch(view.find('button', 'aria-label', 'Zoom To View Entire Circuit'), 'onClick')
    assert.equal(workspace.zoom, 100); assert.equal(workspace.fitRequest, 1)
    assert.equal(circuit.snapshot(), graph); assert.equal(circuit.past.length, 0)
  } finally { view.app.unmount() }
})
