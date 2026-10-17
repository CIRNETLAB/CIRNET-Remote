/** Authoring metadata shared by the palette, Inspector and property form. */
export interface ComponentParameter {
  key: string; label: string; kind: 'number' | 'integer' | 'boolean' | 'enum' | 'string' | 'color'
  min?: number; max?: number; exclusiveMin?: boolean; maxLength?: number; pattern?: string
  unit?: 'ohm' | 'F' | 'W' | 'V' | 'A' | '%'; advanced?: boolean
  options?: { value: string; label: string }[]
}
export function validParameterValue(parameter: ComponentParameter, value: unknown): boolean {
  if (parameter.kind === 'boolean') return typeof value === 'boolean'
  if (parameter.kind === 'enum' || parameter.kind === 'string' || parameter.kind === 'color') {
    return typeof value === 'string' && value.length <= (parameter.maxLength ?? 256)
      && (parameter.kind !== 'enum' || !!parameter.options?.some(option => option.value === value))
      && (!parameter.pattern || new RegExp(parameter.pattern).test(value))
      && (parameter.kind !== 'color' || value.length === 7 && /^#[0-9a-fA-F]{6}$/.test(value))
  }
  return typeof value === 'number' && Number.isFinite(value)
    && (parameter.kind !== 'integer' || Number.isInteger(value))
    && value >= (parameter.min ?? -Infinity) && value <= (parameter.max ?? Infinity)
    && (!parameter.exclusiveMin || value > (parameter.min ?? -Infinity))
}
