import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { searchComponents } from '../src/data/componentSearch'
import { getPartForType } from '../src/data/partCatalog'
import { ribbonGroups } from '../src/data/ribbon'
import { useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useUiStore } from '../src/stores/ui'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'

test('code, explicit family alias and function search cover all requested logic codes', () => {
  const codes = '7400 7401 7402 7403 7404 7405 7408 7409 7410 7411 7412 7413 7414 7415 7420 7421 7427 7430 7432 7437 7438 7440 7486 74136 74266 CD4001 CD4011 CD4012 CD4013 CD4030 CD4069 CD4070 CD4071 CD4072 CD4077 CD4081 CD4093'.split(' ')
  for (const code of codes) assert.ok(searchComponents(code.toLowerCase()).some(item => getPartForType(item.type)?.logic?.code === code), `missing searchable code ${code}`)
  assert.deepEqual(searchComponents('SCHMITT').map(i => i.type), searchComponents('schmitt').map(i => i.type))
  assert.ok(searchComponents('flip-flop').some(i => getPartForType(i.type)?.logic?.code === 'CD4013'))
  assert.ok(searchComponents('NAND').length > 2)
  assert.ok(searchComponents('AND').every(i => !getPartForType(i.type)?.function.includes('nand')))
  assert.equal(searchComponents('absolutely-not-a-component').length, 0)
  assert.ok(ribbonGroups.find(g => g.id === 'logic')!.items.some(i => getPartForType(i.type)?.logic?.code === 'CD4013'))
})

test('palette Search, clear and Escape preserve selection/placement and expose empty state', async () => {
  const globals = ['document','window','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'] as const
  const saved = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { activeElement: null, querySelector() { return null } }) })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) } })
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} disconnect() {} } })
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (id: number) => clearTimeout(id) })
  const pinia = createPinia(); setActivePinia(pinia)
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  circuit.createDraft(); const id = circuit.placeModule('RESISTOR_AXIAL', { x: 0, y: 0, z: 0 }); workspace.selectModule(id)
  ui.activeRibbonGroup = 'logic'
  let view: ReturnType<typeof mountSfc> | undefined
  try {
    view = mountSfc(await loadSfc('components/workbench/ComponentRibbon.vue'), pinia)
    dispatch(view.find('input','aria-label','Search components'), 'onInput', 'AND'); await nextTick()
    assert.equal(workspace.selectedModuleId, id)
    assert.ok(view.all().filter(n => n.props['data-component-type']).length > 0)
    workspace.armPlacement('CAPACITOR_CERAMIC')
    dispatch(view.find('input','aria-label','Search components'), 'onInput', 'no-component-xyz'); await nextTick()
    assert.ok(view.text().includes('No components match')); assert.equal(workspace.placementType, 'CAPACITOR_CERAMIC')
    const onKey = view.find('input','aria-label','Search components').props.onKeydown as (e: unknown) => void
    onKey({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); await nextTick()
    assert.equal(view.find('input','aria-label','Search components').props.value, '')
    assert.equal(workspace.placementType, 'CAPACITOR_CERAMIC')
    dispatch(view.find('input','aria-label','Search components'), 'onInput', 'NAND'); await nextTick()
    dispatch(view.find('button','aria-label','Clear component search'), 'onClick'); await nextTick()
    assert.equal(view.find('input','aria-label','Search components').props.value, '')
    assert.equal(workspace.placementType, 'CAPACITOR_CERAMIC')
  } finally {
    view?.app.unmount()
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
  }
})

test('palette Search belongs only to Logic and Arithmetic and never searches outside its active menu', async () => {
  const globals = ['document','window','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'] as const
  const saved = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { activeElement: null, querySelector() { return null } }) })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) } })
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: class { observe() {} disconnect() {} } })
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (id: number) => clearTimeout(id) })
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore(), ui = useUiStore()
  let view: ReturnType<typeof mountSfc> | undefined
  try {
    view = mountSfc(await loadSfc('components/workbench/ComponentRibbon.vue'), pinia)
    for (const [groupId, hasSearch] of [
      ['structure', false], ['passive', false], ['active', false], ['output', false], ['input', false],
      ['logic', true], ['arithmetic', true], ['display', false], ['instruments', false], ['notation', false],
    ] as const) {
      ui.activeRibbonGroup = groupId; await nextTick()
      assert.equal(!!view.find('input', 'aria-label', 'Search components'), hasSearch, `${groupId} Search visibility`)
      assert.equal(view.all().some(n => n.props.class === 'palette-search'), hasSearch, `${groupId} leaves no search wrapper gap`)
    }
    workspace.armPlacement('CAPACITOR_CERAMIC')
    ui.activeRibbonGroup = 'logic'; await nextTick()
    dispatch(view.find('input', 'aria-label', 'Search components'), 'onInput', 'resistor'); await nextTick()
    assert.equal(view.all().filter(n => n.props['data-component-type']).length, 0, 'Logic cannot find Passive components')
    assert.equal(workspace.placementType, 'CAPACITOR_CERAMIC')

    ui.activeRibbonGroup = 'arithmetic'; await nextTick()
    assert.equal(view.find('input', 'aria-label', 'Search components').props.value, '', 'switching menu resets query')
    assert.deepEqual(view.all().filter(n => n.props['data-component-type']).map(n => n.props['data-component-type']), ['ADDER', 'MULTIPLIER'])
    dispatch(view.find('input', 'aria-label', 'Search components'), 'onInput', 'nand'); await nextTick()
    assert.equal(view.all().filter(n => n.props['data-component-type']).length, 0, 'Arithmetic cannot find Logic components')
    dispatch(view.find('input', 'aria-label', 'Search components'), 'onInput', 'MuLtIpLiEr'); await nextTick()
    assert.deepEqual(view.all().filter(n => n.props['data-component-type']).map(n => n.props['data-component-type']), ['MULTIPLIER'])

    ui.activeRibbonGroup = 'logic'; await nextTick()
    assert.equal(view.find('input', 'aria-label', 'Search components').props.value, '')
    dispatch(view.find('input', 'aria-label', 'Search components'), 'onInput', 'cd4013be'); await nextTick()
    const result = view.all().filter(n => n.props['data-component-type'])
    assert.equal(result.length, 1, 'case-insensitive explicit IC alias gives one Logic result')
    const type = result[0]!.props['data-component-type'] as string
    const transfer = new Map<string, string>()
    ;(result[0]!.props.onDragstart as (e: unknown) => void)({ dataTransfer: { setData: (key: string, value: string) => transfer.set(key, value), effectAllowed: '' }, preventDefault() {} })
    assert.equal(transfer.get('application/x-netcircuit-component'), type)
    assert.equal(workspace.placementType, type)
    ;(view.find('input', 'aria-label', 'Search components').props.onKeydown as (e: unknown) => void)({ key: 'Enter', preventDefault() {}, stopPropagation() {} })
    await nextTick()
    assert.equal(workspace.placementType, type, 'Enter places the selected in-menu result')
    assert.equal(ui.activeRibbonGroup, null)
  } finally {
    view?.app.unmount()
    for (const [key, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key)
  }
})
