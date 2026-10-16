from typing import Any
from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from app.services.circuit_validator import validate_circuit_graph
from contracts.boundary.models import CircuitValidationResult, PhysicalDeviceState, PhysicalPreviewResult
from app.services.api_contracts import ERROR_RESPONSES, GRAPH_REQUEST

router = APIRouter(prefix="/api/circuits", responses=ERROR_RESPONSES)

@router.post("/validate", operation_id='validateCircuit', response_model=CircuitValidationResult, response_model_exclude_unset=True,
             responses={422:{'model':CircuitValidationResult,'description':'Legacy structural circuit validation result'}},
             openapi_extra=GRAPH_REQUEST)
def validate_circuit(payload: Any = Body(default=None)):
    valid, code, message = validate_circuit_graph(payload)
    body = {"valid": valid, "code": code, "message": message}
    if not valid:
        return JSONResponse(status_code=422, content=body)
    return body


PhysicalPreview = PhysicalPreviewResult


@router.post('/physical-preview', operation_id='previewCircuit', response_model=PhysicalPreviewResult, response_model_exclude_none=True,
             response_model_exclude_unset=True,
             responses={422:{'model':CircuitValidationResult,'description':'Legacy structural circuit validation result'}},
             openapi_extra=GRAPH_REQUEST)
def physical_preview(payload: Any = Body(default=None)):
    valid, code, message = validate_circuit_graph(payload)
    if not valid:
        return JSONResponse(status_code=422, content={'valid': False, 'code': code, 'message': message})
    from netcircuit_sim.engine import preview_physical_graph, SimulationError
    from app.models.circuit import CircuitGraph
    try:
        result = preview_physical_graph(CircuitGraph.model_validate(payload).model_dump(exclude_unset=True))
        return {**result, 'provenance':'simulation_preview',
                'limitations':['Educational DC and digital component models have a limited execution envelope.',
                               'Physical acquisition and full SPICE or mixed-signal execution remain unavailable.']}
    except SimulationError as exc:
        return JSONResponse(status_code=422, content={'valid': False, 'code': str(exc), 'message': 'The physical preview could not compile or settle this design.'})
