import { Matrix4, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, Vector4 } from 'three'

const UP = new Vector3(0, 1, 0)
const MIN_PROJECTION = .2

export function projectedTranslationDelta(camera: PerspectiveCamera, width: number, height: number, pivot: Vector3, start: { x: number; y: number }, end: { x: number; y: number }, axis: 'x' | 'z' | 'xz'): Vector3 {
  const zero = new Vector3(), dx = end.x - start.x, dy = end.y - start.y
  if (width <= 1 || height <= 1 || ![width, height, ...pivot.toArray(), start.x, start.y, end.x, end.y].every(Number.isFinite) || (!dx && !dy)) return zero
  camera.updateWorldMatrix(true, false)
  const depth = -pivot.clone().applyMatrix4(camera.matrixWorldInverse).z
  const pixel = 2 * depth / (height * Math.abs(camera.projectionMatrix.elements[5]))
  if (depth <= 0 || !Number.isFinite(pixel) || pixel <= 0) return zero
  const constrain = (delta: Vector3) => {
    delta.y = 0
    if (axis === 'x') delta.z = 0
    if (axis === 'z') delta.x = 0
    return delta
  }

  // Preserve the exact grabbed ground-plane point in ordinary views. Grazing
  // rays are excluded before intersection so crossing the horizon cannot send
  // the component to an extremely distant point or freeze a depth drag.
  const ray = new Raycaster(), plane = new Plane(UP, -pivot.y)
  ray.setFromCamera(new Vector2(start.x / width * 2 - 1, 1 - start.y / height * 2), camera)
  const initial = Math.abs(ray.ray.direction.y) >= MIN_PROJECTION ? ray.ray.intersectPlane(plane, new Vector3()) : null
  ray.setFromCamera(new Vector2(end.x / width * 2 - 1, 1 - end.y / height * 2), camera)
  const current = Math.abs(ray.ray.direction.y) >= MIN_PROJECTION ? ray.ray.intersectPlane(plane, new Vector3()) : null
  if (initial && current) return constrain(current.sub(initial))

  // Differentiate perspective projection at the pivot rather than measuring
  // a one-world-unit sample, which distorts the basis at a close camera zoom.
  const projection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  const clip = new Vector4(pivot.x, pivot.y, pivot.z, 1).applyMatrix4(projection), matrix = projection.elements
  const basis = (column: number) => ({
    x: (matrix[column] - clip.x / clip.w * matrix[column + 3]) / clip.w * width / 2,
    y: -(matrix[column + 1] - clip.y / clip.w * matrix[column + 3]) / clip.w * height / 2,
  })
  const x = basis(0), z = basis(8), minimum = (MIN_PROJECTION / pixel) ** 2
  if (axis !== 'xz') {
    const projected = axis === 'x' ? x : z, length = projected.x ** 2 + projected.y ** 2
    if (length >= minimum) {
      const distance = (dx * projected.x + dy * projected.y) / length
      return axis === 'x' ? new Vector3(distance, 0, 0) : new Vector3(0, 0, distance)
    }
  } else {
    const determinant = x.x * z.y - x.y * z.x
    const sum = x.x ** 2 + x.y ** 2 + z.x ** 2 + z.y ** 2
    const smallest = (sum - Math.sqrt(Math.max(0, sum * sum - 4 * determinant * determinant))) / 2
    if (smallest >= minimum) return new Vector3((dx * z.y - dy * z.x) / determinant, 0, (x.x * dy - x.y * dx) / determinant)
  }

  // At the horizon one ground direction has no screen projection. Use camera
  // right for horizontal movement and flat forward for upward depth movement,
  // retaining the same world units per pixel as a visible, unforeshortened axis.
  const forward = camera.getWorldDirection(new Vector3()).setY(0)
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0)
  if (forward.lengthSq() < 1e-12) forward.crossVectors(UP, right)
  if (right.lengthSq() < 1e-12) right.crossVectors(forward, UP)
  return constrain(right.normalize().multiplyScalar(dx * pixel).addScaledVector(forward.normalize(), -dy * pixel))
}
