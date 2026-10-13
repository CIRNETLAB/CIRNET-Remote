import type { CaptureMetadata, CaptureResult, DigitalObservation } from '../../types/lab'
import { isRecord } from '../../types/api'
import { ApiError } from '../api/client'
import { capturesApi } from '../api/captures'

const MAX_HEADER = 65536, MAX_EVENTS = 100000, MAX_CHANNELS = 4096
const PREFIX_BYTES = 9, EVENT_BYTES = 11
function corrupt(): never { throw new ApiError(0, 'CAPTURE_CORRUPT', 'Capture payload is corrupt or does not match its metadata.') }

function headerObject(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!isRecord(value)) return corrupt()
  // JSON.parse otherwise silently accepts duplicate fields. Track top-level
  // member names while skipping strings, escapes and nested arrays/objects.
  const keys = new Set<string>(); let depth = 0
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (character === '"') {
      const start = index++
      for (; index < text.length; index++) {
        if (text[index] === '\\') index++
        else if (text[index] === '"') break
      }
      if (depth === 1 && text.slice(index + 1).trimStart().startsWith(':')) {
        const key = JSON.parse(text.slice(start, index + 1)) as string
        if (keys.has(key)) return corrupt()
        keys.add(key)
      }
    } else if (character === '{' || character === '[') depth++
    else if (character === '}' || character === ']') depth--
  }
  if (Object.keys(value).length !== 4 || !['encoding', 'signals', 'sample_count', 'duration_ns'].every(key => Object.hasOwn(value, key))) return corrupt()
  return value
}

export function decodeDigitalCapture(binary: ArrayBuffer, metadata: CaptureMetadata): CaptureResult {
  try {
    if (!(binary instanceof ArrayBuffer) || binary.byteLength < PREFIX_BYTES || binary.byteLength > PREFIX_BYTES + MAX_HEADER + MAX_EVENTS * EVENT_BYTES
      || binary.byteLength !== metadata.payload_byte_count || metadata.instrument !== 'logic_analyzer' || metadata.encoding !== 'digital_events' || !metadata.available) return corrupt()
    const view = new DataView(binary)
    if (view.getUint32(0, false) !== 0x4e434150 || view.getUint8(4) !== 1) return corrupt()
    const size = view.getUint32(5, true)
    if (size === 0 || size > MAX_HEADER || PREFIX_BYTES + size > binary.byteLength) return corrupt()
    const header = headerObject(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(binary, PREFIX_BYTES, size)))
    const signals = header.signals, count = header.sample_count, duration = header.duration_ns
    if (header.encoding !== 'digital_events' || !Array.isArray(signals) || signals.length > MAX_CHANNELS
      || signals.some(signal => typeof signal !== 'string' || !signal) || new Set(signals).size !== signals.length
      || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || count > MAX_EVENTS
      || typeof duration !== 'number' || !Number.isSafeInteger(duration) || duration < 0
      || binary.byteLength !== PREFIX_BYTES + size + count * EVENT_BYTES
      || count !== metadata.sample_count || duration !== metadata.duration_ns || signals.length !== metadata.channel_count
      || (metadata.signals && (metadata.signals.length !== signals.length || metadata.signals.some((signal, index) => signal !== signals[index])))) return corrupt()
    const samples: DigitalObservation[] = []
    for (let index = 0; index < count; index++) {
      const offset = PREFIX_BYTES + size + index * EVENT_BYTES
      const channel = view.getUint16(offset, true), timestamp = view.getBigUint64(offset + 2, true), value = view.getUint8(offset + 10)
      if (channel >= signals.length || timestamp > BigInt(duration) || value > 2) return corrupt()
      samples.push({ signal: signals[channel] as string, time_ns: Number(timestamp), value: value === 2 ? 'X' : value as 0 | 1 })
    }
    return { schema_version: '1.0', capture_id: metadata.capture_id, source: metadata.source, instrument: 'logic_analyzer', encoding: 'digital_events',
      available: true, duration_ns: duration, sample_count: count, samples }
  } catch (error) {
    if (error instanceof ApiError) throw error
    return corrupt()
  }
}

export async function loadDigitalCapture(metadata: CaptureMetadata, signal?: AbortSignal): Promise<CaptureResult> {
  const binary = await capturesApi.payload(metadata.capture_id, signal)
  const capture = decodeDigitalCapture(binary, metadata)
  if (metadata.sha256) {
    if (!globalThis.crypto?.subtle) throw new ApiError(0, 'CAPTURE_INTEGRITY_UNAVAILABLE', 'Capture integrity checking is unavailable in this browser.')
    const hash = await globalThis.crypto.subtle.digest('SHA-256', binary)
    const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
    if (hex !== metadata.sha256) return corrupt()
  }
  if (signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELLED', 'Request cancelled.')
  return capture
}
