import { isSafeNumber, parse } from 'lossless-json'
import { contractIssue, type ValidationProfile } from '../../contracts/structural'

/** Inspect the original numeric token before JSON parsing can round its digits. */
export function parseDocumentJson(text: string, profile: ValidationProfile = 'editor'): unknown {
  return parse(text, null, value => {
    if (!isSafeNumber(value)) contractIssue('Numeric literal cannot be represented without losing precision.', '', 'NUMERIC_PRECISION', profile)
    return Number(value)
  })
}
