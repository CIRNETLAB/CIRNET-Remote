import type { MemoryImage } from '../../contracts/generated/dto'
import { contractIssue, ContractValidationError, parseStructural } from '../../contracts/structural'
import { parseDocumentJson } from './json'

export function validateMemoryImage(value: unknown): MemoryImage {
  const image = parseStructural('MemoryImage', value, 'editor')
  if (image.data.length !== image.depth) contractIssue('Memory image data length must equal depth.', '/data', 'MEMORY_DEPTH_MISMATCH', 'editor')
  return image
}

export function parseMemoryImage(text: string): MemoryImage {
  if (text.length > 4096) throw new Error('Memory image exceeds the local 256-byte contract.')
  let value: unknown
  try { value = parseDocumentJson(text) }
  catch (error) {
    if (error instanceof ContractValidationError) throw error
    throw new Error('Open a valid memory image JSON file.')
  }
  return validateMemoryImage(value)
}

export function createMemoryImage(depth = 32): MemoryImage {
  return validateMemoryImage({ version: '1.0', word_bits: 8, depth, data: Array(depth).fill(0) })
}
