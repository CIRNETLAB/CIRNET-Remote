import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDraft, createEditorDocumentState, currentGraph, exportGraph, undoDocument, redoDocument } from '../src/domain/document/editorDocument'
import { captureSelection, moveModule, moveSelection, pasteSelection, placeModule, removeModule, rotateModule, updateModuleProperties } from '../src/domain/document/graphCommands'
import { moduleLocalToWorld, worldToModuleLocal } from '../src/electrical/modulePose'
import { parseCircuitFile } from '../src/domain/document/circuitFile'

function fixture() {
  const state = createEditorDocumentState(); createDraft(state, 'labels')
  const boardId = placeModule(state, 'BREADBOARD', { x: 2, y: .5, z: 3 }, 37)
  const board = currentGraph(state)!.modules.find(module => module.id === boardId)!
  const labelId = placeModule(state, 'LABEL', moduleLocalToWorld({ x: .5, y: .34, z: .2 }, board), 37,
    { text: 'Điện áp nguồn\n5 V', fontSizeMm: 4, textColor: '#123456', boardId })
  return { state, boardId, labelId }
}
const note = (value: ReturnType<typeof fixture>) => currentGraph(value.state)!.modules.find(module => module.id === value.labelId)!

test('Label placement and text editing are single history entries and preserve a portless persistent module', () => {
  const value = fixture(), { state } = value, before = state.past.length, module = note(value)
  assert.equal(module.mount, undefined); assert.equal(module.physicalDescriptor, undefined)
  assert.equal(module.properties!.version, 1)
  updateModuleProperties(state, value.labelId, { text: 'Dòng điện ≤ 10 mA' })
  assert.equal(state.past.length, before + 1); assert.equal(note(value).properties!.text, 'Dòng điện ≤ 10 mA')
  assert.equal(note(value).properties!.fontSizeMm, 4); assert.equal(note(value).properties!.textColor, '#123456')
  assert.equal(note(value).properties!.boardId, value.boardId)
  const exported = exportGraph(state), parsed = parseCircuitFile(exported)
  assert.deepEqual(parsed.modules.find(item => item.id === value.labelId), note(value)); assert.deepEqual(parsed.connections, [])
  undoDocument(state); assert.equal(note(value).properties!.text, 'Điện áp nguồn\n5 V')
  redoDocument(state); assert.equal(note(value).properties!.text, 'Dòng điện ≤ 10 mA')
})

test('board move and rotation commit their associated note in the same Undo step', () => {
  const value = fixture(), { state, boardId } = value, original = structuredClone(currentGraph(state)!), before = state.past.length
  const board = original.modules.find(module => module.id === boardId)!, position = note(value).position!, local = worldToModuleLocal({ x: position.x!, y: position.y!, z: position.z! }, board)
  moveModule(state, boardId, { x: -5, y: 1, z: 2 })
  assert.equal(state.past.length, before + 1)
  assert.deepEqual(note(value).position, moduleLocalToWorld(local, currentGraph(state)!.modules.find(module => module.id === boardId)!))
  rotateModule(state, boardId, 90); assert.equal(note(value).rotation, 127)
  undoDocument(state); undoDocument(state); assert.deepEqual(currentGraph(state), original)
})

test('board deletion keeps the detached note at its exact world pose and Undo restores association', () => {
  const value = fixture(), { state } = value, before = structuredClone(note(value)), history = state.past.length
  removeModule(state, value.boardId)
  assert.equal(state.past.length, history + 1); assert.deepEqual(note(value).position, before.position)
  assert.equal(note(value).rotation, before.rotation); assert.equal(note(value).properties!.boardId, undefined)
  undoDocument(state); assert.deepEqual(note(value), before)
})

test('board and note copy remaps association, moves once and leaves the original document objects intact', () => {
  const value = fixture(), { state } = value, before = structuredClone(note(value)), history = state.past.length
  const snapshot = captureSelection(state, { moduleIds: [value.boardId, value.labelId], wires: [] })!
  const copied = pasteSelection(state, snapshot, { delta: { x: 30, y: 0, z: 0 } })
  assert.equal(state.past.length, history + 1)
  const newNote = copied.graph.modules.find(module => module.type === 'LABEL' && module.id !== value.labelId)!
  const newBoard = copied.graph.modules.find(module => module.type === 'BREADBOARD' && module.id !== value.boardId)!
  assert.equal(newNote.properties!.boardId, newBoard.id)
  assert.deepEqual(newNote.position, { x: before.position!.x! + 30, y: before.position!.y, z: before.position!.z })
  assert.deepEqual(note(value), before)
  undoDocument(state); assert.equal(currentGraph(state)!.modules.length, 2)
})

test('selection move carries an unselected board-associated Label exactly once', () => {
  const value = fixture(), { state } = value, before = structuredClone(note(value)), history = state.past.length
  moveSelection(state, { moduleIds: [value.boardId], wires: [] }, { x: .5, y: 0, z: .3 })
  assert.equal(state.past.length, history + 1)
  assert.ok(Math.abs(note(value).position!.x! - before.position!.x! - .5) < 1e-12)
  assert.ok(Math.abs(note(value).position!.z! - before.position!.z! - .3) < 1e-12)
})
