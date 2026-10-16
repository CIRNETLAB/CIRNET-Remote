import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createApiClient, ApiError } from '../src/services/api/client'
import { createCircuitsApi } from '../src/services/api/circuits'
import { createStationsApi } from '../src/services/api/stations'
import { stationFixture } from './helpers/station'

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createServer(async (request, response) => {
    if (request.url === '/api/slow') return
    if (request.url === '/api/broken') { response.end('<html>Bad gateway</html>'); return }
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/api/fault') { response.writeHead(503); response.end(JSON.stringify({ code: 'STATION_UNAVAILABLE', message: 'Station offline' })); return }
    if (request.url === '/api/stations') { response.end(JSON.stringify([stationFixture('physical-1','hardware','busy')])); return }
    if (request.url === '/api/malformed/stations') { response.end(JSON.stringify([{ station_id: 'physical-1', mode: 'hardware', state: ['error'] }])); return }
    if (request.url === '/api/circuits/validate') {
      let body = ''
      for await (const chunk of request) body += chunk
      assert.equal(request.headers['content-type'], 'application/json')
      assert.equal(JSON.parse(body).schema_version, '1.0')
      response.writeHead(422)
      response.end(JSON.stringify({ valid: false, code: 'INVALID_CONNECTION', message: 'Unknown module' }))
      return
    }
    response.end(JSON.stringify({ status: 'ok', service: 'netcircuit-api', hardware_mode: 'simulation' }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  try { await run(`http://127.0.0.1:${address.port}/api`) }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
}

test('HTTP failures retain structured API code and message', () => withServer(async (baseUrl) => {
  await assert.rejects(createApiClient({ baseUrl }).request('/fault'), (error: unknown) =>
    error instanceof ApiError && error.status === 503 && error.code === 'STATION_UNAVAILABLE' && error.message === 'Station offline')
}))

test('non-JSON successful responses are rejected', () => withServer(async (baseUrl) => {
  await assert.rejects(createApiClient({ baseUrl }).request('/broken'), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE')
}))

test('network errors have a stable application error code', async () => {
  const client = createApiClient({ fetcher: async () => { throw new TypeError('Failed to fetch') } })
  await assert.rejects(client.request('/health'), (error: unknown) => error instanceof ApiError && error.code === 'NETWORK_ERROR')
})

test('slow requests time out and caller cancellation is preserved', () => withServer(async (baseUrl) => {
  const client = createApiClient({ baseUrl, timeoutMs: 25 })
  await assert.rejects(client.request('/slow'), (error: unknown) => error instanceof ApiError && error.code === 'REQUEST_TIMEOUT')
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(client.request('/slow', { signal: controller.signal }), (error: unknown) => error instanceof ApiError && error.code === 'REQUEST_CANCELLED')
}))

test('circuit validation treats structured 422 as a validation result', () => withServer(async (baseUrl) => {
  const api = createCircuitsApi(createApiClient({ baseUrl }))
  assert.deepEqual(await api.validate({ schema_version: '1.0', circuit_id: 'draft-1', modules: [], connections: [] }),
    { valid: false, code: 'INVALID_CONNECTION', message: 'Unknown module' })
}))

test('station discovery validates wire descriptors and maps hardware busy', () => withServer(async (baseUrl) => {
  const stations = await createStationsApi(createApiClient({ baseUrl })).list()
  assert.equal(stations[0].status, 'HARDWARE_BUSY')
  assert.equal(stations[0].station_id, 'physical-1')
  await assert.rejects(createStationsApi(createApiClient({ baseUrl: baseUrl + '/malformed' })).list(), (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE')
}))

test('typed instrument access GET injects the tab control identity without exposing mutation headers on ordinary reads',async()=>{
 const observed:Headers[]=[]
 const client=createApiClient({controlClientId:()=> 'tab-control-identity',csrfToken:()=> 'volatile-csrf',fetcher:async(_url,options)=>{observed.push(new Headers(options?.headers));return Response.json({schema_version:'1.0',experiment_id:'e1',revision:1,can_configure_generator:false,generator_channels:[],reason:'CONTROL_CONTEXT_REQUIRED'})}})
 const {createInstrumentsApi}=await import('../src/services/api/instruments')
 await client.request('/ordinary-read');await createInstrumentsApi(client).access('e1')
 assert.equal(observed[0]!.get('X-Control-Client'),null);assert.equal(observed[1]!.get('X-Control-Client'),'tab-control-identity');assert.equal(observed[1]!.get('X-CSRF-Token'),null)
})
