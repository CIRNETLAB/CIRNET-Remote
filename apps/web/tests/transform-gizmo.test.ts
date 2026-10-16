import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { createComponentTransformGizmo, type TransformHandle } from '../src/three/ComponentTransformGizmo'
import { createTechnicalGrid } from '../src/three/TechnicalGrid'
import { disposeObject } from '../src/three/ComponentModel'

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
  assert.equal(square.rotation.y, 0, 'square edges remain aligned with the overlay')
  assert.equal(h.pick(new Vector3(.22, 0, .22)), 'xz', 'square corners are interactive, not a circular/diamond proxy')
  assert.equal(h.pick(new Vector3(.47, 0, 0)), null, 'empty space between square and triangle is not an old shaft hitbox')
})

test('the translucent white arc keeps its rounded ends and concentric yellow knob on the arc with an enlarged invisible grip target', () => {
  const h = setup(), group = h.group('rotate-y')
  const arc = group.getObjectByName('rotation-arc') as Mesh
  assert.ok(arc)
  assert.equal((arc.material as MeshBasicMaterial).color.getHexString(), 'ffffff')
  assert.ok((arc.material as MeshBasicMaterial).opacity >= 0.35 && (arc.material as MeshBasicMaterial).opacity <= 0.45)
  assert.ok(group.getObjectByName('rotation-start-cap'))
  assert.ok(group.getObjectByName('rotation-end-cap'))

  // Multi-layered concentric yellow knob
  const knob = group.getObjectByName('rotation-knob') as Mesh
  assert.ok(knob, 'outer border ring must exist')
  assert.equal(knob.geometry.type, 'TorusGeometry')
  assert.equal((knob.material as MeshBasicMaterial).color.getHexString(), 'ffd54a', 'knob outer border must be yellow #FFD54A')

  const groove = group.getObjectByName('rotation-knob-groove') as Mesh
  assert.ok(groove, 'middle groove must exist')
  assert.equal(groove.geometry.type, 'CylinderGeometry')
  assert.equal((groove.material as MeshBasicMaterial).color.getHexString(), '1e2631', 'knob groove must be dark blue-gray')

  const core = group.getObjectByName('rotation-knob-core') as Mesh
  assert.ok(core, 'inner core must exist')
  assert.equal(core.geometry.type, 'CylinderGeometry')
  assert.equal((core.material as MeshBasicMaterial).color.getHexString(), 'ffe375', 'knob core must be bright yellow #FFE375')

  const highlight = group.getObjectByName('rotation-knob-highlight') as Mesh
  assert.ok(highlight, 'core highlight must exist')
  assert.equal(highlight.geometry.type, 'CylinderGeometry')
  assert.equal((highlight.material as MeshBasicMaterial).color.getHexString(), 'fff3b0', 'knob highlight must be #FFF3B0')

  const marker = h.gizmo.position('rotate-y')!
  const markerLocal = h.gizmo.root.worldToLocal(marker.clone())
  assert.equal(h.pick(markerLocal), 'rotate-y', 'the advertised grip center must be easy to acquire')
  assert.ok(Math.abs(Math.hypot(knob.position.x, knob.position.z) - 1.35) < 1e-6, 'knob center must lie directly on the arc radius')
  assert.ok(Math.abs(Math.hypot(groove.position.x, groove.position.z) - 1.35) < 1e-6, 'groove must be centered on the arc radius')
  assert.ok(Math.abs(Math.hypot(core.position.x, core.position.z) - 1.35) < 1e-6, 'core must be centered on the arc radius')
  for (const angle of [0.3, 1.1, 3.8, 4.4]) {
    assert.equal(h.pick(new Vector3(Math.cos(angle) * 1.35, 0, Math.sin(angle) * 1.35), group), 'rotate-y')
  }
  assert.equal(h.pick(new Vector3(Math.SQRT1_2 * 1.35, 0, -Math.SQRT1_2 * 1.35), group), null, 'the upper-right quadrant is the open gap')
})

test('placement capture follows separated handles and the visible arc while empty gaps remain free', () => {
  const h = setup(true)
  for (const local of [new Vector3(.88, 0, 0), new Vector3(0, 0, .88)]) {
    h.gizmo.clearPlacementCapture()
    const p = h.point(local)
    h.gizmo.capturePlacement(p.x, p.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), true)
  }
  const rotate = h.group('rotate-y')
  for (const [angle, blocked] of [[4.2, true], [5.5, false]] as const) {
    h.gizmo.clearPlacementCapture()
    const p = h.point(new Vector3(Math.cos(angle) * 1.35, 0, Math.sin(angle) * 1.35), rotate)
    h.gizmo.capturePlacement(p.x, p.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), blocked)
  }
  assert.equal(h.gizmo.position('delete'), null)
})

test('cursor-follow at the pivot does not acquire the free handle until the overlay is deliberately approached', () => {
  const h = setup(true)
  try {
    for (let i = 0; i < 20; i++) {
      const next = h.point(new Vector3(.02, 0, 0))
      h.gizmo.capturePlacement(next.x, next.y, h.camera, 1000, 700)
      assert.equal(h.gizmo.placementFollowBlocked(), false, 'small cursor-follow samples must not self-capture the centered XZ handle')
      h.model.position.x += .01
      h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
    }
    const axis = h.point(new Vector3(.95, 0, 0))
    h.gizmo.capturePlacement(axis.x, axis.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), true, 'a deliberate approach to a separated handle acquires the overlay')
    const center = h.point(new Vector3())
    h.gizmo.capturePlacement(center.x, center.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), true, 'the free handle remains usable after acquiring the overlay')
    assert.equal(h.pick(new Vector3()), 'xz', 'the free handle remains a real pointer-down target')
  } finally { disposeObject(h.gizmo.root) }
})

test('camera navigation releases placement capture at the old screen location', () => {
  const h = setup(true)
  try {
    const axis = h.point(new Vector3(.95, 0, 0))
    h.gizmo.capturePlacement(axis.x, axis.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), true)
    h.camera.position.x += 10
    h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), false, 'the capture belongs to the current view, not the old screen coordinates')
    h.gizmo.capturePlacement(axis.x, axis.y, h.camera, 1000, 700)
    assert.equal(h.gizmo.placementFollowBlocked(), false)
  } finally { disposeObject(h.gizmo.root) }
})

test('raycasting follows the visible fixed overlay in an oblique view', () => {
  const h = setup()
  h.model.rotation.y = Math.PI / 2
  h.camera.position.set(5, 11, 8); h.camera.lookAt(0, 0, 0); h.camera.updateMatrixWorld()
  h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
  for (const id of ['x', 'z', 'xz', 'rotate-y', 'delete'] as const) {
    const marker = h.gizmo.position(id)!
    assert.equal(h.pick(h.gizmo.root.worldToLocal(marker.clone())), id, `${id}: visual marker must remain reachable`)
  }
  const ring = h.group('rotate-y')
  const knob = ring.getObjectByName('rotation-knob') as Mesh
  assert.equal(h.pick(knob.position, ring), 'rotate-y', 'the invisible target fills the hollow visual grip')
  assert.equal(h.pick(new Vector3(Math.cos(4.2) * 1.35, 0, Math.sin(4.2) * 1.35), ring), 'rotate-y')
  assert.equal(h.pick(new Vector3(Math.SQRT1_2 * 1.35, 0, -Math.SQRT1_2 * 1.35), ring), null)
})

test('the overlay stays anchored to the object pivot instead of seeking a free adjacent location', () => {
  for (const placement of [false, true]) {
    const h = setup(placement), neighbor = new Group()
    neighbor.userData = { size: [10, 10, 10] }
    h.model.position.set(1.25, .7, -2)
    const update = () => h.gizmo.update(h.model, [h.model, neighbor], h.camera, 1000, 700, [{ left: 0, right: 1000, top: 0, bottom: 700 }], 1)
    try {
      update()
      assert.ok(h.gizmo.origin()!.distanceTo(h.model.position) < 1e-9, 'pivot anchoring cannot change to avoid models or panels')
      h.gizmo.activate('rotate-y', h.model)
      h.model.position.add(new Vector3(.5, .2, .7)); h.model.rotation.y = 2.3
      update()
      assert.ok(h.gizmo.origin()!.distanceTo(h.model.position) < 1e-9, 'preview transforms retain the live pivot')
      h.gizmo.activate(null); update()
      assert.ok(h.gizmo.origin()!.distanceTo(h.model.position) < 1e-9, 'release does not relocate the overlay')
    } finally { disposeObject(h.gizmo.root) }
  }
})

test('the transparent grid sorts before every visible gizmo surface in the actual renderer render list', async () => {
  // Characterize the queue boundary that caused this regression: renderOrder
  // cannot move an opaque material after the separate transparent render pass.
  const rendererLists = new URL('../node_modules/three/src/renderers/webgl/WebGLRenderLists.js', import.meta.url)
  const { WebGLRenderList } = await import(rendererLists.href)
  const list = new WebGLRenderList(), h = setup(), grid = createTechnicalGrid()
  try {
    list.push(grid, grid.geometry, grid.material, 0, 0, null)
    let surfaces = 0
    h.gizmo.root.traverse((object) => {
      if (!(object instanceof Mesh) || object.userData.pickOnly) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        assert.equal(material.depthTest, false)
        assert.equal(material.depthWrite, false)
        list.push(object, object.geometry, material, 0, -100, null)
        surfaces++
      }
    })
    list.sort()
    assert.equal(list.opaque.length, 0, 'overlay surfaces must share the grid transparent pass')
    assert.equal(list.transparent.length, surfaces + 1)
    assert.ok(list.transparent[0].object === grid, 'grid must render before the whole overlay independent of camera depth')
  } finally { disposeObject(h.gizmo.root); disposeObject(grid) }
})

test('the fixed left grip stays circular, distinct and pickable across object yaw, camera headings and zoom', () => {
  const h = setup(true)
  try {
    for (const position of [new Vector3(0, 12, .001), new Vector3(5, 11, 8), new Vector3(-8, 4, 6), new Vector3(0, 1, 12), new Vector3(0, 0, 12), new Vector3(0, -8, 6)]) {
      for (const zoom of [.5, 1, 3]) for (const yaw of [0, 45, 90, 135, 180, 225, 270, 315]) {
        h.camera.position.copy(position); h.camera.lookAt(0, 0, 0)
        if (position.y === 0) h.camera.rotateZ(.4)
        h.camera.zoom = zoom; h.camera.updateProjectionMatrix(); h.camera.updateMatrixWorld()
        h.model.rotation.y = yaw * Math.PI / 180
        h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
        const knob = h.group('rotate-y').getObjectByName('rotation-knob') as Mesh
        const ratio = Math.hypot(knob.position.x, knob.position.z) / 1.35
        assert.ok(Math.abs(ratio - 1.0) < 1e-6, `grip must be on the arc at yaw ${yaw}`)
        const marker = h.gizmo.position('rotate-y')!, local = h.gizmo.root.worldToLocal(marker.clone())
        const center = h.point(local)
        const pivot = h.point(new Vector3())
        assert.ok(Math.abs(center.x - pivot.x + 56.7) < .001, `knob is fixed 56.7 pixels left of the pivot at yaw ${yaw}, zoom ${zoom}`)
        assert.ok(Math.abs(center.y - pivot.y) < .001, `knob stays at nine o'clock at yaw ${yaw}, zoom ${zoom}`)
        const top = h.point(new Vector3(0, 0, -1.35)), right = h.point(new Vector3(1.35, 0, 0))
        assert.ok(Math.abs(top.x - pivot.x) < .001 && Math.abs(top.y - pivot.y + 56.7) < .001, 'ring top stays directly above its pivot')
        assert.ok(Math.abs(right.x - pivot.x - 56.7) < .001 && Math.abs(right.y - pivot.y) < .001, 'ring retains its circular screen footprint')
        assert.equal(h.pick(local), 'rotate-y', `grip center at yaw ${yaw}, zoom ${zoom}`)
        for (const id of ['x', 'z', 'xz'] as const) {
          const projected: { x: number; y: number }[] = []
          h.group(id).traverse(object => {
            if (!(object instanceof Mesh)) return
            object.geometry.computeBoundingBox()
            const area = object.geometry.boundingBox!
            for (const x of [area.min.x, area.max.x]) for (const y of [area.min.y, area.max.y]) for (const z of [area.min.z, area.max.z]) {
              const p = object.localToWorld(new Vector3(x, y, z)).project(h.camera)
              projected.push({ x: (p.x + 1) * 500, y: (1 - p.y) * 350 })
            }
          })
          const left = Math.min(...projected.map(p => p.x)), right = Math.max(...projected.map(p => p.x))
          const top = Math.min(...projected.map(p => p.y)), bottom = Math.max(...projected.map(p => p.y))
          assert.ok(center.x < left - 10 || center.x > right + 10 || center.y < top - 10 || center.y > bottom + 10, `grip must clear ${id} at yaw ${yaw}, zoom ${zoom}`)
          const handle = h.gizmo.position(id)!
          // At an almost side-on view the existing ring/buttons can project
          // over one another; the new grip target must not cover a button.
          const handleScreen = h.point(h.gizmo.root.worldToLocal(handle.clone())), handleRay = new Raycaster()
          handleRay.setFromCamera(new Vector2(handleScreen.x / 500 - 1, 1 - handleScreen.y / 350), h.camera)
          const target = h.group('rotate-y').getObjectByName('rotation-knob-target') as Mesh
          assert.equal(handleRay.intersectObject(target).length, 0, `${id} must not be covered by the grip target`)
        }
        // A ten-pixel screen-space miss must still acquire the knob, even when
        // the torus is almost edge-on. The target never paints a filled disk.
        const ray = new Raycaster()
        ray.setFromCamera(new Vector2((center.x - 7) / 500 - 1, 1 - center.y / 350), h.camera)
        assert.equal(h.gizmo.pick(ray)?.handle, 'rotate-y')
        h.gizmo.clearPlacementCapture(); h.gizmo.capturePlacement(center.x, center.y, h.camera, 1000, 700)
        assert.equal(h.gizmo.placementFollowBlocked(), true, 'placement must freeze before the pointer reaches the grip')
      }
    }
    const target = h.group('rotate-y').getObjectByName('rotation-knob-target') as Mesh
    assert.ok(target?.userData.pickOnly)
    assert.equal((target.material as MeshBasicMaterial).opacity, 0)
  } finally { disposeObject(h.gizmo.root) }
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

test('Rotate Y hover and drag brighten the concentric yellow knob and increase white arc prominence without changing color to cyan', () => {
  const h = setup(), group = h.group('rotate-y')
  const arc = group.getObjectByName('rotation-arc') as Mesh
  const knob = group.getObjectByName('rotation-knob') as Mesh
  const groove = group.getObjectByName('rotation-knob-groove') as Mesh
  const core = group.getObjectByName('rotation-knob-core') as Mesh
  const highlight = group.getObjectByName('rotation-knob-highlight') as Mesh

  const arcMat = arc.material as MeshBasicMaterial
  const knobMat = knob.material as MeshBasicMaterial
  const grooveMat = groove.material as MeshBasicMaterial
  const coreMat = core.material as MeshBasicMaterial
  const highlightMat = highlight.material as MeshBasicMaterial

  // Normal rest state
  assert.equal(arcMat.color.getHexString(), 'ffffff')
  assert.equal(arcMat.opacity, 0.4)
  assert.equal(knobMat.color.getHexString(), 'ffd54a', 'knob outer border is #FFD54A')
  assert.equal(grooveMat.color.getHexString(), '1e2631', 'groove is dark blue-gray #1e2631')
  assert.equal(coreMat.color.getHexString(), 'ffe375', 'core is bright yellow #FFE375')
  assert.equal(highlightMat.color.getHexString(), 'fff3b0', 'highlight is #FFF3B0')

  // Hover state
  h.gizmo.hover('rotate-y')
  assert.equal(arcMat.color.getHexString(), 'ffffff', 'hover arc must remain white, not cyan or yellow')
  assert.equal(arcMat.opacity, 0.75, 'hover increases arc white prominence')
  assert.equal(knobMat.color.getHexString(), 'ffe375', 'hover outer border brightens to #FFE375')
  assert.equal(coreMat.color.getHexString(), 'fff3b0', 'hover core brightens to #FFF3B0')
  assert.notEqual(knobMat.color.getHexString(), '46d7c7', 'never turn cyan')
  assert.notEqual(knobMat.color.getHexString(), 'a6eee4', 'never turn cyan')

  // Active / drag state
  h.gizmo.activate('rotate-y', h.model)
  assert.equal(arcMat.color.getHexString(), 'ffffff', 'active drag arc must remain white, not cyan or yellow')
  assert.equal(arcMat.opacity, 1.0, 'drag increases arc white prominence to maximum')
  assert.equal(knobMat.color.getHexString(), 'fff3b0', 'active outer border is #FFF3B0')
  assert.notEqual(knobMat.color.getHexString(), '46d7c7', 'never turn cyan')

  // Release state
  h.gizmo.activate(null)
  assert.equal(arcMat.color.getHexString(), 'ffffff')
  assert.equal(arcMat.opacity, 0.4)
  assert.equal(knobMat.color.getHexString(), 'ffd54a')
  assert.equal(coreMat.color.getHexString(), 'ffe375')
  assert.equal(highlightMat.color.getHexString(), 'fff3b0')
})

test('Delete button geometry and hitbox remain exact with redesigned blue-gray base, subtle ring, and coral red X', () => {
  const h = setup(), group = h.group('delete')
  const base = group.getObjectByName('delete-base') as Mesh
  const ring = group.getObjectByName('delete-ring') as Mesh
  const cross1 = group.getObjectByName('delete-cross-1') as Mesh
  const cross2 = group.getObjectByName('delete-cross-2') as Mesh
  const target = group.getObjectByName('delete-target') as Mesh

  // Verification of exact geometries
  assert.ok(base && ring && cross1 && cross2 && target)
  assert.equal(base.geometry.type, 'CylinderGeometry')
  assert.equal(ring.geometry.type, 'TorusGeometry')
  assert.equal(cross1.geometry.type, 'BoxGeometry')
  assert.equal(cross2.geometry.type, 'BoxGeometry')
  assert.equal(target.geometry.type, 'CylinderGeometry')
  assert.ok(target.userData.pickOnly, 'delete target must be pickOnly')

  // Exact positions
  assert.ok(Math.abs(base.position.x - 1.42) < 1e-6 && Math.abs(base.position.z - 1.42) < 1e-6)
  assert.ok(Math.abs(ring.position.x - 1.42) < 1e-6 && Math.abs(ring.position.z - 1.42) < 1e-6)
  assert.ok(Math.abs(cross1.position.x - 1.42) < 1e-6 && Math.abs(cross1.position.z - 1.42) < 1e-6)
  assert.ok(Math.abs(cross2.position.x - 1.42) < 1e-6 && Math.abs(cross2.position.z - 1.42) < 1e-6)
  assert.ok(Math.abs(target.position.x - 1.42) < 1e-6 && Math.abs(target.position.z - 1.42) < 1e-6)

  // Color & material styling at rest
  const baseMat = base.material as MeshBasicMaterial
  const ringMat = ring.material as MeshBasicMaterial
  const cross1Mat = cross1.material as MeshBasicMaterial
  const cross2Mat = cross2.material as MeshBasicMaterial

  assert.equal(baseMat.color.getHexString(), '405362', 'delete base is blue-gray #405362')
  assert.ok(baseMat.opacity >= 0.8 && baseMat.opacity <= 0.9, 'delete base opacity is between 0.8 and 0.9')
  assert.equal(ringMat.color.getHexString(), '8193a0', 'delete ring is #8193A0')
  assert.equal(cross1Mat.color.getHexString(), 'ff6c68', 'delete cross 1 is coral red #FF6C68')
  assert.equal(cross2Mat.color.getHexString(), 'ff6c68', 'delete cross 2 is coral red #FF6C68')

  // Hover state
  h.gizmo.hover('delete')
  assert.equal(baseMat.color.getHexString(), '506577', 'delete base brightens slightly on hover')
  assert.equal(ringMat.color.getHexString(), '9db0be', 'delete ring brightens slightly on hover')
  assert.equal(cross1Mat.color.getHexString(), 'ff8582', 'cross brightens to coral red on hover')
  assert.notEqual(cross1Mat.color.getHexString(), '46d7c7', 'never turn cyan')
  assert.notEqual(cross1Mat.color.getHexString(), 'a6eee4', 'never turn cyan')

  // Active state
  h.gizmo.activate('delete')
  assert.equal(baseMat.color.getHexString(), '5a7286', 'delete base on active')
  assert.equal(cross1Mat.color.getHexString(), 'ffa09d', 'cross on active')
  assert.notEqual(cross1Mat.color.getHexString(), '46d7c7', 'never turn cyan')

  // Release state
  h.gizmo.activate(null)
  assert.equal(baseMat.color.getHexString(), '405362', 'restores rest color on release')
  assert.equal(ringMat.color.getHexString(), '8193a0', 'restores rest color on release')
  assert.equal(cross1Mat.color.getHexString(), 'ff6c68', 'restores coral red on release')

  // Raycasting picks delete
  assert.equal(h.pick(new Vector3(1.42, 0, 1.42)), 'delete')
})

test('dragging Rotate Y rotates arc and knob synchronously with the drag angle while other buttons stay fixed', () => {
  const h = setup()
  const initialMarker = h.gizmo.position('rotate-y')!.clone()
  const initialX = h.gizmo.position('x')!.clone()
  const initialZ = h.gizmo.position('z')!.clone()
  const initialXZ = h.gizmo.position('xz')!.clone()
  const initialDelete = h.gizmo.position('delete')!.clone()

  h.gizmo.activate('rotate-y', h.model)
  // Simulate drag angle of 45 degrees
  const angle = Math.PI / 4
  h.gizmo.setRotation(angle)
  h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)

  // Rotated marker position
  const rotatedMarker = h.gizmo.position('rotate-y')!
  assert.ok(rotatedMarker.distanceTo(initialMarker) > 0.1, 'knob position must rotate with the drag angle')
  // Raycast at the new rotated knob position picks rotate-y
  const localRotated = h.gizmo.root.worldToLocal(rotatedMarker.clone())
  assert.equal(h.pick(localRotated), 'rotate-y', 'rotated knob must be pickable at its new position')

  // Other buttons are NOT rotated
  assert.ok(h.gizmo.position('x')!.distanceTo(initialX) < 1e-6, 'handle x must stay fixed')
  assert.ok(h.gizmo.position('z')!.distanceTo(initialZ) < 1e-6, 'handle z must stay fixed')
  assert.ok(h.gizmo.position('xz')!.distanceTo(initialXZ) < 1e-6, 'handle xz must stay fixed')
  assert.ok(h.gizmo.position('delete')!.distanceTo(initialDelete) < 1e-6, 'handle delete must stay fixed')

  // On release, rotate-y resets to rest position
  h.gizmo.activate(null)
  const restoredMarker = h.gizmo.position('rotate-y')!
  assert.ok(restoredMarker.distanceTo(initialMarker) < 1e-6, 'knob resets to rest position on release')
})

test('camera orbit, pan and zoom keep gizmo anchored at pivot without modifying model rotation', () => {
  const h = setup()
  const originalYaw = 1.25
  h.model.rotation.y = originalYaw
  h.model.position.set(2, 0.5, -3)

  // Orbit camera
  h.camera.position.set(10, 15, 10); h.camera.lookAt(2, 0.5, -3); h.camera.updateMatrixWorld()
  h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
  assert.equal(h.model.rotation.y, originalYaw, 'camera orbit must not change model rotation')
  assert.ok(h.gizmo.origin()!.distanceTo(h.model.position) < 1e-6, 'gizmo remains anchored at pivot')

  // Pan camera
  h.camera.position.add(new Vector3(5, 0, 5)); h.camera.updateMatrixWorld()
  h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
  assert.equal(h.model.rotation.y, originalYaw, 'camera pan must not change model rotation')
  assert.ok(h.gizmo.origin()!.distanceTo(h.model.position) < 1e-6, 'gizmo remains anchored at pivot')

  // Zoom camera
  h.camera.zoom = 2.5; h.camera.updateProjectionMatrix(); h.camera.updateMatrixWorld()
  h.gizmo.update(h.model, [h.model], h.camera, 1000, 700)
  assert.equal(h.model.rotation.y, originalYaw, 'camera zoom must not change model rotation')
  assert.ok(h.gizmo.origin()!.distanceTo(h.model.position) < 1e-6, 'gizmo remains anchored at pivot')
})

