"""Validate canonical schemas and semantic identity/binding invariants offline."""
from copy import deepcopy
from functools import lru_cache
import json
from pathlib import Path

from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent


@lru_cache
def _schema():
    return json.loads((ROOT / "physical-lab/lab.schema.json").read_text(encoding="utf-8"))


def validate(name: str, value: dict) -> dict:
    schema = _schema()
    if name not in schema["$defs"]:
        raise ValueError(f"Unknown contract {name}")
    registry = Registry().with_resource(schema["$id"], Resource.from_contents(schema))
    Draft202012Validator({"$ref": schema["$id"] + "#/$defs/" + name}, registry=registry).validate(value)
    if name == "AssignmentDefinition":
        _unique(value["lab_endpoints"], "endpoint_id")
        for endpoint in value['lab_endpoints']:
            _endpoint(endpoint)
        if 'reference_topology_graph' in value:
            validate('DetectedTopologyGraph', value['reference_topology_graph'])
        if 'reference_design_graph' in value:
            from contracts.design_validation import validate_design_graph
            validate_design_graph(value['reference_design_graph'])
        _unique(value.get('instructor_pin_profiles', []), 'profile_id')
        for profile in value.get('instructor_pin_profiles', []):
            _unique(profile['pins'], 'pin_id')
    if name == 'LabEndpoint':
        _endpoint(value)
    if name in ('ObservedPhysicalComponent', 'ObservedComponent', 'OpaquePhysicalComponent', 'OpaqueComponent'):
        _component(value)
    if name == "DetectedTopologyGraph":
        _unique(value["nodes"], "node_id")
        _unique(value["components"], "component_id")
        nodes = {node['node_id'] for node in value['nodes']}
        connections = set()
        for connection in value['connections']:
            members = connection['node_ids']
            if len(members) != len(set(members)) or not set(members) <= nodes:
                raise ValidationError('connection contains duplicate or missing node')
            key = tuple(sorted(members))
            if key in connections:
                raise ValidationError('duplicate electrical connection')
            connections.add(key)
        for component in value['components']:
            _component(component)
            members = component['node_ids']
            pin_nodes = {pin['node_id'] for pin in component.get('pins', [])}
            if len(members) != len(set(members)) or not set(members) <= nodes or not pin_nodes <= set(members):
                raise ValidationError('component or pin references a missing node')
    if name == 'TopologyResolutionResult':
        _unique(value['endpoint_bindings'], 'endpoint_id')
        _unique(value['component_matches'], 'reference_component_id')
        _unique(value['component_matches'], 'observed_component_id')
    if name == 'ExperimentRecord' and value.get('capture') is not None:
        validate('CaptureMetadata',value['capture'])
    if name == 'CaptureMetadata':
        signals=value.get('signals')
        if ((value['instrument']=='logic_analyzer' and value['encoding']!='digital_events')
                or (value['instrument']=='oscilloscope' and value['encoding']=='digital_events')
                or (signals is not None and (len(signals)!=len(set(signals)) or len(signals)!=value['channel_count']))
                or (value['available'] and (value['payload_ref'] is None or value['payload_byte_count']<=0))
                or (not value['available'] and (value['payload_ref'] is not None or value['payload_byte_count']!=0 or value.get('sha256') is not None))
                or (value['encoding']=='digital_events' and (value['sample_count']>100000 or value['payload_byte_count']>9+65536+100000*11))):
            raise ValidationError('Capture metadata is inconsistent')
    if name == 'StationCapabilities':
        validate('InstrumentCapabilities',value['instrument_capabilities'])
    if name == 'InstrumentCapabilities':
        validate('GeneratorCapability',value['generator'])
    if name == 'GeneratorCapability':
        from math import isfinite
        for key in ['frequency_min_hz','frequency_max_hz','amplitude_max_vpp','offset_min_v','offset_max_v']:
            if key in value and not isfinite(value[key]): raise ValidationError('Nonfinite profile limit')
        for lower,upper in [('frequency_min_hz','frequency_max_hz'),('offset_min_v','offset_max_v')]:
            if lower in value and upper in value and value[lower]>value[upper]:
                raise ValidationError('Inconsistent profile limits')
        if 'supported_waveforms' in value and len(set(value['supported_waveforms']))!=len(value['supported_waveforms']):
            raise ValidationError('Duplicate supported waveform')
    if name == "InstrumentationExecutionPlan":
        _unique(value["endpoint_bindings"], "endpoint_id")
        _unique(value["routing_allocations"], "resource_id")
        endpoints = {entry["endpoint_id"] for entry in value["endpoint_bindings"]}
        for entry in value["routing_allocations"] + value["instrument_allocations"]:
            if entry["endpoint_id"] not in endpoints:
                raise ValidationError("allocation references an unbound endpoint")
    return deepcopy(value)


def _endpoint(value):
    if sum(key in value for key in ('node_id', 'fixed_node_id', 'reference_node_id', 'design_port')) > 1:
        raise ValidationError('endpoint binding forms are mutually exclusive')


def _component(value):
    if value['kind'] == 'OPAQUE_PHYSICAL_COMPONENT' and value['identity'] != 'UNKNOWN':
        raise ValidationError('opaque component identity must be UNKNOWN')
    _unique(value.get('pins', []), 'pin_id')


def _unique(entries, key):
    ids = [entry[key] for entry in entries]
    if len(ids) != len(set(ids)):
        raise ValidationError(f"duplicate {key}")
