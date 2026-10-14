import type { CircuitConnection, Point3, WireIdentity, WireVisual } from '../types/circuit'
import { renderWireDiameter, WIRE_LAYER_GAP } from './wireAppearance'
import { solveWireRoute, type SolvedWireRoute, type WireRouteContext } from './wireRouting'
import { readWireVisual, wireKey } from './wireVisual'
import { deriveWireParts } from '../three/WireTerminals'
import { wireGeometryEnvelope, type WireHeightRange, type WireEnvelopeSegment } from '../three/WireGeometry'

const HEIGHT_EPSILON = 1e-7
const BODY_GAP = WIRE_LAYER_GAP / 4
const bodyEnvelope = (route: SolvedWireRoute, visual: WireVisual) => wireGeometryEnvelope(deriveWireParts(route, renderWireDiameter(visual)).bodyPoints, renderWireDiameter(visual))
const overlapHeight = (a: WireHeightRange, b: WireHeightRange) => a.min < b.max + BODY_GAP - HEIGHT_EPSILON && b.min < a.max + BODY_GAP - HEIGHT_EPSILON
const stackContext = (visual: WireVisual, connections: CircuitConnection[], context: WireRouteContext): WireRouteContext => {
  const diameter = connections.reduce((value, wire) => Math.max(value, renderWireDiameter(readWireVisual(wire))), Math.max(renderWireDiameter(visual), context.layerDiameter?.() ?? 0))
  return { ...context, layerDiameter: () => diameter }
}

const pointSegmentDistance = (p: Point3, a: Point3, b: Point3): number => {
  const x = b.x - a.x, z = b.z - a.z, length = x * x + z * z
  const t = length > 1e-16 ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / length)) : 0
  return Math.hypot(p.x - a.x - t * x, p.z - a.z - t * z)
}
const projectedParameter = (p: Point3, a: Point3, b: Point3) => {
  const x = b.x - a.x, z = b.z - a.z, length = x * x + z * z
  return length > 1e-16 ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / length)) : 0
}
function projectedPairs(a: Point3, b: Point3, c: Point3, d: Point3): [number, number][] {
  const pairs: [number, number][] = [[0, projectedParameter(a, c, d)], [1, projectedParameter(b, c, d)], [projectedParameter(c, a, b), 0], [projectedParameter(d, a, b), 1]]
  const ux = b.x - a.x, uz = b.z - a.z, vx = d.x - c.x, vz = d.z - c.z, denominator = ux * vz - uz * vx
  if (Math.abs(denominator) > 1e-12) {
    const x = c.x - a.x, z = c.z - a.z, s = (x * vz - z * vx) / denominator, t = (x * uz - z * ux) / denominator
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) pairs.push([s, t])
  }
  // Collinear overlap can be clear at clipped caps but intersect in the middle
  // of a steep span. Include interior pairs of the overlapping parameter range.
  const boundaries = [...pairs]
  for (let i = 0; i < boundaries.length; i++) for (let j = i + 1; j < boundaries.length; j++) pairs.push([(boundaries[i][0] + boundaries[j][0]) / 2, (boundaries[i][1] + boundaries[j][1]) / 2])
  return pairs
}
function nearbyBodyRanges(a: WireEnvelopeSegment[], b: WireEnvelopeSegment[], visit: (first: WireHeightRange, second: WireHeightRange) => void) {
  const at = (cell: WireEnvelopeSegment, t: number): WireHeightRange => {
    const y = cell.start.y + (cell.end.y - cell.start.y) * t
    return { min: Math.max(cell.min, y - cell.verticalRadius), max: Math.min(cell.max, y + cell.verticalRadius) }
  }
  for (const first of a) for (const second of b) {
    const clearance = first.radius + second.radius + BODY_GAP, p = first.start, q = first.end, r = second.start, s = second.end
    if (Math.max(p.x, q.x) + clearance < Math.min(r.x, s.x) || Math.max(r.x, s.x) + clearance < Math.min(p.x, q.x) || Math.max(p.z, q.z) + clearance < Math.min(r.z, s.z) || Math.max(r.z, s.z) + clearance < Math.min(p.z, q.z)) continue
    for (const [u, v] of projectedPairs(p, q, r, s)) {
      const x = p.x + (q.x - p.x) * u - r.x - (s.x - r.x) * v, z = p.z + (q.z - p.z) * u - r.z - (s.z - r.z) * v
      if (Math.hypot(x, z) <= clearance) visit(at(first, u), at(second, v))
    }
  }
}
const bodiesOverlap = (a: WireEnvelopeSegment[], b: WireEnvelopeSegment[]): boolean => {
  let overlap = false; nearbyBodyRanges(a, b, (first, second) => { if (overlapHeight(first, second)) overlap = true }); return overlap
}
const liftAbove = (a: WireEnvelopeSegment[], b: WireEnvelopeSegment[]): number => {
  let missing = 0; nearbyBodyRanges(a, b, (first, second) => { missing = Math.max(missing, second.max + BODY_GAP - first.min) }); return missing
}
function segmentDistance(a: Point3, b: Point3, c: Point3, d: Point3): number {
  const ux = b.x - a.x, uz = b.z - a.z, vx = d.x - c.x, vz = d.z - c.z
  const denominator = ux * vz - uz * vx
  if (Math.abs(denominator) > 1e-12) {
    const x = c.x - a.x, z = c.z - a.z
    const s = (x * vz - z * vx) / denominator, t = (x * uz - z * ux) / denominator
    if (s >= -1e-10 && s <= 1 + 1e-10 && t >= -1e-10 && t <= 1 + 1e-10) return 0
  }
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b))
}

export function wireRoutesConflict(a: SolvedWireRoute, aVisual: WireVisual, b: SolvedWireRoute, bVisual: WireVisual): boolean {
  const clearance = (renderWireDiameter(aVisual) + renderWireDiameter(bVisual)) / 2 + WIRE_LAYER_GAP
  for (const first of a.segments) {
    if (!first.editable) continue // Vertical plugged leads are pinned, not lanes.
    for (const second of b.segments) {
      if (!second.editable) continue
      const p = first.start, q = first.end, r = second.start, s = second.end
      if (Math.max(p.x, q.x) + clearance < Math.min(r.x, s.x) || Math.max(r.x, s.x) + clearance < Math.min(p.x, q.x) || Math.max(p.z, q.z) + clearance < Math.min(r.z, s.z) || Math.max(r.z, s.z) + clearance < Math.min(p.z, q.z)) continue
      if (segmentDistance(p, q, r, s) < clearance + 1e-9) return true
    }
  }
  return false
}
export interface WireStackPeer { wire: CircuitConnection; visual: WireVisual; route: SolvedWireRoute; envelope: WireEnvelopeSegment[] }
export function findWireStackConflicts(wire: WireIdentity, visual: WireVisual, connections: CircuitConnection[], context: WireRouteContext): WireStackPeer[] {
  context = stackContext(visual, connections, context)
  const candidate = solveWireRoute(wire, visual, context)
  if (!candidate) return []
  const peers: WireStackPeer[] = []
  for (const connection of connections) {
    if (wireKey(connection) === wireKey(wire)) continue
    const otherVisual = readWireVisual(connection), route = solveWireRoute(connection, otherVisual, context)
    if (route && wireRoutesConflict(candidate, visual, route, otherVisual)) peers.push({ wire: connection, visual: otherVisual, route, envelope: bodyEnvelope(route, otherVisual) })
  }
  return peers
}
export function automaticWireLayer(wire: WireIdentity, visual: WireVisual, connections: CircuitConnection[], context: WireRouteContext): number {
  context = stackContext(visual, connections, context)
  const conflicts = findWireStackConflicts(wire, visual, connections, context)
  if (!conflicts.length) return 0
  const layer = Math.max(...conflicts.map(peer => peer.visual.layer ?? 0)) + 1
  const nextVisual = { ...visual, layer }, route = solveWireRoute(wire, nextVisual, context)
  if (!route) return layer
  const envelope = bodyEnvelope(route, nextVisual), missing = Math.max(...conflicts.map(peer => liftAbove(envelope, peer.envelope)))
  return layer + Math.max(0, Math.ceil((missing - HEIGHT_EPSILON) / (context.layerDiameter!() + WIRE_LAYER_GAP)))
}

export function occupiedWireStackConflicts(wire: WireIdentity, visual: WireVisual, connections: CircuitConnection[], context: WireRouteContext): WireStackPeer[] {
  context = stackContext(visual, connections, context)
  const route = solveWireRoute(wire, visual, context)
  if (!route) return []
  const envelope = bodyEnvelope(route, visual)
  return findWireStackConflicts(wire, visual, connections, context).filter(peer => (peer.visual.layer ?? 0) === (visual.layer ?? 0) || bodiesOverlap(envelope, peer.envelope))
}

export function availableWireLayer(wire: WireIdentity, visual: WireVisual, preferred: number, fixed: CircuitConnection[], context: WireRouteContext): number {
  context = stackContext(visual, fixed, context)
  const peers = findWireStackConflicts(wire, visual, fixed, context), step = context.layerDiameter!() + WIRE_LAYER_GAP
  let layer = preferred
  // Each pass clears at least one fixed height interval; no unbounded scan.
  for (let pass = 0; pass <= peers.length; pass++) {
    const nextVisual = { ...visual, layer }, route = solveWireRoute(wire, nextVisual, context)
    if (!route) return layer
    const envelope = bodyEnvelope(route, nextVisual)
    const blocked = peers.find(peer => (peer.visual.layer ?? 0) === layer || bodiesOverlap(envelope, peer.envelope))
    if (!blocked) return layer
    layer += Math.max(1, Math.ceil((liftAbove(envelope, blocked.envelope) - HEIGHT_EPSILON) / step))
  }
  return layer
}
