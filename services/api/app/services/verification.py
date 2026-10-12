from contracts.validation import validate

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
    def verify(self,assignment,capture):
        samples=capture.get("samples",[]) if capture and capture.get("available") else []
        expected=(assignment or {}).get("expected_behavior",{}).get("expected_signals",[])
        if not expected:
            return result("NOT_EVALUATED",["No expected signal behavior supplied"])
        if not samples: return result("NO_RESPONSE")
        observed={(s["signal"],s["time_ns"]):s["value"] for s in samples}
        matched=sum(observed.get((s["signal"],s["time_ns"]))==s["value"] for s in expected)
        if matched==len(expected): return result("PASS")
        return result("PARTIAL" if matched else "FAIL",["Observed signals differ from expected behavior"])
