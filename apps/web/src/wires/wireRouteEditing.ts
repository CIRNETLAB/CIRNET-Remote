import type { Point3, WireControlPoint, WireVisual } from '../types/circuit'
import { moduleLocalToWorld, worldToModuleLocal } from '../electrical/modulePose'
import { copyControlPoint, copyWireVisual } from './wireVisual'
import { ownedPoint, type SolvedWireRoute, type WireRouteContext } from './wireRouting'

export function materializeWireRoute(visual: WireVisual, route: SolvedWireRoute): WireVisual {
  return { ...copyWireVisual(visual), frameModuleId: route.frameModuleId, controlPoints: route.materializedControlPoints.map(copyControlPoint) }
}
export function moveWireBend(visual: WireVisual, index: number, point: WireControlPoint): WireVisual {
  const next = copyWireVisual(visual)
  if (Number.isInteger(index) && index >= 0 && index < next.controlPoints.length) next.controlPoints[index] = copyControlPoint(point)
  return next
}
export function insertWireBend(visual: WireVisual, route: SolvedWireRoute, segmentIndex: number, point: WireControlPoint): WireVisual {
  const next = materializeWireRoute(visual, route), segment = route.segments[segmentIndex]
  if (segment?.editable) next.controlPoints.splice(segment.toHandle ?? next.controlPoints.length, 0, copyControlPoint(point))
  return next
}
export function removeWireBend(visual: WireVisual, index: number): WireVisual {
  const next = copyWireVisual(visual)
  if (Number.isInteger(index) && index >= 0 && index < next.controlPoints.length) next.controlPoints.splice(index, 1)
  return next
}
export function dragWireSegment(visual: WireVisual, route: SolvedWireRoute, segmentIndex: number, worldDelta: Point3, context: WireRouteContext): WireVisual {
  const next = materializeWireRoute(visual, route), segment = route.segments[segmentIndex]
  if (!segment?.editable) return next
  const frame = route.frameModuleId && context.modulePose(route.frameModuleId)
  let delta = { ...worldDelta, y: 0 }
  if (visual.routeMode !== 'FREE') {
    const start = frame ? worldToModuleLocal(segment.start, frame) : segment.start
    const end = frame ? worldToModuleLocal(segment.end, frame) : segment.end
    const origin = frame ? moduleLocalToWorld({ x: 0, y: 0, z: 0 }, frame) : { x: 0, y: 0, z: 0 }
    const localDelta = frame ? worldToModuleLocal({ x: origin.x + delta.x, y: origin.y, z: origin.z + delta.z }, frame) : delta
    if (Math.abs(end.x - start.x) >= Math.abs(end.z - start.z)) localDelta.x = 0
    else localDelta.z = 0
    const world = frame ? moduleLocalToWorld(localDelta, frame) : localDelta
    delta = { x: world.x - origin.x, y: 0, z: world.z - origin.z }
  }
  const shifted = (point: Point3, index: number | null) => ownedPoint({ x: point.x + delta.x, y: point.y, z: point.z + delta.z }, index === null ? route.frameModuleId : next.controlPoints[index]?.space === 'module' ? (next.controlPoints[index] as Extract<WireControlPoint, { space: 'module' }>).moduleId : null, context)
  if (segment.fromHandle !== null) next.controlPoints[segment.fromHandle] = shifted(segment.start, segment.fromHandle)
  if (segment.toHandle !== null) next.controlPoints[segment.toHandle] = shifted(segment.end, segment.toHandle)
  if (segment.toHandle === null) next.controlPoints.splice(segment.fromHandle === null ? next.controlPoints.length : segment.fromHandle + 1, 0, shifted(segment.end, null))
  if (segment.fromHandle === null) next.controlPoints.splice(segment.toHandle ?? 0, 0, shifted(segment.start, null))
  return next
}
