import type { CircuitModule, Point3, WireIdentity, WireVisual } from '../../types/circuit'
import type { MemoryImage } from '../../types/memory'
import { getDefinition, validateProperties } from '../../data/editorCatalog'
import { assertConnectionAllowed } from '../../electrical/nets'
import { copyWireVisual, validateWireVisual } from '../../wires/wireVisual'
import { moduleWorldPose } from '../../electrical/modulePose'
import { solveMounting } from '../../electrical/mounting'
import { getPartForType } from '../../data/partCatalog'
import { createMemoryImage, parseMemoryImage } from './memoryImage'
import { normalizeComponentProperties } from '../../data/componentProperties'
import { isLeadEditableType } from '../../data/leadProperties'
import { buildDeleteCandidate, buildMoveSelectionCandidate, buildPasteCandidate, type MoveCandidate, type PasteOptions } from '../../editor/batchCommands'
import { captureSelectionClipboard, type SelectionClipboard } from '../../editor/selectionClipboard'
import { emptyEditorSelection, type EditorSelection } from '../../editor/selection'

import { currentGraph,commitGraph,type EditorDocumentState } from './editorDocument'

export function captureSelection(state:EditorDocumentState, selection: EditorSelection): SelectionClipboard | null {
  const graph=currentGraph(state)
  return graph ? captureSelectionClipboard(graph, selection) : null
}
export function deleteSelection(state:EditorDocumentState, selection: EditorSelection): EditorSelection {
  const graph=currentGraph(state)
  if (graph) commitGraph(state, buildDeleteCandidate(graph, selection))
  return emptyEditorSelection()
}
export function pasteSelection(state:EditorDocumentState, snapshot: SelectionClipboard, options?: PasteOptions) {
  const graph=currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const candidate = buildPasteCandidate(graph, snapshot, options)
  commitGraph(state, candidate.graph)
  return candidate
}
export function moveSelection(state: EditorDocumentState, selection: EditorSelection, delta: Point3): MoveCandidate {
  const graph = currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const candidate = buildMoveSelectionCandidate(graph, selection, delta)
  commitGraph(state, candidate.graph)
  return candidate
}
export function placeModule(state:EditorDocumentState, type: string, position: Required<NonNullable<CircuitModule['position']>>, rotation = 0, initialProperties?: Record<string, unknown>): string {
  const graph=currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const definition = getDefinition(type)
  if (!definition) throw new Error('Placement metadata is unavailable for this type.')
  if (!Object.values(position).every(Number.isFinite)) throw new Error('Position must be finite.')
  if (!Number.isFinite(rotation)) throw new Error('Rotation must be finite.')
  const ids = new Set(graph.modules.map((module) => module.id))
  let serial = 1
  while (ids.has(`${type}_${serial}`)) serial++
  const id = `${type}_${serial}`
  const properties = { ...structuredClone(definition.defaults), ...normalizeComponentProperties(type, initialProperties) }
  validateProperties(type, properties)
  if (definition.memoryContract) properties.memory = createMemoryImage()
  const physical = getPartForType(type), candidate = physical ? solveMounting(type, position, rotation, graph.modules, id) : null
  if (candidate && !candidate.valid) throw new Error(candidate.reason)
  const module: CircuitModule = { id, type, ...(candidate ? { mount: candidate.mount } : { position: { ...position }, rotation: ((rotation % 360) + 360) % 360 }), properties }
  commitGraph(state, { ...graph, schema_version: physical ? '1.1' : graph.schema_version, modules: [...graph.modules, module] })
  return id
}
export function moveModule(state:EditorDocumentState, id: string, position: Required<NonNullable<CircuitModule['position']>>) {
  const graph=currentGraph(state)
  if (!Object.values(position).every(Number.isFinite)) throw new Error('Position must be finite.')
  if (!graph?.modules.some((module) => module.id === id)) return
  const module = graph.modules.find(m => m.id === id)!, world = moduleWorldPose(module, graph.modules)
  const candidate = getPartForType(module.type) ? solveMounting(module.type, position, world.rotation ?? 0, graph.modules, id) : null
  if (candidate && !candidate.valid) throw new Error(candidate.reason)
  const { mount: _mount, ...free } = module
  const next = candidate ? { ...free, position: undefined, rotation: undefined, mount: candidate.mount } : { ...free, position: { ...position }, rotation: world.rotation }
  commitGraph(state, { ...graph, modules: graph.modules.map(item => item.id === id ? next : item) })
}
export function rotateModule(state:EditorDocumentState, id: string, degrees = 90) {
  const graph=currentGraph(state)
  if (!Number.isFinite(degrees)) throw new Error('Rotation must be finite.')
  if (!graph?.modules.some((module) => module.id === id)) return
  const module = graph.modules.find(m => m.id === id)!, world = moduleWorldPose(module, graph.modules)
  const rotation = (((world.rotation ?? 0) % 360 + degrees % 360) % 360 + 360) % 360
  if (module.mount) {
    const candidate = solveMounting(module.type, world.position as Required<NonNullable<CircuitModule['position']>>, rotation, graph.modules, id)
    if (!candidate?.valid) throw new Error(candidate?.reason ?? 'This rotation does not fit the footprint.')
    commitGraph(state, { ...graph, modules: graph.modules.map(item => item.id === id ? { ...module, mount: candidate.mount } : item) })
  } else commitGraph(state, { ...graph, modules: graph.modules.map(item => item.id === id ? { ...item, rotation } : item) })
}
export function detachModule(state:EditorDocumentState, id: string) {
  const graph=currentGraph(state)
  const module = graph?.modules.find(m => m.id === id)
  if (!graph || !module?.mount) return
  const { mount: _mount, ...free } = moduleWorldPose(module, graph.modules)
  commitGraph(state, { ...graph, modules: graph.modules.map(item => item.id === id ? free : item) })
}
export function removeModule(state:EditorDocumentState, id: string) {
  const graph=currentGraph(state)
  if (!graph?.modules.some((module) => module.id === id)) return
  deleteSelection(state, { moduleIds: [id], wires: [] })
}
export function connectPorts(state:EditorDocumentState, first: string, second: string) {
  connectEndpoints(state, first, second)
}
export function connectEndpoints(state:EditorDocumentState, first: string, second: string, visual?: WireVisual) {
  const graph=currentGraph(state)
  if (!graph) throw new Error('Create a circuit first.')
  const { source, destination, reversed } = assertConnectionAllowed(graph, first, second)
  if (visual) validateWireVisual(visual, graph.modules)
  const copy = visual ? copyWireVisual(visual) : undefined
  if (copy && reversed) copy.controlPoints.reverse()
  commitGraph(state, { ...graph, connections: [...graph.connections, { source, destination, ...(copy ? { metadata: { wireVisual: copy } } : {}) }] })
}
export function updateWireVisual(state:EditorDocumentState, wire: WireIdentity, visual: WireVisual) {
  const graph=currentGraph(state)
  if (!graph) return
  if (!graph.connections.some(c => c.source === wire.source && c.destination === wire.destination)) return
  validateWireVisual(visual, graph.modules)
  const copy = copyWireVisual(visual)
  commitGraph(state, { ...graph, connections: graph.connections.map(c => c.source === wire.source && c.destination === wire.destination ? { ...c, metadata: { ...c.metadata, wireVisual: copy } } : c) })
}
export function disconnectPorts(state:EditorDocumentState, source: string, destination: string) {
  const graph=currentGraph(state)
  if (!graph?.connections.some(wire => wire.source === source && wire.destination === destination)) return
  deleteSelection(state, { moduleIds: [], wires: [{ source, destination }] })
}
export function updateModuleProperties(state:EditorDocumentState, id: string, patch: Record<string, unknown>) {
  const graph=currentGraph(state)
  const module = graph?.modules.find((module) => module.id === id)
  if (!module || !graph) return
  const definition = getDefinition(module.type)
  const normalizedPatch = normalizeComponentProperties(module.type, patch)
  if (Object.keys(normalizedPatch).some((key) => !definition?.parameters.some((parameter) => parameter.key === key) && !(isLeadEditableType(module.type) && ['leadForm', 'leadLengthMm', 'bodyLiftMm'].includes(key)))) throw new Error('Unsupported component parameter.')
  const properties = normalizeComponentProperties(module.type, { ...definition?.defaults, ...normalizeComponentProperties(module.type, module.properties), ...normalizedPatch })
  validateProperties(module.type, properties)
  commitGraph(state, { ...graph, modules: graph.modules.map((item) => item.id === id ? { ...item, properties } : item) })
}
export function setMemoryImage(state:EditorDocumentState, id: string, image: MemoryImage) {
  const graph=currentGraph(state)
  const module = graph?.modules.find((module) => module.id === id)
  if (!graph || !module || !getDefinition(module.type)?.memoryContract) throw new Error('Select a supported memory component.')
  const copy = parseMemoryImage(JSON.stringify(image))
  commitGraph(state, { ...graph, modules: graph.modules.map((item) => item.id === id ? { ...item, properties: { ...item.properties, memory: copy } } : item) })
}
