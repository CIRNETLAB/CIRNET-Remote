import { BufferGeometry, Float32BufferAttribute, Quaternion, SphereGeometry, Vector3 } from 'three'
import type { Point3 } from '../types/circuit'
import { WIRE_CORNER_RADIUS, WIRE_RADIAL_SEGMENTS } from '../wires/wireAppearance'

interface CurveSample { point: Vector3; tangent: Vector3 }
interface WirePath { sections: CurveSample[][]; joints: Vector3[] }
export interface WireGeometryOptions { caps?: boolean; capHoleRadius?: number }

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

function curveSamples(points: Vector3[], minimumRadius = 0): WirePath {
  const sections: CurveSample[][] = [], joints: Vector3[] = []
  if (points.length < 2) return { sections, joints }
  let samples: CurveSample[] = [{ point: points[0], tangent: points[1].clone().sub(points[0]).normalize() }]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], before = points[i - 1].clone().sub(p), after = points[i + 1].clone().sub(p)
    const beforeLength = before.length(), afterLength = after.length()
    before.normalize(); after.normalize()
    const dot = Math.max(-1, Math.min(1, before.dot(after))), halfAngle = Math.acos(dot) / 2
    // Adjacent fillets reserve at least 10% of every interior straight run.
    const trim = Math.min(WIRE_CORNER_RADIUS / Math.tan(halfAngle), beforeLength * (i === 1 ? .9 : .45), afterLength * (i === points.length - 2 ? .9 : .45))
    const radius = trim * Math.tan(halfAngle)
    const angle = Math.PI - halfAngle * 2
    const floatSpacing = Math.max(1, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) * 2 ** -23 * 4
    if (dot > .999 || radius <= minimumRadius * 1.01 || (radius - minimumRadius) * angle < floatSpacing) {
      // A sweep with curvature below its cross-section radius folds inward.
      // Join two full-radius sweeps with a rounded capsule junction instead;
      // the short corner stays inside the radius-offset envelope of the path.
      samples.push({ point: p, tangent: before.clone().negate() }); sections.push(samples)
      samples = [{ point: p, tangent: after }]; joints.push(p)
      continue
    }
    const center = before.clone().add(after).normalize().multiplyScalar(radius / Math.sin(halfAngle)).add(p)
    const a = before.clone().multiplyScalar(trim).add(p), b = after.clone().multiplyScalar(trim).add(p)
    const radial = a.clone().sub(center), axis = radial.clone().cross(b.clone().sub(center)).normalize()
    const steps = Math.ceil(angle / (Math.PI / 18))
    samples.push({ point: a, tangent: before.clone().negate() })
    for (let j = 1; j <= steps; j++) {
      const r = radial.clone().applyAxisAngle(axis, angle * j / steps)
      samples.push({ point: r.clone().add(center), tangent: axis.clone().cross(r).normalize() })
    }
  }
  samples.push({ point: points.at(-1)!, tangent: points.at(-1)!.clone().sub(points.at(-2)!).normalize() }); sections.push(samples)
  return { sections, joints }
}

export function roundedWirePoints(points: Point3[], minimumRadius = 0): Vector3[] {
  const result: Vector3[] = []
  for (const sample of curveSamples(cleanWirePoints(points), minimumRadius).sections.flat()) {
    if (!result.at(-1)?.equals(sample.point)) result.push(sample.point)
  }
  return result
}

export interface WireHeightRange { min: number; max: number }
export interface WireEnvelopeSegment extends WireHeightRange { start: Point3; end: Point3; radius: number; verticalRadius: number }
export function wireGeometryEnvelope(points: Point3[], diameter: number): WireEnvelopeSegment[] {
  const radius = diameter / 2, { sections, joints } = curveSamples(cleanWirePoints(points), radius)
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
  for (const joint of joints) result.push({ start: joint, end: joint, radius, verticalRadius: Infinity, min: joint.y - radius, max: joint.y + radius })
  return result
}

// CPU-only unit template; no mesh/GPU resource is retained or allocated per bend.
const jointTemplate = (() => {
  const sphere = new SphereGeometry(1, WIRE_RADIAL_SEGMENTS, 8)
  const positions = Array.from(sphere.getAttribute('position').array), normals = Array.from(sphere.getAttribute('normal').array), indices = Array.from(sphere.index!.array)
  sphere.dispose(); return { positions, normals, indices }
})()

export function buildWireGeometry<T extends { points: Point3[] }>(route: T, diameter: number, options: WireGeometryOptions = {}): BufferGeometry {
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Wire diameter must be finite and positive.')
  const radius = diameter / 2, { sections, joints } = curveSamples(cleanWirePoints(route.points), radius)
  const sides = WIRE_RADIAL_SEGMENTS, positions: number[] = [], normals: number[] = [], indices: number[] = []
  const vertex = (point: Vector3, normal: Vector3) => { const index = positions.length / 3; positions.push(...point.toArray()); normals.push(...normal.toArray()); return index }
  const cap = (sample: CurveSample, normal: Vector3, binormal: Vector3, radius: number, start: boolean, hole: number) => {
    const faceNormal = sample.tangent.clone().multiplyScalar(start ? -1 : 1), outer: number[] = [], inner: number[] = []
    const innerRadius = Math.min(hole, radius * .8)
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
  for (const point of joints) {
    const start = positions.length / 3
    for (let i = 0; i < jointTemplate.positions.length; i += 3) {
      positions.push(point.x + jointTemplate.positions[i] * radius, point.y + jointTemplate.positions[i + 1] * radius, point.z + jointTemplate.positions[i + 2] * radius)
      normals.push(jointTemplate.normals[i], jointTemplate.normals[i + 1], jointTemplate.normals[i + 2])
    }
    indices.push(...jointTemplate.indices.map(index => index + start))
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3)); geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
