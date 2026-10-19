import { AmbientLight, BufferGeometry, Color, DirectionalLight, Group, LineBasicMaterial, LineLoop, Matrix4, Mesh, MOUSE, PerspectiveCamera, Plane, Raycaster, Scene, Vector3, type Object3D } from 'three'
import { ORIENTATION_DIRECTIONS } from '../components/workbench/viewCubeMath'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { applyPose, buildComponent, disposeObject, portAnchor } from './ComponentModel'
import { getDefinition } from '../data/editorCatalog'
import { moduleWorldPose } from '../electrical/modulePose'
import type { MountCandidate } from '../electrical/mounting'
import { applyPackageSimulation, setPackagePinHighlight } from './PackageModel'
import { getPartForType, getPartForModule, physicalDescriptorForPart } from '../data/partCatalog'
import { canUpdatePackageAppearance, updatePackageAppearance } from './PackageModel'
import { updateFlexiblePackageGeometry } from './package/FlexiblePackageGeometry'
import { updateMountedPackageInsertion } from './package/MountedPackageInsertion'
import { updateLabelModel } from './LabelModel'
import { synchronizeLabelBoardPoses } from '../geometry/labelBoardPose'
import { displaySegmentsFromPinEvidence, type ObservedPinLevels } from './package/DisplayPinEvidence'
import type { ContactControlHit } from '../editor/contactInteraction'
import { MM_TO_WORLD } from '../data/partCatalog'
import { MeshBasicMaterial, SphereGeometry } from 'three'
import { isFlexibleMount } from '../electrical/flexibleGeometry'
import { createStudioEnvironment } from './StudioEnvironment'
import type { WebGLRenderer } from 'three'
import { setPackagePinLabels } from './PackagePinLabels'
import type { CircuitGraph, CircuitModule, Point3, WireIdentity, WireVisual } from '../types/circuit'
import { contactFromInstance, getBreadboardContact, getBreadboardTopology } from '../electrical/BreadboardTopology'
import { parseEndpoint } from '../electrical/endpoints'
import { wireClearance, type SolvedWireRoute, type WireRouteContext } from '../wires/wireRouting'
import { createSelectionOutline, updateSelectionOutline } from './SelectionOutline'
import { createTechnicalGrid, updateTechnicalGrid } from './TechnicalGrid'
import { Box3, Line3 } from 'three'
import { createComponentTransformGizmo, type GizmoObstacle, type TransformHandle } from './ComponentTransformGizmo'
import { applyPowerSupplyControls, supplyControlPatch, type SupplyControl } from './PowerSupplyModel'
import { createWireLayer } from './WireLayer'
import { createSelectionPreview } from './SelectionPreview'
import { createScenePicking } from './ScenePicking'
import { createSceneClipping } from './SceneClipping'
import { createFramingBounds, solveOverview, solveArea, type FramingSnapshot, type NdcRect } from './CameraFraming'
import { createViewportNavigation, type NavigationSnapshot } from './ViewportNavigation'
import type { EditorSelection } from '../editor/selection'
import { projectedTranslationDelta } from '../geometry/transformDrag'
import { projectedBreadboardEnclosedInRect, projectedObjectIntersectsRect, type ScreenRect } from './ProjectedSelection'
import { CAMERA_NEAR, CAMERA_FAR, navigationClearanceForDistance } from '../config/workbenchViewport'

export interface SceneRenderer { readonly isWebGLRenderer?: boolean; setSize(width: number, height: number, updateStyle?: boolean): void; render(scene: Scene, camera: PerspectiveCamera): void; dispose(): void }
interface SceneOptions { renderer: SceneRenderer; canvas?: HTMLCanvasElement; onBeforeRender?: () => void; onRender?: () => void; onZoomChange?: (percent: number) => void; onNavigationChange?: (snapshot:NavigationSnapshot) => void; requestFrame?: (callback: FrameRequestCallback) => number; cancelFrame?: (id: number) => void }
export type PickResult = ({ kind: 'module'; id: string } | { kind: 'control'; id: string; control: SupplyControl } | { kind: 'port'; id: string; endpoint: string } | { kind: 'wire'; source: string; destination: string }) & { point: Vector3 }
export interface EndpointPick { kind: 'port' | 'contact'; id: string; endpoint: string; point: Vector3; contactId?: string }
export type WireEditPick = { kind: 'bend' | 'segment'; wire: WireIdentity; index: number; point: Vector3; basePoint?: Vector3 }
export interface OrientationAxis { label: 'X' | 'Y' | 'Z'; x: number; y: number; depth: number; color: string }
export type FlexibleHandle = {id:string;handle:'pin-0'|'pin-1';point:Vector3}

// Geometry is a projection of graph IDs and named logical ports, never a source of nets.
export function createSceneManager({ renderer, canvas, onBeforeRender, onRender, onZoomChange, onNavigationChange, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }: SceneOptions) {
  const scene = new Scene(); scene.background = new Color('#101925')
  const studio = renderer.isWebGLRenderer ? createStudioEnvironment(renderer as WebGLRenderer) : null
  if (studio) { scene.environment = studio.texture; scene.environmentIntensity = .55 }
  const camera = new PerspectiveCamera(42, 1, CAMERA_NEAR, CAMERA_FAR); camera.position.set(0, 11, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const grid = createTechnicalGrid()
  const ambient = new AmbientLight('#c9def4', 1.1)
  const light = new DirectionalLight('#fff5dc', 1.9); light.position.set(-5, 10, 5)
  light.castShadow = true
  light.shadow.mapSize.width = 1024
  light.shadow.mapSize.height = 1024
  light.shadow.camera.near = 1
  light.shadow.camera.far = 30
  light.shadow.camera.left = -12
  light.shadow.camera.right = 12
  light.shadow.camera.top = 12
  light.shadow.camera.bottom = -12
  light.shadow.bias = -0.0005
  light.shadow.normalBias = 0.002
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
    const resolved = model?.userData.resolvedPinAnchors?.[name] as [number,number,number] | undefined
    return model && module && port ? model.localToWorld(resolved ? new Vector3(...resolved) : portAnchor(module.type, port)) : null
  }
  const modulePose = (id: string): CircuitModule | null => {
    const module = modules.get(id), model = models.get(id)
    return module && model ? { ...module, position: { x: model.position.x, y: model.position.y, z: model.position.z }, rotation: model.rotation.y * 180 / Math.PI } : null
  }
  const previewMountedChildren = (boardId: string) => {
    const board = modulePose(boardId)
    if (!board) return
    const poses = [...modules.values()].map(m => m.id === boardId ? board : m)
    const associated = synchronizeLabelBoardPoses([...modules.values()], poses)
    for (const child of associated.filter(m => m.mount?.boardId === boardId || m.type === 'LABEL' && m.properties?.boardId === boardId)) {
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
  const flexibleHandles = new Group(); flexibleHandles.name = 'flexible-edit-handles'; scene.add(flexibleHandles)
  const handleSphere = new SphereGeometry(.032,12,8)
  for (const handle of ['pin-0','pin-1'] as const) {
    const marker=new Mesh(handleSphere,new MeshBasicMaterial({color:'#ffd467',depthTest:false,transparent:true,opacity:.95}));marker.userData={flexibleHandle:handle,ignorePick:true};marker.renderOrder=40;flexibleHandles.add(marker)
  }
  let flexibleEditing=true, flexibleGhost:Group|null=null
  function updateFlexibleHandles(){
    const model=highlightedId?models.get(highlightedId):null,module=highlightedId?modules.get(highlightedId):null
    flexibleHandles.visible=!!(flexibleEditing&&model&&isFlexibleMount(module?.mount))
    if(!flexibleHandles.visible||!model||!module||!isFlexibleMount(module.mount))return
    const anchors=model.userData.resolvedPinAnchors as Record<string,[number,number,number]>
    flexibleHandles.children.forEach((marker,index)=>{
      const pinId=getPartForModule(module)!.package.pins[index].id,anchor=anchors[pinId];marker.position.copy(model.localToWorld(new Vector3(...anchor)));marker.position.y+=.018
      marker.userData.id=module.id
    })
  }
  const selectionPreview = createSelectionPreview(() => contentChanged()); scene.add(selectionPreview.root)
  let gizmoObstacles: GizmoObstacle[] = []
  let gizmoLayoutRevision = 0
  const gizmoModel = () => ghost ? ghostModule?.type === 'LABEL' ? undefined : ghost : highlightedId ? models.get(highlightedId) : undefined
  const updateGizmo = () => {ensureProjection();gizmo.update(gizmoModel(), models.values(), camera, width, height, gizmoObstacles, gizmoLayoutRevision);updateFlexibleHandles()}
  const raycaster = new Raycaster()
  let width = 1, height = 1, sized = false, frame: number | null = null, disposed = false, visible = false, suspended = false, pointerLocked = false
  let bufferWidth = 0, bufferHeight = 0
  let ghost: Group | null = null
  let ghostModule: CircuitModule | null = null
  // Explicit rendering roots exclude the technical grid, picking proxies and
  // editor helpers. Wire tools mix helpers with real in-progress wire geometry.
  const clipping = createSceneClipping(camera, () => [content, wires, selectionPreview.root,
    ...(ghost ? [ghost] : []), ...(flexibleGhost ? [flexibleGhost] : []),
    ...wireLayer.tools.children.filter(object => object.name === 'wire-drawing-preview' || object.name === 'wire-duplicate-preview')])
  const ensureProjection = () => { wireLayer.flush(); clipping.ensureProjection() }
  const framing = createFramingBounds(() => [content,wires],camera)
  let committedBounds:FramingSnapshot|undefined, framingDirty=true, transientPose=false, navigationTransaction=0, committedGraphSignature=''
  const captureCommittedBounds = () => {wireLayer.flush();framing.invalidate();committedBounds=framing.snapshot(camera);framingDirty=false}
  const committedSnapshot = () => {if(!committedBounds||framingDirty&&!transientPose)captureCommittedBounds();return committedBounds!}
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
    navigationTransaction++
    keepViewAboveBoard()
    const targetPt = controls?.target ?? viewTarget
    const position = targetPt.clone().addScaledVector(direction, distance)
    // OrbitControls caches Y as its orbit axis and also uses camera.up for XZ panning.
    camera.up.set(0, 1, 0)
    camera.position.copy(position)
    zoomLimits()
    controls?.update()
    // Controls nudges the pole for its spherical math. Presets retain exact positions.
    camera.position.copy(position)
    const lookUp = direction.x === 0 && direction.z === 0 ? new Vector3(0, 0, -1) : camera.up
    camera.quaternion.setFromRotationMatrix(new Matrix4().lookAt(position, targetPt, lookUp))
    camera.updateMatrixWorld()
    navigationTransaction--
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
        ensureProjection()
        // Grid focus/fade derives from the camera's ground projection, never
        // an Area focal point or circuit bounds. Clamp grazing intersections.
        const direction=camera.getWorldDirection(new Vector3()),reach=Math.max(.1,camera.position.y/Math.max(.2,-direction.y))
        const gridTarget=camera.position.clone().addScaledVector(direction,reach)
        updateTechnicalGrid(grid, camera, gridTarget, height)
        updateGizmo()
        wireLayer.updateCamera(camera, height); wireLayer.flush(); scene.updateMatrixWorld(true)
        if (activeOutline) updateSelectionOutline(activeOutline.group, camera.position, width, height)
        for (const outline of multiOutlines.values()) updateSelectionOutline(outline, camera.position, width, height)
        renderer.render(scene, camera); onRender?.()
      }
    })
  }
  const contentChanged = () => { clipping.invalidateBounds(); schedule() }
  const committedContentChanged = () => {framingDirty=true;contentChanged()}
  const controls = canvas ? new OrbitControls(camera, canvas) : undefined
  const updateControlsEnabled = () => { if (controls) controls.enabled = !disposed && visible && !suspended && !pointerLocked }
  updateControlsEnabled()
  const viewTarget = new Vector3()
  const target = () => controls?.target ?? viewTarget
  const defaultDistance = Math.hypot(11, 10)
  const navigation=createViewportNavigation(camera,target,committedSnapshot)
  let usableRect:NdcRect={left:-1,right:1,bottom:-1,top:1}
  let lastNavigationReport='',reportedZoom=NaN
  const lastViewPosition = camera.position.clone(), lastViewTarget = target().clone(), dollyRay = new Raycaster()
  const renderedMesh = (candidate:Object3D):candidate is Mesh => {
    if(!(candidate instanceof Mesh)||!candidate.layers.test(camera.layers))return false
    for(let object:Object3D|null=candidate;object;object=object.parent)if(!object.visible||object.userData.isOutline||object.userData.pinLabel||object.userData.clippingHelper||object.userData.framingHelper)return false
    const materials=Array.isArray(candidate.material)?candidate.material:[candidate.material]
    return materials.some(material=>material.visible&&(!material.transparent||material.opacity>0))
  }
  const safeAreaPosition = (origin:Vector3,position:Vector3) => {
    const distance=position.distanceTo(origin),travel=position.clone().sub(camera.position),length=travel.length()
    if(length<1e-9)return position
    const padding=Math.max(.0001,navigationClearanceForDistance(distance)*4,Math.min(.015,distance*.05))
    // Sweep the actual camera displacement against every committed rendered
    // surface, including obstacles outside the selection cone. Reject blocked
    // moves atomically; unrelated geometry behind the old eye cannot pull a
    // panned empty-space inspection back across the scene.
    dollyRay.set(camera.position,travel.divideScalar(length));dollyRay.near=0;dollyRay.far=length+padding
    const hit=dollyRay.intersectObjects([content,wires],true).find(hit=>renderedMesh(hit.object))
    return hit?null:position
  }
  const guardDolly = () => {
    const origin = target(), previous = lastViewPosition.clone().sub(origin), next = camera.position.clone().sub(origin)
    // Only inward dolly is guarded; pan, orbit, Fit and changes of focal target
    // keep their own navigation contracts and never move model geometry.
    if (lastViewTarget.distanceToSquared(origin) > 1e-12 || next.length() >= previous.length() - 1e-9 || previous.clone().normalize().dot(next.clone().normalize()) < 1 - 1e-8) return
    const travel = lastViewPosition.distanceTo(camera.position)
    if (travel < 1e-9) return
    const direction = camera.position.clone().sub(lastViewPosition).normalize()
    const padding = Math.max(navigationClearanceForDistance(next.length()) * 4, Math.min(.015, next.length() * .05))
    scene.updateMatrixWorld(true)
    dollyRay.set(lastViewPosition, direction); dollyRay.near = 0; dollyRay.far = travel + padding
    wireLayer.flush()
    const hit = dollyRay.intersectObjects([...content.children, ...wires.children], true).find(hit => hit.object instanceof Mesh && !ignored(hit.object))
    if (hit) {
      camera.position.copy(lastViewPosition).addScaledVector(direction, Math.max(0, hit.distance - padding))
      navigation.limitAtDistance(camera.position.distanceTo(origin))
    }
    camera.updateMatrixWorld()
  }
  const zoomPercent = () => navigation.snapshot().zoom
  const notifyZoom = (force=false) => {
    if(navigationTransaction)return
    ensureProjection()
    lastViewPosition.copy(camera.position); lastViewTarget.copy(target())
    const state=navigation.snapshot(),signature=JSON.stringify(state)
    if (Number.isFinite(state.zoom) && state.zoom !== reportedZoom) { reportedZoom=state.zoom;onZoomChange?.(state.zoom) }
    if(force||signature!==lastNavigationReport){lastNavigationReport=signature;onNavigationChange?.(state)}
  }
  const zoomLimits = () => { if (controls) {controls.minDistance=navigation.minimumDistance();controls.maxDistance=navigation.snapshot().referenceDistance*2} }
  const viewChanged = () => { if(navigationTransaction)return;keepViewAboveBoard();navigation.resetCollision();zoomLimits();notifyZoom();schedule() }
  const applyNavigation = (origin:Vector3,position:Vector3,quaternion=camera.quaternion.clone(),guard=false) => {
    navigationTransaction++
    const requestedTarget=origin.clone()
    if(target().distanceToSquared(origin)>1e-12)navigation.resetCollision()
    target().copy(origin);camera.position.copy(position);camera.quaternion.copy(quaternion);camera.zoom=1;camera.updateMatrixWorld()
    if(guard)guardDolly()
    const actual=camera.position.clone();zoomLimits();controls?.update()
    // OrbitControls clamps its target through a length round-trip. Retain the
    // exact command anchor as well as its pose; even that numerical adjustment
    // must not accumulate during repeated wheel/toolbar dolly.
    target().copy(requestedTarget);camera.position.copy(actual);camera.quaternion.copy(quaternion);camera.updateMatrixWorld();navigationTransaction--
    notifyZoom(true);schedule()
  }
  const navigateZoom = (percent:number) => {if(disposed||!Number.isFinite(percent))return;cancelTransition();const pose=navigation.zoomPose(percent);if(pose)applyNavigation(pose.target,pose.position,camera.quaternion.clone(),true)}
  const wheelZoom = (event:WheelEvent) => {
    if(disposed||!visible||suspended||pointerLocked||!Number.isFinite(event.deltaY)||event.deltaY===0)return
    event.preventDefault();let delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?100:1);if(event.ctrlKey)delta*=10
    const scale=Math.pow(.95,Math.min(100,Math.abs(delta)*.01));navigateZoom(zoomPercent()*(delta<0?1/scale:scale))
  }
  if (controls) {
    controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }
    controls.touches = { ONE: null, TWO: null }; controls.screenSpacePanning = false
    controls.enableZoom=false
    zoomLimits(); controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2
    controls.addEventListener('start', cancelTransition)
    controls.addEventListener('change', viewChanged); controls.saveState()
  }
  canvas?.addEventListener('wheel',wheelZoom,{passive:false})
  const validPointer = (x: number, y: number) => !disposed && Number.isFinite(x) && Number.isFinite(y)
  const { ray, pickOwner, ignored, wireMeshes, contentHit, screenPoint, segmentHit, visiblePoint, planeHit } = createScenePicking({
    camera, content, wires, raycaster, viewport: () => ({ width, height }), target, ensureProjection,
    interactionReach: () => Math.max(150, navigation.overview().distance * 4),
  })
  const translateView = (delta: Vector3) => { cancelTransition();navigation.resetCollision();applyNavigation(target().clone().add(delta),camera.position.clone().add(delta)) }
  let activeOutline: { id: string; group: Group } | null = null
  const removeActiveOutline = () => {
    if (activeOutline) {
      if (activeOutline.group.parent) activeOutline.group.parent.remove(activeOutline.group)
      disposeObject(activeOutline.group)
      activeOutline = null
    }
  }
  let highlightedId: string | null = null
  const multiOutlineIds = new Set<string>(), multiOutlines = new Map<string, Group>()
  const removeMultiOutline = (id: string) => {
    const outline = multiOutlines.get(id)
    if (outline) { outline.removeFromParent(); disposeObject(outline); multiOutlines.delete(id) }
  }
  const clearMultiOutlines = () => { for (const id of multiOutlines.keys()) removeMultiOutline(id); multiOutlineIds.clear() }
  const attachMultiOutlines = () => {
    for (const id of multiOutlineIds) {
      const model = models.get(id)
      if (model && id !== highlightedId && !multiOutlines.has(id)) { const outline = createSelectionOutline(model); outline.name = 'marquee-selection-outline'; model.add(outline); multiOutlines.set(id, outline) }
    }
  }
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
    setFlexibleEditing(value:boolean){flexibleEditing=value;updateFlexibleHandles();schedule()},
    flexibleHandlePosition(handle:FlexibleHandle['handle']){updateFlexibleHandles();return flexibleHandles.visible?flexibleHandles.children.find(item=>item.userData.flexibleHandle===handle)?.position.clone()??null:null},
    pickFlexibleHandle(x:number,y:number):FlexibleHandle|null {
      if(!validPointer(x,y))return null;updateFlexibleHandles();if(!flexibleHandles.visible)return null
      let best:FlexibleHandle|null=null,distance=12
      for(const marker of flexibleHandles.children){const p=screenPoint(marker.position),d=Math.hypot(x-p.x,y-p.y);if(p.visible&&d<distance){distance=d;best={id:marker.userData.id,handle:marker.userData.flexibleHandle,point:marker.position.clone()}}}return best
    },
    previewFlexibleModule(module:CircuitModule){
      transientPose=true
      let model=models.get(module.id);if(!model||disposed)return
      const signature=JSON.stringify([module.type,module.properties,module.mount?.partId,module.mount?.partRevision,module.mount?.packageId,module.mount?.packageRevision,module.physicalDescriptor])
      if(model.userData.signature!==signature){
        if(activeOutline?.id===module.id)removeActiveOutline();removeMultiOutline(module.id);disposeObject(model);content.remove(model)
        model=buildComponent(module,[...modules.values()]);model.userData.onVisualChange=committedContentChanged;models.set(module.id,model);content.add(model);attachOutline();attachMultiOutlines()
      }
      updateFlexiblePackageGeometry(model,module,[...modules.values()]);applyPose(model,moduleWorldPose(module,[...modules.values()]));wireLayer.updateModule(module.id);updateFlexibleHandles();contentChanged()
    },
    setFlexiblePreview(module:CircuitModule|null,context:CircuitModule[]=[],valid=true){
      if(disposed)return
      if(!module){if(flexibleGhost){flexibleGhost.removeFromParent();disposeObject(flexibleGhost);flexibleGhost=null}contentChanged();return}
      const signature=JSON.stringify([module.type,module.properties,module.mount?.partId,module.mount?.partRevision,module.mount?.packageId,module.mount?.packageRevision,module.physicalDescriptor])
      if(flexibleGhost&&flexibleGhost.userData.signature!==signature){flexibleGhost.removeFromParent();disposeObject(flexibleGhost);flexibleGhost=null}
      if(!flexibleGhost){flexibleGhost=buildComponent(module,context);flexibleGhost.userData.ignorePick=true;flexibleGhost.userData.onVisualChange=contentChanged;scene.add(flexibleGhost)}
      else{updateFlexiblePackageGeometry(flexibleGhost,module,context);applyPose(flexibleGhost,moduleWorldPose(module,context))}
      flexibleGhost.traverse(object => {
        object.castShadow = false; object.receiveShadow = false
        if (object instanceof Mesh) {
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          for (const material of materials) {
            material.transparent = true; material.opacity = valid ? .5 : .25; material.depthWrite = false
            if ('transmission' in material) (material as any).transmission = 0
          }
        }
      }); contentChanged()
    },
    setGizmoObstacles(areas: GizmoObstacle[]) { if (!disposed && JSON.stringify(areas) !== JSON.stringify(gizmoObstacles)) { gizmoObstacles = areas.map((area) => ({ ...area })); schedule() } },
    gizmoHandlePosition(handle: TransformHandle) { if (disposed) return null; updateGizmo(); return gizmo.position(handle) },
    gizmoOrigin() { if (disposed) return null; updateGizmo(); return gizmo.origin() },
    pickGizmo(x: number, y: number) { if (!validPointer(x, y)) return null; updateGizmo(); ray(x, y); const hit = gizmo.pick(raycaster); return ghost && hit?.handle === 'xz' && !gizmo.placementFollowBlocked() ? null : hit },
    hoverGizmo(x: number, y: number) { if (!validPointer(x, y)) return null; updateGizmo(); ray(x, y); let handle = gizmo.pick(raycaster)?.handle ?? null; gizmo.capturePlacement(x, y, camera, width, height); if (ghost && handle === 'xz' && !gizmo.placementFollowBlocked()) handle = null; gizmo.hover(handle); schedule(); return handle },
    placementFollowBlocked() { return !!ghost && gizmo.placementFollowBlocked() },
    clearGizmoHover() { if (disposed) return; gizmo.clearPlacementCapture(); gizmo.hover(null); schedule() },
    activateGizmo(handle: TransformHandle | null) { if (disposed) return; updateGizmo(); gizmo.activate(handle, gizmoModel()); schedule() },
    setGizmoRotation(angle: number) { if (disposed) return; gizmo.setRotation(angle); schedule() },
    syncGraph(next: CircuitGraph | null) {
      if (disposed) return
      const signature=JSON.stringify(next),refreshBounds=signature!==committedGraphSignature||framingDirty||transientPose
      transientPose=false
      contactHover.visible = false
      gizmoLayoutRevision++
      modules.clear(); for (const module of next?.modules ?? []) modules.set(module.id, module)
      const ids = new Set(next?.modules.map((module) => module.id))
      for (const [id, model] of models) if (!ids.has(id)) { if (activeOutline?.id === id) removeActiveOutline(); removeMultiOutline(id); multiOutlineIds.delete(id); if (highlightedId === id) highlightedId = null; disposeObject(model); content.remove(model); models.delete(id) }
      for (const module of next?.modules ?? []) {
        let model = models.get(module.id)
        if(model&&!!model.userData.resolvedPinAnchors!==isFlexibleMount(module.mount)){
          if(activeOutline?.id===module.id)removeActiveOutline();removeMultiOutline(module.id);disposeObject(model);content.remove(model);models.delete(module.id);model=undefined
        }
        const signature = JSON.stringify([module.type,module.properties,module.mount?.partId,module.mount?.partRevision,module.mount?.packageId,module.mount?.packageRevision,module.physicalDescriptor])
        if (model && model.userData.signature !== signature) {
          const part = getPartForModule(module)
          const descriptorChanged=JSON.stringify(JSON.parse(model.userData.signature).slice(2))!==JSON.stringify(JSON.parse(signature).slice(2))
          if (!descriptorChanged && model.userData.type === 'LABEL' && module.type === 'LABEL') {
            if (updateLabelModel(model, module)) { if (activeOutline?.id === module.id) removeActiveOutline(); removeMultiOutline(module.id) }
            model.userData.signature = signature
          }
          else if (!descriptorChanged && model.userData.type === module.type && part && canUpdatePackageAppearance(part)) {
            const geometryRevision = model.userData.visualGeometryRevision
            updatePackageAppearance(model, module, part); model.userData.signature = signature
            if (activeOutline?.id === module.id && model.userData.visualGeometryRevision !== geometryRevision) removeActiveOutline()
            if (model.userData.visualGeometryRevision !== geometryRevision) removeMultiOutline(module.id)
          }
          // Supply settings already have an in-place display/knob update in applyPose.
          else if (model.userData.type === module.type && getDefinition(module.type)?.visual === 'supply') model.userData.signature = signature
          else { if (activeOutline?.id === module.id) removeActiveOutline(); removeMultiOutline(module.id); disposeObject(model); content.remove(model); models.delete(module.id); model = undefined }
        }
        if (!model) { model = buildComponent(module, next!.modules); model.userData.onVisualChange = committedContentChanged; models.set(module.id, model); content.add(model) }
        const previousRevision = model.userData.visualGeometryRevision
        updateFlexiblePackageGeometry(model, module, next!.modules)
        updateMountedPackageInsertion(model, module, next!.modules)
        if (previousRevision !== model.userData.visualGeometryRevision) { if (activeOutline?.id === module.id) removeActiveOutline(); removeMultiOutline(module.id) }
        applyPose(model, moduleWorldPose(module, next!.modules))
        if (showPins) { const part = getPartForModule(module); if (part) setPackagePinLabels(model, part, null, true) }
      }
      attachOutline()
      attachMultiOutlines()
      wireLayer.sync(next?.connections ?? [])
      if(refreshBounds){captureCommittedBounds();navigation.resetCollision();committedGraphSignature=signature}
      contentChanged();notifyZoom()
    },
    previewMove(id: string, position: Required<NonNullable<CircuitModule['position']>>) { const model = models.get(id); if (model && !disposed && [position.x, position.y, position.z].every(Number.isFinite)) { transientPose=true;model.position.set(position.x, position.y, position.z); model.updateMatrixWorld(true); previewMountedChildren(id); wireLayer.updateModule(id); contentChanged() } },
    previewRotation(id: string, degrees: number) { const model = models.get(id); if (model && !disposed && Number.isFinite(degrees)) { transientPose=true;model.rotation.y = (degrees % 360) * Math.PI / 180; model.updateMatrixWorld(true); previewMountedChildren(id); wireLayer.updateModule(id); contentChanged() } },
    setMountPreview(candidate: MountCandidate | null) {
      clearMountPreview()
      if (ghost && ghostModule) updateMountedPackageInsertion(ghost, { ...ghostModule, ...(candidate?.valid && candidate.mount ? { mount: candidate.mount } : { mount: undefined }) }, [...modules.values()])
      for (const pin of candidate?.pins ?? []) {
        const marker = new LineLoop(mountMarkerGeometry, pin.valid ? mountMarkerValid : mountMarkerInvalid)
        marker.position.set(pin.position.x, pin.position.y + .03, pin.position.z); marker.renderOrder = 20; mountPreview.add(marker)
      }
      contentChanged()
    },
    setSimulationStates(states: Record<string, { state?: string; reason?: string }> | null, pinValues: ObservedPinLevels = {}) {
      for (const [id, model] of models) {
        const state = states?.[id], module = modules.get(id), part = module && getPartForModule(module)
        const segments = part ? displaySegmentsFromPinEvidence(part, id, pinValues, state?.state) : []
        applyPackageSimulation(model, state ? { status: state.state, ledOn: state.state === 'ON', segments } : null)
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
    labelPlacementPoint(x: number, y: number): { boardId: string; position: Point3; rotation: number } | null {
      if (!validPointer(x, y)) return null
      ray(x, y); scene.updateMatrixWorld(true)
      const boards = [...models].filter(([id]) => getBreadboardTopology(modules.get(id)!.type)).map(([, model]) => model)
      const hit = raycaster.intersectObjects(boards, true)[0]
      if (!hit) return null
      const owner = pickOwner(hit.object), module = modules.get(owner.userData.id), topology = module && getBreadboardTopology(module.type)
      if (!module || !topology) return null
      const point = raycaster.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -(owner.position.y + topology.deckHeight + .15 * MM_TO_WORLD)), new Vector3())
      return point ? { boardId: module.id, position: { x: point.x, y: point.y, z: point.z }, rotation: owner.rotation.y * 180 / Math.PI } : null
    },
    pickContactControl(x: number, y: number): ContactControlHit | null {
      if (!validPointer(x, y)) return null
      scene.updateMatrixWorld(true)
      const hit = contentHit(x, y)
      if (!hit) return null
      const owner = pickOwner(hit.object)
      for (let object: Object3D | null = hit.object; object; object = object.parent) {
        if (object.userData.contactControl) return { id: owner.userData.id, property: object.userData.contactControl }
        if (object === owner) break
      }
      return null
    },
    previewSupplyControl(id: string, control: SupplyControl, value: number | boolean) {
      const model = models.get(id), module = modules.get(id)
      if (model && module && getDefinition(module.type)?.visual === 'supply' && !disposed) {
        applyPowerSupplyControls(model, { ...module.properties, ...supplyControlPatch(module.type, control, value) }); model.updateMatrixWorld(true); contentChanged()
      }
    },
    setGhost(type: string | null, position?: Required<NonNullable<CircuitModule['position']>>, rotation = 0, properties?: Record<string, unknown>) {
      if (disposed || !Number.isFinite(rotation) || (position && ![position.x, position.y, position.z].every(Number.isFinite))) return
      clipping.invalidateBounds()
      const part=type?getPartForType(type):undefined,physicalDescriptor=part?physicalDescriptorForPart(part):undefined
      ghostModule = type && position ? { id: 'PLACE', type, position, rotation, properties, physicalDescriptor } : null
      if (ghost && type && position && ghost.userData.signature === JSON.stringify([type, properties,undefined,undefined,undefined,undefined,physicalDescriptor])) { applyPose(ghost, { id: 'PLACE', type, position, rotation, properties,physicalDescriptor }); updateGizmo(); schedule(); return }
      if (ghost) { disposeObject(ghost); scene.remove(ghost); ghost = null }
      if (type && position && getDefinition(type)) {
        // PLACE is a render-only pick target, absent from models, ports and Circuit Graph.
        ghost = buildComponent({ id: 'PLACE', type, position, rotation, properties,physicalDescriptor }); ghost.userData.kind = 'placement'
        ghost.userData.onVisualChange = contentChanged
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
      clearMultiOutlines(); wireLayer.highlightMany([])
      if (activeOutline && activeOutline.id !== id) removeActiveOutline()
      highlightedId = id
      attachOutline()
      wireLayer.highlight(wire)
      schedule()
    },
    highlightSelection(moduleIds: string[], selectedWires: WireIdentity[]) {
      if (disposed) return
      clearMultiOutlines()
      if (moduleIds.length + selectedWires.length > 1) { removeActiveOutline(); highlightedId = null; wireLayer.highlight(null) }
      for (const id of moduleIds) if (models.has(id)) multiOutlineIds.add(id)
      attachMultiOutlines(); wireLayer.highlightMany(selectedWires); schedule()
    },
    selectInRect(rect: ScreenRect): { moduleIds: string[]; wires: WireIdentity[] } {
      if (disposed) return { moduleIds: [], wires: [] }
      ensureProjection()
      camera.updateMatrixWorld(); wireLayer.flush(); scene.updateMatrixWorld(true)
      return {
        moduleIds: [...models].filter(([id, model]) => {
          const module = modules.get(id)
          if (!module) return false
          const isBreadboard = !!getBreadboardTopology(module.type)
          if (isBreadboard) {
            return projectedBreadboardEnclosedInRect(model, camera, width, height, rect)
          }
          return projectedObjectIntersectsRect(model, camera, width, height, rect)
        }).map(([id]) => id),
        wires: wireLayer.selectionMeshes().filter(({ mesh }) => projectedObjectIntersectsRect(mesh, camera, width, height, rect)).map(({ wire }) => wire),
      }
    },
    pick(x: number, y: number): PickResult | null {
      if (!validPointer(x, y)) return null
      wireLayer.flush(); scene.updateMatrixWorld(true)
      const body = contentHit(x, y)
      // Close-up tubes can occupy many pixels: their visible surface is a hit
      // even when the forgiving centerline margin is outside the cursor.
      const tube = raycaster.intersectObjects(wireMeshes(), false)[0]
      const owner = body && pickOwner(body.object)
      if (body && owner?.userData.type === 'LABEL' && (!tube || tube.distance >= body.distance - 1e-7)) return { kind: 'module', id: owner.userData.id, point: body.point.clone() }
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
      return owner?.userData.kind ? { ...owner.userData, point: body!.point.clone() } as PickResult : null
    },
    pickEndpoint(x: number, y: number, excludeModuleId?:string): EndpointPick | null {
      if (!validPointer(x, y)) return null
      scene.updateMatrixWorld(true)
      const hit = contentHit(x, y, excludeModuleId, true)
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
      clipping.invalidateBounds()
      contactHover.visible = false
      if (highlightedPinModel) {
        setPackagePinHighlight(highlightedPinModel, null)
        const highlightedModule=modules.get(highlightedPinModel.userData.id),part=highlightedModule?getPartForModule(highlightedModule):undefined
        if (part) setPackagePinLabels(highlightedPinModel, part, null, showPins)
      }
      highlightedPinModel = null
      const parsed = endpoint && parseEndpoint(endpoint), module = parsed && modules.get(parsed.moduleId), model = parsed && models.get(parsed.moduleId)
      if (parsed && module && model) {
        const anchor = endpointPosition(endpoint!)
        if (anchor) {
          if (parsed.kind === 'port' && getPartForModule(module)) { setPackagePinHighlight(model, parsed.portId); setPackagePinLabels(model, getPartForModule(module)!, parsed.portId, showPins); highlightedPinModel = model; schedule(); return }
          contactHover.position.copy(anchor)
          if (parsed.kind === 'contact') contactHover.position.y = model.position.y + (getBreadboardTopology(module.type)?.deckHeight ?? .33) + .004
          contactHover.rotation.y = model.rotation.y; contactHover.visible = true
        }
      }
      schedule()
    },
    setShowPins(value: boolean) {
      showPins = value
      for (const [id, model] of models) { const part = getPartForModule(modules.get(id)!); if (part) setPackagePinLabels(model, part, null, value) }
      contentChanged()
    },
    wireContext: routeContext,
    wireRoute(wire: WireIdentity) { if (disposed) return null; wireLayer.flush(); return wireLayer.route(wire) },
    wireOrderPeers(wire: WireIdentity, connected = false) { if (disposed) return []; wireLayer.flush(); return wireLayer.orderPeers(wire, connected) },
    previewWireVisual(wire: WireIdentity, visual: WireVisual | null) { transientPose=true;wireLayer.previewVisual(wire, visual); contentChanged() },
    previewWireDrawing(wire: WireIdentity, visual: WireVisual, cursor: Point3 | null) { wireLayer.previewDrawing(wire, visual, cursor); contentChanged() },
    clearWireDrawing() { wireLayer.clearDrawing(); contentChanged() },
    previewWireDuplicate(wire: WireIdentity, visual: WireVisual, valid: boolean, fallback?: SolvedWireRoute | null) { wireLayer.previewDuplicate(wire, visual, valid, fallback); contentChanged() },
    clearWireDuplicate() { wireLayer.clearDuplicate(); contentChanged() },
    setSelectionPreview(graph: CircuitGraph, selection: EditorSelection, valid: boolean, fallbackRoutes?: Parameters<ReturnType<typeof createSelectionPreview>['show']>[3]) { if (!disposed) { selectionPreview.show(graph, selection, valid, fallbackRoutes); contentChanged() } },
    clearSelectionPreview() { if (!disposed) { selectionPreview.clear(); contentChanged() } },
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
    transformTranslation(pivot: Vector3, start: { x: number; y: number }, end: { x: number; y: number }, axis: 'x' | 'z' | 'xz') { ensureProjection(); return projectedTranslationDelta(camera, width, height, pivot, start, end, axis) },
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
    project(point: Vector3) { ensureProjection(); const p = point.clone().project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, visible: p.z >= -1 && p.z <= 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 } },
    resize(w: number, h: number) {
      if (disposed || !Number.isFinite(w) || !Number.isFinite(h)) return
      const wasVisible = visible
      visible = w > 0 && h > 0
      if (visible !== wasVisible) updateControlsEnabled()
      if (!visible) { if (frame !== null) cancelFrame(frame); frame = null; return }
      if (sized && width === w && height === h) { if (!wasVisible) schedule(); return }
      width = w; height = h; sized = true; camera.aspect = w / h; ensureProjection();notifyZoom();schedule()
    },
    zoomPercent,
    navigationSnapshot: () => navigation.snapshot(),
    setUsableViewport(rect:{left:number;top:number;right:number;bottom:number}) {
      if(disposed||![rect.left,rect.top,rect.right,rect.bottom].every(Number.isFinite)||width<=0||height<=0)return
      const left=Math.max(0,Math.min(width,rect.left)),right=Math.max(0,Math.min(width,rect.right))
      const top=Math.max(0,Math.min(height,rect.top)),bottom=Math.max(0,Math.min(height,rect.bottom))
      if(right-left<1||bottom-top<1)return
      const next={left:left/width*2-1,right:right/width*2-1,top:1-top/height*2,bottom:1-bottom/height*2}
      if(JSON.stringify(next)===JSON.stringify(usableRect))return
      usableRect=next;navigation.setRect(next);notifyZoom();schedule()
    },
    setZoom: navigateZoom,
    zoomToArea(x1: number, y1: number, x2: number, y2: number) {
      if(disposed||suspended||!visible||![x1,y1,x2,y2].every(Number.isFinite))return false
      const left=Math.max(0,Math.min(width,Math.min(x1,x2))),right=Math.max(0,Math.min(width,Math.max(x1,x2)))
      const top=Math.max(0,Math.min(height,Math.min(y1,y2))),bottom=Math.max(0,Math.min(height,Math.max(y1,y2)))
      if(right-left<12||bottom-top<12)return false
      // A full-canvas selection is an actual no-op, including calibration.
      if(left===0&&top===0&&right===width&&bottom===height)return true
      cancelTransition();ensureProjection()
      // Cone clipping selects the region, including thin objects missed by
      // sampling. An actual centre hit anchors visible foreground details;
      // their centre must not drift onto a backing board during inspection.
      ray((left+right)/2,(top+bottom)/2);scene.updateMatrixWorld(true)
      const foreground=raycaster.intersectObjects([content,wires],true).find(hit=>renderedMesh(hit.object)&&-hit.point.clone().applyMatrix4(camera.matrixWorldInverse).z>1e-6)
      const pose=solveArea(committedSnapshot(),camera,{left:left/width*2-1,right:right/width*2-1,top:1-top/height*2,bottom:1-bottom/height*2},usableRect,target(),.05,1e-4,foreground?.point)
      if(!pose)return false
      if(pose.distance>navigation.snapshot().referenceDistance*2)return false
      const distance=Math.max(pose.distance,navigation.minimumDistance(false))
      const position=pose.target.clone().addScaledVector(new Vector3(0,0,1).applyQuaternion(camera.quaternion),distance)
      const safePosition=safeAreaPosition(pose.target,position)
      if(!safePosition)return false
      navigation.resetCollision();applyNavigation(pose.target,safePosition);return true
    },
    fitCircuit() {
      if(disposed)return false
      ensureProjection()
      const pose=navigation.overview()
      if(!pose.points.length)return false
      cancelTransition();navigation.commitOverview(pose);applyNavigation(pose.target,pose.position);return true
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
      navigation.resetCollision();notifyZoom()
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
      if(disposed)return
      cancelTransition();ensureProjection()
      const defaultCamera=camera.clone()
      defaultCamera.position.set(0,11,10);defaultCamera.up.set(0,1,0);defaultCamera.lookAt(0,0,0);defaultCamera.updateMatrixWorld()
      const pose=solveOverview(defaultCamera,committedSnapshot(),usableRect)
      camera.up.set(0,1,0);navigation.commitOverview(pose??{distance:defaultDistance})
      applyNavigation(pose?.target??new Vector3(),pose?.position??new Vector3(0,11,10),defaultCamera.quaternion)
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
    dispose() { if (disposed) return; disposed = true; cancelTransition(); gizmo.update(undefined, [], camera, width, height); if (frame !== null) cancelFrame(frame); frame = null; controls?.removeEventListener('change', viewChanged); controls?.removeEventListener('start', cancelTransition); controls?.dispose();canvas?.removeEventListener('wheel',wheelZoom); removeActiveOutline(); clearMultiOutlines(); selectionPreview.dispose(); wireLayer.dispose(); clearMountPreview(); mountMarkerGeometry.dispose(); mountMarkerValid.dispose(); mountMarkerInvalid.dispose(); disposeObject(scene); models.clear(); modules.clear(); ghost = null; highlightedId = null; gizmoObstacles = []; scene.environment = null; studio?.dispose(); scene.clear(); renderer.dispose() },
  }
}
