import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import type {AnalogCaptureDescriptor} from '../src/contracts/generated/dto'
import {decodeAnalogCapture,type DecodedAnalogCapture} from '../src/domain/capture/ncap'
import {createDisplayEnvelope} from '../src/domain/capture/envelope'

const cases=(JSON.parse(readFileSync('../../contracts/fixtures/capture/conformance.json','utf8')) as {cases:{id:string;payload_hex:string;descriptor:AnalogCaptureDescriptor}[]}).cases
function fixture(id:string){const entry=cases.find(entry=>entry.id===id)!;return decodeAnalogCapture(Uint8Array.from(Buffer.from(entry.payload_hex,'hex')).buffer,entry.descriptor)}

test('display envelopes bound buckets while preserving every extremum and all raw samples',()=>{
  const template=fixture('v2-int16-interleaved-negative-calibration'),descriptor=structuredClone(template.descriptor)
  descriptor.header.channels=[descriptor.header.channels[0]!];descriptor.header.frame_count=100000
  const samples=new Int16Array(100000);for(let index=0;index<samples.length;index++)samples[index]=index%5===0?-32768:index%3===0?32767:2
  const raw:DecodedAnalogCapture={descriptor,samples,integrity:'verified'},before=samples.slice()
  const display=createDisplayEnvelope(raw,{channelId:'CH1',pixels:64})
  assert.equal(display.buckets.length,64)
  assert.equal(display.representation,'min_max_envelope')
  assert.equal(display.unit,'V')
  assert.equal(display.integrity,'verified')
  assert.equal(Math.min(...display.buckets.map(bucket=>bucket.minimum!)),-327.68)
  assert.equal(Math.max(...display.buckets.map(bucket=>bucket.maximum!)),327.67)
  assert.equal(display.buckets.reduce((sum,bucket)=>sum+bucket.validSamples,0),100000)
  assert.deepEqual(samples,before)
  assert.equal(display.buckets[0]!.clipped,true,'observed range exceedance is labelled, never clamped')
})

test('gaps, invalid samples, calibration sign and termination remain explicit display evidence',()=>{
  const raw=fixture('v2-loss-gaps-invalid-range-clipped'),before=raw.samples.slice()
  const envelope=createDisplayEnvelope(raw,{channelId:'CH1',pixels:3})
  assert.deepEqual(envelope.buckets.map(bucket=>bucket.validSamples),[1,0,1])
  assert.deepEqual(envelope.buckets.map(bucket=>bucket.discontinuous),[true,false,true])
  assert.equal(envelope.buckets[1]!.minimum,null)
  assert.equal(envelope.buckets[1]!.hasInvalidSamples,true)
  assert.equal(envelope.quality.status,'LOSS')
  assert.equal(envelope.quality.lost_frames,5)
  assert.equal(envelope.quality.termination_reason,'TRANSPORT_LOSS')
  assert.equal(envelope.provenance,'synthetic_fixture')
  assert.equal(envelope.timeReference,'unix_epoch')
  assert.equal(envelope.clockId,null)
  assert.equal(envelope.anchorNs,raw.descriptor.header.time_axis.anchor_ns)
  assert.deepEqual(raw.samples,before)
  const negative=createDisplayEnvelope(fixture('v2-int16-interleaved-negative-calibration'),{channelId:'CH2',pixels:1})
  assert.equal(negative.buckets[0]!.minimum,-16381.5)
  assert.equal(negative.buckets[0]!.maximum,3)
})

test('display retains explicit relative and device clock identities without UTC inference',()=>{
  const relative=createDisplayEnvelope(fixture('v2-capture-relative-clock'),{channelId:'CH1',pixels:1})
  assert.equal(relative.timeReference,'capture_relative');assert.equal(relative.anchorNs,'0');assert.equal(relative.clockId,null)
  const device=createDisplayEnvelope(fixture('v2-device-clock-is-not-UTC'),{channelId:'CH1',pixels:1})
  assert.equal(device.timeReference,'device_clock');assert.equal(device.clockId,'synthetic-device-clock')
})

test('INVALID evidence is retained raw but never presented as trusted amplitude',()=>{
  const raw=fixture('v2-invalid-evidence-retained')
  const envelope=createDisplayEnvelope(raw,{channelId:'CH1',pixels:2})
  assert(envelope.buckets.every(bucket=>bucket.minimum===null&&bucket.maximum===null&&bucket.validSamples===0&&bucket.hasInvalidSamples))
  assert.deepEqual(Array.from(raw.samples),[1,2,3])
  assert.equal(createDisplayEnvelope(fixture('v2-empty'),{channelId:'CH1',pixels:2}).buckets.length,0)
})

test('display ranges and output bounds fail explicitly without changing raw data',()=>{
  const raw=fixture('v2-uint16-extrema')
  for(const options of [{channelId:'missing',pixels:1},{channelId:'CH1',pixels:0},{channelId:'CH1',pixels:4097},{channelId:'CH1',pixels:1.5},{channelId:'CH1',pixels:1,startFrame:-1},{channelId:'CH1',pixels:1,endFrame:4},{channelId:'CH1',pixels:1,startFrame:2,endFrame:1}])assert.throws(()=>createDisplayEnvelope(raw,options),RangeError)
  const cropped=createDisplayEnvelope(raw,{channelId:'CH1',pixels:1,startFrame:1,endFrame:3})
  assert.equal(cropped.buckets[0]!.firstFrame,1)
  assert.equal(cropped.buckets[0]!.lastFrame,2)
  assert.equal(cropped.buckets[0]!.maximum,655.35)
})
