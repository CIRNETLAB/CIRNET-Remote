import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { wireHarness } from './helpers/wireHarness'

test('Ctrl and Meta toggle mixed module and wire selection without graph or history edits', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('CLOCK', { x: -2, y: 0, z: 0 })
    const b = h.circuit.placeModule('LED', { x: 2, y: 0, z: 0 })
    h.circuit.connectEndpoints(`${a}.OUT`, `${b}.IN`)
    h.workspace.setTool('select'); await nextTick(); h.flush(); h.circuit.past = []
    const graph = h.circuit.exportGraph()
    const click = async (id: string, modifier: 'ctrlKey' | 'metaKey' | null) => {
      const p = h.manager.project(h.manager.models.get(id)!.position)
      const event = Object.assign(h.pointer(p.x, p.y), modifier ? { [modifier]: true } : {})
      h.editor.pointerDown(event); h.editor.pointerUp(event); await nextTick()
    }
    await click(a, null)
    await click(b, 'ctrlKey')
    assert.deepEqual(h.workspace.selection.moduleIds, [a, b])
    assert.equal(h.workspace.selectedModuleId, null)
    // Mixed toggle is also the public selection path used by wire picking.
    h.workspace.toggleWire(`${a}.OUT`, `${b}.IN`)
    assert.deepEqual(h.workspace.selection.wires, [{ source: `${a}.OUT`, destination: `${b}.IN` }])
    await click(a, 'metaKey')
    assert.deepEqual(h.workspace.selection.moduleIds, [b])
    h.workspace.toggleWire(`${a}.OUT`, `${b}.IN`)
    assert.equal(h.workspace.selectedModuleId, b)
    await click(b, null)
    assert.deepEqual(h.workspace.selection, { moduleIds: [b], wires: [] })
    h.editor.pointerDown(h.pointer(10, 10)); h.editor.pointerUp(h.pointer(10, 10)); await nextTick()
    assert.deepEqual(h.workspace.selection, { moduleIds: [], wires: [] })
    assert.equal(h.circuit.exportGraph(), graph); assert.equal(h.circuit.past.length, 0)
  } finally { h.dispose() }
})

test('marquee includes instruments and wires but leaves the breadboard background unselected and directly pickable', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 0 })
    const scope = h.circuit.placeModule('OSCILLOSCOPE', { x: 0, y: 0, z: -5 })
    h.circuit.connectEndpoints(`${board}.contact:terminal:A:01`, `${board}.contact:terminal:J:08`)
    await nextTick(); h.flush()
    const selection = h.manager.selectInRect({ left: 0, top: 0, right: 1000, bottom: 700 })
    assert.ok(selection.moduleIds.includes(scope)); assert.ok(!selection.moduleIds.includes(board))
    assert.equal(selection.wires.length, 1)
    const p = h.manager.project(h.manager.models.get(board)!.position)
    assert.equal(h.manager.pick(p.x, p.y)?.kind, 'module')
  } finally { h.dispose() }
})
