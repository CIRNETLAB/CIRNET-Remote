import { BufferGeometry, Mesh, Ray, Vector3 } from 'three'

/** Counts open or nonmanifold edges after welding positional seams; ignores pole degeneracies. */
export function countUnsealedEdges(geometry: BufferGeometry, tolerance = 1e-7): number {
  const p = geometry.getAttribute('position'), index = geometry.index
  const key = (i: number) => [p.getX(i), p.getY(i), p.getZ(i)].map(n => Math.round(n / tolerance)).join(',')
  const edges = new Map<string, number>()
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const ids = [0, 1, 2].map(j => key(index ? index.getX(i + j) : i + j))
    if (new Set(ids).size < 3) continue
    for (let j = 0; j < 3; j++) { const edge = [ids[j], ids[(j + 1) % 3]].sort().join('|'); edges.set(edge, (edges.get(edge) ?? 0) + 1) }
  }
  return [...edges.values()].filter(count => count !== 2).length
}

/** Ray parity checks actual closed triangles, rather than only an enclosing AABB. */
export function solidContainsPoint(mesh: Mesh, worldPoint: Vector3): boolean {
  mesh.updateWorldMatrix(true, false)
  const inverse = mesh.matrixWorld.clone().invert(), ray = new Ray(worldPoint.clone().applyMatrix4(inverse), new Vector3(.953, .213, .217).normalize().transformDirection(inverse))
  const geometry = mesh.geometry, p = geometry.getAttribute('position'), index = geometry.index, distances = new Set<number>()
  const points = [new Vector3(), new Vector3(), new Vector3()], hit = new Vector3()
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    for (let j = 0; j < 3; j++) points[j]!.fromBufferAttribute(p, index ? index.getX(i + j) : i + j)
    if (ray.intersectTriangle(points[0]!, points[1]!, points[2]!, false, hit)) distances.add(Math.round(hit.distanceTo(ray.origin) / 1e-7))
  }
  return distances.size % 2 === 1
}
