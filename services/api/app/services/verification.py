from contracts.validation import validate
from bisect import bisect_right
from collections import defaultdict

def result(status,issues=None):
    return {"schema_version":"1.0","status":status,"issues":issues or []}

class SafetyVerificationService:
    def verify(self,evidence):
        return validate("SafetyVerificationResult",evidence)

class TopologyVerificationService:
    def verify(self,assignment,observed):
        observed=validate("DetectedTopologyGraph",observed)
        components=observed["components"]
        if any(c["identity"]=="UNKNOWN" or c["kind"]=="OPAQUE_PHYSICAL_COMPONENT" for c in components):
            return result("UNKNOWN",["Component identity unresolved"])
        expected=set((assignment or {}).get("expected_component_set",[]))
        actual={c["identity"] for c in components}
        if expected and expected != actual:
            return result("MISMATCH",["Observed component set differs"])
        reference=(assignment or {}).get("reference_topology_graph")
        if reference and len(reference["connections"]) != len(observed["connections"]):
            return result("MISMATCH",["Connection count differs"])
        # Do not compare teacher/student coordinates or declare graph equivalence without a resolver.
        return result("AMBIGUOUS" if observed["ambiguities"] else "UNKNOWN",["Semantic topology matching not resolved"])

class FunctionalVerificationService:
    def verify(self,assignment,capture,vectors=None):
        samples=capture.get("samples",[]) if capture and capture.get("available") else []
        behavior=(assignment or {}).get('expected_behavior',{})
        expected=list(behavior.get("expected_signals",[]))
        missing=0
        if not expected and behavior.get('truth_table'):
            vectors=sorted(vectors or [],key=lambda v:v['time_ns'])
            duration=(capture or {}).get('duration_ns',0)
            for row in behavior['truth_table']:
                matches=[i for i,v in enumerate(vectors) if all(v['inputs'].get(s)==level for s,level in row['inputs'].items())]
                if not matches:
                    missing+=len(row['outputs']); continue
                index=matches[0]
                timestamp=vectors[index+1]['time_ns']-1 if index+1<len(vectors) else duration
                if timestamp<vectors[index]['time_ns']:
                    missing+=len(row['outputs']); continue
                expected.extend({'signal':s,'time_ns':timestamp,'value':value} for s,value in row['outputs'].items())
        if not expected:
            return result("NOT_EVALUATED",["No expected signal behavior supplied"])
        if not samples: return result("NO_RESPONSE")
        duration=capture.get('duration_ns',max(s['time_ns'] for s in samples))
        grouped=defaultdict(list)
        for sample in samples: grouped[sample['signal']].append((sample['time_ns'],sample['value']))
        for values in grouped.values(): values.sort(key=lambda pair:pair[0])
        times={signal:[pair[0] for pair in values] for signal,values in grouped.items()}
        def observed_at(signal,timestamp):
            if timestamp>duration: return None
            index=bisect_right(times.get(signal,[]),timestamp)-1
            return grouped[signal][index][1] if index>=0 else None
        matched=sum(observed_at(s['signal'],s['time_ns'])==s['value'] for s in expected)
        if matched==len(expected) and not missing: return result("PASS")
        return result("PARTIAL" if matched else "FAIL",["Observed signals differ from expected behavior"])
