import uuid

class CaptureService:
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
