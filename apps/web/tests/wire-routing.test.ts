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
