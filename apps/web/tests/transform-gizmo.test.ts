import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { createComponentTransformGizmo, type TransformHandle } from '../src/three/ComponentTransformGizmo'

function setup(placement = false) {
  const gizmo = createComponentTransformGizmo(), model = new Group()
  model.userData = { id: placement ? 'PLACE' : 'selected', kind: placement ? 'placement' : 'component', size: [.8, .6, .6] }
  const camera = new PerspectiveCamera(42, 1000 / 700, .01, 1000)
  camera.position.set(0, 12, .001); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  gizmo.update(model, [model], camera, 1000, 700)
  const group = (id: TransformHandle) => gizmo.root.children.find(child => child.userData.transformHandle === id) as Group
  const point = (local: Vector3, parent: Group = gizmo.root) => {
    const p = parent.localToWorld(local.clone()).project(camera)
    return { x: (p.x + 1) * 500, y: (1 - p.y) * 350 }
  }
  const pick = (local: Vector3, parent?: Group) => {
    const p = point(local, parent), ray = new Raycaster()
    ray.setFromCamera(new Vector2(p.x / 500 - 1, 1 - p.y / 350), camera)
    return gizmo.pick(ray)?.handle ?? null
  }
  return { gizmo, model, camera, group, point, pick }
}

test('separate white triangle handles and a cyan rounded square replace the shaft arrows and diamond', () => {
  const h = setup()
  for (const id of ['x', 'z'] as const) {
    const face = h.group(id).getObjectByName(`${id}-face`) as Mesh | undefined
    assert.ok(face, `${id} must have a distinct beveled triangle face`)
    assert.equal(face.geometry.type, 'ExtrudeGeometry')
    assert.equal((face.material as MeshBasicMaterial[])[0].color.getHexString(), 'f8fafc')
    assert.equal(h.pick(new Vector3(id === 'x' ? .88 : 0, 0, id === 'z' ? .88 : 0)), id)
  }
  const square = h.group('xz').getObjectByName('xz-face') as Mesh | undefined
  assert.ok(square, 'free movement must have its own cyan square face')
  assert.equal((square.material as MeshBasicMaterial[])[0].color.getHexString(), '00bce7')
  assert.equal(square.rotation.y, 0, 'square edges must stay parallel to world X/Z')
  assert.equal(h.pick(new Vector3(.22, 0, .22)), 'xz', 'square corners are interactive, not a circular/diamond proxy')
  assert.equal(h.pick(new Vector3(.47, 0, 0)), null, 'empty space between square and triangle is not an old shaft hitbox')
})

test('the yellow arc has round ends, a hollow knob and picking only on rendered geometry', () => {
  const h = setup(), group = h.group('rotate-y')
  assert.ok(group.getObjectByName('rotation-arc'))
  assert.ok(group.getObjectByName('rotation-start-cap'))
  assert.ok(group.getObjectByName('rotation-end-cap'))
  assert.ok(group.getObjectByName('rotation-knob'))
  assert.equal(h.pick(new Vector3(-1.35, 0, 0), group), null, 'the knob hole stays hollow and cannot pick a hidden disk')
  const marker = h.gizmo.position('rotate-y')!
  const markerLocal = h.gizmo.root.worldToLocal(marker.clone())
  assert.equal(h.pick(markerLocal), 'rotate-y', 'the advertised grip position must lie on its visible ring')
  for (const angle of [0.3, 1.1, 4.2, 5.4]) {
    assert.equal(h.pick(new Vector3(Math.cos(angle) * 1.35, 0, Math.sin(angle) * 1.35), group), 'rotate-y')
  }
  assert.equal(h.pick(new Vector3(Math.cos(2.2) * 1.35, 0, Math.sin(2.2) * 1.35), group), null)
})

test('placement capture follows separated handles and the visible arc while empty gaps remain free', () => {
  const h = setup(true)
  for (const local of [new Vector3(.88, 0, 0), new Vector3(0, 0, .88), new Vector3(.22, 0, .22)]) {
    h.gizmo.clearPlacementCapture()
    const p = h.point(local)
    h.gizmo.capturePlacement(p.x, p.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), true)
  }
  const rotate = h.group('rotate-y')
  for (const [angle, blocked] of [[5.1, true], [2.2, false]] as const) {
    h.gizmo.clearPlacementCapture()
    const p = h.point(new Vector3(Math.cos(angle) * 1.35, 0, Math.sin(angle) * 1.35), rotate)
    h.gizmo.capturePlacement(p.x, p.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), blocked)
  }
  assert.equal(h.gizmo.position('delete'), null)
})

test('raycasting follows the rotated visible knob and independent world-axis handles in an oblique view', () => {
  const h = setup()
  h.model.rotation.y = Math.PI / 2
  h.camera.position.set(5, 11, 8); h.camera.lookAt(0, 0, 0); h.camera.updateMatrixWorld()
  h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
  for (const id of ['x', 'z', 'xz', 'rotate-y', 'delete'] as const) {
    const marker = h.gizmo.position(id)!
    assert.equal(h.pick(h.gizmo.root.worldToLocal(marker.clone())), id, `${id}: visual marker must remain reachable`)
  }
  const ring = h.group('rotate-y')
  assert.equal(h.pick(new Vector3(-1.35, 0, 0), ring), null, 'rotating the arc keeps the knob hole open')
  assert.equal(h.pick(new Vector3(Math.cos(5.1) * 1.35, 0, Math.sin(5.1) * 1.35), ring), 'rotate-y')
  assert.equal(h.pick(new Vector3(Math.cos(2.2) * 1.35, 0, Math.sin(2.2) * 1.35), ring), null)
})

test('hover and active feedback retain the bevel border and restore the requested button colors', () => {
  const h = setup(), face = h.group('x').getObjectByName('x-face') as Mesh
  const border = h.group('x').getObjectByName('x-border') as Mesh
  const materials = face.material as MeshBasicMaterial[], originalBorder = (border.material as MeshBasicMaterial).color.getHex()
  h.gizmo.hover('x')
  assert.notEqual(materials[0].color.getHexString(), 'f8fafc')
  assert.equal((border.material as MeshBasicMaterial).color.getHex(), originalBorder)
  h.gizmo.activate('x', h.model)
  assert.equal(materials[0].color.getHexString(), '46d7c7')
  h.gizmo.activate(null)
  assert.equal(materials[0].color.getHexString(), 'f8fafc')
  assert.equal(materials[1].color.getHexString(), 'd1d7dc')
})
