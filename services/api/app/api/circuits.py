from typing import Any
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from app.services.circuit_validator import validate_circuit_graph
from pydantic import BaseModel, ConfigDict
from typing import Literal

router = APIRouter(prefix="/api/circuits")

@router.post("/validate")
def validate_circuit(payload: Any = Body(default=None)):
    valid, code, message = validate_circuit_graph(payload)
    body = {"valid": valid, "code": code, "message": message}
    if not valid:
        return JSONResponse(status_code=422, content=body)
    return body


class PhysicalDeviceState(BaseModel):
    model_config = ConfigDict(extra='forbid')
    state: Literal['POWERED', 'UNPOWERED', 'FAULT', 'UNSUPPORTED', 'ON', 'OFF', 'UNKNOWN', 'PASSIVE']
    model: str | None = None
    reason: str | None = None
    voltage: float | None = None
    resistanceOhms: float | None = None
    currentAmps: float | None = None


class PhysicalPreview(BaseModel):
    model_config = ConfigDict(extra='forbid')
    device_states: dict[str, PhysicalDeviceState]
    pin_values: dict[str, int | Literal['X']]
    diagnostics: list[str]


@router.post('/physical-preview', response_model=PhysicalPreview, response_model_exclude_none=True)
def physical_preview(payload: Any = Body(default=None)):
    valid, code, message = validate_circuit_graph(payload)
    if not valid:
        return JSONResponse(status_code=422, content={'valid': False, 'code': code, 'message': message})
    from netcircuit_sim.engine import preview_physical_graph, SimulationError
    from app.models.circuit import CircuitGraph
    try:
        return preview_physical_graph(CircuitGraph.model_validate(payload).model_dump(exclude_unset=True))
    except SimulationError as exc:
        return JSONResponse(status_code=422, content={'valid': False, 'code': str(exc), 'message': 'The physical preview could not compile or settle this design.'})
