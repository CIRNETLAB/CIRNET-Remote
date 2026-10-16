import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEventClient, type SocketLike } from '../src/services/websocket/client'
import { parseServerEvent } from '../src/services/websocket/events'
import { runningExperiment } from './helpers/station'

function harness() {
  const sockets: SocketLike[] = []
  const timers = new Map<number, { callback: () => void; delay: number }>()
  const states: string[] = []
  const messages: unknown[] = []
  const resyncs: string[] = [], issues: string[] = [], sent: string[] = []
  const authenticationLost:number[]=[]
  let timerId = 0
  const client = createEventClient({
    url: 'ws://localhost/ws/events', random: () => 0, controlClientId:()=> 'tab-client',
    createSocket: () => {
      const socket = { onopen: null, onclose: null, onerror: null, onmessage: null, close() {}, send(value: string) { sent.push(value) } } as SocketLike
      sockets.push(socket)
      return socket
    },
    schedule: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId as unknown as ReturnType<typeof setTimeout> },
    cancel: (id) => { timers.delete(id as unknown as number) },
    onState: (state) => states.push(state), onEvent: (event) => messages.push(event),
    onResync: (reason: string) => resyncs.push(reason), onProtocolError: (issue: { code: string }) => issues.push(issue.code),
    onAuthenticationLost:(code:number)=>authenticationLost.push(code),
  })
  function retry() {
    const entry = [...timers.entries()][0]
    assert.ok(entry)
    timers.delete(entry[0]); entry[1].callback()
  }
  return { client, sockets, timers, states, messages, resyncs, issues, sent, authenticationLost,retry }
}

const hello = (stream = 'stream-1') => ({ type: 'hello', service: 'netcircuit-api', protocol_version: '1.0', stream_id: stream, sequence: 0,
  resync_required: true, supported_protocol_versions: ['1.0'], capabilities: { snapshot_resync: true, ordered_stream: true, replay_commands: false } })

test('versioned streams negotiate and request snapshots on sequence gaps without replaying commands', () => {
  const h = harness(); h.client.connect(); h.sockets[0].onopen?.({} as Event)
  const send = (value: unknown) => h.sockets[0].onmessage?.({ data: JSON.stringify(value) } as MessageEvent)
  send(hello())
  const update = (sequence: number, revision = sequence) => ({ type: 'experiment.updated', protocol_version: '1.0', stream_id: 'stream-1', sequence,
    aggregate_id: 'e1', aggregate_revision: revision, experiment: { ...runningExperiment(), revision } })
  send(update(1)); send(update(1)); send(update(3)); send(update(4, 2))
  assert.deepEqual(h.resyncs, ['STREAM_RESET', 'SEQUENCE_GAP'])
  assert.equal(h.messages.filter(value => (value as { type: string }).type === 'experiment.updated').length, 2)
  assert.deepEqual(h.sent.map(value => JSON.parse(value)), [{ type: 'client.hello', protocol_version: '1.0',control_client_id:'tab-client' }])
  send({ type: 'resync.required', protocol_version: '1.0', stream_id: 'stream-1', sequence: 7, reason: 'QUEUE_OVERFLOW', dropped_events: 2 })
  assert.equal(h.resyncs.at(-1), 'QUEUE_OVERFLOW')
  h.client.disconnect()
})

test('incompatible versions and malformed events surface protocol issues without entering state consumers', () => {
  const h = harness(); h.client.connect()
  h.sockets[0].onmessage?.({ data: 'not JSON' } as MessageEvent)
  assert.deepEqual(h.issues, ['INVALID_EVENT'])
  h.sockets[0].onmessage?.({ data: JSON.stringify({ ...hello(), protocol_version: '9.0' }) } as MessageEvent)
  assert.equal(h.issues.at(-1), 'PROTOCOL_MISMATCH')
  assert.equal(h.resyncs.at(-1), 'PROTOCOL_MISMATCH')
  assert.equal(h.messages.length, 0)
  assert.equal(h.states.at(-1), 'closed')
  assert.equal(h.timers.size, 0)
})

test('a duplicate hello cannot rewind an established stream sequence', () => {
  const h=harness();h.client.connect()
  const send=(value:unknown)=>h.sockets[0].onmessage?.({data:JSON.stringify(value)} as MessageEvent)
  const update=(sequence:number)=>({type:'experiment.updated',protocol_version:'1.0',stream_id:'stream-1',sequence,aggregate_id:'e1',aggregate_revision:sequence,experiment:{...runningExperiment(),revision:sequence}})
  send(hello());send(update(1));send(hello());send(update(2))
  assert.deepEqual(h.resyncs,['STREAM_RESET'])
  assert.equal(h.messages.length,3)
  h.client.disconnect()
})

test('unexpected binary messages surface an invalid event and require snapshot resync', () => {
  const h=harness();h.client.connect()
  h.sockets[0].onmessage?.({data:new Uint8Array([1,2])} as MessageEvent)
  assert.deepEqual(h.issues,['INVALID_EVENT'])
  assert.deepEqual(h.resyncs,['INVALID_EVENT'])
  assert.equal(h.messages.length,0)
  h.client.disconnect()
})

test('expired or denied websocket sessions stop reconnecting and notify auth teardown', () => {
  for(const code of [4401,4403]) {
    const h=harness();h.client.connect()
    h.sockets[0].onclose?.({code} as CloseEvent)
    assert.deepEqual(h.authenticationLost,[code]);assert.equal(h.timers.size,0)
    assert.equal(h.states.at(-1),'closed')
  }
})

test('unexpected closes reconnect with exponential backoff, cap, and reset after open', () => {
  const h = harness()
  h.client.connect()
  for (const expected of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    h.sockets.at(-1)!.onclose?.({} as CloseEvent)
    assert.equal([...h.timers.values()][0].delay, expected)
    h.retry()
  }
  h.sockets.at(-1)!.onopen?.({} as Event)
  h.sockets.at(-1)!.onclose?.({} as CloseEvent)
  assert.equal([...h.timers.values()][0].delay, 1000)
  assert.ok(h.states.includes('reconnecting'))
  h.client.disconnect()
})

test('manual disconnect cancels retries and late socket callbacks cannot reconnect', () => {
  const h = harness()
  h.client.connect()
  const lateClose = h.sockets[0].onclose!
  h.sockets[0].onclose?.({} as CloseEvent)
  h.client.disconnect()
  lateClose({} as CloseEvent)
  assert.equal(h.timers.size, 0)
  assert.equal(h.states.at(-1), 'closed')
  h.client.connect()
  lateClose({} as CloseEvent)
  assert.equal(h.timers.size, 0)
  assert.equal(h.sockets.length, 2)
  h.client.disconnect()
})

test('duplicate connect and error/close callbacks create only one connection/retry', () => {
  const h = harness()
  h.client.connect(); h.client.connect()
  assert.equal(h.sockets.length, 1)
  const error = h.sockets[0].onerror!
  const close = h.sockets[0].onclose!
  error({} as Event); close({} as CloseEvent)
  assert.equal(h.timers.size, 1)
  h.client.disconnect()
})

test('malformed and unsupported events never reach state consumers', () => {
  const h = harness()
  h.client.connect()
  for (const data of ['not json', '{"type":"station.updated","station":{"station_id":"p1","mode":"hardware","state":"unknown"}}', '{"type":"station.updated","station":{"station_id":"p1","mode":"hardware","state":["error"]}}', '{"type":"unknown"}', 'null']) {
    h.sockets[0].onmessage?.({ data } as MessageEvent)
  }
  assert.equal(h.messages.length, 0)
  h.sockets[0].onmessage?.({ data: '{"type":"hello","service":"netcircuit-api"}' } as MessageEvent)
  assert.equal(h.messages.length, 1)
  assert.deepEqual(parseServerEvent({ type: 'station.updated', station: { station_id: 'p1', mode: 'hardware', state: 'error' } }),
    { type: 'station.updated', station: { station_id: 'p1', mode: 'hardware', state: 'error' } })
  h.client.disconnect()
})
