import type { CircuitModule, ElectricalEndpoint } from '../types/circuit'
import { getDefinition, type LogicalPort } from '../data/editorCatalog'
import { getBreadboardContact } from './BreadboardTopology'
import { getPartForType } from '../data/partCatalog'

export interface ResolvedEndpoint {
  endpoint: ElectricalEndpoint
  serialized: string
  module: CircuitModule
  nodeKey: string
  direction: LogicalPort['direction'] | null
  width: number
  pinRole?: string
}
export function parseEndpoint(value: string): ElectricalEndpoint | null {
  const parts = value.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return parts[1].startsWith('contact:')
    ? parts[1].length > 8 ? { kind: 'contact', moduleId: parts[0], contactId: parts[1].slice(8) } : null
    : { kind: 'port', moduleId: parts[0], portId: parts[1] }
}
export function formatEndpoint(endpoint: ElectricalEndpoint): string {
  return `${endpoint.moduleId}.${endpoint.kind === 'contact' ? 'contact:' + endpoint.contactId : endpoint.portId}`
}
export function resolveEndpoint(modules: CircuitModule[], value: string): ResolvedEndpoint | null {
  const endpoint = parseEndpoint(value), module = endpoint && modules.find(m => m.id === endpoint.moduleId)
  if (!endpoint || !module) return null
  if (endpoint.kind === 'contact') {
    const contact = getBreadboardContact(module.type, endpoint.contactId)
    return contact ? { endpoint, serialized: value, module, nodeKey: JSON.stringify([module.id, 'node', contact.nodeId]), direction: null, width: 1 } : null
  }
  const part = getPartForType(module.type)
  if (part) {
    const pin = part.package.pins.find(p => p.id === endpoint.portId)
    return pin ? { endpoint, serialized: value, module, nodeKey: JSON.stringify([module.id, 'pin', pin.id]), direction: null, width: 1, pinRole: pin.role } : null
  }
  const port = getDefinition(module.type)?.ports.find(p => p.id === endpoint.portId)
  return port ? { endpoint, serialized: value, module, nodeKey: JSON.stringify([module.id, 'port', port.id]), direction: port.direction, width: port.width ?? 1 } : null
}
