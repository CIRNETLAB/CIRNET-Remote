import type { CircuitModule, Point3, WireControlPoint, WireIdentity, WireVisual } from '../types/circuit'
import { getBreadboardContact, getBreadboardTopology } from '../electrical/BreadboardTopology'
import { moduleLocalToWorld, worldToModuleLocal } from '../electrical/modulePose'
import { copyControlPoint } from './wireVisual'
import { renderWireDiameter, WIRE_SURFACE_CLEARANCE, WIRE_CORNER_RADIUS, COPPER_RADIUS_RATIO } from './wireAppearance'
import { BREADBOARD_MECHANICAL_PROFILE, insertionContinuation } from '../geometry/BreadboardMechanicalProfile'
import { MM_TO_WORLD } from '../data/partCatalog'
import { wireCenterline } from './wireCenterline'

export interface WireRouteEndpoint { endpoint: string; position: Point3; contactModuleId?: string }
export interface WireRouteContext { endpoint(value: string): WireRouteEndpoint | null; modulePose(id: string): CircuitModule | null }
export type RoutePointKind = 'ENDPOINT' | 'TERMINAL_LEAD' | 'USER_ANCHOR' | 'GENERATED_ELBOW'
export interface SemanticRoutePoint { position: Point3; kind: RoutePointKind; userIndex: number | null }
export interface RouteHandle { index: number; position: Point3 }
export interface RouteSegment {
  index: number; start: Point3; end: Point3; fromHandle: number | null; toHandle: number | null; editable: boolean
  beforeUserIndex: number | null; afterUserIndex: number | null; insertIndex: number
}
export interface SolvedWireRoute {
  points: Point3[]; semanticPoints: SemanticRoutePoint[]; handles: RouteHandle[]; segments: RouteSegment[]
  frameModuleId: string | null; orthogonal: boolean
  terminalLeads: { source: Point3 | null; destination: Point3 | null }
  contactPitch?: { source: number | null; destination: number | null }
  contactDeckY?: { source: number | null; destination: number | null }
  canonicalForward?: boolean
  renderPoints?: Point3[]
  renderHandles?: RouteHandle[]
  renderSegments?: (RouteSegment & { baseStart: Point3; baseEnd: Point3 })[]
}
export const finitePoint = (point: Point3) => [point.x, point.y, point.z].every(Number.isFinite)
export const pointDistance = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
export function controlPointWorld(point: WireControlPoint, context: WireRouteContext): Point3 | null {
  if (point.space === 'world') return { ...point.position }
  const module = context.modulePose(point.moduleId)
  return module ? moduleLocalToWorld(point.position, module) : null
}
export function ownedPoint(world: Point3, moduleId: string | null, context: WireRouteContext): WireControlPoint {
  const module = moduleId && context.modulePose(moduleId)
  return module ? { space: 'module', moduleId: module.id, position: { ...worldToModuleLocal(world, module) } } : { space: 'world', position: { ...world } }
}
export function wireBaseClearance(visual: WireVisual): number { return renderWireDiameter(visual) / 2 + WIRE_SURFACE_CLEARANCE }
export function wireClearance(visual: WireVisual): number { return wireBaseClearance(visual) }
export function snapWirePoint(point: Point3, module: CircuitModule | null, snap: boolean, bypass: boolean): WireControlPoint {
  const topology = module && getBreadboardTopology(module.type)
  const local = topology && module ? worldToModuleLocal(point, module) : { ...point }
  if (snap && !bypass) {
    const pitch = topology ? topology.pitch / 4 : .065, origin = topology?.contacts[0].localPosition ?? [0, 0, 0]
    local.x = Math.round(((local.x - origin[0]) / pitch)) * pitch + origin[0]
    local.z = Math.round(((local.z - origin[2]) / pitch)) * pitch + origin[2]
    local.x = Math.round(local.x * 1e9) / 1e9; local.z = Math.round(local.z * 1e9) / 1e9
  }
  return topology && module ? { space: 'module', moduleId: module.id, position: { ...local } } : { space: 'world', position: { ...local } }
}

export function endpointLeadPosition(endpoint: WireRouteEndpoint, visual: WireVisual, context: WireRouteContext): Point3 {
  const module = endpoint.contactModuleId && context.modulePose(endpoint.contactModuleId)
  const board = module && getBreadboardTopology(module.type)
  return board && module ? { ...endpoint.position, y: (module.position?.y ?? 0) + board.deckHeight + BREADBOARD_MECHANICAL_PROFILE.insulationClearanceMm * MM_TO_WORLD + Math.max(WIRE_CORNER_RADIUS, renderWireDiameter(visual)/2 + .1*MM_TO_WORLD) } : { ...endpoint.position }
}

export function solveWireRoute(wire: WireIdentity, visual: WireVisual, context: WireRouteContext): SolvedWireRoute | null {
  const a = context.endpoint(wire.source), b = context.endpoint(wire.destination)
  if (!a || !b || !finitePoint(a.position) || !finitePoint(b.position)) return null
  const support = visual.controlPoints.find(p => p.space === 'module' && getBreadboardTopology(context.modulePose(p.moduleId)?.type ?? ''))
  const frameModuleId = visual.frameModuleId !== undefined ? visual.frameModuleId : a.contactModuleId ?? b.contactModuleId ?? (support?.space === 'module' ? support.moduleId : null)
  const frame = frameModuleId ? context.modulePose(frameModuleId) : null
  const toLocal = (p: Point3) => frame ? worldToModuleLocal(p, frame) : { ...p }
  const toWorld = (p: Point3) => frame ? moduleLocalToWorld(p, frame) : { ...p }
  const start = endpointLeadPosition(a, visual, context), end = endpointLeadPosition(b, visual, context)
  // Reserve the fillets before producing a sweep. A short automatic span uses
  // one raised diagonal bridge instead of two elbows with overlapping budgets.
  const shortAutomatic = visual.controlPoints.length === 0 && !!a.contactModuleId && !!b.contactModuleId && Math.hypot(start.x-end.x,start.z-end.z) < WIRE_CORNER_RADIUS*4
  if (shortAutomatic) { const height=Math.max(start.y,end.y);start.y=height;end.y=height }
  const anchors: SemanticRoutePoint[] = [{ position: start, kind: a.contactModuleId ? 'TERMINAL_LEAD' : 'ENDPOINT', userIndex: null }]
  const handles: RouteHandle[] = []
  for (const [index, raw] of visual.controlPoints.entries()) {
    const point = copyControlPoint(raw)
    if (point.space === 'module') {
      const board = getBreadboardTopology(context.modulePose(point.moduleId)?.type ?? '')
      if (board) point.position.y = Math.max(point.position.y, board.deckHeight + wireBaseClearance(visual))
    }
    const world = controlPointWorld(point, context)
    if (!world || !finitePoint(world)) return null
    anchors.push({ position: world, kind: 'USER_ANCHOR', userIndex: index }); handles.push({ index, position: { ...world } })
  }
  anchors.push({ position: end, kind: b.contactModuleId ? 'TERMINAL_LEAD' : 'ENDPOINT', userIndex: null })
  const orthogonal = visual.routeMode === 'ORTHOGONAL' || visual.routeMode === 'AUTO' && !!frame
  const semanticPoints: SemanticRoutePoint[] = [], segments: RouteSegment[] = []
  const append = (point: SemanticRoutePoint, beforeUserIndex: number | null, afterUserIndex: number | null, insertIndex: number, editable = true) => {
    const previous = semanticPoints.at(-1)
    if (previous && pointDistance(previous.position, point.position) < 1e-8) {
      if (point.kind === 'USER_ANCHOR' || point.kind === 'ENDPOINT') {
        semanticPoints[semanticPoints.length - 1] = point
        if (segments.length && point.kind === 'USER_ANCHOR') segments.at(-1)!.toHandle = point.userIndex
      }
      return
    }
    if (previous) segments.push({ index: segments.length, start: previous.position, end: point.position,
      fromHandle: previous.kind === 'USER_ANCHOR' ? previous.userIndex : null, toHandle: point.kind === 'USER_ANCHOR' ? point.userIndex : null,
      beforeUserIndex, afterUserIndex, insertIndex, editable })
    semanticPoints.push(point)
  }
  append({ position: { ...a.position }, kind: 'ENDPOINT', userIndex: null }, null, null, 0, false)
  append(anchors[0], null, null, 0, false)
  for (let i = 1; i < anchors.length; i++) {
    const previous = anchors[i - 1], next = anchors[i], from = toLocal(previous.position), to = toLocal(next.position)
    const insertIndex = next.userIndex ?? visual.controlPoints.length
    const derived: Point3[] = []
    if (orthogonal && !shortAutomatic) {
      // Derive each span in a canonical geometric direction, then reverse it
      // if needed. Reversing electrical endpoints cannot flip the preview shape.
      // Match the axis-equality tolerance below: module/world round trips must
      // not flip an aligned span's elbow order when its board rotates.
      const order = [from.x - to.x, from.z - to.z, from.y - to.y].find(delta => Math.abs(delta) > 1e-8) ?? 0
      const reversed = order > 0
      const first = reversed ? to : from, last = reversed ? from : to
      const terminalApproach = previous.kind === 'TERMINAL_LEAD' || next.kind === 'TERMINAL_LEAD'
      const step = { ...first, y: last.y }
      // A socket approach may slope towards a lower manual knot. A generated
      // vertical step directly after its normal lead would reverse through the
      // incoming stem; it has no valid circular fillet at any radius.
      if (!terminalApproach && Math.abs(first.y - last.y) > 1e-8) derived.push(step)
      if (Math.abs(first.x - last.x) > 1e-8 && Math.abs(first.z - last.z) > 1e-8) {
        const preferred={x:last.x,y:last.y,z:first.z},alternative={x:first.x,y:first.y,z:last.z}
        const before=toLocal(i>1?anchors[i-2].position:a.position),after=toLocal(i+1<anchors.length?anchors[i+1].position:b.position)
        const delta=(a:Point3,b:Point3)=>({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z})
        const score=(corner:Point3)=>{
          const vectors=[delta(before,from),delta(from,corner),delta(corner,to),delta(to,after)].filter(vector=>Math.hypot(vector.x,vector.y,vector.z)>1e-8)
          return Math.min(...vectors.slice(1).map((v,index)=>{const u=vectors[index];return(u.x*v.x+u.y*v.y+u.z*v.z)/(Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z))}))
        }
        // Generated L orientation may change to avoid reversing into the next
        // real user knot. Both saved knots retain their original identities.
        derived.push(score(alternative)>score(preferred)+1e-8?alternative:preferred)
      }
      if (reversed) derived.reverse()
    }
    for (const p of derived) append({ position: toWorld(p), kind: 'GENERATED_ELBOW', userIndex: null }, previous.userIndex, next.userIndex, insertIndex)
    append(next, previous.userIndex, next.userIndex, insertIndex)
  }
  append({ position: { ...b.position }, kind: 'ENDPOINT', userIndex: null }, null, null, visual.controlPoints.length, false)
  const points = semanticPoints.map(p => p.position)
  if (points.length < 2 || !points.every(finitePoint)) return null
  const pitch = (endpoint: WireRouteEndpoint) => endpoint.contactModuleId ? getBreadboardTopology(context.modulePose(endpoint.contactModuleId)?.type ?? '')?.pitch ?? null : null
  const deck = (endpoint: WireRouteEndpoint) => { const module = endpoint.contactModuleId && context.modulePose(endpoint.contactModuleId); return module ? (module.position?.y ?? 0) + getBreadboardTopology(module.type)!.deckHeight : null }
  const exposure = (endpoint: WireRouteEndpoint) => { const height = deck(endpoint); return height === null ? 0 : height + BREADBOARD_MECHANICAL_PROFILE.insulationClearanceMm * MM_TO_WORLD - endpoint.position.y }
  try {
    wireCenterline(points, renderWireDiameter(visual), { start: Math.max(0,exposure(a)), end: Math.max(0,exposure(b)) })
    for(const endpoint of [a,b]){
      const board=endpoint.contactModuleId&&context.modulePose(endpoint.contactModuleId),topology=board&&getBreadboardTopology(board.type)
      if(!board||!topology)continue
      const local=worldToModuleLocal(endpoint.position,board)
      const contact=getBreadboardContact(board.type,endpoint.endpoint.split('.contact:')[1]??'')??topology.contacts.find(contact=>Math.hypot(local.x-contact.localPosition[0],local.y-contact.localPosition[1],local.z-contact.localPosition[2])<1e-7)
      if(contact)insertionContinuation(board.type,contact.contactId,renderWireDiameter(visual)*COPPER_RADIUS_RATIO)
    }
  } catch { return null }
  const localStart = toLocal(start), localEnd = toLocal(end)
  const canonicalForward = ([localEnd.x - localStart.x, localEnd.z - localStart.z, localEnd.y - localStart.y].find(value => Math.abs(value) > 1e-8) ?? 0) >= 0
  return { points, semanticPoints, handles, segments, frameModuleId, orthogonal, canonicalForward, terminalLeads: { source: a.contactModuleId ? start : null, destination: b.contactModuleId ? end : null }, contactPitch: { source: pitch(a), destination: pitch(b) }, contactDeckY: { source: deck(a), destination: deck(b) } }
}
