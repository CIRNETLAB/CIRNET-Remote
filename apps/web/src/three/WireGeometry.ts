import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import type { Point3 } from '../types/circuit'
import type { SolvedWireRoute } from '../wires/wireRouting'

export function roundedWirePoints(points: Point3[]): Vector3[] {
  const result = [new Vector3(points[0].x, points[0].y, points[0].z)]
  for (let i = 1; i < points.length - 1; i++) {
    const p = new Vector3(points[i].x, points[i].y, points[i].z)
    const before = new Vector3(points[i - 1].x, points[i - 1].y, points[i - 1].z).sub(p)
    const after = new Vector3(points[i + 1].x, points[i + 1].y, points[i + 1].z).sub(p)
    const radius = Math.min(.035, before.length() * .25, after.length() * .25)
    if (radius < 1e-8 || Math.abs(before.clone().normalize().dot(after.clone().normalize())) > .999) { result.push(p); continue }
    const a = before.normalize().multiplyScalar(radius).add(p), b = after.normalize().multiplyScalar(radius).add(p)
    result.push(a)
    for (let j = 1; j <= 4; j++) {
      const t = j / 4
      result.push(a.clone().multiplyScalar((1 - t) ** 2).addScaledVector(p, 2 * (1 - t) * t).addScaledVector(b, t ** 2))
    }
  }
  const last = points.at(-1)!
  result.push(new Vector3(last.x, last.y, last.z))
  return result
}

// Straight runs need two rings; sample only short rounded corners.
export function buildWireGeometry(route: SolvedWireRoute, diameter: number): BufferGeometry {
  const points = roundedWirePoints(route.points), positions: number[] = [], normals: number[] = [], indices: number[] = []
  let previousNormal: Vector3 | null = null
  for (let i = 0; i < points.length; i++) {
    const tangent = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]).normalize()
    let normal: Vector3 | undefined = previousNormal ? previousNormal.clone().addScaledVector(tangent, -previousNormal.dot(tangent)) : undefined
    if (!normal || normal.lengthSq() < 1e-8) normal = new Vector3(Math.abs(tangent.y) < .9 ? 0 : 1, Math.abs(tangent.y) < .9 ? 1 : 0, 0).cross(tangent)
    normal.normalize(); previousNormal = normal
    const binormal = tangent.clone().cross(normal).normalize()
    for (let side = 0; side < 6; side++) {
      const angle = side * Math.PI / 3, n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle))
      positions.push(...points[i].clone().addScaledVector(n, diameter / 2).toArray()); normals.push(...n.toArray())
      if (i) {
        const a = (i - 1) * 6 + side, b = (i - 1) * 6 + (side + 1) % 6, c = i * 6 + side, d = i * 6 + (side + 1) % 6
        indices.push(a, b, c, b, d, c)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3)); geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
