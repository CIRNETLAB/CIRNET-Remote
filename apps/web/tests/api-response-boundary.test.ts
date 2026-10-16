import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, createApiClient } from '../src/services/api/client'

const invalid = (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE'

test('HTTP 204 completes without attempting to decode JSON', async () => {
  const client = createApiClient({ fetcher: async () => new Response(null, { status: 204 }) })
  assert.equal(await client.request('/empty'), undefined)
})

test('JSON responses require a JSON media type even when their text is valid JSON', async () => {
  const invalidHeaders:Record<string,string>[]=[{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'text/html' }, {}]
  for (const headers of invalidHeaders) {
    const client = createApiClient({ fetcher: async () => new Response('{"valid":true}', { headers }) })
    await assert.rejects(client.request('/document'), invalid)
  }
  const client = createApiClient({ fetcher: async () => new Response('{"valid":true}', { headers: { 'Content-Type': 'application/example+json; charset=utf-8' } }) })
  assert.deepEqual(await client.request('/document'), { valid: true })
})

test('binary responses enforce the declared NCAP media type and version', async () => {
  const accept = 'application/vnd.netcircuit.capture; version=1'
  for (const type of ['application/json', 'application/octet-stream', 'application/vnd.netcircuit.capture; version=2']) {
    const client = createApiClient({ fetcher: async () => new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': type } }) })
    await assert.rejects(client.request('/capture', { responseType: 'arrayBuffer', accept }), invalid)
  }
  const client = createApiClient({ fetcher: async () => new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': accept } }) })
  assert.deepEqual(new Uint8Array(await client.request('/capture', { responseType: 'arrayBuffer', accept })), new Uint8Array([1, 2]))
})

test('streamed bodies cannot exceed response bounds when Content-Length is absent', async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4])); controller.enqueue(new Uint8Array([5, 6])); controller.close() }, cancel() { cancelled = true } })
  const client = createApiClient({ fetcher: async () => new Response(stream, { headers: { 'Content-Type': 'application/octet-stream' } }) })
  await assert.rejects(client.request('/large', { responseType: 'arrayBuffer', maxResponseBytes: 3 }), invalid)
  assert.equal(cancelled, true)
  const json = createApiClient({ fetcher: async () => Response.json({ example: 'larger than bound' }) })
  await assert.rejects(json.request('/large-json', { maxResponseBytes: 5 }), invalid)
})

test('declared oversized payloads are rejected and their body is cancelled', async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); controller.close() }, cancel() { cancelled = true } })
  const client = createApiClient({ fetcher: async () => new Response(stream, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '9999' } }) })
  await assert.rejects(client.request('/large', { responseType: 'arrayBuffer', maxResponseBytes: 10 }), invalid)
  assert.equal(cancelled, true)
})

test('caller abort cancels a pending response stream immediately', async () => {
  let cancelled = false
  const controller = new AbortController()
  const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true } })
  const client = createApiClient({ fetcher: async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }) })
  const pending = client.request('/waiting', { signal: controller.signal })
  await Promise.resolve(); await Promise.resolve()
  controller.abort()
  await assert.rejects(pending, (error: unknown) => error instanceof ApiError && error.code === 'REQUEST_CANCELLED')
  assert.equal(cancelled, true)
})

test('mutations take current in-memory CSRF and control identity while reads contain neither', async () => {
  let csrf:string|null='first-token'
  const requests:{url:string;headers:Headers;credentials:RequestCredentials|undefined}[]=[]
  const client=createApiClient({csrfToken:()=>csrf,controlClientId:()=> 'tab-client',fetcher:async(url,options)=>{
    requests.push({url:String(url),headers:new Headers(options?.headers),credentials:options?.credentials})
    return Response.json({ok:true})
  }})
  await client.request('/session')
  await client.request('/login',{method:'POST',body:{username:'student',password:'never-persist'}})
  csrf='rotated-token'
  await client.request('/change',{method:'DELETE',headers:{'X-CSRF-Token':'obsolete'}})
  assert.equal(requests[0].headers.get('X-CSRF-Token'),null)
  assert.equal(requests[0].headers.get('X-Control-Client'),null)
  assert.equal(requests[1].headers.get('X-CSRF-Token'),'first-token')
  assert.equal(requests[2].headers.get('X-CSRF-Token'),'rotated-token')
  assert.equal(requests[1].headers.get('X-Control-Client'),'tab-client')
  assert.equal(requests[2].headers.get('X-Control-Client'),'tab-client')
  assert.equal(requests.every(request=>request.credentials==='same-origin'),true)
  assert.equal(requests.some(request=>request.url.includes('token')),false)
})

test('expired sessions notify auth once while invalid credentials and stale prior-session denials preserve the current session', async () => {
  let lost=0,token='old'
  let status='AUTHENTICATION_REQUIRED'
  let rotate=false
  const client=createApiClient({csrfToken:()=>token,onAuthenticationLost:()=>lost++,fetcher:async()=>{
    if(rotate) token='new'
    return Response.json({code:status,message:'Authentication failed.'},{status:401})
  }})
  await assert.rejects(client.request('/protected'))
  assert.equal(lost,1)
  status='INVALID_CREDENTIALS'
  await assert.rejects(client.request('/auth/login',{method:'POST'}))
  assert.equal(lost,1)
  status='AUTHENTICATION_REQUIRED';rotate=true
  await assert.rejects(client.request('/protected'))
  assert.equal(lost,1)
})

test('a rejected current CSRF context is invalidated without replaying the mutation',async()=>{
  let requests=0,lost=0
  const client=createApiClient({csrfToken:()=> 'current-token',onAuthenticationLost:()=>lost++,fetcher:async()=>{
    requests++;return Response.json({code:'CSRF_REJECTED',message:'Refresh the current session.'},{status:403})
  }})
  await assert.rejects(client.request('/command',{method:'POST'}))
  assert.equal(requests,1);assert.equal(lost,1)
})
