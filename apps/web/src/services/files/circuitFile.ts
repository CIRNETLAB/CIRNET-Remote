import type { CircuitGraph } from '../../types/circuit'
import { parseMemoryImage } from './memoryImage'
import { validateWireVisual } from '../../wires/wireVisual'
import { parseEndpoint, resolveEndpoint } from '../../electrical/endpoints'
import { getBreadboardTopology } from '../../electrical/BreadboardTopology'
import { validateMountBindings } from '../../electrical/mounting'
import { getPartForType } from '../../data/partCatalog'

export const MAX_CIRCUIT_FILE_BYTES = 2_000_000
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every((key) => allowed.includes(key))
const optionalObject = (value: unknown) => value === undefined || object(value)
const endpoint = (value: unknown) => text(value) && /^[^.]+\.[^.]+$/.test(value)

// Structural schema v1 guard. Logical/electrical validation remains on the API.
export function parseCircuitFile(contents: string): CircuitGraph {
  if (new TextEncoder().encode(contents).length > MAX_CIRCUIT_FILE_BYTES) throw new Error('Circuit file is too large (maximum 2 MB).')
  let value: unknown
  try { value = JSON.parse(contents) } catch { throw new Error('Open a valid Circuit Graph JSON file.') }
  const invalid = () => { throw new Error('File does not match Circuit Graph schema 1.0.') }
  if (!object(value) || !keys(value, ['schema_version', 'circuit_id', 'modules', 'connections', 'metadata']) || !['1.0', '1.1'].includes(String(value.schema_version)) || !text(value.circuit_id) || !Array.isArray(value.modules) || !Array.isArray(value.connections) || !optionalObject(value.metadata)) return invalid()
  for (const module of value.modules) {
    if (!object(module) || !text(module.id) || !text(module.type) || !optionalObject(module.properties)) return invalid()
    if (module.rotation !== undefined && (typeof module.rotation !== 'number' || !Number.isFinite(module.rotation))) return invalid()
    if (module.type === 'MEMORY' && object(module.properties) && module.properties.memory !== undefined) parseMemoryImage(JSON.stringify(module.properties.memory))
    if (module.position !== undefined) {
      if (!object(module.position) || !keys(module.position, ['x', 'y', 'z']) || !Object.values(module.position).every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) return invalid()
    }
  }
  const ids = new Set(value.modules.map((module) => module.id))
  if (ids.size !== value.modules.length) throw new Error('Module IDs must be unique.')
  validateMountBindings(value as unknown as CircuitGraph)
  for (const connection of value.connections) {
    if (!object(connection) || !keys(connection, ['source', 'destination', 'metadata']) || !endpoint(connection.source) || !endpoint(connection.destination) || !optionalObject(connection.metadata)) return invalid()
    if (!ids.has((connection.source as string).split('.')[0]) || !ids.has((connection.destination as string).split('.')[0])) throw new Error('Connection references a missing module.')
    const modules = value.modules as CircuitGraph['modules']
    if (connection.metadata && (connection.metadata as Record<string, unknown>).wireVisual !== undefined) validateWireVisual((connection.metadata as Record<string, unknown>).wireVisual, modules)
    for (const serialized of [connection.source, connection.destination] as string[]) {
      const parsed = parseEndpoint(serialized), module = modules.find(m => m.id === parsed?.moduleId)
      if (parsed?.kind === 'contact' && module && getBreadboardTopology(module.type) && !resolveEndpoint(modules, serialized)) throw new Error('Connection references an unknown breadboard contact.')
      if (module && getPartForType(module.type) && !resolveEndpoint(modules, serialized)) throw new Error('Connection references an unknown physical pin.')
    }
  }
  return value as unknown as CircuitGraph
}
