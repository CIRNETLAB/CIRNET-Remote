import type { CaptureMetadata } from '../../src/types/lab'

export function captureResponse(binary: BodyInit | undefined): Response {
  return new Response(binary, { headers: { 'Content-Type': 'application/vnd.netcircuit.capture; version=1' } })
}

export function captureFixture(signal = 'y', captureId = 'c1') {
  const header = new TextEncoder().encode(JSON.stringify({ encoding: 'digital_events', signals: [signal], sample_count: 2, duration_ns: 20 }))
  const bytes = new Uint8Array(9 + header.length + 22), view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode('NCAP')); view.setUint8(4, 1); view.setUint32(5, header.length, true); bytes.set(header, 9)
  view.setUint16(9 + header.length, 0, true); view.setBigUint64(11 + header.length, 0n, true); view.setUint8(19 + header.length, 2)
  view.setUint16(20 + header.length, 0, true); view.setBigUint64(22 + header.length, 8n, true); view.setUint8(30 + header.length, 1)
  const metadata: CaptureMetadata = { schema_version: '1.0', capture_id: captureId, source: 'simulation', instrument: 'logic_analyzer', encoding: 'digital_events',
    available: true, duration_ns: 20, sample_count: 2, channel_count: 1, payload_ref: `/api/captures/${captureId}/payload`, payload_byte_count: bytes.byteLength, signals: [signal] }
  return { binary: bytes.buffer, metadata }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(complete => { resolve = complete })
  return { promise, resolve }
}
