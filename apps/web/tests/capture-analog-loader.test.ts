import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import type {AnalogCaptureDescriptor} from '../src/contracts/generated/dto'
import {loadAnalogCapture,verifyAndDecodeAnalogCapture} from '../src/services/captures/analog'
import {ApiError} from '../src/services/api/client'
import {deferred} from './helpers/capture'

const entry=(JSON.parse(readFileSync('../../contracts/fixtures/capture/conformance.json','utf8')) as {cases:{id:string;payload_hex:string;descriptor:AnalogCaptureDescriptor}[]}).cases.find(entry=>entry.id==='v2-uint16-extrema')!
const binary=()=>Uint8Array.from(Buffer.from(entry.payload_hex,'hex')).buffer

test('sampled loading uses an explicit bounded source and snapshots descriptor identity before I/O',async()=>{
  const descriptor=structuredClone(entry.descriptor),body=deferred<ArrayBuffer>();let calls=0
  const pending=loadAnalogCapture(descriptor,{async payload(id,options){
    calls++;assert.equal(id,entry.descriptor.header.capture_id);assert.equal(options.maxBytes,entry.descriptor.payload_byte_count)
    return body.promise
  }})
  descriptor.header.capture_id='changed';descriptor.header.generation=999;descriptor.sha256='0'.repeat(64)
  body.resolve(binary())
  const actual=await pending
  assert.equal(calls,1);assert.equal(actual.descriptor.header.capture_id,entry.descriptor.header.capture_id)
  assert.equal(actual.integrity,'verified');assert.deepEqual(Array.from(actual.samples),[0,65535,42])
})

test('malformed sampled descriptors cannot start an unbounded source request',async()=>{
  const descriptor={...entry.descriptor,payload_byte_count:Number.MAX_SAFE_INTEGER};let calls=0
  await assert.rejects(loadAnalogCapture(descriptor,{async payload(){calls++;return binary()}}),/capture/i)
  assert.equal(calls,0)
})

test('cancelled or denied sampled loads never publish fallback evidence or replay requests',async()=>{
  const before=new AbortController();before.abort();let calls=0
  const source={async payload(){calls++;return binary()}}
  await assert.rejects(loadAnalogCapture(entry.descriptor,source,before.signal),(error:unknown)=>error instanceof ApiError&&error.code==='REQUEST_CANCELLED')
  assert.equal(calls,0)
  const pendingBody=deferred<ArrayBuffer>(),during=new AbortController()
  const pending=loadAnalogCapture(entry.descriptor,{async payload(_id,options){assert.equal(options.signal,during.signal);return pendingBody.promise}},during.signal)
  during.abort();pendingBody.resolve(binary())
  await assert.rejects(pending,(error:unknown)=>error instanceof ApiError&&error.code==='REQUEST_CANCELLED')
  await assert.rejects(loadAnalogCapture(entry.descriptor,{async payload(){calls++;throw new ApiError(404,'CAPTURE_NOT_FOUND','Unavailable.')}}),(error:unknown)=>error instanceof ApiError&&error.code==='CAPTURE_NOT_FOUND')
  assert.equal(calls,1)
})

test('integrity checking rejects body corruption even when its shape still decodes',async()=>{
  const bytes=binary();new Uint8Array(bytes)[bytes.byteLength-1]^=1
  await assert.rejects(verifyAndDecodeAnalogCapture(bytes,entry.descriptor),(error:unknown)=>error instanceof ApiError&&error.code==='CAPTURE_CORRUPT')
})

test('late hash completion cannot publish cancelled data or mutable descriptor changes',async()=>{
  const controller=new AbortController()
  const pending=verifyAndDecodeAnalogCapture(binary(),entry.descriptor,controller.signal)
  controller.abort()
  await assert.rejects(pending,(error:unknown)=>error instanceof ApiError&&error.code==='REQUEST_CANCELLED')
  const descriptor=structuredClone(entry.descriptor)
  const original=verifyAndDecodeAnalogCapture(binary(),descriptor)
  descriptor.sha256='0'.repeat(64);descriptor.header.generation=999
  const capture=await original
  assert.equal(capture.integrity,'verified')
  assert.equal(capture.descriptor.header.generation,entry.descriptor.header.generation)
})
