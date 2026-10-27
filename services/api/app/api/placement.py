"""Opt-in graph 1.2 routes; frozen legacy wire shapes remain intact."""
from typing import Any
from fastapi import APIRouter,Body,Header,Query,Request,Response
from fastapi.responses import JSONResponse

from contracts.boundary.models import (CircuitCreateV2,CircuitSaveV2,CircuitDocumentV2,CircuitPageV2,
    CircuitValidationResult,PhysicalPreviewResult,ExperimentCreateV2,ExperimentRecord,ExperimentDocumentReferenceV2)
from app.api.projects import with_etag
from app.services.api_contracts import ERROR_RESPONSES
from app.services.circuit_validator import validate_supported_circuit_graph

router=APIRouter(prefix='/api/v2',responses=ERROR_RESPONSES)
GRAPH_REQUEST={'requestBody':{'required':True,'content':{'application/json':{'schema':{'$ref':'#/components/schemas/AnySupportedCircuitGraph'}}}}}
GRAPH_ERRORS={422:{'model':CircuitValidationResult,'description':'Versioned graph validation result'}}


@router.get('/projects/{project_id}/circuits',operation_id='listCircuitsV2',response_model=CircuitPageV2,response_model_exclude_unset=True)
def list_circuits(project_id:str,request:Request,limit:int=Query(default=50,ge=1,le=100),cursor:str|None=Query(default=None,max_length=256)):
    return request.app.state.projects.list_circuits_v2(request.state.owner,project_id,limit=limit,cursor=cursor)


@router.post('/projects/{project_id}/circuits',operation_id='createCircuitV2',status_code=201,response_model=CircuitDocumentV2,response_model_exclude_unset=True)
def create_circuit(project_id:str,payload:CircuitCreateV2,request:Request,response:Response):
    return with_etag(response,request.app.state.projects.create_circuit_v2(request.state.owner,project_id,payload.model_dump(exclude_unset=True),auth_session_id=request.state.auth.session_id))


@router.get('/circuits/{document_id}',operation_id='getCircuitV2',response_model=CircuitDocumentV2,response_model_exclude_unset=True)
def get_circuit(document_id:str,request:Request,response:Response):
    return with_etag(response,request.app.state.projects.get_circuit_v2(request.state.owner,document_id))


@router.put('/circuits/{document_id}',operation_id='saveCircuitV2',response_model=CircuitDocumentV2,response_model_exclude_unset=True)
def save_circuit(document_id:str,payload:CircuitSaveV2,request:Request,response:Response):
    return with_etag(response,request.app.state.projects.save_circuit_v2(request.state.owner,document_id,payload.model_dump(exclude_unset=True),auth_session_id=request.state.auth.session_id))


@router.post('/circuits/validate',operation_id='validateCircuitV2',response_model=CircuitValidationResult,response_model_exclude_unset=True,responses=GRAPH_ERRORS,openapi_extra=GRAPH_REQUEST)
def validate_circuit(payload:Any=Body(default=None)):
    valid,code,message=validate_supported_circuit_graph(payload)
    value={'valid':valid,'code':code,'message':message}
    return value if valid else JSONResponse(status_code=422,content=value)


@router.post('/circuits/physical-preview',operation_id='previewCircuitV2',response_model=PhysicalPreviewResult,response_model_exclude_none=True,response_model_exclude_unset=True,responses=GRAPH_ERRORS,openapi_extra=GRAPH_REQUEST)
def preview_circuit(request:Request,payload:Any=Body(default=None)):
    valid,code,message=validate_supported_circuit_graph(payload)
    if not valid:return JSONResponse(status_code=422,content={'valid':False,'code':code,'message':message})
    from netcircuit_sim.backends import preview_physical_graph,SimulationError
    from contracts.component_properties import normalize_design_properties
    try:
        value=preview_physical_graph(normalize_design_properties(payload),
            backend_id=request.app.state.configuration.simulation_backend)
        return {**value,'provenance':'simulation_preview','limitations':['Educational DC and digital component models have a limited execution envelope.','Physical acquisition and full SPICE or mixed-signal execution remain unavailable.']}
    except SimulationError as error:
        return JSONResponse(status_code=422,content={'valid':False,'code':str(error),'message':'The physical preview could not compile or settle this design.'})


@router.post('/experiments',operation_id='createExperimentV2',status_code=201,response_model=ExperimentRecord,response_model_exclude_unset=True)
def create_experiment(payload:ExperimentCreateV2,request:Request,operation_key:str|None=Header(default=None,alias='Idempotency-Key',min_length=1,max_length=128)):
    if payload.assignment_id:request.app.state.auth.authorize_assignment(request.state.auth,payload.assignment_id)
    return request.app.state.manager.create(request.state.owner,payload.model_dump(exclude_unset=True),operation_key=operation_key,auth_session_id=request.state.auth.session_id)


@router.get('/experiments/{experiment_id}/document-reference',operation_id='getExperimentDocumentReferenceV2',response_model=ExperimentDocumentReferenceV2,response_model_exclude_unset=True)
def document_reference(experiment_id:str,request:Request):
    return {**request.app.state.manager.document_reference(experiment_id,request.state.owner),'schema_version':'2.0'}
