import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type { Vector3 } from 'three'
import type { createSceneManager } from '../three/SceneManager'
import { getDefinition } from '../data/editorCatalog'
import { useCircuitStore } from '../stores/circuit'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import type { CircuitModule } from '../types/circuit'
import type { TransformHandle } from '../three/ComponentTransformGizmo'
import { supplyControlMaximum, supplyControlValue, type SupplyControl } from '../three/PowerSupplyModel'
type Manager = ReturnType<typeof createSceneManager>
export type Position = { x: number; y: number; z: number }
interface PlacementDraft { type: string; position: Position; rotation: number }
interface DragGesture { pointer: number; start: { x: number; y: number }; dragged: boolean }
interface MoveGesture extends DragGesture { kind: 'move'; id: string; draft: string | null; planeHeight: number; offset: Position; position: Position }
interface PanGesture extends DragGesture { kind: 'pan'; anchor: Vector3 }
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

function footprint(size: readonly number[], degrees: number) {
  const angle = (degrees % 360) * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle))
  return [size[0] * c + size[2] * s, size[0] * s + size[2] * c]
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
  const clean = (n: number) => Math.round(n * 10000) / 10000
  const baseX = axis === 'z' ? point.x : snapEnabled ? Math.round(point.x * 2) / 2 : Math.round(point.x * 100) / 100
  const baseZ = axis === 'x' ? point.z : snapEnabled ? Math.round(point.z * 2) / 2 : Math.round(point.z * 100) / 100

  if (!snapEnabled || !activeType) return { x: clean(baseX), y: elevation, z: clean(baseZ) }

  const activeDef = getDefinition(activeType)
  if (!activeDef?.visual?.startsWith('breadboard')) return { x: clean(baseX), y: elevation, z: clean(baseZ) }

  const otherBoards = modules.flatMap((m) => {
    if (activeId && m.id === activeId) return []
    const def = getDefinition(m.type)
    if (!def?.visual?.startsWith('breadboard')) return []
    const [w, d] = footprint(def.size, m.rotation ?? 0)
    return [{ id: m.id, x: m.position?.x ?? 0, z: m.position?.z ?? 0, w, d }]
  })
  if (otherBoards.length === 0) return { x: clean(baseX), y: elevation, z: clean(baseZ) }

  const activeModule = activeId ? modules.find((m) => m.id === activeId) : null
  const activeRot = rotation ?? activeModule?.rotation ?? 0
  const [activeW, activeD] = footprint(activeDef.size, activeRot)

  // 1. Magnetic docking candidates
  let bestCandidate: { x: number; z: number } | null = null
  let minDist = Infinity

  for (const m of otherBoards) {
    const { x: mX, z: mZ, w: mW, d: mD } = m

    const sites = [
      // Top (North)
      { axis: 'z', x: mX, z: mZ - (mD + activeD) / 2, threshZ: 0.65, threshX: 1.5 },
      // Bottom (South)
      { axis: 'z', x: mX, z: mZ + (mD + activeD) / 2, threshZ: 0.65, threshX: 1.5 },
      // Left (West)
      { axis: 'x', x: mX - (mW + activeW) / 2, z: mZ, threshZ: 1.2, threshX: 0.65 },
      // Right (East)
      { axis: 'x', x: mX + (mW + activeW) / 2, z: mZ, threshZ: 1.2, threshX: 0.65 }
    ]

    for (const site of sites) {
      // Placement axis handles dock/push only along their axis. They must not
      // snap the transverse coordinate or magnetize a distant, non-overlapping row.
      if (axis && site.axis !== axis) continue
      if (axis === 'x' && Math.abs(point.z - mZ) >= (mD + activeD) / 2 - 0.005) continue
      if (axis === 'z' && Math.abs(point.x - mX) >= (mW + activeW) / 2 - 0.005) continue
      const s = axis === 'x' ? { ...site, z: point.z } : axis === 'z' ? { ...site, x: point.x } : site
      const dx = Math.abs(point.x - s.x), dz = Math.abs(point.z - s.z)
      if (dx > s.threshX || dz > s.threshZ) continue
      const eps = 0.005
      const siteOverlapsOther = otherBoards.some((b) => {
        if (b.id === m.id) return false
        const { x: bX, z: bZ, w: bW, d: bD } = b
        return (s.x - activeW / 2 < bX + bW / 2 - eps) &&
               (s.x + activeW / 2 > bX - bW / 2 + eps) &&
               (s.z - activeD / 2 < bZ + bD / 2 - eps) &&
               (s.z + activeD / 2 > bZ - bD / 2 + eps)
      })
      if (siteOverlapsOther) continue

      if (dx <= s.threshX && dz <= s.threshZ) {
        const dist = Math.hypot(dx, dz)
        if (dist < minDist) {
          minDist = dist
          bestCandidate = { x: s.x, z: s.z }
        }
      }
    }
  }

  let candX = bestCandidate ? bestCandidate.x : baseX
  let candZ = bestCandidate ? bestCandidate.z : baseZ

  // 2. Anti-overlap resolution: if active board collides with any other board, push out to nearest edge
  for (let iter = 0; iter < 3; iter++) {
    let collided = false
    for (const m of otherBoards) {
      const { x: mX, z: mZ, w: mW, d: mD } = m

      const eps = 0.005
      const overlapX = (candX - activeW / 2 < mX + mW / 2 - eps) && (candX + activeW / 2 > mX - mW / 2 + eps)
      const overlapZ = (candZ - activeD / 2 < mZ + mD / 2 - eps) && (candZ + activeD / 2 > mZ - mD / 2 + eps)

      if (overlapX && overlapZ) {
        collided = true
        const pushes = [
          { dir: 'south', target: mZ + (mD + activeD) / 2, dist: Math.abs(candZ - (mZ + (mD + activeD) / 2)) },
          { dir: 'north', target: mZ - (mD + activeD) / 2, dist: Math.abs(candZ - (mZ - (mD + activeD) / 2)) },
          { dir: 'east', target: mX + (mW + activeW) / 2, dist: Math.abs(candX - (mX + (mW + activeW) / 2)) },
          { dir: 'west', target: mX - (mW + activeW) / 2, dist: Math.abs(candX - (mX - (mW + activeW) / 2)) }
        ].filter((push) => !axis || (axis === 'x' ? push.dir === 'east' || push.dir === 'west' : push.dir === 'north' || push.dir === 'south'))
        pushes.sort((a, b) => a.dist - b.dist)
        const best = pushes[0]
        if (best.dir === 'north' || best.dir === 'south') {
          candZ = best.target
          if (!axis && Math.abs(candX - mX) < 1.5) candX = mX
        } else {
          candX = best.target
          if (!axis && Math.abs(candZ - mZ) < 1.2) candZ = mZ
        }
      }
    }
    if (!collided) break
  }

  return { x: clean(candX), y: elevation, z: clean(candZ) }
}

export function useCircuitEditor(canvas: Ref<HTMLCanvasElement | undefined>, manager: () => Manager | undefined) {
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), ui = useUiStore()
  let gesture: MoveGesture | PanGesture | TransformGesture | ControlGesture | ZoomAreaGesture | null = null
  // A pose only: never a graph module, electrical identity or history entry.
  let placementDraft: PlacementDraft | null = null
  const dragging = ref<'move' | 'pan' | 'transform' | 'control' | 'zoom-area' | null>(null)
  const zoomAreaRect = ref<{ left: number; top: number; width: number; height: number } | null>(null)
  const hoveredHandle = ref<TransformHandle | null>(null)
  const hoveredControl = ref<SupplyControl | null>(null)
  const controlHint = computed(() => {
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
  function cancel() { workspace.cancelZoomArea(); cancelGesture() }
  function cancelPlacement() { cancel(); workspace.cancelPlacement(); clearPlacement(); workspace.editError = '' }
  function lostPointerCapture(event: PointerEvent) { if (gesture?.pointer === event.pointerId) { cancel(); clearPlacement() } }
  function contextMenu(event: MouseEvent) { event.preventDefault(); if (workspace.placementType) cancelPlacement(); else if (workspace.zoomAreaActive) cancel() }
  function areaCoordinates(event: PointerEvent) {
    const rect = canvas.value!.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || ![event.clientX, event.clientY].every(Number.isFinite)) return null
    return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }
  }
  function connect(endpoint: string) {
    if (workspace.tool !== 'wire') { workspace.setTool('wire'); workspace.pendingPort = endpoint; return }
    if (!workspace.pendingPort) workspace.pendingPort = endpoint
    else if (workspace.pendingPort === endpoint) workspace.pendingPort = null
    else attempt(() => { circuit.connectPorts(workspace.pendingPort!, endpoint); workspace.pendingPort = null })
  }
  function place(type: string, position: Position, rotation = 0) { attempt(() => { const id = circuit.placeModule(type, position, rotation); workspace.selectModule(id); clearPlacement(); sync() }) }
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
      else { const point = manager()!.groundPoint(x, y); if (point) place(workspace.placementType, snap(point, workspace.placementType)) }
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
        if (transform.handle === 'rotate-y') {
          const dx = point.x - transform.center.x, dz = point.z - transform.center.z
          if (Math.hypot(dx, dz) < 0.001) return
          const currentAngle = Math.atan2(-dz, dx)
          transform.angle += Math.atan2(Math.sin(currentAngle - transform.lastAngle), Math.cos(currentAngle - transform.lastAngle))
          transform.lastAngle = currentAngle
          const raw = transform.initialRotation + transform.angle * 180 / Math.PI
          transform.rotation = workspace.snap ? Math.round(raw / 15) * 15 : Math.round(raw * 100) / 100
          if (transform.target === 'placement' && placementDraft) {
            placementDraft.rotation = transform.rotation
            placementDraft.position = snap(transform.initial, placementDraft.type, null, transform.initial.y, placementDraft.rotation)
            showPlacement()
          } else manager()!.previewRotation(transform.id, transform.rotation)
        } else {
          point.sub(transform.anchor); point.x += transform.initial.x; point.z += transform.initial.z
          const type = transform.target === 'placement' ? placementDraft?.type : circuit.graph?.modules.find((m) => m.id === transform.id)?.type
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
      placementDraft ??= { type: workspace.placementType, position: { x: point.x, y: 0, z: point.z }, rotation: 0 }
      placementDraft.position = snap(point, placementDraft.type, null, placementDraft.position.y, placementDraft.rotation)
      showPlacement()
    }
  }
  function pointerUp(event: PointerEvent) {
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
    else if (completed.kind === 'pan' && !completed.dragged) workspace.clearSelection()
    sync()
  }
  function drop(event: DragEvent) {
    event.preventDefault(); cancelPlacement()
    const type = event.dataTransfer?.getData('application/x-netcircuit-component')
    if (!type || !getDefinition(type) || !manager() || !canvas.value) return
    const { x, y } = coordinates(event), point = manager()!.groundPoint(x, y)
    if (point) { ui.activeRibbonGroup = null; place(type, snap(point, type)); canvas.value.focus() }
  }
  function keydown(event: KeyboardEvent) {
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
  function pointerLeave() { if (!gesture) { hoveredHandle.value = null; hoveredControl.value = null; manager()?.clearGizmoHover() } }
  return { ports, selected, dragging, hoveredHandle, hoveredControl, controlHint, zoomAreaRect, updatePorts, sync, cancel, connect, pointerDown, pointerMove, pointerUp, pointerLeave, pointerCancel: lostPointerCapture, lostPointerCapture, contextMenu, drop, keydown, selectModule }
}
