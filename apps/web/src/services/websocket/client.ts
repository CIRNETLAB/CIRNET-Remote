import { isVersionedServerEvent, parseServerEvent, type ServerEvent } from './events'
import { isRecord } from '../../types/api'
import { parseDocumentJson } from '../../domain/document/json'
import { controlClientId } from '../session/controlClient'

export type ResyncReason = 'STREAM_RESET' | 'SEQUENCE_GAP' | 'QUEUE_OVERFLOW' | 'PROTOCOL_MISMATCH' | 'INVALID_EVENT'
export interface EventProtocolIssue { code: 'INVALID_EVENT' | 'PROTOCOL_MISMATCH'; message: string }

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'negotiating' | 'reconciling' | 'ready' | 'reconnecting' | 'closed'
export interface SocketLike {
  onopen: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  close(): void
  send?(value: string): void
}
export interface EventClient { connect(): void; disconnect(): void }
export interface EventClientOptions {
  url: string
  onEvent: (event: ServerEvent) => void
  onState?: (state: ConnectionState) => void
  onResync?: (reason: ResyncReason) => void
  onProtocolError?: (issue: EventProtocolIssue) => void
  createSocket?: (url: string) => SocketLike
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
  random?: () => number
  controlClientId?:()=>string
  onAuthenticationLost?:(code:4401|4403)=>void
}

export function eventSocketUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/events`
}

export function createEventClient(options: EventClientOptions): EventClient {
  let active = false
  let socket: SocketLike | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempts = 0
  let streamId: string | null = null, sequence = -1
  let helloReceived=false
  const revisions = new Map<string, number>()
  const schedule = options.schedule ?? setTimeout
  const cancel = options.cancel ?? clearTimeout
  const state = (value: ConnectionState) => options.onState?.(value)
  const resync = (reason: ResyncReason) => options.onResync?.(reason)
  function protocolFailure(code: EventProtocolIssue['code']) {
    options.onProtocolError?.({ code, message: code === 'PROTOCOL_MISMATCH' ? 'Realtime protocol is incompatible.' : 'Invalid realtime event; refreshing remote snapshots.' })
    resync(code)
    if (code === 'PROTOCOL_MISMATCH') {
      active = false; retire(); state('closed')
    }
  }
  function retire() {
    helloReceived=false
    if (!socket) return
    const previous = socket
    socket = null
    previous.onopen = previous.onclose = previous.onerror = previous.onmessage = null
    previous.close()
  }
  function reconnect() {
    if (!active || timer !== null) return
    retire()
    state('reconnecting')
    const base = Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 15))
    const delay = Math.min(30_000, Math.round(base * (1 + (options.random ?? Math.random)() * 0.25)))
    timer = schedule(() => { timer = null; open() }, delay)
  }
  function open() {
    if (!active) return
    state(attempts ? 'reconnecting' : 'connecting')
    try {
      const current = (options.createSocket ?? ((url) => new WebSocket(url)))(options.url)
      socket = current
      helloReceived=false;streamId=null;sequence=-1
      current.onopen = () => { if (active && socket === current) {
        attempts = 0; state('connected')
        current.send?.(JSON.stringify({ type: 'client.hello', protocol_version: '1.0',control_client_id:(options.controlClientId??controlClientId)() }))
      } }
      current.onerror = () => { if (active && socket === current) reconnect() }
      current.onclose = (event) => { if (active && socket === current) {
        if(event.code===4401||event.code===4403) {active=false;retire();state('closed');options.onAuthenticationLost?.(event.code)}
        else reconnect()
      } }
      current.onmessage = (message) => {
        if (!active || socket !== current) return
        if (typeof message.data !== 'string') { protocolFailure('INVALID_EVENT'); return }
        if (new TextEncoder().encode(message.data).byteLength>4_000_000) { protocolFailure('INVALID_EVENT'); return }
        let data: unknown
        try { data = parseDocumentJson(message.data,'transport') } catch { protocolFailure('INVALID_EVENT'); return }
        if (isRecord(data) && 'protocol_version' in data && data.protocol_version !== '1.0') { protocolFailure('PROTOCOL_MISMATCH'); return }
        const event = parseServerEvent(data)
        if (!event) { protocolFailure('INVALID_EVENT'); return }
        // OPEN is only the transport state. A scoped hello establishes which
        // ordered stream may feed consumers; an update cannot invent it.
        if(event.type!=='hello'&&!helloReceived){protocolFailure('INVALID_EVENT');return}
        if(!isVersionedServerEvent(event)&&streamId!==null){protocolFailure('INVALID_EVENT');return}
        if (isVersionedServerEvent(event)) {
          if (event.type === 'hello') {
            if(streamId===event.stream_id&&event.sequence<=sequence) return
            const reset=streamId!==event.stream_id||event.resync_required
            streamId = event.stream_id; sequence = event.sequence
            helloReceived=true;state('ready')
            if(reset)resync('STREAM_RESET')
          } else {
            if (streamId !== event.stream_id) { protocolFailure('INVALID_EVENT');return }
            if (event.sequence <= sequence) return
            if (sequence >= 0 && event.sequence !== sequence + 1 && event.type !== 'resync.required') resync('SEQUENCE_GAP')
            sequence = event.sequence
            if (event.type === 'resync.required') resync(event.reason)
            if (event.type === 'protocol.error') { protocolFailure(event.code === 'UNSUPPORTED_VERSION' ? 'PROTOCOL_MISMATCH' : 'INVALID_EVENT'); return }
          }
          if (event.type === 'experiment.updated') {
            const key = event.aggregate_id
            if ((revisions.get(key) ?? -1) >= event.aggregate_revision) return
            revisions.set(key, event.aggregate_revision)
            // Sequence ordering remains authoritative; the revision cache only needs recent aggregates.
            if(revisions.size>256) revisions.delete(revisions.keys().next().value!)
          }
        }else if(event.type==='hello'){helloReceived=true;state('ready');resync('STREAM_RESET')}
        options.onEvent(event)
      }
    } catch { reconnect() }
  }
  return {
    connect() { if (active) return; active = true; attempts = 0; open() },
    disconnect() {
      active = false
      streamId = null; sequence = -1; revisions.clear()
      if (timer !== null) { cancel(timer); timer = null }
      retire()
      state('closed')
    },
  }
}
