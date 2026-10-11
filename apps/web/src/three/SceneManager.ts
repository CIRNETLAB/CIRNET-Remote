import { AmbientLight, Color, DirectionalLight, Group, Mesh, MOUSE, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { applyPose, buildComponent, disposeObject, portAnchor } from './ComponentModel'
import { getDefinition } from '../data/editorCatalog'
import type { CircuitGraph, CircuitModule } from '../types/circuit'
import { createSelectionOutline, updateSelectionOutline } from './SelectionOutline'
import { createTechnicalGrid, updateTechnicalGrid } from './TechnicalGrid'
import { Box3, Sphere } from 'three'
import { createComponentTransformGizmo, type GizmoObstacle, type TransformHandle } from './ComponentTransformGizmo'
import { applyPowerSupplyControls, type SupplyControl } from './PowerSupplyModel'
import { createWireLayer } from './WireLayer'

export interface SceneRenderer { setSize(width: number, height: number, updateStyle?: boolean): void; render(scene: Scene, camera: PerspectiveCamera): void; dispose(): void }
interface SceneOptions { renderer: SceneRenderer; canvas?: HTMLCanvasElement; onBeforeRender?: () => void; onRender?: () => void; onZoomChange?: (percent: number) => void; requestFrame?: (callback: FrameRequestCallback) => number; cancelFrame?: (id: number) => void }
export type PickResult = ({ kind: 'module'; id: string } | { kind: 'control'; id: string; control: SupplyControl } | { kind: 'port'; id: string; endpoint: string } | { kind: 'wire'; source: string; destination: string }) & { point: Vector3 }
export interface OrientationAxis { label: 'X' | 'Y' | 'Z'; x: number; y: number; depth: number; color: string }

// Geometry is a projection of graph IDs and named logical ports, never a source of nets.
export function createSceneManager({ renderer, canvas, onBeforeRender, onRender, onZoomChange, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }: SceneOptions) {
  const scene = new Scene(); scene.background = new Color('#101925')
  const camera = new PerspectiveCamera(42, 1, 0.1, 150); camera.position.set(0, 11, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const grid = createTechnicalGrid()
  const ambient = new AmbientLight('#c9def4', 1.1)
  const light = new DirectionalLight('#fff5dc', 1.9); light.position.set(-5, 10, 5)
  const fillLight = new DirectionalLight('#a8c7e8', 0.75); fillLight.position.set(6, 8, -6)
  const content = new Group(), models = new Map<string, Group>(), modules = new Map<string, CircuitModule>()
  const endpointPosition = (endpoint: string): Vector3 | null => {
    if (disposed) return null
    const [id, name] = endpoint.split('.'), model = models.get(id), module = modules.get(id)
    const port = module && getDefinition(module.type)?.ports.find((item) => item.id === name)
    return model && module && port ? model.localToWorld(portAnchor(module.type, port)) : null
  }
  const wireLayer = createWireLayer(endpointPosition), wires = wireLayer.group
  scene.add(grid, ambient, light, fillLight, content, wires)
  const gizmo = createComponentTransformGizmo(); scene.add(gizmo.root)
  let gizmoObstacles: GizmoObstacle[] = []
  const updateGizmo = () => gizmo.update(highlightedId ? models.get(highlightedId) : undefined, models.values(), camera, width, height, gizmoObstacles)
  const raycaster = new Raycaster(), plane = new Plane(new Vector3(0, 1, 0), 0)
  let width = 1, height = 1, sized = false, frame: number | null = null, disposed = false, visible = false, suspended = false, pointerLocked = false
  let bufferWidth = 0, bufferHeight = 0
  let ghost: Group | null = null
  const schedule = () => {
    if (disposed || !visible || suspended || frame !== null) return
    frame = requestFrame(() => {
      // Layout obstacles join this draw, rather than scheduling a second draw after it.
      if (!disposed && visible && !suspended) onBeforeRender?.()
      frame = null
      if (!disposed && visible && !suspended) {
        // setSize clears the drawing buffer. Refill it in this same frame.
        if (bufferWidth !== width || bufferHeight !== height) { renderer.setSize(width, height, false); bufferWidth = width; bufferHeight = height }
        const target = controls?.target ?? viewTarget
        const focus = highlightedId ? models.get(highlightedId)?.position ?? target : target
        updateTechnicalGrid(grid, camera, target, focus, height)
        updateGizmo()
        scene.updateMatrixWorld(true)
        if (activeOutline) updateSelectionOutline(activeOutline.group, camera.position, width, height)
        renderer.render(scene, camera); onRender?.()
      }
    })
  }
  const controls = canvas ? new OrbitControls(camera, canvas) : undefined
  const updateControlsEnabled = () => { if (controls) controls.enabled = !disposed && visible && !suspended && !pointerLocked }
  updateControlsEnabled()
  const viewTarget = new Vector3()
  const target = () => controls?.target ?? viewTarget
  const defaultDistance = Math.hypot(11, 10)
  let zoomReferenceDistance = defaultDistance, reportedZoom = 100
  const zoomPercent = () => zoomReferenceDistance / camera.position.distanceTo(target()) * 100
  const notifyZoom = () => {
    const percent = Math.round(zoomPercent() * 100) / 100
    if (Number.isFinite(percent) && percent !== reportedZoom) { reportedZoom = percent; onZoomChange?.(percent) }
  }
  const zoomLimits = () => { if (controls) { controls.minDistance = zoomReferenceDistance / 2; controls.maxDistance = zoomReferenceDistance * 2 } }
  const viewChanged = () => { notifyZoom(); schedule() }
  if (controls) {
    controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }
    controls.touches = { ONE: null, TWO: null }; controls.screenSpacePanning = false
    zoomLimits(); controls.maxPolarAngle = Math.PI / 2 - 0.05
    controls.addEventListener('change', viewChanged); controls.saveState()
  }
  const validPointer = (x: number, y: number) => !disposed && Number.isFinite(x) && Number.isFinite(y)
  const ray = (x: number, y: number) => { camera.updateMatrixWorld(); raycaster.params.Line.threshold = camera.position.distanceTo(controls?.target ?? viewTarget) * 2 * Math.tan(camera.fov * Math.PI / 360) / (height * camera.zoom) * 6; raycaster.setFromCamera(new Vector2(x / width * 2 - 1, -(y / height) * 2 + 1), camera) }
  const planeHit = (elevation: number) => {
    plane.constant = -elevation
    const hit = raycaster.ray.intersectPlane(plane, new Vector3())
    if (!hit) return null
    const distance = hit.distanceTo(camera.position)
    // Nearly horizontal rays otherwise intersect arbitrarily far away and jump the camera.
    return Number.isFinite(distance) && distance >= camera.near && distance <= camera.far ? hit : null
  }
  const translateView = (delta: Vector3) => { camera.position.add(delta); (controls?.target ?? viewTarget).add(delta); camera.updateMatrixWorld(); controls?.update(); schedule() }
  let activeOutline: { id: string; group: Group } | null = null
  const removeActiveOutline = () => {
    if (activeOutline) {
      if (activeOutline.group.parent) activeOutline.group.parent.remove(activeOutline.group)
      disposeObject(activeOutline.group)
      activeOutline = null
    }
  }
  let highlightedId: string | null = null
  const attachOutline = () => {
    const model = highlightedId && models.get(highlightedId)
    if (model && !activeOutline) {
      const group = createSelectionOutline(model)
      model.add(group); activeOutline = { id: highlightedId!, group }
    }
  }
  return {
    scene, camera, grid, models, wires,
    requestRender: schedule,
    endpointPosition,
    setGizmoObstacles(areas: GizmoObstacle[]) { if (!disposed && JSON.stringify(areas) !== JSON.stringify(gizmoObstacles)) { gizmoObstacles = areas.map((area) => ({ ...area })); schedule() } },
    gizmoHandlePosition(handle: TransformHandle) { if (disposed) return null; updateGizmo(); return gizmo.position(handle) },
    gizmoOrigin() { if (disposed) return null; updateGizmo(); return gizmo.origin() },
    pickGizmo(x: number, y: number) { if (!validPointer(x, y)) return null; updateGizmo(); ray(x, y); return gizmo.pick(raycaster) },
    hoverGizmo(x: number, y: number) { if (!validPointer(x, y)) return null; updateGizmo(); ray(x, y); const handle = gizmo.pick(raycaster)?.handle ?? null; gizmo.hover(handle); schedule(); return handle },
    clearGizmoHover() { if (disposed) return; gizmo.hover(null); schedule() },
    activateGizmo(handle: TransformHandle | null) { if (disposed) return; updateGizmo(); gizmo.activate(handle, highlightedId ? models.get(highlightedId) : undefined); schedule() },
    syncGraph(next: CircuitGraph | null) {
      if (disposed) return
      modules.clear(); for (const module of next?.modules ?? []) modules.set(module.id, module)
      const ids = new Set(next?.modules.map((module) => module.id))
      for (const [id, model] of models) if (!ids.has(id)) { if (activeOutline?.id === id) removeActiveOutline(); if (highlightedId === id) highlightedId = null; disposeObject(model); content.remove(model); models.delete(id) }
      for (const module of next?.modules ?? []) {
        let model = models.get(module.id)
        const signature = JSON.stringify([module.type, module.properties])
        if (model && model.userData.signature !== signature) {
          // Supply settings already have an in-place display/knob update in applyPose.
          if (model.userData.type === module.type && getDefinition(module.type)?.visual === 'supply') model.userData.signature = signature
          else { if (activeOutline?.id === module.id) removeActiveOutline(); disposeObject(model); content.remove(model); models.delete(module.id); model = undefined }
        }
        if (!model) { model = buildComponent(module); model.userData.onVisualChange = schedule; models.set(module.id, model); content.add(model) }
        applyPose(model, module)
      }
      attachOutline()
      wireLayer.sync(next?.connections ?? []); schedule()
    },
    previewMove(id: string, position: Required<NonNullable<CircuitModule['position']>>) { const model = models.get(id); if (model && !disposed && [position.x, position.y, position.z].every(Number.isFinite)) { model.position.set(position.x, position.y, position.z); model.updateMatrixWorld(true); wireLayer.updateModule(id); schedule() } },
    previewRotation(id: string, degrees: number) { const model = models.get(id); if (model && !disposed && Number.isFinite(degrees)) { model.rotation.y = (degrees % 360) * Math.PI / 180; model.updateMatrixWorld(true); wireLayer.updateModule(id); schedule() } },
    previewSupplyControl(id: string, control: SupplyControl, value: number | boolean) {
      const model = models.get(id), module = modules.get(id)
      if (model && module && getDefinition(module.type)?.visual === 'supply' && !disposed) {
        applyPowerSupplyControls(model, { ...module.properties, [control]: value }); model.updateMatrixWorld(true); schedule()
      }
    },
    setGhost(type: string | null, position?: Vector3) {
      if (disposed || (position && !position.toArray().every(Number.isFinite))) return
      if (ghost && type && position && ghost.userData.type === type) { ghost.position.copy(position); ghost.updateMatrixWorld(true); schedule(); return }
      if (ghost) { disposeObject(ghost); scene.remove(ghost); ghost = null }
      if (type && position && getDefinition(type)) {
        ghost = buildComponent({ id: 'PLACE', type, position }); ghost.userData.type = type
        ghost.traverse((object) => {
          if (object instanceof Mesh) {
            const mats = Array.isArray(object.material) ? object.material : [object.material]
            mats.forEach((m) => { if ('transparent' in m) { m.transparent = true; m.opacity = 0.4 } })
          }
        })
        scene.add(ghost)
      }
      schedule()
    },
    highlight(id: string | null, wire?: { source: string; destination: string } | null) {
      if (disposed) return
      if (activeOutline && activeOutline.id !== id) removeActiveOutline()
      highlightedId = id
      attachOutline()
      wireLayer.highlight(wire)
      schedule()
    },
    pick(x: number, y: number): PickResult | null {
      if (!validPointer(x, y)) return null
      scene.updateMatrixWorld(true); ray(x, y)
      const hits = raycaster.intersectObjects([...content.children, ...wires.children], true)
      for (const hit of hits) {
        if (hit.object.userData.ignorePick) continue
        let object = hit.object
        while (object.parent && !object.userData.kind) object = object.parent
        if (object.userData.kind) return { ...object.userData, point: hit.point.clone() } as PickResult
      }
      return null
    },
    groundPoint(x: number, y: number, elevation = 0) { if (!validPointer(x, y) || !Number.isFinite(elevation)) return null; ray(x, y); return planeHit(elevation) },
    panGrab(anchor: Vector3, x: number, y: number) {
      if (!validPointer(x, y) || suspended || !anchor.toArray().every(Number.isFinite)) return
      ray(x, y)
      const current = planeHit(0)
      if (current) translateView(anchor.clone().sub(current).setY(0))
    },
    lockPointer(value: boolean) { pointerLocked = value; updateControlsEnabled() },
    orientationAxes(): OrientationAxis[] {
      const inverse = camera.quaternion.clone().invert()
      const axes = [
        { label: 'X' as const, direction: new Vector3(1, 0, 0), color: '#ff5a43' },
        { label: 'Y' as const, direction: new Vector3(0, 1, 0), color: '#00e676' },
        { label: 'Z' as const, direction: new Vector3(0, 0, 1), color: '#398bff' },
      ]
      return axes.map(({ label, direction, color }) => { direction.applyQuaternion(inverse); return { label, x: direction.x, y: -direction.y, depth: direction.z, color } }).sort((a, b) => a.depth - b.depth)
    },
    project(point: Vector3) { camera.updateMatrixWorld(); const p = point.clone().project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, visible: p.z >= -1 && p.z <= 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 } },
    resize(w: number, h: number) {
      if (disposed || !Number.isFinite(w) || !Number.isFinite(h)) return
      const wasVisible = visible
      visible = w > 0 && h > 0
      if (visible !== wasVisible) updateControlsEnabled()
      if (!visible) { if (frame !== null) cancelFrame(frame); frame = null; return }
      if (sized && width === w && height === h) { if (!wasVisible) schedule(); return }
      width = w; height = h; sized = true; camera.aspect = w / h; camera.updateProjectionMatrix(); schedule()
    },
    zoomPercent,
    setZoom(percent: number) {
      if (disposed || !Number.isFinite(percent)) return
      const origin = target(), direction = camera.position.clone().sub(origin).normalize()
      camera.position.copy(origin).addScaledVector(direction, zoomReferenceDistance * 100 / Math.min(200, Math.max(50, percent)))
      camera.zoom = 1; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); controls?.update(); notifyZoom(); schedule()
    },
    zoomToArea(x1: number, y1: number, x2: number, y2: number) {
      if (disposed || suspended || !visible || ![x1, y1, x2, y2].every(Number.isFinite)) return false
      const left = Math.max(0, Math.min(width, Math.min(x1, x2))), right = Math.max(0, Math.min(width, Math.max(x1, x2)))
      const top = Math.max(0, Math.min(height, Math.min(y1, y2))), bottom = Math.max(0, Math.min(height, Math.max(y1, y2)))
      if (right - left < 12 || bottom - top < 12) return false
      const origin = target(), direction = camera.position.clone().sub(origin), distance = direction.length()
      if (!Number.isFinite(distance) || distance <= camera.near) return false
      if (left === 0 && top === 0 && right === width && bottom === height) {
        zoomReferenceDistance = distance; zoomLimits(); notifyZoom(); schedule(); return true
      }
      direction.normalize()
      const x = (left + right) / 2, y = (top + bottom) / 2
      // Focus the actual surface under the rectangle, keeping a finite fallback above the horizon.
      const focus = this.pick(x, y)?.point ?? this.groundPoint(x, y) ?? origin
      const depth = camera.position.clone().sub(focus).dot(direction)
      if (!Number.isFinite(depth) || depth <= camera.near) return false
      ray(x, y)
      const focalPlane = new Plane().setFromNormalAndCoplanarPoint(direction, focus)
      const center = raycaster.ray.intersectPlane(focalPlane, new Vector3())
      if (!center || !center.toArray().every(Number.isFinite)) return false
      let nextDistance = Math.max(camera.near * 4, depth * Math.max((right - left) / width, (bottom - top) / height))
      const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), screenUp = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      const verticalTangent = Math.tan(camera.fov * Math.PI / 360), horizontalTangent = verticalTangent * camera.aspect
      // Fit boundary surface depths too: a low-angle dolly must not pass the nearer edge.
      for (const sx of [left, x, right]) for (const sy of [top, y, bottom]) {
        let point = this.pick(sx, sy)?.point ?? this.groundPoint(sx, sy)
        if (!point) { ray(sx, sy); point = raycaster.ray.intersectPlane(focalPlane, new Vector3()) }
        if (!point || !point.toArray().every(Number.isFinite)) continue
        const offset = point.clone().sub(center)
        nextDistance = Math.max(nextDistance, offset.dot(direction) + Math.max(camera.near * 4, Math.abs(offset.dot(screenRight)) / horizontalTangent, Math.abs(offset.dot(screenUp)) / verticalTangent))
      }
      if (!Number.isFinite(nextDistance)) return false
      nextDistance *= 1.01
      origin.copy(center); camera.position.copy(center).addScaledVector(direction, nextDistance); camera.lookAt(center)
      camera.zoom = 1; camera.far = Math.max(camera.far, nextDistance * 4); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
      zoomReferenceDistance = nextDistance; zoomLimits(); controls?.update(); notifyZoom(); schedule()
      return true
    },
    fitCircuit() {
      if (disposed || !models.size) return false
      const bounds = new Box3().setFromObject(content); bounds.union(new Box3().setFromObject(wires))
      const sphere = bounds.getBoundingSphere(new Sphere()), target = controls?.target ?? viewTarget
      const direction = camera.position.clone().sub(target).normalize()
      const half = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect))
      const distance = Math.max(3, sphere.radius / Math.sin(half) * 1.2)
      if (!Number.isFinite(distance) || !sphere.center.toArray().every(Number.isFinite)) return false
      target.copy(sphere.center); camera.position.copy(target).addScaledVector(direction, distance); camera.lookAt(target)
      camera.zoom = 1; camera.far = Math.max(150, distance * 4 + sphere.radius * 2); camera.updateProjectionMatrix()
      zoomReferenceDistance = distance; zoomLimits(); controls?.update(); notifyZoom()
      schedule(); return true
    },
    orbit(degrees: number) { if (disposed || !Number.isFinite(degrees)) return; const target = controls?.target ?? viewTarget; camera.position.sub(target).applyAxisAngle(new Vector3(0, 1, 0), (degrees % 360) * Math.PI / 180).add(target); camera.lookAt(target); controls?.update(); schedule() },
    pan(horizontal: number, forward: number) {
      if (disposed || !Number.isFinite(horizontal) || !Number.isFinite(forward)) return
      camera.updateMatrixWorld()
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
      const ahead = new Vector3().crossVectors(new Vector3(0, 1, 0), right)
      translateView(right.multiplyScalar(horizontal).add(ahead.multiplyScalar(-forward)))
    },
    resetView() { if (disposed) return; zoomReferenceDistance = defaultDistance; zoomLimits(); viewTarget.set(0, 0, 0); camera.position.set(0, 11, 10); controls?.target.set(0, 0, 0); camera.lookAt(0, 0, 0); camera.zoom = 1; camera.far = 150; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); controls?.update(); notifyZoom(); schedule() },
    suspend(value: boolean) { suspended = value; if (value && frame !== null) { cancelFrame(frame); frame = null }; updateControlsEnabled(); if (!value) schedule() },
    dispose() { if (disposed) return; disposed = true; if (frame !== null) cancelFrame(frame); frame = null; controls?.removeEventListener('change', viewChanged); controls?.dispose(); removeActiveOutline(); wireLayer.dispose(); disposeObject(scene); models.clear(); modules.clear(); ghost = null; highlightedId = null; gizmoObstacles = []; scene.clear(); renderer.dispose() },
  }
}
