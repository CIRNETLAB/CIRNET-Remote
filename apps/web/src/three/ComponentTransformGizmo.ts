import { Box3, BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, TorusGeometry, Vector3 } from 'three'

export type TransformHandle = 'x' | 'z' | 'xz' | 'rotate-y' | 'delete'
export interface GizmoObstacle { left: number; top: number; right: number; bottom: number }

// A scene tool, never a circuit module, port or electrical node.
export function createComponentTransformGizmo() {
  const root = new Group(); root.name = 'component-transform-gizmo'; root.visible = false
  const handles = new Map<TransformHandle, Group>(), markers = new Map<TransformHandle, Vector3>()
  let selectedId: string | null = null, hovered: TransformHandle | null = null, active: TransformHandle | null = null, lockedOffset: Vector3 | null = null
  const material = (color: string, pickOnly = false) => new MeshBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false, transparent: pickOnly, opacity: pickOnly ? 0 : 1 })
  const handle = (id: TransformHandle, color: string, point: Vector3) => {
    const group = new Group(); group.userData.transformHandle = id; group.userData.color = color
    handles.set(id, group); markers.set(id, point); root.add(group); return group
  }
  const add = (group: Group, mesh: Mesh, pickOnly = false) => { mesh.renderOrder = 20; mesh.userData.pickOnly = pickOnly; group.add(mesh); return mesh }
  for (const id of ['x', 'z'] as const) {
    const color = id === 'x' ? '#ff8668' : '#54baff', group = handle(id, color, new Vector3(id === 'x' ? 0.95 : 0, 0, id === 'z' ? 0.95 : 0))
    const stem = add(group, new Mesh(new CylinderGeometry(0.047, 0.047, 0.66, 12), material(color)))
    const tip = add(group, new Mesh(new ConeGeometry(0.19, 0.34, 4), material(color)))
    const target = add(group, new Mesh(new CylinderGeometry(0.15, 0.15, 0.95, 8), material(color, true)), true)
    if (id === 'x') { stem.rotation.z = tip.rotation.z = target.rotation.z = -Math.PI / 2; stem.position.x = 0.47; tip.position.x = 0.96; target.position.x = 0.61 }
    else { stem.rotation.x = tip.rotation.x = target.rotation.x = Math.PI / 2; stem.position.z = 0.47; tip.position.z = 0.96; target.position.z = 0.61 }
  }
  const free = handle('xz', '#edf6f3', new Vector3())
  const diamondBase = add(free, new Mesh(new BoxGeometry(0.42, 0.04, 0.42), material('#111e28')))
  diamondBase.rotation.y = Math.PI / 4; diamondBase.renderOrder = 19; diamondBase.userData.fixedColor = true
  const diamond = add(free, new Mesh(new BoxGeometry(0.32, 0.045, 0.32), material('#edf6f3'))); diamond.rotation.y = Math.PI / 4; diamond.position.y = 0.025
  add(free, new Mesh(new CylinderGeometry(0.27, 0.27, 0.08, 12), material('#edf6f3', true)), true)
  const rotate = handle('rotate-y', '#efbd48', new Vector3(-1.35, 0, 0))
  const arcBase = add(rotate, new Mesh(new TorusGeometry(1.35, 0.082, 10, 96, Math.PI * 1.5), material('#101c25')))
  arcBase.rotation.x = Math.PI / 2; arcBase.renderOrder = 18; arcBase.userData.fixedColor = true
  const arc = add(rotate, new Mesh(new TorusGeometry(1.35, 0.042, 10, 96, Math.PI * 1.5), material('#efbd48'))); arc.rotation.x = Math.PI / 2
  const arcTarget = add(rotate, new Mesh(new TorusGeometry(1.35, 0.12, 8, 96, Math.PI * 1.5), material('#efbd48', true)), true); arcTarget.rotation.x = Math.PI / 2
  const grip = add(rotate, new Mesh(new TorusGeometry(0.16, 0.062, 12, 32), material('#efbd48'))); grip.rotation.x = Math.PI / 2; grip.position.x = -1.35; grip.renderOrder = 22
  const gripCore = add(rotate, new Mesh(new CylinderGeometry(0.095, 0.095, 0.03, 24), material('#18252c')))
  gripCore.position.x = -1.35; gripCore.renderOrder = 23; gripCore.userData.fixedColor = true
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
      if (!mesh.userData.pickOnly && !mesh.userData.fixedColor) (mesh.material as MeshBasicMaterial).color.set(id === active || id === hovered ? '#65d8cd' : group.userData.color)
    }
  }
  const pixelScale = (point: Vector3, camera: PerspectiveCamera, height: number) => Math.max(0.1, -point.clone().applyMatrix4(camera.matrixWorldInverse).z) * 2 * Math.tan(camera.fov * Math.PI / 360) / (height * camera.zoom) * 42
  function update(model: Group | undefined, others: Iterable<Group>, camera: PerspectiveCamera, width: number, height: number, obstacles: readonly GizmoObstacle[] = []) {
    if (!model || height <= 1) { root.visible = false; selectedId = null; hovered = null; active = null; lockedOffset = null; return }
    for (const [id, group] of handles) group.visible = model.userData.kind !== 'placement' || (id !== 'xz' && id !== 'delete')
    if (selectedId !== model.userData.id) { hovered = null; active = null; lockedOffset = null; paint() }
    selectedId = model.userData.id; root.visible = true; camera.updateMatrixWorld()
    // World X/Z movement stays fixed. Only the Y ring and grip track object yaw,
    // including live previews while the gesture center is locked.
    rotate.rotation.y = model.rotation.y
    if (active && lockedOffset) { root.position.copy(model.position).add(lockedOffset); root.scale.setScalar(pixelScale(root.position, camera, height)); root.updateMatrixWorld(true); return }
    // Ground-footprint clearance alone can still cover the face of a tall model.
    model.updateMatrixWorld(true)
    const localBounds = model.userData.visualBounds as [number[], number[]] | undefined
    const [mw, mh, md] = model.userData.size as number[]
    const bounds = localBounds ? new Box3(new Vector3().fromArray(localBounds[0]), new Vector3().fromArray(localBounds[1])) : new Box3(new Vector3(-mw / 2, 0, -md / 2), new Vector3(mw / 2, mh, md / 2))
    const projected: Vector3[] = []
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) projected.push(new Vector3(x, y, z).applyMatrix4(model.matrixWorld).project(camera))
    const selectedArea = { left: Math.min(...projected.map((p) => (p.x + 1) * width / 2)), right: Math.max(...projected.map((p) => (p.x + 1) * width / 2)), top: Math.min(...projected.map((p) => (1 - p.y) * height / 2)), bottom: Math.max(...projected.map((p) => (1 - p.y) * height / 2)) }
    const neighbors = [...others] // Map.values() is single-use; all candidates need the same obstacles.
    const near = camera.position.clone().sub(model.position).setY(0).normalize(), right = new Vector3(near.z, 0, -near.x)
    const directions = [near, right, right.clone().negate(), near.clone().negate()]
    const candidates = [1.55, 2.7, 3.9, 5].flatMap((spacing) => directions.map((direction) => ({ direction, spacing })))
    const [w, , d] = model.userData.size as number[], angle = model.rotation.y
    const extent = (direction: Vector3) => { const local = direction.clone().applyAxisAngle(new Vector3(0, 1, 0), -angle); return Math.abs(local.x) * w / 2 + Math.abs(local.z) * d / 2 }
    let best: { point: Vector3; scale: number; score: number } | undefined
    candidates.forEach(({ direction, spacing }, index) => {
      let scale = pixelScale(model.position, camera, height), point = model.position.clone()
      for (let i = 0; i < 3; i++) { point = model.position.clone().addScaledVector(direction, extent(direction) + scale * spacing).add(new Vector3(0, 0.04, 0)); scale = pixelScale(point, camera, height) }
      const screen = point.clone().project(camera), px = (screen.x + 1) * width / 2, py = (1 - screen.y) * height / 2
      let score = index * 10
      if (screen.z < -1 || screen.z > 1) score += 10000
      if (px < 65 || px > width - 65 || py < 55 || py > height - 55) score += 100000
      score += Math.max(0, 70 - px, px - width + 70) * 10 + Math.max(0, 70 - py, py - height + 70) * 10
      if (px + 60 > selectedArea.left && px - 60 < selectedArea.right && py + 55 > selectedArea.top && py - 55 < selectedArea.bottom) score += 10000
      for (const area of obstacles) if (px + 60 > area.left && px - 60 < area.right && py + 55 > area.top && py - 55 < area.bottom) score += 10000
      for (const other of neighbors) {
        if (other === model) continue
        const [ow, , od] = other.userData.size as number[], a = other.rotation.y
        const ex = (Math.abs(Math.cos(a)) * ow + Math.abs(Math.sin(a)) * od) / 2, ez = (Math.abs(Math.sin(a)) * ow + Math.abs(Math.cos(a)) * od) / 2
        if (Math.abs(point.x - other.position.x) < ex + scale * 1.4 && Math.abs(point.z - other.position.z) < ez + scale * 1.4) score += 1000
      }
      if (!best || score < best.score) best = { point, scale, score }
    })
    if (best) { root.position.copy(best.point); root.scale.setScalar(best.scale) }
    root.updateMatrixWorld(true)
  }
  return {
    root, update,
    position(id: TransformHandle) { return root.visible && handles.get(id)!.visible ? id === 'rotate-y' ? grip.getWorldPosition(new Vector3()) : root.localToWorld(markers.get(id)!.clone()) : null },
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
    activate(id: TransformHandle | null, model?: Group) { active = id && handles.get(id)!.visible ? id : null; lockedOffset = active && model ? root.position.clone().sub(model.position) : null; hovered = null; paint() },
  }
}
