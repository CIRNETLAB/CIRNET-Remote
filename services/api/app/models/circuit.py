"""Compatibility facade over generated canonical design boundary models.

Property aliases are a named legacy migration; generated DTOs own all shapes.
"""
from typing import Any

from pydantic import model_validator

from contracts.boundary.base import ContractBoundary as CircuitSchemaModel
from contracts.boundary.models import (
    CircuitConnection,
    CircuitGraph as GeneratedCircuitGraph,
    CircuitModule as GeneratedCircuitModule,
    MountBinding,
    PinContactBinding,
    Point3 as MountPosition,
    Pose as MountPose,
    Position as CircuitPosition,
)
from contracts.component_properties import normalize_component_properties


def normalize_legacy_module_properties(value: Any) -> Any:
    if isinstance(value, dict) and isinstance(value.get('mount'), dict):
        mount = value['mount']
        if 'version' in mount and type(mount['version']) is not int:
            raise ValueError('mount version must be an integer')
        if isinstance(mount.get('contacts'), list):
            for contact in mount['contacts']:
                if isinstance(contact, dict) and 'version' in contact and type(contact['version']) is not int:
                    raise ValueError('binding version must be an integer')
    if isinstance(value, dict) and isinstance(value.get('type'), str) and isinstance(value.get('properties'), dict):
        return {**value, 'properties': normalize_component_properties(value['type'], value['properties'])}
    return value


class CircuitModule(GeneratedCircuitModule):
    @model_validator(mode='before')
    @classmethod
    def normalize_design_properties(cls, value: Any) -> Any:
        return normalize_legacy_module_properties(value)


class CircuitGraph(GeneratedCircuitGraph):
    @model_validator(mode='before')
    @classmethod
    def normalize_design_properties(cls, value: Any) -> Any:
        if isinstance(value, dict) and isinstance(value.get('modules'), list):
            return {**value, 'modules': [normalize_legacy_module_properties(module) for module in value['modules']]}
        return value
