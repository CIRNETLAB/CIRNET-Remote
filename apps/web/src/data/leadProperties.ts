/** Frontend-only projection settings. They never change a footprint or net. */
export type LeadForm = 'straight' | 'formed90' | 'offset-s'
export interface LeadProperties { leadForm: LeadForm; leadLengthMm: number; bodyLiftMm: number }
export const defaultLeadProperties: Readonly<LeadProperties> = Object.freeze({ leadForm: 'formed90', leadLengthMm: 0, bodyLiftMm: 0 })
export const leadPropertyBounds = { leadLengthMm: { min: 0, max: 4 }, bodyLiftMm: { min: 0, max: 6 } } as const
export type LeadQuantityKey = keyof typeof leadPropertyBounds

export function isLeadEditableType(type: string): boolean {
  return ['RESISTOR_AXIAL', 'CAPACITOR_CERAMIC', 'CAPACITOR_ELECTROLYTIC'].includes(type)
}

/** Empty and nonfinite input is rejected, never silently converted to zero. */
export function parseLeadQuantity(value: unknown, key: LeadQuantityKey): number {
  const match = typeof value === 'string' ? /^\s*([+]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(?:mm)?\s*$/i.exec(value) : null
  const quantity = typeof value === 'number' ? value : match ? Number(match[1]) : NaN
  const { min, max } = leadPropertyBounds[key]
  if (!Number.isFinite(quantity) || quantity < min || quantity > max) throw new Error(`${key === 'leadLengthMm' ? 'Extra lead length' : 'Body lift'} must be between ${min} and ${max} mm.`)
  return quantity
}

/** Validate present fields; omitted fields preserve the original formed leads. */
export function validateLeadProperties(type: string, properties: Record<string, unknown>): string[] {
  if (!isLeadEditableType(type)) return []
  const errors: string[] = []
  if ('leadForm' in properties && (typeof properties.leadForm !== 'string' || !['straight', 'formed90', 'offset-s'].includes(properties.leadForm))) errors.push('Choose Straight, 90° formed or Offset/S-bend.')
  for (const key of ['leadLengthMm', 'bodyLiftMm'] as const) {
    if (!(key in properties)) continue
    const value = properties[key], bounds = leadPropertyBounds[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < bounds.min || value > bounds.max) errors.push(`${key} must be a finite number between ${bounds.min} and ${bounds.max} mm.`)
  }
  if (properties.leadForm === 'straight' && typeof properties.leadLengthMm === 'number' && properties.leadLengthMm !== 0) errors.push('Straight leads cannot include extra slack while their endpoints remain fixed.')
  return errors
}

export function normalizeLeadProperties(type: string, properties: Record<string, unknown> | undefined): Record<string, unknown> {
  const clone = (value: unknown): unknown => Array.isArray(value) ? value.map(clone) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value
  const result = properties ? clone(properties) as Record<string, unknown> : {}
  const errors = validateLeadProperties(type, result)
  if (errors.length) throw new Error(errors.join(' '))
  return result
}

/** Resolve visual defaults without adding them to a saved graph. */
export function readLeadProperties(properties: Record<string, unknown> | undefined): LeadProperties {
  return { leadForm: (properties?.leadForm ?? defaultLeadProperties.leadForm) as LeadForm, leadLengthMm: Number(properties?.leadLengthMm ?? defaultLeadProperties.leadLengthMm), bodyLiftMm: Number(properties?.bodyLiftMm ?? defaultLeadProperties.bodyLiftMm) }
}
