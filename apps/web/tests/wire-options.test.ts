import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'

test('jumper options render ten accessible colors and route/edit controls once', async () => {
  let color = '', mode = ''
  const view = mountSfc(await loadSfc('components/workbench/WireOptions.vue'), createPinia(), { color: '#d8493f', routeMode: 'AUTO', onColor: (value: string) => { color = value }, onMode: (value: string) => { mode = value } })
  try {
    for (const color of ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Black', 'Gray', 'White', 'Brown']) assert.ok(view.find('button', 'aria-label', `${color} wire`))
    assert.ok(view.find('select', 'aria-label', 'Wire route mode'))
    assert.ok(view.find('button', 'aria-label', 'Add bend to selected segment'))
    assert.ok(view.find('button', 'aria-label', 'Remove selected bend'))
    dispatch(view.find('button', 'aria-label', 'Purple wire'), 'onClick')
    assert.equal(color, '#8656a8')
    dispatch(view.find('select', 'aria-label', 'Wire route mode'), 'onChange', 'FREE')
    assert.equal(mode, 'FREE')
    assert.equal(view.all().filter(node => node.tag === 'canvas').length, 0)
  } finally { view.app.unmount() }
})

test('palette keyboard forwards Escape and draft bend deletion while preserving native route-select keys', async () => {
  const keys: string[] = []
  const view = mountSfc(await loadSfc('components/workbench/WireOptions.vue'), createPinia(), { onRouteKey: (event: KeyboardEvent) => keys.push(event.key) })
  try {
    const panel = view.find('section', 'aria-label', 'Jumper wire options')
    const press = (key: string, tagName: string) => (panel.props.onKeydown as (event: unknown) => void)({ key, target: { tagName }, stopPropagation() {} })
    press('Escape', 'BUTTON'); press('Backspace', 'BUTTON'); press('Delete', 'BUTTON')
    press('ArrowDown', 'SELECT'); press('Backspace', 'SELECT'); press('Tab', 'BUTTON')
    assert.deepEqual(keys, ['Escape', 'Backspace', 'Delete'])
  } finally { view.app.unmount() }
})
