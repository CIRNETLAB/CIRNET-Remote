import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { useUiStore } from '../src/stores/ui'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'

test('top-level Ribbon tabs have independent state and preserve editor intent, graph, selection and zoom',()=>{
  setActivePinia(createPinia())
  const ui=useUiStore(),circuit=useCircuitStore(),workspace=useWorkspaceStore()
  circuit.createDraft();workspace.armPlacement('RESISTOR_AXIAL');workspace.selectedModuleId='kept-selection'
  const graph=circuit.snapshot(),history=circuit.past.length,editor=JSON.stringify(workspace.$state)
  assert.equal(ui.activeRibbonTab,'component')
  ui.activeRibbonGroup='logic';ui.selectRibbonTab('run')
  assert.equal(ui.activeRibbonGroup,null);assert.equal(ui.activeRibbonTab,'run')
  assert.equal(circuit.snapshot(),graph);assert.equal(circuit.past.length,history);assert.equal(JSON.stringify(workspace.$state),editor)
  ui.selectRibbonTab('component');assert.equal(ui.activeRibbonGroup,null)
})

test('selecting a tab expands the one common Ribbon without toggling an already expanded tab',()=>{
  setActivePinia(createPinia());const ui=useUiStore()
  ui.toggleComponentToolbar();assert.equal(ui.componentToolbarCollapsed,true)
  ui.selectRibbonTab('run');assert.equal(ui.componentToolbarCollapsed,false)
  ui.selectRibbonTab('run');assert.equal(ui.componentToolbarCollapsed,false)
  assert.equal(ui.drawerInsets.top,96)
  ui.toggleRibbon('logic');assert.equal(ui.activeRibbonGroup,null,'hidden Component groups cannot open palettes')
})
