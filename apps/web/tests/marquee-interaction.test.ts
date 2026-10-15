import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { wireHarness } from './helpers/wireHarness'

test('marquee captures a rectangle and selects committed components and wires without changing graph, history or camera', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('CLOCK', { x: -2, y: 0, z: 0 })
    const b = h.circuit.placeModule('LED', { x: 2, y: 0, z: 0 })
    h.circuit.connectEndpoints(`${a}.OUT`, `${b}.IN`)
    await nextTick(); h.flush(); h.circuit.past = []
    h.manager.setGhost('CLOCK', { x: 0, y: 0, z: -2 })
    const graph = h.circuit.exportGraph(), camera = h.manager.camera.position.clone(), zoom = h.workspace.zoom
    h.workspace.toggleMarquee(); await nextTick()
    h.editor.pointerDown(h.pointer(0, 0, 12))
    assert.equal(h.captured.has(12), true)
    h.editor.pointerMove(h.pointer(1000, 700, 12))
    assert.deepEqual(h.editor.marqueeRect.value, { left: 0, top: 0, width: 1000, height: 700 })
    h.editor.pointerUp(h.pointer(1000, 700, 12)); await nextTick()
    assert.equal(h.captured.has(12), false); assert.equal(h.editor.marqueeRect.value, null)
    assert.deepEqual(h.workspace.selectedModuleIds, [a, b])
    assert.deepEqual(h.workspace.selectedWires, [{ source: `${a}.OUT`, destination: `${b}.IN` }])
    assert.equal(h.workspace.selectedModuleId, null); assert.equal(h.workspace.selectedWire, null)
    assert.equal(h.workspace.marqueeActive, false)
    assert.equal(h.circuit.exportGraph(), graph); assert.equal(h.circuit.past.length, 0)
    assert.ok(h.manager.camera.position.equals(camera)); assert.equal(h.workspace.zoom, zoom)
    assert.ok(h.manager.scene.getObjectByName('wire-tools')?.children.some(child => child.name.startsWith('wire-multi-outline:')))
    h.editor.selectModule(a); await nextTick()
    assert.deepEqual(h.workspace.selectedModuleIds, []); assert.equal(h.workspace.selectedModuleId, a)
  } finally { h.dispose() }
})

test('Escape, pointer capture loss, mode changes and right click clean up marquee without graph edits or wire menus', async () => {
  const h = wireHarness()
  try {
    h.circuit.placeModule('CLOCK', { x: 0, y: 0, z: 0 }); await nextTick(); h.circuit.past = []
    const graph = h.circuit.exportGraph()
    const begin = async () => { h.workspace.toggleMarquee(); await nextTick(); h.editor.pointerDown(h.pointer(20, 20, 5)); h.editor.pointerMove(h.pointer(500, 500, 5)); assert.ok(h.editor.marqueeRect.value) }
    await begin()
    h.editor.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} } as KeyboardEvent)
    assert.equal(h.workspace.marqueeActive, false); assert.equal(h.editor.marqueeRect.value, null); assert.equal(h.captured.has(5), false)
    await begin(); h.editor.lostPointerCapture(h.pointer(100, 100, 5))
    assert.equal(h.editor.marqueeRect.value, null); assert.equal(h.workspace.marqueeActive, false)
    await begin(); h.workspace.setTool('move'); await nextTick()
    assert.equal(h.editor.marqueeRect.value, null); assert.equal(h.captured.has(5), false)
    await begin(); h.editor.pointerDown(h.pointer(200, 200, 8, 2))
    assert.equal(h.editor.marqueeRect.value, null); assert.equal(h.editor.wireRouting.contextMenuState.value, null)
    assert.equal(h.circuit.exportGraph(), graph); assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})
