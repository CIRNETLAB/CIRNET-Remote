import { isRecord } from '../../types/api'

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly detail?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}
export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  acceptStatuses?: number[]
  responseType?: 'json' | 'arrayBuffer'
  accept?: string
  parse?: (value: unknown) => T
}
export interface ApiClient { request<T>(path: string, options?: RequestOptions<T>): Promise<T> }

export function createApiClient(options: { baseUrl?: string; timeoutMs?: number; fetcher?: typeof fetch } = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? '/api').replace(/\/$/, '')
  return {
    async request<T>(path: string, request: RequestOptions<T> = {}): Promise<T> {
      const controller = new AbortController()
      let timedOut = false
      const abort = () => controller.abort()
      request.signal?.addEventListener('abort', abort, { once: true })
      if (request.signal?.aborted) abort()
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 10_000)
      try {
        const response = await (options.fetcher ?? globalThis.fetch)(`${baseUrl}${path}`, {
          method: request.method ?? 'GET',
          headers: { Accept: request.accept ?? 'application/json', ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: request.body === undefined ? undefined : JSON.stringify(request.body), signal: controller.signal,
        })
        let data: unknown
        try { data = request.responseType === 'arrayBuffer' && response.ok ? await response.arrayBuffer() : await response.json() }
        catch {
          if (controller.signal.aborted) throw new ApiError(0, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? 'API request timed out. Please retry.' : 'Request cancelled.')
          throw new ApiError(response.status, 'INVALID_RESPONSE', 'The API returned an unreadable response.')
        }
        if (controller.signal.aborted) throw new ApiError(0, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? 'API request timed out. Please retry.' : 'Request cancelled.')
        if (!response.ok && !request.acceptStatuses?.includes(response.status)) {
          throw new ApiError(response.status,
            isRecord(data) && typeof data.code === 'string' ? data.code : 'HTTP_ERROR',
            isRecord(data) && typeof data.message === 'string' ? data.message : `API request failed (${response.status}).`, data)
        }
        return request.parse ? request.parse(data) : data as T
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (controller.signal.aborted) throw new ApiError(0, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_CANCELLED', timedOut ? 'API request timed out. Please retry.' : 'Request cancelled.')
        throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the application API. Check the backend connection.', error)
      } finally {
        clearTimeout(timeout)
        request.signal?.removeEventListener('abort', abort)
      }
    },
  }
}
let configuredClient = createApiClient()
export function configureApiClient(options: Parameters<typeof createApiClient>[0]): void { configuredClient = createApiClient(options) }
export const apiClient: ApiClient = { request: (path, options) => configuredClient.request(path, options) }
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'An unexpected error occurred.' }
