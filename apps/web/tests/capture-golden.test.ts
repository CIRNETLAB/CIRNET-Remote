import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { decodeDigitalCapture } from '../src/services/captures/digital'
import { calibratedValue, decodeAnalogCapture, frameTimeNs } from '../src/domain/capture/ncap'
import { verifyAndDecodeAnalogCapture } from '../src/services/captures/analog'
import type { AnalogCaptureDescriptor } from '../src/contracts/generated/dto'
import type { CaptureMetadata, CaptureResult } from '../src/types/lab'
import {parseLab,ContractValidationError} from '../src/contracts/validation'
import {captureLayout} from '../src/contracts/generated/captureLayout'
import { captureFixture } from './helpers/capture'

test('NCAP v1 rejects nonintegral lexical count and duration tokens consistently with Python',()=>{
  for(const [count,duration] of [['1e0','0'],['1.0','0'],['1.0000000000000000001','0'],['1','0e0'],['1','0.0000000000000000001']]){
    const header=new TextEncoder().encode(`{"encoding":"digital_events","signals":["x"],"sample_count":${count},"duration_ns":${duration}}`)
    const bytes=new Uint8Array(9+header.length+11);bytes.set([78,67,65,80,1]);new DataView(bytes.buffer).setUint32(5,header.length,true);bytes.set(header,9)
    const metadata={...captureFixture('x').metadata,sample_count:1,duration_ns:0,signals:['x'],payload_byte_count:bytes.length}
    assert.throws(()=>decodeDigitalCapture(bytes.buffer,metadata),/capture/i)
  }
})

test('the browser consumes the same committed NCAP golden corpus as Python',()=>{
  assert.equal(existsSync('../../contracts/fixtures/capture/conformance.json'),true)
  assert.deepEqual(captureLayout,JSON.parse(readFileSync('../../contracts/capture/layout.json','utf8')))
})

interface GoldenCase {
  id:string;version:1|2;valid:boolean;payload_hex:string;metadata:CaptureMetadata;descriptor:AnalogCaptureDescriptor
  expected:{samples:number[]|CaptureResult['samples'];duration_ns:number;physical_values:number[];times_ns:{numerator:string;denominator:string}[]}
  expected_issue?:{code:string;path:string;severity:string;profile:string}
}
const corpus=JSON.parse(readFileSync('../../contracts/fixtures/capture/conformance.json','utf8')) as {cases:GoldenCase[]}
for(const entry of corpus.cases)test(`shared NCAP golden ${entry.id}`,async()=>{
  const buffer=Uint8Array.from(Buffer.from(entry.payload_hex,'hex')).buffer
  if(entry.expected_issue)assert.throws(()=>parseLab('AnalogCaptureDescriptor',entry.descriptor),(error:unknown)=>{
    assert(error instanceof ContractValidationError)
    const {code,path,severity,profile}=error.issues[0]!
    assert.deepEqual({code,path,severity,profile},entry.expected_issue)
    return true
  })
  if(!entry.valid){
    if(entry.version===1)assert.throws(()=>decodeDigitalCapture(buffer,entry.metadata),/capture/i)
    else await assert.rejects(verifyAndDecodeAnalogCapture(buffer,entry.descriptor),/capture/i)
    return
  }
  if(entry.version===1){
    assert.equal(createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),entry.metadata.sha256)
    const actual=decodeDigitalCapture(buffer,entry.metadata)
    assert.deepEqual(actual.samples,entry.expected.samples)
    assert.equal(actual.duration_ns,entry.expected.duration_ns)
  }else{
    const raw=decodeAnalogCapture(buffer,entry.descriptor)
    assert.equal(raw.integrity,'unchecked')
    const actual=await verifyAndDecodeAnalogCapture(buffer,entry.descriptor)
    assert.equal(actual.integrity,'verified')
    assert.deepEqual(Array.from(actual.samples),entry.expected.samples)
    assert.deepEqual(Array.from(actual.samples,(_,index)=>calibratedValue(actual,Math.floor(index/actual.descriptor.header.channels.length),index%actual.descriptor.header.channels.length)),entry.expected.physical_values)
    entry.expected.times_ns.forEach((time,index)=>{
      const actual=frameTimeNs(raw,index)
      assert.deepEqual({numerator:actual.numerator.toString(),denominator:actual.denominator.toString()},time)
    })
    new Uint8Array(buffer).fill(0)
    assert.deepEqual(Array.from(actual.samples),entry.expected.samples,'raw samples own their decoded storage')
  }
})
