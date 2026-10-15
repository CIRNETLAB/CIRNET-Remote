import { computed, onUnmounted, shallowRef, watch, type Ref } from 'vue'
import type { createSceneManager, WireEditPick } from '../three/SceneManager'
import type { CircuitConnection, CircuitGraph, Point3, WireControlPoint, WireIdentity, WireRouteMode, WireVisual } from '../types/circuit'
import { useCircuitStore } from '../stores/circuit'
import { useWorkspaceStore } from '../stores/workspace'
import { resolveEndpoint } from '../electrical/endpoints'
import { copyWireVisual, defaultWireVisual, readWireVisual, wireKey } from '../wires/wireVisual'
import { controlPointWorld, endpointLeadPosition, pointDistance, snapWirePoint, solveWireRoute, type SolvedWireRoute } from '../wires/wireRouting'
import { dragWireSegment, insertWireBend, materializeWireRoute, moveWireBend, normalizeWireVisual, removeWireBend } from '../wires/wireRouteEditing'
import { automaticWireLayer } from '../wires/wireStacking'
import { MIN_WIRE_DIAMETER } from '../wires/wireAppearance'

type Manager = ReturnType<typeof createSceneManager>
type CornerState = { kind: 'none' } | { kind: 'provisional'; controlIndex: number; anchor: WireControlPoint; screenOrigin: { x: number; y: number }; travel: 'within-threshold' | 'away' }
interface DrawingDraft { source: string; frameModuleId: string | null; visual: WireVisual; cursor: Point3 | null; hovered: string | null; corner: CornerState }
interface WireEditGesture {
  pointer: number; circuitId: string | null; graph: CircuitGraph; connection: CircuitConnection; wire: WireIdentity
  hit: WireEditPick; route: SolvedWireRoute; initial: WireVisual; visual: WireVisual
  start: { x: number; y: number }; anchor: Point3; dragged: boolean
}

export function useWireRouting(canvas: Ref<HTMLCanvasElement | undefined>, manager: () => Manager | undefined) {
  const circuit = useCircuitStore(), workspace = useWorkspaceStore(), draft = shallowRef<DrawingDraft | null>(null)
  const edit = shallowRef<WireEditGesture | null>(null), lastSegment = shallowRef<WireEditPick | null>(null)
  const selectedConnection = computed(() => circuit.graph?.connections.find(c => workspace.selectedWire && wireKey(c) === wireKey(workspace.selectedWire)) ?? null)
  const coordinates = (event: { clientX: number; clientY: number }) => {
    const rect = canvas.value?.getBoundingClientRect()
    return rect && rect.width > 0 && rect.height > 0 ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null
  }
  const consume = (event: { preventDefault?(): void; stopPropagation?(): void; stopImmediatePropagation?(): void }) => { event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.() }
  const preview = () => {
    const state = draft.value
    if (state) manager()?.previewWireDrawing({ source: state.source, destination: state.hovered ?? '' }, state.visual, state.cursor)
  }
  function cancelEdit() {
    const state = edit.value
    edit.value = null
    if (state) {
      manager()?.previewWireVisual(state.wire, null); manager()?.lockPointer(false)
      if (canvas.value?.hasPointerCapture(state.pointer)) canvas.value.releasePointerCapture(state.pointer)
    }
    manager()?.hoverWireEdit(null)
  }
  function cancel() {
    cancelEdit(); lastSegment.value = null; workspace.selectedWireBend = null
    draft.value = null; workspace.pendingPort = null
    manager()?.clearWireDrawing(); manager()?.setWireDrawingActive(false); manager()?.hoverEndpoint(null)
  }
  function connect(endpoint: string) {
    const resolved = circuit.graph && resolveEndpoint(circuit.graph.modules, endpoint)
    if (!resolved) { workspace.editError = 'Choose a known port or breadboard contact.'; return }
    if (workspace.tool !== 'wire') workspace.setTool('wire')
    canvas.value?.focus()
    if (!draft.value) {
      workspace.selectModule(null); workspace.selectedWireBend = null
      workspace.pendingPort = endpoint; workspace.editError = ''
      draft.value = { source: endpoint, frameModuleId: resolved.endpoint.kind === 'contact' ? resolved.module.id : null,
        visual: { ...defaultWireVisual(), thickness: MIN_WIRE_DIAMETER, color: workspace.wireColor, routeMode: workspace.wireRouteMode }, cursor: null, hovered: null, corner: { kind: 'none' } }
      manager()?.setWireDrawingActive(true); manager()?.highlight(null); manager()?.hoverEndpoint(endpoint)
      const scene = manager(), source = scene?.wireContext.endpoint(endpoint)
      if (scene && source) {
        const lead = endpointLeadPosition(source, draft.value.visual, scene.wireContext)
        draft.value = { ...draft.value, cursor: pointDistance(lead, source.position) > 1e-8 ? lead : { ...lead, y: lead.y + .1 } }
        preview()
      }
    } else if (draft.value.source === endpoint) workspace.editError = 'Choose a different endpoint, or press Esc to cancel.'
    else {
      try {
        const state = draft.value, route = manager() ? solveWireRoute({ source: state.source, destination: endpoint }, state.visual, manager()!.wireContext) : null
        const wire = { source: state.source, destination: endpoint }, visual = normalizeWireVisual(route ? materializeWireRoute(state.visual, route) : state.visual)
        if (manager() && circuit.graph) visual.layer = automaticWireLayer(wire, visual, circuit.graph.connections, manager()!.wireContext)
        circuit.connectEndpoints(state.source, endpoint, visual)
        cancel(); workspace.editError = ''
      }
      catch (error) { workspace.editError = error instanceof Error ? error.message : 'Wire connection failed.' }
    }
  }
  function routingPoint(x: number, y: number, bypass: boolean): WireControlPoint | null {
    const state = draft.value, scene = manager()
    if (!state || !scene) return null
    // A board may provide the drawing plane without owning a bend outside its surface.
    const owner = scene.wireSupportModule(x, y)
    const point = scene.wireRoutingPoint(x, y, owner?.id ?? state.frameModuleId, state.visual)
    return point ? snapWirePoint(point, owner, workspace.snap, bypass) : null
  }
  function pointerDown(event: PointerEvent): boolean {
    if (event.button === 2 && draft.value) {
      consume(event); canvas.value?.focus()
      const p = coordinates(event), scene = manager()
      const point = p && routingPoint(p.x, p.y, event.altKey)
      if (point && scene) {
        const state = draft.value, visual = copyWireVisual(state.visual), world = controlPointWorld(point, scene.wireContext)!
        const last = state.corner.kind === 'provisional' && state.corner.controlIndex === visual.controlPoints.length - 1 ? state.corner : null
        const previousWorld = last && controlPointWorld(last.anchor, scene.wireContext)
        const sameSnap = previousWorld && pointDistance(previousWorld, world) < 1e-5
        const smallMotion = last && last.travel === 'within-threshold' && Math.hypot(p!.x - last.screenOrigin.x, p!.y - last.screenOrigin.y) < 4
        let corner: CornerState = { kind: 'none' }
        if (last && (sameSnap || smallMotion)) visual.controlPoints.pop()
        else {
          const previous = visual.controlPoints.at(-1), previousPoint = previous && controlPointWorld(previous, scene.wireContext)
          if (!previousPoint || pointDistance(previousPoint, world) > 1e-5) {
            visual.controlPoints.push(point)
            corner = { kind: 'provisional', controlIndex: visual.controlPoints.length - 1, anchor: point, screenOrigin: p!, travel: 'within-threshold' }
          }
        }
        draft.value = { ...state, visual, corner, cursor: world, frameModuleId: state.frameModuleId ?? (point.space === 'module' ? point.moduleId : null), hovered: null }
        preview()
      }
      return true
    }
    if (event.button === 2 && edit.value) { consume(event); cancelEdit(); return true }
    if (edit.value) { consume(event); return true }
    if (event.button !== 0 || workspace.placementType || workspace.zoomAreaActive) return false
    const p = coordinates(event), scene = manager()
    if (!p || !scene) return false
    // Socket/port clicks start or finish wiring even beside an already selected route.
    const endpoint = workspace.tool === 'wire' ? scene.pickEndpoint(p.x, p.y) : null
    if (endpoint) { consume(event); connect(endpoint.endpoint); return true }
    if (!draft.value && selectedConnection.value && ['select', 'wire'].includes(workspace.tool)) {
      const connection = selectedConnection.value, hit = scene.pickWireEdit(p.x, p.y, connection), route = scene.wireRoute(connection)
      if (hit && route && circuit.graph && canvas.value) {
        const initial = materializeWireRoute(readWireVisual(connection), route), anchor = scene.wireRoutingPoint(p.x, p.y, route.frameModuleId, initial, hit.point.y)
        if (anchor) {
          consume(event); canvas.value.focus(); workspace.selectedWireBend = hit.kind === 'bend' ? hit.index : null
          lastSegment.value = hit.kind === 'segment' ? hit : null
          edit.value = { pointer: event.pointerId, circuitId: circuit.activeId, graph: circuit.graph, connection, wire: { source: connection.source, destination: connection.destination }, hit, route, initial, visual: initial, start: p, anchor, dragged: false }
          scene.lockPointer(true); scene.hoverWireEdit(hit); canvas.value.setPointerCapture(event.pointerId); return true
        }
      }
      workspace.selectedWireBend = null
    }
    if (workspace.tool !== 'wire') return false
    if (!draft.value) return false
    consume(event); canvas.value?.focus()
    pointerMove(event)
    return true
  }
  function pointerMove(event: PointerEvent): boolean {
    if (edit.value) {
      const state = edit.value, p = coordinates(event), scene = manager()
      if (event.pointerId !== state.pointer || !p || !scene) return true
      if (!state.dragged && Math.hypot(p.x - state.start.x, p.y - state.start.y) < 4) return true
      const world = scene.wireRoutingPoint(p.x, p.y, state.route.frameModuleId, state.initial, state.hit.point.y)
      if (!world) return true
      state.dragged = true
      const original = state.hit.kind === 'bend' ? state.initial.controlPoints[state.hit.index] : null
      const ownerId = original?.space === 'module' ? original.moduleId : state.hit.kind === 'segment' ? state.route.frameModuleId : null
      const pose = ownerId ? scene.wireContext.modulePose(ownerId) : null
      const base = state.hit.basePoint ?? state.hit.point
      const offset = { x: state.hit.point.x - base.x, y: state.hit.point.y - base.y, z: state.hit.point.z - base.z }
      const point = snapWirePoint({ x: world.x - offset.x, y: world.y - offset.y, z: world.z - offset.z }, pose, workspace.snap, event.altKey)
      if (state.hit.kind === 'bend') {
        if (original) point.position.y = original.position.y
        state.visual = moveWireBend(state.initial, state.hit.index, point)
      }
      else {
        const snappedWorld = controlPointWorld(point, scene.wireContext)!
        state.visual = dragWireSegment(state.initial, state.route, state.hit.index, { x: snappedWorld.x - state.anchor.x + offset.x, y: 0, z: snappedWorld.z - state.anchor.z + offset.z }, scene.wireContext)
      }
      scene.previewWireVisual(state.wire, state.visual); return true
    }
    if (!draft.value && selectedConnection.value && ['select', 'wire'].includes(workspace.tool)) {
      const p = coordinates(event), scene = manager()
      if (p && scene) {
        const endpoint = workspace.tool === 'wire' ? scene.pickEndpoint(p.x, p.y) : null
        scene.hoverEndpoint(endpoint?.endpoint ?? null)
        if (endpoint) { scene.hoverWireEdit(null); return true }
        const hit = scene.pickWireEdit(p.x, p.y, selectedConnection.value)
        if (hit?.kind === 'segment') lastSegment.value = hit
        scene.hoverWireEdit(hit)
        if (hit) return true
      }
    }
    if (workspace.tool !== 'wire' || workspace.placementType || workspace.zoomAreaActive) return false
    const p = coordinates(event), scene = manager()
    if (!p || !scene) return false
    const hit = scene.pickEndpoint(p.x, p.y)
    scene.hoverEndpoint(hit?.endpoint ?? null)
    const wireHit = !hit && !draft.value ? scene.pick(p.x, p.y) : null
    scene.hoverWire(wireHit?.kind === 'wire' ? wireHit : null)
    if (draft.value) {
      const point = routingPoint(p.x, p.y, event.altKey)
      const world = point ? controlPointWorld(point, scene.wireContext) : null
      let corner = draft.value.corner
      if (corner.kind === 'provisional' && Math.hypot(p.x - corner.screenOrigin.x, p.y - corner.screenOrigin.y) >= 4) corner = { ...corner, travel: 'away' }
      draft.value = { ...draft.value, corner, cursor: world ?? draft.value.cursor, hovered: hit?.endpoint !== draft.value.source ? hit?.endpoint ?? null : null }
      preview()
    }
    return true
  }
  function keydown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && (draft.value || edit.value)) { consume(event); cancel(); return true }
    if (!draft.value) {
      if (!event.ctrlKey && !event.metaKey && ['Backspace', 'Delete'].includes(event.key) && workspace.selectedWireBend !== null && selectedConnection.value) { consume(event); removeSelectedBend(); return true }
      return false
    }
    if (!event.ctrlKey && !event.metaKey && ['Backspace', 'Delete'].includes(event.key)) {
      consume(event)
      const visual = copyWireVisual(draft.value.visual); visual.controlPoints.pop()
      draft.value = { ...draft.value, visual, corner: { kind: 'none' } }; preview(); return true
    }
    return false
  }
  function pointerUp(event: PointerEvent): boolean {
    if (!edit.value) return false
    if (event.pointerId !== edit.value.pointer) return true
    pointerMove(event)
    const state = edit.value
    edit.value = null; manager()?.lockPointer(false)
    if (canvas.value?.hasPointerCapture(state.pointer)) canvas.value.releasePointerCapture(state.pointer)
    manager()?.previewWireVisual(state.wire, null)
    if (state.dragged && state.circuitId === circuit.activeId && circuit.graph === state.graph && selectedConnection.value === state.connection) {
      const route = manager() && solveWireRoute(state.wire, state.visual, manager()!.wireContext)
      const unchanged = route && route.points.length === state.route.points.length && route.points.every((point, index) => pointDistance(point, state.route.points[index]) < 1e-7)
      try { if (route && !unchanged) circuit.updateWireVisual(state.wire, normalizeWireVisual(state.visual)); workspace.editError = '' }
      catch (error) { workspace.editError = error instanceof Error ? error.message : 'Wire route edit failed.' }
    }
    return true
  }
  function setColor(color: string) {
    if (!/^#[\da-f]{6}$/i.test(color)) { workspace.editError = 'Choose a valid jumper color.'; return }
    cancelEdit(); workspace.wireColor = color
    if (!draft.value && selectedConnection.value) circuit.updateWireVisual(selectedConnection.value, { ...readWireVisual(selectedConnection.value), color })
  }
  function setRouteMode(routeMode: WireRouteMode) {
    if (!['FREE', 'ORTHOGONAL', 'AUTO'].includes(routeMode)) return
    cancelEdit(); workspace.wireRouteMode = routeMode
    if (!draft.value && selectedConnection.value) circuit.updateWireVisual(selectedConnection.value, { ...readWireVisual(selectedConnection.value), routeMode })
  }
  function setStackLayer(action: 'up' | 'down' | 'top') {
    cancelEdit()
    const wire = selectedConnection.value, scene = manager()
    if (!wire || draft.value || !scene || !circuit.graph) return
    const graph = circuit.graph
    const { stack, index, target } = stackMove(action)
    if (target === index) return
    stack.splice(index, 1); stack.splice(target, 0, wire)
    const changes = new Map(stack.map((connection, layer) => [wireKey(connection), layer]))
    // One atomic visual-only command; ties elsewhere use stable creation order.
    circuit.commitGraph({ ...graph, connections: graph.connections.map(connection => {
      const layer = changes.get(wireKey(connection))
      return layer === undefined ? connection : { ...connection, metadata: { ...connection.metadata, wireVisual: { ...readWireVisual(connection), layer } } }
    }) })
  }
  function orderedPeers() {
    const wire = selectedConnection.value, scene = manager(), graph = circuit.graph
    if (!wire || !scene || !graph) return []
    const keys = new Set([wireKey(wire), ...scene.wireOrderPeers(wire, true).map(wireKey)])
    return graph.connections.filter(connection => keys.has(wireKey(connection))).sort((a, b) => (readWireVisual(a).layer ?? 0) - (readWireVisual(b).layer ?? 0) || graph.connections.indexOf(a) - graph.connections.indexOf(b))
  }
  function stackMove(action: 'up' | 'down' | 'top') {
    const wire = selectedConnection.value, stack = orderedPeers(), index = wire ? stack.indexOf(wire) : -1
    const neighbors = new Set(wire ? manager()?.wireOrderPeers(wire).map(wireKey) ?? [] : [])
    const candidates = stack.map((peer, at) => neighbors.has(wireKey(peer)) ? at : -1)
    const target = action === 'down' ? candidates.filter(at => at >= 0 && at < index).at(-1) ?? index : action === 'up' ? candidates.find(at => at > index) ?? index : candidates.filter(at => at > index).at(-1) ?? index
    return { stack, index, target }
  }
  function selectNextStackWire() {
    const wire = selectedConnection.value, scene = manager()
    if (!wire || draft.value || !scene || !circuit.graph) return
    const stack = orderedPeers().reverse()
    const next = stack[(stack.findIndex(candidate => wireKey(candidate) === wireKey(wire)) + 1) % stack.length]
    if (next && next !== wire) { cancelEdit(); workspace.selectWire(next.source, next.destination) }
  }
  function removeSelectedBend() {
    cancelEdit()
    const wire = selectedConnection.value, index = workspace.selectedWireBend, route = wire && manager()?.wireRoute(wire)
    if (wire && route && index !== null) circuit.updateWireVisual(wire, removeWireBend(materializeWireRoute(readWireVisual(wire), route), index))
    workspace.selectedWireBend = null
  }
  function addBend() {
    cancelEdit()
    const wire = selectedConnection.value, hit = lastSegment.value, scene = manager(), route = wire && scene?.wireRoute(wire)
    if (!wire || !hit || hit.kind !== 'segment' || !scene || !route || wireKey(hit.wire) !== wireKey(wire)) return
    const pose = route.frameModuleId ? scene.wireContext.modulePose(route.frameModuleId) : null
    const point = snapWirePoint(hit.basePoint ?? hit.point, pose, workspace.snap, false)
    const visual = readWireVisual(wire)
    circuit.updateWireVisual(wire, insertWireBend(visual, route, hit.index, point))
  }
  function doubleClick(event: MouseEvent): boolean {
    if (draft.value || workspace.placementType || workspace.zoomAreaActive || !['select', 'wire'].includes(workspace.tool)) return false
    const p = coordinates(event), scene = manager()
    if (!p || !scene || !selectedConnection.value) return false
    const hit = scene.pickWireEdit(p.x, p.y, selectedConnection.value)
    if (hit?.kind !== 'segment') return false
    consume(event); lastSegment.value = hit; addBend(); return true
  }
  watch(() => [workspace.tool, workspace.placementType, workspace.zoomAreaActive], () => cancel(), { flush: 'sync' })
  watch(() => circuit.graph, () => cancel(), { deep: true, flush: 'sync' })
  watch(() => workspace.selectedWire, wire => { if (edit.value && (!wire || wireKey(wire) !== wireKey(edit.value.wire))) cancelEdit() }, { flush: 'sync' })
  watch(() => [workspace.wireColor, workspace.wireRouteMode], () => {
    if (draft.value) { draft.value = { ...draft.value, visual: { ...draft.value.visual, color: workspace.wireColor, routeMode: workspace.wireRouteMode } }; preview() }
  })
  onUnmounted(cancel)
  return {
    connect, cancel, pointerDown, pointerMove, pointerUp, keydown, setColor, setRouteMode, setStackLayer, selectNextStackWire, addBend, removeSelectedBend, doubleClick,
    lostPointerCapture(event: PointerEvent) { if (edit.value?.pointer !== event.pointerId) return false; cancelEdit(); return true },
    contextMenu(event: MouseEvent) { if (!draft.value && !edit.value) return false; consume(event); if (!draft.value) cancelEdit(); return true },
    pointerLeave() { manager()?.hoverEndpoint(null); if (!edit.value) manager()?.hoverWireEdit(null) },
    drawing: computed(() => !!draft.value), editing: computed(() => !!edit.value),
    controlPoints: computed(() => draft.value?.visual.controlPoints ?? []),
    color: computed(() => draft.value?.visual.color ?? (selectedConnection.value ? readWireVisual(selectedConnection.value).color : workspace.wireColor)),
    routeMode: computed(() => draft.value?.visual.routeMode ?? (selectedConnection.value ? readWireVisual(selectedConnection.value).routeMode : workspace.wireRouteMode)),
    layer: computed(() => selectedConnection.value ? readWireVisual(selectedConnection.value).layer ?? 0 : 0),
    canStack: computed(() => !draft.value && !!selectedConnection.value),
    canLowerStack: computed(() => { const state = stackMove('down'); return state.target !== state.index }),
    canRaiseStack: computed(() => { const state = stackMove('up'); return state.target !== state.index }),
    canCycleStack: computed(() => !draft.value && orderedPeers().length > 1),
    canAdd: computed(() => !draft.value && !!selectedConnection.value && lastSegment.value?.kind === 'segment'),
    canRemove: computed(() => !draft.value && !!selectedConnection.value && workspace.selectedWireBend !== null),
    hint: computed(() => draft.value ? 'Right: add corner; repeat here to undo · Left: finish at hole/port · Backspace: undo corner · Alt: no snap · Esc: cancel' : selectedConnection.value ? 'Drag a user bend or segment · Double-click: add an anchor · Alt: no snap' : 'Left-click a hole or port · Free: draw your own path'),
  }
}
