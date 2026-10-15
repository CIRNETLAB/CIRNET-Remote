import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PerspectiveCamera, Vector3 } from 'three'
import { projectedTranslationDelta } from '../src/geometry/transformDrag'

const width = 1000, height = 700
const pointer = (camera: PerspectiveCamera, world: Vector3) => {
  const point = world.clone().project(camera)
  return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 }
}
function cameraAt(position: Vector3, target = new Vector3()) {
  const camera = new PerspectiveCamera(42, width / height, .01, 1000)
  camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld()
  return camera
}
const close = (actual: Vector3, expected: Vector3, message = '') => assert.ok(actual.distanceTo(expected) < 1e-8, `${message}: ${actual.toArray()} != ${expected.toArray()}`)

test('regular oblique drags retain exact ground-plane movement and world-axis constraints', () => {
  const camera = cameraAt(new Vector3(5, 11, 8)), pivot = new Vector3(1, .7, -2)
  const grab = pivot.clone().add(new Vector3(.3, 0, -.2)), start = pointer(camera, grab)
  const end = pointer(camera, grab.clone().add(new Vector3(1.2, 0, -.8)))
  close(projectedTranslationDelta(camera, width, height, pivot, start, end, 'xz'), new Vector3(1.2, 0, -.8))
  close(projectedTranslationDelta(camera, width, height, pivot, start, end, 'x'), new Vector3(1.2, 0, 0))
  close(projectedTranslationDelta(camera, width, height, pivot, start, end, 'z'), new Vector3(0, 0, -.8))
})

test('horizontal XZ drags use camera right and forward at a stable pixel sensitivity', () => {
  for (const [position, expectedDirection] of [
    [new Vector3(0, 0, 10), new Vector3(100, 0, -50)],
    [new Vector3(10, 0, 0), new Vector3(-50, 0, -100)],
  ] as const) for (const zoom of [.5, 1, 3]) {
    const camera = cameraAt(position); camera.zoom = zoom; camera.updateProjectionMatrix()
    const pivot = new Vector3(), start = pointer(camera, pivot), end = { x: start.x + 100, y: start.y - 50 }
    const pixel = 20 * Math.tan(21 * Math.PI / 180) / (height * zoom)
    close(projectedTranslationDelta(camera, width, height, pivot, start, end, 'xz'), expectedDirection.clone().multiplyScalar(pixel))
  }
})

test('shallow views cannot produce a huge plane jump when a drag crosses the horizon', () => {
  const camera = cameraAt(new Vector3(0, .01, 10)), pivot = new Vector3(), start = pointer(camera, pivot)
  for (const offset of [-2, 2]) for (const axis of ['x', 'z', 'xz'] as const) {
    const delta = projectedTranslationDelta(camera, width, height, pivot, start, { x: start.x, y: start.y + offset }, axis)
    assert.ok(delta.toArray().every(Number.isFinite), `${axis} must remain finite across the horizon`)
    assert.ok(delta.length() < .1, `${axis} must retain local pixel sensitivity`)
    if (axis === 'z' || axis === 'xz') assert.ok(delta.length() > .001, 'depth movement cannot stall at the horizon')
    if (axis === 'x') assert.equal(delta.z, 0)
    if (axis === 'z') assert.equal(delta.x, 0)
  }
})

test('a visible single axis projects pointer movement onto that world axis at the horizon', () => {
  const camera = cameraAt(new Vector3(10, 0, 10)), pivot = new Vector3(), start = pointer(camera, pivot)
  const end = { x: start.x + 50, y: start.y + 40 }
  const pixel = 2 * Math.sqrt(200) * Math.tan(21 * Math.PI / 180) / height
  close(projectedTranslationDelta(camera, width, height, pivot, start, end, 'x'), new Vector3(50 * pixel * Math.SQRT2, 0, 0))
  close(projectedTranslationDelta(camera, width, height, pivot, start, end, 'z'), new Vector3(0, 0, -50 * pixel * Math.SQRT2))
})

test('a conditioned screen basis still resolves both world axes when the pointer ray misses the plane', () => {
  const camera = cameraAt(new Vector3(0, 3, 10)), pivot = new Vector3()
  const start = { x: 500, y: 5 }, end = { x: 510, y: 15 }
  const depth = Math.sqrt(109), pixel = 2 * depth * Math.tan(21 * Math.PI / 180) / height
  close(projectedTranslationDelta(camera, width, height, pivot, start, end, 'xz'), new Vector3(10 * pixel, 0, 10 * pixel * depth / 3))
})

test('an edge-on single axis uses finite camera-relative depth movement', () => {
  const camera = cameraAt(new Vector3(0, 0, 10)), pivot = new Vector3(), start = pointer(camera, pivot)
  const pixel = 20 * Math.tan(21 * Math.PI / 180) / height
  close(projectedTranslationDelta(camera, width, height, pivot, start, { x: start.x, y: start.y - 25 }, 'z'), new Vector3(0, 0, -25 * pixel))
  close(projectedTranslationDelta(camera, width, height, pivot, start, start, 'xz'), new Vector3())
})
