import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient, ApiError } from '../src/services/api/client'
import { createExperimentsApi } from '../src/services/api/experiments'
import { runningExperiment } from './helpers/station'
import { callOperation } from '../src/services/api/operations'

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
  const api = createExperimentsApi(createApiClient({ fetcher: async (_url, options) => {
    requests.push(options ?? {})
    return Response.json(runningExperiment('CREATED'))
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
