import type {AnalogCaptureQuality} from '../../contracts/generated/dto'
import {calibratedValue,frameTimeNs,type DecodedAnalogCapture,type ExactCaptureTime} from './ncap'

export interface DisplayEnvelopeOptions {channelId:string;startFrame?:number;endFrame?:number;pixels:number}
export interface DisplayEnvelopeBucket {
  readonly firstFrame:number;readonly lastFrame:number;readonly validSamples:number
  readonly minimum:number|null;readonly maximum:number|null
  readonly firstTimeNs:ExactCaptureTime;readonly lastTimeNs:ExactCaptureTime
  /** Approximate relative offsets for display; exact rational times remain above. */
  readonly startOffsetNs:number;readonly endOffsetNs:number
  readonly hasInvalidSamples:boolean;readonly discontinuous:boolean;readonly clipped:boolean
}
export interface DisplayEnvelope {
  readonly representation:'min_max_envelope';readonly channelId:string;readonly unit:string
  readonly source:DecodedAnalogCapture['descriptor']['header']['source']
  readonly provenance:DecodedAnalogCapture['descriptor']['header']['provenance']
  readonly timeReference:DecodedAnalogCapture['descriptor']['header']['time_axis']['reference']
  readonly clockId:string|null;readonly anchorNs:string
  readonly integrity:DecodedAnalogCapture['integrity'];readonly quality:AnalogCaptureQuality
  readonly buckets:readonly DisplayEnvelopeBucket[]
}

/** Explicit lossy display representation. No smoothing, interpolation or raw edits. */
export function createDisplayEnvelope(raw:DecodedAnalogCapture,options:DisplayEnvelopeOptions):DisplayEnvelope {
  const header=raw.descriptor.header,channelIndex=header.channels.findIndex(channel=>channel.id===options.channelId)
  const start=options.startFrame??0,end=options.endFrame??header.frame_count,pixels=options.pixels
  if(channelIndex<0||!Number.isSafeInteger(pixels)||pixels<1||pixels>4096||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>header.frame_count)throw new RangeError('Invalid capture display range or resolution.')
  const channel=header.channels[channelIndex]!,quality=header.quality,length=end-start,count=Math.min(pixels,length)
  const buckets:DisplayEnvelopeBucket[]=[]
  const offset=(frame:number)=>{
    const position=frame+quality.gaps.reduce((sum,gap)=>sum+(gap.at_frame<=frame?gap.missing_frames:0),0)
    return position*1000000000*header.time_axis.sample_rate_hz.denominator/header.time_axis.sample_rate_hz.numerator
  }
  // Sorted ranges permit a single forward scan, even at the 100k-frame bound.
  let invalidIndex=0
  while(invalidIndex<quality.invalid_ranges.length&&quality.invalid_ranges[invalidIndex]!.first_frame+quality.invalid_ranges[invalidIndex]!.frame_count<=start)invalidIndex++
  for(let bucket=0;bucket<count;bucket++){
    const first=start+Math.floor(bucket*length/count),last=start+Math.floor((bucket+1)*length/count)-1
    let minimum=Infinity,maximum=-Infinity,validSamples=0,hasInvalidSamples=false
    let clipped=quality.clipped_channels.includes(channel.id)
    for(let frame=first;frame<=last;frame++){
      while(invalidIndex<quality.invalid_ranges.length&&quality.invalid_ranges[invalidIndex]!.first_frame+quality.invalid_ranges[invalidIndex]!.frame_count<=frame)invalidIndex++
      const invalid=quality.invalid_ranges[invalidIndex]
      if(quality.status==='INVALID'||invalid&&invalid.first_frame<=frame){hasInvalidSamples=true;continue}
      const value=calibratedValue(raw,frame,channelIndex)
      minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);validSamples++
      clipped ||= value<channel.range_min||value>channel.range_max
    }
    buckets.push({firstFrame:first,lastFrame:last,validSamples,minimum:validSamples?minimum:null,maximum:validSamples?maximum:null,
      firstTimeNs:frameTimeNs(raw,first),lastTimeNs:frameTimeNs(raw,last),startOffsetNs:offset(first),endOffsetNs:offset(last),
      hasInvalidSamples,discontinuous:quality.gaps.some(gap=>gap.at_frame>=first&&gap.at_frame<=last),clipped})
  }
  return {representation:'min_max_envelope',channelId:channel.id,unit:channel.unit,source:header.source,provenance:header.provenance,
    timeReference:header.time_axis.reference,clockId:header.time_axis.clock_id,anchorNs:header.time_axis.anchor_ns,
    integrity:raw.integrity,quality:JSON.parse(JSON.stringify(quality)) as AnalogCaptureQuality,buckets}
}
