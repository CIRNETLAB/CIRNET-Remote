import { Box3, BoxGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Shape, SphereGeometry, TorusGeometry, Vector3 } from 'three'

export type TransformHandle = 'x' | 'z' | 'xz' | 'rotate-y' | 'delete'
export interface GizmoObstacle { left: number; top: number; right: number; bottom: number }

interface PlacementLayout {
  model: Group; offset: Vector3; index: number; directions: Vector3[]; scale: number; rotation: number
  width: number; height: number; cameraWorld: number[]; projection: number[]; obstacles: readonly GizmoObstacle[]; revision: number
  screenCell: GizmoObstacle; worldCell: GizmoObstacle; corners: Vector3[]
}

const contains = (area: GizmoObstacle, x: number, y: number) => x >= area.left && x <= area.right && y >= area.top && y <= area.bottom
// Compile obstacles into one conservative free cell. Follow validates that cell
// in constant time; only a layout solve walks obstacles or neighboring models.
function freeCell(x: number, y: number, bounds: GizmoObstacle, excluded: GizmoObstacle[]) {
  const cell = { ...bounds }
  for (const area of excluded) {
    const options = [
      { gap: area.left - x, clip: () => { cell.right = Math.min(cell.right, area.left) } },
      { gap: x - area.right, clip: () => { cell.left = Math.max(cell.left, area.right) } },
      { gap: area.top - y, clip: () => { cell.bottom = Math.min(cell.bottom, area.top) } },
      { gap: y - area.bottom, clip: () => { cell.top = Math.max(cell.top, area.bottom) } },
    ].filter((option) => option.gap >= 0).sort((a, b) => b.gap - a.gap)
    if (!options.length) return { left: x - 12, right: x + 12, top: y - 12, bottom: y + 12 }
    options[0].clip()
  }
  return contains(cell, x, y) ? cell : { left: x - 12, right: x + 12, top: y - 12, bottom: y + 12 }
}

const segmentDistance = (x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
}

const ARC_RADIUS = 1.35, ARC_START = Math.PI + .14, ARC_END = Math.PI * 2.5, ARC_KNOB_RADIUS = .16
const AXIS_OFFSET = .95, FREE_HALF_SIZE = .29, GRIP_RADIUS = ARC_RADIUS * .8
// Keep the rounded silhouette in the XZ plane. The Y knob has an invisible
// spherical target so its hollow rim remains usable in a nearly edge-on view.
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
  let selectedId: string | null = null, hovered: TransformHandle | null = null, active: TransformHandle | null = null, lockedOffset: Vector3 | null = null
  let placementLayout: PlacementLayout | null = null, placementCaptured = false
  let previousPointer: { x: number; y: number } | null = null
  let approach: { handle: TransformHandle; start: { x: number; y: number }; travel: number } | null = null
  let captureCorridor: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null
  const clearCapture = () => { placementCaptured = false; approach = null; captureCorridor = null; previousPointer = null }
  // The grid is transparent. Opaque tools are drawn before its separate pass,
  // even with a larger renderOrder. Share that pass, then order the overlay last.
  const material = (color: string, pickOnly = false) => new MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false, transparent: true, opacity: pickOnly ? 0 : 1 })
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
  const rotate = handle('rotate-y', '#ffd10b', rotationGrip)
  const rotationPoint = (angle: number) => new Vector3(Math.cos(angle) * ARC_RADIUS, 0, Math.sin(angle) * ARC_RADIUS)
  // Keep the open arc independent of the inward grip: no line crosses its hole.
  const arc = add(rotate, new Mesh(new TorusGeometry(ARC_RADIUS, .044, 12, 96, ARC_END - ARC_START), material('#ffd10b')))
  arc.name = 'rotation-arc'; arc.rotation.x = Math.PI / 2; arc.rotation.z = ARC_START
  for (const [name, angle] of [['rotation-start-cap', ARC_START], ['rotation-end-cap', ARC_END]] as const) {
    const cap = add(rotate, new Mesh(new SphereGeometry(.044, 16, 10), material('#ffd10b')))
    cap.name = name; cap.position.copy(rotationPoint(angle))
  }
  // Either torus surface is visible for this overlay, including side views.
  const gripMaterial = material('#ffd10b'); gripMaterial.side = DoubleSide
  const grip = add(rotate, new Mesh(new TorusGeometry(ARC_KNOB_RADIUS, .045, 12, 48), gripMaterial))
  grip.name = 'rotation-knob'; grip.rotation.x = Math.PI / 2; grip.position.copy(rotationGrip); grip.renderOrder = 22
  const gripTarget = add(rotate, new Mesh(new SphereGeometry(.28, 16, 12), material('#ffd10b', true)), true)
  gripTarget.name = 'rotation-knob-target'; gripTarget.position.copy(rotationGrip)
  const deleteBtn = handle('delete', '#ff473d', new Vector3(1.42, 0, 1.42))
  const deleteBase = add(deleteBtn, new Mesh(new CylinderGeometry(0.30, 0.30, 0.05, 32), material('#19222b')))
  deleteBase.renderOrder = 19; deleteBase.userData.fixedColor = true; deleteBase.position.set(1.42, 0.025, 1.42)
  const deleteRing = add(deleteBtn, new Mesh(new TorusGeometry(0.28, 0.022, 8, 32), material('#2d3c4a')))
  deleteRing.rotation.x = Math.PI / 2; deleteRing.renderOrder = 20; deleteRing.userData.fixedColor = true; deleteRing.position.set(1.42, 0.038, 1.42)
  const cross1 = add(deleteBtn, new Mesh(new BoxGeometry(0.30, 0.055, 0.075), material('#ff473d')))
  cross1.rotation.y = Math.PI / 4; cross1.position.set(1.42, 0.05, 1.42); cross1.renderOrder = 21
  const cross2 = add(deleteBtn, new Mesh(new BoxGeometry(0.30, 0.055, 0.075), material('#ff473d')))
  cross2.rotation.y = -Math.PI / 4; cross2.position.set(1.42, 0.05, 1.42); cross2.renderOrder = 21
  const deleteTarget = add(deleteBtn, new Mesh(new CylinderGeometry(0.35, 0.35, 0.16, 16), material('#ff473d', true)), true)
  deleteTarget.position.set(1.42, 0.05, 1.42)
  const paint = () => {
    for (const [id, group] of handles) for (const mesh of group.children as Mesh[]) {
      if (!mesh.userData.pickOnly && !mesh.userData.fixedColor) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((entry, index) => (entry as MeshBasicMaterial).color.set(id === active || id === hovered ? active === id ? '#46d7c7' : '#a6eee4' : mesh.userData.faceColors?.[index] ?? group.userData.color))
      }
    }
  }
  const pixelScale = (point: Vector3, camera: PerspectiveCamera, height: number) => Math.max(0.1, -point.clone().applyMatrix4(camera.matrixWorldInverse).z) * 2 * Math.tan(camera.fov * Math.PI / 360) / (height * camera.zoom) * 42
  // The ring follows yaw; the grip prefers the same yaw but must clear the fixed
  // world-axis buttons. Evaluate their projected bounds so a side view cannot
  // collapse the inward grip onto a triangle or the free-movement square.
  const buttonBounds = [...handles].filter(([id]) => id !== 'rotate-y').map(([, group]) => ({ group, box: new Box3().setFromObject(group) }))
  const updateGrip = (camera: PerspectiveCamera, width: number, height: number) => {
    const screen = (point: Vector3) => { point.project(camera); return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 } }
    const areas = buttonBounds.filter(({ group }) => group.visible).map(({ box }) => {
      const points: { x: number; y: number }[] = []
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(screen(root.localToWorld(new Vector3(x, y, z))))
      return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) }
    })
    let best = Math.PI, clearance = -Infinity
    for (let step = 0; step <= 24; step++) {
      const angle = Math.PI + Math.ceil(step / 2) * (step % 2 ? 1 : -1) * Math.PI / 12
      const point = screen(rotate.localToWorld(new Vector3(Math.cos(angle) * GRIP_RADIUS, 0, Math.sin(angle) * GRIP_RADIUS)))
      const gap = Math.min(...areas.map(area => Math.max(area.left - point.x, point.x - area.right, area.top - point.y, point.y - area.bottom)))
      if (gap > clearance) { best = angle; clearance = gap }
      if (gap >= 14) break
    }
    rotationGrip.set(Math.cos(best) * GRIP_RADIUS, 0, Math.sin(best) * GRIP_RADIUS)
    grip.position.copy(rotationGrip); gripTarget.position.copy(rotationGrip); rotate.updateMatrixWorld(true)
  }
  const projectedBounds = (corners: Vector3[], model: Group, camera: PerspectiveCamera, width: number, height: number) => {
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
    for (const corner of corners) {
      const p = corner.clone().applyMatrix4(model.matrixWorld).project(camera), x = (p.x + 1) * width / 2, y = (1 - p.y) * height / 2
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    return { left, right, top, bottom }
  }
  const overlapsModel = (px: number, py: number, area: GizmoObstacle) => px + 60 > area.left && px - 60 < area.right && py + 55 > area.top && py - 55 < area.bottom
  function update(model: Group | undefined, others: Iterable<Group>, camera: PerspectiveCamera, width: number, height: number, obstacles: readonly GizmoObstacle[] = [], revision = 0) {
    if (!model || height <= 1) { root.visible = false; selectedId = null; hovered = null; active = null; lockedOffset = null; placementLayout = null; clearCapture(); return }
    const placement = model.userData.kind === 'placement'
    if (!placement || (placementLayout && placementLayout.model !== model)) { placementLayout = null; clearCapture() }
    for (const [id, group] of handles) group.visible = model.userData.kind !== 'placement' || id !== 'delete'
    if (selectedId !== model.userData.id) { hovered = null; active = null; lockedOffset = null; paint() }
    selectedId = model.userData.id; root.visible = true; camera.updateMatrixWorld()
    // World X/Z movement stays fixed. The Y ring tracks object yaw, including
    // live previews with a locked center; updateGrip keeps its knob clear.
    rotate.rotation.y = model.rotation.y
    if (active && lockedOffset) { root.position.copy(model.position).add(lockedOffset); root.scale.setScalar(pixelScale(root.position, camera, height)); root.updateMatrixWorld(true); updateGrip(camera, width, height); return }
    const cached = placementLayout
    const sameCamera = cached && cached.cameraWorld.every((n, i) => n === camera.matrixWorld.elements[i]) && cached.projection.every((n, i) => n === camera.projectionMatrix.elements[i])
    const sameLayout = cached && sameCamera && cached.width === width && cached.height === height && cached.rotation === model.rotation.y && cached.obstacles === obstacles && cached.revision === revision
    if (placement && sameLayout) {
      root.position.copy(model.position).add(cached.offset)
      const screen = root.position.clone().project(camera), px = (screen.x + 1) * width / 2, py = (1 - screen.y) * height / 2
      const scale = pixelScale(root.position, camera, height)
      if (contains(cached.screenCell, px, py) && contains(cached.worldCell, root.position.x, root.position.z) && scale >= cached.scale * 0.8 && scale <= cached.scale * 1.2 && !overlapsModel(px, py, projectedBounds(cached.corners, model, camera, width, height))) {
        root.scale.setScalar(scale); root.updateMatrixWorld(true); updateGrip(camera, width, height); return
      }
    }
    const position = model.position
    // Ground-footprint clearance alone can still cover the face of a tall model.
    model.updateMatrixWorld(true)
    const localBounds = model.userData.visualBounds as [number[], number[]] | undefined
    const [mw, mh, md] = model.userData.size as number[]
    const bounds = localBounds ? new Box3(new Vector3().fromArray(localBounds[0]), new Vector3().fromArray(localBounds[1])) : new Box3(new Vector3(-mw / 2, 0, -md / 2), new Vector3(mw / 2, mh, md / 2))
    const corners: Vector3[] = []
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      corners.push(new Vector3(x, y, z))
    }
    const selectedArea = projectedBounds(corners, model, camera, width, height)
    const neighbors = [...others] // Map.values() is single-use; all candidates need the same obstacles.
    const near = camera.position.clone().sub(position).setY(0).normalize(), right = new Vector3(near.z, 0, -near.x)
    const directions = placement && cached && sameCamera ? cached.directions : [near, right, right.clone().negate(), near.clone().negate()]
    const candidates = [1.55, 2.7, 3.9, 5].flatMap((spacing) => directions.map((direction) => ({ direction, spacing })))
    const [w, , d] = model.userData.size as number[], angle = model.rotation.y
    const extent = (direction: Vector3) => { const local = direction.clone().applyAxisAngle(new Vector3(0, 1, 0), -angle); return Math.abs(local.x) * w / 2 + Math.abs(local.z) * d / 2 }
    const evaluate = (point: Vector3, scale: number, index: number) => {
      const screen = point.clone().project(camera), px = (screen.x + 1) * width / 2, py = (1 - screen.y) * height / 2
      let score = index * 10
      let valid = true
      if (screen.z < -1 || screen.z > 1) { score += 10000; valid = false }
      if (px < 65 || px > width - 65 || py < 55 || py > height - 55) { score += 100000; valid = false }
      score += Math.max(0, 70 - px, px - width + 70) * 10 + Math.max(0, 70 - py, py - height + 70) * 10
      if (overlapsModel(px, py, selectedArea)) { score += 10000; valid = false }
      for (const area of obstacles) if (overlapsModel(px, py, area)) { score += 10000; valid = false }
      for (const other of neighbors) {
        if (other === model) continue
        const [ow, , od] = other.userData.size as number[], a = other.rotation.y
        const ex = (Math.abs(Math.cos(a)) * ow + Math.abs(Math.sin(a)) * od) / 2, ez = (Math.abs(Math.sin(a)) * ow + Math.abs(Math.cos(a)) * od) / 2
        if (Math.abs(point.x - other.position.x) < ex + scale * 1.4 && Math.abs(point.z - other.position.z) < ez + scale * 1.4) { score += 1000; valid = false }
      }
      return { point, scale, score, index, valid }
    }
    let best: ReturnType<typeof evaluate> | undefined
    candidates.forEach(({ direction, spacing }, index) => {
      let scale = pixelScale(position, camera, height), point = position.clone()
      for (let i = 0; i < 3; i++) { point = position.clone().addScaledVector(direction, extent(direction) + scale * spacing).add(new Vector3(0, 0.04, 0)); scale = pixelScale(point, camera, height) }
      const candidate = evaluate(point, scale, index)
      if (!best || candidate.score < best.score) best = candidate
    })
    if (placement && cached && best) {
      const point = position.clone().add(cached.offset), current = evaluate(point, pixelScale(point, camera, height), cached.index)
      // A new side must clear a meaningful penalty, not win a tiny score tie.
      if ((current.valid || !best.valid) && current.score - best.score < 1500) best = current
    }
    if (best) { root.position.copy(best.point); root.scale.setScalar(best.scale) }
    if (placement && best) {
      const screen = best.point.clone().project(camera), px = (screen.x + 1) * width / 2, py = (1 - screen.y) * height / 2
      const worldObstacles = neighbors.filter((other) => other !== model).map((other) => {
        const [ow, , od] = other.userData.size as number[], a = other.rotation.y
        const ex = (Math.abs(Math.cos(a)) * ow + Math.abs(Math.sin(a)) * od) / 2 + best!.scale * 1.7
        const ez = (Math.abs(Math.sin(a)) * ow + Math.abs(Math.cos(a)) * od) / 2 + best!.scale * 1.7
        return { left: other.position.x - ex, right: other.position.x + ex, top: other.position.z - ez, bottom: other.position.z + ez }
      })
      placementLayout = {
        model, offset: best.point.clone().sub(position), scale: best.scale, index: best.index, directions, corners,
        width, height, rotation: model.rotation.y, cameraWorld: [...camera.matrixWorld.elements], projection: [...camera.projectionMatrix.elements], obstacles, revision,
        screenCell: freeCell(px, py, { left: 65, right: width - 65, top: 55, bottom: height - 55 }, obstacles.map((area) => ({ left: area.left - 60, right: area.right + 60, top: area.top - 55, bottom: area.bottom + 55 }))),
        worldCell: freeCell(best.point.x, best.point.z, { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity }, worldObstacles),
      }
      if (cached && !sameLayout) clearCapture()
    }
    root.updateMatrixWorld(true)
    updateGrip(camera, width, height)
  }
  return {
    root, update,
    placementFollowBlocked() { return placementCaptured },
    clearPlacementCapture: clearCapture,
    capturePlacement(x: number, y: number, camera: PerspectiveCamera, width: number, height: number) {
      const last = previousPointer; previousPointer = { x, y }
      if (!placementLayout || !root.visible) { placementCaptured = false; approach = null; captureCorridor = null; return }
      const screen = (point: Vector3) => { point.project(camera); return { x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2 } }
      const local = (x: number, z: number) => screen(root.localToWorld(new Vector3(x, 0, z)))
      const freeCenter = local(0, 0), xCenter = local(AXIS_OFFSET, 0), zCenter = local(0, AXIS_OFFSET)
      let distance = Math.min(Math.hypot(x - freeCenter.x, y - freeCenter.y), Math.hypot(x - xCenter.x, y - xCenter.y), Math.hypot(x - zCenter.x, y - zCenter.y))
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
      // Start and release discard that old screen-space input, without affecting
      // the cached pose offset or selected-model gestures.
      if (model?.userData.kind === 'placement' && (id || active)) clearCapture()
      active = id && handles.get(id)!.visible ? id : null
      lockedOffset = active && model ? root.position.clone().sub(model.position) : null
      hovered = null; paint()
    },
  }
}
