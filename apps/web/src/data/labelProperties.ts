import type { LabelPropertiesV1 } from '../contracts/generated/dto'
import { LabelPropertiesV1 as validLabelProperties } from '../contracts/generated/validators.structural.core.js'

export type { LabelPropertiesV1 } from '../contracts/generated/dto'
export const defaultLabelProperties: Readonly<LabelPropertiesV1> = Object.freeze({ version: 1, text: 'Hello', fontSizeMm: 3, textColor: '#20252A', backgroundColor: '#FAFAF7', paddingMm: 1 })

/** The generated validator counts Unicode codepoints and treats all text as data. */
export function validateLabelProperties(properties: unknown): string[] {
  return validLabelProperties(properties) ? [] : ['Use plain text up to 256 characters and four lines, a font size from 2 to 6 mm, and six-digit colors.']
}

/** Defaults belong to each new note; module position/rotation remain its only pose. */
export function normalizeLabelProperties(properties: Record<string, unknown> = {}): LabelPropertiesV1 {
  const result = { ...defaultLabelProperties, ...properties }
  const errors = validateLabelProperties(result)
  if (errors.length) throw new Error(errors.join(' '))
  return result as LabelPropertiesV1
}
