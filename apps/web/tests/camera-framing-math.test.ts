import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, BufferGeometry, Group, InstancedMesh, Line, LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Sprite, SpriteMaterial, Vector3 } from 'three'
import { createFramingBounds, solveArea, solveOverview, type FramingPose, type NdcRect } from '../src/three/CameraFraming'

const FULL: NdcRect = { left: -1, right: 1, bottom: -1, top: 1 }
function camera(aspect = 1680 / 620) {
  const result = new PerspectiveCamera(42, aspect, 50, 51)
  result.position.set(0, 11, 10); result.lookAt(0, 0, 0); result.updateMatrixWorld(true)
  return result
}
function box(x = 0, y = 1.9, z = 0, width = 6, height = 3.8, depth = 2.8) {
  const result = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial()); result.position.set(x, y, z); return result
}
function applyAndMeasure(view: PerspectiveCamera, pose: FramingPose) {
  const orientation = view.quaternion.clone()
  view.position.copy(pose.position); view.updateMatrixWorld(true)
  assert.ok(view.quaternion.equals(orientation), 'framing never changes roll or heading')
  const projected = new Box3()
  for (const point of pose.points) {
    const depth = -point.clone().applyMatrix4(view.matrixWorldInverse).z, ndc = point.clone().project(view)
    assert.ok(depth >= pose.safeDepth * .999, `positive eye-depth ${depth}`)
    assert.ok(ndc.x >= pose.rect.left - 1e-8 && ndc.x <= pose.rect.right + 1e-8 && ndc.y >= pose.rect.bottom - 1e-8 && ndc.y <= pose.rect.top + 1e-8, `outside safe rectangle: ${ndc.toArray()}`)
    projected.expandByPoint(ndc)
  }
  return projected
}

for (const aspect of [1680 / 620, 620 / 1680]) for (const gap of [10, 50, 200]) for (const arrangement of ['X', 'Z', 'diagonal']) {
  test(`camera framing tightly fits ${arrangement} clusters ${gap} apart at aspect ${aspect}`, () => {
    const view = camera(aspect), root = new Group()
    const a = box(), b = box(arrangement === 'Z' ? 0 : gap, 3, arrangement === 'X' ? 0 : gap)
    a.rotation.y = .3; b.rotation.set(.1, -.4, .08); root.add(a, b)
    const bounds = createFramingBounds(() => [root]), snapshot = bounds.snapshot(), pose = solveOverview(view, snapshot)!
    assert.ok(pose)
    const projected = applyAndMeasure(view, pose)
    const edgeDistance = Math.min(Math.abs(projected.min.x - pose.rect.left), Math.abs(projected.max.x - pose.rect.right), Math.abs(projected.min.y - pose.rect.bottom), Math.abs(projected.max.y - pose.rect.top))
    assert.ok(edgeDistance < 1e-8, 'at least one screen constraint is active, including ground-constrained targets')
    const again = solveOverview(view, snapshot)!
    assert.ok(again.position.distanceTo(pose.position) < 1e-8 && again.target.distanceTo(pose.target) < 1e-8)
    const distance = pose.distance, target = pose.target.clone(), translated = new Vector3(10000, 0, -25000)
    root.position.copy(translated); bounds.invalidate()
    const moved = solveOverview(view, bounds.snapshot())!
    assert.ok(Math.abs(moved.distance - distance) < 1e-8)
    assert.ok(moved.target.distanceTo(target.add(translated)) < 1e-8)
  })
}

test('camera framing uses asymmetric usable bounds, projection shift and actual TOP roll', () => {
  const view = camera(2), root = new Group(); root.add(box(-15), box(15, 4, 5))
  view.position.set(0, 30, 0); view.up.set(0, 0, -1); view.lookAt(0, 0, 0); view.rotateZ(.8)
  view.filmOffset = 4; view.setViewOffset(2000, 1000, 60, 10, 1900, 980)
  const snapshot = createFramingBounds(() => [root]).snapshot(), pose = solveOverview(view, snapshot, { left: -.7, right: .9, bottom: -.8, top: .6 })!
  const projected = applyAndMeasure(view, pose)
  const hits = [Math.abs(projected.min.x - pose.rect.left), Math.abs(projected.max.x - pose.rect.right), Math.abs(projected.min.y - pose.rect.bottom), Math.abs(projected.max.y - pose.rect.top)]
  assert.ok(Math.min(...hits) < 1e-8)
})

test('camera framing has no three-unit floor and no dependency on old clipping', () => {
  const view = camera(), root = box(0, .01, 0, .02, .02, .02), snapshot = createFramingBounds(() => [root]).snapshot()
  const pose = solveOverview(view, snapshot)!
  assert.ok(pose.distance < .1 && pose.distance > 0)
  view.near = 1e-5; view.far = 1e9; view.updateProjectionMatrix()
  const broad = solveOverview(view, snapshot)!
  assert.ok(Math.abs(pose.distance - broad.distance) < 1e-12)
})

test('camera framing excludes selection, pins, hidden proxies and uncommitted roots without dropping ignored artwork', () => {
  const root = new Group(), body = box(), art = box(20); art.userData.ignorePick = true
  const hidden = box(1000); hidden.visible = false
  const proxy = box(1000); proxy.material.visible = false
  const outline = box(1000); outline.userData.isOutline = true
  const pins = box(1000); pins.userData.pinLabel = true
  const helper = new Group(); helper.userData.framingHelper = true; helper.add(box(1000))
  root.add(body, art, hidden, proxy, outline, pins, helper)
  const preview = box(10000), bounds = createFramingBounds(() => [root]), snapshot = bounds.snapshot()
  assert.equal(snapshot.points.length, 16); assert.ok(snapshot.bounds.max.x < 30 && snapshot.bounds.max.x > 20)
  assert.equal(bounds.snapshot(), snapshot, 'unchanged snapshots reuse world corners')
  preview.position.x += 1000
  assert.equal(bounds.snapshot(), snapshot)
})

test('camera framing caches geometry and instance revisions but refreshes committed moves synchronously', () => {
  const geometry = new BoxGeometry(1, 1, 1), root = new Group(), mesh = new InstancedMesh(geometry, new MeshBasicMaterial(), 3)
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(-10, 0, 0)); mesh.setMatrixAt(1, new Matrix4().makeRotationY(.6).setPosition(10, 0, 0)); mesh.setMatrixAt(2, new Matrix4().makeTranslation(10000, 0, 0)); mesh.count = 2
  root.add(mesh)
  let scans = 0, instanceReads = 0
  const original = geometry.computeBoundingBox.bind(geometry), get = mesh.getMatrixAt.bind(mesh)
  geometry.computeBoundingBox = () => { scans++; original() }; mesh.getMatrixAt = (index, matrix) => { instanceReads++; get(index, matrix) }
  const bounds = createFramingBounds(() => [root]), first = bounds.snapshot()
  assert.equal(first.points.length, 16); assert.ok(first.bounds.max.x < 11)
  for (let i = 0; i < 20; i++) bounds.snapshot(camera())
  assert.equal(scans, 1); assert.equal(instanceReads, 2)
  root.position.x = 20; bounds.invalidate(); const moved = bounds.snapshot()
  assert.equal(scans, 1); assert.equal(instanceReads, 2); assert.equal(moved.revision, first.revision + 1)
  assert.ok(Math.abs(moved.bounds.min.x - first.bounds.min.x - 20) < 1e-8)
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(-100, 0, 0)); mesh.instanceMatrix.needsUpdate = true; bounds.invalidate()
  assert.ok(bounds.snapshot().bounds.min.x < -80); assert.equal(instanceReads, 4)
  const positions = geometry.getAttribute('position'); positions.setX(0, 25); positions.needsUpdate = true; bounds.invalidate()
  assert.ok(bounds.snapshot().bounds.max.x > moved.bounds.max.x); assert.equal(scans, 2)
})

test('camera framing includes committed thin wire paths and camera-facing circuit labels', () => {
  const root = new Group(), wire = new Line(new BufferGeometry().setFromPoints([new Vector3(-30, 1, 0), new Vector3(40, 2, 20)]), new LineBasicMaterial())
  const label = new Sprite(new SpriteMaterial()); label.position.set(0, 4, 0); label.scale.set(5, 1, 1); label.userData.ignorePick = true
  root.add(wire, label)
  const view = camera(), snapshot = createFramingBounds(() => [root], view).snapshot()
  assert.equal(snapshot.points.length, 16); applyAndMeasure(view, solveOverview(view, snapshot)!)
})

test('camera framing recalibrates immutable billboard bounds after an orientation change without collecting geometry again', () => {
  const view = camera(), root = new Group(), label = new Sprite(new SpriteMaterial()); label.position.set(0, 4, 0); label.scale.set(5, 1, 1)
  root.add(box(), label)
  const bounds = createFramingBounds(() => [root], view), snapshot = bounds.snapshot(), revision = snapshot.revision
  view.position.set(0, 30, 0); view.up.set(0, 0, -1); view.lookAt(0, 0, 0); view.updateMatrixWorld(true)
  const pose = solveOverview(view, snapshot)!, back = new Vector3().setFromMatrixColumn(view.matrixWorld, 2)
  for (const vertex of pose.points.slice(-8)) assert.ok(Math.abs(vertex.clone().sub(label.position).dot(back)) < 1e-8, 'billboard vertices remain coplanar with the new camera screen')
  assert.equal(bounds.snapshot().revision, revision)
  applyAndMeasure(view, pose)
})

test('camera framing area inspects only the clipped part of a large model', () => {
  const view = camera(1); view.position.set(0, 50, 200); view.lookAt(0, 50, 0); view.updateMatrixWorld(true)
  const root = box(0, 50, 0, 100, 100, 1), snapshot = createFramingBounds(() => [root]).snapshot()
  const whole = solveOverview(view, snapshot)!, small = solveArea(snapshot, view, { left: -.05, right: .05, bottom: -.05, top: .05 }, FULL, new Vector3(0, 50, 0))!
  assert.ok(small.distance < whole.distance * .15, `partial inspect ${small.distance} vs full ${whole.distance}`)
  assert.ok(new Box3().setFromPoints([...small.points]).getSize(new Vector3()).x < 10)
  applyAndMeasure(view, small)
})

test('camera framing area finds a wire crossing the rectangle with neither endpoint or centre inside', () => {
  const view = camera(1); view.position.set(0, 5, 20); view.lookAt(0, 5, 0); view.updateMatrixWorld(true)
  const wire = new Line(new BufferGeometry().setFromPoints([new Vector3(-10, 5, 0), new Vector3(10, 5, 0)]), new LineBasicMaterial()), snapshot = createFramingBounds(() => [wire]).snapshot()
  const area = solveArea(snapshot, view, { left: .2, right: .25, bottom: -.02, top: .02 }, FULL, new Vector3(0, 5, 0))!
  assert.ok(area && area.target.x > 1 && area.target.x < 3 && area.target.y > 4.9)
  assert.ok(area.distance < 1); applyAndMeasure(view, area)
})

test('camera framing area uses a finite focal plane near the horizon and rejects invalid/full rectangles', () => {
  const view = camera(1); view.position.set(0, 2, 20); view.lookAt(0, 2, 0); view.updateMatrixWorld(true)
  const empty = createFramingBounds(() => []).snapshot(), target = new Vector3(0, 2, 0)
  const area = solveArea(empty, view, { left: .7, right: .9, bottom: -.02, top: .02 }, FULL, target)!
  assert.ok(area && Number.isFinite(area.distance) && area.position.distanceTo(view.position) < 30)
  assert.equal(solveArea(empty, view, FULL, FULL, target), null)
  assert.equal(solveArea(empty, view, { ...FULL, left: NaN }, FULL, target), null)
  assert.equal(solveArea(empty, view, { left: .2, right: .2, bottom: 0, top: 1 }, FULL, target), null)
  const reversed = solveArea(empty, view, { left: .9, right: .7, bottom: .02, top: -.02 }, FULL, target)!
  assert.ok(reversed.position.distanceTo(area.position) < 1e-10)
  applyAndMeasure(view, area)
  assert.equal(solveOverview(view, empty), null)
})

test('camera framing re-solves ground-constrained target rather than clamping a finished fit', () => {
  const view = camera(), root = box(0, 0, 0, 20, .001, 30), snapshot = createFramingBounds(() => [root]).snapshot()
  const pose = solveOverview(view, snapshot)!
  assert.ok(pose.target.y >= -1e-8); applyAndMeasure(view, pose)
})

test('camera framing Area anchors a foreground wire hit while retaining all selected support geometry', () => {
  const view = camera(1680 / 620); view.position.set(0, 30, 0); view.up.set(0, 0, -1); view.lookAt(0, 0, 0); view.updateMatrixWorld(true)
  const root = new Group(), board = box(0, .15, 0, 12, .3, 8), wire = box(.26, .386, 0, .052, .052, 1)
  root.add(board, wire)
  const anchor = new Vector3(.26, .412, 0), projected = anchor.clone().project(view), snapshot = createFramingBounds(() => [root]).snapshot()
  const area = solveArea(snapshot, view, { left: projected.x - .015, right: projected.x + .015, bottom: projected.y - .03, top: projected.y + .03 }, FULL, new Vector3(), .05, 1e-4, anchor)!
  assert.ok(area.target.distanceTo(anchor) < 1e-8, `actual foreground hit remains the focal target: ${area.target.toArray()}`)
  applyAndMeasure(view, area)
})
