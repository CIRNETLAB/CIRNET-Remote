import { BufferGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three'
import type { Point3 } from '../types/circuit'
import { WIRE_RADIAL_SEGMENTS } from '../wires/wireAppearance'
import { type LeadPath } from '../electrical/leadPath'
import { wireCenterline } from '../wires/wireCenterline'
export { wireCenterline } from '../wires/wireCenterline'

interface CurveSample { point: Vector3; tangent: Vector3 }
export interface WireGeometryOptions { caps?: boolean; capHoleRadius?: number; path?: LeadPath }

export function cleanWirePoints(points: Point3[]): Vector3[] {
  const result: Vector3[] = []
  for (const point of points) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Wire geometry requires finite points.')
    const p = new Vector3(point.x, point.y, point.z)
    if (result.at(-1)?.distanceToSquared(p)! <= 1e-10) continue
    while (result.length > 1) {
      const a = result.at(-1)!.clone().sub(result.at(-2)!), b = p.clone().sub(result.at(-1)!)
      // Render-only angular tolerance (~.0006 degrees): thinner arcs collapse
      // below Float32 precision at normal board coordinates. Saved user anchors
      // remain untouched and can still be selected or moved.
      if (a.dot(b) <= 0 || a.clone().cross(b).lengthSq() > a.lengthSq() * b.lengthSq() * 1e-10) break
      result.pop()
    }
    result.push(p)
  }
  return result
}

function curveSamples(path: LeadPath): CurveSample[] {
  const result: CurveSample[] = []
  const add = (point: {x:number;y:number;z:number}, tangent: Vector3) => {
    const p = new Vector3(point.x, point.y, point.z)
    if (result.at(-1)?.point.distanceToSquared(p)! < 1e-18) return
    result.push({ point: p, tangent: tangent.normalize() })
  }
  for (const segment of path.segments) {
    if (segment.kind === 'line') {
      const tangent = new Vector3(segment.end.x-segment.start.x,segment.end.y-segment.start.y,segment.end.z-segment.start.z)
      add(segment.start,tangent.clone()); add(segment.end,tangent.clone()); continue
    }
    const center = new Vector3(segment.center.x,segment.center.y,segment.center.z), axis = new Vector3(segment.axis.x,segment.axis.y,segment.axis.z)
    const radial = new Vector3(segment.start.x,segment.start.y,segment.start.z).sub(center)
    const steps = Math.max(1, Math.ceil(segment.angle / (Math.PI / 36)))
    for(let i=0;i<=steps;i++){const r=radial.clone().applyAxisAngle(axis,segment.angle*i/steps);add(r.clone().add(center),axis.clone().cross(r))}
  }
  return result
}

export function roundedWirePoints(points: Point3[], minimumRadius = 0): Vector3[] {
  const result: Vector3[] = []
  for (const sample of curveSamples(wireCenterline(points, minimumRadius * 2))) {
    if (!result.at(-1)?.equals(sample.point)) result.push(sample.point)
  }
  return result
}

export interface WireHeightRange { min: number; max: number }
export interface WireEnvelopeSegment extends WireHeightRange { start: Point3; end: Point3; radius: number; verticalRadius: number }
export function wireGeometryEnvelope(points: Point3[], diameter: number): WireEnvelopeSegment[] {
  const radius = diameter / 2, sections = [curveSamples(wireCenterline(points, diameter))]
  const result: WireEnvelopeSegment[] = []
  for (const section of sections) for (let i = 1; i < section.length; i++) {
    const a = section[i - 1], b = section[i], tangent = b.point.clone().sub(a.point).normalize()
    const horizontal = (value: Vector3) => Math.sqrt(Math.max(0, 1 - value.y ** 2))
    const aExtent = radius * horizontal(a.tangent), bExtent = radius * horizontal(b.tangent)
    const leastHorizontal = Math.min(horizontal(a.tangent), horizontal(b.tangent), horizontal(tangent))
    result.push({ start: a.point, end: b.point, radius,
      min: Math.min(a.point.y - aExtent, b.point.y - bExtent), max: Math.max(a.point.y + aExtent, b.point.y + bExtent),
      // At fixed XZ a tilted cylinder has r / cos(slope) height support.
      // Vertical runs use their finite end-cap bounds, never an infinite stem.
      verticalRadius: leastHorizontal > 1e-8 ? radius / leastHorizontal : Infinity })
  }
  return result
}

export function buildWireGeometry<T extends { points: Point3[] }>(route: T, diameter: number, options: WireGeometryOptions = {}): BufferGeometry {
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Wire diameter must be finite and positive.')
  const radius = diameter / 2, sections = [curveSamples(options.path ?? wireCenterline(route.points, diameter))]
  const sides = WIRE_RADIAL_SEGMENTS, positions: number[] = [], normals: number[] = [], indices: number[] = []
  const vertex = (point: Vector3, normal: Vector3) => { const index = positions.length / 3; positions.push(...point.toArray()); normals.push(...normal.toArray()); return index }
  const cap = (sample: CurveSample, normal: Vector3, binormal: Vector3, radius: number, start: boolean, hole: number) => {
    const faceNormal = sample.tangent.clone().multiplyScalar(start ? -1 : 1), outer: number[] = [], inner: number[] = []
    const innerRadius = Math.min(hole, radius * .95)
    for (let side = 0; side < sides; side++) {
      const angle = side * Math.PI * 2 / sides, n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle))
      outer.push(vertex(sample.point.clone().addScaledVector(n, radius), faceNormal))
      if (innerRadius > 0) inner.push(vertex(sample.point.clone().addScaledVector(n, innerRadius), faceNormal))
    }
    const center = innerRadius > 0 ? -1 : vertex(sample.point, faceNormal)
    for (let side = 0; side < sides; side++) {
      const next = (side + 1) % sides
      if (center >= 0) indices.push(...(start ? [outer[side], center, outer[next]] : [outer[side], outer[next], center]))
      else indices.push(...(start ? [outer[side], inner[side], outer[next], outer[next], inner[side], inner[next]] : [outer[side], outer[next], inner[side], outer[next], inner[next], inner[side]]))
    }
  }
  for (const [sectionIndex, samples] of sections.entries()) {
    let previousNormal: Vector3 | null = null, previousTangent: Vector3 | null = null, previousRing = 0
    const rotation = new Quaternion()
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i], tangent = sample.tangent
      let normal: Vector3
      if (previousNormal && previousTangent) normal = previousNormal.clone().applyQuaternion(rotation.setFromUnitVectors(previousTangent, tangent))
      else normal = new Vector3(Math.abs(tangent.y) < .9 ? 0 : 1, Math.abs(tangent.y) < .9 ? 1 : 0, 0).cross(tangent)
      normal.addScaledVector(tangent, -normal.dot(tangent)).normalize()
      const binormal = tangent.clone().cross(normal).normalize(), ring = positions.length / 3
      for (let side = 0; side < sides; side++) {
        const angle = side * Math.PI * 2 / sides, n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle))
        vertex(sample.point.clone().addScaledVector(n, radius), n)
        if (i) { const a = previousRing + side, b = previousRing + (side + 1) % sides, c = ring + side, d = ring + (side + 1) % sides; indices.push(a, b, c, b, d, c) }
      }
      if (options.caps !== false && (i === 0 || i === samples.length - 1)) {
        const outerEnd = i === 0 ? sectionIndex === 0 : sectionIndex === sections.length - 1
        cap(sample, normal, binormal, radius, i === 0, outerEnd ? options.capHoleRadius ?? 0 : 0)
      }
      previousRing = ring; previousNormal = normal; previousTangent = tangent
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3)); geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
