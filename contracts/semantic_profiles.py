"""Shared numeric profiles and simple field relationships, without safety logic."""
from copy import deepcopy
from functools import lru_cache
import json
from math import isfinite
from pathlib import Path

from jsonschema import ValidationError


@lru_cache
def _profiles():
    return json.loads(Path(__file__).with_name("profiles.json").read_text(encoding="utf-8"))


def _intersect(target, overlay):
    """Add profile restrictions without loosening the source schema."""
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _intersect(target[key], value)
        elif key == "maximum" and key in target:
            target[key] = min(target[key], value)
        elif key == "minimum" and key in target:
            target[key] = max(target[key], value)
        else:
            target[key] = deepcopy(value)


def profile_schema(name, schema, profile="structural"):
    """Copy a schema, overlaying its matching `$defs` or standalone named DTO."""
    profiles = _profiles()["profiles"]
    if profile not in profiles:
        raise ValueError(f"Unknown validation profile {profile}")
    selected = profiles[profile]
    result = deepcopy(schema)

    def bound(rule):
        if not isinstance(rule, dict):
            return
        if rule.get("type") == "integer" and selected["integer"] is not None:
            _intersect(rule, selected["integer"])
        for item in rule.values():
            if isinstance(item, dict):
                bound(item)
            elif isinstance(item, list):
                for child in item:
                    bound(child)

    bound(result)
    if isinstance(result, dict):
        for contract, overlay in selected["definitions"].items():
            if contract in result.get("$defs", {}):
                _intersect(result["$defs"][contract], overlay)
        if name in selected["definitions"] and "$defs" not in result and "$ref" not in result:
            _intersect(result, selected["definitions"][name])
    return result


def _pointer(parts):
    return "".join("/" + str(part).replace("~", "~0").replace("/", "~1") for part in parts)


def validation_issues(error, profile="structural"):
    """Adapt jsonschema errors to plain issues without transport dependencies."""
    existing = getattr(error, "issues", None)
    if existing is not None:
        return existing
    nonfinite = isinstance(error.instance, float) and not isfinite(error.instance)
    code = "NONFINITE_NUMBER" if nonfinite else "SCHEMA_" + str(error.validator or "VALIDATION").upper()
    return [{"code": code,
             "path": _pointer(error.absolute_path), "severity": "error",
             "profile": profile, "message": error.message}]


def _fail(code, path, message, profile):
    failure = ValidationError(message, path=path)
    failure.issues = [{"code": code, "path": _pointer(path), "severity": "error",
                       "profile": profile, "message": message}]
    raise failure


def _unique(entries, key, path, profile):
    seen = set()
    for index, entry in enumerate(entries):
        if entry[key] in seen:
            _fail("DUPLICATE_ID", [*path, index, key], f"duplicate {key}", profile)
        seen.add(entry[key])


def _endpoint(value, path, profile):
    if sum(key in value for key in ("node_id", "fixed_node_id", "reference_node_id", "design_port")) > 1:
        _fail("ENDPOINT_BINDING_CONFLICT", path, "endpoint binding forms are mutually exclusive", profile)


def _component(value, path, profile):
    if value["kind"] == "OPAQUE_PHYSICAL_COMPONENT" and value["identity"] != "UNKNOWN":
        _fail("OPAQUE_IDENTITY", [*path, "identity"], "opaque component identity must be UNKNOWN", profile)
    _unique(value.get("pins", []), "pin_id", [*path, "pins"], profile)


def _finite(value, path, profile):
    if isinstance(value, float) and not isfinite(value):
        _fail("NONFINITE_NUMBER", path, "Nonfinite numeric value", profile)
    elif isinstance(value, dict):
        for key, child in value.items():
            _finite(child, [*path, key], profile)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _finite(child, [*path, index], profile)


def validate_semantics(name, value, profile="transport", *, _path=()):
    """Check relationships after shape validation; preserve the original data."""
    path = list(_path)
    _finite(value, path, profile)
    if name in ('CircuitGraph','CircuitGraphV12','AnySupportedCircuitGraph','CircuitModule','CircuitModuleV12','SimulationRequest','SimulationRequestV2'):
        from .label_properties import validate_label_annotations
        validate_label_annotations(name, value, profile, path=_path)
    if name in ('CircuitGraph','CircuitGraphV12','AnySupportedCircuitGraph','CircuitModule','CircuitModuleV12','SimulationRequest','SimulationRequestV2'):
        from .signal_domains import validate_signal_domains
        signal_name='CircuitGraph' if name in ('CircuitGraphV12','AnySupportedCircuitGraph') else 'CircuitModule' if name=='CircuitModuleV12' else 'SimulationRequest' if name=='SimulationRequestV2' else name
        validate_signal_domains(signal_name,value,profile,_path=_path)
    if name == "MemoryImage" and len(value["data"]) != value["depth"]:
        _fail("MEMORY_DEPTH_MISMATCH", [*path, "data"], "Memory image data length differs from depth", profile)
    if name in ("AssignmentAuthoringCreate", "AssignmentAuthoringSave", "AssignmentAuthoringDocument", "AssignmentAuthoringCreateV2", "AssignmentAuthoringSaveV2", "AssignmentAuthoringDocumentV2"):
        validate_semantics("AssignmentDefinitionV2" if value["definition"]["schema_version"]=='2.0' else "AssignmentDefinition", value["definition"], profile, _path=(*path, "definition"))
    if name in ("AssignmentAuthoringSummary", "AssignmentAuthoringDocument", "AssignmentAuthoringSummaryV2", "AssignmentAuthoringDocumentV2"):
        selected = value["published_revision"]
        if (selected is None) == value["published"] or selected is not None and selected > value["revision"]:
            _fail("ASSIGNMENT_PUBLICATION_MISMATCH", [*path, "published_revision"], "published revision is inconsistent with the authoring head", profile)
        if name in ("AssignmentAuthoringDocument", "AssignmentAuthoringDocumentV2"):
            if value["assignment_id"] != value["definition"]["assignment_id"]:
                _fail("ASSIGNMENT_ID_MISMATCH", [*path, "definition", "assignment_id"], "assignment identity differs from its definition", profile)
            if value["title"] != value["definition"]["title"]:
                _fail("ASSIGNMENT_TITLE_MISMATCH", [*path, "definition", "title"], "assignment title differs from its definition", profile)
    if name in ("AssignmentAuthoringPage", "AssignmentAuthoringPageV2"):
        for index, item in enumerate(value["items"]):
            validate_semantics("AssignmentAuthoringSummaryV2" if name.endswith('V2') else "AssignmentAuthoringSummary", item, profile, _path=(*path, "items", index))
    if name == 'AnySupportedAssignmentDefinition':
        validate_semantics('AssignmentDefinitionV2' if value['schema_version']=='2.0' else 'AssignmentDefinition', value, profile, _path=_path)
    if name in ('AssignmentViewV2','InstructorAssignmentDocumentV2') and value['document_kind']=='instructor':
        definition={key:item for key,item in value.items() if key not in ('document_kind','owner_id','published','feedback_policy')}
        validate_semantics('AssignmentDefinitionV2' if value['schema_version']=='2.0' else 'AssignmentDefinition',definition,profile,_path=_path)
    if name in ("AssignmentDefinition", "AssignmentDefinitionV2"):
        _unique(value["lab_endpoints"], "endpoint_id", [*path, "lab_endpoints"], profile)
        for index, endpoint in enumerate(value["lab_endpoints"]):
            _endpoint(endpoint, [*path, "lab_endpoints", index], profile)
        if "reference_topology_graph" in value:
            validate_semantics("DetectedTopologyGraph", value["reference_topology_graph"], profile,
                               _path=(*path, "reference_topology_graph"))
        if "reference_design_graph" in value:
            from contracts.design_validation import validate_design_graph
            try:
                if name=='AssignmentDefinition':
                    from contracts.registry import validate_contract
                    validate_contract('CircuitGraph',value['reference_design_graph'],profile=profile)
                validate_design_graph(value["reference_design_graph"])
            except ValidationError as error:
                issues = validation_issues(error, profile)
                for issue in issues:
                    issue["path"] = _pointer([*path, "reference_design_graph"]) + issue["path"]
                error.issues = issues
                raise
            except ValueError as error:
                _fail('INVALID_REFERENCE_DESIGN', [*path, 'reference_design_graph'], str(error), profile)
        _unique(value.get("instructor_pin_profiles", []), "profile_id", [*path, "instructor_pin_profiles"], profile)
        for index, entry in enumerate(value.get("instructor_pin_profiles", [])):
            _unique(entry["pins"], "pin_id", [*path, "instructor_pin_profiles", index, "pins"], profile)
    if name == "LabEndpoint":
        _endpoint(value, path, profile)
    if name in ("ObservedPhysicalComponent", "ObservedComponent", "OpaquePhysicalComponent", "OpaqueComponent"):
        _component(value, path, profile)
    if name == "DetectedTopologyGraph":
        _unique(value["nodes"], "node_id", [*path, "nodes"], profile)
        _unique(value["components"], "component_id", [*path, "components"], profile)
        nodes = {node["node_id"] for node in value["nodes"]}
        connections = set()
        for index, connection in enumerate(value["connections"]):
            members = connection["node_ids"]
            if len(members) != len(set(members)) or not set(members) <= nodes:
                _fail("INVALID_NODE_REFERENCE", [*path, "connections", index, "node_ids"],
                      "connection contains duplicate or missing node", profile)
            key = tuple(sorted(members))
            if key in connections:
                _fail("DUPLICATE_CONNECTION", [*path, "connections", index], "duplicate electrical connection", profile)
            connections.add(key)
        for index, component in enumerate(value["components"]):
            component_path = [*path, "components", index]
            _component(component, component_path, profile)
            members = component["node_ids"]
            pin_nodes = {pin["node_id"] for pin in component.get("pins", [])}
            if len(members) != len(set(members)) or not set(members) <= nodes or not pin_nodes <= set(members):
                _fail("INVALID_NODE_REFERENCE", component_path, "component or pin references a missing node", profile)
    if name == "TopologyResolutionResult":
        _unique(value["endpoint_bindings"], "endpoint_id", [*path, "endpoint_bindings"], profile)
        _unique(value["component_matches"], "reference_component_id", [*path, "component_matches"], profile)
        _unique(value["component_matches"], "observed_component_id", [*path, "component_matches"], profile)
    if name=='InstrumentControlAccess':
        ready=value['reason']=='READY'
        if value['can_configure_generator']!=ready or bool(value['generator_channels'])!=ready:
            _fail('CONTROL_ACCESS_MISMATCH',[*path,'can_configure_generator'],'Control access requires ready allocated context',profile)
    if name=='InstrumentCommandRecord':
        status=value['status']
        valid=(value['accepted']==(status in ('ACCEPTED','APPLIED')) and value['hardware_applied']==(status=='APPLIED')
            and (value['error_code'] is not None if status=='FAILED' else value['error_code'] in (None,'ACKNOWLEDGEMENT_UNKNOWN') if status=='REQUESTED' else value['error_code'] is None)
            and (status=='REQUESTED' or value['revision']>=1))
        if not valid:_fail('ACKNOWLEDGEMENT_MISMATCH',[*path,'status'],'Acknowledgement status and evidence disagree',profile)
    if name in ('ExperimentHistoryPage','ExperimentActiveSnapshot'):
        _unique(value['items'],'experiment_id',[*path,'items'],profile)
        for index,entry in enumerate(value['items']):
            validate_semantics('ExperimentRecord',entry,profile,_path=(*path,'items',index))
    if name == "ExperimentRecord":
        if value["state_history"][-1] != value["state"]:
            _fail("STATE_HISTORY_MISMATCH", [*path, "state_history"], "Experiment state/history disagree", profile)
        if value.get("capture") is not None:
            validate_semantics("CaptureMetadata", value["capture"], profile, _path=(*path, "capture"))
    if name == "CaptureResult":
        if value["sample_count"] != len(value["samples"]):
            _fail("CAPTURE_COUNT_MISMATCH", [*path, "sample_count"], "Capture metadata does not match samples", profile)
        for index, sample in enumerate(value["samples"]):
            if sample["time_ns"] > value["duration_ns"]:
                _fail("CAPTURE_TIME_OUTSIDE_DURATION", [*path, "samples", index, "time_ns"],
                      "Capture sample exceeds declared duration", profile)
    if name in ('AnalogCaptureDescriptor','AnalogCaptureHeader','AnalogCaptureChannel','AnalogCaptureQuality','AnalogCaptureTimeAxis'):
        from .capture_validation import validate_capture_semantics
        validate_capture_semantics(name,value,profile,_path=_path)
    if name == "CaptureMetadata":
        signals = value.get("signals")
        if ((value["instrument"] == "logic_analyzer" and value["encoding"] != "digital_events")
                or (value["instrument"] == "oscilloscope" and value["encoding"] == "digital_events")):
            _fail("CAPTURE_ENCODING_MISMATCH", [*path, "encoding"], "Capture instrument/encoding disagree", profile)
        if signals is not None and (len(signals) != len(set(signals)) or len(signals) != value["channel_count"]):
            _fail("CAPTURE_CHANNEL_MISMATCH", [*path, "signals"], "Capture channels are inconsistent", profile)
        if ((value["available"] and (value["payload_ref"] is None or value["payload_byte_count"] <= 0))
                or (not value["available"] and (value["payload_ref"] is not None or value["payload_byte_count"] != 0
                                                or value.get("sha256") is not None))):
            _fail("CAPTURE_AVAILABILITY_MISMATCH", [*path, "available"], "Capture availability is inconsistent", profile)
        if value["encoding"] == "digital_events" and (value["sample_count"] > 100000
                or value["payload_byte_count"] > 9 + 65536 + 100000 * 11):
            _fail("CAPTURE_PAYLOAD_LIMIT", path, "Capture exceeds NCAP v1 digital limits", profile)
    if name in ("StationCapabilities","PublicStationCapabilities"):
        validate_semantics("InstrumentCapabilities", value["instrument_capabilities"], profile,
                           _path=(*path, "instrument_capabilities"))
    if name == 'StationDescriptor' and value.get('capabilities') is not None:
        validate_semantics('PublicStationCapabilities',value['capabilities'],profile,_path=(*path,'capabilities'))
        if value['station_id']!=value['capabilities']['station_id'] or value['mode']!=value['capabilities']['mode']:
            _fail('STATION_IDENTITY_MISMATCH', [*path, 'capabilities'], 'Station descriptor and capabilities disagree', profile)
    if name == 'OperationRecord' and value.get('experiment') is not None:
        validate_semantics('ExperimentRecord',value['experiment'],profile,_path=(*path,'experiment'))
    if name == "InstrumentCapabilities":
        validate_semantics("GeneratorCapability", value["generator"], profile, _path=(*path, "generator"))
    if name == "GeneratorCapability":
        for lower, upper in (("frequency_min_hz", "frequency_max_hz"), ("offset_min_v", "offset_max_v")):
            if lower in value and upper in value and value[lower] > value[upper]:
                _fail("PROFILE_LIMIT_ORDER", [*path, lower], "Inconsistent profile limits", profile)
        waveforms = value.get("supported_waveforms", [])
        if len(waveforms) != len(set(waveforms)):
            _fail("DUPLICATE_WAVEFORM", [*path, "supported_waveforms"], "Duplicate supported waveform", profile)
    if name == "InstrumentationExecutionPlan":
        _unique(value["endpoint_bindings"], "endpoint_id", [*path, "endpoint_bindings"], profile)
        _unique(value["routing_allocations"], "resource_id", [*path, "routing_allocations"], profile)
        endpoints = {entry["endpoint_id"] for entry in value["endpoint_bindings"]}
        for key in ("routing_allocations", "instrument_allocations"):
            for index, entry in enumerate(value[key]):
                if entry["endpoint_id"] not in endpoints:
                    _fail("UNBOUND_ENDPOINT", [*path, key, index, "endpoint_id"],
                          "allocation references an unbound endpoint", profile)
