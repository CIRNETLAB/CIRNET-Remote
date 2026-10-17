import type { CircuitGraph } from '../../types/circuit'
import { contractIssue, ContractValidationError, parseStructural } from '../../contracts/structural'
import { validateWireVisual } from '../../wires/wireVisual'
import { parseEndpoint, resolveEndpoint } from '../../electrical/endpoints'
import { getBreadboardTopology } from '../../electrical/BreadboardTopology'
import { validateMountBindings } from '../../electrical/mounting'
import { getPartForType } from '../../data/partCatalog'
import { normalizeComponentProperties } from '../../data/componentProperties'
import { validateMemoryImage } from './memoryImage'
import { parseDocumentJson } from './json'
import { validateSignalDomains } from '../../electrical/signalDomains'
import {withCircuitModules} from './graphVersion'

export const MAX_CIRCUIT_FILE_BYTES = 2_000_000

/** Legacy property aliases are migrated explicitly after structural validation. */
export function normalizeCircuitDocument(graph: CircuitGraph): CircuitGraph {
  return withCircuitModules(graph,graph.modules.map(module => module.properties === undefined ? module : {
    ...module, properties: normalizeComponentProperties(module.type, module.properties),
  }))
}

/** Editor safety is separate from structural acceptance and execution permission. */
export function validateCircuitDocument(graph: CircuitGraph): void {
  validateSignalDomains('CircuitGraph',graph,'editor')
  const ids = new Set(graph.modules.map(module => module.id))
  if (ids.size !== graph.modules.length) contractIssue('Module IDs must be unique.', '/modules', 'DUPLICATE_MODULE_ID', 'editor')
  validateMountBindings(graph)
  for (const [index, module] of graph.modules.entries()) {
    if (module.type === 'MEMORY' && module.properties?.memory !== undefined) validateMemoryImage(module.properties.memory)
    if (module.position && !Object.values(module.position).every(Number.isFinite) || module.rotation !== undefined && !Number.isFinite(module.rotation)) {
      contractIssue('Editor geometry must be finite.', `/modules/${index}`, 'NONFINITE_GEOMETRY', 'editor')
    }
  }
  for (const [index, connection] of graph.connections.entries()) {
    if (!ids.has(connection.source.split('.')[0]) || !ids.has(connection.destination.split('.')[0])) contractIssue('Connection references a missing module.', `/connections/${index}`, 'DANGLING_MODULE', 'editor')
    if (connection.metadata?.wireVisual !== undefined) validateWireVisual(connection.metadata.wireVisual, graph.modules)
    for (const serialized of [connection.source, connection.destination]) {
      const parsed = parseEndpoint(serialized), module = graph.modules.find(item => item.id === parsed?.moduleId)
      if (parsed?.kind === 'contact' && module && getBreadboardTopology(module.type) && !resolveEndpoint(graph.modules, serialized)) contractIssue('Connection references an unknown breadboard contact.', `/connections/${index}`, 'UNKNOWN_CONTACT', 'editor')
      if (module && getPartForType(module.type) && !resolveEndpoint(graph.modules, serialized)) contractIssue('Connection references an unknown physical pin.', `/connections/${index}`, 'UNKNOWN_PIN', 'editor')
    }
  }
}

export function parseCircuitFile(contents: string): CircuitGraph {
  if (new TextEncoder().encode(contents).length > MAX_CIRCUIT_FILE_BYTES) throw new Error('Circuit file is too large (maximum 2 MB).')
  let value: unknown
  try { value = parseDocumentJson(contents) }
  catch (error) {
    if (error instanceof ContractValidationError) throw error
    throw new Error('Open a valid Circuit Graph JSON file.')
  }
  const graph = normalizeCircuitDocument(parseStructural('AnySupportedCircuitGraph', value, 'editor'))
  validateCircuitDocument(graph)
  return graph
}
