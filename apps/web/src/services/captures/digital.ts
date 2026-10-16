import type { CaptureMetadata, CaptureResult, DigitalObservation } from '../../types/lab'
import { isRecord } from '../../types/api'
import { ApiError } from '../api/client'
import { capturesApi } from '../api/captures'
import { captureLayout } from '../../contracts/generated/captureLayout'
import { parseCaptureHeader } from '../../domain/capture/json'

const MAX_HEADER = captureLayout.max_header_bytes, MAX_EVENTS = captureLayout.digital_v1.max_events, MAX_CHANNELS = captureLayout.digital_v1.max_channels
const PREFIX_BYTES = captureLayout.prefix.byte_length, EVENT_BYTES = captureLayout.digital_v1.record_bytes
function corrupt(): never { throw new ApiError(0, 'CAPTURE_CORRUPT', 'Capture payload is corrupt or does not match its metadata.') }

function headerObject(text: string): Record<string, unknown> {
  const value = parseCaptureHeader(text,true)
  if (!isRecord(value)) return corrupt()
  if (Object.keys(value).length !== 4 || !['encoding', 'signals', 'sample_count', 'duration_ns'].every(key => Object.hasOwn(value, key))) return corrupt()
  return value
}

export function decodeDigitalCapture(binary: ArrayBuffer, metadata: CaptureMetadata): CaptureResult {
  try {
    if (!(binary instanceof ArrayBuffer) || binary.byteLength < PREFIX_BYTES || binary.byteLength > PREFIX_BYTES + MAX_HEADER + MAX_EVENTS * EVENT_BYTES
      || binary.byteLength !== metadata.payload_byte_count || metadata.instrument !== 'logic_analyzer' || metadata.encoding !== 'digital_events' || !metadata.available) return corrupt()
    const view = new DataView(binary)
    if (view.getUint32(0, false) !== Number.parseInt(captureLayout.prefix.magic_hex,16) || view.getUint8(captureLayout.prefix.version_offset) !== captureLayout.digital_v1.version) return corrupt()
    const size = view.getUint32(captureLayout.prefix.header_length_offset, true)
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
      const channel = view.getUint16(offset+captureLayout.digital_v1.channel_offset, true), timestamp = view.getBigUint64(offset + captureLayout.digital_v1.time_offset, true), value = view.getUint8(offset + captureLayout.digital_v1.value_offset)
      if (channel >= signals.length || timestamp > BigInt(duration) || ![0,1,captureLayout.digital_v1.unknown_value_code].includes(value)) return corrupt()
      samples.push({ signal: signals[channel] as string, time_ns: Number(timestamp), value: value === captureLayout.digital_v1.unknown_value_code ? 'X' : value as 0 | 1 })
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
