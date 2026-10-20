import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient, ApiError } from '../src/services/api/client'
import { createExperimentsApi } from '../src/services/api/experiments'
import { runningExperiment } from './helpers/station'
import { callOperation } from '../src/services/api/operations'
import {sessionFixture} from './helpers/auth'

test('operation recovery queries the original identity without replaying a lifecycle command', async () => {
  const calls: { url: string; method: string }[] = []
  const record = { schema_version: '1.0', operation_key: 'lost/ack', kind: 'run', status: 'ACCEPTED', experiment_id: 'e1', error_code: null, revision: 2, experiment: runningExperiment() }
  const api = createExperimentsApi(createApiClient({ baseUrl: '/backend/api', fetcher: async (url, options) => {
    calls.push({ url: String(url), method: options?.method ?? 'GET' })
    return Response.json(record)
  } }))
  assert.equal(typeof api.operation, 'function')
  assert.deepEqual(await api.operation('lost/ack', { kind: 'run', experiment_id: 'e/1' }), record)
  assert.deepEqual(calls, [{ url: '/backend/api/operations/lost%2Fack?kind=run&experiment_id=e%2F1', method: 'GET' }])
})

test('lifecycle operation identity is sent through the generated optional header', async () => {
  const requests: RequestInit[] = []
  const api = createExperimentsApi(createApiClient({ fetcher: async (url, options) => {
    requests.push(options ?? {})
    return Response.json(runningExperiment('CREATED'),{status:String(url).endsWith('/experiments')?201:200})
  } }))
  await api.create({ station_id: 'v1', circuit_graph: { schema_version: '1.0', circuit_id: 'c1', modules: [], connections: [] } }, undefined, 'create-key')
  await api.run('e1', undefined, 'run-key')
  assert.deepEqual(requests.map(request => new Headers(request.headers).get('Idempotency-Key')), ['create-key', 'run-key'])
})

test('operation recovery rejects an invalid generated response contract', async () => {
  const api = createExperimentsApi(createApiClient({ fetcher: async () => Response.json({ schema_version: '1.0', operation_key: 'k', kind: 'run', status: 'UNKNOWN' }) }))
  assert.equal(typeof api.operation, 'function')
  await assert.rejects(api.operation('k'), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE')
})

function operationTypes() {
  const client=createApiClient()
  // @ts-expect-error The generated operation requires its named path parameter.
  callOperation(client,'getExperiment',{})
  // @ts-expect-error The generated operation requires a request DTO.
  callOperation(client,'createExperiment',{})
  // @ts-expect-error Read operations cannot acquire a command body.
  callOperation(client,'getExperiment',{path:{experiment_id:'e'},body:{}})
  // @ts-expect-error The generated operation name determines its response DTO.
  callOperation<'InventedReturnType'>(client,'getExperiment',{path:{experiment_id:'e'}})
  return callOperation(client,'getOperation',{path:{operation_key:'k'},query:{kind:'run'}})
}
void operationTypes

test('operation boundaries reject undocumented success statuses and malformed declared errors',async()=>{
  for(const status of [201,401,403,409,422]) {
    const client=createApiClient({fetcher:async()=>Response.json(status===201?runningExperiment():{code:'FORBIDDEN',message:'denied'},{status})})
    await assert.rejects(callOperation(client,'getExperiment',{path:{experiment_id:'e1'}}),
      (error:unknown)=>error instanceof ApiError&&error.code==='INVALID_RESPONSE',`status ${status}`)
  }
})

test('declared error envelopes are validated before exposing revision or operation details',async()=>{
  const valid={code:'REVISION_CONFLICT',message:'Changed.',request_id:'request-1',current_revision:3}
  for(const payload of [valid,{...valid,current_revision:'three'}]) {
    const client=createApiClient({fetcher:async()=>Response.json(payload,{status:409})})
    await assert.rejects(callOperation(client,'getExperiment',{path:{experiment_id:'e1'}}),
      (error:unknown)=>error instanceof ApiError&&error.code===(payload===valid?'REVISION_CONFLICT':'INVALID_RESPONSE'))
  }
})

test('malformed authentication denial invalidates only the matching current session',async()=>{
  let lost=0
  const client=createApiClient({csrfToken:()=> 'session',onAuthenticationLost:()=>lost++,fetcher:async()=>new Response('<html>no</html>',{status:401,headers:{'Content-Type':'text/html'}})})
  await assert.rejects(callOperation(client,'getExperiment',{path:{experiment_id:'e1'}}),(error:unknown)=>error instanceof ApiError&&error.code==='INVALID_RESPONSE')
  assert.equal(lost,1)
})

test('acceptStatuses does not bypass the documented legacy validation error schema',async()=>{
  const graph={schema_version:'1.0' as const,circuit_id:'c',modules:[],connections:[]}
  const client=createApiClient({fetcher:async()=>Response.json({code:'INVALID_CONTRACT',message:'invalid',request_id:'r'},{status:422})})
  await assert.rejects(callOperation(client,'validateCircuit',{body:graph,acceptStatuses:[422]}),(error:unknown)=>error instanceof ApiError&&error.code==='INVALID_RESPONSE')
})

test('documented media permits equivalent quoted parameters and case without weakening status or body validation',async()=>{
  const json=createApiClient({fetcher:async()=>Response.json(runningExperiment(),{headers:{'Content-Type':'Application/JSON; charset="UTF-8"'}})})
  assert.equal((await callOperation(json,'getExperiment',{path:{experiment_id:'e1'}})).experiment_id,'e1')
  const binary=createApiClient({fetcher:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'Application/Vnd.Netcircuit.Capture; version="1"'}})})
  assert.deepEqual(new Uint8Array(await callOperation(binary,'getCapturePayload',{path:{capture_id:'c1'}})),new Uint8Array([1,2,3]))
})

test('an already prepared core auth operation dispatches immediately and preserves its cancellation signal',async()=>{
  let dispatched=false,signal:AbortSignal|undefined
  const caller=new AbortController()
  const client=createApiClient({fetcher:async(_url,options)=>{dispatched=true;signal=options?.signal??undefined;return Response.json(sessionFixture())}})
  const pending=callOperation(client,'getSession',{signal:caller.signal})
  assert.equal(dispatched,true);assert.equal(signal?.aborted,false)
  await pending
})
