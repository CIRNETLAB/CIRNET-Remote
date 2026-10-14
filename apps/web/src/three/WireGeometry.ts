import { BufferGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three'
import type { Point3 } from '../types/circuit'
import { WIRE_CORNER_RADIUS, WIRE_RADIAL_SEGMENTS } from '../wires/wireAppearance'

interface CurveSample { point: Vector3; tangent: Vector3; radiusLimit: number }
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

function curveSamples(points: Vector3[], minimumRadius = 0): CurveSample[] {
  if (points.length < 2) return []
  const samples: CurveSample[] = [{ point: points[0], tangent: points[1].clone().sub(points[0]).normalize(), radiusLimit: Infinity }]
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], before = points[i - 1].clone().sub(p), after = points[i + 1].clone().sub(p)
    const beforeLength = before.length(), afterLength = after.length()
    before.normalize(); after.normalize()
    const dot = Math.max(-1, Math.min(1, before.dot(after))), halfAngle = Math.acos(dot) / 2
    // Forward shallow turns still need a bounded arc: a sharp full-radius ring
    // can fold on a sub-diameter run. Antiparallel returns are split beforehand.
    // Picking also calls this helper without splitting: retain a return vertex
    // directly instead of computing its zero-angle circular center (0 / 0).
    if (dot > .999) { samples.push({ point: p, tangent: after, radiusLimit: Infinity }); continue }
    // Adjacent fillets reserve at least 10% of every interior straight run.
    const trim = Math.min(WIRE_CORNER_RADIUS / Math.tan(halfAngle), beforeLength * (i === 1 ? .9 : .45), afterLength * (i === points.length - 2 ? .9 : .45))
    const radius = trim * Math.tan(halfAngle)
    if (radius < minimumRadius) { samples.push({ point: p, tangent: before.clone().negate().add(after).normalize(), radiusLimit: Infinity }); continue }
    const center = before.clone().add(after).normalize().multiplyScalar(radius / Math.sin(halfAngle)).add(p)
    const a = before.clone().multiplyScalar(trim).add(p), b = after.clone().multiplyScalar(trim).add(p)
    const radial = a.clone().sub(center), axis = radial.clone().cross(b.clone().sub(center)).normalize()
    const angle = Math.PI - halfAngle * 2, steps = Math.ceil(angle / (Math.PI / 18))
    // Tight corners taper locally instead of sweeping a tube larger than its
    // curvature radius. Long runs retain the configured insulation diameter.
    const radiusLimit = radius * .8
    samples.push({ point: a, tangent: before.clone().negate(), radiusLimit })
    for (let j = 1; j <= steps; j++) {
      const r = radial.clone().applyAxisAngle(axis, angle * j / steps)
      samples.push({ point: r.clone().add(center), tangent: axis.clone().cross(r).normalize(), radiusLimit })
    }
  }
  samples.push({ point: points.at(-1)!, tangent: points.at(-1)!.clone().sub(points.at(-2)!).normalize(), radiusLimit: Infinity })
  return samples
}

export function roundedWirePoints(points: Point3[], minimumRadius = 0): Vector3[] {
  return curveSamples(cleanWirePoints(points), minimumRadius).map(sample => sample.point)
}

function localRadiusTransitions(samples: CurveSample[], radius: number): CurveSample[] {
  const result: CurveSample[] = [], transition = radius * 1.2
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i]; result.push(a)
    const b = samples[i + 1]
    if (!b) continue
    const direction = b.point.clone().sub(a.point), length = direction.length()
    if (length <= transition * 2) continue
    direction.normalize()
    if (a.tangent.dot(direction) < 1 - 1e-6 || b.tangent.dot(direction) < 1 - 1e-6) continue
    // Keep taper local to a tight elbow. A long straight run must not inherit
    // the reduced diameter of its neighbor all the way across the breadboard.
    if (a.radiusLimit < radius) result.push({ point: a.point.clone().addScaledVector(direction, transition), tangent: direction, radiusLimit: Infinity })
    if (b.radiusLimit < radius) result.push({ point: b.point.clone().addScaledVector(direction, -transition), tangent: direction, radiusLimit: Infinity })
  }
  return result
}

export function buildWireGeometry<T extends { points: Point3[] }>(route: T, diameter: number, options: WireGeometryOptions = {}): BufferGeometry {
  if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Wire diameter must be finite and positive.')
  const points = cleanWirePoints(route.points), sections: Vector3[][] = []
  let section: Vector3[] = []
  for (let i = 0; i < points.length; i++) {
    section.push(points[i])
    if (i > 0 && i < points.length - 1 && points[i].clone().sub(points[i - 1]).normalize().dot(points[i + 1].clone().sub(points[i]).normalize()) < -.999) {
      // Preserve an intentional return in the path, but never connect a ring
      // through an antiparallel frame. Two closed sweeps meet at that vertex.
      sections.push(section); section = [points[i]]
    }
  }
  if (section.length > 1) sections.push(section)
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
  for (const [sectionIndex, path] of sections.entries()) {
    const samples = localRadiusTransitions(curveSamples(path), diameter / 2)
    let previousNormal: Vector3 | null = null, previousTangent: Vector3 | null = null, previousRing = 0
    const rotation = new Quaternion()
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i], tangent = sample.tangent, radius = Math.min(diameter / 2, sample.radiusLimit)
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
