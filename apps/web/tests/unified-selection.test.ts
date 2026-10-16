import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { Vector3 } from 'three'
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

test('marquee selects only components and wires when breadboard is partially intersected, leaving breadboard unselected', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 0 })
    const scope = h.circuit.placeModule('OSCILLOSCOPE', { x: 0, y: 0, z: -5 })
    h.circuit.connectEndpoints(`${board}.contact:terminal:A:01`, `${board}.contact:terminal:J:08`)
    await nextTick(); h.flush()
    h.circuit.past = []
    const graphBefore = h.circuit.exportGraph()

    // Select only a region covering the jumper wire on the breadboard
    const wireP1 = h.manager.project(h.manager.endpointPosition(`${board}.contact:terminal:A:01`)!)
    const wireP2 = h.manager.project(h.manager.endpointPosition(`${board}.contact:terminal:J:08`)!)
    const partialRect = {
      left: Math.min(wireP1.x, wireP2.x) - 10,
      right: Math.max(wireP1.x, wireP2.x) + 10,
      top: Math.min(wireP1.y, wireP2.y) - 10,
      bottom: Math.max(wireP1.y, wireP2.y) + 10,
    }
    const partialSelection = h.manager.selectInRect(partialRect)
    assert.equal(partialSelection.wires.length, 1, 'wire inside the partial rect must be selected')
    assert.ok(!partialSelection.moduleIds.includes(board), 'breadboard must NOT be selected when only partially enclosed or when selecting inner components')
    assert.ok(!partialSelection.moduleIds.includes(scope), 'scope outside rect must NOT be selected')

    // Selection does not mutate graph or history
    assert.equal(h.circuit.exportGraph(), graphBefore)
    assert.equal(h.circuit.past.length, 0)

    // Breadboard remains directly pickable
    const p = h.manager.project(h.manager.models.get(board)!.position)
    assert.equal(h.manager.pick(p.x, p.y)?.kind, 'module')
  } finally { h.dispose() }
})

test('marquee selects breadboard when fully enclosed, including inner wires and external instruments like oscilloscope', async () => {
  const h = wireHarness()
  try {
    const board = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 0 })
    const scope = h.circuit.placeModule('OSCILLOSCOPE', { x: 0, y: 0, z: -4 })
    h.circuit.connectEndpoints(`${board}.contact:terminal:A:01`, `${board}.contact:terminal:J:08`)
    await nextTick(); h.flush()

    // Full screen rect completely encloses the breadboard, wire and oscilloscope
    const fullSelection = h.manager.selectInRect({ left: 0, top: 0, right: 1000, bottom: 700 })
    assert.ok(fullSelection.moduleIds.includes(board), 'breadboard must be selected when marquee fully encloses it')
    assert.ok(fullSelection.moduleIds.includes(scope), 'oscilloscope inside marquee must be selected')
    assert.equal(fullSelection.wires.length, 1, 'wire inside marquee must be selected')
  } finally { h.dispose() }
})

test('marquee with multiple breadboards selects only the fully enclosed breadboard', async () => {
  const h = wireHarness()
  try {
    // Board 1 centered at (0, 0, 0), Board 2 placed at (10, 0, 0)
    const board1 = h.circuit.placeModule('BREADBOARD_630', { x: 0, y: 0, z: 0 })
    const board2 = h.circuit.placeModule('BREADBOARD_630', { x: 10, y: 0, z: 0 })
    await nextTick(); h.flush()

    // Calculate projected bounds of board 1
    const b1 = h.manager.models.get(board1)!
    const pts = (b1.userData.selectionProfile as [number, number][]).map(([x, z]) => h.manager.project(b1.localToWorld(new Vector3(x, 0, z))))
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x))
    const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y))
    const rect1 = { left: minX - 10, top: minY - 10, right: maxX + 10, bottom: maxY + 10 }
    const sel = h.manager.selectInRect(rect1)

    assert.ok(sel.moduleIds.includes(board1), 'fully enclosed board 1 must be selected')
    assert.ok(!sel.moduleIds.includes(board2), 'board 2 outside marquee must NOT be selected')
  } finally { h.dispose() }
})
