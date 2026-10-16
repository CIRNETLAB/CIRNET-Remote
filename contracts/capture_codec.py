"""Bounded NCAP decoders. v1 events remain byte compatible; v2 is sampled data.

The v2 encoder is a format utility, not a hardware acquisition implementation.
"""
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from math import isfinite
import struct
from jsonschema import ValidationError

from .capture_layout import CAPTURE_LAYOUT, DIGITAL_V1, PREFIX, SAMPLED_V2

HEADER = struct.Struct(PREFIX['struct_format'])
EVENT = struct.Struct(DIGITAL_V1['struct_format'])
MAX_EVENTS = DIGITAL_V1['max_events']
MAX_HEADER = CAPTURE_LAYOUT['max_header_bytes']
MAX_CHANNELS = DIGITAL_V1['max_channels']
MAX_SAFE_INTEGER = DIGITAL_V1['max_time_ns']


def _strict_object(pairs):
    value={}
    for key,item in pairs:
        if key in value:raise ValueError()
        value[key]=item
    return value


def encode_digital(samples, duration_ns):
    if not isinstance(samples, list) or len(samples) > MAX_EVENTS or type(duration_ns) is not int or not 0 <= duration_ns <= MAX_SAFE_INTEGER:
        raise ValueError('INVALID_CAPTURE')
    for sample in samples:
        if (not isinstance(sample, dict) or set(sample) != {'signal','time_ns','value'}
                or not isinstance(sample['signal'], str) or not sample['signal']
                or type(sample['time_ns']) is not int or not 0 <= sample['time_ns'] <= duration_ns
                or not (type(sample['value']) is int and sample['value'] in (0,1) or sample['value'] == 'X')):
            raise ValueError('INVALID_CAPTURE')
    signals = sorted({s['signal'] for s in samples})
    if len(signals) > MAX_CHANNELS: raise ValueError('INVALID_CAPTURE')
    header = json.dumps({'encoding':'digital_events','signals':signals,'sample_count':len(samples),
                         'duration_ns':duration_ns}, separators=(',',':'), ensure_ascii=False).encode('utf-8')
    if len(header) > MAX_HEADER: raise ValueError('INVALID_CAPTURE')
    channels = {signal:index for index,signal in enumerate(signals)}
    body = b''.join(EVENT.pack(channels[s['signal']],s['time_ns'],DIGITAL_V1['unknown_value_code'] if s['value']=='X' else s['value']) for s in samples)
    return HEADER.pack(bytes.fromhex(PREFIX['magic_hex']),DIGITAL_V1['version'],len(header)) + header + body


def decode_digital(payload):
    try:
        if not isinstance(payload, bytes) or not HEADER.size <= len(payload) <= HEADER.size+MAX_HEADER+MAX_EVENTS*EVENT.size:
            raise ValueError()
        magic,version,size = HEADER.unpack_from(payload)
        if magic != bytes.fromhex(PREFIX['magic_hex']) or version != DIGITAL_V1['version'] or not 0 < size <= MAX_HEADER or HEADER.size+size > len(payload): raise ValueError()
        header=json.loads(payload[HEADER.size:HEADER.size+size].decode('utf-8'),object_pairs_hook=_strict_object)
        if set(header) != {'encoding','signals','sample_count','duration_ns'} or header['encoding'] != 'digital_events': raise ValueError()
        signals,count,duration=header['signals'],header['sample_count'],header['duration_ns']
        if (not isinstance(signals,list) or len(signals)>MAX_CHANNELS or any(not isinstance(s,str) or not s for s in signals)
                or len(set(signals))!=len(signals) or type(count) is not int or not 0<=count<=MAX_EVENTS
                or type(duration) is not int or not 0<=duration<=MAX_SAFE_INTEGER
                or len(payload)!=HEADER.size+size+count*EVENT.size): raise ValueError()
        samples=[]
        for channel,timestamp,value in EVENT.iter_unpack(payload[HEADER.size+size:]):
            if channel>=len(signals) or timestamp>duration or value not in (0,1,DIGITAL_V1['unknown_value_code']): raise ValueError()
            samples.append({'signal':signals[channel],'time_ns':timestamp,'value':'X' if value==DIGITAL_V1['unknown_value_code'] else value})
        return {'samples':samples,'duration_ns':duration}
    except (ValueError,TypeError,KeyError,UnicodeError,struct.error,RecursionError):
        raise ValueError('CAPTURE_CORRUPT') from None


_INTEGER_MEMBERS={'generation','frame_count','numerator','denominator','lost_frames','at_frame','missing_frames','first_frame'}


def _sampled_header(text):
    def integer(token):
        value=int(token)
        if not -MAX_SAFE_INTEGER<=value<=MAX_SAFE_INTEGER:raise ValueError()
        return value
    def number(token):
        value=float(token)
        if not isfinite(value) or Decimal(str(value))!=Decimal(token):raise ValueError()
        return value
    def integer_members(value):
        if isinstance(value,dict):
            for key,child in value.items():
                if key in _INTEGER_MEMBERS and type(child) is not int:raise ValueError()
                integer_members(child)
        elif isinstance(value,list):
            for child in value:integer_members(child)
    result=json.loads(text,object_pairs_hook=_strict_object,parse_float=number,parse_int=integer,
                      parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
    integer_members(result)
    return result


def _sampled_values(header,samples):
    if not isinstance(samples,list) or len(samples)!=header['frame_count']*len(header['channels']):raise ValueError()
    integer=header['encoding']!='FLOAT32'
    for index,value in enumerate(samples):
        if type(value) not in (int,float) or not isfinite(value) or integer and type(value) is not int:raise ValueError()
        channel=header['channels'][index%len(header['channels'])]
        if not isfinite(value*channel['scale']+channel['offset']):raise ValueError()


def encode_sampled(header,samples):
    """Encode an explicit sampled header and frame-interleaved values (no producer)."""
    try:
        from .registry import validate_contract
        header=validate_contract('AnalogCaptureHeader',header,profile='transport')
        _sampled_values(header,samples)
        encoding=SAMPLED_V2['encodings'][header['encoding']]
        body=b''.join(struct.pack(encoding['struct_format'],value) for value in samples)
        text=json.dumps(header,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode('utf-8')
        if not 0<len(text)<=MAX_HEADER:raise ValueError()
        _sampled_header(text.decode('utf-8'))
        return HEADER.pack(bytes.fromhex(PREFIX['magic_hex']),SAMPLED_V2['version'],len(text))+text+body
    except (ValueError,TypeError,KeyError,OverflowError,struct.error,ValidationError):
        raise ValueError('INVALID_CAPTURE') from None


def decode_sampled(payload,descriptor):
    """Verify SHA, exact descriptor/header agreement, then decode owned raw values."""
    try:
        from .registry import validate_contract
        descriptor=validate_contract('AnalogCaptureDescriptor',descriptor,profile='transport')
        if not isinstance(payload,bytes) or len(payload)!=descriptor['payload_byte_count']:raise ValueError()
        if hashlib.sha256(payload).hexdigest()!=descriptor['sha256']:raise ValueError()
        magic,version,size=HEADER.unpack_from(payload)
        if magic!=bytes.fromhex(PREFIX['magic_hex']) or version!=SAMPLED_V2['version'] or not 0<size<=MAX_HEADER or HEADER.size+size>len(payload):raise ValueError()
        header=_sampled_header(payload[HEADER.size:HEADER.size+size].decode('utf-8'))
        header=validate_contract('AnalogCaptureHeader',header,profile='transport')
        if header!=descriptor['header']:raise ValueError()
        encoding=SAMPLED_V2['encodings'][header['encoding']]
        if len(payload)!=HEADER.size+size+header['frame_count']*len(header['channels'])*encoding['bytes_per_value']:raise ValueError()
        samples=[entry[0] for entry in struct.iter_unpack(encoding['struct_format'],payload[HEADER.size+size:])]
        _sampled_values(header,samples)
        return {'descriptor':deepcopy(descriptor),'samples':samples}
    except (ValueError,TypeError,KeyError,UnicodeError,OverflowError,struct.error,ValidationError,RecursionError):
        raise ValueError('CAPTURE_CORRUPT') from None


def sampled_frame_time(capture,frame):
    """Exact rational nanoseconds as (numerator, denominator), including loss gaps."""
    header=capture['descriptor']['header']
    if type(frame) is not int or not 0<=frame<header['frame_count']:raise ValueError('INVALID_FRAME')
    axis=header['time_axis'];rate=axis['sample_rate_hz']
    position=frame+sum(gap['missing_frames'] for gap in header['quality']['gaps'] if gap['at_frame']<=frame)
    return (int(axis['anchor_ns'])*rate['numerator']+position*1000000000*rate['denominator'],rate['numerator'])
