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
    if name == "DetectedTopologyGraph":
        _unique(value["nodes"], "node_id")
        _unique(value["components"], "component_id")
    if name == "InstrumentationExecutionPlan":
        _unique(value["endpoint_bindings"], "endpoint_id")
        _unique(value["routing_allocations"], "resource_id")
        endpoints = {entry["endpoint_id"] for entry in value["endpoint_bindings"]}
        for entry in value["routing_allocations"] + value["instrument_allocations"]:
            if entry["endpoint_id"] not in endpoints:
                raise ValidationError("allocation references an unbound endpoint")
    return deepcopy(value)


def _unique(entries, key):
    ids = [entry[key] for entry in entries]
    if len(ids) != len(set(ids)):
        raise ValidationError(f"duplicate {key}")
