import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Point3, WireVisual } from '../src/types/circuit'
import { defaultWireVisual, wireKey } from '../src/wires/wireVisual'
import { solveWireRoute } from '../src/wires/wireRouting'
import { createWireLayoutCache, type WireLayoutInput } from '../src/wires/wireLayout'
import { deriveWireParts } from '../src/three/WireTerminals'
import { buildWireGeometry } from '../src/three/WireGeometry'
import { assertHealthyWireGeometry } from './helpers/wireGeometryAssertions'
import { moduleLocalToWorld } from '../src/electrical/modulePose'
import type { CircuitModule } from '../src/types/circuit'

const point = (x: number, z: number, y = .36): Point3 => ({ x, y, z })
function input(index: number, path = [point(-2, 0), point(2, 0)], patch: Partial<WireVisual> = {}): WireLayoutInput {
  const wire = { source: `S${index}`, destination: `D${index}` }
  const visual: WireVisual = { ...defaultWireVisual(), thickness: .052, routeMode: 'FREE', layer: index, ...patch, controlPoints: path.slice(1, -1).map(position => ({ space: 'world', position: { ...position } })) }
  const route = solveWireRoute(wire, visual, { modulePose: () => null, endpoint: endpoint => ({ endpoint, position: endpoint === wire.source ? path[0] : path.at(-1)! }) })!
  return { wire, visual, route }
}
const healthy = (entry: WireLayoutInput, route: ReturnType<ReturnType<typeof createWireLayoutCache>['sync']> extends Map<string, infer T> ? T : never) => {
  const parts = deriveWireParts(route, entry.visual.thickness), geometry = buildWireGeometry({ points: parts.bodyPoints }, entry.visual.thickness)
  try { assertHealthyWireGeometry(geometry) } finally { geometry.dispose() }
}
const center = (entry: WireLayoutInput, routes: Map<string, import('../src/wires/wireRouting').SolvedWireRoute>) => {
  const span = routes.get(wireKey(entry.wire))!.renderSegments!.find(span => Math.min(span.start.x, span.end.x) <= 0 && Math.max(span.start.x, span.end.x) >= 0)!
  const t = (0 - span.start.x) / (span.end.x - span.start.x)
  return { x: 0, y: span.start.y + (span.end.y - span.start.y) * t, z: span.start.z + (span.end.z - span.start.z) * t }
}

test('ten and twenty exact-route wires form centered compact lanes at one base height, never a Y tower', () => {
  for (const count of [10, 20]) {
    const entries = Array.from({ length: count }, (_, index) => input(index)), saved = JSON.stringify(entries)
    const routes = createWireLayoutCache().sync(entries)
    const centers = entries.map(entry => center(entry, routes))
    assert.ok(centers.every(Boolean), 'layout supplies a center sample for inspecting the straight bundle')
    for (let index = 0; index < count; index++) {
      assert.ok(Math.abs(centers[index].z - (index - (count - 1) / 2) * .0546) < 1e-8)
      assert.equal(centers[index].y, .36)
      const route = routes.get(wireKey(entries[index].wire))!
      assert.deepEqual(route.renderPoints![0], entries[index].route.points[0])
      assert.deepEqual(route.renderPoints!.at(-1), entries[index].route.points.at(-1))
      assert.ok(route.renderPoints!.every(point => Math.abs(point.y - .36) < 1e-8))
      healthy(entries[index], route)
    }
    assert.equal(JSON.stringify(entries), saved)
  }
})

test('near-parallel corridors with reversed endpoints share diameter-sized lanes and stable creation ordering', () => {
  const entries = [input(0), input(1, [point(2, .02), point(-2, .02)], { layer: 0 }), input(2, [point(-1, .01), point(1, .011)], { layer: 0 })]
  const routes = createWireLayoutCache().sync(entries)
  const centers = entries.map(entry => center(entry, routes))
  assert.ok(Math.abs(centers[1].z - centers[0].z - .0546) < .002)
  assert.ok(Math.abs(centers[2].z - centers[1].z - .0546) < .002)
  entries.forEach(entry => healthy(entry, routes.get(wireKey(entry.wire))!))
})

test('mixed diameter bundles clear adjacent radii with a tiny relative gap', () => {
  const entries = [input(0, undefined, { thickness: .12 }), input(1), input(2)]
  const routes = createWireLayoutCache().sync(entries), centers = entries.map(entry => center(entry, routes))
  assert.ok(Math.abs(centers[1].z - centers[0].z - .092) < 1e-8)
  assert.ok(Math.abs(centers[2].z - centers[1].z - .0546) < 1e-8)
})

test('a true crossing has a local overpass with unchanged ends and returns to the base after the crossing', () => {
  const lower = input(0), upper = input(1, [point(0, -2), point(0, 2)])
  const routes = createWireLayoutCache().sync([lower, upper]), low = routes.get(wireKey(lower.wire))!, high = routes.get(wireKey(upper.wire))!
  assert.ok(low.renderPoints!.every(point => point.y === .36))
  const peak = Math.max(...high.renderPoints!.map(point => point.y))
  assert.ok(peak >= .4146 - 1e-8 && peak < .42, 'only radii plus a tiny gap are required')
  assert.ok(high.renderPoints!.some(point => Math.abs(point.z) < .001 && point.y >= .4146 - 1e-8))
  assert.ok(high.renderPoints!.filter(point => Math.abs(point.z) > .6).every(point => point.y === .36))
  assert.deepEqual(high.renderPoints![0], upper.route.points[0]); assert.deepEqual(high.renderPoints!.at(-1), upper.route.points.at(-1))
  healthy(lower, low); healthy(upper, high)
})

test('priority changes reverse over/under locally and reorder lanes without moving semantic anchors', () => {
  const a = input(0), b = input(1, [point(0, -2), point(0, 2)])
  const cache = createWireLayoutCache(), before = cache.sync([a, b])
  assert.ok(Math.max(...before.get(wireKey(b.wire))!.renderPoints!.map(point => point.y)) > .41)
  const raised = { ...a, visual: { ...a.visual, layer: 2 } }, after = cache.sync([raised, b])
  assert.ok(after.get(wireKey(b.wire))!.renderPoints!.every(point => point.y === .36))
  assert.ok(Math.max(...after.get(wireKey(a.wire))!.renderPoints!.map(point => point.y)) > .41)
  assert.deepEqual(after.get(wireKey(a.wire))!.points, a.route.points)
  const parallel = input(1)
  const ordered = cache.sync([raised, parallel])
  assert.ok(center(raised, ordered).z > center(parallel, ordered).z)
})

test('nearby crossings merge into a bounded smooth bridge; short and raised spans retain healthy geometry', () => {
  const entries = [input(0, [point(-1, -.06), point(1, -.06)]), input(1, [point(-1, .06), point(1, .06)]), input(2, [point(0, -1), point(0, 1)]), input(3, [point(-.08, -.08, .5), point(.08, .08, .52)])]
  const routes = createWireLayoutCache().sync(entries)
  for (const entry of entries) {
    const route = routes.get(wireKey(entry.wire))!
    assert.ok(route.renderPoints!.every(point => [point.x, point.y, point.z].every(Number.isFinite)))
    healthy(entry, route)
  }
  const high = routes.get(wireKey(entries[2].wire))!
  assert.ok(high.renderPoints!.filter(point => Math.abs(point.z) > .5).every(point => point.y === .36))
})

test('display spans retain semantic ownership and handles without persisting fan or bridge samples', () => {
  const entries = [input(0, [point(-2, 0), point(0, 0), point(2, 0)]), input(1, [point(-2, 0), point(0, 0), point(2, 0)])]
  const routes = createWireLayoutCache().sync(entries)
  for (const entry of entries) {
    const route = routes.get(wireKey(entry.wire))!
    assert.equal(route.handles.length, 1); assert.equal(route.renderHandles!.length, 1)
    assert.ok(Math.abs(route.renderHandles![0].position.z) > .02)
    assert.ok(route.renderSegments!.every(segment => entry.route.segments[segment.index]?.editable && segment.baseStart && segment.baseEnd))
    assert.equal(entry.visual.controlPoints.length, 1)
  }
})

test('cache invalidates both former and new conflict groups while retaining unrelated layout references', () => {
  const a = input(0), b = input(1), other = input(2, [point(-2, 4), point(2, 4)])
  const cache = createWireLayoutCache(), first = cache.sync([a, b, other]), saved = first.get(wireKey(other.wire))
  const identical = cache.sync([a, b, { ...other, visual: { ...other.visual, color: '#ff0000' } }])
  assert.equal(identical.get(wireKey(a.wire)), first.get(wireKey(a.wire)))
  const moved = input(1, [point(-2, 4), point(2, 4)])
  const next = cache.sync([a, moved, other])
  assert.ok(next.get(wireKey(a.wire))!.renderPoints!.every(point => point.z === 0), 'former peer returns to the route center')
  assert.notEqual(next.get(wireKey(other.wire)), saved, 'new peer joins the new bundle')
  const removed = cache.sync([a, other])
  assert.ok(removed.get(wireKey(other.wire))!.renderPoints!.every(point => point.z === 4))
})

test('multi-bend bundles keep separated corner lanes, including reversed route direction', () => {
  const path = [point(-2, 0), point(0, 0), point(0, 2)]
  const entries = [input(0, path), input(1, [...path].reverse())], routes = createWireLayoutCache().sync(entries)
  const corners = entries.map(entry => routes.get(wireKey(entry.wire))!.renderHandles![0].position)
  assert.ok(Math.hypot(corners[0].x - corners[1].x, corners[0].z - corners[1].z) >= .0546, 'a corner may not collapse the lane separation')
  entries.forEach(entry => healthy(entry, routes.get(wireKey(entry.wire))!))
})

test('sharing one parallel corridor does not suppress a later true crossing between the same two wires', () => {
  const a = input(0, [point(-2, 0), point(0, 0), point(0, 2)])
  const b = input(1, [point(-2, 0), point(0, 0), point(1, 0), point(1, 1), point(-1, 1)])
  const high = createWireLayoutCache().sync([a, b]).get(wireKey(b.wire))!
  assert.ok(high.renderPoints!.some(point => Math.abs(point.z - 1) < .01 && Math.abs(point.x) < .1 && point.y > .41))
  healthy(b, high)
})

test('a widening bundle discovers neighboring corridors and invalidates their cached layouts', () => {
  const cache = createWireLayoutCache(), neighbor = input(20, [point(-2, .2), point(2, .2)], { layer: 20 })
  const first = cache.sync([input(0), neighbor]), old = first.get(wireKey(neighbor.wire))
  const entries = [...Array.from({ length: 8 }, (_, index) => input(index)), neighbor]
  const next = cache.sync(entries), centers = entries.map(entry => center(entry, next)).sort((a, b) => a.z - b.z)
  for (let i = 1; i < centers.length; i++) assert.ok(centers[i].z - centers[i - 1].z >= .05459, 'derived bundle width must not collide with an originally separate corridor')
  assert.notEqual(next.get(wireKey(neighbor.wire)), old)
})

test('cached order neighbors distinguish direct conflicts from their connected component', () => {
  const a = input(0), b = input(1, [point(-2, 1), point(2, 1)]), c = input(2, [point(0, -2), point(0, 2)])
  const cache = createWireLayoutCache(); cache.sync([a, b, c])
  assert.deepEqual(cache.peers(wireKey(a.wire)), [wireKey(c.wire)])
  assert.deepEqual(new Set(cache.peers(wireKey(a.wire), true)), new Set([wireKey(b.wire), wireKey(c.wire)]))
})

test('cache invalidates edit-frame and mode changes even when their current rendered positions coincide', () => {
  const a = input(0), cache = createWireLayoutCache(), before = cache.sync([a]).get(wireKey(a.wire))!
  const next = cache.sync([{ ...a, route: { ...a.route, frameModuleId: 'SUPPORT', orthogonal: true } }]).get(wireKey(a.wire))!
  assert.equal(next.frameModuleId, 'SUPPORT'); assert.equal(next.orthogonal, true); assert.notEqual(next, before)
})

test('multi-bend contact bundle and its fixed collars transform rigidly with board move and arbitrary yaw', () => {
  const board: CircuitModule = { id: 'BB', type: 'BREADBOARD', rotation: 0, position: { x: 0, y: 0, z: 0 } }
  const entries = () => [0, 1, 2].map(index => {
    const wire = { source: `S${index}`, destination: `D${index}` }, visual: WireVisual = { ...defaultWireVisual(), routeMode: 'FREE', thickness: .052, layer: index, controlPoints: [{ space: 'module', moduleId: 'BB', position: { ...point(0, 0) } }] }
    const route = solveWireRoute(wire, visual, { modulePose: () => board, endpoint: endpoint => ({ endpoint, contactModuleId: 'BB', position: moduleLocalToWorld(endpoint.startsWith('S') ? point(-2, 0, .309) : point(0, 2, .309), board) }) })!
    return { wire, visual, route }
  })
  const cache = createWireLayoutCache(), original = cache.sync(entries())
  for (const rotation of [37, 90, 180, 270]) {
    board.rotation = rotation; board.position = { x: 4.13, y: .4, z: -2.1 }
    const after = cache.sync(entries())
    for (const [key, base] of original) {
      const moved = after.get(key)!
      assert.equal(moved.renderPoints!.length, base.renderPoints!.length)
      base.renderPoints!.forEach((point, index) => {
        const expected = moduleLocalToWorld(point, board), actual = moved.renderPoints![index]
        assert.ok(Math.hypot(expected.x - actual.x, expected.y - actual.y, expected.z - actual.z) < 1e-7)
      })
      const pins = deriveWireParts(moved, .052).terminals, oldPins = deriveWireParts(base, .052).terminals
      assert.ok(Math.abs(pins[0].junction.y - oldPins[0].junction.y - .4) < 1e-8)
      healthy(entries().find(entry => wireKey(entry.wire) === key)!, moved)
    }
  }
})

test('ten identical short S bends never reverse along a semantic span or create incidental height towers', () => {
  for (const length of [.04, .065, .13, .26]) {
    const entries = Array.from({ length: 10 }, (_, index) => input(index, [point(-2, 0), point(0, 0), point(0, length), point(2, length)]))
    if(length<2*.13/2.54){assert.ok(entries.every(entry=>entry.route===null),'short manual spans reject instead of folding or erasing the S bend');continue}
    const routes = createWireLayoutCache().sync(entries)
    for (const entry of entries) {
    const route = routes.get(wireKey(entry.wire))!
    for (const span of route.renderSegments!) {
      const original = entry.route.segments[span.index]
      const progress = (span.end.x - span.start.x) * (original.end.x - original.start.x) + (span.end.z - span.start.z) * (original.end.z - original.start.z)
      assert.ok(progress >= -1e-9, 'a derived fan must not double back on the short original span')
    }
    assert.ok(route.renderPoints!.every(point => Math.abs(point.y - .36) < 1e-8), 'identical-route bundle must stay at its single base height')
      healthy(entry, route)
    }
    const middleXs = entries.map(entry => { const handles = routes.get(wireKey(entry.wire))!.renderHandles!; return (handles[0].position.x + handles[1].position.x) / 2 }).sort((a, b) => a - b)
    for (let index = 1; index < middleXs.length; index++) assert.ok(middleXs[index] - middleXs[index - 1] >= .0546 - 1e-7, 'even a short shared bend span needs side-by-side lanes')
  }
})

test('five-degree crossing gets a local bridge instead of two intersecting translated lanes', () => {
  const a = input(0), b = input(1, [point(-2, -.175), point(2, .175)])
  const routes = createWireLayoutCache().sync([a, b]), low = routes.get(wireKey(a.wire))!, high = routes.get(wireKey(b.wire))!
  assert.ok(high.renderPoints!.some(point => point.y >= .4146 - 1e-8))
  let crossings = 0
  for (const first of low.renderSegments!) for (const second of high.renderSegments!) {
    const ux = first.end.x - first.start.x, uz = first.end.z - first.start.z, vx = second.end.x - second.start.x, vz = second.end.z - second.start.z
    const denominator = ux * vz - uz * vx
    if (Math.abs(denominator) < 1e-10) continue
    const x = second.start.x - first.start.x, z = second.start.z - first.start.z
    const s = (x * vz - z * vx) / denominator, t = (x * uz - z * ux) / denominator
    if (s < 0 || s > 1 || t < 0 || t > 1) continue
    const lowY = first.start.y + (first.end.y - first.start.y) * s, highY = second.start.y + (second.end.y - second.start.y) * t
    assert.ok(highY - lowY >= .0546 - 1e-7, 'the actual centerline crossing must clear both radii')
    crossings++
  }
  assert.ok(crossings > 0); healthy(b, high)
})

test('collinear XZ spans whose heights cross are separated laterally even when midpoint heights differ', () => {
  const a = input(0, [point(-2, 0, .5), point(2, 0, .5)])
  const b = input(1, [point(-2, 0, .36), point(2, 0, 1)])
  const routes = createWireLayoutCache().sync([a, b])
  const at = (entry: WireLayoutInput) => {
    const span = routes.get(wireKey(entry.wire))!.renderSegments!.find(span => Math.min(span.start.x, span.end.x) <= -1.125 && Math.max(span.start.x, span.end.x) >= -1.125)!
    const t = (-1.125 - span.start.x) / (span.end.x - span.start.x)
    return { y: span.start.y + (span.end.y - span.start.y) * t, z: span.start.z + (span.end.z - span.start.z) * t }
  }
  const first = at(a), second = at(b)
  assert.ok(Math.hypot(first.y - second.y, first.z - second.z) >= .0546 - 1e-8, 'the original 3D intersection must be cleared')
  healthy(a, routes.get(wireKey(a.wire))!); healthy(b, routes.get(wireKey(b.wire))!)
})

test('a small edit splitting one bundle span into adjacent near-collinear spans cannot create false bridges', () => {
  const entries = Array.from({ length: 10 }, (_, index) => input(index, index ? undefined : [point(-2, 0), point(0, .01), point(2, 0)]))
  const routes = createWireLayoutCache().sync(entries)
  for (const entry of entries) {
    const route = routes.get(wireKey(entry.wire))!
    assert.ok(route.renderPoints!.every(point => Math.abs(point.y - .36) < 1e-8), 'a small in-corridor bend edit must remain a low lateral bundle')
    healthy(entry, route)
  }
})
