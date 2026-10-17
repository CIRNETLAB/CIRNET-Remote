import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type { Vector3 } from 'three'
import type { createSceneManager } from '../three/SceneManager'
import { getDefinition } from '../data/editorCatalog'
import { getPartForType, getPartForModule } from '../data/partCatalog'
import { moduleWorldPose, moduleLocalToWorld, worldToModuleLocal } from '../electrical/modulePose'
import { isFlexibleMount } from '../electrical/flexibleGeometry'
import { buildFlexibleTransformCandidate } from '../electrical/flexibleTransforms'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { solveMounting } from '../electrical/mounting'
import { getBreadboardGeometrySpec } from '../geometry/BreadboardGeometrySpec'
import { snapBreadboardPosition } from '../geometry/breadboardDocking'
import { placementInitialRotation, rotationSnapStep } from '../geometry/placementRotation'
import { useCircuitStore } from '../stores/circuit'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import type { CircuitModule, CircuitGraph } from '../types/circuit'
import type { TransformHandle } from '../three/ComponentTransformGizmo'
import { supplyControlMaximum, supplyControlPatch, supplyControlValue, type SupplyControl } from '../three/PowerSupplyModel'
import { useWireRouting } from './useWireRouting'
import { normalizeSelection } from '../editor/selection'
import { PointerGestureSession } from '../editor/PointerGestureSession'
import { useFlexibleAuthoring } from './useFlexibleAuthoring'
type Manager = ReturnType<typeof createSceneManager>
export type Position = { x: number; y: number; z: number }
interface PlacementDraft { type: string; position: Position; rotation: number }
interface DragGesture { pointer: number; start: { x: number; y: number }; dragged: boolean }
interface MoveGesture extends DragGesture { kind: 'move'; id: string; draft: string | null; planeHeight: number; offset: Position; position: Position }
interface PanGesture extends DragGesture { kind: 'pan'; anchor: Vector3; selection?: { moduleId: string; graph: CircuitGraph; draft: string | null } }
interface ZoomAreaGesture extends DragGesture { kind: 'zoom-area'; end: { x: number; y: number } }
interface MarqueeGesture extends DragGesture { kind: 'marquee'; end: { x: number; y: number } }
interface ControlGesture extends DragGesture {
  kind: 'control'; id: string; draft: string | null; control: SupplyControl; initial: number | boolean; value: number | boolean
  axis: 'x' | 'y' | null; last: { x: number; y: number }; raw: number
}
const voltageDetents = [3, 3.3, 5, 6, 9, 12, 15] as const
interface TransformGesture extends DragGesture {
  kind: 'transform'; target: 'module' | 'placement'; id: string; draft: string | null; handle: TransformHandle; center: Vector3
  initial: Position; position: Position; initialRotation: number; rotation: number; lastAngle: number; angle: number
}

export function snapPosition(
  point: { x: number; y?: number; z: number },
  snapEnabled: boolean,
  modules: CircuitModule[],
  activeType?: string | null,
  activeId?: string | null,
  elevation = 0,
  rotation?: number,
  axis?: 'x' | 'z'
): Position {
  if (activeType && getPartForType(activeType)) {
    const module = activeId ? modules.find(m => m.id === activeId) : undefined
    const pose = module ? moduleWorldPose(module, modules) : undefined
    if(module&&isFlexibleMount(module.mount)&&pose){
      const board=modules.find(item=>item.id===module.mount!.boardId)!,topology=getBreadboardTopology(board.type)!,current=worldToModuleLocal({x:pose.position?.x??0,y:pose.position?.y??0,z:pose.position?.z??0},board),desired=worldToModuleLocal({x:point.x,y:pose.position?.y??0,z:point.z},board)
      if(snapEnabled){desired.x=current.x+Math.round((desired.x-current.x)/topology.pitch)*topology.pitch;desired.z=current.z+Math.round((desired.z-current.z)/topology.pitch)*topology.pitch}
      return moduleLocalToWorld({x:desired.x,y:current.y,z:desired.z},board)
    }
    const candidate = solveMounting(activeType, { x: point.x, y: point.y ?? elevation, z: point.z }, rotation ?? pose?.rotation ?? 0, modules, activeId ?? 'PLACE', module?.mount)
    if (candidate) return candidate.position
    if (module?.mount) elevation = 0
  }
  const clean = (n: number) => Math.round(n * 10000) / 10000 || 0
  const baseX = axis === 'z' ? point.x : snapEnabled ? Math.round(point.x * 2) / 2 : Math.round(point.x * 100) / 100
  const baseZ = axis === 'x' ? point.z : snapEnabled ? Math.round(point.z * 2) / 2 : Math.round(point.z * 100) / 100

  if (!snapEnabled || !activeType) return { x: clean(baseX), y: elevation, z: clean(baseZ) }

  if (!getBreadboardGeometrySpec(activeType)) return { x: clean(baseX), y: elevation, z: clean(baseZ) }
  const activeModule = activeId ? modules.find(module => module.id === activeId) : null
  const position = snapBreadboardPosition(point, { x: baseX, z: baseZ }, modules, activeType, activeId, elevation, rotation ?? activeModule?.rotation ?? 0, axis)
  // A mating plane is exact; rounding it can move plastic through a rotated neighbor.
  const coordinate = position.docked ? (n: number) => Math.abs(n) < 1e-12 ? 0 : n : clean
  return { x: coordinate(position.x), y: elevation, z: coordinate(position.z) }
}

export function useCircuitEditor(canvas: Ref<HTMLCanvasElement | undefined>, manager: () => Manager | undefined) {
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  const flexible = useFlexibleAuthoring(canvas, manager)
  type EditorGesture = MoveGesture | PanGesture | TransformGesture | ControlGesture | ZoomAreaGesture | MarqueeGesture
  let gesture: EditorGesture | null = null
  const pointerSession = new PointerGestureSession()
  function beginGesture(value: EditorGesture) {
    if (!pointerSession.begin(value.pointer, circuit.activeId)) return false
    gesture = value
    return true
  }
  const wireRouting = useWireRouting(canvas, manager, () => !!gesture)
  // A pose only: never a graph module, electrical identity or history entry.
  let placementDraft: PlacementDraft | null = null
  // A right drag that starts on empty space belongs to Orbit, even if it ends
  // over a wire. The native contextmenu may arrive after that drag completes.
  let suppressWireContext = false
  let rightPress: { pointer: number; start: { x: number; y: number }; dragged: boolean; target?: { moduleId: string } | { source: string; destination: string } } | null = null
  const dragging = ref<'move' | 'pan' | 'transform' | 'control' | 'zoom-area' | 'marquee' | null>(null)
  const zoomAreaRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  const marqueeRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  const hoveredHandle = ref<TransformHandle | null>(null)
  const hoveredControl = ref<SupplyControl | null>(null)
  const mountHint = ref('')
  const pinHint = ref('')
  const controlHint = computed(() => {
    if (flexible.hint.value) return flexible.hint.value
    if (mountHint.value) return mountHint.value
    if (pinHint.value) return pinHint.value
    if (workspace.tool === 'wire' || workspace.selectedWire) return wireRouting.hint.value
    if (hoveredHandle.value === 'delete') return workspace.placementType ? 'Click to cancel placement (or press Escape)' : 'Click to delete component (or press Delete)'
    if (hoveredControl.value === 'power_on') return 'Click to toggle power On/Off'
    if (hoveredControl.value) return `Drag ${hoveredControl.value === 'voltage_v' ? 'Voltage (0–15 V)' : 'Ampe (0–5 A)'} knob up/right to increase, down/left to decrease. Hold Shift for fine adjustment.`
    return ''
  })
  const ports = ref<{ endpoint: string; x: number; y: number; direction: string }[]>([])
  const selected = computed(() => { const module = circuit.graph?.modules.find(item => item.id === workspace.selectedModuleId); return module ? moduleWorldPose(module, circuit.graph!.modules) : undefined })
  const attempt = (action: () => void) => { try { action(); workspace.editError = '' } catch (error) { workspace.editError = error instanceof Error ? error.message : 'Circuit edit failed.' } }
  const coordinates = (event: { clientX: number; clientY: number }) => { const rect = canvas.value!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
  const snap = (point: { x: number; y?: number; z: number } | Vector3, activeType?: string | null, activeId?: string | null, elevation = 0, rotation?: number, axis?: 'x' | 'z'): Position =>
    snapPosition(point, workspace.snap, circuit.graph?.modules ?? [], activeType, activeId, elevation, rotation, axis)
  function createPlacementDraft(type: string, point: Position): PlacementDraft {
    const rotation = placementInitialRotation(type)
    return { type, position: snap(point, type, null, 0, rotation), rotation }
  }
  function showPlacement() {
    if (!placementDraft) return
    const candidate = solveMounting(placementDraft.type, placementDraft.position, placementDraft.rotation, circuit.graph?.modules ?? [])
    if (candidate) placementDraft.position = candidate.position
    mountHint.value = candidate ? candidate.valid ? 'All pins fit. Click to mount.' : candidate.reason : ''
    manager()?.setGhost(placementDraft.type, placementDraft.position, placementDraft.rotation, workspace.placementProperties ?? undefined)
    manager()?.setMountPreview?.(candidate)
  }
  function previewFlexibleTransform(id:string, position?:Position, degrees=0):boolean {
    const module=circuit.graph?.modules.find(item=>item.id===id)
    if(!circuit.graph||!module||!isFlexibleMount(module.mount))return false
    try{const candidate=buildFlexibleTransformCandidate(circuit.graph,id,position,degrees);manager()?.previewFlexibleModule(candidate);mountHint.value='Release to move the assembly.'}
    catch(error){mountHint.value=error instanceof Error?error.message:'Invalid assembly transform.'}
    return true
  }
  function clearPlacement() { placementDraft = null; mountHint.value = ''; manager()?.setGhost(null); manager()?.setMountPreview?.(null) }
  const placementPoint = (x: number, y: number, type?: string) => getPartForType(type ?? '') ? manager()?.placementPoint?.(x, y) ?? manager()?.groundPoint(x, y) : manager()?.groundPoint(x, y)
  function updatePorts() {
    if (workspace.zoomAreaActive || workspace.marqueeActive || wireRouting.duplicatePreviewState.value.active) { ports.value = []; return }
    const next: typeof ports.value = []
    for (const module of circuit.graph?.modules ?? []) {
      if (getPartForType(module.type)) continue // Physical picking/highlighting stays in Three.js; no DOM per pin.
      if (workspace.tool !== 'wire' && module.id !== workspace.selectedModuleId) continue
      for (const port of getDefinition(module.type)?.ports ?? []) {
        const anchor = manager()?.endpointPosition(`${module.id}.${port.id}`)
        if (!anchor) continue
        const point = manager()!.project(anchor)
        if (point.visible) next.push({ endpoint: `${module.id}.${port.id}`, x: point.x, y: point.y, direction: port.direction })
      }
    }
    ports.value = next
  }
  function highlightSelection() {
    manager()?.highlight(workspace.selectedModuleId, workspace.selectedWire)
    if (workspace.selectedModuleIds.length || workspace.selectedWires.length) manager()?.highlightSelection(workspace.selectedModuleIds, workspace.selectedWires)
  }
  function sync() { manager()?.syncGraph(circuit.graph); highlightSelection(); updatePorts() }
  function cancelGesture() {
    pointerSession.cancel()
    rightPress = null
    if (gesture?.kind === 'transform' && gesture.target === 'placement' && placementDraft) {
      placementDraft.position = gesture.initial; placementDraft.rotation = gesture.initialRotation
    }
    if (gesture) { const pointer = gesture.pointer; gesture = null; dragging.value = null; manager()?.activateGizmo(null); manager()?.lockPointer(false); if (canvas.value?.hasPointerCapture(pointer)) canvas.value.releasePointerCapture(pointer); sync() }
    zoomAreaRect.value = null; marqueeRect.value = null; manager()?.lockPointer(false)
    hoveredHandle.value = null; hoveredControl.value = null; manager()?.clearGizmoHover()
    showPlacement()
  }
  function cancel(clearSelection = true) { flexible.cancelEdit(); workspace.cancelZoomArea(); workspace.cancelMarquee(clearSelection); wireRouting.cancel(); cancelGesture() }
  function cancelPlacement() { flexible.cancel(); cancel(); workspace.cancelPlacement(); clearPlacement(); workspace.editError = '' }
  function lostPointerCapture(event: PointerEvent) { if(flexible.pointerCancel(event))return; if (rightPress?.pointer === event.pointerId) { rightPress = null; suppressWireContext = true }; if (wireRouting.lostPointerCapture(event)) return; if (gesture?.pointer === event.pointerId) { cancel(); clearPlacement() } }
  function contextMenu(event: MouseEvent) {
    if (flexible.contextMenu(event)) return
    if (rightPress) { event.preventDefault(); return }
    if (wireRouting.contextMenu(event)) { suppressWireContext = false; return }
    event.preventDefault()
    if (workspace.placementType) cancelPlacement()
    else if (workspace.zoomAreaActive || workspace.marqueeActive) cancel()
    else if (!suppressWireContext && !gesture && canvas.value && manager() && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const { x, y } = coordinates(event), hit = manager()!.pickGizmo(x, y) ? null : manager()!.pick(x, y)
      wireRouting.openContextMenu(x, y, hit?.kind === 'wire' ? hit : hit ? { moduleId: hit.id } : undefined)
    }
    suppressWireContext = false
  }
  function areaCoordinates(event: PointerEvent) {
    const rect = canvas.value!.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || ![event.clientX, event.clientY].every(Number.isFinite)) return null
    return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }
  }
  function connect(endpoint: string) {
    if (wireRouting.duplicatePreviewState.value.active || wireRouting.movePreviewState.value.active) return
    wireRouting.connect(endpoint)
  }
  function place(type: string, position: Position, rotation: number) { attempt(() => { const id = circuit.placeModule(type, position, rotation, workspace.placementProperties ?? undefined); workspace.selectModule(id); clearPlacement(); sync() }) }
  function pointerDown(event: PointerEvent) {
    if (event.button === 2) suppressWireContext = true
    wireRouting.closeContextMenu()
    if (workspace.zoomAreaActive || workspace.marqueeActive) {
      event.preventDefault?.(); event.stopImmediatePropagation?.()
      if (event.button === 2) { cancel(); return }
      if (event.button !== 0 || gesture || !manager() || !canvas.value) return
      const start = areaCoordinates(event)
      if (!start) return
      const kind = workspace.marqueeActive ? 'marquee' : 'zoom-area'
      canvas.value.focus(); beginGesture({ kind, pointer: event.pointerId, start, end: start, dragged: false })
      const rectangle = { left: start.x, top: start.y, width: 0, height: 0 }
      if (kind === 'marquee') marqueeRect.value = rectangle
      else zoomAreaRect.value = rectangle
      manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId)
      return
    }
    if (flexible.pointerDown(event)) return
    if (event.button === 2 && workspace.placementType) {
      event.preventDefault?.()
      event.stopPropagation?.()
      event.stopImmediatePropagation?.()
      cancelPlacement()
      return
    }
    if (!gesture && !workspace.placementType && (!(workspace.tool === 'select' && (event.ctrlKey || event.metaKey)) || wireRouting.duplicatePreviewState.value.active || wireRouting.movePreviewState.value.active) && wireRouting.pointerDown(event)) return
    if (event.button === 2 && !gesture && manager() && canvas.value) {
      const { x, y } = coordinates(event), hit = manager()!.pickGizmo(x, y) ? null : manager()!.pick(x, y)
      rightPress = { pointer: event.pointerId, start: { x, y }, dragged: false, target: hit?.kind === 'wire' ? { source: hit.source, destination: hit.destination } : hit ? { moduleId: hit.id } : undefined }
      // OrbitControls owns the press/move; only a stationary release opens a menu.
      return
    }
    if (event.button !== 0 || gesture || !manager() || !canvas.value) return
    canvas.value.focus(); const { x, y } = coordinates(event)
    if ((event.ctrlKey || event.metaKey) && !workspace.placementType && workspace.tool === 'select') {
      const hit = manager()!.pick(x, y)
      if (hit?.kind === 'wire') workspace.toggleWire(hit.source, hit.destination)
      else if (hit) workspace.toggleModule(hit.id)
      event.preventDefault?.(); event.stopImmediatePropagation?.(); sync(); return
    }
    const transform = manager()!.pickGizmo(x, y), module = selected.value
    const placing = !!workspace.placementType, pose = placing ? placementDraft : module
    if (transform && pose && transform.id === (placing ? 'PLACE' : module?.id)) {
      if (transform.handle === 'delete') {
        if (placing) cancelPlacement()
        else { attempt(() => circuit.removeModule(transform.id)); sync() }
        event.preventDefault?.()
        return
      }
      const center = manager()!.gizmoOrigin()!
      const initial = { x: pose.position?.x ?? 0, y: pose.position?.y ?? 0, z: pose.position?.z ?? 0 }
      const initialRotation = (pose.rotation ?? 0) % 360
      const screen = manager()!.project(center)
      beginGesture({ kind: 'transform', target: placing ? 'placement' : 'module', pointer: event.pointerId, start: { x, y }, dragged: false, id: transform.id, draft: circuit.activeId, handle: transform.handle, center, initial, position: initial, initialRotation, rotation: initialRotation, lastAngle: Math.atan2(y - screen.y, x - screen.x), angle: 0 })
      manager()!.activateGizmo(transform.handle); manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId); event.preventDefault?.(); return
    }
    if (workspace.placementType) {
      if (placementDraft) place(placementDraft.type, placementDraft.position, placementDraft.rotation)
      else {
        const point = placementPoint(x, y, workspace.placementType)
        if (point) { const draft = createPlacementDraft(workspace.placementType, point); place(draft.type, draft.position, draft.rotation) }
      }
      return
    }
    const point = manager()!.groundPoint(x, y)
    const hit = manager()!.pick(x, y)
    if (workspace.tool === 'wire' && hit?.kind === 'port') { connect(hit.endpoint); return }
    if (hit?.kind === 'wire') {
      workspace.selectWire(hit.source, hit.destination)
      sync(); return
    }
    if (!hit) {
      if (point) {
        beginGesture({ kind: 'pan', pointer: event.pointerId, start: { x, y }, dragged: false, anchor: point })
        manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId)
      } else { workspace.clearSelection(); sync() }
      return
    }
    if (workspace.tool === 'select' && hit.kind !== 'control' && circuit.graph) {
      beginGesture({ kind: 'pan', pointer: event.pointerId, start: { x, y }, dragged: false, anchor: hit.point.clone(), selection: { moduleId: hit.id, graph: circuit.graph, draft: circuit.activeId } })
      manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId); event.preventDefault?.(); return
    }
    workspace.selectModule(hit.id)
    if (!(workspace.tool === 'select' && hit.kind === 'control')) ui.openWindow('component-info', { activate: false })
    if (workspace.tool === 'select' && hit.kind === 'control') {
      const initial = supplyControlValue(selected.value?.properties, hit.control, selected.value?.type)
      beginGesture({ kind: 'control', pointer: event.pointerId, start: { x, y }, dragged: false, id: hit.id, draft: circuit.activeId, control: hit.control, initial, value: initial, axis: null, last: { x, y }, raw: typeof initial === 'number' ? initial : 0 })
      manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId); event.preventDefault?.()
    }
    else if (workspace.tool === 'rotate') attempt(() => circuit.rotateModule(hit.id))
    else if (workspace.tool === 'move') {
      const module = selected.value!, position = { x: module.position?.x ?? 0, y: module.position?.y ?? 0, z: module.position?.z ?? 0 }
      // Drag through the picked surface, including bodies above a low camera's ground horizon.
      const dragPoint = getPartForType(module.type) ? placementPoint(x, y, module.type) : manager()!.groundPoint(x, y, hit.point.y)
      if (!dragPoint) { sync(); return }
      beginGesture({ kind: 'move', pointer: event.pointerId, start: { x, y }, dragged: false, id: hit.id, draft: circuit.activeId, planeHeight: hit.point.y, offset: { x: position.x - dragPoint.x, y: position.y, z: position.z - dragPoint.z }, position })
      manager()!.lockPointer(true)
      canvas.value.setPointerCapture(event.pointerId)
    }
    sync()
  }
  function pointerMove(event: PointerEvent) {
    if (!manager() || !canvas.value) return
    if (flexible.pointerMove(event)) return
    if (rightPress?.pointer === event.pointerId) {
      const point = coordinates(event)
      if (Math.hypot(point.x - rightPress.start.x, point.y - rightPress.start.y) >= 4) rightPress.dragged = true
      return
    }
    if (!gesture && wireRouting.pointerMove(event)) return
    const { x, y } = coordinates(event)
    if ((workspace.zoomAreaActive || workspace.marqueeActive) && !gesture) return
    if (gesture) {
      if (event.pointerId !== gesture.pointer) return
      if (!pointerSession.owns(event.pointerId, circuit.activeId)) { cancelGesture(); return }
      if (gesture.kind === 'zoom-area' || gesture.kind === 'marquee') {
        const end = areaCoordinates(event)
        if (!end) { cancel(); return }
        gesture.end = end; gesture.dragged = true; dragging.value = gesture.kind
        const rectangle = { left: Math.min(gesture.start.x, end.x), top: Math.min(gesture.start.y, end.y), width: Math.abs(end.x - gesture.start.x), height: Math.abs(end.y - gesture.start.y) }
        if (gesture.kind === 'marquee') marqueeRect.value = rectangle
        else zoomAreaRect.value = rectangle
        return
      }
      const threshold = gesture.kind === 'control' && gesture.control !== 'power_on' ? 1 : 4
      if (!gesture.dragged && Math.hypot(x - gesture.start.x, y - gesture.start.y) < threshold) return
      gesture.dragged = true; dragging.value = gesture.kind
      if (gesture.kind === 'control') {
        if (gesture.control !== 'power_on') {
          const maximum = supplyControlMaximum(gesture.control)
          // Lock the intended drag axis so diagonal jitter does not double the gain.
          // Voltage: 0.05 V/pixel, Shift: 0.01 V/pixel. Apply modifier changes only
          // to new travel; keep the unsnapped accumulator so detents never trap a drag.
          gesture.axis ??= Math.abs(x - gesture.start.x) > Math.abs(y - gesture.start.y) ? 'x' : 'y'
          const delta = gesture.axis === 'x' ? x - gesture.last.x : gesture.last.y - y
          gesture.last = { x, y }
          // A modifier change or mouse release alone must not re-snap a fine value.
          if (delta === 0) return
          const rate = (gesture.control === 'voltage_v' ? 0.05 : 0.02) * (event.shiftKey ? 0.2 : 1)
          gesture.raw = Math.max(0, Math.min(maximum, gesture.raw + delta * rate))
          const raw = gesture.raw
          const detent = gesture.control === 'voltage_v' && !event.shiftKey ? voltageDetents.find((value) => Math.abs(value - raw) <= 0.06) : undefined
          gesture.value = detent ?? Math.round(gesture.raw * 100) / 100
          manager()!.previewSupplyControl(gesture.id, gesture.control, gesture.value)
        }
        return
      }
      if (gesture.kind === 'pan') { manager()!.panGrab(gesture.anchor, x, y); return }
      if (gesture.kind === 'transform') {
        const transform = gesture
        const type = transform.target === 'placement' ? placementDraft?.type : circuit.graph?.modules.find((m) => m.id === transform.id)?.type
        if (transform.handle === 'rotate-y') {
          const center = manager()!.project(transform.center), dx = x - center.x, dy = y - center.y
          if (Math.hypot(dx, dy) < 1) return
          const currentAngle = Math.atan2(dy, dx)
          transform.angle -= Math.atan2(Math.sin(currentAngle - transform.lastAngle), Math.cos(currentAngle - transform.lastAngle))
          transform.lastAngle = currentAngle
          const raw = transform.initialRotation + transform.angle * 180 / Math.PI
          transform.rotation = Math.round(raw * 100) / 100
          manager()!.setGizmoRotation(transform.angle)
          if (transform.target === 'placement' && placementDraft) {
            placementDraft.rotation = transform.rotation
            placementDraft.position = snap(transform.initial, placementDraft.type, null, transform.initial.y, placementDraft.rotation)
            showPlacement()
          } else if(!previewFlexibleTransform(transform.id,undefined,transform.rotation-transform.initialRotation))manager()!.previewRotation(transform.id, transform.rotation)
        } else {
          const point = manager()!.transformTranslation(transform.center, transform.start, { x, y }, transform.handle as 'x' | 'z' | 'xz')
          point.x += transform.initial.x; point.z += transform.initial.z
          const axis = transform.target === 'placement' && (transform.handle === 'x' || transform.handle === 'z') ? transform.handle : undefined
          if (axis === 'x') point.z = transform.initial.z
          if (axis === 'z') point.x = transform.initial.x
          transform.position = snap(point, transform.target === 'placement' || transform.handle === 'xz' ? type : undefined, transform.target === 'placement' ? null : transform.id, transform.initial.y, transform.target === 'placement' ? transform.rotation : undefined, axis)
          if (transform.handle === 'x') transform.position.z = transform.initial.z
          if (transform.handle === 'z') transform.position.x = transform.initial.x
          if (transform.target === 'placement' && placementDraft) { placementDraft.position = transform.position; showPlacement() }
          else if(!previewFlexibleTransform(transform.id,transform.position))manager()!.previewMove(transform.id, transform.position)
        }
        if (transform.target === 'module') {
          if (type && getPartForType(type) && !isFlexibleMount(circuit.graph?.modules.find(m=>m.id===transform.id)?.mount)) {
            const candidate = solveMounting(type, transform.position, transform.rotation, circuit.graph?.modules ?? [], transform.id, circuit.graph?.modules.find(m => m.id === transform.id)?.mount)
            manager()?.setMountPreview?.(candidate)
            mountHint.value = candidate ? candidate.valid ? 'All pins fit. Release to mount.' : candidate.reason : ''
          }
          updatePorts()
        }
        return
      }
    }
    if (!gesture) {
      const endpoint = !workspace.placementType ? manager()!.pickEndpoint(x, y) : null
      const parsed = endpoint?.endpoint.split('.'), pinModule = parsed && circuit.graph?.modules.find(m => m.id === parsed[0])
      const pin = pinModule && getPartForModule(pinModule)?.package.pins.find(p => p.id === parsed![1])
      pinHint.value = pin ? `${pinModule!.id} · pin ${pin.number} ${pin.name} · ${pin.role}${pin.outputType ? ' · ' + pin.outputType : ''}` : ''
      if (workspace.tool !== 'wire') manager()!.hoverEndpoint(pin ? endpoint!.endpoint : null)
      hoveredHandle.value = manager()!.hoverGizmo(x, y)
      const hit = !workspace.placementType && !hoveredHandle.value && workspace.tool === 'select' ? manager()!.pick(x, y) : null
      hoveredControl.value = hit?.kind === 'control' ? hit.control : null
      manager()!.hoverWire(hit?.kind === 'wire' ? hit : null)
      // Test the existing gizmo before following: a hovered handle must stay put.
      if (workspace.placementType && (hoveredHandle.value || manager()!.placementFollowBlocked())) return
    }
    const activeType = gesture?.kind === 'move' ? selected.value?.type : workspace.placementType ?? undefined
    const point = getPartForType(activeType ?? '') ? placementPoint(x, y, activeType) : manager()!.groundPoint(x, y, gesture?.kind === 'move' ? gesture.planeHeight : 0)
    if (!point) return
    if (gesture?.kind === 'move') {
      const move = gesture
      point.x += move.offset.x; point.z += move.offset.z
      const module = circuit.graph?.modules.find((m) => m.id === move.id)
      move.position = snap(point, module?.type, move.id, move.offset.y)
      if(previewFlexibleTransform(move.id,move.position)){updatePorts();return}
      const candidate = module && solveMounting(module.type, move.position, selected.value?.rotation ?? 0, circuit.graph?.modules ?? [], move.id, module.mount)
      manager()?.setMountPreview?.(candidate || null)
      mountHint.value = candidate ? candidate.valid ? 'All pins fit. Release to mount.' : candidate.reason : ''
      manager()!.previewMove(move.id, move.position); updatePorts()
    } else if (workspace.placementType) {
      if (!placementDraft) placementDraft = createPlacementDraft(workspace.placementType, point)
      else placementDraft.position = snap(point, placementDraft.type, null, placementDraft.position.y, placementDraft.rotation)
      showPlacement()
    }
  }
  function pointerUp(event: PointerEvent) {
    if (flexible.pointerUp(event)) return
    if (rightPress?.pointer === event.pointerId) {
      const completed = rightPress; rightPress = null; suppressWireContext = completed.dragged
      if (canvas.value) { const end = coordinates(event); suppressWireContext ||= Math.hypot(end.x - completed.start.x, end.y - completed.start.y) >= 4 }
      if (!suppressWireContext) wireRouting.openContextMenu(completed.start.x, completed.start.y, completed.target)
      return
    }
    if (wireRouting.pointerUp(event)) return
    if (!gesture || event.pointerId !== gesture.pointer) return
    pointerMove(event)
    if (!gesture) return
    if (!pointerSession.complete(event.pointerId, circuit.activeId)) { cancelGesture(); return }
    const completed = gesture; gesture = null; dragging.value = null; manager()?.activateGizmo(null); manager()?.lockPointer(false)
    if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId)
    if (completed.kind === 'zoom-area') {
      zoomAreaRect.value = null
      if (manager()?.zoomToArea(completed.start.x, completed.start.y, completed.end.x, completed.end.y)) workspace.cancelZoomArea()
      manager()?.lockPointer(workspace.zoomAreaActive); updatePorts()
      return
    }
    if (completed.kind === 'marquee') {
      marqueeRect.value = null
      const rectangle = { left: Math.min(completed.start.x, completed.end.x), top: Math.min(completed.start.y, completed.end.y), right: Math.max(completed.start.x, completed.end.x), bottom: Math.max(completed.start.y, completed.end.y) }
      workspace.setMarqueeSelection(completed.dragged && rectangle.right - rectangle.left >= 3 && rectangle.bottom - rectangle.top >= 3 ? manager()!.selectInRect(rectangle) : { moduleIds: [], wires: [] })
      workspace.cancelMarquee(); highlightSelection(); updatePorts()
      return
    }
    if (completed.kind === 'transform' && completed.target === 'placement') {
      if (completed.handle === 'rotate-y' && completed.dragged && placementDraft) {
        const raw = completed.initialRotation + completed.angle * 180 / Math.PI
        const type = placementDraft.type
        const step = rotationSnapStep(type)
        const support = type && getPartForType(type) ? solveMounting(type, completed.initial, raw, circuit.graph?.modules ?? [], 'PLACE') : null
        const boardRotation = support ? circuit.graph?.modules.find(m => m.id === support.boardId)?.rotation ?? 0 : 0
        placementDraft.rotation = workspace.snap ? boardRotation + Math.round((raw - boardRotation) / step) * step : Math.round(raw * 100) / 100
        placementDraft.position = snap(completed.initial, placementDraft.type, null, completed.initial.y, placementDraft.rotation)
        showPlacement()
      }
      return
    }
    if (completed.kind === 'control' && completed.draft === circuit.activeId) {
      if (completed.control !== 'power_on' && completed.dragged) attempt(() => circuit.updateModuleProperties(completed.id, supplyControlPatch(circuit.graph!.modules.find(module => module.id === completed.id)!.type, completed.control, completed.value)))
      else if (completed.control === 'power_on' && !completed.dragged && canvas.value) {
        const { x, y } = coordinates(event), hit = manager()?.pick(x, y)
        if (hit?.kind === 'control' && hit.id === completed.id && hit.control === 'power_on') attempt(() => circuit.updateModuleProperties(completed.id, { power_on: !completed.initial }))
      }
    }
    else if (completed.kind === 'move' && completed.dragged && completed.draft === circuit.activeId) attempt(() => circuit.moveModule(completed.id, completed.position))
    else if (completed.kind === 'transform' && completed.dragged && completed.draft === circuit.activeId) attempt(() => {
      if (completed.handle === 'rotate-y') {
        const raw = completed.initialRotation + completed.angle * 180 / Math.PI
        const module = circuit.graph?.modules.find((m) => m.id === completed.id), type = module?.type
        const step = rotationSnapStep(type)
        const support = type && getPartForType(type, module?.mount) ? solveMounting(type, completed.initial, raw, circuit.graph?.modules ?? [], completed.id, module?.mount) : null
        const boardRotation = support ? circuit.graph?.modules.find(m => m.id === support.boardId)?.rotation ?? 0 : 0
        const finalRotation = workspace.snap ? boardRotation + Math.round((raw - boardRotation) / step) * step : Math.round(raw * 100) / 100
        circuit.rotateModule(completed.id, finalRotation - completed.initialRotation)
      }
      else circuit.moveModule(completed.id, completed.position)
    })
    else if (completed.kind === 'pan' && !completed.dragged) {
      if (!completed.selection) workspace.clearSelection()
      else if (completed.selection.graph === circuit.graph && completed.selection.draft === circuit.activeId && circuit.graph?.modules.some(module => module.id === completed.selection!.moduleId)) {
        workspace.selectModule(completed.selection.moduleId); ui.openWindow('component-info', { activate: false })
      }
    }
    manager()?.setMountPreview?.(null); mountHint.value = ''; sync()
  }
  function drop(event: DragEvent) {
    event.preventDefault(); cancelPlacement()
    const type = event.dataTransfer?.getData('application/x-netcircuit-component')
    if (!type || !getDefinition(type) || !manager() || !canvas.value) return
    const dropPoint = coordinates(event)
    if(flexible.drop(type, dropPoint.x, dropPoint.y)){ui.activeRibbonGroup=null;ui.openWindow('component-info',{activate:false});canvas.value.focus();return}
    const { x, y } = coordinates(event), point = placementPoint(x, y, type)
    if (point) {
      const draft = createPlacementDraft(type, point)
      ui.activeRibbonGroup = null; place(draft.type, draft.position, draft.rotation); canvas.value.focus()
    }
  }
  function keydown(event: KeyboardEvent) {
    if (flexible.keydown(event)) return
    if (workspace.marqueeActive && event.key === 'Escape') { event.preventDefault(); cancel(); return }
    if (wireRouting.keydown(event)) return
    if (event.key === 'Escape') { cancelPlacement(); return }
    if (workspace.zoomAreaActive || workspace.marqueeActive) {
      if (['Delete', 'Backspace', 'r', 'R', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault()
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (gesture && ['Delete', 'Backspace', 'r', 'R', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) cancel(false)
    const id = workspace.selectedModuleId
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); wireRouting.menuDelete() }
    else if (id && event.key.toLowerCase() === 'r') attempt(() => circuit.rotateModule(id))
    else if (id && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); const module = selected.value!; const step = workspace.snap ? 0.5 : 0.1
      const rawTarget = {
        x: (module.position?.x ?? 0) + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
        y: module.position?.y ?? 0,
        z: (module.position?.z ?? 0) + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0)
      }
      attempt(() => circuit.moveModule(id, snap(rawTarget, module.type, id, module.position?.y ?? 0)))
    }
  }
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !(event.target as HTMLElement | null)?.closest?.('[data-workspace-text-input]')) keydown(event) }
  onMounted(() => document.addEventListener('keydown', escape, true))
  onUnmounted(() => document.removeEventListener('keydown', escape, true))
  function selectModule(id: string) { cancel(); workspace.selectModule(id); sync() }
  watch(() => circuit.graph, () => {
    if (!wireRouting.consumeDuplicateGraphChange(circuit.graph)) cancel(false)
    clearPlacement()
    const selection = workspace.selection
    if (circuit.graph) {
      const current = normalizeSelection(circuit.graph, selection)
      if (JSON.stringify(current) !== JSON.stringify(selection)) workspace.setSelection(current)
    } else workspace.clearSelection()
    if (workspace.pendingPort && !circuit.graph?.modules.some((module) => module.id === workspace.pendingPort!.split('.')[0])) workspace.pendingPort = null
    if (workspace.selectedWire && !circuit.graph?.connections.some((wire) => wire.source === workspace.selectedWire!.source && wire.destination === workspace.selectedWire!.destination)) workspace.selectedWire = null
    sync()
  }, { deep: true })
  watch(() => [workspace.tool, workspace.placementType], () => { cancelGesture(); clearPlacement(); manager()?.lockPointer(workspace.zoomAreaActive || workspace.marqueeActive); updatePorts() }, { flush: 'sync' })
  watch(() => workspace.zoomAreaActive, (active) => { cancelGesture(); manager()?.lockPointer(active); updatePorts() })
  watch(() => workspace.marqueeActive, (active) => { cancelGesture(); if (active) wireRouting.cancel(); manager()?.lockPointer(active); updatePorts() })
  watch(() => [workspace.selectedModuleId, workspace.selectedWire, workspace.selectedModuleIds, workspace.selectedWires], () => {
    if (gesture && gesture.kind !== 'pan' && gesture.kind !== 'zoom-area' && gesture.kind !== 'marquee' && !(gesture.kind === 'transform' && gesture.target === 'placement') && gesture.id !== workspace.selectedModuleId) cancel()
    highlightSelection(); updatePorts()
  })
  watch(() => selected.value?.id, (id) => {
    if (id || workspace.placementType) ui.openWindow('component-info', { activate: false })
    else ui.closeWindow('component-info')
  }, { immediate: true })
  onUnmounted(() => { cancel(); clearPlacement() })
  function pointerLeave() { wireRouting.pointerLeave(); pinHint.value = ''; if (!gesture) { hoveredHandle.value = null; hoveredControl.value = null; manager()?.clearGizmoHover(); manager()?.hoverWire(null) } }
  return { ports, selected, dragging, hoveredHandle, hoveredControl, controlHint, zoomAreaRect, marqueeRect, updatePorts, sync, cancel, connect, pointerDown, pointerMove, pointerUp, pointerLeave, pointerCancel: lostPointerCapture, lostPointerCapture, contextMenu, drop, keydown, selectModule, wireRouting, selectionCommands: wireRouting.commands }
}
