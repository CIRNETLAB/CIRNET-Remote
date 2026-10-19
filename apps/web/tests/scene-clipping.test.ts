import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, BufferGeometry, Group, InstancedMesh, Line, LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Sprite, SpriteMaterial, Vector3, type Object3D } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createSceneClipping } from '../src/three/SceneClipping'

function setup(...roots: Object3D[]) {
  const camera = new PerspectiveCamera(42, 1, .005, 150)
  camera.position.set(0, 0, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true)
  return { camera, clipping: createSceneClipping(camera, () => roots) }
}
function box(size = 1, z = 0) { const mesh = new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial()); mesh.position.z = z; return mesh }
function covered(camera: PerspectiveCamera, point: Vector3) {
  const depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z
  if (depth > 0) assert.ok(depth >= camera.near && depth <= camera.far, `eye depth ${depth} must fit ${camera.near}..${camera.far}`)
}

test('clipping tightens both depth planes around rendered content without a tiny-near ceiling', () => {
  const model = box(), { camera, clipping } = setup(model)
  assert.equal(clipping.ensureProjection(), true)
  assert.ok(camera.near > 1, 'distant inspection must use the available depth precision')
  assert.ok(camera.near < 9.5 && camera.far > 10.5 && camera.far < 15)
  for (const z of [-.5, .5]) covered(camera, new Vector3(0, 0, z))
  assert.equal(clipping.ensureProjection(), false, 'unchanged ensures are idempotent')
})

test('camera changes and projection intrinsics synchronize before another render', () => {
  const { camera, clipping } = setup(box())
  clipping.ensureProjection(); const distantNear = camera.near
  camera.position.z = 1
  assert.equal(clipping.ensureProjection(), true)
  assert.ok(camera.near < distantNear && camera.near < .5)
  covered(camera, new Vector3(0, 0, .5))
  camera.fov = 57; camera.aspect = 2; camera.zoom = 1.2
  assert.equal(clipping.ensureProjection(), true)
  const expected = new PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far); expected.zoom = camera.zoom; expected.updateProjectionMatrix()
  assert.ok(camera.projectionMatrix.equals(expected.projectionMatrix))
  assert.equal(clipping.ensureProjection(), false)
})

test('visible ignored-pick previews and artwork contribute while invisible and helper subtrees do not', () => {
  const root = new Group(), preview = box(2, -100); preview.userData.ignorePick = true
  const hiddenParent = new Group(); hiddenParent.visible = false; hiddenParent.add(box(1000))
  const invisibleMaterial = box(1000); invisibleMaterial.material.visible = false
  const transparent = box(1000); transparent.material.transparent = true; transparent.material.opacity = 0
  const helper = new Group(); helper.userData.clippingHelper = true; helper.add(box(1000))
  const outline = box(1000); outline.userData.isOutline = true
  root.add(box(), preview, hiddenParent, invisibleMaterial, transparent, helper, outline)
  const { camera, clipping } = setup(root); clipping.ensureProjection()
  assert.ok(camera.near > 1 && camera.far > 111 && camera.far < 150)
  assert.ok(clipping.bounds().max.z <= .5)
})

test('renderable bounds include transformed bevels, active instances and line geometry', () => {
  const root = new Group(); root.position.set(3, -2, -5); root.rotation.set(.3, .6, .2)
  const bevel = new Mesh(new RoundedBoxGeometry(3, 2, 4, 2, .2), new MeshBasicMaterial()); bevel.rotation.y = .7
  const instances = new InstancedMesh(new BoxGeometry(.4, .8, .6), new MeshBasicMaterial(), 3)
  instances.setMatrixAt(0, new Matrix4().makeTranslation(0, 0, -20))
  instances.setMatrixAt(1, new Matrix4().makeRotationY(.8).setPosition(4, 0, -30))
  instances.setMatrixAt(2, new Matrix4().makeTranslation(0, 0, -10000)); instances.count = 2
  const line = new Line(new BufferGeometry().setFromPoints([new Vector3(0, 0, -40), new Vector3(1, 2, -42)]), new LineBasicMaterial())
  root.add(bevel, instances, line)
  const { camera, clipping } = setup(root); camera.aspect = 2; clipping.ensureProjection()
  const expected = new Box3().setFromObject(root), actual = clipping.bounds()
  assert.ok(actual.min.distanceTo(expected.min) < 1e-6 && actual.max.distanceTo(expected.max) < 1e-6)
  assert.ok(camera.near > 1 && camera.far < 1000, 'inactive allocated instances do not inflate clipping')
  const position = bevel.geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) covered(camera, new Vector3().fromBufferAttribute(position, i).applyMatrix4(bevel.matrixWorld))
  covered(camera, new Vector3(1, 2, -42).applyMatrix4(line.matrixWorld))
})

test('a box crossing the camera plane uses the conservative minimum instead of its positive corners', () => {
  const { camera, clipping } = setup(box(2, 10), box(1, -20))
  clipping.ensureProjection()
  assert.equal(camera.near, .00001)
  assert.ok(camera.far > 30.5)
  covered(camera, new Vector3(0, 0, 9.999))
})

test('empty scenes and entirely behind-camera bounds stay finite and can reappear after a camera turn', () => {
  const empty = setup(); empty.clipping.ensureProjection()
  assert.ok(Number.isFinite(empty.camera.near) && Number.isFinite(empty.camera.far) && empty.camera.near > 0 && empty.camera.far > empty.camera.near)
  const { camera, clipping } = setup(box(2, 20)); clipping.ensureProjection()
  assert.ok(camera.near > 0 && camera.far > camera.near)
  camera.lookAt(0, 0, 20); clipping.ensureProjection()
  assert.ok(camera.near > 1); covered(camera, new Vector3(0, 0, 19)); covered(camera, new Vector3(0, 0, 21))
})

test('simultaneous nearby and remote geometry expands immediately without sacrificing either', () => {
  const { camera, clipping } = setup(box(.004, 9.99), box(2, -1000000))
  camera.near = 100; camera.far = 101; camera.updateProjectionMatrix()
  clipping.ensureProjection()
  assert.ok(camera.near < .008 && camera.far > 1000011)
  covered(camera, new Vector3(0, 0, 9.992)); covered(camera, new Vector3(0, 0, -1000001))
})

test('explicit invalidation updates additions, movement, visibility and mutable geometry before rendering', () => {
  const root = new Group(), model = box(); root.add(model)
  const { camera, clipping } = setup(root); clipping.ensureProjection()
  const remote = box(2, -200); root.add(remote); model.position.z = 9
  clipping.invalidateBounds(); clipping.ensureProjection()
  assert.ok(camera.near < .5 && camera.far > 211)
  remote.visible = false; model.geometry.scale(1, 1, 1.5)
  clipping.invalidateBounds(); clipping.ensureProjection()
  assert.ok(camera.near < .25 && camera.far < 3)
  covered(camera, new Vector3(0, 0, 9.75))
})

test('camera navigation reuses cached geometry bounds and world corners', () => {
  const model = box(); let computations = 0
  const compute = model.geometry.computeBoundingBox.bind(model.geometry)
  model.geometry.boundingBox = null; model.geometry.computeBoundingBox = () => { computations++; compute() }
  const { camera, clipping } = setup(model); clipping.ensureProjection()
  assert.equal(computations, 1)
  for (let i = 0; i < 20; i++) { camera.position.x += .01; camera.lookAt(0, 0, 0); clipping.ensureProjection() }
  assert.equal(computations, 1, 'navigation never rescans positions or rebuilds geometry')
  model.position.x += 1; clipping.invalidateBounds(); clipping.ensureProjection()
  assert.equal(computations, 1, 'pose-only bounds refresh reuses geometry bounds')
})

test('billboard sprite depth follows its center rather than its rotated object box', () => {
  const sprite = new Sprite(new SpriteMaterial()); sprite.scale.set(40, 20, 1); sprite.rotation.y = Math.PI / 2; sprite.userData.ignorePick = true
  const { camera, clipping } = setup(sprite); clipping.ensureProjection()
  assert.ok(camera.near > 1 && camera.near < 10 && camera.far > 10 && camera.far < 15)
  covered(camera, new Vector3())
  camera.position.set(10, 0, 0); camera.lookAt(0, 0, 0); clipping.ensureProjection()
  assert.ok(camera.near > 1); covered(camera, new Vector3())
})

test('first encounter refreshes stale geometry boxes and instance edits refresh the aggregate', () => {
  const geometry = new BoxGeometry(); geometry.computeBoundingBox()
  const position = geometry.getAttribute('position'); position.setZ(0, -50); position.needsUpdate = true
  const instances = new InstancedMesh(geometry, new MeshBasicMaterial(), 2)
  const { camera, clipping } = setup(instances); clipping.ensureProjection()
  assert.ok(camera.far > 60, 'a precomputed box cannot hide later vertex edits')
  instances.setMatrixAt(1, new Matrix4().makeTranslation(0, 0, -200)); instances.instanceMatrix.needsUpdate = true
  clipping.invalidateBounds(); clipping.ensureProjection()
  assert.ok(camera.far > 260)
  instances.count = 1; clipping.invalidateBounds(); clipping.ensureProjection()
  assert.ok(camera.far < 100, 'deactivated instances leave the depth range immediately')
})

test('an offscreen eye-plane crossing uses the finite depth where its box enters the side cone', () => {
  const slab = new Mesh(new BoxGeometry(2, 2, 21), new MeshBasicMaterial()); slab.position.set(3, 0, .5)
  const { camera, clipping } = setup(slab)
  camera.near = 90; camera.far = 100; camera.updateProjectionMatrix()
  clipping.ensureProjection()
  // The slab spans eye-depth -1..20, but its nearest X is 2. At a 21-degree
  // half field of view, it enters the viewport only after depth 2/tan(21).
  assert.ok(camera.near > 4 && camera.near < 5, 'an offscreen crossing must not force the tiny-near fallback')
  covered(camera, new Vector3(2, 0, 2))
  const visible = new Vector3(2, 0, 2).project(camera)
  assert.ok(Math.abs(visible.x) < 1 && visible.z >= -1 && visible.z <= 1)
  camera.position.x = 3; clipping.ensureProjection()
  assert.equal(camera.near, .00001, 'moving the apex inside the same cached box immediately expands clipping')
  camera.position.x = 0; clipping.ensureProjection()
  assert.ok(camera.near > 4, 'camera-only navigation restores precision without invalidating geometry')
})

test('a wholly offscreen crossing box does not affect depth and reenters after turning', () => {
  const offscreen = new Mesh(new BoxGeometry(2, 2, 3), new MeshBasicMaterial()); offscreen.position.set(100, 0, 10)
  const { camera, clipping } = setup(box(), offscreen); clipping.ensureProjection()
  assert.ok(camera.near > 8 && camera.far < 13)
  camera.lookAt(offscreen.position); clipping.ensureProjection()
  covered(camera, new Vector3(99, 0, 10))
  assert.ok(camera.far > 100, 'side-cone rejection never locks out geometry that comes into view')
})

test('a rotated box containing the camera retains the conservative minimum', () => {
  const enclosing = new Mesh(new BoxGeometry(6, 2, 2), new MeshBasicMaterial()); enclosing.position.z = 10; enclosing.rotation.set(.2, .6, .3)
  const { camera, clipping } = setup(enclosing); clipping.ensureProjection()
  assert.equal(camera.near, .00001)
  assert.ok(camera.far > camera.near)
})

test('side-cone clipping follows view-offset intrinsics before the main projection changes', () => {
  const slab = new Mesh(new BoxGeometry(2, 2, 21), new MeshBasicMaterial()); slab.position.set(3, 0, .5)
  const left = box(); left.position.x = -2
  const { camera, clipping } = setup(slab, left); clipping.ensureProjection()
  assert.ok(camera.near > 4 && camera.near < 5)
  camera.setViewOffset(1000, 1000, 0, 0, 500, 1000)
  clipping.ensureProjection()
  assert.ok(camera.near > 8, 'the positive-X slab is outside a left-half viewport')
  camera.clearViewOffset(); clipping.ensureProjection()
  assert.ok(camera.near > 4 && camera.near < 5)
})

test('side-cone intersection retains face interiors when every original box corner is outside', () => {
  const wall = new Mesh(new BoxGeometry(18, 40, 21), new MeshBasicMaterial()); wall.position.set(11, 0, .5)
  const { camera, clipping } = setup(wall); clipping.ensureProjection()
  assert.ok(camera.near > 4 && camera.near < 5, 'clipping faces must retain edge/cone intersections even without an inside corner')
  covered(camera, new Vector3(2, 0, 2))
})

test('a wholly offscreen near-camera sprite cannot collapse visible model depth precision', () => {
  const sprite = new Sprite(new SpriteMaterial()); sprite.position.set(10, 0, 9.999); sprite.scale.set(3.2, .5, 1); sprite.userData.ignorePick = true
  const { camera, clipping } = setup(box(), sprite); clipping.ensureProjection()
  assert.ok(camera.near > 8, 'an offscreen CLOCK-style label does not force an almost-zero near plane')
  camera.position.x = 10; clipping.ensureProjection()
  assert.ok(camera.near < .001, 'the same cached billboard expands clipping immediately when it enters the view')
  covered(camera, sprite.position)
  camera.position.x = 0; clipping.ensureProjection(); assert.ok(camera.near > 8)
})

test('billboard edges remain protected when the sprite center is outside the side cone', () => {
  const sprite = new Sprite(new SpriteMaterial()); sprite.position.set(1, 0, 9.999); sprite.scale.set(3, .5, 1)
  const { camera, clipping } = setup(box(), sprite); clipping.ensureProjection()
  assert.ok(camera.near < .001, 'a visible edge of a large billboard contributes even when its center is offscreen')
  covered(camera, new Vector3(0, 0, 9.999))
})

test('sprite visibility respects its pivot and material rotation rather than object rotation', () => {
  const sprite = new Sprite(new SpriteMaterial()); sprite.position.set(1, 0, 9.999); sprite.scale.set(3, .2, 1); sprite.center.set(0, .5); sprite.rotation.z = Math.PI
  const { camera, clipping } = setup(box(), sprite); clipping.ensureProjection()
  assert.ok(camera.near > 8, 'object rotation does not rotate Three billboard vertices')
  sprite.material.rotation = Math.PI; clipping.invalidateBounds(); clipping.ensureProjection()
  assert.ok(camera.near < .001, 'material rotation swings the pivoted billboard across the viewport')
  sprite.material.rotation = 0; clipping.invalidateBounds(); clipping.ensureProjection(); assert.ok(camera.near > 8)
})

test('non-attenuated sprite side bounds scale with eye depth', () => {
  const sprite = new Sprite(new SpriteMaterial({ sizeAttenuation: false })); sprite.position.set(.002, 0, 9.999); sprite.scale.set(3, .5, 1)
  const { camera, clipping } = setup(box(), sprite); clipping.ensureProjection()
  assert.ok(camera.near > 8, 'constant-screen-size billboards use the depth-scaled quad, not the unscaled world rectangle')
  sprite.position.x = .001; clipping.invalidateBounds(); clipping.ensureProjection()
  assert.ok(camera.near < .001)
})
