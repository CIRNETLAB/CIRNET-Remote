import { Box3, InstancedMesh, Matrix4, Mesh, Vector3, Vector4, type Camera, type Object3D } from 'three'

export interface ScreenRect { left: number; top: number; right: number; bottom: number }
type ScreenPoint = { x: number; y: number }
const clipDistances = (p: Vector4) => [p.w + p.x, p.w - p.x, p.w + p.y, p.w - p.y, p.w + p.z, p.w - p.z]
const normalized = (rect: ScreenRect): ScreenRect => ({ left: Math.min(rect.left, rect.right), right: Math.max(rect.left, rect.right), top: Math.min(rect.top, rect.bottom), bottom: Math.max(rect.top, rect.bottom) })
const validRect = (rect: ScreenRect, width: number, height: number) => width > 0 && height > 0 && Object.values(rect).every(Number.isFinite)
const screen = (point: Vector4, width: number, height: number): ScreenPoint => ({ x: (point.x / point.w + 1) * width / 2, y: (1 - point.y / point.w) * height / 2 })

// Clip before perspective division, including near-plane crossings and geometry
// behind the camera. Projecting world AABBs alone selects empty rotated corners.
function clippedPolygon(input: Vector4[]): Vector4[] {
  let points = input
  for (let plane = 0; plane < 6 && points.length; plane++) {
    const next: Vector4[] = []
    let a = points.at(-1)!, da = clipDistances(a)[plane]
    for (const b of points) {
      const db = clipDistances(b)[plane]
      if ((da >= 0) !== (db >= 0)) next.push(a.clone().lerp(b, da / (da - db)))
      if (db >= 0) next.push(b)
      a = b; da = db
    }
    points = next
  }
  return points
}

function segmentIntersectsRect(a: ScreenPoint, b: ScreenPoint, rect: ScreenRect): boolean {
  let start = 0, end = 1
  const dx = b.x - a.x, dy = b.y - a.y
  for (const [p, q] of [[-dx, a.x - rect.left], [dx, rect.right - a.x], [-dy, a.y - rect.top], [dy, rect.bottom - a.y]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue }
    const t = q / p
    if (p < 0) start = Math.max(start, t); else end = Math.min(end, t)
    if (start > end) return false
  }
  return true
}

function polygonIntersectsRect(points: ScreenPoint[], rect: ScreenRect): boolean {
  if (!points.length) return false
  if (points.some(p => p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom)) return true
  if (points.some((p, index) => segmentIntersectsRect(p, points[(index + 1) % points.length], rect))) return true
  // A small rectangle may be fully inside a large projected triangle.
  const corner = { x: rect.left, y: rect.top }
  let sign = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const cross = (b.x - a.x) * (corner.y - a.y) - (b.y - a.y) * (corner.x - a.x)
    if (Math.abs(cross) < 1e-9) continue
    const next = Math.sign(cross)
    if (sign && next !== sign) return false
    sign = next
  }
  return sign !== 0
}

export function projectedObjectIntersectsRect(root: Object3D, camera: Camera, width: number, height: number, selection: ScreenRect): boolean {
  if (!validRect(selection, width, height)) return false
  const rect = normalized(selection), projection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const instance = new Matrix4(), matrix = new Matrix4(), vertex = new Vector3()
  root.updateWorldMatrix(true, true)
  const intersectsMesh = (mesh: Mesh, transform: Matrix4): boolean => {
    const geometry = mesh.geometry, position = geometry.getAttribute('position')
    if (!position) return false
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const box = geometry.boundingBox as Box3 | null
    if (box) {
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(index => new Vector4(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y, index & 4 ? box.max.z : box.min.z, 1).applyMatrix4(transform))
      if ([0, 1, 2, 3, 4, 5].some(plane => corners.every(p => clipDistances(p)[plane] < 0))) return false
      if (corners.every(p => p.w > 0 && p.z >= -p.w)) {
        const projected = corners.map(p => screen(p, width, height))
        if (Math.max(...projected.map(p => p.x)) < rect.left || Math.min(...projected.map(p => p.x)) > rect.right || Math.max(...projected.map(p => p.y)) < rect.top || Math.min(...projected.map(p => p.y)) > rect.bottom) return false
      }
    }
    const index = geometry.getIndex(), start = geometry.drawRange.start, count = Math.min(index?.count ?? position.count, start + geometry.drawRange.count)
    for (let i = start; i + 2 < count; i += 3) {
      const triangle = [0, 1, 2].map(offset => {
        vertex.fromBufferAttribute(position, index ? index.getX(i + offset) : i + offset)
        return new Vector4(vertex.x, vertex.y, vertex.z, 1).applyMatrix4(transform)
      })
      if (polygonIntersectsRect(clippedPolygon(triangle).map(p => screen(p, width, height)), rect)) return true
    }
    return false
  }
  const visit = (object: Object3D): boolean => {
    if (!object.visible || object.userData.ignorePick || object.userData.isOutline) return false
    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (materials.some(material => material.visible && material.opacity > 0)) {
        if (object instanceof InstancedMesh) {
          for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, instance); matrix.multiplyMatrices(projection, object.matrixWorld).multiply(instance); if (intersectsMesh(object, matrix)) return true }
        } else { matrix.multiplyMatrices(projection, object.matrixWorld); if (intersectsMesh(object, matrix)) return true }
      }
    }
    return object.children.some(visit)
  }
  return visit(root)
}

export function projectedBreadboardEnclosedInRect(root: Object3D, camera: Camera, width: number, height: number, selection: ScreenRect, tolerance = 0.5): boolean {
  if (!validRect(selection, width, height)) return false
  const rect = normalized(selection)
  let profile = root.userData.selectionProfile as readonly [number, number][] | undefined
  let heightVal = root.userData.selectionHeight as number | undefined
  if (!profile) {
    root.traverse((child) => {
      if (!profile && child.userData.selectionProfile) {
        profile = child.userData.selectionProfile
        heightVal = child.userData.selectionHeight
      }
    })
  }
  if (!profile || !profile.length || typeof heightVal !== 'number' || !Number.isFinite(heightVal)) {
    return false
  }
  root.updateWorldMatrix(true, true)
  const projection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const transform = new Matrix4().multiplyMatrices(projection, root.matrixWorld)

  for (const [x, z] of profile) {
    for (const y of [0, heightVal]) {
      const p = new Vector4(x, y, z, 1).applyMatrix4(transform)
      if (p.w <= 1e-4 || p.z < -p.w - 1e-4 || p.z > p.w + 1e-4) return false
      const pt = screen(p, width, height)
      if (pt.x < rect.left - tolerance || pt.x > rect.right + tolerance || pt.y < rect.top - tolerance || pt.y > rect.bottom + tolerance) {
        return false
      }
    }
  }
  return true
}
