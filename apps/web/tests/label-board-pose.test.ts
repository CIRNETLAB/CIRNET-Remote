import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CircuitModule } from '../src/types/circuit'
import { moduleLocalToWorld } from '../src/electrical/modulePose'
import { remapLabelBoardReference, synchronizeLabelBoardPoses } from '../src/geometry/labelBoardPose'

const board: CircuitModule = { id: 'BB', type: 'BREADBOARD', position: { x: 2, y: .7, z: -1 }, rotation: 37 }
const local = { x: .6, y: .34, z: -.4 }
const label: CircuitModule = { id: 'NOTE', type: 'LABEL', position: moduleLocalToWorld(local, board), rotation: 52,
  properties: { version: 1, text: 'Điện áp\n5 V', fontSizeMm: 3, textColor: '#20252A', backgroundColor: '#FAFAF7', paddingMm: 1, boardId: 'BB' } }
const near = (actual: unknown, expected: unknown) => {
  const a = actual as Record<string, number>, b = expected as Record<string, number>
  for (const key of Object.keys(b)) assert.ok(Math.abs(a[key]! - b[key]!) < 1e-12, `${key}: ${a[key]} versus ${b[key]}`)
}

test('a visual Label follows board translation and yaw using its sole world pose without acquiring a mount', () => {
  const next = { ...board, position: { x: -3, y: 1.2, z: 4 }, rotation: 127 }
  const result = synchronizeLabelBoardPoses([board, label], [next, label])
  const moved = result.find(module => module.id === label.id)!
  near(moved.position, moduleLocalToWorld(local, next)); assert.equal(moved.rotation, 142)
  assert.equal(moved.mount, undefined); assert.deepEqual(moved.properties, label.properties)
  assert.deepEqual(label.position, moduleLocalToWorld(local, board), 'input graph stays immutable')
})

test('moving a selected board and its selected Label translates the association once', () => {
  const delta = { x: .5, y: 0, z: .3 }
  const next = { ...board, position: { x: board.position!.x! + delta.x, y: board.position!.y!, z: board.position!.z! + delta.z } }
  const alreadyMoved = { ...label, position: { x: label.position!.x! + delta.x, y: label.position!.y!, z: label.position!.z! + delta.z } }
  const result = synchronizeLabelBoardPoses([board, label], [next, alreadyMoved])
  near(result[1]!.position, alreadyMoved.position)
})

test('deleting a board detaches its Label while retaining exact world pose and text metadata', () => {
  const [detached] = synchronizeLabelBoardPoses([board, label], [label])
  assert.deepEqual(detached!.position, label.position); assert.equal(detached!.rotation, label.rotation)
  const { boardId: _boardId, ...properties } = label.properties!
  assert.deepEqual(detached!.properties, properties)
})

test('copying board plus Label remaps the visual association and copying only Label retains the existing board', () => {
  assert.equal(remapLabelBoardReference(label, new Map([['BB', 'BB_COPY']])).properties!.boardId, 'BB_COPY')
  assert.equal(remapLabelBoardReference(label, new Map([['NOTE', 'NOTE_COPY']])).properties!.boardId, 'BB')
  assert.equal(label.properties!.boardId, 'BB')
})

test('free labels, unrelated modules and newly placed labels keep their explicit poses', () => {
  const free = { ...label, id: 'FREE', properties: { text: 'Free note' } }
  const fresh = { ...label, id: 'NEW' }, next = { ...board, rotation: 90 }
  const result = synchronizeLabelBoardPoses([board, label, free], [next, label, free, fresh])
  assert.equal(result[0], next); assert.equal(result[2], free); assert.equal(result[3], fresh)
})

test('editing Label text and moving a Label independently never snaps its world pose back to a board-local shadow', () => {
  const edited = { ...label, position: { x: 10, y: .9, z: 12 }, rotation: 15, properties: { ...label.properties, text: 'Đã sửa' } }
  const result = synchronizeLabelBoardPoses([board, label], [board, edited])
  assert.equal(result[1], edited); assert.deepEqual(result[1]!.position, edited.position)
})
