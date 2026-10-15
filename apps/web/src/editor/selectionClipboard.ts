import type { CircuitConnection, CircuitGraph, CircuitModule, Point3 } from '../types/circuit'
import { parseEndpoint } from '../electrical/endpoints'
import { moduleWorldPose } from '../electrical/modulePose'
import { wireKey } from '../wires/wireVisual'
import { normalizeSelection, type EditorSelection } from './selection'
import { clipboardContactWorld as contactWorld, selectionModulePosition as positionOf } from './selectionContacts'

export const cloneClipboardData = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Only modules/connections are copied; sourceModules is immutable pose/reference context. */
export interface SelectionClipboard {
  modules: CircuitModule[]
  connections: CircuitConnection[]
  sourceModules: CircuitModule[]
  sourceConnections?: CircuitConnection[]
  anchor: Point3
  anchorContact?: string
}
export function captureSelectionClipboard(graph: CircuitGraph, selection: EditorSelection): SelectionClipboard | null {
  const normalized = normalizeSelection(graph, selection), selected = new Set(normalized.moduleIds), wires = new Set(normalized.wires.map(wireKey))
  if (!selected.size && !wires.size) return null
  const modules = cloneClipboardData(graph.modules.filter(module => selected.has(module.id)))
  const connections = cloneClipboardData(graph.connections.filter(wire => wires.has(wireKey(wire))))
  const sourceModules = cloneClipboardData(graph.modules)
  const externalMount = modules.find(module => module.mount && !selected.has(module.mount.boardId))?.mount
  const externalContact = connections.flatMap(wire => [wire.source, wire.destination]).find(value => {
    const endpoint = parseEndpoint(value)
    return endpoint?.kind === 'contact' && !selected.has(endpoint.moduleId)
  })
  const anchorContact = externalMount && externalMount.contacts[0] ? `${externalMount.boardId}.contact:${externalMount.contacts[0].contactId}` : externalContact
  const anchor = modules[0] ? positionOf(moduleWorldPose(modules[0], sourceModules)) : anchorContact ? contactWorld(sourceModules, anchorContact).world : { x: 0, y: 0, z: 0 }
  return { modules, connections, sourceModules, sourceConnections: cloneClipboardData(graph.connections), anchor, ...(anchorContact ? { anchorContact } : {}) }
}

