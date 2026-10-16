import type { AnalogCaptureDescriptor } from '../../contracts/generated/dto'
import { captureLayout } from '../../contracts/generated/captureLayout'
import { parseStructural } from '../../contracts/structural'
import { parseCaptureHeader } from './json'
import { validateAnalogCapture } from './validation'

export type AnalogSamples=Int16Array|Uint16Array|Float32Array
export interface DecodedAnalogCapture {
  readonly descriptor:AnalogCaptureDescriptor
  /** Owned frame-interleaved samples. Display transforms never rewrite this array. */
  readonly samples:AnalogSamples
  readonly integrity:'unchecked'|'verified'
}
export class CaptureDecodeError extends Error {
  readonly code='CAPTURE_CORRUPT'
  constructor(){super('Capture payload is corrupt or does not match its descriptor.');this.name='CaptureDecodeError'}
}
const corrupt=():never=>{throw new CaptureDecodeError()}
const stable=(value:unknown):string=>{
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']'
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable((value as Record<string,unknown>)[key])).join(',')+'}'
  return JSON.stringify(value)
}

export function parseAnalogCaptureDescriptor(value:unknown):AnalogCaptureDescriptor {
  try{
    const descriptor=parseStructural('AnalogCaptureDescriptor',value)
    validateAnalogCapture('AnalogCaptureDescriptor',descriptor)
    return JSON.parse(JSON.stringify(descriptor)) as AnalogCaptureDescriptor
  }catch{return corrupt()}
}

/** Decode structure only; the async service also checks SHA before publishing. */
export function decodeAnalogCapture(binary:ArrayBuffer,descriptor:AnalogCaptureDescriptor):DecodedAnalogCapture {
  try {
    descriptor=parseAnalogCaptureDescriptor(descriptor)
    const prefix=captureLayout.prefix,v2=captureLayout.sampled_v2
    if(!(binary instanceof ArrayBuffer)||binary.byteLength!==descriptor.payload_byte_count||binary.byteLength<prefix.byte_length)return corrupt()
    const view=new DataView(binary)
    if(view.getUint32(0,false)!==Number.parseInt(prefix.magic_hex,16)||view.getUint8(prefix.version_offset)!==v2.version)return corrupt()
    const size=view.getUint32(prefix.header_length_offset,true)
    if(size===0||size>captureLayout.max_header_bytes||prefix.byte_length+size>binary.byteLength)return corrupt()
    const header=parseStructural('AnalogCaptureHeader',parseCaptureHeader(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(new Uint8Array(binary,prefix.byte_length,size))))
    validateAnalogCapture('AnalogCaptureHeader',header)
    if(stable(header)!==stable(descriptor.header))return corrupt()
    const encoding=v2.encodings[header.encoding],count=header.frame_count*header.channels.length,start=prefix.byte_length+size
    if(start+count*encoding.bytes_per_value!==binary.byteLength)return corrupt()
    const samples:AnalogSamples=header.encoding==='INT16'?new Int16Array(count):header.encoding==='UINT16'?new Uint16Array(count):new Float32Array(count)
    for(let index=0;index<count;index++){
      const offset=start+index*encoding.bytes_per_value
      const value=header.encoding==='INT16'?view.getInt16(offset,true):header.encoding==='UINT16'?view.getUint16(offset,true):view.getFloat32(offset,true)
      const channel=header.channels[index%header.channels.length]!
      if(!Number.isFinite(value)||!Number.isFinite(value*channel.scale+channel.offset))return corrupt()
      samples[index]=value
    }
    return {descriptor,samples,integrity:'unchecked'}
  }catch(error){if(error instanceof CaptureDecodeError)throw error;return corrupt()}
}

export interface ExactCaptureTime { readonly numerator:bigint;readonly denominator:bigint }
export function frameTimeNs(capture:DecodedAnalogCapture,frame:number):ExactCaptureTime {
  const header=capture.descriptor.header
  if(!Number.isSafeInteger(frame)||frame<0||frame>=header.frame_count)throw new RangeError('Capture frame is out of range.')
  const axis=header.time_axis,rate=axis.sample_rate_hz
  const position=frame+header.quality.gaps.reduce((sum,gap)=>sum+(gap.at_frame<=frame?gap.missing_frames:0),0)
  return {numerator:BigInt(axis.anchor_ns)*BigInt(rate.numerator)+BigInt(position)*1000000000n*BigInt(rate.denominator),denominator:BigInt(rate.numerator)}
}

export function calibratedValue(capture:DecodedAnalogCapture,frame:number,channelIndex:number):number {
  const header=capture.descriptor.header
  if(!Number.isSafeInteger(frame)||frame<0||frame>=header.frame_count||!Number.isSafeInteger(channelIndex)||channelIndex<0||channelIndex>=header.channels.length)throw new RangeError('Capture sample is out of range.')
  const channel=header.channels[channelIndex]!
  return capture.samples[frame*header.channels.length+channelIndex]!*channel.scale+channel.offset
}
