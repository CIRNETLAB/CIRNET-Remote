import uuid

class CaptureService:
    def normalize(self,capture,mode):
        samples=capture.get("samples",[])
        if not isinstance(samples,list) or len(samples)>100000:
            raise ValueError("INVALID_CAPTURE")
        for sample in samples:
            if not isinstance(sample,dict) or set(sample)!={"signal","time_ns","value"} or not isinstance(sample["signal"],str) or type(sample["time_ns"]) is not int or sample["time_ns"]<0 or type(sample["value"]) is not int or sample["value"] not in (0,1):
                raise ValueError("INVALID_CAPTURE")
        return {"schema_version":"1.0","capture_id":uuid.uuid4().hex,"source":mode,
                "instrument":"logic_analyzer","encoding":"digital_events","available":bool(capture.get("available")),
                "sample_count":len(samples),"samples":samples}
