import { AmbientLight, BufferGeometry, Color, DirectionalLight, Group, LineBasicMaterial, LineLoop, Matrix4, Mesh, MOUSE, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, type Object3D } from 'three'
import { ORIENTATION_DIRECTIONS } from '../components/workbench/viewCubeMath'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { applyPose, buildComponent, disposeObject, portAnchor } from './ComponentModel'
import { getDefinition } from '../data/editorCatalog'
import { moduleWorldPose } from '../electrical/modulePose'
import type { MountCandidate } from '../electrical/mounting'
import { applyPackageSimulation, setPackagePinHighlight } from './PackageModel'
import { getPartForType } from '../data/partCatalog'
import { canUpdatePackageAppearance, updatePackageAppearance } from './PackageModel'
import { createStudioEnvironment } from './StudioEnvironment'
import type { WebGLRenderer } from 'three'
import { setPackagePinLabels } from './PackagePinLabels'
import type { CircuitGraph, CircuitModule, Point3, WireIdentity, WireVisual } from '../types/circuit'
import { contactFromInstance, getBreadboardContact, getBreadboardTopology } from '../electrical/BreadboardTopology'
import { parseEndpoint } from '../electrical/endpoints'
import { wireClearance, type WireRouteContext } from '../wires/wireRouting'
import { createSelectionOutline, updateSelectionOutline } from './SelectionOutline'
import { createTechnicalGrid, updateTechnicalGrid } from './TechnicalGrid'
import { Box3, Line3, Sphere } from 'three'
import { createComponentTransformGizmo, type GizmoObstacle, type TransformHandle } from './ComponentTransformGizmo'
import { applyPowerSupplyControls, supplyControlPatch, type SupplyControl } from './PowerSupplyModel'
import { createWireLayer } from './WireLayer'
import { CAMERA_NEAR, CAMERA_FAR, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, MIN_ZOOM_REFERENCE_DISTANCE, cameraNearForDistance, clampZoom } from '../config/workbenchViewport'

export interface SceneRenderer { readonly isWebGLRenderer?: boolean; setSize(width: number, height: number, updateStyle?: boolean): void; render(scene: Scene, camera: PerspectiveCamera): void; dispose(): void }
interface SceneOptions { renderer: SceneRenderer; canvas?: HTMLCanvasElement; onBeforeRender?: () => void; onRender?: () => void; onZoomChange?: (percent: number) => void; requestFrame?: (callback: FrameRequestCallback) => number; cancelFrame?: (id: number) => void }
export type PickResult = ({ kind: 'module'; id: string } | { kind: 'control'; id: string; control: SupplyControl } | { kind: 'port'; id: string; endpoint: string } | { kind: 'wire'; source: string; destination: string }) & { point: Vector3 }
export interface EndpointPick { kind: 'port' | 'contact'; id: string; endpoint: string; point: Vector3; contactId?: string }
export type WireEditPick = { kind: 'bend' | 'segment'; wire: WireIdentity; index: number; point: Vector3; basePoint?: Vector3 }
export interface OrientationAxis { label: 'X' | 'Y' | 'Z'; x: number; y: number; depth: number; color: string }

// Geometry is a projection of graph IDs and named logical ports, never a source of nets.
export function createSceneManager({ renderer, canvas, onBeforeRender, onRender, onZoomChange, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }: SceneOptions) {
  const scene = new Scene(); scene.background = new Color('#101925')
  const studio = renderer.isWebGLRenderer ? createStudioEnvironment(renderer as WebGLRenderer) : null
  if (studio) { scene.environment = studio.texture; scene.environmentIntensity = .55 }
  const camera = new PerspectiveCamera(42, 1, CAMERA_NEAR, CAMERA_FAR); camera.position.set(0, 11, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const grid = createTechnicalGrid()
  const ambient = new AmbientLight('#c9def4', 1.1)
  const light = new DirectionalLight('#fff5dc', 1.9); light.position.set(-5, 10, 5)
  const fillLight = new DirectionalLight('#a8c7e8', 0.75); fillLight.position.set(6, 8, -6)
  const content = new Group(), models = new Map<string, Group>(), modules = new Map<string, CircuitModule>()
  const mountPreview = new Group(); mountPreview.userData.ignorePick = true; scene.add(mountPreview)
  const r = .045
  const mountMarkerGeometry = new BufferGeometry().setFromPoints([new Vector3(-r, 0, -r), new Vector3(r, 0, -r), new Vector3(r, 0, r), new Vector3(-r, 0, r)])
  const mountMarkerValid = new LineBasicMaterial({ color: '#58e69c', depthTest: false }), mountMarkerInvalid = new LineBasicMaterial({ color: '#ff706b', depthTest: false })
  const clearMountPreview = () => mountPreview.clear()
  const endpointPosition = (endpoint: string): Vector3 | null => {
    if (disposed) return null
    const parsed = parseEndpoint(endpoint)
    if (!parsed) return null
    const id = parsed.moduleId, model = models.get(id), module = modules.get(id)
    if (parsed.kind === 'contact') {
      const contact = module && getBreadboardContact(module.type, parsed.contactId)
      return model && contact ? model.localToWorld(new Vector3(...contact.localPosition)) : null
    }
    const name = parsed.portId
    const port = module && getDefinition(module.type)?.ports.find((item) => item.id === name)
    return model && module && port ? model.localToWorld(portAnchor(module.type, port)) : null
  }
  const modulePose = (id: string): CircuitModule | null => {
    const module = modules.get(id), model = models.get(id)
    return module && model ? { ...module, position: { x: model.position.x, y: model.position.y, z: model.position.z }, rotation: model.rotation.y * 180 / Math.PI } : null
  }
  const previewMountedChildren = (boardId: string) => {
    const board = modulePose(boardId)
    if (!board) return
    const poses = [...modules.values()].map(m => m.id === boardId ? board : m)
    for (const child of poses.filter(m => m.mount?.boardId === boardId)) {
      const model = models.get(child.id)
      if (model) { applyPose(model, moduleWorldPose(child, poses)); wireLayer.updateModule(child.id) }
    }
  }
  const routeContext: WireRouteContext = { modulePose, endpoint: value => {
    const position = endpointPosition(value), parsed = parseEndpoint(value)
    const boardId = parsed && (parsed.kind === 'contact' ? parsed.moduleId : modules.get(parsed.moduleId)?.mount?.boardId)
    return position && parsed ? { endpoint: value, position, ...(boardId ? { contactModuleId: boardId } : {}) } : null
  } }
  const wireLayer = createWireLayer(endpointPosition, routeContext), wires = wireLayer.group
  const contactHover = new LineLoop(new BufferGeometry().setFromPoints([new Vector3(-.043, 0, -.043), new Vector3(.043, 0, -.043), new Vector3(.043, 0, .043), new Vector3(-.043, 0, .043)]), new LineBasicMaterial({ color: '#f1cd77' }))
  contactHover.name = 'contact-hover'; contactHover.visible = false; contactHover.userData.ignorePick = true
  scene.add(grid, ambient, light, fillLight, content, wires, wireLayer.tools, contactHover)
  const gizmo = createComponentTransformGizmo(); scene.add(gizmo.root)
  let gizmoObstacles: GizmoObstacle[] = []
  let gizmoLayoutRevision = 0
  const gizmoModel = () => ghost ?? (highlightedId ? models.get(highlightedId) : undefined)
  const updateGizmo = () => gizmo.update(gizmoModel(), models.values(), camera, width, height, gizmoObstacles, gizmoLayoutRevision)
  const raycaster = new Raycaster(), plane = new Plane(new Vector3(0, 1, 0), 0)
  let width = 1, height = 1, sized = false, frame: number | null = null, disposed = false, visible = false, suspended = false, pointerLocked = false
  let bufferWidth = 0, bufferHeight = 0
  let ghost: Group | null = null
  let highlightedPinModel: Group | null = null
  let showPins = false
  let transition: {
    startTime: number
    duration: number
    distance: number
    targetDir: Vector3
    startTheta: number
    thetaDelta: number
    startPhi: number
    targetPhi: number
  } | null = null

  const keepViewAboveBoard = () => {
    const origin = controls?.target ?? viewTarget
    // A side-view area selection can put its focal plane below the XZ board.
    // Translate the view, never graph/model poses, before allowing more navigation.
    if (origin.y < 0) { camera.position.y -= origin.y; origin.y = 0 }
  }

  const applyViewPose = (direction: Vector3, distance: number) => {
    keepViewAboveBoard()
    const targetPt = controls?.target ?? viewTarget
    const position = targetPt.clone().addScaledVector(direction, distance)
    // OrbitControls caches Y as its orbit axis and also uses camera.up for XZ panning.
    camera.up.set(0, 1, 0)
    camera.position.copy(position)
    controls?.update()
    // Controls nudges the pole for its spherical math. Presets retain exact positions.
    camera.position.copy(position)
    const lookUp = direction.x === 0 && direction.z === 0 ? new Vector3(0, 0, -1) : camera.up
    camera.quaternion.setFromRotationMatrix(new Matrix4().lookAt(position, targetPt, lookUp))
    camera.updateMatrixWorld()
  }

  const cancelTransition = () => {
    transition = null
  }

  const stepTransition = (timestamp?: number) => {
    if (!transition) return
    const now = typeof timestamp === 'number' && timestamp > 0 ? timestamp : (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const elapsed = now - transition.startTime
    const t = Math.min(1, Math.max(0, elapsed / transition.duration))
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    if (t >= 1) {
      applyViewPose(transition.targetDir, transition.distance)
      transition = null
      notifyZoom()
    } else {
      // Interpolate bounded polar/azimuth angles, including antipodal side faces.
      // A shortest 3D quaternion arc can otherwise pass below the breadboard.
      const phi = transition.startPhi + (transition.targetPhi - transition.startPhi) * ease
      const theta = transition.startTheta + transition.thetaDelta * ease
      const curDir = new Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta))
      applyViewPose(curDir, transition.distance)
      notifyZoom()
      schedule()
    }
  }

  const finishTransition = () => {
    if (!transition) return
    applyViewPose(transition.targetDir, transition.distance)
    transition = null
    notifyZoom()
    schedule()
  }

  const setViewOrientation = (direction: string | Vector3, animate = true, duration = 200) => {
    if (disposed) return
    const targetDir = typeof direction === 'string'
      ? (Object.hasOwn(ORIENTATION_DIRECTIONS, direction.toUpperCase()) ? ORIENTATION_DIRECTIONS[direction.toUpperCase()]!.clone() : undefined)
      : direction.clone()
    if (!targetDir || !Number.isFinite(targetDir.lengthSq()) || targetDir.lengthSq() < 1e-6 || targetDir.y < 0) return
    targetDir.normalize()

    const targetPt = controls?.target ?? viewTarget
    const currentOffset = camera.position.clone().sub(targetPt)
    const distance = currentOffset.length() > 1e-4 && Number.isFinite(currentOffset.length()) ? currentOffset.length() : defaultDistance
    const startDir = currentOffset.length() > 1e-4 ? currentOffset.normalize() : new Vector3(0, 1, 0)

    cancelTransition()

    if (!animate || duration <= 0) {
      applyViewPose(targetDir, distance)
      notifyZoom()
      schedule()
      return
    }

    const startTheta = Math.atan2(startDir.x, startDir.z), targetTheta = Math.atan2(targetDir.x, targetDir.z)
    const thetaDelta = Math.atan2(Math.sin(targetTheta - startTheta), Math.cos(targetTheta - startTheta))

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    transition = {
      startTime: now,
      duration,
      distance,
      targetDir,
      startTheta,
      thetaDelta,
      startPhi: Math.acos(Math.max(0, Math.min(1, startDir.y))),
      targetPhi: Math.acos(Math.max(0, Math.min(1, targetDir.y))),
    }
    schedule()
  }

  const schedule = () => {
    if (disposed || !visible || suspended || frame !== null) return
    frame = requestFrame((timestamp) => {
      // Layout obstacles join this draw, rather than scheduling a second draw after it.
      if (!disposed && visible && !suspended) onBeforeRender?.()
      frame = null
      if (!disposed && visible && !suspended) {
        if (transition) stepTransition(timestamp)
        // setSize clears the drawing buffer. Refill it in this same frame.
        if (bufferWidth !== width || bufferHeight !== height) { renderer.setSize(width, height, false); bufferWidth = width; bufferHeight = height }
        const target = controls?.target ?? viewTarget
        const focus = highlightedId ? models.get(highlightedId)?.position ?? target : target
        updateTechnicalGrid(grid, camera, target, focus, height)
        updateGizmo()
        wireLayer.updateCamera(camera, height); wireLayer.flush(); scene.updateMatrixWorld(true)
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
  let zoomReferenceDistance = defaultDistance, reportedZoom = ZOOM_DEFAULT
  const lastViewPosition = camera.position.clone(), lastViewTarget = target().clone(), dollyRay = new Raycaster()
  const guardDolly = () => {
    const origin = target(), previous = lastViewPosition.clone().sub(origin), next = camera.position.clone().sub(origin)
    // Only inward dolly is guarded; pan, orbit, Fit and changes of focal target
    // keep their own navigation contracts and never move model geometry.
    if (lastViewTarget.distanceToSquared(origin) > 1e-12 || next.length() >= previous.length() - 1e-9 || previous.clone().normalize().dot(next.clone().normalize()) < 1 - 1e-8) return
    const travel = lastViewPosition.distanceTo(camera.position)
    if (travel < 1e-9) return
    const direction = camera.position.clone().sub(lastViewPosition).normalize()
    const padding = Math.max(cameraNearForDistance(next.length()) * 4, Math.min(.015, next.length() * .05))
    scene.updateMatrixWorld(true)
    dollyRay.set(lastViewPosition, direction); dollyRay.near = 0; dollyRay.far = travel + padding
    wireLayer.flush()
    const hit = dollyRay.intersectObjects([...content.children, ...wires.children], true).find(hit => hit.object instanceof Mesh && !ignored(hit.object))
    if (hit) camera.position.copy(lastViewPosition).addScaledVector(direction, Math.max(0, hit.distance - padding))
    camera.updateMatrixWorld()
  }
  const zoomPercent = () => zoomReferenceDistance / camera.position.distanceTo(target()) * ZOOM_DEFAULT
  const notifyZoom = () => {
    const near = cameraNearForDistance(camera.position.distanceTo(target()))
    if (near !== camera.near) { camera.near = near; camera.updateProjectionMatrix() }
    lastViewPosition.copy(camera.position); lastViewTarget.copy(target())
    const percent = Math.round(zoomPercent() * 100) / 100
    if (Number.isFinite(percent) && percent !== reportedZoom) { reportedZoom = percent; onZoomChange?.(percent) }
  }
  const zoomLimits = () => { if (controls) { controls.minDistance = zoomReferenceDistance * ZOOM_DEFAULT / ZOOM_MAX; controls.maxDistance = zoomReferenceDistance * ZOOM_DEFAULT / ZOOM_MIN } }
  const viewChanged = () => { keepViewAboveBoard(); guardDolly(); notifyZoom(); schedule() }
  if (controls) {
    controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }
    controls.touches = { ONE: null, TWO: null }; controls.screenSpacePanning = false
    zoomLimits(); controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2
    controls.addEventListener('start', cancelTransition)
    controls.addEventListener('change', viewChanged); controls.saveState()
  }
  const validPointer = (x: number, y: number) => !disposed && Number.isFinite(x) && Number.isFinite(y)
  const ray = (x: number, y: number) => { camera.updateMatrixWorld(); raycaster.params.Line.threshold = camera.position.distanceTo(controls?.target ?? viewTarget) * 2 * Math.tan(camera.fov * Math.PI / 360) / (height * camera.zoom) * 6; raycaster.setFromCamera(new Vector2(x / width * 2 - 1, -(y / height) * 2 + 1), camera) }
  const pickOwner = (object: Object3D) => { while (object.parent && !object.userData.kind) object = object.parent; return object }
  const ignored = (object: Object3D) => { let current: Object3D | null = object; while (current) { if (current.userData.ignorePick) return true; current = current.parent }; return false }
  const wireMeshes = (root?: Object3D) => (root ? [root] : wires.children).flatMap(mesh => [mesh, ...mesh.children.filter(child => child instanceof Mesh)])
  const contentHit = (x: number, y: number) => { ray(x, y); return raycaster.intersectObjects(content.children, true).find(hit => !ignored(hit.object)) ?? null }
  const screenPoint = (point: Point3) => {
    const world = new Vector3(point.x, point.y, point.z), projected = world.clone().project(camera), depth = -world.clone().applyMatrix4(camera.matrixWorldInverse).z
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2, depth, visible: projected.z >= -1 && projected.z <= 1 }
  }
  const segmentHit = (a: Point3, b: Point3, x: number, y: number) => {
    const p = screenPoint(a), q = screenPoint(b)
    if (!p.visible || !q.visible || p.depth <= 0 || q.depth <= 0) return null
    const dx = q.x - p.x, dy = q.y - p.y, length = dx * dx + dy * dy
    const t = length > 1e-8 ? Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / length)) : 0
    // Screen interpolation is perspective divided; undo it before locating the world point.
    const worldT = t * p.depth / ((1 - t) * q.depth + t * p.depth)
    const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), worldT)
    return { point, pixels: Math.hypot(x - p.x - dx * t, y - p.y - dy * t), distance: point.distanceTo(camera.position) }
  }
  const visiblePoint = (point: Point3) => {
    const p = screenPoint(point)
    if (!p.visible) return false
    const hit = contentHit(p.x, p.y)
    return !hit || hit.distance >= new Vector3(point.x, point.y, point.z).distanceTo(camera.position) - .018
  }
  const planeHit = (elevation: number) => {
    plane.constant = -elevation
    const hit = raycaster.ray.intersectPlane(plane, new Vector3())
    if (!hit) return null
    const distance = hit.distanceTo(camera.position)
    // Nearly horizontal rays otherwise intersect arbitrarily far away and jump the camera.
    return Number.isFinite(distance) && distance >= camera.near && distance <= camera.far ? hit : null
  }
  const translateView = (delta: Vector3) => { cancelTransition(); camera.position.add(delta); (controls?.target ?? viewTarget).add(delta); camera.updateMatrixWorld(); controls?.update(); schedule() }
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
    hoverGizmo(x: number, y: number) { if (!validPointer(x, y)) return null; updateGizmo(); ray(x, y); const handle = gizmo.pick(raycaster)?.handle ?? null; gizmo.capturePlacement(x, y, camera, width, height); gizmo.hover(handle); schedule(); return handle },
    placementFollowBlocked() { return !!ghost && gizmo.placementFollowBlocked() },
    clearGizmoHover() { if (disposed) return; gizmo.clearPlacementCapture(); gizmo.hover(null); schedule() },
    activateGizmo(handle: TransformHandle | null) { if (disposed) return; updateGizmo(); gizmo.activate(handle, gizmoModel()); schedule() },
    syncGraph(next: CircuitGraph | null) {
      if (disposed) return
      contactHover.visible = false
      gizmoLayoutRevision++
      modules.clear(); for (const module of next?.modules ?? []) modules.set(module.id, module)
      const ids = new Set(next?.modules.map((module) => module.id))
      for (const [id, model] of models) if (!ids.has(id)) { if (activeOutline?.id === id) removeActiveOutline(); if (highlightedId === id) highlightedId = null; disposeObject(model); content.remove(model); models.delete(id) }
      for (const module of next?.modules ?? []) {
        let model = models.get(module.id)
        const signature = JSON.stringify([module.type, module.properties])
        if (model && model.userData.signature !== signature) {
          const part = getPartForType(module.type)
          if (model.userData.type === module.type && part && canUpdatePackageAppearance(part)) {
            updatePackageAppearance(model, module, part); model.userData.signature = signature
          }
          // Supply settings already have an in-place display/knob update in applyPose.
          else if (model.userData.type === module.type && getDefinition(module.type)?.visual === 'supply') model.userData.signature = signature
          else { if (activeOutline?.id === module.id) removeActiveOutline(); disposeObject(model); content.remove(model); models.delete(module.id); model = undefined }
        }
        if (!model) { model = buildComponent(module); model.userData.onVisualChange = schedule; models.set(module.id, model); content.add(model) }
        applyPose(model, moduleWorldPose(module, next!.modules))
        if (showPins) { const part = getPartForType(module.type); if (part) setPackagePinLabels(model, part, null, true) }
      }
      attachOutline()
      wireLayer.sync(next?.connections ?? []); schedule()
    },
    previewMove(id: string, position: Required<NonNullable<CircuitModule['position']>>) { const model = models.get(id); if (model && !disposed && [position.x, position.y, position.z].every(Number.isFinite)) { model.position.set(position.x, position.y, position.z); model.updateMatrixWorld(true); previewMountedChildren(id); wireLayer.updateModule(id); schedule() } },
    previewRotation(id: string, degrees: number) { const model = models.get(id); if (model && !disposed && Number.isFinite(degrees)) { model.rotation.y = (degrees % 360) * Math.PI / 180; model.updateMatrixWorld(true); previewMountedChildren(id); wireLayer.updateModule(id); schedule() } },
    setMountPreview(candidate: MountCandidate | null) {
      clearMountPreview()
      for (const pin of candidate?.pins ?? []) {
        const marker = new LineLoop(mountMarkerGeometry, pin.valid ? mountMarkerValid : mountMarkerInvalid)
        marker.position.set(pin.position.x, pin.position.y + .03, pin.position.z); marker.renderOrder = 20; mountPreview.add(marker)
      }
      schedule()
    },
    setSimulationStates(states: Record<string, { state?: string; reason?: string }> | null) {
      for (const [id, model] of models) {
        const state = states?.[id]
        applyPackageSimulation(model, state ? { status: state.state, ledOn: state.state === 'ON' } : null)
      }
      schedule()
    },
    placementPoint(x: number, y: number): Vector3 | null {
      if (!validPointer(x, y)) return null
      ray(x, y); scene.updateMatrixWorld(true)
      const boards = [...models].filter(([id]) => getBreadboardTopology(modules.get(id)!.type)).map(([, model]) => model)
      const hit = raycaster.intersectObjects(boards, true)[0]
      if (hit) {
        let owner: Object3D | null = hit.object
        while (owner && !models.has(owner.userData.id)) owner = owner.parent
        const module = owner && modules.get(owner.userData.id)
        if (module) return raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -(owner!.position.y + getBreadboardTopology(module.type)!.contacts[0].localPosition[1])), new Vector3())
      }
      return raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3())
    },
    previewSupplyControl(id: string, control: SupplyControl, value: number | boolean) {
      const model = models.get(id), module = modules.get(id)
      if (model && module && getDefinition(module.type)?.visual === 'supply' && !disposed) {
        applyPowerSupplyControls(model, { ...module.properties, ...supplyControlPatch(module.type, control, value) }); model.updateMatrixWorld(true); schedule()
      }
    },
    setGhost(type: string | null, position?: Required<NonNullable<CircuitModule['position']>>, rotation = 0, properties?: Record<string, unknown>) {
      if (disposed || !Number.isFinite(rotation) || (position && ![position.x, position.y, position.z].every(Number.isFinite))) return
      if (ghost && type && position && ghost.userData.signature === JSON.stringify([type, properties])) { applyPose(ghost, { id: 'PLACE', type, position, rotation, properties }); updateGizmo(); schedule(); return }
      if (ghost) { disposeObject(ghost); scene.remove(ghost); ghost = null }
      if (type && position && getDefinition(type)) {
        // PLACE is a render-only pick target, absent from models, ports and Circuit Graph.
        ghost = buildComponent({ id: 'PLACE', type, position, rotation, properties }); ghost.userData.kind = 'placement'
        ghost.traverse((object) => {
          if (object instanceof Mesh) {
            const mats = Array.isArray(object.material) ? object.material : [object.material]
            mats.forEach((m) => { if ('transparent' in m) { m.transparent = true; m.opacity = 0.4 } })
          }
        })
        scene.add(ghost)
      }
      updateGizmo()
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
      wireLayer.flush(); scene.updateMatrixWorld(true)
      const body = contentHit(x, y)
      // Close-up tubes can occupy many pixels: their visible surface is a hit
      // even when the forgiving centerline margin is outside the cursor.
      const tube = raycaster.intersectObjects(wireMeshes(), false)[0]
      if (tube && (!body || tube.distance <= body.distance + .015)) return { kind: 'wire', ...tube.object.userData as WireIdentity, point: tube.point.clone() }
      let best: { wire: WireIdentity; point: Vector3; distance: number; pixels: number } | null = null
      for (const mesh of wires.children) {
        const wire = mesh.userData as WireIdentity, route = wireLayer.route(wire)
        for (const segment of route?.renderSegments ?? route?.segments ?? []) {
          const hit = segmentHit(segment.start, segment.end, x, y)
          if (hit && hit.pixels <= 6 && (!body || hit.distance <= body.distance + .015) && (!best || hit.pixels < best.pixels - .1 || Math.abs(hit.pixels - best.pixels) <= .1 && hit.distance < best.distance)) best = { wire, ...hit }
        }
      }
      if (best) return { kind: 'wire', ...best.wire, point: best.point }
      const owner = body && pickOwner(body.object)
      return owner?.userData.kind ? { ...owner.userData, point: body!.point.clone() } as PickResult : null
    },
    pickEndpoint(x: number, y: number): EndpointPick | null {
      if (!validPointer(x, y)) return null
      scene.updateMatrixWorld(true)
      const hit = contentHit(x, y)
      if (!hit) return null
      const owner = pickOwner(hit.object)
      if (owner.userData.kind === 'port') return { kind: 'port', id: owner.userData.id, endpoint: owner.userData.endpoint, point: hit.point.clone() }
      if (hit.object.userData.breadboardSockets && hit.instanceId !== undefined) {
        const id = owner.userData.id as string, module = modules.get(id), contact = module && contactFromInstance(module.type, hit.instanceId)
        if (contact && hit.object.userData.contactIds?.[hit.instanceId] === contact.contactId) return { kind: 'contact', id, contactId: contact.contactId, endpoint: `${id}.contact:${contact.contactId}`, point: hit.point.clone() }
      }
      return null
    },
    hoverEndpoint(endpoint: string | null) {
      if (disposed) return
      contactHover.visible = false
      if (highlightedPinModel) {
        setPackagePinHighlight(highlightedPinModel, null)
        const part = getPartForType(highlightedPinModel.userData.type)
        if (part) setPackagePinLabels(highlightedPinModel, part, null, showPins)
      }
      highlightedPinModel = null
      const parsed = endpoint && parseEndpoint(endpoint), module = parsed && modules.get(parsed.moduleId), model = parsed && models.get(parsed.moduleId)
      if (parsed && module && model) {
        const anchor = endpointPosition(endpoint!)
        if (anchor) {
          if (parsed.kind === 'port' && getPartForType(module.type)) { setPackagePinHighlight(model, parsed.portId); setPackagePinLabels(model, getPartForType(module.type)!, parsed.portId, showPins); highlightedPinModel = model; schedule(); return }
          contactHover.position.copy(anchor)
          if (parsed.kind === 'contact') contactHover.position.y = model.position.y + (getBreadboardTopology(module.type)?.deckHeight ?? .33) + .004
          contactHover.rotation.y = model.rotation.y; contactHover.visible = true
        }
      }
      schedule()
    },
    setShowPins(value: boolean) {
      showPins = value
      for (const [id, model] of models) { const part = getPartForType(modules.get(id)!.type); if (part) setPackagePinLabels(model, part, null, value) }
      schedule()
    },
    wireContext: routeContext,
    wireRoute(wire: WireIdentity) { if (disposed) return null; wireLayer.flush(); return wireLayer.route(wire) },
    wireOrderPeers(wire: WireIdentity, connected = false) { if (disposed) return []; wireLayer.flush(); return wireLayer.orderPeers(wire, connected) },
    previewWireVisual(wire: WireIdentity, visual: WireVisual | null) { wireLayer.previewVisual(wire, visual); schedule() },
    previewWireDrawing(wire: WireIdentity, visual: WireVisual, cursor: Point3 | null) { wireLayer.previewDrawing(wire, visual, cursor); schedule() },
    clearWireDrawing() { wireLayer.clearDrawing(); schedule() },
    hoverWireEdit(hit: WireEditPick | null) { wireLayer.hover(hit?.wire ?? null); wireLayer.selectHandle(hit?.kind === 'bend' ? hit.index : null); wireLayer.selectSegment(hit?.kind === 'segment' ? hit.index : null); schedule() },
    pickWireEdit(x: number, y: number, wire: WireIdentity): WireEditPick | null {
      if (!validPointer(x, y)) return null
      wireLayer.flush(); scene.updateMatrixWorld(true)
      const route = wireLayer.route(wire)
      if (!route) return null
      for (const handle of route.renderHandles ?? route.handles) {
        const p = screenPoint(handle.position)
        if (p.visible && Math.hypot(x - p.x, y - p.y) <= 8 && visiblePoint(handle.position)) { const base = route.handles.find(value => value.index === handle.index)!.position; return { kind: 'bend', wire, index: handle.index, point: new Vector3(handle.position.x, handle.position.y, handle.position.z), basePoint: new Vector3(base.x, base.y, base.z) } }
      }
      const segments = route.renderSegments ?? route.segments
      const basePoint = (segment: typeof segments[number], point: Vector3) => {
        if (!('baseStart' in segment) || !('baseEnd' in segment)) return point.clone()
        const start = new Vector3(segment.start.x, segment.start.y, segment.start.z), end = new Vector3(segment.end.x, segment.end.y, segment.end.z)
        const t = new Line3(start, end).closestPointToPointParameter(point, true)
        const a = segment.baseStart as Point3, b = segment.baseEnd as Point3
        return new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), t)
      }
      let best: { index: number; point: Vector3; pixels: number; basePoint: Vector3 } | null = null
      for (const segment of segments) {
        if (!segment.editable) continue
        const hit = segmentHit(segment.start, segment.end, x, y)
        if (hit && hit.pixels <= 6 && visiblePoint(hit.point) && (!best || hit.pixels < best.pixels)) best = { index: segment.index, ...hit, basePoint: basePoint(segment, hit.point) }
      }
      if (best) return { kind: 'segment', wire, index: best.index, point: best.point, basePoint: best.basePoint }
      const body = contentHit(x, y), mesh = wires.children.find(mesh => mesh.userData.source === wire.source && mesh.userData.destination === wire.destination)
      const tube = mesh && raycaster.intersectObjects(wireMeshes(mesh), false)[0]
      if (!tube || body && tube.distance > body.distance + .015) return null
      // At close magnification, a tube is much wider than the centerline margin.
      // Map its surface to the nearest solved segment, retaining pinned leads.
      let nearest: { index: number; editable: boolean; point: Vector3; distance: number; basePoint: Vector3 } | null = null
      for (const segment of segments) {
        const line = new Line3(new Vector3(segment.start.x, segment.start.y, segment.start.z), new Vector3(segment.end.x, segment.end.y, segment.end.z))
        const point = line.closestPointToPoint(tube.point, true, new Vector3()), distance = point.distanceToSquared(tube.point)
        if (!nearest || distance < nearest.distance) nearest = { index: segment.index, editable: segment.editable, point, distance, basePoint: basePoint(segment, point) }
      }
      return nearest?.editable ? { kind: 'segment', wire, index: nearest.index, point: nearest.point, basePoint: nearest.basePoint } : null
    },
    wireSupportModule(x: number, y: number): CircuitModule | null {
      if (!validPointer(x, y)) return null
      scene.updateMatrixWorld(true)
      const hit = contentHit(x, y), owner = hit && pickOwner(hit.object), module = owner && modulePose(owner.userData.id)
      return module && getBreadboardTopology(module.type) ? module : null
    },
    wireRoutingPoint(x: number, y: number, frameModuleId: string | null, visual: WireVisual, elevation?: number): Point3 | null {
      if (!validPointer(x, y)) return null
      scene.updateMatrixWorld(true)
      const hit = contentHit(x, y), owner = hit && pickOwner(hit.object), hitModule = owner && modulePose(owner.userData.id)
      const module = hitModule && getBreadboardTopology(hitModule.type) ? hitModule : frameModuleId ? modulePose(frameModuleId) : null
      const board = module && getBreadboardTopology(module.type)
      const sourceHeight = (module?.position?.y ?? 0) + wireClearance(visual)
      ray(x, y)
      const point = planeHit(elevation !== undefined && Number.isFinite(elevation) ? elevation : board && module ? (module.position?.y ?? 0) + board.deckHeight + wireClearance(visual) : sourceHeight)
      if (!point || hit && hit.distance < point.distanceTo(camera.position) - .02 && !getBreadboardTopology(hitModule?.type ?? '')) return null
      return { x: point.x, y: point.y, z: point.z }
    },
    groundPoint(x: number, y: number, elevation = 0) { if (!validPointer(x, y) || !Number.isFinite(elevation)) return null; ray(x, y); return planeHit(elevation) },
    panGrab(anchor: Vector3, x: number, y: number) {
      if (!validPointer(x, y) || suspended || !anchor.toArray().every(Number.isFinite)) return
      ray(x, y)
      const current = planeHit(anchor.y)
      if (current) translateView(anchor.clone().sub(current).setY(0))
    },
    lockPointer(value: boolean) { pointerLocked = value; updateControlsEnabled() },
    setWireDrawingActive(value: boolean) { if (!disposed && controls) controls.mouseButtons.RIGHT = value ? null : MOUSE.ROTATE },
    hoverWire(wire: WireIdentity | null) { wireLayer.hover(wire); schedule() },
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
      cancelTransition()
      const origin = target(), direction = camera.position.clone().sub(origin).normalize()
      camera.position.copy(origin).addScaledVector(direction, zoomReferenceDistance * ZOOM_DEFAULT / clampZoom(percent))
      guardDolly()
      camera.zoom = 1; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); controls?.update(); notifyZoom(); schedule()
    },
    zoomToArea(x1: number, y1: number, x2: number, y2: number) {
      if (disposed || suspended || !visible || ![x1, y1, x2, y2].every(Number.isFinite)) return false
      cancelTransition()
      const left = Math.max(0, Math.min(width, Math.min(x1, x2))), right = Math.max(0, Math.min(width, Math.max(x1, x2)))
      const top = Math.max(0, Math.min(height, Math.min(y1, y2))), bottom = Math.max(0, Math.min(height, Math.max(y1, y2)))
      if (right - left < 12 || bottom - top < 12) return false
      const origin = target(), direction = camera.position.clone().sub(origin), distance = direction.length()
      if (!Number.isFinite(distance) || distance <= camera.near) return false
      if (left === 0 && top === 0 && right === width && bottom === height) {
        zoomReferenceDistance = Math.max(distance, MIN_ZOOM_REFERENCE_DISTANCE)
        camera.position.copy(origin).addScaledVector(direction, zoomReferenceDistance / distance)
        zoomLimits(); controls?.update(); notifyZoom(); schedule(); return true
      }
      direction.normalize()
      const x = (left + right) / 2, y = (top + bottom) / 2
      // Focus the actual surface under the rectangle, keeping a finite fallback above the horizon.
      const surfacePoint = (sx: number, sy: number) => {
        const hit = this.pick(sx, sy)
        if (hit?.kind === 'wire') {
          // Wire picking uses a forgiving centerline for editing. Area framing
          // instead focuses the rendered tube surface to keep close dolly outside.
          ray(sx, sy)
          const mesh = wires.children.find(mesh => mesh.userData.source === hit.source && mesh.userData.destination === hit.destination)
          const surface = mesh && raycaster.intersectObjects(wireMeshes(mesh), false)[0]
          if (surface) return surface.point
        }
        return hit?.point ?? this.groundPoint(sx, sy)
      }
      const focus = surfacePoint(x, y) ?? origin
      const depth = camera.position.clone().sub(focus).dot(direction)
      if (!Number.isFinite(depth) || depth <= camera.near) return false
      ray(x, y)
      const focalPlane = new Plane().setFromNormalAndCoplanarPoint(direction, focus)
      const center = raycaster.ray.intersectPlane(focalPlane, new Vector3())
      if (!center || !center.toArray().every(Number.isFinite)) return false
      let nextDistance = Math.max(MIN_ZOOM_REFERENCE_DISTANCE, camera.near * 4, depth * Math.max((right - left) / width, (bottom - top) / height))
      const screenRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), screenUp = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      const verticalTangent = Math.tan(camera.fov * Math.PI / 360), horizontalTangent = verticalTangent * camera.aspect
      // Fit boundary surface depths too: a low-angle dolly must not pass the nearer edge.
      for (const sx of [left, x, right]) for (const sy of [top, y, bottom]) {
        let point = surfacePoint(sx, sy)
        if (!point) { ray(sx, sy); point = raycaster.ray.intersectPlane(focalPlane, new Vector3()) }
        if (!point || !point.toArray().every(Number.isFinite)) continue
        const offset = point.clone().sub(center)
        nextDistance = Math.max(nextDistance, offset.dot(direction) + Math.max(camera.near * 4, Math.abs(offset.dot(screenRight)) / horizontalTangent, Math.abs(offset.dot(screenUp)) / verticalTangent))
      }
      if (!Number.isFinite(nextDistance)) return false
      nextDistance *= 1.01
      origin.copy(center); camera.position.copy(center).addScaledVector(direction, nextDistance)
      keepViewAboveBoard(); camera.lookAt(origin)
      camera.zoom = 1; camera.far = Math.max(camera.far, nextDistance * 4); camera.updateProjectionMatrix(); camera.updateMatrixWorld()
      zoomReferenceDistance = nextDistance; zoomLimits(); controls?.update(); notifyZoom(); schedule()
      return true
    },
    fitCircuit() {
      if (disposed || !models.size) return false
      cancelTransition()
      const bounds = new Box3().setFromObject(content); bounds.union(new Box3().setFromObject(wires))
      const sphere = bounds.getBoundingSphere(new Sphere()), target = controls?.target ?? viewTarget
      const center = sphere.center.clone().setY(Math.max(0, sphere.center.y))
      const direction = camera.position.clone().sub(target).normalize()
      const half = Math.min(camera.fov * Math.PI / 360, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect))
      const radius = sphere.radius + center.distanceTo(sphere.center)
      const distance = Math.max(3, radius / Math.sin(half) * 1.2)
      if (!Number.isFinite(distance) || !sphere.center.toArray().every(Number.isFinite)) return false
      target.copy(center); camera.position.copy(target).addScaledVector(direction, distance); camera.lookAt(target)
      camera.zoom = 1; camera.far = Math.max(CAMERA_FAR, distance * 4 + radius * 2); camera.updateProjectionMatrix()
      zoomReferenceDistance = distance; zoomLimits(); controls?.update(); notifyZoom()
      schedule(); return true
    },
    orbit(degrees: number, pitch = 0) {
      if (disposed || !Number.isFinite(degrees) || !Number.isFinite(pitch)) return
      cancelTransition()
      const target = controls?.target ?? viewTarget
      const offset = camera.position.clone().sub(target)
      const radius = offset.length()
      if (radius < 1e-4) return
      let theta = Math.atan2(offset.x, offset.z)
      let phi = Math.acos(Math.min(1, Math.max(-1, offset.y / radius)))
      theta += (degrees % 360) * Math.PI / 180
      phi += (pitch % 360) * Math.PI / 180
      phi = Math.max(0, Math.min(Math.PI / 2, phi))
      offset.x = radius * Math.sin(phi) * Math.sin(theta)
      offset.y = radius * Math.cos(phi)
      offset.z = radius * Math.sin(phi) * Math.cos(theta)
      applyViewPose(offset.divideScalar(radius), radius)
      schedule()
    },
    pan(horizontal: number, forward: number) {
      if (disposed || !Number.isFinite(horizontal) || !Number.isFinite(forward)) return
      camera.updateMatrixWorld()
      const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
      const ahead = new Vector3().crossVectors(new Vector3(0, 1, 0), right)
      translateView(right.multiplyScalar(horizontal).add(ahead.multiplyScalar(-forward)))
    },
    resetView() {
      if (disposed) return
      cancelTransition()
      zoomReferenceDistance = defaultDistance
      zoomLimits()
      viewTarget.set(0, 0, 0)
      controls?.target.set(0, 0, 0)
      applyViewPose(new Vector3(0, 11, 10).normalize(), defaultDistance)
      camera.zoom = 1
      camera.far = CAMERA_FAR
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      controls?.update()
      notifyZoom()
      schedule()
    },
    cameraQuaternion(): [number, number, number, number] {
      return [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w]
    },
    cameraDirection(): Vector3 {
      return camera.position.clone().sub(controls?.target ?? viewTarget).normalize()
    },
    placementFacingYaw(): number {
      const heading = camera.position.clone().sub(target()).normalize()
      // At the pole, screen-down supplies a stable XZ heading without noisy azimuth.
      if (Math.hypot(heading.x, heading.z) < 1e-6) heading.set(0, -1, 0).applyQuaternion(camera.quaternion)
      const degrees = Math.atan2(heading.x, heading.z) * 180 / Math.PI
      return Number.isFinite(degrees) ? ((degrees % 360) + 360) % 360 : 0
    },
    target(): Vector3 {
      return (controls?.target ?? viewTarget).clone()
    },
    isTransitioning(): boolean {
      return transition !== null
    },
    cancelTransition,
    finishTransition,
    setViewOrientation,
    suspend(value: boolean) { suspended = value; if (value && frame !== null) { cancelFrame(frame); frame = null }; updateControlsEnabled(); if (!value) schedule() },
    dispose() { if (disposed) return; disposed = true; cancelTransition(); gizmo.update(undefined, [], camera, width, height); if (frame !== null) cancelFrame(frame); frame = null; controls?.removeEventListener('change', viewChanged); controls?.removeEventListener('start', cancelTransition); controls?.dispose(); removeActiveOutline(); wireLayer.dispose(); clearMountPreview(); mountMarkerGeometry.dispose(); mountMarkerValid.dispose(); mountMarkerInvalid.dispose(); disposeObject(scene); models.clear(); modules.clear(); ghost = null; highlightedId = null; gizmoObstacles = []; scene.environment = null; studio?.dispose(); scene.clear(); renderer.dispose() },
  }
}
