import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'

test('jumper options render eight accessible colors and route/edit controls once', async () => {
  let color = '', mode = ''
  const view = mountSfc(await loadSfc('components/workbench/WireOptions.vue'), createPinia(), { color: '#d8493f', routeMode: 'AUTO', onColor: (value: string) => { color = value }, onMode: (value: string) => { mode = value } })
  try {
    for (const color of ['Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Black', 'White']) assert.ok(view.find('button', 'aria-label', `${color} wire`))
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
