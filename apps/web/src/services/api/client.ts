import { isRecord } from '../../types/api'
import { ContractValidationError } from '../../contracts/structural'
import { parseDocumentJson } from '../../domain/document/json'
import { controlClientId } from '../session/controlClient'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly detail?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}
export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  acceptStatuses?: number[]
  responseType?: 'json' | 'arrayBuffer' | 'empty'
  accept?: string
  headers?: Record<string, string>
  maxResponseBytes?: number
  controlContext?: boolean
  parse?: (value: unknown) => T
}
type ParsedRequestOptions<T> = RequestOptions<T> & { parse: (value: unknown) => T }
type UnparsedRequestOptions = Omit<RequestOptions<unknown>, 'parse'> & { parse?: never }
type BinaryRequestOptions = UnparsedRequestOptions & { responseType: 'arrayBuffer' }
type EmptyRequestOptions = UnparsedRequestOptions & { responseType: 'empty' }
export interface ApiClient {
  request<T>(path: string, options: ParsedRequestOptions<T>): Promise<T>
  request(path: string, options: BinaryRequestOptions): Promise<ArrayBuffer>
  request(path: string, options: EmptyRequestOptions): Promise<void>
  request(path: string, options?: UnparsedRequestOptions): Promise<unknown>
}

function mediaType(value: string) {
  const [type, ...parts] = value.toLowerCase().split(';')
  return { type: type.trim(), parameters: new Map(parts.map(part => {
    const index = part.indexOf('=')
    return [part.slice(0, index).trim(), part.slice(index + 1).trim().replace(/^"|"$/g, '')]
  })) }
}

async function readBounded(response: Response, maximum: number, signal: AbortSignal): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new ApiError(0, 'INVALID_CONFIGURATION', 'Response bound must be a nonnegative safe integer.')
  const declared = response.headers.get('Content-Length')
  if (declared !== null && (!/^\d+$/.test(declared) || BigInt(declared) > BigInt(maximum))) {
    await response.body?.cancel()
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API response exceeds its size bound.', { reason: 'RESPONSE_TOO_LARGE' })
  }
  if (!response.body) return new Uint8Array(0)
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  const abort = () => {
    // Cancellation is reported through the request signal even if transport cleanup rejects.
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', abort, { once: true })
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (signal.aborted) { await reader.cancel(); throw new Error('Request cancelled.') }
      if (done) break
      length += value.byteLength
      if (length > maximum) {
        await reader.cancel()
        throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API response exceeds its size bound.', { reason: 'RESPONSE_TOO_LARGE' })
      }
      chunks.push(value)
    }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export function createApiClient(options: { baseUrl?: string; timeoutMs?: number; fetcher?: typeof fetch; credentials?: RequestCredentials;
  csrfToken?:()=>string|null;controlClientId?:()=>string;onAuthenticationLost?:()=>void } = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? '/api').replace(/\/$/, '')
  function request<T>(path: string, options: ParsedRequestOptions<T>): Promise<T>
  function request(path: string, options: BinaryRequestOptions): Promise<ArrayBuffer>
  function request(path: string, options: EmptyRequestOptions): Promise<void>
  function request(path: string, options?: UnparsedRequestOptions): Promise<unknown>
  async function request(path: string, request: RequestOptions<unknown> = {}): Promise<unknown> {
      const controller = new AbortController()
      let timedOut = false
      const abort = () => controller.abort()
      request.signal?.addEventListener('abort', abort, { once: true })
      if (request.signal?.aborted) abort()
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 10_000)
      try {
        const sessionToken=options.csrfToken?.()??null
        const method=request.method??'GET'
        const headers=new Headers({Accept:request.accept??(request.responseType==='arrayBuffer'?'application/octet-stream':'application/json'),
          ...(request.body===undefined?{}:{'Content-Type':'application/json'}),...request.headers})
        if(method!=='GET'||request.controlContext)headers.set('X-Control-Client',(options.controlClientId??controlClientId)())
        if(method!=='GET') {
          if(sessionToken) headers.set('X-CSRF-Token',sessionToken)
        }
        const response = await (options.fetcher ?? globalThis.fetch)(`${baseUrl}${path}`, {
          method, headers,
          body: request.body === undefined ? undefined : JSON.stringify(request.body), signal: controller.signal,
          credentials: options.credentials ?? 'same-origin',
        })
        if (controller.signal.aborted) throw new Error('Request cancelled.')
        if (response.status === 204) {
          if (request.responseType === 'arrayBuffer') throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API returned no binary payload.')
          return request.parse ? request.parse(undefined) : undefined
        }
        let data: unknown
        try {
          const binary = request.responseType === 'arrayBuffer' && response.ok
          const empty = request.responseType === 'empty' && response.ok
          const received = mediaType(response.headers.get('Content-Type') ?? '')
          const expected = mediaType(request.accept ?? 'application/octet-stream')
          if (binary ? received.type !== expected.type || [...expected.parameters].some(([key, value]) => received.parameters.get(key) !== value)
            : !empty && received.type !== 'application/json' && !/^application\/[\w.+-]+\+json$/.test(received.type)) {
            await response.body?.cancel()
            throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API returned an unexpected media type.', { reason: 'MEDIA_TYPE_MISMATCH' })
          }
          const bytes = await readBounded(response, request.maxResponseBytes ?? (binary ? 8_388_608 : 4_000_000), controller.signal)
          if (request.responseType === 'empty' && response.ok) {
            if (bytes.byteLength) throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API returned a body for an empty response.')
            data = undefined
          } else data = binary ? bytes.buffer : parseDocumentJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), 'transport')
        } catch (error) {
          if (controller.signal.aborted) throw new ApiError(0, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? 'API request timed out. Please retry.' : 'Request cancelled.')
          if (error instanceof ApiError || error instanceof ContractValidationError) throw error
          throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API returned an unreadable response.')
        }
        if (controller.signal.aborted) throw new ApiError(0, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? 'API request timed out. Please retry.' : 'Request cancelled.')
        if (!response.ok && !request.acceptStatuses?.includes(response.status)) {
          const lostSession=response.status===401&&(!isRecord(data)||data.code!=='INVALID_CREDENTIALS')
            ||response.status===403&&isRecord(data)&&data.code==='CSRF_REJECTED'
          if(lostSession&&(options.csrfToken?.()??null)===sessionToken) options.onAuthenticationLost?.()
          throw new ApiError(response.status,
            isRecord(data) && typeof data.code === 'string' ? data.code : 'HTTP_ERROR',
            isRecord(data) && typeof data.message === 'string' ? data.message : `API request failed (${response.status}).`, data)
        }
        return request.parse ? request.parse(data) : data
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (error instanceof ContractValidationError) throw new ApiError(0, error.code, error.message, { issues: error.issues })
        if (controller.signal.aborted) throw new ApiError(0, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? 'API request timed out. Please retry.' : 'Request cancelled.')
        throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the application API. Check the backend connection.', error)
      } finally {
        clearTimeout(timeout)
        request.signal?.removeEventListener('abort', abort)
      }
  }
  return { request }
}
let configuredClient = createApiClient()
export function configureApiClient(options: Parameters<typeof createApiClient>[0]): void { configuredClient = createApiClient(options) }
export const apiClient: ApiClient = { get request() { return configuredClient.request } }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'An unexpected error occurred.' }
