import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import type { Point3 } from '../types/circuit'
import type { SolvedWireRoute } from '../wires/wireRouting'
import { WIRE_CORNER_RADIUS, WIRE_RADIAL_SEGMENTS } from '../wires/wireAppearance'

export function roundedWirePoints(points: Point3[], minimumRadius = 0): Vector3[] {
  if (!points.length) return []
  const result = [new Vector3(points[0].x, points[0].y, points[0].z)]
  for (let i = 1; i < points.length - 1; i++) {
    const p = new Vector3(points[i].x, points[i].y, points[i].z)
    const before = new Vector3(points[i - 1].x, points[i - 1].y, points[i - 1].z).sub(p)
    const after = new Vector3(points[i + 1].x, points[i + 1].y, points[i + 1].z).sub(p)
    const beforeLength = before.length(), afterLength = after.length()
    before.normalize(); after.normalize()
    const dot = Math.max(-1, Math.min(1, before.dot(after)))
    if (Math.min(beforeLength, afterLength) < 1e-8 || Math.abs(dot) > .999) { result.push(p); continue }
    const halfAngle = Math.acos(dot) / 2
    // Endpoint leads have only one corner, so can devote more of their length
    // to the elbow. Internal runs reserve space for both neighboring corners.
    const trim = Math.min(WIRE_CORNER_RADIUS / Math.tan(halfAngle), beforeLength * (i === 1 ? .9 : .45), afterLength * (i === points.length - 2 ? .9 : .45))
    const radius = trim * Math.tan(halfAngle)
    if (radius < minimumRadius) { result.push(p); continue }
    const center = before.clone().add(after).normalize().multiplyScalar(radius / Math.sin(halfAngle)).add(p)
    const a = before.clone().multiplyScalar(trim).add(p), b = after.clone().multiplyScalar(trim).add(p)
    const radial = a.clone().sub(center), axis = radial.clone().cross(b.clone().sub(center)).normalize()
    const angle = Math.PI - halfAngle * 2, steps = Math.ceil(angle / (Math.PI / 18))
    result.push(a)
    // A tangent circular fillet stays inside the corner; no spline overshoot.
    for (let j = 1; j <= steps; j++) result.push(radial.clone().applyAxisAngle(axis, angle * j / steps).add(center))
  }
  const last = points.at(-1)!
  result.push(new Vector3(last.x, last.y, last.z))
  return result
}

// Straight runs need two rings; sample only short rounded corners.
export function buildWireGeometry(route: SolvedWireRoute, diameter: number): BufferGeometry {
  const points = roundedWirePoints(route.points, diameter / 2 * 1.1).filter((p, i, all) => !i || p.distanceToSquared(all[i - 1]) > 1e-16)
  const sides = WIRE_RADIAL_SEGMENTS, positions: number[] = [], normals: number[] = [], indices: number[] = []
  let previousNormal: Vector3 | null = null
  for (let i = 0; i < points.length; i++) {
    const tangent = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize()
    if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0)
    let normal: Vector3 | undefined = previousNormal ? previousNormal.clone().addScaledVector(tangent, -previousNormal.dot(tangent)) : undefined
    if (!normal || normal.lengthSq() < 1e-8) normal = new Vector3(Math.abs(tangent.y) < .9 ? 0 : 1, Math.abs(tangent.y) < .9 ? 1 : 0, 0).cross(tangent)
    normal.normalize(); previousNormal = normal
    const binormal = tangent.clone().cross(normal).normalize()
    for (let side = 0; side < sides; side++) {
      const angle = side * Math.PI * 2 / sides, n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle))
      positions.push(...points[i].clone().addScaledVector(n, diameter / 2).toArray()); normals.push(...n.toArray())
      if (i) {
        const a = (i - 1) * sides + side, b = (i - 1) * sides + (side + 1) % sides, c = i * sides + side, d = i * sides + (side + 1) % sides
        indices.push(a, b, c, b, d, c)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3)); geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
