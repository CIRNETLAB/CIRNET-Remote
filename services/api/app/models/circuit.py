from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from contracts.component_properties import normalize_component_properties


class CircuitSchemaModel(BaseModel):
    model_config = ConfigDict(strict=True, allow_inf_nan=False)

    @field_validator("*", mode="before")
    @classmethod
    def reject_explicit_null(cls, value: Any) -> Any:
        # Canonical optional fields may be absent, but their declared types exclude null.
        if value is None:
            raise ValueError("field must not be null")
        return value


class CircuitPosition(CircuitSchemaModel):
    model_config = ConfigDict(extra="forbid")
    x: int | float | None = None
    y: int | float | None = None
    z: int | float | None = None


class MountPosition(CircuitSchemaModel):
    model_config = ConfigDict(extra="forbid")
    x: int | float
    y: int | float
    z: int | float


class MountPose(CircuitSchemaModel):
    model_config = ConfigDict(extra="forbid")
    position: MountPosition
    rotation: int | float


class PinContactBinding(CircuitSchemaModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal['pin-contact']
    version: Literal[1]
    pinId: str = Field(min_length=1)
    contactId: str = Field(min_length=1)

    @field_validator('version', mode='before')
    @classmethod
    def version_is_integer(cls, value):
        if type(value) is not int: raise ValueError('binding version must be an integer')
        return value


class MountBinding(CircuitSchemaModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal['breadboard']
    version: Literal[1]
    boardId: str = Field(min_length=1)
    partId: str = Field(min_length=1)
    partRevision: int = Field(ge=1)
    packageId: str = Field(min_length=1)
    packageRevision: int = Field(ge=1)
    pose: MountPose
    contacts: list[PinContactBinding] = Field(min_length=1)

    @field_validator('version', mode='before')
    @classmethod
    def version_is_integer(cls, value):
        if type(value) is not int: raise ValueError('mount version must be an integer')
        return value


class CircuitModule(CircuitSchemaModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)
    type: str = Field(min_length=1)
    position: CircuitPosition | None = None
    rotation: int | float | None = None
    properties: dict[str, Any] | None = None
    mount: MountBinding | None = None

    @model_validator(mode='before')
    @classmethod
    def normalize_design_properties(cls, value):
        if isinstance(value, dict) and isinstance(value.get('type'), str) and isinstance(value.get('properties'), dict):
            return {**value, 'properties': normalize_component_properties(value.get('type'), value['properties'])}
        return value

    @model_validator(mode='after')
    def mounted_pose_is_relative(self):
        if self.mount is not None and (self.position is not None or self.rotation is not None):
            raise ValueError('Mounted world pose must be derived from its relative pose')
        return self

class CircuitConnection(CircuitSchemaModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(min_length=3, pattern=r"^[^.]+\.[^.]+$")
    destination: str = Field(min_length=3, pattern=r"^[^.]+\.[^.]+$")
    metadata: dict[str, Any] | None = None

class CircuitGraph(CircuitSchemaModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: str
    circuit_id: str = Field(min_length=1)
    modules: list[CircuitModule]
    connections: list[CircuitConnection]
    metadata: dict[str, Any] | None = None
