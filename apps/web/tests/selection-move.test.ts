import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { Vector3 } from 'three'
import { wireHarness } from './helpers/wireHarness'
import { buildMoveSelectionCandidate, MoveCandidateError } from '../src/editor/batchCommands'
import type { CircuitGraph, CircuitModule } from '../src/contracts/generated/dto'
import { moduleLocalToWorld, moduleWorldPose } from '../src/electrical/modulePose'
import { solveMounting } from '../src/electrical/mounting'

type Harness = ReturnType<typeof wireHarness>
const key = (name: string) => ({ key: name, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }) as KeyboardEvent

function rightClick(h: Harness, point: { x: number; y: number }) {
  const event = h.pointer(point.x, point.y, 1, 2)
  h.editor.pointerDown(event)
  h.editor.pointerUp(event)
}

function fixtureMountedBoard(): { graph: CircuitGraph; board: CircuitModule; ic: CircuitModule } {
  const b: CircuitModule = { id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 }, rotation: 0 }
  const target = moduleLocalToWorld({ x: -0.52, y: 0.309, z: 0 }, b)
  const solution = solveMounting('SN74HC08N', target, 0, [b])!
  assert.equal(solution.valid, true, solution.reason)
  const ic: CircuitModule = { id: 'IC1', type: 'SN74HC08N', mount: solution.mount }
  return {
    graph: {
      schema_version: '1.1',
      circuit_id: 'test-mounted-board',
      modules: [b, ic],
      connections: [],
    },
    board: b,
    ic,
  }
}

test('buildMoveSelectionCandidate moves free models and maintains relative distance and elevation', () => {
  const graph: CircuitGraph = {
    schema_version: '1.1',
    circuit_id: 'test-free-move',
    modules: [
      { id: 'OSC', type: 'OSCILLOSCOPE', position: { x: -2, y: 1.5, z: -3 }, rotation: 45 },
      { id: 'GEN', type: 'GENERATOR', position: { x: 2, y: 0.8, z: 1 }, rotation: 90 },
      { id: 'STATIC', type: 'CLOCK', position: { x: 0, y: 0, z: 0 } },
    ],
    connections: [],
  }

  const selection = { moduleIds: ['OSC', 'GEN'], wires: [] }
  const delta = { x: 1.5, y: 0, z: -0.5 }

  const candidate = buildMoveSelectionCandidate(graph, selection, delta)
  assert.ok(candidate.graph)
  assert.equal(candidate.graph.modules.length, 3)

  const movedOsc = candidate.graph.modules.find(m => m.id === 'OSC')!
  const movedGen = candidate.graph.modules.find(m => m.id === 'GEN')!
  const staticMod = candidate.graph.modules.find(m => m.id === 'STATIC')!

  assert.equal(movedOsc.position?.x, -0.5)
  assert.equal(movedOsc.position?.y, 1.5, 'elevation Y must be preserved')
  assert.equal(movedOsc.position?.z, -3.5)
  assert.equal(movedOsc.rotation, 45, 'rotation must be preserved')

  assert.equal(movedGen.position?.x, 3.5)
  assert.equal(movedGen.position?.y, 0.8, 'elevation Y must be preserved')
  assert.equal(movedGen.position?.z, 0.5)
  assert.equal(movedGen.rotation, 90, 'rotation must be preserved')

  assert.deepEqual(staticMod.position, { x: 0, y: 0, z: 0 }, 'unselected module does not move')
})

test('buildMoveSelectionCandidate moving Breadboard moves mounted IC via board-local mount without doubling delta', () => {
  const { graph, ic } = fixtureMountedBoard()
  const selection = { moduleIds: ['BB', 'IC1'], wires: [] }
  const delta = { x: 2, y: 0, z: 3 }

  const candidate = buildMoveSelectionCandidate(graph, selection, delta)
  const movedBB = candidate.graph.modules.find(m => m.id === 'BB')!
  const movedIC = candidate.graph.modules.find(m => m.id === 'IC1')!

  assert.equal(movedBB.position?.x, 2)
  assert.equal(movedBB.position?.z, 3)

  // IC1 mount binding should remain local to BB
  assert.ok(movedIC.mount)
  assert.equal(movedIC.mount.boardId, 'BB')
  assert.deepEqual(movedIC.mount.contacts, ic.mount!.contacts)
  assert.equal(movedIC.position, undefined, 'mounted IC has no absolute position')

  const initialPose = moduleWorldPose(ic, graph.modules)
  const finalPose = moduleWorldPose(movedIC, candidate.graph.modules)
  const initialPos = { x: initialPose.position?.x ?? 0, y: initialPose.position?.y ?? 0, z: initialPose.position?.z ?? 0 }
  const finalPos = { x: finalPose.position?.x ?? 0, y: finalPose.position?.y ?? 0, z: finalPose.position?.z ?? 0 }
  assert.equal(Math.round((finalPos.x - initialPos.x) * 100) / 100, 2)
  assert.equal(Math.round((finalPos.z - initialPos.z) * 100) / 100, 3)
})

test('buildMoveSelectionCandidate moving IC without moving Breadboard remounts to valid contacts', () => {
  const { graph } = fixtureMountedBoard()
  const initialIC = graph.modules[1]

  // Pitch on breadboard is 0.254 cm (0.1 in). Moving 2 columns = 0.508
  const selection = { moduleIds: ['IC1'], wires: [] }
  const delta = { x: 0.508, y: 0, z: 0 }

  const candidate = buildMoveSelectionCandidate(graph, selection, delta)
  const movedIC = candidate.graph.modules.find(m => m.id === 'IC1')!
  assert.ok(movedIC.mount)
  assert.equal(movedIC.mount.boardId, 'BB')

  const initialContact = initialIC.mount!.contacts[0].contactId
  const movedContact = movedIC.mount.contacts[0].contactId
  assert.notEqual(initialContact, movedContact, 'IC remounts to different contacts')
  assert.equal(movedIC.mount.contacts.length, 14, 'all 14 pins remount')
})

test('buildMoveSelectionCandidate moving IC off board throws MoveCandidateError with previewGraph', () => {
  const { graph } = fixtureMountedBoard()
  const selection = { moduleIds: ['IC1'], wires: [] }
  // Move 50 units away from breadboard
  const delta = { x: 50, y: 0, z: 50 }

  assert.throws(
    () => buildMoveSelectionCandidate(graph, selection, delta),
    (err: unknown) => {
      assert.ok(err instanceof MoveCandidateError)
      assert.ok(err.previewGraph)
      assert.equal(err.previewGraph.modules.length, 2)
      return true
    }
  )
})

test('right-clicking an already-selected module retains the whole group and opens context menu', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('OSCILLOSCOPE', { x: -4, y: 0, z: 0 })
    const b = h.circuit.placeModule('GENERATOR', { x: 4, y: 0, z: 0 })
    h.workspace.setTool('select')
    await nextTick(); h.flush()

    h.workspace.setSelection({ moduleIds: [a, b], wires: [] })
    await nextTick(); h.flush()

    // Right-click on module A
    const posA = h.manager.models.get(a)!.position
    const screenA = h.manager.project(posA)
    rightClick(h, screenA)

    // Selection must remain both A and B
    assert.deepEqual(h.workspace.selectedModuleIds, [a, b])
    assert.ok(h.editor.wireRouting.contextMenuState.value)
    assert.equal(h.workspace.selectionCount, 2)
  } finally {
    h.dispose()
  }
})

test('right-clicking an unselected module selects ONLY that module without preserving previous group', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('OSCILLOSCOPE', { x: -8, y: 0, z: 0 })
    const b = h.circuit.placeModule('GENERATOR', { x: 0, y: 0, z: 0 })
    const c = h.circuit.placeModule('CLOCK', { x: 8, y: 0, z: 0 })
    h.workspace.setTool('select')
    await nextTick(); h.flush()

    // Select A and B
    h.workspace.setSelection({ moduleIds: [a, b], wires: [] })
    await nextTick(); h.flush()

    // Right-click on unselected module C
    const posC = h.manager.models.get(c)!.position
    const screenC = h.manager.project(posC)
    rightClick(h, screenC)

    // Selection must now be ONLY C
    assert.deepEqual(h.workspace.selection.moduleIds, [c])
    assert.ok(h.editor.wireRouting.contextMenuState.value)
  } finally {
    h.dispose()
  }
})

test('Selection Move workflow: menuMove -> preview -> left-click commit updates all modules atomically in 1 undo step', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('CLOCK', { x: -3, y: 0, z: 0 })
    const b = h.circuit.placeModule('LED', { x: 3, y: 0, z: 0 })
    h.workspace.setTool('select')
    await nextTick(); h.flush()

    h.workspace.setSelection({ moduleIds: [a, b], wires: [] })
    await nextTick(); h.flush()
    h.circuit.past = []

    const initialPosA = { ...h.circuit.graph!.modules.find(m => m.id === a)!.position! }
    const initialPosB = { ...h.circuit.graph!.modules.find(m => m.id === b)!.position! }

    // Start move via menuMove
    const started = h.editor.wireRouting.menuMove()
    assert.equal(started, true)
    assert.equal(h.editor.wireRouting.movePreviewState.value.active, true)
    assert.equal(h.circuit.past.length, 0, 'preview does not mutate history')

    // Move pointer by +1 on X
    const screenMoved = h.manager.project(new Vector3(1, 0, 0))
    const moveEvent = h.pointer(screenMoved.x, screenMoved.y)
    h.editor.pointerMove(moveEvent)
    assert.equal(h.editor.wireRouting.movePreviewState.value.active, true)

    // Left-click to commit
    const clickEvent = h.pointer(screenMoved.x, screenMoved.y, 1, 0)
    h.editor.pointerDown(clickEvent)
    h.editor.pointerUp(clickEvent)
    await nextTick(); h.flush()

    assert.equal(h.editor.wireRouting.movePreviewState.value.active, false, 'preview closed after commit')
    assert.equal(h.circuit.past.length, 1, 'group move commits exactly ONE history entry')

    const movedA = h.circuit.graph!.modules.find(m => m.id === a)!
    const movedB = h.circuit.graph!.modules.find(m => m.id === b)!

    // Verify both modules shifted by the same delta
    const deltaAx = (movedA.position?.x ?? 0) - (initialPosA.x ?? 0)
    const deltaAz = (movedA.position?.z ?? 0) - (initialPosA.z ?? 0)
    const deltaBx = (movedB.position?.x ?? 0) - (initialPosB.x ?? 0)
    const deltaBz = (movedB.position?.z ?? 0) - (initialPosB.z ?? 0)
    assert.equal(deltaAx, deltaBx, 'relative distance preserved on X')
    assert.equal(deltaAz, deltaBz, 'relative distance preserved on Z')

    // Undo reverts BOTH modules atomically
    h.circuit.undo()
    assert.deepEqual(h.circuit.graph!.modules.find(m => m.id === a)!.position, initialPosA)
    assert.deepEqual(h.circuit.graph!.modules.find(m => m.id === b)!.position, initialPosB)

    // Redo restores BOTH modules atomically
    h.circuit.redo()
    assert.deepEqual(h.circuit.graph!.modules.find(m => m.id === a)!.position, movedA.position)
    assert.deepEqual(h.circuit.graph!.modules.find(m => m.id === b)!.position, movedB.position)
  } finally {
    h.dispose()
  }
})

test('Selection Move workflow: Esc cancels preview without modifying graph or history', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('CLOCK', { x: -3, y: 0, z: 0 })
    h.workspace.setTool('select')
    await nextTick(); h.flush()

    h.workspace.setSelection({ moduleIds: [a], wires: [] })
    await nextTick(); h.flush()
    h.circuit.past = []

    const initialPos = { ...h.circuit.graph!.modules.find(m => m.id === a)!.position! }

    h.editor.wireRouting.menuMove()
    assert.equal(h.editor.wireRouting.movePreviewState.value.active, true)

    // Press Escape
    h.editor.keydown(key('Escape'))
    assert.equal(h.editor.wireRouting.movePreviewState.value.active, false)
    assert.equal(h.circuit.past.length, 0)
    assert.deepEqual(h.circuit.graph!.modules.find(m => m.id === a)!.position, initialPos)
  } finally {
    h.dispose()
  }
})

test('Selection Move workflow: Right click cancels preview without modifying graph or opening menu', async () => {
  const h = wireHarness()
  try {
    const a = h.circuit.placeModule('CLOCK', { x: -3, y: 0, z: 0 })
    h.workspace.setTool('select')
    await nextTick(); h.flush()

    h.workspace.setSelection({ moduleIds: [a], wires: [] })
    await nextTick(); h.flush()
    h.circuit.past = []

    h.editor.wireRouting.menuMove()
    assert.equal(h.editor.wireRouting.movePreviewState.value.active, true)

    // Right-click while move preview active
    const rightClickEvent = h.pointer(100, 100, 1, 2)
    h.editor.pointerDown(rightClickEvent)
    assert.equal(h.editor.wireRouting.movePreviewState.value.active, false)
    assert.equal(h.editor.wireRouting.contextMenuState.value, null, 'right click in move preview cancels preview, does not open menu')
    assert.equal(h.circuit.past.length, 0)
  } finally {
    h.dispose()
  }
})
