import { apiOperations, type ApiOperations, type OperationName } from '../../contracts/generated/operations'
import { parseLab } from '../../contracts/validation'
import { ApiError, type ApiClient } from './client'
import type { ContractMap } from '../../contracts/generated/dto'
import {contractsReady,prepareContracts} from '../../contracts/structural'

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
  const required=new Set<keyof ContractMap>()
  if(operation.requestContract)required.add(operation.requestContract)
  const responseBindings:Record<string,Record<string,{contract:keyof ContractMap|null;array:boolean;binary:boolean}>>=operation.responses
  for(const bindings of Object.values(responseBindings))for(const binding of Object.values(bindings))if(binding.contract)required.add(binding.contract)
  if(!contractsReady([...required]))await prepareContracts([...required])
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
    acceptStatuses: options.acceptStatuses, maxResponseBytes: options.maxResponseBytes,controlContext:options.controlContext,
    validateResponse(status:number,contentType:string,value:unknown) {
      const responses:Record<string,Record<string,{contract:string|null;array:boolean;binary:boolean}>>=operation.responses
      const bindings=responses[String(status)]
      if(!bindings)throw new ApiError(status,'INVALID_RESPONSE','The API returned an undocumented status.')
      if(!Object.keys(bindings).length) {
        if(value!==undefined)throw new ApiError(status,'INVALID_RESPONSE','The API returned an unexpected body.')
        return
      }
      const normalize=(media:string)=>{
        const [type,...parameters]=media.toLowerCase().split(';').map(part=>part.trim())
        return [type,...parameters.map(parameter=>parameter.replace(/\s*=\s*/, '=').replace(/="([^"]*)"$/, '=$1')).sort()].join(';')
      }
      const received=normalize(contentType)
      const expected=Object.keys(bindings).find(media=>normalize(media)===received
        ||media==='application/json'&&received==='application/json;charset=utf-8')
      const binding=expected?bindings[expected]:undefined
      if(!binding)throw new ApiError(status,'INVALID_RESPONSE','The API returned undocumented response media.')
      if(binding.binary){if(!(value instanceof ArrayBuffer))throw new ApiError(status,'INVALID_RESPONSE','The API returned an invalid binary response.');return}
      if(!binding.contract)throw new ApiError(status,'INVALID_RESPONSE','The operation response has no canonical contract.')
      const contract=binding.contract as keyof ContractMap
      if(binding.array) {
        if(!Array.isArray(value))throw new ApiError(status,'INVALID_RESPONSE','The API returned an invalid list.')
        value.forEach(item=>parseLab(contract,item))
      } else parseLab(contract,value)
    } }
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
