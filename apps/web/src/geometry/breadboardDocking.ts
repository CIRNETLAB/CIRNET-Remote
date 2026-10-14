import type { CircuitModule } from '../types/circuit'
import { BREADBOARD_GEOMETRY as g, getBreadboardGeometrySpec, type BreadboardDockingProfile, type BreadboardGeometrySpec, type ProfilePoint } from './BreadboardGeometrySpec'

interface Bounds { minX: number; maxX: number; minZ: number; maxZ: number }
interface Triangle { points: ProfilePoint[]; bounds: Bounds }
interface Frame { position: { x: number; y: number; z: number }; c: number; s: number }
interface Pose extends Frame { module: CircuitModule; spec: BreadboardGeometrySpec; outline: ProfilePoint[]; triangles: Triangle[] | null; bounds: Bounds }
const poseCache = new WeakMap<CircuitModule, { signature: string; pose: Pose }>()
const dot = (a: ProfilePoint, b: ProfilePoint) => a.x * b.x + a.z * b.z
const rotate = (p: ProfilePoint, pose: Frame): ProfilePoint => ({ x: pose.c * p.x + pose.s * p.z, z: -pose.s * p.x + pose.c * p.z })
const world = (p: ProfilePoint, pose: Frame): ProfilePoint => { const q = rotate(p, pose); return { x: q.x + pose.position.x, z: q.z + pose.position.z } }
const bounds = (points: readonly ProfilePoint[]): Bounds => ({ minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) })
const boundsOverlap = (a: Bounds, b: Bounds) => a.maxX > b.minX + g.collisionTolerance && b.maxX > a.minX + g.collisionTolerance && a.maxZ > b.minZ + g.collisionTolerance && b.maxZ > a.minZ + g.collisionTolerance
const projection = (points: readonly ProfilePoint[], axis: ProfilePoint) => { const values = points.map(p => dot(p, axis)); return { min: Math.min(...values), max: Math.max(...values) } }

function pose(module: CircuitModule): Pose | null {
  const spec = getBreadboardGeometrySpec(module.type)
  if (!spec) return null
  const signature = [module.type, module.rotation ?? 0, module.position?.x ?? 0, module.position?.y ?? 0, module.position?.z ?? 0].join('|')
  const cached = poseCache.get(module)
  if (cached?.signature === signature) return cached.pose
  const angle = ((module.rotation ?? 0) % 360) * Math.PI / 180
  const result = { module, spec, position: { x: module.position?.x ?? 0, y: module.position?.y ?? 0, z: module.position?.z ?? 0 }, c: Math.cos(angle), s: Math.sin(angle) } as Pose
  result.outline = spec.outline.map(p => world(p, result)); result.bounds = bounds(result.outline)
  result.triangles = null
  poseCache.set(module, { signature, pose: result })
  return result
}
const triangles = (p: Pose) => p.triangles ??= p.spec.triangles.map(indices => { const points = indices.map(i => p.outline[i]); return { points, bounds: bounds(points) } })
function heightOverlaps(a: Pose, b: Pose) {
  const min = g.baseY - g.bevelThickness
  return a.position.y + a.spec.size[1] + g.artworkOffset > b.position.y + min + g.collisionTolerance && b.position.y + b.spec.size[1] + g.artworkOffset > a.position.y + min + g.collisionTolerance
}
function trianglesOverlap(a: Triangle, b: Triangle) {
  if (!boundsOverlap(a.bounds, b.bounds)) return false
  for (const triangle of [a, b]) for (let i = 0; i < 3; i++) {
    const p = triangle.points[i], q = triangle.points[(i + 1) % 3], length = Math.hypot(q.x - p.x, q.z - p.z)
    if (length < 1e-12) continue
    const axis = { x: (p.z - q.z) / length, z: (q.x - p.x) / length }, pa = projection(a.points, axis), pb = projection(b.points, axis)
    if (pa.max <= pb.min + g.collisionTolerance || pb.max <= pa.min + g.collisionTolerance) return false
  }
  return true
}
function overlaps(a: Pose, b: Pose) {
  if (!heightOverlaps(a, b) || !boundsOverlap(a.bounds, b.bounds)) return false
  return triangles(a).some(first => triangles(b).some(second => trianglesOverlap(first, second)))
}
export function breadboardBodiesOverlap(a: CircuitModule, b: CircuitModule): boolean {
  const first = pose(a), second = pose(b)
  return !!first && !!second && overlaps(first, second)
}
function compatible(a: Frame, sideA: BreadboardDockingProfile, b: Frame, sideB: BreadboardDockingProfile) {
  return Math.abs(a.position.y - b.position.y) <= g.poseTolerance && sideA.joint.kind !== sideB.joint.kind && sideA.joint.family === sideB.joint.family && dot(rotate(sideA.normal, a), rotate(sideB.normal, b)) < -1 + 1e-10
}
function mating(a: Frame, sideA: BreadboardDockingProfile, b: Frame, sideB: BreadboardDockingProfile) {
  if (!compatible(a, sideA, b, sideB)) return false
  const pa = world(sideA.matingPlane, a), pb = world(sideB.matingPlane, b)
  if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > g.poseTolerance) return false
  // Every key must meet a slot; an aligned world AABB says nothing about that.
  const keys = (owner: Frame, side: BreadboardDockingProfile) => side.joint.centers.map(center => world({ x: side.matingPlane.x + side.tangent.x * center, z: side.matingPlane.z + side.tangent.z * center }, owner))
  const ka = keys(a, sideA), kb = keys(b, sideB)
  return ka.length === kb.length && ka.every(key => kb.some(slot => Math.hypot(key.x - slot.x, key.z - slot.z) <= g.poseTolerance))
}
export function isMechanicalBreadboardDock(a: CircuitModule, b: CircuitModule): boolean {
  const first = pose(a), second = pose(b)
  return !!first && !!second && first.spec.sides.some(sa => second.spec.sides.some(sb => mating(first, sa, second, sb))) && !overlaps(first, second)
}

// No graph mutation: the caller still commits a world-space pose once per action.
export function snapBreadboardPosition(point: ProfilePoint, base: ProfilePoint, modules: CircuitModule[], type: string, activeId: string | null | undefined, elevation: number, rotation: number, axis?: 'x' | 'z'): { x: number; y: number; z: number; docked: boolean } {
  const active = pose({ id: activeId ?? 'PLACE', type, rotation, position: { ...point, y: elevation } })!
  const others = modules.filter(m => m.id !== activeId).map(pose).filter((p): p is Pose => !!p && heightOverlaps(active, p))
  const at = (p: ProfilePoint) => pose({ ...active.module, position: { ...p, y: elevation } })!
  const allowed = (p: ProfilePoint) => !axis || Math.abs(p[axis === 'x' ? 'z' : 'x'] - point[axis === 'x' ? 'z' : 'x']) <= g.poseTolerance
  const clear = (p: ProfilePoint) => { const moved = at(p); return others.every(other => !overlaps(moved, other)) }
  const distance = (p: ProfilePoint) => Math.hypot(p.x - point.x, p.z - point.z)
  const candidates: { position: ProfilePoint; normal: ProfilePoint; tangent: ProfilePoint; tangentCapture: number; other: Pose; side: BreadboardDockingProfile; incoming: BreadboardDockingProfile }[] = []
  for (const other of others) for (const side of other.spec.sides) for (const incoming of active.spec.sides) {
    if (!compatible(other, side, active, incoming)) continue
    const plane = world(side.matingPlane, other), offset = rotate(incoming.matingPlane, active)
    const position = { x: plane.x - offset.x, z: plane.z - offset.z }
    if (!allowed(position)) continue
    const normal = rotate(side.normal, other)
    if (axis) {
      const locked = axis === 'x' ? 'z' : 'x'
      if (Math.abs(normal[axis]) < 1e-10) continue
      // Slide along the mating plane while keeping the user's transverse coordinate.
      position[axis] -= normal[locked] * (point[locked] - position[locked]) / normal[axis]
      position[locked] = point[locked]
    }
    candidates.push({ position, normal, tangent: rotate(side.tangent, other), tangentCapture: side.joint.family === 'strip' ? g.captureStripTangent : g.captureEndTangent, other, side, incoming })
  }
  const matches = (candidate: typeof candidates[number]) => mating(candidate.other, candidate.side, { c: active.c, s: active.s, position: { ...candidate.position, y: elevation } }, candidate.incoming)
  const near = candidates.filter(candidate => {
    const delta = { x: point.x - candidate.position.x, z: point.z - candidate.position.z }
    return Math.abs(dot(delta, candidate.normal)) <= g.captureNormal && Math.abs(dot(delta, candidate.tangent)) <= candidate.tangentCapture
  }).sort((a, b) => distance(a.position) - distance(b.position))
  const dock = near.find(candidate => matches(candidate) && clear(candidate.position))
  if (dock) return { ...dock.position, y: elevation, docked: true }
  if (clear(base)) return { ...base, y: elevation, docked: false }

  // Resolve true intersections using the actual contour projections. AABB is
  // only the narrow-phase early-out above; it never supplies a mating position.
  const current = at(base), collided = others.filter(other => overlaps(current, other)), matingPositions = candidates.filter(matches).map(c => c.position), escapes: ProfilePoint[] = [...matingPositions]
  const axes = axis ? [{ x: axis === 'x' ? 1 : 0, z: axis === 'z' ? 1 : 0 }] : [
    rotate({ x: 1, z: 0 }, active), rotate({ x: 0, z: 1 }, active),
    ...collided.flatMap(other => [rotate({ x: 1, z: 0 }, other), rotate({ x: 0, z: 1 }, other)]),
  ]
  for (const direction of axes) {
    const pa = projection(current.outline, direction), projections = others.map(other => projection(other.outline, direction))
    for (const pb of [...collided.map(other => projection(other.outline, direction)), { min: Math.min(...projections.map(p => p.min)), max: Math.max(...projections.map(p => p.max)) }]) {
      for (const delta of [pb.max - pa.min + g.poseTolerance, pb.min - pa.max - g.poseTolerance]) escapes.push({ x: base.x + direction.x * delta, z: base.z + direction.z * delta })
    }
  }
  const safe = escapes.filter(allowed).sort((a, b) => distance(a) - distance(b)).find(clear)
  return { ...(safe ?? base), y: elevation, docked: !!safe && matingPositions.includes(safe) }
}
