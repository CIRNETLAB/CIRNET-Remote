import { computed, onUnmounted, shallowRef, watch, type Ref } from 'vue'
import type { createSceneManager } from '../three/SceneManager'
import type { CircuitGraph, Point3, WireIdentity } from '../types/circuit'
import { useCircuitStore } from '../stores/circuit'
import { useWorkspaceStore } from '../stores/workspace'
import { buildPasteCandidate, PasteCandidateError, type PasteCandidate, type PasteOptions } from '../editor/batchCommands'
import { captureSelectionClipboard, type SelectionClipboard } from '../editor/selectionClipboard'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { worldToModuleLocal } from '../electrical/modulePose'
import { parseEndpoint } from '../electrical/endpoints'
import { readWireVisual, wireKey } from '../wires/wireVisual'
import { buildSelectionGhostRoutes, graphWireRouteContext, type SelectionGhostRoute } from '../three/SelectionGhostRoutes'
import { createSelectionMoveController, type SelectionMoveState } from '../editor/SelectionMoveController'
import { solveFeasibleWireRoute } from '../wires/wireFeasibility'

type Manager = ReturnType<typeof createSceneManager>
type ContextTarget = WireIdentity | { moduleId: string }
export interface SelectionContextMenuState { x: number; y: number; circuitId: string; wire?: WireIdentity }
interface ClipboardSession { circuitId: string; snapshot: SelectionClipboard }
export interface SelectionDuplicatePreviewState {
  active: boolean; valid: boolean; message: string
  candidate: (PasteCandidate & { wire: WireIdentity }) | null
}
const inactive = (): SelectionDuplicatePreviewState => ({ active: false, valid: false, message: '', candidate: null })
const inactiveMove = (): SelectionMoveState => ({ active: false, valid: false, message: '', candidate: null, delta: { x: 0, y: 0, z: 0 } })
const consume = (event: { preventDefault?(): void; stopPropagation?(): void; stopImmediatePropagation?(): void }) => { event.preventDefault?.(); event.stopPropagation?.(); event.stopImmediatePropagation?.() }

/** The only clipboard, duplicate-preview and batch-command owner for an editor. */
export function useSelectionCommands(canvas: Ref<HTMLCanvasElement | undefined>, manager: () => Manager | undefined, busy: () => boolean) {
  const circuit = useCircuitStore(), workspace = useWorkspaceStore()
  const clipboard = shallowRef<ClipboardSession | null>(null), contextMenuState = shallowRef<SelectionContextMenuState | null>(null)
  const duplicatePreviewState = shallowRef<SelectionDuplicatePreviewState>(inactive())
  const movePreviewState = shallowRef<SelectionMoveState>(inactiveMove())
  let committing = false, ownGraph: CircuitGraph | null = null, pressedPointer: number | null = null
  let previewOptions: PasteOptions = {}
  const assertWireGeometry=(candidate:PasteCandidate)=>{
    const context=graphWireRouteContext(()=>candidate.graph),keys=new Set(candidate.selection.wires.map(wireKey))
    for(const connection of candidate.graph.connections){
      if(!candidate.selection.moduleIds.length&&!keys.has(wireKey(connection)))continue
      if(!solveFeasibleWireRoute(connection,readWireVisual(connection),candidate.graph.connections,context))throw Error('The selected wire route has insufficient bend clearance.')
    }
  }

  const moveController = createSelectionMoveController({
    graph: () => circuit.graph,
    scene: () => manager(),
    snap: () => workspace.snap,
    onCommit: (candidate) => {
      committing = true
      try {
        assertWireGeometry(candidate)
        circuit.moveSelection(candidate.selection, candidate.delta)
        ownGraph = circuit.graph
        workspace.setSelection(candidate.selection)
        workspace.editError = ''
      } catch (error) {
        workspace.editError = error instanceof Error ? error.message : String(error)
      } finally {
        committing = false
      }
    },
    onError: (msg) => {
      workspace.editError = msg
    },
  })

  const hasClipboard = () => !!clipboard.value && clipboard.value.circuitId === circuit.activeId && !!circuit.graph
  const commandsAvailable = () => !busy() && !workspace.placementType && !workspace.zoomAreaActive && !workspace.marqueeActive && !movePreviewState.value.active
  const canPaste = computed(() => {
    if (!hasClipboard()) return false
    try { buildPasteCandidate(circuit.graph!, clipboard.value!.snapshot); return true } catch { return false }
  })
  const closeContextMenu = () => { contextMenuState.value = null }
  const report = (error: unknown) => error instanceof Error ? error.message : 'The selected group cannot be pasted here.'
  function clearPreview() { manager()?.clearSelectionPreview(); manager()?.clearWireDuplicate(); manager()?.hoverEndpoint(null) }
  function cancelDuplicatePreview() {
    duplicatePreviewState.value = inactive(); previewOptions = {}; pressedPointer = null; clearPreview()
    workspace.editError = ''
  }
  function cancelMovePreview() {
    moveController.cancel()
    movePreviewState.value = moveController.getState()
    pressedPointer = null
    workspace.editError = ''
  }
  function commitMovePreview(): boolean {
    if (!movePreviewState.value.active || !movePreviewState.value.valid) return false
    try{if(movePreviewState.value.candidate)assertWireGeometry(movePreviewState.value.candidate)}catch(error){workspace.editError=report(error);return false}
    const ok = moveController.confirm()
    movePreviewState.value = moveController.getState()
    return ok
  }
  function menuMove(): boolean {
    if (!circuit.graph || !workspace.selectionCount || !commandsAvailable()) { closeContextMenu(); return false }
    closeContextMenu(); cancelDuplicatePreview()
    const ok = moveController.start(workspace.selection)
    movePreviewState.value = moveController.getState()
    return ok
  }
  function openContextMenu(x: number, y: number, target?: ContextTarget): boolean {
    closeContextMenu()
    if (busy() || duplicatePreviewState.value.active || movePreviewState.value.active || workspace.placementType || workspace.zoomAreaActive || workspace.marqueeActive || !circuit.graph || !circuit.activeId || !Number.isFinite(x) || !Number.isFinite(y)) return false
    if (target && 'moduleId' in target) {
      if (!circuit.graph.modules.some(module => module.id === target.moduleId)) return false
      if (!workspace.selection.moduleIds.includes(target.moduleId)) workspace.selectModule(target.moduleId)
    } else if (target) {
      const wire = circuit.graph.connections.find(wire => wireKey(wire) === wireKey(target))
      if (!wire) return false
      if (!workspace.selection.wires.some(selected => wireKey(selected) === wireKey(wire))) workspace.selectWire(wire.source, wire.destination)
    } else {
      if (workspace.selectionCount) workspace.clearSelection()
    }
    if (!workspace.selectionCount && !canPaste.value) return false
    contextMenuState.value = { x, y, circuitId: circuit.activeId, ...(target && !('moduleId' in target) ? { wire: { source: target.source, destination: target.destination } } : {}) }
    workspace.editError = ''; return true
  }
  function renderCandidate(candidate: PasteCandidate, valid: boolean, fallbackRoutes?: SelectionGhostRoute[]) {
    const scene = manager()
    if (!scene) return
    if (!candidate.selection.moduleIds.length && candidate.selection.wires.length === 1) {
      scene.clearSelectionPreview()
      const wire = candidate.selection.wires[0], connection = candidate.graph.connections.find(connection => wireKey(connection) === wireKey(wire))
      const fallback = fallbackRoutes?.[0]
      if (fallback) scene.previewWireDuplicate(fallback.wire, fallback.visual, false, fallback.route)
      else if (connection) scene.previewWireDuplicate(wire, readWireVisual(connection), valid)
    } else { scene.clearWireDuplicate(); scene.setSelectionPreview(candidate.graph, candidate.selection, valid, fallbackRoutes) }
  }
  function showCandidate(options: PasteOptions = {}) {
    if (!hasClipboard()) return false
    previewOptions = options
    try {
      const candidate = buildPasteCandidate(circuit.graph!, clipboard.value!.snapshot, options)
      assertWireGeometry(candidate)
      const wire = candidate.selection.wires[0] ?? { source: '', destination: '' }
      duplicatePreviewState.value = { active: true, candidate: { ...candidate, wire }, valid: true, message: '' }
      workspace.editError = ''; renderCandidate(candidate, true); return true
    } catch (error) {
      const message = report(error)
      duplicatePreviewState.value = { active: true, candidate: null, valid: false, message }; workspace.editError = message
      if (error instanceof PasteCandidateError) renderCandidate({ graph: error.previewGraph, selection: error.selection, delta: error.delta }, false, buildSelectionGhostRoutes(error.snapshot, error.transformPoint))
      else {
        // Keep the most recent ghost visible, changing its validity through the
        // same renderer even when a contact cannot be mapped at the new cursor.
        const previous = manager()?.scene.getObjectByName('selection-duplicate-preview')
        if (previous) previous.userData.valid = false
      }
      return false
    }
  }
  function menuDuplicate(): boolean {
    const snapshot = circuit.graph && captureSelectionClipboard(circuit.graph, workspace.selection)
    if (!snapshot || !circuit.activeId || !commandsAvailable()) { closeContextMenu(); return false }
    clipboard.value = { circuitId: circuit.activeId, snapshot }; closeContextMenu(); showCandidate(); return true
  }
  function menuDelete(): boolean {
    if (!circuit.graph || !workspace.selectionCount || busy()) { closeContextMenu(); return false }
    try {
      committing = true; circuit.deleteSelection(workspace.selection); ownGraph = circuit.graph
      workspace.clearSelection(); closeContextMenu(); cancelDuplicatePreview(); return true
    } catch (error) { workspace.editError = report(error); closeContextMenu(); return false }
    finally { committing = false }
  }
  function paste(options: PasteOptions, repeatPreview: boolean): boolean {
    if (!hasClipboard() || committing || !commandsAvailable()) return false
    try {
      committing = true
      assertWireGeometry(buildPasteCandidate(circuit.graph!,clipboard.value!.snapshot,options))
      const result = circuit.pasteSelection(clipboard.value!.snapshot, options)
      ownGraph = circuit.graph
      const snapshot = captureSelectionClipboard(circuit.graph!, result.selection)!
      clipboard.value = { circuitId: circuit.activeId!, snapshot }
      workspace.setSelection(result.selection); workspace.editError = ''
      if (repeatPreview) showCandidate(); else cancelDuplicatePreview()
      return true
    } catch (error) { workspace.editError = report(error); if (repeatPreview) showCandidate(options); return false }
    finally { committing = false }
  }
  function menuPaste(): boolean { closeContextMenu(); return canPaste.value && paste({}, false) }
  function commitDuplicatePreview(): boolean { return duplicatePreviewState.value.active && duplicatePreviewState.value.valid && paste(previewOptions, true) }
  function previewPointerMove(event: PointerEvent): boolean {
    if (movePreviewState.value.active) {
      const rect = canvas.value?.getBoundingClientRect()
      if (!rect) return true
      const x = event.clientX - rect.left, y = event.clientY - rect.top
      moveController.pointerMove(x, y, event.altKey)
      movePreviewState.value = moveController.getState()
      const candidate=movePreviewState.value.candidate
      if(movePreviewState.value.valid&&candidate)try{assertWireGeometry(candidate)}catch(error){const message=report(error);movePreviewState.value={...movePreviewState.value,valid:false,message};workspace.editError=message;manager()?.setSelectionPreview(candidate.graph,candidate.selection,false)}
      return true
    }
    if (!duplicatePreviewState.value.active) return false
    const scene = manager(), rect = canvas.value?.getBoundingClientRect(), snapshot = clipboard.value?.snapshot
    if (!scene || !rect || !snapshot) return true
    const x = event.clientX - rect.left, y = event.clientY - rect.top
    if (snapshot.anchorContact) {
      const picked = scene.pickEndpoint(x, y)?.endpoint
      let endpoint = picked && parseEndpoint(picked)?.kind === 'contact' ? picked : undefined
      const board = scene.wireSupportModule(x, y), topology = board && getBreadboardTopology(board.type)
      const cursor = board && topology ? scene.groundPoint(x, y, (board.position?.y ?? 0) + topology.contacts[0].localPosition[1]) : scene.placementPoint(x, y)
      if (!endpoint && board && cursor) {
        const topology = getBreadboardTopology(board.type)!, local = worldToModuleLocal(cursor, board)
        const nearest = [...topology.contacts].sort((a, b) => Math.hypot(a.localPosition[0] - local.x, a.localPosition[2] - local.z) - Math.hypot(b.localPosition[0] - local.x, b.localPosition[2] - local.z))[0]
        if (nearest && Math.hypot(nearest.localPosition[0] - local.x, nearest.localPosition[2] - local.z) <= topology.pitch * .72) endpoint = `${board.id}.contact:${nearest.contactId}`
      }
      scene.hoverEndpoint(endpoint ?? null)
      if (endpoint) showCandidate({ targetContact: endpoint })
      else {
        const delta: Point3 = cursor ? { x: cursor.x - snapshot.anchor.x, y: cursor.y - snapshot.anchor.y, z: cursor.z - snapshot.anchor.z } : { x: 0, y: 0, z: 0 }
        showCandidate({ delta })
        const candidate = duplicatePreviewState.value.candidate
        if (candidate) renderCandidate(candidate, false)
        duplicatePreviewState.value = { active: true, candidate: null, valid: false, message: 'Move the group onto declared breadboard contacts.' }
        workspace.editError = duplicatePreviewState.value.message
      }
    } else {
      const point = scene.groundPoint(x, y, snapshot.anchor.y)
      if (point) {
        const grid = workspace.snap && !event.altKey ? .5 : .01
        showCandidate({ delta: { x: Math.round((point.x - snapshot.anchor.x) / grid) * grid, y: 0, z: Math.round((point.z - snapshot.anchor.z) / grid) * grid } })
      } else {
        const candidate = duplicatePreviewState.value.candidate
        if (candidate) renderCandidate(candidate, false)
        duplicatePreviewState.value = { active: true, candidate: null, valid: false, message: 'Move the group onto the visible work plane.' }
        workspace.editError = duplicatePreviewState.value.message
      }
    }
    return true
  }
  function duplicatePointerDown(event: PointerEvent): boolean {
    if (movePreviewState.value.active) {
      consume(event); canvas.value?.focus()
      if (event.button === 2) cancelMovePreview()
      else if (event.button === 0 && pressedPointer === null) { pressedPointer = event.pointerId; commitMovePreview() }
      return true
    }
    if (!duplicatePreviewState.value.active) return false
    consume(event); canvas.value?.focus()
    if (event.button === 2) cancelDuplicatePreview()
    else if (event.button === 0 && pressedPointer === null) { pressedPointer = event.pointerId; commitDuplicatePreview() }
    return true
  }
  function pointerUp(event: PointerEvent): boolean {
    if (pressedPointer !== event.pointerId) return false
    pressedPointer = null; consume(event); return true
  }
  function keydown(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && (duplicatePreviewState.value.active || movePreviewState.value.active || contextMenuState.value)) {
      consume(event); cancelDuplicatePreview(); cancelMovePreview(); closeContextMenu(); return true
    }
    if ((duplicatePreviewState.value.active || movePreviewState.value.active) && ['Delete', 'Backspace', 'r', 'R', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      consume(event); return true
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && ['d', 'c', 'v'].includes(event.key.toLowerCase())) {
      consume(event)
      if (!commandsAvailable()) return true
      if (event.key.toLowerCase() === 'd') menuDuplicate()
      else if (event.key.toLowerCase() === 'v') menuPaste()
      else if (circuit.graph && circuit.activeId) { const snapshot = captureSelectionClipboard(circuit.graph, workspace.selection); if (snapshot) clipboard.value = { circuitId: circuit.activeId, snapshot } }
      return true
    }
    return false
  }
  watch(() => circuit.activeId, () => { clipboard.value = null; ownGraph = null; cancelDuplicatePreview(); cancelMovePreview(); closeContextMenu() }, { flush: 'sync' })
  onUnmounted(() => { cancelDuplicatePreview(); cancelMovePreview(); closeContextMenu() })
  return {
    contextMenuState, canPaste, duplicatePreviewState, movePreviewState, openContextMenu, closeContextMenu,
    menuDelete, menuDuplicate, menuPaste, menuMove,
    cancelDuplicatePreview, commitDuplicatePreview, cancelMovePreview, commitMovePreview,
    previewPointerMove, duplicatePointerDown, pointerUp, keydown,
    isCommitting: () => committing,
    consumeDuplicateGraphChange(graph: CircuitGraph | null) { const own = !!graph && graph === ownGraph; ownGraph = null; return own },
  }
}
