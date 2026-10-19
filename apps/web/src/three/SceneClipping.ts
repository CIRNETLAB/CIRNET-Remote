import { Box3, InstancedMesh, Line, Matrix4, Mesh, PerspectiveCamera, Points, Sprite, Vector3, type BufferGeometry, type Object3D } from 'three'

const MIN_NEAR = .00001
// Fifteen percent leaves room around every positive eye-depth interval while
// keeping the range tied to the rendered scene. Expansions are never delayed.
const DEPTH_MARGIN = .15
const BOX_FACES = [[0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6], [0, 1, 3, 2], [4, 6, 7, 5]] as const
interface SpriteBounds { center: Vector3; radius: number; offsets: Float64Array; sizeAttenuation: boolean }
type PositionAttribute = ReturnType<BufferGeometry['getAttribute']>

/** Owns projection depth only. Call invalidateBounds after changing rendered
 * poses, geometry, visibility or preview content; camera movement needs no
 * invalidation. Helper subtrees opt out explicitly with clippingHelper=true.
 * Picking policy (ignorePick) has no bearing on rendered depth precision. */
export function createSceneClipping(camera: PerspectiveCamera, roots: () => readonly Object3D[]) {
  const corners: Float64Array[] = [], sprites: SpriteBounds[] = [], worldBounds = new Box3()
  const geometryBounds = new WeakMap<BufferGeometry, { position: PositionAttribute; version: number; box: Box3 }>()
  const instanceBounds = new WeakMap<InstancedMesh, { geometry: Box3; version: number; count: number; box: Box3 }>()
  const point = new Vector3(), scale = new Vector3()
  const lastWorld = new Matrix4(), lastProjection = new Matrix4()
  const coneCamera = new PerspectiveCamera(), boxBasis = new Matrix4(), conePlanes = new Float64Array(15)
  const eyeCorners = Array.from({ length: 8 }, () => new Vector3())
  const polygonA = Array.from({ length: 16 }, () => new Vector3()), polygonB = Array.from({ length: 16 }, () => new Vector3())
  const intrinsics: number[] = []
  let dirty = true, initialized = false, expectedNear = camera.near, expectedFar = camera.far, layerMask = camera.layers.mask
  let refinedMin = Infinity, refinedMax = -Infinity

  const rendered = (object: Mesh | Line | Points | Sprite) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    return object.layers.test(camera.layers) && materials.some(material => material.visible && (!material.transparent || material.opacity > 0))
  }
  const localBounds = (geometry: BufferGeometry): Box3 | null => {
    const position = geometry.getAttribute('position')
    if (!position || geometry.drawRange.count === 0) return null
    const version = 'version' in position ? position.version : position.data.version
    let cached = geometryBounds.get(geometry)
    if (!cached || cached.position !== position || cached.version !== version) {
      // Refresh once even when a producer left a precomputed box behind after
      // editing positions. Further pose-only invalidations reuse this result.
      geometry.computeBoundingBox()
      if (!geometry.boundingBox) return null
      cached = { position, version, box: geometry.boundingBox.clone() }; geometryBounds.set(geometry, cached)
    }
    return cached.box.isEmpty() ? null : cached.box
  }
  const rememberBox = (box: Box3, matrix: Matrix4) => {
    const values = new Float64Array(24)
    for (let index = 0; index < 8; index++) {
      point.set(index & 1 ? box.max.x : box.min.x, index & 2 ? box.max.y : box.min.y, index & 4 ? box.max.z : box.min.z).applyMatrix4(matrix)
      if (![point.x, point.y, point.z].every(Number.isFinite)) return
      point.toArray(values, index * 3)
    }
    corners.push(values)
    for (let index = 0; index < 24; index += 3) worldBounds.expandByPoint(point.fromArray(values, index))
  }
  const rebuildBounds = () => {
    corners.length = 0; sprites.length = 0; worldBounds.makeEmpty()
    const visited = new Set<Object3D>()
    const visit = (object: Object3D) => {
      if (visited.has(object) || !object.visible || object.userData.clippingHelper === true || object.userData.isOutline) return
      visited.add(object)
      if (object instanceof Sprite && rendered(object)) {
        const center = new Vector3().setFromMatrixPosition(object.matrixWorld)
        scale.setFromMatrixScale(object.matrixWorld)
        // Sprite vertices are offset only in view X/Y by Three's billboard
        // shader. Their eye depth is exactly the center, regardless of scale.
        const radius = Math.hypot(Math.max(Math.abs(object.center.x), Math.abs(1 - object.center.x)) * scale.x, Math.max(Math.abs(object.center.y), Math.abs(1 - object.center.y)) * scale.y)
        const offsets = new Float64Array(8), cos = Math.cos(object.material.rotation), sin = Math.sin(object.material.rotation)
        for (let i = 0; i < 4; i++) {
          const x = ((i === 1 || i === 2 ? 1 : 0) - object.center.x) * scale.x, y = ((i >= 2 ? 1 : 0) - object.center.y) * scale.y
          offsets[i * 2] = cos * x - sin * y; offsets[i * 2 + 1] = sin * x + cos * y
        }
        if ([center.x, center.y, center.z, radius].every(Number.isFinite) && offsets.every(Number.isFinite)) sprites.push({ center, radius, offsets, sizeAttenuation: object.material.sizeAttenuation })
      } else if ((object instanceof Mesh || object instanceof Line || object instanceof Points) && rendered(object)) {
        const box = localBounds(object.geometry)
        if (box) {
          if (object instanceof InstancedMesh) {
            let cached = instanceBounds.get(object)
            if (!cached || cached.geometry !== box || cached.version !== object.instanceMatrix.version || cached.count !== object.count) {
              object.computeBoundingBox()
              if (object.boundingBox) { cached = { geometry: box, version: object.instanceMatrix.version, count: object.count, box: object.boundingBox.clone() }; instanceBounds.set(object, cached) }
            }
            // An 830-contact board still contributes just eight corners on
            // navigation. Aggregate instance bounds are conservative; instance
            // matrices are visited only when their version/count changes.
            if (cached && !cached.box.isEmpty()) rememberBox(cached.box, object.matrixWorld)
          } else rememberBox(box, object.matrixWorld)
        }
      }
      object.children.forEach(visit)
    }
    for (const root of roots()) {
      let excluded = false
      for (let ancestor = root.parent; ancestor; ancestor = ancestor.parent) if (!ancestor.visible || ancestor.userData.clippingHelper === true || ancestor.userData.isOutline) { excluded = true; break }
      if (!excluded) { root.updateWorldMatrix(true, true); visit(root) }
    }
    dirty = false; layerMask = camera.layers.mask
  }
  const eyeDepth = (x: number, y: number, z: number) => {
    const view = camera.matrixWorldInverse.elements
    return -(view[2] * x + view[6] * y + view[10] * z + view[14])
  }
  const updateConePlanes = () => {
    // Only X/Y projection rows matter. A scratch Three camera handles film
    // shifts and view offsets without relying on stale clipping planes or
    // writing the real projection twice during resize/navigation.
    coneCamera.copy(camera, false); coneCamera.near = 1; coneCamera.far = 2; coneCamera.updateProjectionMatrix()
    const p = coneCamera.projectionMatrix.elements
    conePlanes.set([p[3] + p[0], p[7] + p[4], p[11] + p[8], p[3] - p[0], p[7] - p[4], p[11] - p[8], p[3] + p[1], p[7] + p[5], p[11] + p[9], p[3] - p[1], p[7] - p[5], p[11] - p[9], 0, 0, -1])
  }
  const coneDistance = (vertex: Vector3, plane: number) => conePlanes[plane * 3] * vertex.x + conePlanes[plane * 3 + 1] * vertex.y + conePlanes[plane * 3 + 2] * vertex.z
  const outsideCone = () => {
    for (let plane = 0; plane < 4; plane++) {
      let outside = true
      for (let corner = 0; corner < 8; corner++) if (coneDistance(eyeCorners[corner], plane) >= 0) { outside = false; break }
      if (outside) return true
    }
    return false
  }
  const cameraInsideBox = () => {
    const origin = eyeCorners[0], x = eyeCorners[1], y = eyeCorners[2], z = eyeCorners[4]
    boxBasis.set(x.x - origin.x, y.x - origin.x, z.x - origin.x, origin.x, x.y - origin.y, y.y - origin.y, z.y - origin.y, origin.y, x.z - origin.z, y.z - origin.z, z.z - origin.z, origin.z, 0, 0, 0, 1)
    if (boxBasis.determinant() === 0) return false
    point.set(0, 0, 0).applyMatrix4(boxBasis.invert())
    return point.x >= -1e-9 && point.x <= 1 + 1e-9 && point.y >= -1e-9 && point.y <= 1 + 1e-9 && point.z >= -1e-9 && point.z <= 1 + 1e-9
  }
  const refineCrossingBox = (maxDepth: number) => {
    refinedMin = Infinity; refinedMax = -Infinity
    if (cameraInsideBox()) { refinedMin = 0; refinedMax = maxDepth; return true }
    // Clip complete faces, rather than keeping positive/inside corners. A view
    // cone may intersect a large face even when none of its corners is inside.
    // Fixed scratch polygons bound the CPU work; model vertices are untouched.
    for (const face of BOX_FACES) {
      let input = polygonA, output = polygonB, count = 4
      for (let i = 0; i < 4; i++) input[i].copy(eyeCorners[face[i]])
      for (let plane = 0; plane < 5 && count; plane++) {
        let nextCount = 0, a = input[count - 1], da = coneDistance(a, plane)
        for (let i = 0; i < count; i++) {
          const b = input[i], db = coneDistance(b, plane)
          if ((da >= 0) !== (db >= 0)) output[nextCount++].copy(a).lerp(b, da / (da - db))
          if (db >= 0) output[nextCount++].copy(b)
          a = b; da = db
        }
        count = nextCount; const previous = input; input = output; output = previous
      }
      for (let i = 0; i < count; i++) { refinedMin = Math.min(refinedMin, -input[i].z); refinedMax = Math.max(refinedMax, -input[i].z) }
    }
    return refinedMax > 0 && Number.isFinite(refinedMin) && Number.isFinite(refinedMax)
  }
  const depthRange = () => {
    let nearest = Infinity, farthest = 0, crossing = false
    for (const values of corners) {
      let min = Infinity, max = -Infinity
      for (let index = 0; index < 8; index++) {
        const vertex = eyeCorners[index].fromArray(values, index * 3).applyMatrix4(camera.matrixWorldInverse), depth = -vertex.z
        min = Math.min(min, depth); max = Math.max(max, depth)
      }
      if (max <= 0 || !Number.isFinite(min) || !Number.isFinite(max)) continue
      if (outsideCone()) continue
      if (min <= 0) {
        if (!refineCrossingBox(max)) continue
        min = refinedMin; max = refinedMax
      }
      farthest = Math.max(farthest, max)
      if (min <= MIN_NEAR) crossing = true
      else nearest = Math.min(nearest, min)
    }
    for (const sprite of sprites) {
      point.copy(sprite.center).applyMatrix4(camera.matrixWorldInverse)
      const depth = -point.z
      if (!Number.isFinite(depth) || depth <= 0) continue
      // Match Three's billboard quad: center pivot and material rotation act
      // in view X/Y; object rotation only contributes to the world scale.
      const attenuation = sprite.sizeAttenuation ? 1 : depth
      let input = polygonA, output = polygonB, count = 4
      for (let i = 0; i < 4; i++) input[i].set(point.x + sprite.offsets[i * 2] * attenuation, point.y + sprite.offsets[i * 2 + 1] * attenuation, point.z)
      for (let plane = 0; plane < 4 && count; plane++) {
        let nextCount = 0, a = input[count - 1], da = coneDistance(a, plane)
        for (let i = 0; i < count; i++) {
          const b = input[i], db = coneDistance(b, plane)
          if ((da >= 0) !== (db >= 0)) output[nextCount++].copy(a).lerp(b, da / (da - db))
          if (db >= 0) output[nextCount++].copy(b)
          a = b; da = db
        }
        count = nextCount; const previous = input; input = output; output = previous
      }
      if (count) { nearest = Math.min(nearest, depth); farthest = Math.max(farthest, depth) }
    }
    if (!farthest) {
      // Empty or fully rear-facing scenes retain a finite navigable range;
      // bounds are never culled with this fallback, so a turn restores them.
      const distance = Math.max(1, camera.position.length())
      return { near: MIN_NEAR, far: distance * 4 }
    }
    // A positive finite near plane necessarily clips depths below MIN_NEAR;
    // this floor is only used for camera intersections or extreme close-ups.
    const near = crossing ? MIN_NEAR : Math.max(MIN_NEAR, nearest * (1 - DEPTH_MARGIN))
    return { near, far: Math.max(near + MIN_NEAR, farthest * (1 + DEPTH_MARGIN)) }
  }
  const changedIntrinsics = () => {
    const view = camera.view
    const values = [camera.fov, camera.aspect, camera.zoom, camera.filmGauge, camera.filmOffset, camera.focus, view?.enabled ? 1 : 0, view?.fullWidth ?? 0, view?.fullHeight ?? 0, view?.offsetX ?? 0, view?.offsetY ?? 0, view?.width ?? 0, view?.height ?? 0]
    const changed = values.some((value, index) => value !== intrinsics[index])
    if (changed) { intrinsics.length = 0; intrinsics.push(...values) }
    return changed
  }
  return {
    invalidateBounds() { dirty = true },
    ensureProjection(): boolean {
      camera.updateWorldMatrix(true, false)
      if (layerMask !== camera.layers.mask) dirty = true
      const boundsChanged = dirty
      if (dirty) rebuildBounds()
      const projectionChanged = changedIntrinsics()
      if (projectionChanged) updateConePlanes()
      const moved = !initialized || !camera.matrixWorld.equals(lastWorld)
      if (!boundsChanged && !moved && !projectionChanged && camera.near === expectedNear && camera.far === expectedFar && camera.projectionMatrix.equals(lastProjection)) return false
      const { near, far } = depthRange()
      const update = near !== camera.near || far !== camera.far || projectionChanged || !camera.projectionMatrix.equals(lastProjection)
      if (update) { camera.near = near; camera.far = far; camera.updateProjectionMatrix() }
      expectedNear = near; expectedFar = far; lastWorld.copy(camera.matrixWorld); lastProjection.copy(camera.projectionMatrix); initialized = true
      return update
    },
    bounds(): Box3 {
      camera.updateWorldMatrix(true, false)
      if (dirty || layerMask !== camera.layers.mask) rebuildBounds()
      const result = worldBounds.clone()
      for (const sprite of sprites) {
        const radius = sprite.radius * (sprite.sizeAttenuation ? 1 : Math.abs(eyeDepth(sprite.center.x, sprite.center.y, sprite.center.z)))
        result.expandByPoint(point.copy(sprite.center).addScalar(radius)); result.expandByPoint(point.copy(sprite.center).addScalar(-radius))
      }
      return result
    },
  }
}
