import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource

ROOT=Path(__file__).resolve().parents[2]
SCHEMA_DIR=ROOT/'contracts/circuit-schema'


def load(name):
    return json.loads((SCHEMA_DIR/name).read_text())


def validator():
    registry = Registry()
    for name in ['circuit.schema.json', 'module.schema.json', 'connection.schema.json']:
        schema = load(name)
        schema['$id'] = (SCHEMA_DIR / name).as_uri()
        registry = registry.with_resource(schema['$id'], Resource.from_contents(schema))
    return Draft202012Validator({'$ref': (SCHEMA_DIR / 'circuit.schema.json').as_uri()}, registry=registry)


def valid_graph():
    return {
        'schema_version':'1.0',
        'circuit_id':'exp-001',
        'modules':[{'id':'SW1','type':'DIGITAL_SWITCH'},{'id':'U1','type':'74HC08'}],
        'connections':[{'source':'SW1.OUT','destination':'U1.1'}],
    }


def test_valid_graph_is_accepted():
    validator().validate(valid_graph())


def test_missing_schema_version_is_rejected():
    graph=valid_graph(); graph.pop('schema_version')
    with pytest.raises(ValidationError): validator().validate(graph)


def test_module_requires_id_and_type():
    graph=valid_graph(); graph['modules']=[{'id':'U1'}]
    with pytest.raises(ValidationError): validator().validate(graph)


def test_connection_requires_source_and_destination():
    graph=valid_graph(); graph['connections']=[{'source':'SW1.OUT'}]
    with pytest.raises(ValidationError): validator().validate(graph)


def test_contact_endpoints_and_visual_routing_keep_circuitgraph_1_0_contract():
    graph = valid_graph()
    graph['modules'].append({'id': 'BB', 'type': 'BREADBOARD'})
    graph['connections'] = [{'source': 'SW1.OUT', 'destination': 'BB.contact:terminal:A:01', 'metadata': {
        'wireVisual': {'version': 1, 'color': '#d8493f', 'routeMode': 'ORTHOGONAL', 'controlPoints': [{'space': 'module', 'moduleId': 'BB', 'position': {'x': 1, 'y': .36, 'z': 2}}], 'thickness': .036}}}]
    validator().validate(graph)
    graph['connections'][0]['controlPoints'] = []
    with pytest.raises(ValidationError): validator().validate(graph)
