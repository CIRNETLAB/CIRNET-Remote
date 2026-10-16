import type { AnalogCaptureChannel, AnalogCaptureDescriptor, AnalogCaptureHeader, AnalogCaptureQuality, AnalogCaptureTimeAxis } from '../../contracts/generated/dto'
import { contractIssue, type ValidationProfile } from '../../contracts/structural'

/** Shape is generated. These relationships never infer acquisition success. */
export function validateAnalogCapture(name: string, value: unknown, profile: ValidationProfile='transport', path=''): void {
  const fail=(code:string,at:string,message:string):never=>contractIssue(message,path+at,code,profile)
  if(name==='AnalogCaptureDescriptor')return validateAnalogCapture('AnalogCaptureHeader',(value as AnalogCaptureDescriptor).header,profile,path+'/header')
  if(name==='AnalogCaptureQuality')return qualityRelationships(value as AnalogCaptureQuality,profile,path)
  if(name==='AnalogCaptureTimeAxis'){
    const axis=value as AnalogCaptureTimeAxis
    if((axis.clock_id!==null)!==(axis.reference==='device_clock'))fail('CAPTURE_CLOCK_REFERENCE','/clock_id','Only a device clock requires a clock identity.')
    if(axis.reference==='capture_relative'&&axis.anchor_ns!=='0')fail('CAPTURE_TIME_ANCHOR','/anchor_ns','Capture-relative time starts at zero.')
  }
  if(name==='AnalogCaptureChannel'){
    const channel=value as AnalogCaptureChannel
    if(channel.range_min>=channel.range_max)fail('CAPTURE_RANGE_ORDER','/range_max','Capture channel range must increase.')
  }
  if(name!=='AnalogCaptureHeader')return
  const header=value as AnalogCaptureHeader,ids=new Set<string>()
  header.channels.forEach((channel,index)=>{
    if(ids.has(channel.id))fail('DUPLICATE_ID',`/channels/${index}/id`,'Duplicate capture channel.')
    ids.add(channel.id)
    validateAnalogCapture('AnalogCaptureChannel',channel,profile,`${path}/channels/${index}`)
  })
  if(header.provenance==='synthetic_fixture'&&header.source!=='simulation')fail('CAPTURE_PROVENANCE_MISMATCH','/provenance','Synthetic fixture must be labelled simulation.')
  validateAnalogCapture('AnalogCaptureTimeAxis',header.time_axis,profile,path+'/time_axis')
  qualityRelationships(header.quality,profile,path+'/quality',header.frame_count,ids)
}

function qualityRelationships(quality:AnalogCaptureQuality,profile:ValidationProfile,path:string,count?:number,ids?:Set<string>){
  const fail=(code:string,at:string,message:string):never=>contractIssue(message,path+at,code,profile)
  if(ids&&quality.clipped_channels.some(id=>!ids.has(id)))fail('CAPTURE_CHANNEL_REFERENCE','/clipped_channels','Clipped channel is absent from channel table.')
  let previous=-1,missing=0
  quality.gaps.forEach((gap,index)=>{
    if(!(previous<gap.at_frame)||count!==undefined&&gap.at_frame>count)fail('CAPTURE_GAP_ORDER',`/gaps/${index}`,'Gaps must be ordered within the capture.')
    previous=gap.at_frame;missing+=gap.missing_frames
  })
  if(missing!==quality.lost_frames)fail('CAPTURE_LOSS_MISMATCH','/gaps','Gaps must account for every lost frame.')
  let end=0
  quality.invalid_ranges.forEach((entry,index)=>{
    if(entry.first_frame<end||count!==undefined&&entry.first_frame+entry.frame_count>count)fail('CAPTURE_INVALID_RANGE',`/invalid_ranges/${index}`,'Invalid ranges must be ordered, disjoint and within stored frames.')
    end=entry.first_frame+entry.frame_count
  })
  const status=quality.status,termination=quality.termination_reason,lost=quality.lost_frames
  if(status==='VALID'&&(lost!==0||quality.invalid_ranges.length>0||termination!=='COMPLETE')
    ||status==='PARTIAL'&&(lost!==0||termination==='COMPLETE'&&quality.invalid_ranges.length===0)
    ||status==='LOSS'&&lost===0||lost>0&&!['LOSS','INVALID'].includes(status)
    ||termination==='TRANSPORT_LOSS'&&lost===0&&status!=='INVALID')fail('CAPTURE_QUALITY_MISMATCH','/status','Capture quality and termination evidence disagree.')
}
