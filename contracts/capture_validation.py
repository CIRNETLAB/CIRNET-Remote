"""Relationships for sampled capture descriptors, without acquisition logic."""


def validate_capture_semantics(name, value, profile='transport', *, _path=()):
    from .semantic_profiles import _fail
    path=list(_path)
    if name=='AnalogCaptureDescriptor':
        return validate_capture_semantics('AnalogCaptureHeader',value['header'],profile,_path=(*path,'header'))
    if name=='AnalogCaptureChannel':
        if value['range_min']>=value['range_max']:
            _fail('CAPTURE_RANGE_ORDER',[*path,'range_max'],'Capture channel range must increase',profile)
    if name=='AnalogCaptureQuality':return _quality(value,profile,path)
    if name=='AnalogCaptureTimeAxis':
        if (value['clock_id'] is not None)!=(value['reference']=='device_clock'):
            _fail('CAPTURE_CLOCK_REFERENCE',[*path,'clock_id'],'Only a device clock requires a clock identity',profile)
        if value['reference']=='capture_relative' and value['anchor_ns']!='0':
            _fail('CAPTURE_TIME_ANCHOR',[*path,'anchor_ns'],'Capture-relative time starts at zero',profile)
    if name!='AnalogCaptureHeader':return
    channels=value['channels'];seen=set()
    for index,channel in enumerate(channels):
        if channel['id'] in seen:
            _fail('DUPLICATE_ID',[*path,'channels',index,'id'],'Duplicate capture channel',profile)
        seen.add(channel['id'])
        validate_capture_semantics('AnalogCaptureChannel',channel,profile,_path=(*path,'channels',index))
    if value['provenance']=='synthetic_fixture' and value['source']!='simulation':
        _fail('CAPTURE_PROVENANCE_MISMATCH',[*path,'provenance'],'Synthetic fixture must be labelled simulation',profile)
    validate_capture_semantics('AnalogCaptureTimeAxis',value['time_axis'],profile,_path=(*path,'time_axis'))
    _quality(value['quality'],profile,[*path,'quality'],count=value['frame_count'],ids=seen)


def _quality(quality,profile,qpath,*,count=None,ids=None):
    from .semantic_profiles import _fail
    if ids is not None and not set(quality['clipped_channels'])<=ids:
        _fail('CAPTURE_CHANNEL_REFERENCE',[*qpath,'clipped_channels'],'Clipped channel is absent from channel table',profile)
    previous=-1;missing=0
    for index,gap in enumerate(quality['gaps']):
        if not previous<gap['at_frame'] or count is not None and gap['at_frame']>count:
            _fail('CAPTURE_GAP_ORDER',[*qpath,'gaps',index],'Gaps must be ordered within the capture',profile)
        previous=gap['at_frame'];missing+=gap['missing_frames']
    if missing!=quality['lost_frames']:
        _fail('CAPTURE_LOSS_MISMATCH',[*qpath,'gaps'],'Gaps must account for every lost frame',profile)
    end=0
    for index,entry in enumerate(quality['invalid_ranges']):
        if entry['first_frame']<end or count is not None and entry['first_frame']+entry['frame_count']>count:
            _fail('CAPTURE_INVALID_RANGE',[*qpath,'invalid_ranges',index],'Invalid ranges must be ordered, disjoint and within stored frames',profile)
        end=entry['first_frame']+entry['frame_count']
    status=quality['status'];termination=quality['termination_reason'];lost=quality['lost_frames']
    if (status=='VALID' and (lost!=0 or quality['invalid_ranges'] or termination!='COMPLETE')
            or status=='PARTIAL' and (lost!=0 or termination=='COMPLETE' and not quality['invalid_ranges'])
            or status=='LOSS' and lost==0 or lost>0 and status not in ('LOSS','INVALID')
            or termination=='TRANSPORT_LOSS' and lost==0 and status!='INVALID'):
        _fail('CAPTURE_QUALITY_MISMATCH',[*qpath,'status'],'Capture quality and termination evidence disagree',profile)
