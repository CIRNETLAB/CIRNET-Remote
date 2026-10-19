import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { configureApiClient, createApiClient, ApiError } from '../src/services/api/client'
import { useStationStore } from '../src/stores/station'
import { MAX_HISTORY_STORAGE_BYTES, useCircuitStore } from '../src/stores/circuit'
import { useWorkspaceStore } from '../src/stores/workspace'
import type { CircuitModule } from '../src/types/circuit'
import { stationFixture } from './helpers/station'

beforeEach(() => setActivePinia(createPinia()))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

test('an in-flight discovery cannot overwrite a newer station fault event', async () => {
  const response = deferred<Response>()
  configureApiClient({ fetcher: async () => response.promise })
  const store = useStationStore()
  store.setStations([{ station_id: 'p1', mode: 'hardware', state: 'ready' }])
  store.selectStation('p1'); store.setEventsConnected(true)
  const pending = store.refresh()
  store.updateStation({ station_id: 'p1', mode: 'hardware', state: 'error' })
  response.resolve(Response.json([stationFixture('p1','hardware'),stationFixture('p2','hardware')]))
  await pending
  assert.equal(store.status, 'FAULT')
  assert.equal(store.stations.find((station) => station.station_id === 'p2')?.status, 'HARDWARE_AVAILABLE')
  assert.equal(store.loading, false)
})

test('a station first seen in an event survives older discovery without blocking other stations', async () => {
  const response = deferred<Response>()
  configureApiClient({ fetcher: async () => response.promise })
  const store = useStationStore()
  const pending = store.refresh()
  store.updateStation({ station_id: 'p3', mode: 'hardware', state: 'busy' })
  response.resolve(Response.json([stationFixture('p1','hardware')]))
  await pending
  assert.equal(store.stations.find((station) => station.station_id === 'p3')?.status, 'HARDWARE_BUSY')
  assert.equal(store.stations.find((station) => station.station_id === 'p1')?.status, 'HARDWARE_AVAILABLE')
})

test('cancelled API body completion cannot update station discovery after disposal', async () => {
  const response = deferred<Response>()
  configureApiClient({ fetcher: async () => response.promise })
  const store = useStationStore(), controller = new AbortController()
  const pending = store.refresh(controller.signal)
  controller.abort()
  response.resolve(Response.json([stationFixture('p1','hardware')]))
  await pending
  assert.deepEqual(store.stations, [])
  assert.equal(store.loaded, false)
  assert.equal(store.loading, false)
  assert.equal(store.error, null)
})

test('caller cancellation while JSON is pending is preserved even if the body completes', async () => {
  const body = deferred<unknown>(), controller = new AbortController()
  const stream = new ReadableStream<Uint8Array>({ async start(output) {
    const value = await body.promise
    if (!controller.signal.aborted) { output.enqueue(new TextEncoder().encode(JSON.stringify(value))); output.close() }
  } })
  const client = createApiClient({ fetcher: async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }) })
  const pending = client.request('/health', { signal: controller.signal })
  await Promise.resolve()
  controller.abort(); body.resolve({ status: 'ok' })
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.code === 'REQUEST_CANCELLED')
})

test('large project history releases old snapshots while immediate undo and redo remain independent', () => {
  const store = useCircuitStore()
  store.importGraph({ schema_version: '1.0', circuit_id: 'large', modules: [], connections: [], metadata: { padding: 'x'.repeat(900_000) } })
  for (let i = 0; i < 30; i++) store.renameCurrent(`Revision ${i}`)
  const storedBytes = () => [...store.past, ...store.future].reduce((bytes, snapshot) => bytes + snapshot.length * 2, 0)
  assert.ok(storedBytes() <= MAX_HISTORY_STORAGE_BYTES, `history retains ${storedBytes()} bytes`)
  store.undo()
  assert.equal(store.current?.name, 'Revision 28')
  assert.ok(storedBytes() <= MAX_HISTORY_STORAGE_BYTES)
  store.redo()
  assert.equal(store.current?.name, 'Revision 29')
  assert.ok(storedBytes() <= MAX_HISTORY_STORAGE_BYTES)
})

test('abandoned import saved fingerprints are released when undo history branches', () => {
  const store = useCircuitStore()
  store.createDraft('Original')
  store.importGraph({ schema_version: '1.0', circuit_id: 'imported', modules: [], connections: [], metadata: { padding: 'x'.repeat(200_000) } })
  const importedId = store.activeId!
  store.undo()
  assert.equal(store.saved[importedId]?.length! > 200_000, true, 'redo still needs the saved fingerprint')
  store.redo()
  assert.equal(store.dirty, false)
  store.undo(); store.renameCurrent('Branch')
  assert.equal(store.canRedo, false)
  assert.equal(Object.hasOwn(store.saved, importedId), false)
  assert.equal(store.current?.name, 'Branch')
})

test('workspace zoom rejects non-finite inputs before they reach camera projection', () => {
  const store = useWorkspaceStore()
  store.setZoom(130)
  const request = store.zoomRequest
  for (const value of [NaN, Infinity, -Infinity]) {
    store.setZoom(value)
    assert.equal(store.requestedZoom, 130)
    assert.equal(store.zoomRequest, request, 'invalid input must not issue a camera request')
    assert.equal(store.zoom, 100, 'only the camera may publish measured zoom')
  }
})

test('placing into a densely numbered circuit visits existing IDs linearly', () => {
  const store = useCircuitStore()
  store.createDraft()
  let visits = 0
  const count = 400
  store.graph!.modules = Array.from({ length: count }, (_, index): CircuitModule => ({
    get id() { visits++; return `LED_${index + 1}` }, type: 'LED',
  }))
  const id = store.placeModule('LED', { x: 0, y: 0, z: 0 })
  assert.equal(id, 'LED_401')
  assert.ok(visits < count * 10, `placement visited ${visits} IDs for ${count} modules`)
  store.removeModule('LED_3')
  assert.equal(store.placeModule('LED', { x: 0, y: 0, z: 0 }), 'LED_3', 'deleted numbers remain reusable')
})

test('changing drafts cancels obsolete validation transport while preserving cleared state', async () => {
  const response = deferred<Response>()
  let signal: AbortSignal | undefined
  configureApiClient({ fetcher: async (_url, options) => { signal = options?.signal ?? undefined; return response.promise } })
  const store = useCircuitStore()
  store.createDraft('First')
  const pending = store.validateCurrent()
  store.createDraft('Second')
  try { assert.equal(signal?.aborted, true, 'invalidated graph validation must release the request') }
  finally {
    response.resolve(Response.json({ valid: true, code: 'VALID', message: 'Valid graph' }))
    await pending
  }
  assert.equal(store.current?.name, 'Second')
  assert.equal(store.validation, null)
  assert.equal(store.validationError, null)
  assert.equal(store.validating, false)
})

test('finite extreme rotations do not overflow into NaN graph values', () => {
  const store = useCircuitStore()
  store.importGraph({ schema_version: '1.0', circuit_id: 'extreme', modules: [{ id: 'LED_1', type: 'LED', rotation: Number.MAX_VALUE }], connections: [] })
  store.rotateModule('LED_1', Number.MAX_VALUE)
  assert.equal(store.graph!.modules[0].rotation, 256)
  assert.equal(JSON.parse(store.exportGraph()).modules[0].rotation, 256)
  store.undo()
  assert.equal(store.graph!.modules[0].rotation, Number.MAX_VALUE)
})

test('an oversized multi-draft snapshot retains one immediate undo and redo', () => {
  const store = useCircuitStore()
  for (let i = 0; i < 6; i++) store.importGraph({ schema_version: '1.0', circuit_id: `large-${i}`, modules: [], connections: [], metadata: { name: `Circuit ${i}`, padding: 'x'.repeat(1_750_000) } })
  store.renameCurrent('Edited')
  assert.equal(store.past.length, 1)
  assert.ok(store.past[0].length * 2 > MAX_HISTORY_STORAGE_BYTES)
  store.undo()
  assert.equal(store.current?.name, 'Circuit 5')
  assert.equal(store.future.length, 1)
  store.redo()
  assert.equal(store.current?.name, 'Edited')
  assert.equal(store.drafts.length, 6)
})
