from copy import deepcopy

import pytest
from jsonschema import ValidationError

from contracts.registry import validate_contract


def header():
    return {'format':'NCAP_SAMPLED_V2','capture_id':'synthetic','generation':0,
            'source':'simulation','provenance':'synthetic_fixture','instrument':'oscilloscope',
            'encoding':'INT16','byte_order':'little','layout':'frame_interleaved','frame_count':3,
            'channels':[{'id':'CH1','unit':'V','scale':0.01,'offset':0,'range_min':-10,
                         'range_max':10,'calibration_id':None}],
            'time_axis':{'reference':'unix_epoch','clock_id':None,'anchor_ns':'9007199254740993000','sample_rate_hz':{'numerator':3,'denominator':2}},
            'quality':{'status':'VALID','termination_reason':'COMPLETE','lost_frames':0,'gaps':[],
                       'invalid_ranges':[],'clipped_channels':[]}}


@pytest.mark.parametrize('mutate,code,path',[
    (lambda v:v['channels'][0].update(range_max=-10),'CAPTURE_RANGE_ORDER','/channels/0/range_max'),
    (lambda v:v['channels'].append(deepcopy(v['channels'][0])),'DUPLICATE_ID','/channels/1/id'),
    (lambda v:v['quality'].update(clipped_channels=['CH2']),'CAPTURE_CHANNEL_REFERENCE','/quality/clipped_channels'),
    (lambda v:v['quality'].update(status='LOSS',lost_frames=2),'CAPTURE_LOSS_MISMATCH','/quality/gaps'),
    (lambda v:v['quality'].update(status='PARTIAL'),'CAPTURE_QUALITY_MISMATCH','/quality/status'),
    (lambda v:v['quality'].update(invalid_ranges=[{'first_frame':2,'frame_count':2}]),'CAPTURE_INVALID_RANGE','/quality/invalid_ranges/0'),
    (lambda v:v.update(source='hardware'),'CAPTURE_PROVENANCE_MISMATCH','/provenance'),
])
def test_sampled_descriptor_relationships_are_shared(mutate,code,path):
    value=header();mutate(value)
    with pytest.raises(ValidationError) as caught:validate_contract('AnalogCaptureHeader',value)
    assert caught.value.issues[0]['code']==code
    assert caught.value.issues[0]['path']==path


def test_loss_and_partial_ranges_have_explicit_timing_and_quality():
    value=header()
    value['quality'].update(status='LOSS',termination_reason='TRANSPORT_LOSS',lost_frames=2,
                            gaps=[{'at_frame':1,'missing_frames':2}],
                            invalid_ranges=[{'first_frame':2,'frame_count':1}])
    assert validate_contract('AnalogCaptureHeader',value)==value
    value['quality'].update(status='PARTIAL',termination_reason='STOPPED',lost_frames=0,gaps=[])
    assert validate_contract('AnalogCaptureHeader',value)==value


@pytest.mark.parametrize('change',[{'status':'LOSS'},{'lost_frames':1},{'status':'PARTIAL'},
    {'status':'PARTIAL','invalid_ranges':[{'first_frame':1,'frame_count':2},{'first_frame':2,'frame_count':1}]}])
def test_standalone_quality_contract_enforces_context_independent_relationships(change):
    quality=header()['quality'];quality.update(change)
    with pytest.raises(ValidationError):validate_contract('AnalogCaptureQuality',quality,profile='transport')


@pytest.mark.parametrize('change',[{'reference':'device_clock'},{'clock_id':'unexpected'},
                                  {'reference':'capture_relative'}])
def test_time_axis_requires_an_explicit_coherent_clock_reference(change):
    axis=header()['time_axis'];axis.update(change)
    with pytest.raises(ValidationError):validate_contract('AnalogCaptureTimeAxis',axis,profile='transport')


def test_time_axis_cannot_omit_its_reference():
    axis=header()['time_axis'];del axis['reference']
    with pytest.raises(ValidationError):validate_contract('AnalogCaptureTimeAxis',axis,profile='transport')


def test_time_axis_preserves_epoch_and_device_coordinates_without_float_conversion():
    axis=header()['time_axis']
    assert validate_contract('AnalogCaptureTimeAxis',axis,profile='transport')==axis
    axis.update(reference='device_clock',clock_id='fixture-adc')
    assert validate_contract('AnalogCaptureTimeAxis',axis,profile='transport')==axis
    axis.update(reference='capture_relative',clock_id=None,anchor_ns='0')
    assert validate_contract('AnalogCaptureTimeAxis',axis,profile='transport')==axis


@pytest.mark.parametrize('unit',['V\n','V\x00','V\x7f'])
def test_unit_never_contains_a_control_character_even_at_the_end(unit):
    channel=header()['channels'][0];channel['unit']=unit
    with pytest.raises(ValidationError):validate_contract('AnalogCaptureChannel',channel,profile='transport')


@pytest.mark.parametrize('field',['id','calibration_id'])
def test_capture_ids_cannot_hide_a_trailing_newline(field):
    channel=header()['channels'][0];channel[field]='CH1\n'
    with pytest.raises(ValidationError):validate_contract('AnalogCaptureChannel',channel,profile='transport')
