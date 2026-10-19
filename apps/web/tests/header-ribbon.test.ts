import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'
import { useCircuitStore } from '../src/stores/circuit'
import { useUiStore } from '../src/stores/ui'
import { executeFileCommand } from '../src/components/workbench/fileCommands'

beforeEach(() => setActivePinia(createPinia()))

test('header tabs use manual keyboard activation and preserve the document and history', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  const pinia=createPinia();setActivePinia(pinia)
  const circuit=useCircuitStore(),ui=useUiStore();circuit.createDraft()
  const graph=circuit.snapshot(),history=circuit.past.length
  let focuses=0
  const view=mountSfc(await loadSfc('components/workbench/AppTitleBar.vue'),pinia)
  try {
    const component=view.find('button','id','workbench-tab-component'),run=view.find('button','id','workbench-tab-run')
    assert.equal(component.props.role,'tab');assert.equal(component.props['aria-controls'],'workbench-panel-component')
    assert.equal(run.props.role,'tab');assert.equal(run.props['aria-controls'],'workbench-panel-run')
    assert.equal(component.props['aria-selected'],true);assert.equal(run.props['aria-selected'],false)
    const key=component.props.onKeydown as (event:unknown)=>void
    key({key:'ArrowRight',preventDefault(){},stopPropagation(){},currentTarget:{parentElement:{querySelector:()=>({focus(){focuses++}})}}})
    await nextTick();assert.equal(focuses,1);assert.equal(ui.activeRibbonTab,'component');assert.equal(run.props.tabindex,0)
    ui.componentToolbarCollapsed=true
    dispatch(run,'onClick');await nextTick()
    assert.equal(ui.activeRibbonTab,'run');assert.equal(ui.componentToolbarCollapsed,false)
    assert.equal(component.props['aria-selected'],false);assert.equal(run.props['aria-selected'],true)
    assert.equal(circuit.snapshot(),graph);assert.equal(circuit.past.length,history)
    assert.equal(view.find('button','id','workbench-file-trigger').props['aria-haspopup'],'menu')
    assert.equal(view.all().some(node=>node.props.class==='file-error'),false)
  } finally {view.app.unmount();if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')}
})

test('File command executor never dispatches disabled or unknown commands',()=>{
  const calls:string[]=[]
  const items=[{id:'save' as const,label:'Save',disabled:true},{id:'open' as const,label:'Open Project',disabled:false}]
  assert.equal(executeFileCommand(items,'save',id=>calls.push(id)),false)
  assert.equal(executeFileCommand(items,'export',id=>calls.push(id)),false)
  assert.equal(executeFileCommand(items,'open',id=>calls.push(id)),true)
  assert.deepEqual(calls,['open'])
})
