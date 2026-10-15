import type { Point3, WireControlPoint, WireVisual } from '../types/circuit'
import { moduleLocalToWorld, worldToModuleLocal } from '../electrical/modulePose'
import { copyControlPoint, copyWireVisual } from './wireVisual'
import { controlPointWorld, finitePoint, pointDistance, ownedPoint, type SolvedWireRoute, type WireRouteContext } from './wireRouting'

export function normalizeWireVisual(visual: WireVisual): WireVisual {
  const next = copyWireVisual(visual)
  const anchors: WireControlPoint[] = []
  for (const point of next.controlPoints) {
    if (!finitePoint(point.position)) throw new Error('Wire anchors must have finite coordinates.')
    const previous = anchors.at(-1)
    // Different owners may move independently later, even if coincident now.
    const sameOwner = previous?.space === point.space && (point.space !== 'module' || previous.space === 'module' && point.moduleId === previous.moduleId)
    if (!previous || !sameOwner || pointDistance(previous.position, point.position) > 1e-5) anchors.push(point)
  }
  // Intentional collinear user handles and crossings stay editable. The geometry
  // normalizer removes redundant collinear samples only from the rendered path.
  next.controlPoints = anchors
  return next
}

export function materializeWireRoute(visual: WireVisual, route: SolvedWireRoute): WireVisual {
  // Compatibility shim: preserve the routing frame, never persist derived elbows.
  return { ...copyWireVisual(visual), frameModuleId: route.frameModuleId }
}
export function moveWireBend(visual: WireVisual, index: number, point: WireControlPoint): WireVisual {
  if (!finitePoint(point.position)) throw new Error('Wire anchors must have finite coordinates.')
  const next = copyWireVisual(visual)
  if (Number.isInteger(index) && index >= 0 && index < next.controlPoints.length) next.controlPoints[index] = copyControlPoint(point)
  return next
}
export function insertWireBend(visual: WireVisual, route: SolvedWireRoute, segmentIndex: number, point: WireControlPoint): WireVisual {
  const next = materializeWireRoute(visual, route), segment = route.segments[segmentIndex]
  if (segment?.editable) next.controlPoints.splice(segment.insertIndex, 0, copyControlPoint(point))
  return normalizeWireVisual(next)
}
export function removeWireBend(visual: WireVisual, index: number): WireVisual {
  const next = copyWireVisual(visual)
  if (Number.isInteger(index) && index >= 0 && index < next.controlPoints.length) next.controlPoints.splice(index, 1)
  return normalizeWireVisual(next)
}
export function dragWireSegment(visual: WireVisual, route: SolvedWireRoute, segmentIndex: number, worldDelta: Point3, context: WireRouteContext): WireVisual {
  const next = materializeWireRoute(visual, route), segment = route.segments[segmentIndex]
  if (!segment?.editable) return next
  if (!finitePoint(worldDelta)) throw new Error('Wire segment movement must be finite.')
  const frame = route.frameModuleId && context.modulePose(route.frameModuleId)
  let delta = { ...worldDelta, y: 0 }
  if (route.orthogonal) {
    const start = frame ? worldToModuleLocal(segment.start, frame) : segment.start
    const end = frame ? worldToModuleLocal(segment.end, frame) : segment.end
    const origin = frame ? moduleLocalToWorld({ x: 0, y: 0, z: 0 }, frame) : { x: 0, y: 0, z: 0 }
    const localDelta = frame ? worldToModuleLocal({ x: origin.x + delta.x, y: origin.y, z: origin.z + delta.z }, frame) : delta
    if (Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)) localDelta.x = 0
    else localDelta.z = 0
    const world = frame ? moduleLocalToWorld(localDelta, frame) : localDelta
    delta = { x: world.x - origin.x, y: 0, z: world.z - origin.z }
  }
  if (Math.hypot(delta.x, delta.z) < 1e-8) return next
  const shifted = (point: Point3, index: number | null) => ownedPoint({ x: point.x + delta.x, y: point.y, z: point.z + delta.z }, index === null ? route.frameModuleId : next.controlPoints[index]?.space === 'module' ? (next.controlPoints[index] as Extract<WireControlPoint, { space: 'module' }>).moduleId : null, context)
  // Move only the user anchors bounding this semantic span. With one pinned
  // boundary the span pivots/reshapes around that pin; reuse its user boundary.
  for (const index of [segment.beforeUserIndex, segment.afterUserIndex]) {
    if (index === null) continue
    const world = controlPointWorld(next.controlPoints[index], context)
    if (!world) throw new Error('Wire anchor owner is unavailable.')
    next.controlPoints[index] = shifted(world, index)
  }
  // A bare endpoint-to-endpoint span needs two support anchors once. Never add
  // another support on every subsequent drag of an endpoint-adjacent span.
  if (segment.beforeUserIndex === null && segment.afterUserIndex === null) {
    next.controlPoints.splice(segment.insertIndex, 0, shifted(segment.start, null), shifted(segment.end, null))
  }
  return normalizeWireVisual(next)
}
