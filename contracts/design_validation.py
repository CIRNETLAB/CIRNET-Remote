"""Offline structural and physical-binding validation of CircuitGraph 1.x."""
import json
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT=Path(__file__).resolve().parent


def validate_design_graph(value):
    registry=Registry()
    for path in list((ROOT/'circuit-schema').glob('*.schema.json'))+list((ROOT/'memory').glob('*.schema.json')):
        schema=json.loads(path.read_text(encoding='utf-8'))
        schema['$id']=path.as_uri()
        registry=registry.with_resource(path.as_uri(),Resource.from_contents(schema))
    Draft202012Validator({'$ref':(ROOT/'circuit-schema/circuit.schema.json').as_uri()},registry=registry).validate(value)
    from .physical_mounting import validate_physical_design
    validate_physical_design(value)
