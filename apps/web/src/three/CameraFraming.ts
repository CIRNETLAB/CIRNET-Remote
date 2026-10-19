import { Box3, InstancedMesh, Line, Matrix4, Mesh, PerspectiveCamera, Points, Sprite, Vector3, type BufferGeometry, type Object3D } from 'three'

export interface NdcRect { left: number; right: number; bottom: number; top: number }
export interface FramingSnapshot {
  readonly revision: number
  readonly boxes: readonly Float64Array[]
  readonly points: readonly Vector3[]
  readonly bounds: Box3
  readonly geometryPoints?: readonly Vector3[]
  readonly geometryBoxes?: readonly Float64Array[]
  readonly billboards?: readonly BillboardBounds[]
}
interface BillboardBounds { center: Vector3; scale: Vector3; pivotX: number; pivotY: number; rotation: number; sizeAttenuation: boolean }
export interface FramingPose {
  target: Vector3
  position: Vector3
  distance: number
  safeDepth: number
  points: readonly Vector3[]
  rect: NdcRect
}
type PositionAttribute = ReturnType<BufferGeometry['getAttribute']>
const FULL_RECT: NdcRect = { left: -1, right: 1, bottom: -1, top: 1 }
const BOX_FACES = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]] as const
const finitePoint = (point: Vector3) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
const excluded = (object: Object3D) => !object.visible || object.userData.isOutline === true || object.userData.pinLabel || object.userData.clippingHelper === true || object.userData.framingHelper === true || object.userData.pickProxy === true

/** Committed rendering bounds, independent of both picking and camera clipping.
 * Owners invalidate after committed geometry/pose/visibility changes, never on
 * camera movement. Position data and instance matrices are scanned only when
 * their revisions change; sparse models never become one global AABB. */
export function createFramingBounds(roots: () => readonly Object3D[], defaultCamera?: PerspectiveCamera) {
  const geometries = new WeakMap<BufferGeometry, { position: PositionAttribute; version: number; box: Box3 }>()
  const instances = new WeakMap<InstancedMesh, { box: Box3; version: number; count: number; matrices: Matrix4[] }>()
  let dirty = true, revision = 0, boxes: Float64Array[] = [], points: Vector3[] = [], bounds = new Box3()
  let sprites: BillboardBounds[] = []
  let snapshot: FramingSnapshot = { revision, boxes, points, bounds }
  const matrix = new Matrix4(), instanceMatrix = new Matrix4()
  const localBox = (geometry: BufferGeometry): Box3 | null => {
    const position = geometry.getAttribute('position')
    if (!position || geometry.drawRange.count === 0) return null
    const version = 'version' in position ? position.version : position.data.version
    let cached = geometries.get(geometry)
    if (!cached || cached.position !== position || cached.version !== version) {
      geometry.computeBoundingBox()
      if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return null
      cached = { position, version, box: geometry.boundingBox.clone() }; geometries.set(geometry, cached)
    }
    return cached.box
  }
  const remember = (box: Box3, world: Matrix4) => {
    const vertices = Array.from({ length: 8 }, (_, i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(world))
    if (!vertices.every(finitePoint)) return
    const values = new Float64Array(24)
    vertices.forEach((vertex, i) => { vertex.toArray(values, i * 3); points.push(vertex); bounds.expandByPoint(vertex) })
    boxes.push(values)
  }
  const rebuild = () => {
    boxes = []; points = []; bounds = new Box3(); sprites = []
    const visited = new Set<Object3D>()
    const visit = (object: Object3D) => {
      if (visited.has(object) || excluded(object)) return
      visited.add(object)
      if (object instanceof Mesh || object instanceof Line || object instanceof Points || object instanceof Sprite) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        if (materials.some(material => material.visible && (!material.transparent || material.opacity > 0))) {
          if (object instanceof Sprite) sprites.push({ center: new Vector3().setFromMatrixPosition(object.matrixWorld), scale: new Vector3().setFromMatrixScale(object.matrixWorld), pivotX: object.center.x, pivotY: object.center.y, rotation: object.material.rotation, sizeAttenuation: object.material.sizeAttenuation })
          else {
            const box = localBox(object.geometry)
            if (box && object instanceof InstancedMesh) {
              let cached = instances.get(object)
              if (!cached || cached.box !== box || cached.version !== object.instanceMatrix.version || cached.count !== object.count) {
                const matrices: Matrix4[] = []
                for (let i = 0; i < object.count; i++) { object.getMatrixAt(i, instanceMatrix); matrices.push(instanceMatrix.clone()) }
                cached = { box, version: object.instanceMatrix.version, count: object.count, matrices }; instances.set(object, cached)
              }
              cached.matrices.forEach(local => remember(box, matrix.multiplyMatrices(object.matrixWorld, local)))
            } else if (box) remember(box, object.matrixWorld)
          }
        }
      }
      object.children.forEach(visit)
    }
    for (const root of roots()) {
      let skip = false
      for (let ancestor = root.parent; ancestor; ancestor = ancestor.parent) if (excluded(ancestor)) { skip = true; break }
      if (!skip) { root.updateWorldMatrix(true, true); visit(root) }
    }
    revision++; dirty = false; snapshot = { revision, boxes, points, bounds, geometryPoints: points, geometryBoxes: boxes, billboards: sprites }
  }
  return {
    invalidate() { dirty = true },
    snapshot(camera = defaultCamera): FramingSnapshot {
      if (dirty) rebuild()
      if (!sprites.length || !camera) return snapshot
      return resolveBillboards(snapshot, camera)
    },
  }
}

function resolveBillboards(snapshot: FramingSnapshot, camera: PerspectiveCamera): FramingSnapshot {
  if (!snapshot.billboards?.length) return snapshot
  // Billboard orientation belongs to the current projection. Preserve immutable
  // committed parameters so cached snapshots remain valid after Orbit/Home.
  const points = [...(snapshot.geometryPoints ?? snapshot.points)], boxes = [...(snapshot.geometryBoxes ?? snapshot.boxes)], bounds = new Box3().setFromPoints(points)
  camera.updateWorldMatrix(true, false)
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  for (const sprite of snapshot.billboards) {
    const depth = -sprite.center.clone().applyMatrix4(camera.matrixWorldInverse).z, attenuation = sprite.sizeAttenuation ? 1 : Math.abs(depth)
    const cos = Math.cos(sprite.rotation), sin = Math.sin(sprite.rotation), values = new Float64Array(24), vertices: Vector3[] = []
    for (let i = 0; i < 8; i++) {
      const x = ((i & 1 ? 1 : 0) - sprite.pivotX) * sprite.scale.x * attenuation, y = ((i & 2 ? 1 : 0) - sprite.pivotY) * sprite.scale.y * attenuation
      vertices.push(sprite.center.clone().addScaledVector(right, cos * x - sin * y).addScaledVector(up, sin * x + cos * y))
    }
    if (!vertices.every(finitePoint)) continue
    vertices.forEach((vertex, i) => { vertex.toArray(values, i * 3); points.push(vertex); bounds.expandByPoint(vertex) }); boxes.push(values)
  }
  return { ...snapshot, boxes, points, bounds }
}

function normalizedRect(rect: NdcRect): NdcRect | null {
  if (![rect.left, rect.right, rect.bottom, rect.top].every(Number.isFinite)) return null
  const result = { left: Math.max(-1, Math.min(rect.left, rect.right)), right: Math.min(1, Math.max(rect.left, rect.right)), bottom: Math.max(-1, Math.min(rect.bottom, rect.top)), top: Math.min(1, Math.max(rect.bottom, rect.top)) }
  return result.right - result.left > 1e-7 && result.top - result.bottom > 1e-7 ? result : null
}
function projection(camera: PerspectiveCamera) {
  const scratch = new PerspectiveCamera().copy(camera, false)
  scratch.near = 1; scratch.far = 2; scratch.updateProjectionMatrix()
  return scratch.projectionMatrix.elements
}

/** Minimal perspective distance with independent four-edge constraints. The
 * target can shift along the actual camera screen axes to balance margins,
 * including a docked/asymmetric usable rectangle. Camera roll is never reset. */
export function solveOverview(camera: PerspectiveCamera, snapshot: FramingSnapshot, usableRect: NdcRect = FULL_RECT, padding = .05, minimumSafeDepth = 1e-4): FramingPose | null {
  snapshot = resolveBillboards(snapshot, camera)
  const usable = normalizedRect(usableRect)
  if (!usable || !snapshot.points.length || !Number.isFinite(padding) || padding < 0 || padding >= .5 || !Number.isFinite(minimumSafeDepth) || minimumSafeDepth <= 0 || !snapshot.points.every(finitePoint)) return null
  const rect = { left: usable.left + (usable.right - usable.left) * padding, right: usable.right - (usable.right - usable.left) * padding, bottom: usable.bottom + (usable.top - usable.bottom) * padding, top: usable.top - (usable.top - usable.bottom) * padding }
  const p = projection(camera), left = (rect.left + p[8]) / p[0], rightSlope = (rect.right + p[8]) / p[0], bottom = (rect.bottom + p[9]) / p[5], top = (rect.top + p[9]) / p[5]
  if (![left, rightSlope, bottom, top].every(Number.isFinite) || rightSlope <= left || top <= bottom) return null
  camera.updateWorldMatrix(true, false)
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize(), up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize(), back = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize()
  const worldBox = new Box3().setFromPoints([...snapshot.points]), center = worldBox.getCenter(new Vector3()), safeDepth = Math.max(minimumSafeDepth, worldBox.getSize(new Vector3()).length() * 1e-6)
  let maxRight = -Infinity, minLeft = Infinity, maxTop = -Infinity, minBottom = Infinity, maxDepth = -Infinity
  const q = new Vector3()
  for (const point of snapshot.points) {
    q.copy(point).sub(center)
    const x = q.dot(right), y = q.dot(up), z = q.dot(back)
    maxRight = Math.max(maxRight, x + rightSlope * z); minLeft = Math.min(minLeft, x + left * z)
    maxTop = Math.max(maxTop, y + top * z); minBottom = Math.min(minBottom, y + bottom * z); maxDepth = Math.max(maxDepth, z)
  }
  let distance = Math.max(safeDepth, maxDepth + safeDepth, (maxRight - minLeft) / (rightSlope - left), (maxTop - minBottom) / (top - bottom))
  // The navigation target stays on/above the workplane. Re-solve the distance
  // if its feasible screen-axis interval cannot reach that half-space; a final
  // world-Y clamp alone would invalidate the perspective edge constraints.
  const highYIntercept = center.y + right.y * (right.y >= 0 ? minLeft : maxRight) + up.y * (up.y >= 0 ? minBottom : maxTop)
  const highYSlope = right.y * (right.y >= 0 ? -left : -rightSlope) + up.y * (up.y >= 0 ? -bottom : -top)
  if (highYIntercept + highYSlope * distance < -1e-10) {
    if (highYSlope <= 1e-12) return null
    distance = Math.max(distance, -highYIntercept / highYSlope)
  }
  const lowRight = maxRight - rightSlope * distance, highRight = minLeft - left * distance, lowUp = maxTop - top * distance, highUp = minBottom - bottom * distance
  let shiftRight = (lowRight + highRight) / 2, shiftUp = (lowUp + highUp) / 2
  let missingY = -(center.y + right.y * shiftRight + up.y * shiftUp)
  if (missingY > 0) {
    for (const axis of [0, 1]) {
      const weight = axis === 0 ? right.y : up.y
      if (Math.abs(weight) <= 1e-12) continue
      const value = axis === 0 ? shiftRight : shiftUp, low = axis === 0 ? lowRight : lowUp, high = axis === 0 ? highRight : highUp
      const next = Math.max(low, Math.min(high, value + missingY / weight))
      missingY -= weight * (next - value)
      if (axis === 0) shiftRight = next
      else shiftUp = next
    }
  }
  const target = center.addScaledVector(right, shiftRight).addScaledVector(up, shiftUp)
  // The half-space solve can leave a signed roundoff residual at its boundary.
  if (target.y < 0 && target.y > -1e-10) target.y = 0
  const position = target.clone().addScaledVector(back, distance)
  return Number.isFinite(distance) && finitePoint(target) && finitePoint(position) ? { target, position, distance, safeDepth, points: snapshot.points, rect } : null
}

/** Select the part of committed bounding geometry inside the pre-command
 * selection cone. Clipping complete box faces finds thin/large objects even
 * when the rectangle contains no original vertex or centre. Near/far planes
 * intentionally play no role in selection or framing. */
export function solveArea(snapshot: FramingSnapshot, camera: PerspectiveCamera, selection: NdcRect, usableRect: NdcRect, focalTarget: Vector3, padding = .05, minimumSafeDepth = 1e-4, focusAnchor?: Vector3): FramingPose | null {
  const rect = normalizedRect(selection)
  if (!rect || rect.left <= -1 + 1e-7 && rect.right >= 1 - 1e-7 && rect.bottom <= -1 + 1e-7 && rect.top >= 1 - 1e-7) return null
  snapshot = resolveBillboards(snapshot, camera)
  camera.updateWorldMatrix(true, false)
  const p = projection(camera), left = (rect.left + p[8]) / p[0], right = (rect.right + p[8]) / p[0], bottom = (rect.bottom + p[9]) / p[5], top = (rect.top + p[9]) / p[5]
  if (![left, right, bottom, top].every(Number.isFinite)) return null
  const planes = [[1, 0, left, 0], [-1, 0, -right, 0], [0, 1, bottom, 0], [0, -1, -top, 0], [0, 0, -1, -1e-6]]
  const selected: Vector3[] = []
  for (const box of snapshot.boxes) {
    const corners = Array.from({ length: 8 }, (_, i) => new Vector3().fromArray(box, i * 3).applyMatrix4(camera.matrixWorldInverse))
    if (!corners.every(finitePoint)) continue
    for (const face of BOX_FACES) {
      let polygon = face.map(i => corners[i])
      for (const plane of planes) {
        if (!polygon.length) break
        const clipped: Vector3[] = [], signed = (v: Vector3) => plane[0] * v.x + plane[1] * v.y + plane[2] * v.z + plane[3]
        let a = polygon[polygon.length - 1], da = signed(a)
        for (const b of polygon) {
          const db = signed(b)
          if ((da >= 0) !== (db >= 0)) clipped.push(a.clone().lerp(b, da / (da - db)))
          if (db >= 0) clipped.push(b)
          a = b; da = db
        }
        polygon = clipped
      }
      selected.push(...polygon.map(point => point.clone().applyMatrix4(camera.matrixWorld)))
    }
  }
  if (!selected.length) {
    const focal = focalTarget.clone().applyMatrix4(camera.matrixWorldInverse)
    const depth = Number.isFinite(focal.z) && -focal.z > 1e-6 ? -focal.z : camera.position.distanceTo(focalTarget)
    if (!Number.isFinite(depth) || depth <= 1e-6) return null
    for (const x of [rect.left, rect.right]) for (const y of [rect.bottom, rect.top]) selected.push(new Vector3((x + p[8]) / p[0] * depth, (y + p[9]) / p[5] * depth, -depth).applyMatrix4(camera.matrixWorld))
  }
  const pose = solveOverview(camera, { revision: snapshot.revision, boxes: [], points: selected, bounds: new Box3().setFromPoints(selected) }, usableRect, padding, minimumSafeDepth)
  if (!pose || !focusAnchor || !finitePoint(focusAnchor)) return pose
  // Depth/extent selection still comes from the whole clipped cone. A real
  // centre-ray foreground hit merely fixes the focal anchor, so a wire/screen
  // is not displaced by the volume of its support board behind it.
  const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize(), screenUp = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize(), back = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2).normalize()
  const l = (pose.rect.left + p[8]) / p[0], r = (pose.rect.right + p[8]) / p[0], b = (pose.rect.bottom + p[9]) / p[5], t = (pose.rect.top + p[9]) / p[5], sx = (l + r) / 2, sy = (b + t) / 2
  let distance = pose.safeDepth
  for (const point of selected) {
    const q = point.clone().sub(focusAnchor), x = q.dot(screenRight), y = q.dot(screenUp), z = q.dot(back)
    distance = Math.max(distance, z + pose.safeDepth, (x + r * z) / (r - sx), (-x - l * z) / (sx - l), (y + t * z) / (t - sy), (-y - b * z) / (sy - b))
  }
  const target = focusAnchor.clone().addScaledVector(screenRight, -sx * distance).addScaledVector(screenUp, -sy * distance), position = target.clone().addScaledVector(back, distance)
  if (target.y < 0) {
    // Moving the orbit target along its viewing ray leaves the solved camera,
    // projection and foreground anchor unchanged while honoring the workplane.
    if (back.y <= 1e-10) return pose
    const shift = -target.y / back.y
    if (distance - shift < minimumSafeDepth) return pose
    target.addScaledVector(back, shift); target.y = 0; distance -= shift
  }
  return finitePoint(position) && finitePoint(target) && Number.isFinite(distance) ? { ...pose, target, position, distance } : pose
}
