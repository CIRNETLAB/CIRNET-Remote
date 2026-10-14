import type { CircuitModule, Point3, WireControlPoint, WireIdentity, WireVisual } from '../types/circuit'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { moduleLocalToWorld, worldToModuleLocal } from '../electrical/modulePose'
import { copyControlPoint } from './wireVisual'

export interface WireRouteEndpoint { endpoint: string; position: Point3; contactModuleId?: string }
export interface WireRouteContext { endpoint(value: string): WireRouteEndpoint | null; modulePose(id: string): CircuitModule | null }
export interface RouteHandle { index: number; position: Point3 }
export interface RouteSegment { index: number; start: Point3; end: Point3; fromHandle: number | null; toHandle: number | null; editable: boolean }
export interface SolvedWireRoute { points: Point3[]; handles: RouteHandle[]; segments: RouteSegment[]; frameModuleId: string | null; materializedControlPoints: WireControlPoint[] }
export const finitePoint = (point: Point3) => [point.x, point.y, point.z].every(Number.isFinite)
export const pointDistance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
export function controlPointWorld(point: WireControlPoint, context: WireRouteContext): Point3 | null {
  if (point.space === 'world') return { ...point.position }
  const module = context.modulePose(point.moduleId)
  return module ? moduleLocalToWorld(point.position, module) : null
}
export function ownedPoint(world: Point3, moduleId: string | null, context: WireRouteContext): WireControlPoint {
  const module = moduleId && context.modulePose(moduleId)
  return module ? { space: 'module', moduleId: module.id, position: worldToModuleLocal(world, module) } : { space: 'world', position: { ...world } }
}
export function wireClearance(visual: WireVisual): number { return Math.max(visual.height ?? .03, visual.thickness / 2 + .006) + (visual.layer ?? 0) * (visual.thickness + .012) }
export function snapWirePoint(point: Point3, module: CircuitModule | null, snap: boolean, bypass: boolean): WireControlPoint {
  const topology = module && getBreadboardTopology(module.type)
  const local = topology && module ? worldToModuleLocal(point, module) : { ...point }
  if (snap && !bypass) {
    const pitch = topology?.pitch ?? .065, origin = topology?.contacts[0].localPosition ?? [0, 0, 0]
    local.x = Math.round(((local.x - origin[0]) / pitch)) * pitch + origin[0]
    local.z = Math.round(((local.z - origin[2]) / pitch)) * pitch + origin[2]
    local.x = Math.round(local.x * 1e9) / 1e9; local.z = Math.round(local.z * 1e9) / 1e9
  }
  return topology && module ? { space: 'module', moduleId: module.id, position: local } : { space: 'world', position: local }
}

export function solveWireRoute(wire: WireIdentity, visual: WireVisual, context: WireRouteContext): SolvedWireRoute | null {
  const a = context.endpoint(wire.source), b = context.endpoint(wire.destination)
  if (!a || !b || !finitePoint(a.position) || !finitePoint(b.position)) return null
  const support = visual.controlPoints.find(p => p.space === 'module' && getBreadboardTopology(context.modulePose(p.moduleId)?.type ?? ''))
  const frameModuleId = a.contactModuleId ?? b.contactModuleId ?? (visual.frameModuleId !== undefined ? visual.frameModuleId : support?.space === 'module' ? support.moduleId : null)
  const frame = frameModuleId ? context.modulePose(frameModuleId) : null
  const toLocal = (p: Point3) => frame ? worldToModuleLocal(p, frame) : { ...p }
  const toWorld = (p: Point3) => frame ? moduleLocalToWorld(p, frame) : { ...p }
  const lead = (endpoint: WireRouteEndpoint): Point3 => {
    const module = endpoint.contactModuleId && context.modulePose(endpoint.contactModuleId)
    const board = module && getBreadboardTopology(module.type)
    return board && module ? { ...endpoint.position, y: (module.position?.y ?? 0) + board.deckHeight + wireClearance(visual) } : { ...endpoint.position }
  }
  const start = lead(a), end = lead(b)
  const anchors: { position: Point3; owner: WireControlPoint | null }[] = [{ position: start, owner: null }]
  for (const raw of visual.controlPoints) {
    const point = copyControlPoint(raw)
    if (point.space === 'module') {
      const board = getBreadboardTopology(context.modulePose(point.moduleId)?.type ?? '')
      if (board) point.position.y = Math.max(point.position.y, board.deckHeight + wireClearance(visual))
    }
    const world = controlPointWorld(point, context)
    if (!world || !finitePoint(world)) return null
    anchors.push({ position: world, owner: point })
  }
  anchors.push({ position: end, owner: null })
  const orthogonal = visual.routeMode === 'ORTHOGONAL' || visual.routeMode === 'AUTO' && !!frame
  const routed: typeof anchors = [anchors[0]]
  let axis: 'x' | 'z' = 'x'
  for (const next of anchors.slice(1)) {
    const previous = toLocal(routed.at(-1)!.position), target = toLocal(next.position)
    if (orthogonal) {
      if (Math.abs(previous.y - target.y) > 1e-8) {
        const step = toWorld({ ...previous, y: target.y })
        routed.push({ position: step, owner: ownedPoint(step, frameModuleId, context) }); previous.y = target.y
      }
      if (Math.abs(previous.x - target.x) > 1e-8 && Math.abs(previous.z - target.z) > 1e-8) {
        const elbow = toWorld(axis === 'x' ? { x: target.x, y: target.y, z: previous.z } : { x: previous.x, y: target.y, z: target.z })
        routed.push({ position: elbow, owner: ownedPoint(elbow, frameModuleId, context) })
      }
    }
    const last = toLocal(routed.at(-1)!.position)
    if (Math.abs(last.x - target.x) > 1e-8) axis = 'x'
    else if (Math.abs(last.z - target.z) > 1e-8) axis = 'z'
    routed.push(next)
  }
  const points: Point3[] = [], indices: (number | null)[] = [], materializedControlPoints: WireControlPoint[] = []
  const push = (position: Point3, owner: WireControlPoint | null) => {
    if (points.length && pointDistance(points.at(-1)!, position) < 1e-8) return
    indices.push(owner ? materializedControlPoints.length : null)
    if (owner) materializedControlPoints.push(copyControlPoint(owner))
    points.push({ ...position })
  }
  push(a.position, null)
  routed.forEach((p, i) => push(p.position, i > 0 && i < routed.length - 1 && pointDistance(p.position, start) > 1e-8 && pointDistance(p.position, end) > 1e-8 ? p.owner ?? ownedPoint(p.position, frameModuleId, context) : null))
  push(b.position, null)
  if (points.length < 2 || !points.every(finitePoint)) return null
  const handles: RouteHandle[] = []
  points.forEach((position, i) => { if (indices[i] !== null) handles.push({ index: indices[i]!, position }) })
  const segments = points.slice(0, -1).map((start, index): RouteSegment => ({ index, start, end: points[index + 1], fromHandle: indices[index], toHandle: indices[index + 1], editable: !(index === 0 && a.contactModuleId) && !(index === points.length - 2 && b.contactModuleId) }))
  return { points, handles, segments, frameModuleId, materializedControlPoints }
}
