import { BoxGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Raycaster, Shape, SphereGeometry, TorusGeometry, Vector3 } from 'three'

export type TransformHandle = 'x' | 'z' | 'xz' | 'rotate-y' | 'delete'
export interface GizmoObstacle { left: number; top: number; right: number; bottom: number }

const segmentDistance = (x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
}

const ARC_RADIUS = 1.35, ARC_START = 0, ARC_END = Math.PI * 1.5, ARC_KNOB_RADIUS = .16
const AXIS_OFFSET = .95, FREE_HALF_SIZE = .29, GRIP_RADIUS = ARC_RADIUS
const ARC_TUBE_RADIUS = 0.02, KNOB_TUBE_RADIUS = 0.024
// The meshes retain their XZ footprints. Facing that plane toward the camera
// maps +X to screen right and +Z to screen down, independent of object yaw.
const SCREEN_PLANE = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
function roundedFootprint(points: readonly [number, number][], rounding: number) {
  const shape = new Shape()
  points.forEach(([x, z], i) => {
    const before = points[(i + points.length - 1) % points.length], after = points[(i + 1) % points.length]
    const a = Math.hypot(before[0] - x, before[1] - z), b = Math.hypot(after[0] - x, after[1] - z)
    const step = Math.min(rounding, a / 3, b / 3)
    const start = [x + (before[0] - x) * step / a, -(z + (before[1] - z) * step / a)]
    const end = [x + (after[0] - x) * step / b, -(z + (after[1] - z) * step / b)]
    if (i === 0) shape.moveTo(start[0], start[1]); else shape.lineTo(start[0], start[1])
    shape.quadraticCurveTo(x, -z, end[0], end[1])
  })
  shape.closePath(); return shape
}

// A scene tool, never a circuit module, port or electrical node.
export function createComponentTransformGizmo() {
  const root = new Group(); root.name = 'component-transform-gizmo'; root.visible = false
  const handles = new Map<TransformHandle, Group>(), markers = new Map<TransformHandle, Vector3>()
  let selectedId: string | null = null, hovered: TransformHandle | null = null, active: TransformHandle | null = null
  let placementModel: Group | null = null, placementCaptured = false
  let captureView: { world: number[]; projection: number[]; width: number; height: number } | null = null
  let previousPointer: { x: number; y: number } | null = null
  let approach: { handle: TransformHandle; start: { x: number; y: number }; travel: number } | null = null
  let captureCorridor: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null
  const clearCapture = () => { placementCaptured = false; approach = null; captureCorridor = null; previousPointer = null }
  // The grid is transparent. Opaque tools are drawn before its separate pass,
  // even with a larger renderOrder. Share that pass, then order the overlay last.
  const material = (color: string, pickOnly = false, opacity = pickOnly ? 0 : 1) => new MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, opacity })
  const handle = (id: TransformHandle, color: string, point: Vector3) => {
    const group = new Group(); group.userData.transformHandle = id; group.userData.color = color
    handles.set(id, group); markers.set(id, point); root.add(group); return group
  }
  const add = (group: Group, mesh: Mesh, pickOnly = false) => { mesh.renderOrder = 20; mesh.userData.pickOnly = pickOnly; group.add(mesh); return mesh }
  const button = (group: Group, name: string, points: readonly [number, number][], face: string, side: string, x = 0, z = 0) => {
    const border = add(group, new Mesh(new ExtrudeGeometry(roundedFootprint(points.map(([px, pz]) => [px * 1.11, pz * 1.11]), .06), { depth: .035, bevelEnabled: true, bevelSize: .025, bevelThickness: .02, bevelSegments: 3, curveSegments: 10 }), material('#8b939c')))
    border.name = `${name}-border`; border.rotation.x = -Math.PI / 2; border.position.set(x, .015, z); border.userData.fixedColor = true
    const top = add(group, new Mesh(new ExtrudeGeometry(roundedFootprint(points, .065), { depth: .04, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 4, curveSegments: 10 }), [material(face), material(side)]))
    top.name = `${name}-face`; top.rotation.x = -Math.PI / 2; top.position.set(x, .055, z); top.renderOrder = 21
    // Two material tones expose the shallow bevel without depending on scene lights.
    top.userData.faceColors = [face, side]
    return top
  }
  for (const id of ['x', 'z'] as const) {
    const x = id === 'x' ? AXIS_OFFSET : 0, z = id === 'z' ? AXIS_OFFSET : 0
    const group = handle(id, '#f8fafc', new Vector3(x, 0, z))
    const triangle: [number, number][] = [[.26, 0], [-.20, -.23], [-.20, .23]]
    button(group, id, id === 'x' ? triangle : triangle.map(([px, pz]) => [pz, px]), '#f8fafc', '#d1d7dc', x, z)
  }
  const free = handle('xz', '#00bce7', new Vector3())
  button(free, 'xz', [[-FREE_HALF_SIZE, -FREE_HALF_SIZE], [FREE_HALF_SIZE, -FREE_HALF_SIZE], [FREE_HALF_SIZE, FREE_HALF_SIZE], [-FREE_HALF_SIZE, FREE_HALF_SIZE]], '#00bce7', '#008ead')
  const rotationGrip = new Vector3(-GRIP_RADIUS, 0, 0)
  const rotate = handle('rotate-y', '#ffffff', rotationGrip)
  const rotationPoint = (angle: number) => new Vector3(Math.cos(angle) * ARC_RADIUS, 0, Math.sin(angle) * ARC_RADIUS)
  // Keep the open arc independent of the inward grip: no line crosses its hole.
  const arc = add(rotate, new Mesh(new TorusGeometry(ARC_RADIUS, ARC_TUBE_RADIUS, 12, 96, ARC_END - ARC_START), material('#ffffff', false, .4)))
  arc.name = 'rotation-arc'; arc.rotation.x = Math.PI / 2; arc.rotation.z = ARC_START
  for (const [name, angle] of [['rotation-start-cap', ARC_START], ['rotation-end-cap', ARC_END]] as const) {
    const cap = add(rotate, new Mesh(new SphereGeometry(ARC_TUBE_RADIUS, 16, 10), material('#ffffff', false, .4)))
    cap.name = name; cap.position.copy(rotationPoint(angle))
  }
  // Either torus surface is visible for this overlay, including side views.
  const gripMaterial = material('#FFD54A')
  gripMaterial.side = DoubleSide
  const grip = add(rotate, new Mesh(new TorusGeometry(ARC_KNOB_RADIUS, KNOB_TUBE_RADIUS, 16, 48), gripMaterial))
  grip.name = 'rotation-knob'; grip.rotation.x = Math.PI / 2; grip.position.copy(rotationGrip); grip.renderOrder = 23
  grip.userData.role = 'knob-outer'

  const groove = add(rotate, new Mesh(new CylinderGeometry(0.136, 0.136, 0.02, 32), material('#1e2631')))
  groove.name = 'rotation-knob-groove'; groove.position.copy(rotationGrip); groove.renderOrder = 22
  groove.userData.role = 'knob-groove'

  const core = add(rotate, new Mesh(new CylinderGeometry(0.085, 0.085, 0.025, 32), material('#FFE375')))
  core.name = 'rotation-knob-core'; core.position.copy(rotationGrip); core.renderOrder = 24
  core.userData.role = 'knob-core'

  const highlight = add(rotate, new Mesh(new CylinderGeometry(0.048, 0.048, 0.03, 32), material('#FFF3B0')))
  highlight.name = 'rotation-knob-highlight'; highlight.position.copy(rotationGrip); highlight.renderOrder = 25
  highlight.userData.role = 'knob-highlight'

  const gripTarget = add(rotate, new Mesh(new SphereGeometry(.28, 16, 12), material('#FFD54A', true)), true)
  gripTarget.name = 'rotation-knob-target'; gripTarget.position.copy(rotationGrip)

  const deleteBtn = handle('delete', '#FF6C68', new Vector3(1.42, 0, 1.42))
  const deleteBase = add(deleteBtn, new Mesh(new CylinderGeometry(0.30, 0.30, 0.05, 32), material('#405362', false, 0.85)))
  deleteBase.name = 'delete-base'; deleteBase.renderOrder = 19; deleteBase.position.set(1.42, 0.025, 1.42)
  const deleteRing = add(deleteBtn, new Mesh(new TorusGeometry(0.28, 0.022, 8, 32), material('#8193A0', false, 0.9)))
  deleteRing.name = 'delete-ring'; deleteRing.rotation.x = Math.PI / 2; deleteRing.renderOrder = 20; deleteRing.position.set(1.42, 0.038, 1.42)
  const cross1 = add(deleteBtn, new Mesh(new BoxGeometry(0.30, 0.055, 0.075), material('#FF6C68')))
  cross1.name = 'delete-cross-1'; cross1.rotation.y = Math.PI / 4; cross1.position.set(1.42, 0.05, 1.42); cross1.renderOrder = 21
  const cross2 = add(deleteBtn, new Mesh(new BoxGeometry(0.30, 0.055, 0.075), material('#FF6C68')))
  cross2.name = 'delete-cross-2'; cross2.rotation.y = -Math.PI / 4; cross2.position.set(1.42, 0.05, 1.42); cross2.renderOrder = 21
  const deleteTarget = add(deleteBtn, new Mesh(new CylinderGeometry(0.35, 0.35, 0.16, 16), material('#FF6C68', true)), true)
  deleteTarget.name = 'delete-target'; deleteTarget.position.set(1.42, 0.05, 1.42)

  const paint = () => {
    for (const [id, group] of handles) {
      if (id === 'rotate-y') {
        const isHovered = hovered === 'rotate-y'
        const isActive = active === 'rotate-y'
        const arcOpacity = isActive ? 1.0 : isHovered ? .75 : .4
        const outerColor = isActive ? '#FFF3B0' : isHovered ? '#FFE375' : '#FFD54A'
        const coreColor = isActive ? '#FFFBEA' : isHovered ? '#FFF3B0' : '#FFE375'
        const highlightColor = isActive || isHovered ? '#FFFFFF' : '#FFF3B0'
        const grooveColor = isActive ? '#283646' : isHovered ? '#222d3a' : '#1e2631'
        for (const mesh of group.children as Mesh[]) {
          if (mesh.userData.pickOnly) continue
          const mat = mesh.material as MeshBasicMaterial
          if (mesh.name === 'rotation-knob') {
            mat.color.set(outerColor)
            mat.opacity = 1
          } else if (mesh.name === 'rotation-knob-core') {
            mat.color.set(coreColor)
            mat.opacity = 1
          } else if (mesh.name === 'rotation-knob-highlight') {
            mat.color.set(highlightColor)
            mat.opacity = 1
          } else if (mesh.name === 'rotation-knob-groove') {
            mat.color.set(grooveColor)
            mat.opacity = 1
          } else {
            mat.color.set('#ffffff')
            mat.opacity = arcOpacity
          }
        }
        continue
      }
      if (id === 'delete') {
        const isHovered = hovered === 'delete'
        const isActive = active === 'delete'
        const baseColor = isActive ? '#5a7286' : isHovered ? '#506577' : '#405362'
        const ringColor = isActive ? '#b0c2ce' : isHovered ? '#9db0be' : '#8193A0'
        const crossColor = isActive ? '#FFA09D' : isHovered ? '#FF8582' : '#FF6C68'
        for (const mesh of group.children as Mesh[]) {
          if (mesh.userData.pickOnly) continue
          const mat = mesh.material as MeshBasicMaterial
          if (mesh.name === 'delete-base') mat.color.set(baseColor)
          else if (mesh.name === 'delete-ring') mat.color.set(ringColor)
          else if (mesh.name === 'delete-cross-1' || mesh.name === 'delete-cross-2') mat.color.set(crossColor)
        }
        continue
      }
      for (const mesh of group.children as Mesh[]) {
        if (!mesh.userData.pickOnly && !mesh.userData.fixedColor) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          materials.forEach((entry, index) => (entry as MeshBasicMaterial).color.set(id === active || id === hovered ? active === id ? '#46d7c7' : '#a6eee4' : mesh.userData.faceColors?.[index] ?? group.userData.color))
        }
      }
    }
  }
  const pixelScale = (point: Vector3, camera: PerspectiveCamera, height: number) => Math.max(0.1, -point.clone().applyMatrix4(camera.matrixWorldInverse).z) * 2 * Math.tan(camera.fov * Math.PI / 360) / (height * camera.zoom) * 42
  function update(model: Group | undefined, _others: Iterable<Group>, camera: PerspectiveCamera, width: number, height: number, _obstacles: readonly GizmoObstacle[] = [], _revision = 0) {
    if (!model || width <= 1 || height <= 1) {
      root.visible = false; selectedId = null; hovered = null; active = null; placementModel = null; captureView = null; rotate.rotation.y = 0; clearCapture(); return
    }
    camera.updateWorldMatrix(true, false)
    const placement = model.userData.kind === 'placement'
    if (!placement || placementModel !== model) clearCapture()
    placementModel = placement ? model : null
    if (!placement) captureView = null
    else if (!captureView || captureView.width !== width || captureView.height !== height || captureView.world.some((n, i) => n !== camera.matrixWorld.elements[i]) || captureView.projection.some((n, i) => n !== camera.projectionMatrix.elements[i])) {
      clearCapture()
      captureView = { world: [...camera.matrixWorld.elements], projection: [...camera.projectionMatrix.elements], width, height }
    }
    for (const [id, group] of handles) group.visible = !placement || id !== 'delete'
    if (selectedId !== model.userData.id) { hovered = null; active = null; rotate.rotation.y = 0; paint() }
    selectedId = model.userData.id
    if (active !== 'rotate-y') rotate.rotation.y = 0
    model.updateWorldMatrix(true, false)
    // This is a screen-oriented tool at the live object pivot. The fixed local
    // layout keeps the left grip clear of every button without relocating it.
    // Handle names still represent world X/Z movement and world Y rotation;
    // pointer-to-transform mapping belongs to the editor, not this overlay.
    model.getWorldPosition(root.position)
    camera.getWorldQuaternion(root.quaternion).multiply(SCREEN_PLANE)
    root.scale.setScalar(pixelScale(root.position, camera, height))
    root.visible = true
    root.updateMatrixWorld(true)
  }
  return {
    root, update,
    placementFollowBlocked() { return placementCaptured },
    clearPlacementCapture: clearCapture,
    capturePlacement(x: number, y: number, camera: PerspectiveCamera, width: number, height: number) {
      const last = previousPointer; previousPointer = { x, y }
      if (!placementModel || !root.visible) { placementCaptured = false; approach = null; captureCorridor = null; return }
      const screen = (point: Vector3) => { point.project(camera); return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 } }
      const local = (x: number, z: number) => screen(root.localToWorld(new Vector3(x, 0, z)))
      const freeCenter = local(0, 0), xCenter = local(AXIS_OFFSET, 0), zCenter = local(0, AXIS_OFFSET)
      const fromPivot = Math.hypot(x - freeCenter.x, y - freeCenter.y)
      const previousFromPivot = last ? Math.hypot(last.x - freeCenter.x, last.y - freeCenter.y) : 0
      // A following draft puts its pivot under the cursor. Capturing the free
      // square there would freeze every fine pointer movement. Acquire it only
      // after entering the fixed tool from outside, or via another handle.
      const captureCenter = placementCaptured || previousFromPivot > 26
      let distance = Math.min(captureCenter ? fromPivot : Infinity, Math.hypot(x - xCenter.x, y - xCenter.y), Math.hypot(x - zCenter.x, y - zCenter.y))
      // The complete visible rotation arc is a capture target, not just its grip.
      let previous = screen(rotate.localToWorld(rotationPoint(ARC_START)))
      for (let i = 1; i <= 24; i++) {
        const angle = ARC_START + i / 24 * (ARC_END - ARC_START), point = screen(rotate.localToWorld(rotationPoint(angle)))
        distance = Math.min(distance, segmentDistance(x, y, previous, point)); previous = point
      }
      const knob = screen(rotate.localToWorld(rotationGrip.clone()))
      distance = Math.min(distance, Math.hypot(x - knob.x, y - knob.y))
      if (captureCorridor && segmentDistance(x, y, captureCorridor.start, captureCorridor.end) <= 42) { placementCaptured = true; return }
      if (distance <= (placementCaptured ? 42 : 26)) { placementCaptured = true; approach = null; captureCorridor = null; return }
      if (placementCaptured) { placementCaptured = false; approach = null; captureCorridor = null; return }
      if (fromPivot <= 26 && previousFromPivot <= 26) { approach = null; return }
      // A moving hit zone alone can never catch a slow approach: both targets
      // would move away at pointer speed. Detect a narrow, sustained approach
      // and capture its spatial corridor before the unified pose can chase it.
      if (last) {
        const dx = x - last.x, dy = y - last.y, travel = Math.hypot(dx, dy)
        let match: { handle: TransformHandle; point: { x: number; y: number }; alignment: number } | undefined
        if (travel > 0 && travel <= 12) for (const id of ['x', 'z', 'xz', 'rotate-y'] as const) {
          const point = screen(id === 'rotate-y' ? rotate.localToWorld(rotationGrip.clone()) : root.localToWorld(markers.get(id)!.clone()))
          const gx = point.x - last.x, gy = point.y - last.y, length = Math.hypot(gx, gy)
          const alignment = length ? (dx * gx + dy * gy) / (travel * length) : 0
          if (alignment >= 0.995 && (!match || alignment > match.alignment)) match = { handle: id, point, alignment }
        }
        if (match) {
          if (approach?.handle !== match.handle) approach = { handle: match.handle, start: last, travel: 0 }
          approach.travel += travel
          // Acquire on the first deliberate aligned step so placement follow
          // cannot carry the enlarged grip target away during acquisition.
          if (approach.travel >= 1) { placementCaptured = true; captureCorridor = { start: approach.start, end: match.point }; approach = null }
        } else if (travel > 0) approach = null
      }
    },
    position(id: TransformHandle) { return root.visible && handles.get(id)!.visible ? id === 'rotate-y' ? rotate.localToWorld(rotationGrip.clone()) : root.localToWorld(markers.get(id)!.clone()) : null },
    origin() { return root.visible ? root.position.clone() : null },
    pick(ray: Raycaster) {
      if (!root.visible || !selectedId) return null
      // Raycaster also intersects invisible objects; exclude hidden handles explicitly.
      for (const hit of ray.intersectObjects([...handles.values()].filter((group) => group.visible), true)) {
        let object = hit.object
        while (object.parent && !object.userData.transformHandle) object = object.parent
        if (object.userData.transformHandle) return { id: selectedId, handle: object.userData.transformHandle as TransformHandle, point: hit.point.clone() }
      }
      return null
    },
    hover(id: TransformHandle | null) { hovered = id && handles.get(id)!.visible ? id : null; paint() },
    activate(id: TransformHandle | null, model?: Group) {
      // A captured transform moves the handles away from the approach corridor.
      // Start and release discard that old screen-space input without affecting
      // the selected-model gesture or the live pivot.
      if (model?.userData.kind === 'placement' && (id || active)) clearCapture()
      active = id && handles.get(id)!.visible ? id : null
      if (active !== 'rotate-y') { rotate.rotation.y = 0; rotate.updateMatrixWorld(true) }
      hovered = null; paint()
    },
    setRotation(angle: number) {
      rotate.rotation.y = angle
      rotate.updateMatrixWorld(true)
    },
  }
}
