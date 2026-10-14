import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, Vector3 } from 'three'
import type { CircuitModule, Point3, WireVisual } from '../src/types/circuit'
import { getBreadboardContact } from '../src/electrical/BreadboardTopology'
import { moduleLocalToWorld } from '../src/electrical/modulePose'
import { defaultWireVisual } from '../src/wires/wireVisual'
import { solveWireRoute, snapWirePoint, type WireRouteContext } from '../src/wires/wireRouting'
import { materializeWireRoute, moveWireBend, insertWireBend, removeWireBend, dragWireSegment } from '../src/wires/wireRouteEditing'

function fixture(mode: WireVisual['routeMode'] = 'ORTHOGONAL') {
  const board: CircuitModule = { id: 'BB', type: 'BREADBOARD', position: { x: 0, y: 0, z: 0 }, rotation: 0 }
  const wire = { source: 'BB.contact:terminal:A:01', destination: 'BB.contact:terminal:J:03' }
  const context: WireRouteContext = {
    modulePose: id => id === 'BB' ? board : null,
    endpoint: endpoint => {
      const c = getBreadboardContact(board.type, endpoint.split('.contact:')[1])
      return c ? { endpoint, contactModuleId: board.id, position: moduleLocalToWorld({ x: c.localPosition[0], y: c.localPosition[1], z: c.localPosition[2] }, board) } : null
    },
  }
  const visual: WireVisual = { ...defaultWireVisual(), routeMode: mode, controlPoints: [
    { space: 'module', moduleId: 'BB', position: { x: -3.51, y: .36, z: -.715 } },
    { space: 'module', moduleId: 'BB', position: { x: -3.51, y: .36, z: .455 } },
  ] }
  return { board, wire, context, visual }
}
const close = (a: Point3, b: Point3) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-8)

test('multi-bend orthogonal jumper has low straight runs and locked socket pin leads', () => {
  const { wire, visual, context } = fixture()
  const route = solveWireRoute(wire, visual, context)!
  close(route.points[0], { x: -4.03, y: .309, z: -.715 })
  close(route.points.at(-1)!, { x: -3.77, y: .309, z: .715 })
  assert.ok(route.points.slice(1, -1).every(p => Math.abs(p.y - .36) < 1e-8))
  assert.ok(route.segments.filter(s => s.editable).every(s => s.start.x === s.end.x || s.start.z === s.end.z))
  for (const point of visual.controlPoints) assert.ok(route.points.some(p => Math.hypot(p.x - point.position.x, p.z - point.position.z) < 1e-8))
  assert.equal(route.segments[0].editable, false)
  assert.equal(route.segments.at(-1)!.editable, false)
  assert.deepEqual(solveWireRoute(wire, visual, context), route)
})

test('same-board routes transform rigidly through arbitrary move and yaw without modifying stored knots', () => {
  const { board, wire, visual, context } = fixture()
  const original = solveWireRoute(wire, visual, context)!, saved = JSON.stringify(visual)
  for (const rotation of [37, 90, 180]) {
    board.position = { x: 5, y: .4, z: -2 }; board.rotation = rotation
    const transformed = solveWireRoute(wire, visual, context)!
    const matrix = new Matrix4().makeRotationY(rotation * Math.PI / 180).setPosition(5, .4, -2)
    assert.equal(transformed.points.length, original.points.length)
    original.points.forEach((point, i) => { const p = new Vector3(point.x, point.y, point.z).applyMatrix4(matrix); close(transformed.points[i], p) })
  }
  assert.equal(JSON.stringify(visual), saved)
})

test('visual bend and segment operations preserve endpoint leads and immutable input', () => {
  const { wire, visual, context } = fixture('FREE'), saved = JSON.stringify(visual)
  const route = solveWireRoute(wire, visual, context)!
  let edited = materializeWireRoute(visual, route)
  edited = moveWireBend(edited, 0, { space: 'module', moduleId: 'BB', position: { x: -3, y: .36, z: -.455 } })
  assert.equal(edited.controlPoints[0].position.x, -3)
  const next = solveWireRoute(wire, edited, context)!
  edited = insertWireBend(edited, next, next.segments.find(s => s.editable)!.index, { space: 'module', moduleId: 'BB', position: { x: -3.7, y: .36, z: -.6 } })
  assert.equal(edited.controlPoints.length, 3)
  edited = removeWireBend(edited, 0); assert.equal(edited.controlPoints.length, 2)
  const current = solveWireRoute(wire, edited, context)!
  edited = dragWireSegment(edited, current, current.segments.find(s => s.editable)!.index, { x: 0, y: 0, z: .26 }, context)
  const dragged = solveWireRoute(wire, edited, context)!
  close(dragged.points[0], route.points[0]); close(dragged.points.at(-1)!, route.points.at(-1)!)
  assert.equal(JSON.stringify(visual), saved)
})

test('orthogonal segment drag stays perpendicular and snap uses board frame with Alt bypass', () => {
  const { board, wire, visual, context } = fixture()
  const route = solveWireRoute(wire, visual, context)!
  const segment = route.segments.find(s => s.editable && s.start.x === s.end.x)!
  const moved = dragWireSegment(materializeWireRoute(visual, route), route, segment.index, { x: .26, y: 0, z: .4 }, context)
  const after = solveWireRoute(wire, moved, context)!
  assert.ok(after.points.some(p => Math.abs(p.x + 3.25) < 1e-8))
  board.rotation = 90; board.position = { x: 2, y: 0, z: 3 }
  const point = moduleLocalToWorld({ x: -3.49, y: .36, z: -.7 }, board)
  const snapped = snapWirePoint(point, board, true, false)
  close(snapped.position, { x: -3.51, y: .36, z: -.715 })
  close(snapWirePoint(point, board, true, true).position, { x: -3.49, y: .36, z: -.7 })
  close(snapWirePoint({ x: .09, y: .4, z: .04 }, null, true, false).position, { x: .065, y: .4, z: .065 })
})

test('materialized routing retains its frame when point order reverses across differently rotated supports', () => {
  const modules: CircuitModule[] = [{ id: 'P', type: 'BREADBOARD', rotation: 37 }, { id: 'Q', type: 'BREADBOARD', rotation: 90, position: { x: 3, y: 0, z: 2 } }]
  const positions: Record<string, Point3> = { 'L.IN': { x: -4, y: .5, z: 2 }, 'S.OUT': { x: 5, y: .5, z: -2 } }
  const context: WireRouteContext = { modulePose: id => modules.find(m => m.id === id) ?? null, endpoint: e => positions[e] ? { endpoint: e, position: positions[e] } : null }
  const visual: WireVisual = { ...defaultWireVisual(), routeMode: 'ORTHOGONAL', controlPoints: [{ space: 'module', moduleId: 'P', position: { x: 0, y: .36, z: 1 } }, { space: 'module', moduleId: 'Q', position: { x: 1, y: .36, z: 0 } }] }
  const route = solveWireRoute({ source: 'L.IN', destination: 'S.OUT' }, visual, context)!
  const saved = materializeWireRoute(visual, route); saved.controlPoints.reverse()
  const reversed = solveWireRoute({ source: 'S.OUT', destination: 'L.IN' }, saved, context)!
  assert.equal(reversed.points.length, route.points.length)
  const expected = [...route.points].reverse()
  expected.forEach((point, i) => close(reversed.points[i], point))
})

test('generated orthogonal elbows are render-only and bend handles retain original user indices', () => {
  const { wire, context, visual } = fixture()
  visual.controlPoints[0].position.z = -.4
  const saved = JSON.stringify(visual), route = solveWireRoute(wire, visual, context)!
  assert.equal(route.handles.length, 2, 'only the two user bends may become edit handles')
  assert.deepEqual(route.handles.map(handle => handle.index), [0, 1])
  assert.ok(route.points.length > visual.controlPoints.length + 4, 'the route still contains generated elbows')
  assert.deepEqual(materializeWireRoute(visual, route).controlPoints, visual.controlPoints, 'deriving a route cannot turn elbows into persisted anchors')
  const moved = moveWireBend(materializeWireRoute(visual, route), 1, { space: 'module', moduleId: 'BB', position: { x: -3.2, y: .36, z: .5 } })
  assert.deepEqual(moved.controlPoints[0], visual.controlPoints[0])
  assert.equal(moved.controlPoints.length, 2)
  assert.equal(JSON.stringify(visual), saved)
})

test('FREE keeps direct diagonals and an intentional crossing polyline without generated elbows', () => {
  const { wire, visual, context } = fixture('FREE')
  visual.controlPoints = []
  let route = solveWireRoute(wire, visual, context)!
  assert.equal(route.points.length, 4, 'pins, raised leads and one diagonal body segment')
  assert.notEqual(route.points[1].x, route.points[2].x); assert.notEqual(route.points[1].z, route.points[2].z)
  visual.controlPoints = [
    { space: 'world', position: { x: -2, y: .36, z: -1 } }, { space: 'world', position: { x: 0, y: .36, z: 1 } },
    { space: 'world', position: { x: -2, y: .36, z: 1 } }, { space: 'world', position: { x: 0, y: .36, z: -1 } },
  ]
  route = solveWireRoute(wire, visual, context)!
  assert.deepEqual(route.points.slice(2, -2), visual.controlPoints.map(point => point.position))
  assert.equal(route.handles.length, 4)
})

test('fifty orthogonal edits keep only adjacent user anchors and never accumulate solver elbows', () => {
  const { wire, visual, context } = fixture()
  visual.controlPoints[0].position.z = -.4
  let edited = visual
  for (let i = 0; i < 50; i++) {
    const route = solveWireRoute(wire, edited, context)!
    const middle = route.segments.find(segment => segment.editable && segment.start.x === segment.end.x && segment.start.z > -.5 && segment.end.z >= .4)!
    edited = dragWireSegment(edited, route, middle.index, { x: i % 2 ? -.013 : .013, y: 0, z: .02 }, context)
    assert.equal(edited.controlPoints.length, 2, 'editing does not persist derived elbows or copy the whole path')
    assert.ok(edited.controlPoints.every(point => Object.values(point.position).every(Number.isFinite)))
  }
})

test('anchor edits reject non-finite input and collapse a duplicate insertion without erasing intentional collinear handles', () => {
  const { wire, visual, context } = fixture('FREE'), route = solveWireRoute(wire, visual, context)!
  assert.throws(() => moveWireBend(visual, 0, { space: 'world', position: { x: NaN, y: .36, z: 0 } }))
  assert.throws(() => dragWireSegment(visual, route, 1, { x: Infinity, y: 0, z: 0 }, context))
  const middle = route.segments.find(segment => segment.fromHandle === 0 && segment.toHandle === 1)!
  const duplicate = insertWireBend(visual, route, middle.index, { ...visual.controlPoints[0], position: { ...visual.controlPoints[0].position, x: visual.controlPoints[0].position.x + 1e-7 } })
  assert.equal(duplicate.controlPoints.length, 2)
  const inserted = insertWireBend(visual, route, middle.index, { space: 'module', moduleId: 'BB', position: { x: -3.51, y: .36, z: 0 } })
  assert.equal(inserted.controlPoints.length, 3, 'an explicit collinear anchor remains available to drag')
})

test('fifty endpoint-adjacent segment drags reuse bounded anchors and keep both pins fixed', () => {
  for (const mode of ['FREE', 'ORTHOGONAL'] as const) {
    const { wire, context, visual } = fixture(mode)
    visual.controlPoints = []
    const original = solveWireRoute(wire, visual, context)!
    let edited = visual
    for (let i = 0; i < 50; i++) {
      const route = solveWireRoute(wire, edited, context)!
      const first = route.segments.find(segment => segment.editable)!
      edited = dragWireSegment(edited, route, first.index, { x: .1 + i * .001, y: 0, z: .13 + i * .001 }, context)
      assert.equal(edited.controlPoints.length, 2, 'seed a bare route once; subsequent pinned-span drags must reuse those anchors')
      const after = solveWireRoute(wire, edited, context)!
      close(after.points[0], original.points[0]); close(after.points.at(-1)!, original.points.at(-1)!)
      assert.ok(after.points.every(point => Object.values(point).every(Number.isFinite)))
    }
  }
})

test('raised orthogonal anchors retain their exact local elbow order after board move and small yaw', () => {
  const { board, wire, context, visual } = fixture()
  visual.height = .04
  visual.controlPoints = [{ space: 'module', moduleId: 'BB', position: { x: -4.03, y: .6, z: .13 } }]
  const original = solveWireRoute(wire, visual, context)!
  for (const rotation of [4, 37, 90, 180, 270]) {
    board.rotation = rotation; board.position = { x: 5.123, y: .4, z: -2.17 }
    const after = solveWireRoute(wire, visual, context)!
    assert.equal(after.points.length, original.points.length)
    original.points.forEach((point, index) => close(after.points[index], moduleLocalToWorld(point, board)))
  }
})
