import type { CircuitGraph, CircuitModule, Point3 } from '../types/circuit'
import type { EditorSelection } from './selection'
import { buildMoveSelectionCandidate, MoveCandidateError, type MoveCandidate } from './batchCommands'
import { moduleLocalToWorld, moduleWorldPose, worldToModuleLocal } from '../electrical/modulePose'
import { getBreadboardTopology } from '../electrical/BreadboardTopology'
import { parseEndpoint } from '../electrical/endpoints'
import { clipboardContactWorld as contactWorld, selectionModulePosition as positionOf } from './selectionContacts'

export interface SelectionMoveState {
  active: boolean
  valid: boolean
  message: string
  candidate: MoveCandidate | null
  delta: Point3
}

export interface SelectionMoveScene {
  groundPoint(x: number, y: number, elevation?: number): Point3 | null
  wireSupportModule(x: number, y: number): CircuitModule | null
  pickEndpoint(x: number, y: number): { endpoint: string } | null
  hoverEndpoint(endpoint: string | null): void
  setSelectionPreview(graph: CircuitGraph, selection: EditorSelection, valid: boolean): void
  clearSelectionPreview(): void
}

export interface SelectionMoveControllerOptions {
  graph: () => CircuitGraph | null
  scene: () => SelectionMoveScene | undefined
  snap: () => boolean
  onCommit: (candidate: MoveCandidate) => void
  onError?: (message: string) => void
}

export function createSelectionMoveController(options: SelectionMoveControllerOptions) {
  let active = false
  let valid = false
  let message = ''
  let candidate: MoveCandidate | null = null
  let currentDelta: Point3 = { x: 0, y: 0, z: 0 }
  let snapshotGraph: CircuitGraph | null = null
  let snapshotSelection: EditorSelection | null = null
  let anchorPoint: Point3 = { x: 0, y: 0, z: 0 }
  let anchorContact: string | undefined = undefined
  let committing = false

  const getState = (): SelectionMoveState => ({
    active,
    valid,
    message,
    candidate,
    delta: { ...currentDelta },
  })

  function clearPreview() {
    const scene = options.scene()
    scene?.clearSelectionPreview()
    scene?.hoverEndpoint(null)
  }

  function cancel() {
    active = false
    valid = false
    message = ''
    candidate = null
    currentDelta = { x: 0, y: 0, z: 0 }
    snapshotGraph = null
    snapshotSelection = null
    anchorContact = undefined
    committing = false
    clearPreview()
  }

  function start(selection: EditorSelection): boolean {
    cancel()
    const graph = options.graph()
    if (!graph || (!selection.moduleIds.length && !selection.wires.length)) return false

    snapshotGraph = graph
    snapshotSelection = {
      moduleIds: [...selection.moduleIds],
      wires: [...selection.wires.map(w => ({ ...w }))],
    }

    // Determine anchor
    const mountedModule = graph.modules.find(m => selection.moduleIds.includes(m.id) && m.mount)
    if (mountedModule && mountedModule.mount?.contacts.length) {
      anchorContact = `${mountedModule.mount.boardId}.contact:${mountedModule.mount.contacts[0].contactId}`
      const c = contactWorld(graph.modules, anchorContact)
      anchorPoint = c.world
    } else if (selection.moduleIds.length) {
      const firstModule = graph.modules.find(m => m.id === selection.moduleIds[0])!
      anchorPoint = positionOf(moduleWorldPose(firstModule, graph.modules))
    } else {
      const firstWire = graph.connections.find(c => selection.wires.some(w => w.source === c.source && w.destination === c.destination))
      if (firstWire) {
        const ep = parseEndpoint(firstWire.source)
        if (ep?.kind === 'contact') {
          anchorContact = firstWire.source
          anchorPoint = contactWorld(graph.modules, anchorContact).world
        }
      }
    }

    active = true
    currentDelta = { x: 0, y: 0, z: 0 }

    try {
      candidate = buildMoveSelectionCandidate(graph, snapshotSelection, currentDelta)
      valid = true
      message = ''
      options.scene()?.setSelectionPreview(candidate.graph, candidate.selection, true)
    } catch (err) {
      valid = false
      message = err instanceof Error ? err.message : String(err)
      if (err instanceof MoveCandidateError) {
        options.scene()?.setSelectionPreview(err.previewGraph, err.selection, false)
      }
    }

    return true
  }

  function updateCandidate(delta: Point3) {
    if (!active || !snapshotGraph || !snapshotSelection) return false
    currentDelta = delta
    try {
      candidate = buildMoveSelectionCandidate(snapshotGraph, snapshotSelection, delta)
      valid = true
      message = ''
      options.scene()?.setSelectionPreview(candidate.graph, candidate.selection, true)
      return true
    } catch (err) {
      valid = false
      message = err instanceof Error ? err.message : String(err)
      options.onError?.(message)
      if (err instanceof MoveCandidateError) {
        options.scene()?.setSelectionPreview(err.previewGraph, err.selection, false)
      }
      return false
    }
  }

  function pointerMove(screenX: number, screenY: number, altKey = false): boolean {
    if (!active || !snapshotGraph || !snapshotSelection) return false
    const scene = options.scene()
    if (!scene) return true

    if (anchorContact) {
      const picked = scene.pickEndpoint(screenX, screenY)?.endpoint
      let endpoint = picked && parseEndpoint(picked)?.kind === 'contact' ? picked : undefined
      const board = scene.wireSupportModule(screenX, screenY)
      const topology = board && getBreadboardTopology(board.type)
      const cursor = board && topology ? scene.groundPoint(screenX, screenY, (board.position?.y ?? 0) + topology.contacts[0].localPosition[1]) : scene.groundPoint(screenX, screenY, anchorPoint.y)

      if (!endpoint && board && cursor) {
        const topology = getBreadboardTopology(board.type)!
        const local = worldToModuleLocal(cursor, board)
        const nearest = [...topology.contacts].sort((a, b) =>
          Math.hypot(a.localPosition[0] - local.x, a.localPosition[2] - local.z) -
          Math.hypot(b.localPosition[0] - local.x, b.localPosition[2] - local.z)
        )[0]
        if (nearest && Math.hypot(nearest.localPosition[0] - local.x, nearest.localPosition[2] - local.z) <= topology.pitch * 0.72) {
          endpoint = `${board.id}.contact:${nearest.contactId}`
        }
      }

      scene.hoverEndpoint(endpoint ?? null)

      if (endpoint) {
        const targetContactWorld = contactWorld(snapshotGraph.modules, endpoint).world
        const delta: Point3 = {
          x: targetContactWorld.x - anchorPoint.x,
          y: 0,
          z: targetContactWorld.z - anchorPoint.z,
        }
        updateCandidate(delta)
      } else {
        const rawDelta: Point3 = cursor ? {
          x: cursor.x - anchorPoint.x,
          y: 0,
          z: cursor.z - anchorPoint.z,
        } : { x: 0, y: 0, z: 0 }
        updateCandidate(rawDelta)
        valid = false
        message = 'Move the group onto declared breadboard contacts.'
        options.onError?.(message)
        if (candidate) {
          scene.setSelectionPreview(candidate.graph, candidate.selection, false)
        }
      }
    } else {
      const point = scene.groundPoint(screenX, screenY, anchorPoint.y)
      if (point) {
        const grid = options.snap() && !altKey ? 0.5 : 0.01
        const delta: Point3 = {
          x: Math.round((point.x - anchorPoint.x) / grid) * grid,
          y: 0,
          z: Math.round((point.z - anchorPoint.z) / grid) * grid,
        }
        updateCandidate(delta)
      } else {
        valid = false
        message = 'Move the group onto the visible work plane.'
        options.onError?.(message)
        if (candidate) {
          scene.setSelectionPreview(candidate.graph, candidate.selection, false)
        }
      }
    }

    return true
  }

  function confirm(): boolean {
    if (!active || !valid || !candidate || committing) return false
    committing = true
    try {
      options.onCommit(candidate)
      cancel()
      return true
    } finally {
      committing = false
    }
  }

  return {
    getState,
    isActive: () => active,
    isValid: () => valid,
    getMessage: () => message,
    getCandidate: () => candidate,
    getDelta: () => currentDelta,
    start,
    pointerMove,
    confirm,
    cancel,
  }
}
export type SelectionMoveController = ReturnType<typeof createSelectionMoveController>
