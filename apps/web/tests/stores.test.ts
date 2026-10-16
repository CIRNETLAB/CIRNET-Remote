import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useStationStore } from '../src/stores/station'
import { useCircuitStore } from '../src/stores/circuit'
import { configureApiClient } from '../src/services/api/client'
import { stationStatus, isStationDescriptor } from '../src/types/station'
import { stationFixture } from './helpers/station'

beforeEach(() => setActivePinia(createPinia()))

test('wire station states have five distinct frontend outcomes', () => {
  const cases = [
    ['simulation', 'ready', 'SIMULATION'], ['hardware', 'ready', 'HARDWARE_AVAILABLE'],
    ['hardware', 'busy', 'HARDWARE_BUSY'], ['hardware', 'unavailable', 'HARDWARE_OFFLINE'], ['hardware', 'error', 'FAULT'],
  ] as const
  for (const [mode, state, expected] of cases) assert.equal(stationStatus({ station_id: 'station-1', mode, state }), expected)
})

test('disconnected or removed physical selections stay hardware/offline', () => {
  const store = useStationStore()
  store.setStations([{ station_id: 'physical-1', mode: 'hardware', state: 'ready' }])
  store.setEventsConnected(true)
  store.selectStation('physical-1')
  assert.equal(store.status, 'HARDWARE_AVAILABLE')
  store.setEventsConnected(false)
  assert.equal(store.status, 'HARDWARE_OFFLINE')
  store.setEventsConnected(true)
  store.setStations([])
  assert.equal(store.mode, 'hardware')
  assert.equal(store.status, 'HARDWARE_OFFLINE')
  store.useSimulation()
  assert.equal(store.status, 'SIMULATION')
})

test('station refresh failures keep the selected physical mode and expose a retry error', async () => {
  const store = useStationStore()
  store.setStations([{ station_id: 'physical-1', mode: 'hardware', state: 'ready' }])
  store.setEventsConnected(true)
  store.selectStation('physical-1')
  configureApiClient({ fetcher: async () => { throw new TypeError('offline') } })
  await store.refresh()
  assert.equal(store.status, 'HARDWARE_OFFLINE')
  assert.ok(store.error)
  assert.equal(store.loading, false)
})

test('a changed station mode cannot silently switch a physical selection to simulation', () => {
  const store = useStationStore()
  store.setStations([{ station_id: 'physical-1', mode: 'hardware', state: 'ready' }])
  store.setEventsConnected(true)
  store.selectStation('physical-1')
  store.setStations([{ station_id: 'physical-1', mode: 'simulation', state: 'ready' }])
  assert.equal(store.mode, 'hardware')
  assert.equal(store.status, 'HARDWARE_OFFLINE')
  store.selectStation('physical-1')
  assert.equal(store.status, 'SIMULATION')
  store.updateStation({ station_id: 'physical-1', mode: 'hardware', state: 'ready' })
  assert.equal(store.mode, 'simulation')
  assert.equal(store.status, 'HARDWARE_OFFLINE')
})

test('station state must be a string enum, never a coerced array or value', () => {
  for (const state of [['error'], ['ready'], ['busy'], null, 1, {}]) {
    assert.equal(isStationDescriptor({ station_id: 'p1', mode: 'hardware', state }), false)
  }
})

test('new drafts are independent schema v1 graphs and opening preserves their contents', () => {
  const store = useCircuitStore()
  const first = store.createDraft('AND exercise')
  assert.deepEqual(store.graph?.modules, [])
  assert.equal(store.graph?.schema_version, '1.0')
  store.renameCurrent('Renamed exercise')
  const second = store.createDraft('Second')
  assert.notEqual(first, second)
  store.openDraft(first)
  assert.equal(store.current?.name, 'Renamed exercise')
  assert.equal(store.drafts.length, 2)
})

test('validation results are invalidated when the graph changes', async () => {
  configureApiClient({ fetcher: async () => Response.json({ valid: true, code: 'VALID', message: 'Valid graph' }) })
  const store = useCircuitStore()
  store.createDraft('First')
  await store.validateCurrent()
  assert.equal(store.validation?.valid, true)
  store.graph!.modules.push({ id: 'SW1', type: 'DIGITAL_SWITCH' })
  assert.equal(store.validation, null)
})

test('late validation cannot approve a changed graph or a newly selected draft', async () => {
  let complete!: (response: Response) => void
  configureApiClient({ fetcher: async () => new Promise<Response>((resolve) => { complete = resolve }) })
  const store = useCircuitStore()
  store.createDraft('First')
  const pending = store.validateCurrent()
  store.createDraft('Second')
  complete(Response.json({ valid: true, code: 'VALID', message: 'Valid graph' }))
  await pending
  assert.equal(store.validation, null)
  assert.equal(store.validating, false)
  assert.equal(store.current?.name, 'Second')
})

test('a graph edited while validation is pending cannot receive the old approval', async () => {
  let complete!: (response: Response) => void
  configureApiClient({ fetcher: async () => new Promise<Response>((resolve) => { complete = resolve }) })
  const store = useCircuitStore()
  store.createDraft('First')
  const pending = store.validateCurrent()
  store.graph!.modules.push({ id: 'U1', type: '74HC08' })
  complete(Response.json({ valid: true, code: 'VALID', message: 'Valid graph' }))
  await pending
  assert.equal(store.validation, null)
  assert.equal(store.validating, false)
})

test('an older discovery response cannot overwrite a newer refresh', async () => {
  const responses: ((response: Response) => void)[] = []
  configureApiClient({ fetcher: async () => new Promise<Response>((resolve) => { responses.push(resolve) }) })
  const store = useStationStore()
  const first = store.refresh()
  const second = store.refresh()
  responses[1](Response.json([stationFixture('physical-1','hardware','error')]))
  await second
  responses[0](Response.json([stationFixture('physical-1','hardware')]))
  await first
  assert.equal(store.stations[0].status, 'FAULT')
  assert.equal(store.loading, false)
})
