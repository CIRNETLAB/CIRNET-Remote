import { validateLeadProperties } from './leadProperties'
import { ComponentDesignPropertiesV1 } from '../contracts/generated/validators.structural.core.js'
import { getPartForType } from './partCatalog'
import { validParameterValue } from './componentParameters'
import { normalizeLabelProperties, validateLabelProperties } from './labelProperties'
/** Design properties are SI numbers. This module has no execution/profile dependency. */
export type EngineeringUnit = 'ohm' | 'F' | 'W' | 'V' | 'A' | '%'
export interface QuantityBounds { min?: number; max?: number; exclusiveMin?: boolean }
export const componentPropertyBounds = {
  resistanceOhms: { min: .1, max: 1e9 }, powerWatts: { min: .001, max: 100 }, tolerancePercent: { min: .001, max: 20 },
  capacitanceFarads: { min: 1e-12, max: 1 }, voltageRatingVolts: { min: .1, max: 10000 },
} as const

const suffixExponents: Record<EngineeringUnit, Record<string, number>> = {
  ohm: { '': 0, 'Ω': 0, 'Ω': 0, ohm: 0, ohms: 0, Ohm: 0, Ohms: 0, 'kΩ': 3, 'kΩ': 3, kohm: 3, kohms: 3, kOhm: 3, 'KΩ': 3, 'MΩ': 6, 'MΩ': 6, Mohm: 6, Mohms: 6, MOhm: 6 },
  F: { '': 0, F: 0, pF: -12, nF: -9, uF: -6, 'µF': -6, 'μF': -6, mF: -3 },
  W: { '': 0, W: 0, mW: -3, kW: 3 },
  V: { '': 0, V: 0, mV: -3, kV: 3 },
  A: { '': 0, A: 0, mA: -3, uA: -6, 'µA': -6, 'μA': -6, nA: -9 },
  '%': { '': 0, '%': 0 },
}

/** Blank strings, unsupported/mismatched units and nonfinite numbers are errors. */
export function parseEngineeringQuantity(value: unknown, unit: EngineeringUnit, bounds: QuantityBounds = {}): number {
  let result: number
  if (typeof value === 'number') result = value
  else if (typeof value === 'string') {
    const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:[eE]([+-]?\d+))?\s*([^\d\s].*?)?\s*$/.exec(value)
    if (!match) throw new Error('Enter a finite numeric value.')
    const suffix = (match[3] ?? '').replace(/\s+/g, '')
    const power = suffixExponents[unit][suffix]
    if (power === undefined) throw new Error(`Use a supported ${unit === 'ohm' ? 'Ω, kΩ or MΩ' : unit} unit.`)
    // Parse a decimal exponent directly so 100 nF stores the same SI number as 1e-7.
    result = Number(`${match[1]}e${Number(match[2] ?? 0) + power}`)
  } else throw new Error('Enter a finite numeric value.')
  if (!Number.isFinite(result)) throw new Error('Enter a finite numeric value.')
  if (result < (bounds.min ?? -Infinity) || result > (bounds.max ?? Infinity)) throw new Error(`Value must be between ${bounds.min ?? '-∞'} and ${bounds.max ?? '∞'} ${unit}.`)
  if (bounds.exclusiveMin && result <= (bounds.min ?? -Infinity)) throw new Error(`Value must be greater than ${bounds.min} ${unit}.`)
  return result
}

const propertyKeys = (type: string): (keyof typeof componentPropertyBounds)[] => type === 'RESISTOR_AXIAL'
  ? ['resistanceOhms', 'powerWatts', 'tolerancePercent']
  : type === 'CAPACITOR_CERAMIC' || type === 'CAPACITOR_ELECTROLYTIC' ? ['capacitanceFarads', 'voltageRatingVolts'] : []

/** Validate present canonical fields; omitted legacy fields resolve from the descriptor defaults. */
export function validateComponentProperties(type: string, properties: Record<string, unknown>): string[] {
  if (type === 'LABEL') return validateLabelProperties({ ...normalizeLabelProperties(), ...properties })
  if (type.startsWith('GENERIC_') && getPartForType(type)) {
    const errors = ComponentDesignPropertiesV1(properties) ? [] : ['Invalid component design properties. Use finite SI values and the declared Type and color options.']
    const part = getPartForType(type)
    for (const parameter of part?.editor.parameters ?? []) if (parameter.key in properties && !validParameterValue(parameter, properties[parameter.key])) errors.push(`Invalid ${parameter.label}.`)
    if (type === 'GENERIC_CAPACITOR' && properties.capacitorType !== undefined && properties.capacitorType !== 'CERAMIC'
      || type === 'GENERIC_CAPACITOR_ELECTROLYTIC' && properties.capacitorType !== undefined && properties.capacitorType !== 'ELECTROLYTIC') errors.push('Capacitor Type must match its package.')
    return errors
  }
  return propertyKeys(type).flatMap(key => {
    if (!(key in properties)) return []
    const value = properties[key], bounds = componentPropertyBounds[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= bounds.min && value <= bounds.max ? [] : [`${key} must be a finite SI number between ${bounds.min} and ${bounds.max}.`]
  })
}

/** Decimal exponent shifting preserves the exact shortest SI token on untouched Update. */
export function engineeringInput(value: number, exponent = 0): string {
  const [mantissa = '', originalExponent = '0'] = String(value).split(/[eE]/)
  const sign = mantissa.startsWith('-') ? '-' : ''
  const unsigned = mantissa.replace(/^[+-]/, ''), point = unsigned.indexOf('.')
  const digits = unsigned.replace('.', ''), offset = (point < 0 ? digits.length : point) + Number(originalExponent) - exponent
  return sign + (offset <= 0 ? '0.' + '0'.repeat(-offset) + digits : offset >= digits.length ? digits + '0'.repeat(offset - digits.length) : digits.slice(0, offset) + '.' + digits.slice(offset)).replace(/^0+(?=\d)/, '')
}

/** The sole legacy resistance key migration, called at load/update/API boundaries. */
export function normalizeComponentProperties(type: string, properties: Record<string, unknown> | undefined): Record<string, unknown> {
  // Enumerating JSON data also accepts reactive proxies, unlike structuredClone.
  // Keep numeric NaN/Infinity intact until validation instead of JSON-coercing to null.
  const clone = (value: unknown): unknown => Array.isArray(value) ? value.map(clone)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value
  const result = properties ? clone(properties) as Record<string, unknown> : {}
  if (type === 'LABEL') return { ...normalizeLabelProperties(result) }
  if (type === 'RESISTOR_AXIAL' && 'resistance_ohm' in result) {
    if (!('resistanceOhms' in result)) result.resistanceOhms = result.resistance_ohm
    delete result.resistance_ohm
  }
  const errors = [...validateComponentProperties(type, result), ...validateLeadProperties(type, result)]
  if (errors.length) throw new Error(errors.join(' '))
  return result
}

export type ResistorBandColor = 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'violet' | 'grey' | 'white' | 'gold' | 'silver'
export type FiveBandResistorCode = { ok: true; digits: [number, number, number]; multiplierExponent: number; tolerancePercent: number; bands: [ResistorBandColor, ResistorBandColor, ResistorBandColor, ResistorBandColor, ResistorBandColor] } | { ok: false; reason: string }
const digitColors: ResistorBandColor[] = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white']
const toleranceColors: Record<number, ResistorBandColor> = { 1: 'brown', 2: 'red', .5: 'green', .25: 'blue', .1: 'violet', .05: 'grey', 5: 'gold', 10: 'silver' }

/** Never round a design value to manufacture a misleading painted resistance. */
export function fiveBandResistorCode(resistanceOhms: number, tolerancePercent = 1): FiveBandResistorCode {
  if (!Number.isFinite(resistanceOhms) || resistanceOhms <= 0) return { ok: false, reason: 'Resistance must be positive; 0 Ω requires a separate jumper component.' }
  const [mantissa = '', exponentText = '0'] = resistanceOhms.toExponential().split('e')
  const significant = mantissa.replace('.', '').replace(/0+$/, '')
  if (significant.length > 3) return { ok: false, reason: 'This value has no exact three-significant-digit five-band code; the design value is preserved.' }
  const multiplierExponent = Number(exponentText) - 2
  const multiplierColor = multiplierExponent === -2 ? 'silver' : multiplierExponent === -1 ? 'gold' : digitColors[multiplierExponent]
  if (!multiplierColor) return { ok: false, reason: 'This resistance is outside the supported five-band multiplier range; the design value is preserved.' }
  const toleranceColor = toleranceColors[tolerancePercent]
  if (!toleranceColor) return { ok: false, reason: 'This tolerance has no supported color band; the design tolerance is preserved.' }
  const digits = significant.padEnd(3, '0').split('').map(Number) as [number, number, number]
  return { ok: true, digits, multiplierExponent, tolerancePercent, bands: [digitColors[digits[0]]!, digitColors[digits[1]]!, digitColors[digits[2]]!, multiplierColor, toleranceColor] }
}
