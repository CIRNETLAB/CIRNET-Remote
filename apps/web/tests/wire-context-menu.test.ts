import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'

test('selection context menu clamps to the viewport and exposes keyboard-accessible actions without canvas input', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const document = new EventTarget()
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  const actions: string[] = [], closes: boolean[] = []
  let view: ReturnType<typeof mountSfc> | undefined
  try {
    view = mountSfc(await loadSfc('components/workbench/WireContextMenu.vue'), createPinia(), { x: 995, y: 695, viewportWidth: 1000, viewportHeight: 700, canPaste: false, onAction: (action: string) => actions.push(action), onClose: () => closes.push(true) })
    const menu = view.find('div', 'role', 'menu')
    assert.ok(menu)
    const style = menu.props.style as Record<string, string>
    assert.ok(parseFloat(style.left!) <= 832 && parseFloat(style.top!) <= 580)
    const items = view.all().filter(n => n.props.role === 'menuitem')
    assert.deepEqual(items.map(n => n.props['aria-label']), ['Delete selection', 'Duplicate selection', 'Paste selection'])
    assert.equal(items[2]!.props.disabled, true)
    const key = async (key: string) => { (menu.props.onKeydown as (e: unknown) => void)({ key, preventDefault() {}, stopPropagation() {} }); await nextTick() }
    await key('End'); assert.equal(items[1]!.props.tabindex, 0, 'End skips the disabled Paste item')
    await key('ArrowDown'); assert.equal(items[0]!.props.tabindex, 0, 'arrows wrap across enabled actions')
    await key('ArrowUp'); assert.equal(items[1]!.props.tabindex, 0)
    await key('Home'); assert.equal(items[0]!.props.tabindex, 0)
    dispatch(items[1]!, 'onClick'); assert.deepEqual(actions, ['duplicate'])
    ;(menu.props.onKeydown as (e: unknown) => void)({ key: 'Escape', preventDefault() {}, stopPropagation() {} })
    assert.equal(closes.length, 1)
    document.dispatchEvent(new Event('pointerdown')); assert.equal(closes.length, 2, 'outside press closes the menu')
    view.app.unmount(); view = undefined
    document.dispatchEvent(new Event('pointerdown')); assert.equal(closes.length, 2, 'unmount removes its outside listener')
  } finally {
    view?.app.unmount()
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('a clipboard-only context menu keeps keyboard focus on Paste when selection actions are disabled', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() })
  let view: ReturnType<typeof mountSfc> | undefined
  try {
    const actions: string[] = []
    view = mountSfc(await loadSfc('components/workbench/WireContextMenu.vue'), createPinia(), {
      x: 40, y: 50, viewportWidth: 1000, viewportHeight: 700, canPaste: true, canEditSelection: false,
      onAction: (action: string) => actions.push(action),
    })
    await nextTick()
    const menu = view.find('div', 'role', 'menu')!
    const items = view.all().filter(node => node.props.role === 'menuitem')
    assert.deepEqual(items.map(item => item.props.disabled), [true, true, false])
    for (const key of ['Home', 'End', 'ArrowDown', 'ArrowUp']) {
      ;(menu.props.onKeydown as (event: unknown) => void)({ key, preventDefault() {}, stopPropagation() {} })
      await nextTick()
      assert.deepEqual(items.map(item => item.props.tabindex), [-1, -1, 0], `${key} must skip disabled selection actions`)
    }
    dispatch(items[2], 'onClick'); assert.deepEqual(actions, ['paste'])
  } finally {
    view?.app.unmount()
    if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document')
  }
})
