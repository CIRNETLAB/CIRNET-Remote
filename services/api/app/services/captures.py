import uuid
import os
import time
from hashlib import sha256
from contracts.capture_codec import encode_digital, decode_digital
from contracts.validation import validate
from app.services.capture_store import FilesystemCaptureStore

class CaptureService:
    def __init__(self,store=None):
        self.store=store or FilesystemCaptureStore(os.getenv('NETCIRCUIT_CAPTURE_DIR','.runtime/captures'))

    def normalize(self,capture,mode):
        samples=capture.get("samples",[])
        if not isinstance(samples,list) or len(samples)>100000:
            raise ValueError("INVALID_CAPTURE")
        for sample in samples:
            if not isinstance(sample,dict) or set(sample)!={"signal","time_ns","value"} or not isinstance(sample["signal"],str) or type(sample["time_ns"]) is not int or sample["time_ns"]<0 or not ((type(sample["value"]) is int and sample["value"] in (0,1)) or sample["value"]=='X'):
                raise ValueError("INVALID_CAPTURE")
        duration=capture.get('duration_ns',max((s['time_ns'] for s in samples),default=0))
        if type(duration) is not int or duration<0 or any(s['time_ns']>duration for s in samples): raise ValueError('INVALID_CAPTURE')
        return {"schema_version":"1.0","capture_id":uuid.uuid4().hex,"source":mode,
                "instrument":"logic_analyzer","encoding":"digital_events","available":bool(capture.get("available")),
                "duration_ns":duration,"sample_count":len(samples),"samples":samples}

    def persist(self,capture,mode):
        normalized=self.normalize(capture,mode)
        if not normalized['available'] and normalized['samples']: raise ValueError('INVALID_CAPTURE')
        binary=encode_digital(normalized['samples'],normalized['duration_ns'])
        metadata={key:value for key,value in normalized.items() if key!='samples'}
        metadata.update(channel_count=len({s['signal'] for s in normalized['samples']}),
                        signals=sorted({s['signal'] for s in normalized['samples']}),timestamp_ns=str(time.time_ns()),
                        payload_ref='/api/captures/'+normalized['capture_id']+'/payload' if normalized['available'] else None,
                        payload_byte_count=len(binary) if normalized['available'] else 0,
                        sha256=sha256(binary).hexdigest() if normalized['available'] else None)
        metadata=validate('CaptureMetadata',metadata)
        if metadata['available']: self.store.put(metadata,binary)
        return metadata

    def load(self,metadata):
        if metadata['encoding']!='digital_events': raise ValueError('CAPTURE_ENCODING_UNSUPPORTED')
        data=decode_digital(self.store.get(metadata))
        if len(data['samples'])!=metadata['sample_count'] or data['duration_ns']!=metadata['duration_ns']:
            raise ValueError('CAPTURE_CORRUPT')
        return {'available':True,**data}
