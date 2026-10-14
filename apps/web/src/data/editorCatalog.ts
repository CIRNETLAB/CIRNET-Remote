import catalog from './editorCatalog.json'
import type { CircuitModule } from '../types/circuit'
export interface LogicalPort { id: string; direction: 'input' | 'output' | 'inout'; width?: number }
export interface ComponentParameter { key: string; label: string; kind: 'number' | 'integer' | 'boolean'; min?: number; max?: number }
export interface ComponentDefinition {
  type: string; name: string; family: string; visual: string; size: number[]; color: string
  ports: LogicalPort[]; defaults: Record<string, unknown>; parameters: ComponentParameter[]
  visualOnly?: boolean; metadataRef?: string; memoryContract?: string; partNumber?: string; breadboardTopologyRef?: string
}
export const componentCatalog = catalog.components as ComponentDefinition[]
export const getDefinition = (type: string) => componentCatalog.find((definition) => definition.type === type)
export function getPort(modules: CircuitModule[], endpoint: string) {
  const [id, name] = endpoint.split('.')
  const module = modules.find((module) => module.id === id)
  return module ? getDefinition(module.type)?.ports.find((port) => port.id === name) : undefined
}
export function validateProperties(type: string, properties: Record<string, unknown>) {
  const definition = getDefinition(type)
  if (!definition) throw new Error('This component has no editor configuration contract.')
  for (const parameter of definition.parameters) {
    const value = properties[parameter.key]
    if (parameter.kind === 'boolean' ? typeof value !== 'boolean' : typeof value !== 'number' || !Number.isFinite(value) || (parameter.kind === 'integer' && !Number.isInteger(value)) || value < (parameter.min ?? -Infinity) || value > (parameter.max ?? Infinity)) throw new Error(`Invalid ${parameter.label}.`)
  }
}
