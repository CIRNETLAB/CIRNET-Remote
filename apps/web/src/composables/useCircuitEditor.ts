import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type { Vector3 } from 'three'
import type { createSceneManager } from '../three/SceneManager'
import { getDefinition } from '../data/editorCatalog'
import { getBreadboardGeometrySpec } from '../geometry/BreadboardGeometrySpec'
import { snapBreadboardPosition } from '../geometry/breadboardDocking'
import { placementInitialRotation, rotationSnapStep } from '../geometry/placementRotation'
import { useCircuitStore } from '../stores/circuit'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import type { CircuitModule, CircuitGraph } from '../types/circuit'
import type { TransformHandle } from '../three/ComponentTransformGizmo'
import { supplyControlMaximum, supplyControlValue, type SupplyControl } from '../three/PowerSupplyModel'
import { useWireRouting } from './useWireRouting'
type Manager = ReturnType<typeof createSceneManager>
export type Position = { x: number; y: number; z: number }
interface PlacementDraft { type: string; position: Position; rotation: number }
interface DragGesture { pointer: number; start: { x: number; y: number }; dragged: boolean }
interface MoveGesture extends DragGesture { kind: 'move'; id: string; draft: string | null; planeHeight: number; offset: Position; position: Position }
interface PanGesture extends DragGesture { kind: 'pan'; anchor: Vector3; selection?: { moduleId: string; graph: CircuitGraph; draft: string | null } }
interface ZoomAreaGesture extends DragGesture { kind: 'zoom-area'; end: { x: number; y: number } }
interface ControlGesture extends DragGesture {
  kind: 'control'; id: string; draft: string | null; control: SupplyControl; initial: number | boolean; value: number | boolean
  axis: 'x' | 'y' | null; last: { x: number; y: number }; raw: number
}
const voltageDetents = [3, 3.3, 5, 6, 9, 12, 15] as const
interface TransformGesture extends DragGesture {
  kind: 'transform'; target: 'module' | 'placement'; id: string; draft: string | null; handle: TransformHandle; anchor: Vector3; center: Vector3
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
  const wireRouting = useWireRouting(canvas, manager)
  let gesture: MoveGesture | PanGesture | TransformGesture | ControlGesture | ZoomAreaGesture | null = null
  // A pose only: never a graph module, electrical identity or history entry.
  let placementDraft: PlacementDraft | null = null
  const dragging = ref<'move' | 'pan' | 'transform' | 'control' | 'zoom-area' | null>(null)
  const zoomAreaRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  const hoveredHandle = ref<TransformHandle | null>(null)
  const hoveredControl = ref<SupplyControl | null>(null)
  const controlHint = computed(() => {
    if (workspace.tool === 'wire' || workspace.selectedWire) return wireRouting.hint.value
    if (hoveredHandle.value === 'delete') return workspace.placementType ? 'Click to cancel placement (or press Escape)' : 'Click to delete component (or press Delete)'
    if (hoveredControl.value === 'power_on') return 'Click to toggle power On/Off'
    if (hoveredControl.value) return `Drag ${hoveredControl.value === 'voltage_v' ? 'Voltage (0–15 V)' : 'Ampe (0–5 A)'} knob up/right to increase, down/left to decrease. Hold Shift for fine adjustment.`
    return ''
  })
  const ports = ref<{ endpoint: string; x: number; y: number; direction: string }[]>([])
  const selected = computed(() => circuit.graph?.modules.find((module) => module.id === workspace.selectedModuleId))
  const attempt = (action: () => void) => { try { action(); workspace.editError = '' } catch (error) { workspace.editError = error instanceof Error ? error.message : 'Circuit edit failed.' } }
  const coordinates = (event: { clientX: number; clientY: number }) => { const rect = canvas.value!.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top } }
  const snap = (point: { x: number; y?: number; z: number } | Vector3, activeType?: string | null, activeId?: string | null, elevation = 0, rotation?: number, axis?: 'x' | 'z'): Position =>
    snapPosition(point, workspace.snap, circuit.graph?.modules ?? [], activeType, activeId, elevation, rotation, axis)
  function createPlacementDraft(type: string, point: Position): PlacementDraft {
    const rotation = placementInitialRotation(type, () => manager()!.placementFacingYaw())
    return { type, position: snap(point, type, null, 0, rotation), rotation }
  }
  function showPlacement() { if (placementDraft) manager()?.setGhost(placementDraft.type, placementDraft.position, placementDraft.rotation) }
  function clearPlacement() { placementDraft = null; manager()?.setGhost(null) }
  function updatePorts() {
    if (workspace.zoomAreaActive) { ports.value = []; return }
    const next: typeof ports.value = []
    for (const module of circuit.graph?.modules ?? []) {
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
  function sync() { manager()?.syncGraph(circuit.graph); manager()?.highlight(workspace.selectedModuleId, workspace.selectedWire); updatePorts() }
  function cancelGesture() {
    if (gesture?.kind === 'transform' && gesture.target === 'placement' && placementDraft) {
      placementDraft.position = gesture.initial; placementDraft.rotation = gesture.initialRotation
    }
    if (gesture) { const pointer = gesture.pointer; gesture = null; dragging.value = null; manager()?.activateGizmo(null); manager()?.lockPointer(false); if (canvas.value?.hasPointerCapture(pointer)) canvas.value.releasePointerCapture(pointer); sync() }
    zoomAreaRect.value = null; manager()?.lockPointer(false)
    hoveredHandle.value = null; hoveredControl.value = null; manager()?.clearGizmoHover()
    showPlacement()
  }
  function cancel() { workspace.cancelZoomArea(); wireRouting.cancel(); cancelGesture() }
  function cancelPlacement() { cancel(); workspace.cancelPlacement(); clearPlacement(); workspace.editError = '' }
  function lostPointerCapture(event: PointerEvent) { if (wireRouting.lostPointerCapture(event)) return; if (gesture?.pointer === event.pointerId) { cancel(); clearPlacement() } }
  function contextMenu(event: MouseEvent) { if (wireRouting.contextMenu(event)) return; event.preventDefault(); if (workspace.placementType) cancelPlacement(); else if (workspace.zoomAreaActive) cancel() }
  function areaCoordinates(event: PointerEvent) {
    const rect = canvas.value!.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || ![event.clientX, event.clientY].every(Number.isFinite)) return null
    return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }
  }
  function connect(endpoint: string) {
    wireRouting.connect(endpoint)
  }
  function place(type: string, position: Position, rotation: number) { attempt(() => { const id = circuit.placeModule(type, position, rotation); workspace.selectModule(id); clearPlacement(); sync() }) }
  function pointerDown(event: PointerEvent) {
    if (workspace.zoomAreaActive) {
      event.preventDefault?.(); event.stopImmediatePropagation?.()
      if (event.button === 2) { cancel(); return }
      if (event.button !== 0 || gesture || !manager() || !canvas.value) return
      const start = areaCoordinates(event)
      if (!start) return
      canvas.value.focus(); gesture = { kind: 'zoom-area', pointer: event.pointerId, start, end: start, dragged: false }
      zoomAreaRect.value = { left: start.x, top: start.y, width: 0, height: 0 }
      manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId)
      return
    }
    if (event.button === 2 && workspace.placementType) {
      event.preventDefault?.()
      event.stopPropagation?.()
      event.stopImmediatePropagation?.()
      cancelPlacement()
      return
    }
    if (!gesture && !workspace.placementType && wireRouting.pointerDown(event)) return
    if (event.button !== 0 || gesture || !manager() || !canvas.value) return
    canvas.value.focus(); const { x, y } = coordinates(event)
    const transform = manager()!.pickGizmo(x, y), module = selected.value
    const placing = !!workspace.placementType, pose = placing ? placementDraft : module
    if (transform && pose && transform.id === (placing ? 'PLACE' : module?.id)) {
      if (transform.handle === 'delete') {
        if (placing) cancelPlacement()
        else { attempt(() => circuit.removeModule(transform.id)); sync() }
        event.preventDefault?.()
        return
      }
      const center = manager()!.gizmoOrigin()!, anchor = manager()!.groundPoint(x, y, center.y)
      if (!anchor) return
      const initial = { x: pose.position?.x ?? 0, y: pose.position?.y ?? 0, z: pose.position?.z ?? 0 }
      const initialRotation = (pose.rotation ?? 0) % 360
      gesture = { kind: 'transform', target: placing ? 'placement' : 'module', pointer: event.pointerId, start: { x, y }, dragged: false, id: transform.id, draft: circuit.activeId, handle: transform.handle, center, anchor, initial, position: initial, initialRotation, rotation: initialRotation, lastAngle: Math.atan2(-(anchor.z - center.z), anchor.x - center.x), angle: 0 }
      manager()!.activateGizmo(transform.handle); manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId); event.preventDefault?.(); return
    }
    if (workspace.placementType) {
      if (placementDraft) place(placementDraft.type, placementDraft.position, placementDraft.rotation)
      else {
        const point = manager()!.groundPoint(x, y)
        if (point) { const draft = createPlacementDraft(workspace.placementType, point); place(draft.type, draft.position, draft.rotation) }
      }
      return
    }
    const point = manager()!.groundPoint(x, y)
    const hit = manager()!.pick(x, y)
    if (workspace.tool === 'wire' && hit?.kind === 'port') { connect(hit.endpoint); return }
    if (hit?.kind === 'wire') {
      workspace.selectWire(hit.source, hit.destination)
      if (workspace.tool === 'delete') attempt(() => circuit.disconnectPorts(hit.source, hit.destination))
      sync(); return
    }
    if (!hit) {
      if (point) {
        gesture = { kind: 'pan', pointer: event.pointerId, start: { x, y }, dragged: false, anchor: point }
        manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId)
      } else { workspace.clearSelection(); sync() }
      return
    }
    if (workspace.tool === 'select' && hit.kind !== 'control' && circuit.graph) {
      gesture = { kind: 'pan', pointer: event.pointerId, start: { x, y }, dragged: false, anchor: hit.point.clone(), selection: { moduleId: hit.id, graph: circuit.graph, draft: circuit.activeId } }
      manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId); event.preventDefault?.(); return
    }
    workspace.selectModule(hit.id)
    if (!(workspace.tool === 'select' && hit.kind === 'control')) ui.openWindow('component-info', { activate: false })
    if (workspace.tool === 'select' && hit.kind === 'control') {
      const initial = supplyControlValue(selected.value?.properties, hit.control)
      gesture = { kind: 'control', pointer: event.pointerId, start: { x, y }, dragged: false, id: hit.id, draft: circuit.activeId, control: hit.control, initial, value: initial, axis: null, last: { x, y }, raw: typeof initial === 'number' ? initial : 0 }
      manager()!.lockPointer(true); canvas.value.setPointerCapture(event.pointerId); event.preventDefault?.()
    }
    else if (workspace.tool === 'rotate') attempt(() => circuit.rotateModule(hit.id))
    else if (workspace.tool === 'delete') attempt(() => circuit.removeModule(hit.id))
    else if (workspace.tool === 'scope' || workspace.tool === 'probe') ui.openWindow(workspace.tool === 'scope' ? 'oscilloscope' : 'monitor')
    else if (workspace.tool === 'move') {
      const module = selected.value!, position = { x: module.position?.x ?? 0, y: module.position?.y ?? 0, z: module.position?.z ?? 0 }
      // Drag through the picked surface, including bodies above a low camera's ground horizon.
      const dragPoint = manager()!.groundPoint(x, y, hit.point.y)
      if (!dragPoint) { sync(); return }
      gesture = { kind: 'move', pointer: event.pointerId, start: { x, y }, dragged: false, id: hit.id, draft: circuit.activeId, planeHeight: hit.point.y, offset: { x: position.x - dragPoint.x, y: position.y, z: position.z - dragPoint.z }, position }
      manager()!.lockPointer(true)
      canvas.value.setPointerCapture(event.pointerId)
    }
    sync()
  }
  function pointerMove(event: PointerEvent) {
    if (!manager() || !canvas.value) return
    if (!gesture && wireRouting.pointerMove(event)) return
    const { x, y } = coordinates(event)
    if (workspace.zoomAreaActive && !gesture) return
    if (gesture) {
      if (event.pointerId !== gesture.pointer) return
      if (gesture.kind === 'zoom-area') {
        const end = areaCoordinates(event)
        if (!end) { cancel(); return }
        gesture.end = end; gesture.dragged = true; dragging.value = 'zoom-area'
        zoomAreaRect.value = { left: Math.min(gesture.start.x, end.x), top: Math.min(gesture.start.y, end.y), width: Math.abs(end.x - gesture.start.x), height: Math.abs(end.y - gesture.start.y) }
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
        const transform = gesture, point = manager()!.groundPoint(x, y, transform.center.y)
        if (!point) return
        const type = transform.target === 'placement' ? placementDraft?.type : circuit.graph?.modules.find((m) => m.id === transform.id)?.type
        if (transform.handle === 'rotate-y') {
          const dx = point.x - transform.center.x, dz = point.z - transform.center.z
          if (Math.hypot(dx, dz) < 0.001) return
          const currentAngle = Math.atan2(-dz, dx)
          transform.angle += Math.atan2(Math.sin(currentAngle - transform.lastAngle), Math.cos(currentAngle - transform.lastAngle))
          transform.lastAngle = currentAngle
          const raw = transform.initialRotation + transform.angle * 180 / Math.PI
          const step = rotationSnapStep(type)
          transform.rotation = workspace.snap ? Math.round(raw / step) * step : Math.round(raw * 100) / 100
          if (transform.target === 'placement' && placementDraft) {
            placementDraft.rotation = transform.rotation
            placementDraft.position = snap(transform.initial, placementDraft.type, null, transform.initial.y, placementDraft.rotation)
            showPlacement()
          } else manager()!.previewRotation(transform.id, transform.rotation)
        } else {
          point.sub(transform.anchor); point.x += transform.initial.x; point.z += transform.initial.z
          const axis = transform.target === 'placement' && (transform.handle === 'x' || transform.handle === 'z') ? transform.handle : undefined
          if (axis === 'x') point.z = transform.initial.z
          if (axis === 'z') point.x = transform.initial.x
          transform.position = snap(point, transform.target === 'placement' || transform.handle === 'xz' ? type : undefined, transform.target === 'placement' ? null : transform.id, transform.initial.y, transform.target === 'placement' ? transform.rotation : undefined, axis)
          if (transform.handle === 'x') transform.position.z = transform.initial.z
          if (transform.handle === 'z') transform.position.x = transform.initial.x
          if (transform.target === 'placement' && placementDraft) { placementDraft.position = transform.position; showPlacement() }
          else manager()!.previewMove(transform.id, transform.position)
        }
        if (transform.target === 'module') updatePorts(); return
      }
    }
    if (!gesture) {
      hoveredHandle.value = manager()!.hoverGizmo(x, y)
      const hit = !workspace.placementType && !hoveredHandle.value && workspace.tool === 'select' ? manager()!.pick(x, y) : null
      hoveredControl.value = hit?.kind === 'control' ? hit.control : null
      manager()!.hoverWire(hit?.kind === 'wire' ? hit : null)
      // Test the existing gizmo before following: a hovered handle must stay put.
      if (workspace.placementType && (hoveredHandle.value || manager()!.placementFollowBlocked())) return
    }
    const point = manager()!.groundPoint(x, y, gesture?.kind === 'move' ? gesture.planeHeight : 0)
    if (!point) return
    if (gesture?.kind === 'move') {
      const move = gesture
      point.x += move.offset.x; point.z += move.offset.z
      const module = circuit.graph?.modules.find((m) => m.id === move.id)
      move.position = snap(point, module?.type, move.id, move.offset.y)
      manager()!.previewMove(move.id, move.position); updatePorts()
    } else if (workspace.placementType) {
      if (!placementDraft) placementDraft = createPlacementDraft(workspace.placementType, point)
      else placementDraft.position = snap(point, placementDraft.type, null, placementDraft.position.y, placementDraft.rotation)
      showPlacement()
    }
  }
  function pointerUp(event: PointerEvent) {
    if (wireRouting.pointerUp(event)) return
    if (!gesture || event.pointerId !== gesture.pointer) return
    pointerMove(event)
    if (!gesture) return
    const completed = gesture; gesture = null; dragging.value = null; manager()?.activateGizmo(null); manager()?.lockPointer(false)
    if (canvas.value?.hasPointerCapture(event.pointerId)) canvas.value.releasePointerCapture(event.pointerId)
    if (completed.kind === 'zoom-area') {
      zoomAreaRect.value = null
      if (manager()?.zoomToArea(completed.start.x, completed.start.y, completed.end.x, completed.end.y)) workspace.cancelZoomArea()
      manager()?.lockPointer(workspace.zoomAreaActive); updatePorts()
      return
    }
    if (completed.kind === 'transform' && completed.target === 'placement') return
    if (completed.kind === 'control' && completed.draft === circuit.activeId) {
      if (completed.control !== 'power_on' && completed.dragged) attempt(() => circuit.updateModuleProperties(completed.id, { [completed.control]: completed.value }))
      else if (completed.control === 'power_on' && !completed.dragged && canvas.value) {
        const { x, y } = coordinates(event), hit = manager()?.pick(x, y)
        if (hit?.kind === 'control' && hit.id === completed.id && hit.control === 'power_on') attempt(() => circuit.updateModuleProperties(completed.id, { power_on: !completed.initial }))
      }
    }
    else if (completed.kind === 'move' && completed.dragged && completed.draft === circuit.activeId) attempt(() => circuit.moveModule(completed.id, completed.position))
    else if (completed.kind === 'transform' && completed.dragged && completed.draft === circuit.activeId) attempt(() => {
      if (completed.handle === 'rotate-y') circuit.rotateModule(completed.id, completed.rotation - completed.initialRotation)
      else circuit.moveModule(completed.id, completed.position)
    })
    else if (completed.kind === 'pan' && !completed.dragged) {
      if (!completed.selection) workspace.clearSelection()
      else if (completed.selection.graph === circuit.graph && completed.selection.draft === circuit.activeId && circuit.graph?.modules.some(module => module.id === completed.selection!.moduleId)) {
        workspace.selectModule(completed.selection.moduleId); ui.openWindow('component-info', { activate: false })
      }
    }
    sync()
  }
  function drop(event: DragEvent) {
    event.preventDefault(); cancelPlacement()
    const type = event.dataTransfer?.getData('application/x-netcircuit-component')
    if (!type || !getDefinition(type) || !manager() || !canvas.value) return
    const { x, y } = coordinates(event), point = manager()!.groundPoint(x, y)
    if (point) {
      const draft = createPlacementDraft(type, point)
      ui.activeRibbonGroup = null; place(draft.type, draft.position, draft.rotation); canvas.value.focus()
    }
  }
  function keydown(event: KeyboardEvent) {
    if (wireRouting.keydown(event)) return
    if (event.key === 'Escape') { cancelPlacement(); return }
    if (workspace.zoomAreaActive) {
      if (['Delete', 'Backspace', 'r', 'R', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault()
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (gesture && ['Delete', 'Backspace', 'r', 'R', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) cancel()
    const id = workspace.selectedModuleId
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); attempt(() => { if (id) circuit.removeModule(id); else if (workspace.selectedWire) circuit.disconnectPorts(workspace.selectedWire.source, workspace.selectedWire.destination) }) }
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
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') keydown(event) }
  onMounted(() => document.addEventListener('keydown', escape, true))
  onUnmounted(() => document.removeEventListener('keydown', escape, true))
  function selectModule(id: string) { cancel(); workspace.selectModule(id); sync() }
  watch(() => circuit.graph, () => {
    cancel(); clearPlacement()
    if (workspace.selectedModuleId && !circuit.graph?.modules.some((module) => module.id === workspace.selectedModuleId)) workspace.selectedModuleId = null
    if (workspace.pendingPort && !circuit.graph?.modules.some((module) => module.id === workspace.pendingPort!.split('.')[0])) workspace.pendingPort = null
    if (workspace.selectedWire && !circuit.graph?.connections.some((wire) => wire.source === workspace.selectedWire!.source && wire.destination === workspace.selectedWire!.destination)) workspace.selectedWire = null
    sync()
  }, { deep: true })
  watch(() => [workspace.tool, workspace.placementType], () => { cancelGesture(); clearPlacement(); manager()?.lockPointer(workspace.zoomAreaActive); updatePorts() }, { flush: 'sync' })
  watch(() => workspace.zoomAreaActive, (active) => { cancelGesture(); manager()?.lockPointer(active); updatePorts() })
  watch(() => [workspace.selectedModuleId, workspace.selectedWire], () => {
    if (gesture && gesture.kind !== 'pan' && gesture.kind !== 'zoom-area' && !(gesture.kind === 'transform' && gesture.target === 'placement') && gesture.id !== workspace.selectedModuleId) cancel()
    manager()?.highlight(workspace.selectedModuleId, workspace.selectedWire); updatePorts()
  })
  watch(() => selected.value?.id, (id) => {
    if (id) ui.openWindow('component-info', { activate: false })
    else ui.closeWindow('component-info')
  }, { immediate: true })
  onUnmounted(() => { cancel(); clearPlacement() })
  function pointerLeave() { wireRouting.pointerLeave(); if (!gesture) { hoveredHandle.value = null; hoveredControl.value = null; manager()?.clearGizmoHover(); manager()?.hoverWire(null) } }
  return { ports, selected, dragging, hoveredHandle, hoveredControl, controlHint, zoomAreaRect, updatePorts, sync, cancel, connect, pointerDown, pointerMove, pointerUp, pointerLeave, pointerCancel: lostPointerCapture, lostPointerCapture, contextMenu, drop, keydown, selectModule, wireRouting }
}
