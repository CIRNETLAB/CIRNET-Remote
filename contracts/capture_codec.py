"""NCAP v1 digital events: bounded JSON header + little-endian H/Q/B records."""
import json
import struct

HEADER = struct.Struct('<4sBI')
EVENT = struct.Struct('<HQB')
MAX_EVENTS = 100000
MAX_HEADER = 65536
MAX_CHANNELS = 4096
MAX_SAFE_INTEGER = 2**53 - 1


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
    body = b''.join(EVENT.pack(channels[s['signal']],s['time_ns'],2 if s['value']=='X' else s['value']) for s in samples)
    return HEADER.pack(b'NCAP',1,len(header)) + header + body


def decode_digital(payload):
    try:
        if not isinstance(payload, bytes) or not HEADER.size <= len(payload) <= HEADER.size+MAX_HEADER+MAX_EVENTS*EVENT.size:
            raise ValueError()
        magic,version,size = HEADER.unpack_from(payload)
        if magic != b'NCAP' or version != 1 or not 0 < size <= MAX_HEADER or HEADER.size+size > len(payload): raise ValueError()
        def strict_object(pairs):
            value={}
            for key,item in pairs:
                if key in value: raise ValueError()
                value[key]=item
            return value
        header=json.loads(payload[HEADER.size:HEADER.size+size].decode('utf-8'),object_pairs_hook=strict_object)
        if set(header) != {'encoding','signals','sample_count','duration_ns'} or header['encoding'] != 'digital_events': raise ValueError()
        signals,count,duration=header['signals'],header['sample_count'],header['duration_ns']
        if (not isinstance(signals,list) or len(signals)>MAX_CHANNELS or any(not isinstance(s,str) or not s for s in signals)
                or len(set(signals))!=len(signals) or type(count) is not int or not 0<=count<=MAX_EVENTS
                or type(duration) is not int or not 0<=duration<=MAX_SAFE_INTEGER
                or len(payload)!=HEADER.size+size+count*EVENT.size): raise ValueError()
        samples=[]
        for channel,timestamp,value in EVENT.iter_unpack(payload[HEADER.size+size:]):
            if channel>=len(signals) or timestamp>duration or value not in (0,1,2): raise ValueError()
            samples.append({'signal':signals[channel],'time_ns':timestamp,'value':'X' if value==2 else value})
        return {'samples':samples,'duration_ns':duration}
    except (ValueError,TypeError,KeyError,UnicodeError,struct.error):
        raise ValueError('CAPTURE_CORRUPT') from None
