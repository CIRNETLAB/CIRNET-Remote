import type { CircuitConnection, CircuitModule, WireControlPoint, WireIdentity, WireVisual } from '../types/circuit'
import { parseStructural } from '../contracts/structural'

export const JUMPER_COLORS = [
  { name: 'Black', value: '#24272a' }, { name: 'Gray', value: '#858b91' }, { name: 'White', value: '#e6e6de' },
  { name: 'Red', value: '#d8493f' }, { name: 'Brown', value: '#895c3a' }, { name: 'Orange', value: '#dc8737' },
  { name: 'Yellow', value: '#e2c444' }, { name: 'Green', value: '#3a9d58' },
  { name: 'Blue', value: '#397ec6' }, { name: 'Purple', value: '#8656a8' },
] as const
export const wireKey = (wire: WireIdentity): string => JSON.stringify([wire.source, wire.destination])
export const defaultWireVisual = (): WireVisual => ({ version: 1, color: '#71b3ce', routeMode: 'AUTO', controlPoints: [], thickness: .036, height: .03 })
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function validate(value: unknown, modules?: CircuitModule[]): void {
  const invalid = () => { throw new Error('Invalid wire visual routing data.') }
  if (!object(value) || !Number.isInteger(value.version) || (value.version as number) < 1) return invalid()
  if (value.version !== 1) return // Preserve future visual namespaces, render with a fallback.
  const visual = parseStructural('WireVisual', value, 'editor')
  if (visual.frameModuleId && modules && !modules.some(module => module.id === visual.frameModuleId)) return invalid()
  for (const point of visual.controlPoints) {
    if (point.space === 'module' && modules && !modules.some(module => module.id === point.moduleId)) return invalid()
  }
}
export function validateWireVisual(value: unknown, modules: CircuitModule[]): void { validate(value, modules) }
export function copyControlPoint(point: WireControlPoint): WireControlPoint { return { ...point, position: { ...point.position } } }
export function copyWireVisual(value: WireVisual): WireVisual { return { ...value, controlPoints: value.controlPoints.map(copyControlPoint) } }
export function readWireVisual(connection: CircuitConnection): WireVisual {
  const value = connection.metadata?.wireVisual
  try {
    validate(value)
    if ((value as WireVisual).version === 1) return copyWireVisual(value as WireVisual)
  } catch { /* Legacy/unknown visual metadata must never change electrical endpoints. */ }
  return defaultWireVisual()
}
