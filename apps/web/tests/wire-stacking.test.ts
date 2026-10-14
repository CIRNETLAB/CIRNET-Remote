import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CircuitConnection, Point3, WireVisual } from '../src/types/circuit'
import { defaultWireVisual } from '../src/wires/wireVisual'
import { solveWireRoute, type WireRouteContext } from '../src/wires/wireRouting'
import { automaticWireLayer, findWireStackConflicts, wireRoutesConflict } from '../src/wires/wireStacking'

const visual: WireVisual = { ...defaultWireVisual(), routeMode: 'FREE', thickness: .052 }
function route(a: Point3, b: Point3) {
  const context: WireRouteContext = { modulePose: () => null, endpoint: endpoint => ({ endpoint, position: endpoint === 'A' ? a : b }) }
  return solveWireRoute({ source: 'A', destination: 'B' }, visual, context)!
}
const point = (x: number, z: number): Point3 => ({ x, y: .37, z })

test('XZ conflicts include crossing, collinear/near-collinear overlap and quarter-pitch lanes, but exclude clear disjoint runs', () => {
  const base = route(point(0, 0), point(2, 0))
  for (const [a, b] of [
    [point(1, -1), point(1, 1)], [point(.5, 0), point(1.5, 0)], [point(2, 0), point(0, 0)],
    [point(.5, .02), point(1.5, .021)], [point(0, .0325), point(2, .0325)],
  ]) assert.equal(wireRoutesConflict(base, visual, route(a, b), visual), true)
  for (const [a, b] of [[point(0, .13), point(2, .13)], [point(3, 0), point(4, 0)], [point(3, 1), point(4, 2)]]) assert.equal(wireRoutesConflict(base, visual, route(a, b), visual), false)
})

test('automatic layers retain creation order for exact and near overlaps, treat legacy layer as zero and ignore self identity', () => {
  const positions: Record<string, Point3> = { A: point(0, 0), B: point(2, 0), C: point(0, 0), D: point(2, 0), E: point(0, .0325), F: point(2, .0325), G: point(0, .3), H: point(2, .3) }
  const context: WireRouteContext = { modulePose: () => null, endpoint: endpoint => ({ endpoint, position: positions[endpoint] }) }
  const connections: CircuitConnection[] = [{ source: 'A', destination: 'B', metadata: { wireVisual: visual, untouched: 'keep' } }]
  const next = { source: 'C', destination: 'D' }, saved = JSON.stringify(connections)
  assert.equal(automaticWireLayer(next, visual, connections, context), 1)
  assert.equal(JSON.stringify(connections), saved)
  connections.push({ ...next, metadata: { wireVisual: { ...visual, layer: 1 } } })
  assert.equal(automaticWireLayer({ source: 'E', destination: 'F' }, visual, connections, context), 2)
  assert.equal(automaticWireLayer({ source: 'G', destination: 'H' }, visual, connections, context), 0)
  assert.equal(findWireStackConflicts(connections[0], visual, [connections[0]], context).length, 0)
})

test('automatic stacking clears actual body heights when the first nominal layer would intersect a raised route', () => {
  const positions: Record<string, Point3> = { E: { x: -1, y: .434, z: 0 }, F: { x: 1, y: .434, z: 0 }, A: { x: 0, y: .37, z: -1 }, B: { x: 0, y: .37, z: 1 } }
  const context: WireRouteContext = { modulePose: () => null, endpoint: endpoint => ({ endpoint, position: positions[endpoint] }) }
  const existing: CircuitConnection = { source: 'E', destination: 'F', metadata: { wireVisual: visual } }
  assert.equal(automaticWireLayer({ source: 'A', destination: 'B' }, visual, [existing], context), 2, 'nominal layer 1 equals the existing .434 body height; choose the first physically clear layer')
  assert.equal(positions.A.y, .37); assert.equal(positions.E.y, .434)
})

test('stacking uses vertical cylinder support for steep same-path routes rather than just ring height', () => {
  const positions: Record<string, Point3> = { E: { x: 0, y: .37, z: 0 }, F: { x: .5, y: 2.37, z: 0 }, A: { x: 0, y: .37, z: 0 }, B: { x: .5, y: 2.37, z: 0 } }
  const context: WireRouteContext = { modulePose: () => null, endpoint: endpoint => ({ endpoint, position: positions[endpoint] }) }
  const existing: CircuitConnection = { source: 'E', destination: 'F', metadata: { wireVisual: visual } }
  const layer = automaticWireLayer({ source: 'A', destination: 'B' }, visual, [existing], context)
  assert.ok(layer * .064 * (.5 / Math.hypot(.5, 2)) >= .055, 'the perpendicular distance between the tilted bodies clears their full diameters')
  assert.equal(positions.E.y, .37)
})
