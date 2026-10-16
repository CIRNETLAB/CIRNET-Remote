import { apiOperations, type ApiOperations, type OperationName } from '../../contracts/generated/operations'
import { parseLab } from '../../contracts/validation'
import { ApiError, type ApiClient } from './client'

type CallerParameters<K extends OperationName,P extends 'path'|'query'|'headers'>=P extends 'headers'
  ?Omit<ApiOperations[K][P],'X-Control-Client'|'X-CSRF-Token'|'Origin'>:ApiOperations[K][P]
type Parameter<K extends OperationName, P extends 'path' | 'query' | 'headers'> =
  keyof CallerParameters<K,P> extends never ? { [N in P]?: never } :
  {} extends CallerParameters<K,P> ? { [N in P]?: CallerParameters<K,P> } : { [N in P]: CallerParameters<K,P> }
export type OperationOptions<K extends OperationName> = Parameter<K, 'path'> & Parameter<K, 'query'> & Parameter<K, 'headers'>
  & (ApiOperations[K]['request'] extends undefined ? { body?: never } : { body: ApiOperations[K]['request'] })
  & { signal?: AbortSignal; acceptStatuses?: number[]; maxResponseBytes?: number;controlContext?:true }

/** Bind paths, methods and runtime response contracts to the generated OpenAPI operation. */
export async function callOperation<K extends OperationName>(client: ApiClient, name: K, options: OperationOptions<K>): Promise<ApiOperations[K]['response']> {
  const operation = apiOperations[name]
  // The configured client base owns the /api prefix (including deployments under a subpath).
  let path: string = operation.path.replace(/^\/api(?=\/|$)/, '')
  for (const [key, value] of Object.entries(options.path ?? {})) path = path.replace(`{${key}}`, encodeURIComponent(String(value)))
  if (/\{[^}]+\}/.test(path)) throw new ApiError(0, 'INVALID_REQUEST', 'A required API path parameter is missing.')
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== null && value !== undefined) query.set(key, String(value))
  if (query.size) path += '?' + query.toString()
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(options.headers ?? {})) if (value !== null && value !== undefined) headers[key] = String(value)
  const common = { method: operation.method, body: options.body, signal: options.signal, headers,
    acceptStatuses: options.acceptStatuses, maxResponseBytes: options.maxResponseBytes,controlContext:options.controlContext }
  if (operation.requestContract) parseLab(operation.requestContract, options.body)
  let result: unknown
  if (operation.binary) result = await client.request(path, { ...common, responseType: 'arrayBuffer', accept: operation.responseMedia[0] })
  else result = await client.request(path, { ...common, parse(value) {
    const contract = operation.responseContract
    if (!contract) throw new ApiError(0, 'INVALID_RESPONSE', 'The generated API operation has no response contract.')
    if (!operation.responseArray) return parseLab(contract, value)
    if (!Array.isArray(value)) throw new ApiError(0, 'INVALID_RESPONSE', 'The API returned an invalid list.')
    return value.map(item => parseLab(contract, item))
  } })
  // Generation binds this operation's response DTO to the same validated contract and array/media mode.
  return result as ApiOperations[K]['response']
}
