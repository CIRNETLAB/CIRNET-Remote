import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { ApiError, configureApiClient, createApiClient } from '../src/services/api/client'
import { createCapturesApi } from '../src/services/api/captures'
import { useInstrumentStore } from '../src/stores/instrument'
import { decodeDigitalCapture } from '../src/services/captures/digital'
import { parseLab } from '../src/types/labValidation'
import type { CaptureMetadata } from '../src/types/lab'
import { captureFixture, captureResponse, deferred } from './helpers/capture'
import { loadSfc, mountSfc } from './helpers/vueSfc'

beforeEach(() => setActivePinia(createPinia()))

test('digital decoder preserves X and rejects truncation and unsupported versions', () => {
  const { binary, metadata } = captureFixture()
  assert.deepEqual(decodeDigitalCapture(binary, metadata).samples, [{ signal: 'y', time_ns: 0, value: 'X' }, { signal: 'y', time_ns: 8, value: 1 }])
  assert.throws(() => decodeDigitalCapture(binary.slice(0, -1), metadata), /capture/i)
  const invalid = binary.slice(0); new Uint8Array(invalid)[4] = 2
  assert.throws(() => decodeDigitalCapture(invalid, metadata), /capture/i)
})

test('decoder rejects illegal channels, values, unsafe timestamps and mismatched metadata', () => {
  const { binary, metadata } = captureFixture(), start = 9 + new DataView(binary).getUint32(5, true)
  for (const corrupt of [
    (view: DataView) => view.setUint16(start, 1, true),
    (view: DataView) => view.setUint8(start + 10, 3),
    (view: DataView) => view.setBigUint64(start + 2, 9007199254740992n, true),
  ]) {
    const invalid = binary.slice(0); corrupt(new DataView(invalid))
    assert.throws(() => decodeDigitalCapture(invalid, metadata), /capture/i)
  }
  for (const change of [{ sample_count: 1 }, { duration_ns: 19 }, { channel_count: 2 }, { signals: ['wrong'] }]) {
    assert.throws(() => decodeDigitalCapture(binary, { ...metadata, ...change }), /capture/i)
  }
})

test('decoder rejects duplicate JSON header fields rather than trusting the last value', () => {
  const { binary, metadata } = captureFixture(), start = 9 + new DataView(binary).getUint32(5, true)
  const header = new TextEncoder().encode('{"encoding":"digital_events","signals":["y"],"sample_count":1,"sample_count":2,"duration_ns":20}')
  const bytes = new Uint8Array(9 + header.length + 22)
  bytes.set(new Uint8Array(binary).slice(0, 9)); new DataView(bytes.buffer).setUint32(5, header.length, true)
  bytes.set(header, 9); bytes.set(new Uint8Array(binary).slice(start), 9 + header.length)
  assert.throws(() => decodeDigitalCapture(bytes.buffer, { ...metadata, payload_byte_count: bytes.byteLength }), /capture/i)
})

test('decoder rejects invalid UTF-8 and BOM-prefixed JSON just as the server codec does', () => {
  const { binary, metadata } = captureFixture(), headerLength = new DataView(binary).getUint32(5, true)
  const malformed = binary.slice(0); new Uint8Array(malformed)[9] = 0xff
  assert.throws(() => decodeDigitalCapture(malformed, metadata), /capture/i)
  const bytes = new Uint8Array(binary.byteLength + 3)
  bytes.set(new Uint8Array(binary).slice(0, 9)); bytes.set([0xef, 0xbb, 0xbf], 9); bytes.set(new Uint8Array(binary).slice(9), 12)
  new DataView(bytes.buffer).setUint32(5, headerLength + 3, true)
  assert.throws(() => decodeDigitalCapture(bytes.buffer, { ...metadata, payload_byte_count: bytes.byteLength }), /capture/i)
})

test('caller cancellation while binary body is pending survives a late body completion', async () => {
  const { binary } = captureFixture(), body = deferred<ArrayBuffer>(), controller = new AbortController()
  const stream = new ReadableStream<Uint8Array>({ async start(output) {
    const value = await body.promise
    if (!controller.signal.aborted) { output.enqueue(new Uint8Array(value)); output.close() }
  } })
  const client = createApiClient({ fetcher: async () => new Response(stream, { headers: { 'Content-Type': 'application/vnd.netcircuit.capture; version=1' } }) })
  const pending = createCapturesApi(client).payload('c1', controller.signal)
  await Promise.resolve(); controller.abort(); body.resolve(binary)
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.code === 'REQUEST_CANCELLED')
})

test('metadata updates fetch no payload until needed and repeated reads share the active cached request', async () => {
  const { binary, metadata } = captureFixture(); let requests = 0
  configureApiClient({ fetcher: async url => { requests++; assert.equal(String(url), '/api/captures/c1/payload'); return captureResponse(binary) } })
  const store = useInstrumentStore(); store.captureSignals = ['requested.input']
  store.useCapture(parseLab('CaptureMetadata', metadata)); store.useCapture(parseLab('CaptureMetadata', metadata))
  assert.equal(requests, 0)
  await Promise.all([store.ensureCaptureLoaded(), store.ensureCaptureLoaded()])
  assert.equal(requests, 1); assert.equal(store.capture?.samples[0].value, 'X')
  assert.deepEqual(store.monitor.channels, ['y']); assert.deepEqual(store.captureSignals, ['requested.input'])
  store.useCapture(parseLab('CaptureMetadata', metadata)); await store.ensureCaptureLoaded()
  assert.equal(requests, 1)
  store.useCapture(parseLab('CaptureMetadata', { ...metadata, available: false, payload_ref: null, payload_byte_count: 0 }))
  assert.equal(store.capture, null); assert.deepEqual(store.monitor.channels, [])
})

test('capture replacement aborts the previous request and late completion cannot overwrite the active capture', async () => {
  const first = captureFixture('old', 'old'), second = captureFixture('new', 'new'), response = deferred<Response>()
  let oldSignal: AbortSignal | undefined
  configureApiClient({ fetcher: async (url, options) => {
    if (String(url) === '/api/captures/old/payload') { oldSignal = options?.signal ?? undefined; return response.promise }
    assert.equal(String(url), '/api/captures/new/payload'); return captureResponse(second.binary)
  } })
  const store = useInstrumentStore(); store.useCapture(first.metadata); const oldLoad = store.ensureCaptureLoaded()
  store.useCapture(second.metadata); assert.equal(oldSignal?.aborted, true)
  await store.ensureCaptureLoaded(); response.resolve(captureResponse(first.binary)); await oldLoad
  assert.equal(store.capture?.capture_id, 'new'); assert.deepEqual(store.monitor.channels, ['new'])
  assert.equal(store.captureLoading, false); assert.equal(store.captureError, null)
})

test('clearing capture releases samples and invalidates even a same-id request that ignores cancellation', async () => {
  const { binary, metadata } = captureFixture(), response = deferred<Response>(); let requests = 0
  configureApiClient({ fetcher: async () => { requests++; return requests === 1 ? response.promise : captureResponse(binary) } })
  const store = useInstrumentStore(); store.useCapture(metadata); const pending = store.ensureCaptureLoaded()
  store.useCapture(null); store.useCapture(metadata); await store.ensureCaptureLoaded()
  response.resolve(captureResponse(binary)); await pending
  assert.equal(requests, 2); assert.equal(store.capture?.samples.length, 2)
  store.useCapture(null)
  assert.equal(store.captureMetadata, null); assert.equal(store.capture, null); assert.deepEqual(store.monitor.channels, [])
})

test('payload fetch uses the configured API and encoded ID rather than an untrusted payload_ref', async () => {
  const { binary, metadata } = captureFixture('y', 'capture/id')
  configureApiClient({ baseUrl: '/backend/api', fetcher: async (url, options) => {
    assert.equal(String(url), '/backend/api/captures/capture%2Fid/payload')
    assert.equal(new Headers(options?.headers).get('Accept'), 'application/vnd.netcircuit.capture; version=1')
    return captureResponse(binary)
  } })
  const store = useInstrumentStore(); store.useCapture({ ...metadata, payload_ref: 'https://untrusted.invalid/payload' })
  await store.ensureCaptureLoaded(); assert.equal(store.capture?.capture_id, 'capture/id')
})

test('owner denial retains a visible error and never renders or caches samples', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const { metadata } = captureFixture()
  configureApiClient({ fetcher: async () => Response.json({ code: 'CAPTURE_NOT_FOUND', message: 'Capture is unavailable to this session.', request_id:'capture-denied' }, { status: 404 }) })
  const store = useInstrumentStore(); store.useCapture(metadata); await store.ensureCaptureLoaded()
  assert.equal(store.capture, null); assert.equal(store.captureError, 'Capture is unavailable to this session.')
  const monitor = mountSfc(await loadSfc('components/windows/SignalMonitorWindow.vue'), pinia)
  await store.ensureCaptureLoaded(); await nextTick()
  assert.ok(monitor.text().includes('Capture is unavailable to this session.'))
  assert.equal(monitor.all().some(node => node.tag === 'path' && node.props['data-signal']), false)
  monitor.app.unmount()
})

test('corrupt payload and checksum mismatch fail explicitly and a subsequent request can recover', async () => {
  const { binary, metadata } = captureFixture()
  const sha256 = createHash('sha256').update(new Uint8Array(binary)).digest('hex')
  const changed = binary.slice(0); new Uint8Array(changed)[changed.byteLength - 1] = 0
  const responses = [binary.slice(0, -1), changed, binary]
  configureApiClient({ fetcher: async () => captureResponse(responses.shift()) })
  const store = useInstrumentStore(); store.useCapture({ ...metadata, sha256 })
  for (let i = 0; i < 2; i++) {
    await store.ensureCaptureLoaded(); assert.equal(store.capture, null); assert.match(store.captureError ?? '', /capture/i)
  }
  await store.ensureCaptureLoaded(); assert.equal(store.captureError, null); assert.equal(store.capture?.samples[1].value, 1)
})

test('future unavailable scope envelope does not request or render analog samples', async () => {
  let requests = 0; configureApiClient({ fetcher: async () => { requests++; return new Response() } })
  const store = useInstrumentStore(), { metadata } = captureFixture()
  store.useCapture(parseLab('CaptureMetadata', { ...metadata, instrument: 'oscilloscope', encoding: 'FLOAT32', available: false, sample_count: 0, payload_byte_count: 0, payload_ref: null }))
  await store.ensureCaptureLoaded(); assert.equal(requests, 0); assert.equal(store.capture, null)
})

test('metadata rejects contradictory digital descriptors and unavailable payload references', () => {
  const { metadata } = captureFixture()
  for (const change of [{ encoding: 'FLOAT32' }, { channel_count: 2 }, { signals: ['y', 'y'], channel_count: 2 }, { available: true, payload_ref: null }, { available: false }]) {
    assert.throws(() => parseLab('CaptureMetadata', { ...metadata, ...change }), /capture/i)
  }
})

test('metadata preserves an exact epoch-nanosecond string and rejects an unsafe numeric epoch', () => {
  const { metadata } = captureFixture()
  const exact = parseLab('CaptureMetadata', { ...metadata, timestamp_ns: '1791856800123456789' })
  assert.equal(exact.timestamp_ns, '1791856800123456789')
  assert.throws(() => parseLab('CaptureMetadata', { ...metadata, timestamp_ns: 1791856800123456789 }), /capture/i)
})

test('mounting the monitor fetches real events once and unmounting aborts a pending payload', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const { binary, metadata } = captureFixture(), response = deferred<Response>()
  let requests = 0, signal: AbortSignal | undefined
  configureApiClient({ fetcher: async (_url, options) => { requests++; signal = options?.signal ?? undefined; return requests === 1 ? captureResponse(binary) : response.promise } })
  const store = useInstrumentStore(); store.useCapture(metadata)
  const component = await loadSfc('components/windows/SignalMonitorWindow.vue'), monitor = mountSfc(component, pinia)
  await store.ensureCaptureLoaded(); await nextTick()
  assert.equal(requests, 1)
  assert.ok(monitor.all().some(node => node.tag === 'path' && node.props['data-signal'] === 'y'))
  store.useCapture({ ...metadata, capture_id: 'next', payload_ref: '/api/captures/next/payload' }); await nextTick()
  assert.equal(requests, 2); assert.ok(monitor.text().includes('Loading capture'))
  monitor.app.unmount(); assert.equal(signal?.aborted, true)
  response.resolve(captureResponse(binary)); await Promise.resolve(); await Promise.resolve()
  assert.equal(store.capture, null)
})
