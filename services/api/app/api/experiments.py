from fastapi import APIRouter, Header, Query, Request
from contracts.boundary.models import ExperimentCreate, ExperimentRecord, ExperimentDocumentReference, InstrumentConfigureRequest, InstrumentOperationResult, ExperimentHistoryPage, ExperimentActiveSnapshot, InstrumentControlAccess, InstrumentGeneratorCommand, InstrumentCommandRecord
from app.services.api_contracts import ERROR_RESPONSES

router=APIRouter(prefix="/api/experiments", responses=ERROR_RESPONSES)

@router.post("", operation_id='createExperiment',status_code=201, response_model=ExperimentRecord, response_model_exclude_unset=True)
def create_experiment(payload:ExperimentCreate,request:Request,
                      operation_key:str|None=Header(default=None,alias='Idempotency-Key',min_length=1,max_length=128)):
    if payload.circuit_document_id is not None:
        snapshot=request.app.state.projects.resolve_snapshot(request.state.owner,payload.circuit_document_id,payload.circuit_revision)
        if snapshot['graph_schema_version']=='1.2':raise ValueError('UNSUPPORTED_DOCUMENT_VERSION')
    if payload.assignment_id:
        request.app.state.auth.authorize_assignment(request.state.auth,payload.assignment_id)
    return request.app.state.manager.create(request.state.owner,payload.model_dump(),operation_key=operation_key,
        auth_session_id=request.state.auth.session_id)

@router.get("", operation_id='listExperiments', response_model=list[ExperimentRecord], response_model_exclude_unset=True)
def list_experiments(request:Request):
    return request.app.state.manager.list(request.state.owner)

@router.get('/history',operation_id='listExperimentHistory',response_model=ExperimentHistoryPage,response_model_exclude_unset=True)
def history(request:Request,limit:int=Query(default=50,ge=1,le=100),cursor:str|None=Query(default=None,min_length=1,max_length=1024)):
    return request.app.state.manager.history(request.state.owner,limit=limit,cursor=cursor)

@router.get('/active',operation_id='listActiveExperiments',response_model=ExperimentActiveSnapshot,response_model_exclude_unset=True)
def active(request:Request,cursor:str|None=Query(default=None,min_length=1,max_length=1024)):
    return request.app.state.manager.active_snapshot(request.state.owner,cursor=cursor)

@router.get("/{experiment_id}", operation_id='getExperiment', response_model=ExperimentRecord, response_model_exclude_unset=True)
def get_experiment(experiment_id:str,request:Request):
    return request.app.state.manager.get(experiment_id,request.state.owner)

@router.post("/{experiment_id}/run", operation_id='runExperiment', response_model=ExperimentRecord, response_model_exclude_unset=True)
def run_experiment(experiment_id:str,request:Request,
                   control_client_id:str=Header(alias='X-Control-Client',min_length=1,max_length=128,pattern=r'^[A-Za-z0-9_.:-]+$'),
                   operation_key:str|None=Header(default=None,alias='Idempotency-Key',min_length=1,max_length=128)):
    return request.app.state.manager.run(experiment_id,request.state.owner,operation_key=operation_key,
        control_session_id=request.state.auth.session_id,control_client_id=control_client_id)

@router.post("/{experiment_id}/stop", operation_id='stopExperiment', response_model=ExperimentRecord, response_model_exclude_unset=True)
def stop_experiment(experiment_id:str,request:Request,
                    operation_key:str|None=Header(default=None,alias='Idempotency-Key',min_length=1,max_length=128)):
    return request.app.state.manager.stop(experiment_id,request.state.owner,operation_key=operation_key)

@router.get("/{experiment_id}/results", operation_id='getExperimentResults', response_model=ExperimentRecord, response_model_exclude_unset=True)
def results(experiment_id:str,request:Request):
    return request.app.state.manager.get(experiment_id,request.state.owner)

@router.get('/{experiment_id}/document-reference',operation_id='getExperimentDocumentReference',response_model=ExperimentDocumentReference,response_model_exclude_unset=True)
def document_reference(experiment_id:str,request:Request):
    value=request.app.state.manager.document_reference(experiment_id,request.state.owner)
    if value['graph_schema_version']=='1.2':raise ValueError('UNSUPPORTED_DOCUMENT_VERSION')
    return value

@router.post("/{experiment_id}/instruments", operation_id='configureExperimentInstrument', response_model=InstrumentOperationResult, response_model_exclude_unset=True)
def configure_instrument(experiment_id:str,payload:InstrumentConfigureRequest,request:Request,
                         control_client_id:str=Header(alias='X-Control-Client',min_length=1,max_length=128,pattern=r'^[A-Za-z0-9_.:-]+$')):
    result=request.app.state.manager.configure_instrument(experiment_id,request.state.owner,payload.model_dump(),
        control_session_id=request.state.auth.session_id,control_client_id=control_client_id)
    return {**result,'status':'ACCEPTED' if result['accepted'] else 'FAILED'}

@router.get('/{experiment_id}/instruments/access',operation_id='getExperimentInstrumentAccess',response_model=InstrumentControlAccess,response_model_exclude_unset=True)
def instrument_access(experiment_id:str,request:Request,
        control_client_id:str|None=Header(default=None,alias='X-Control-Client',min_length=1,max_length=128,pattern=r'^[A-Za-z0-9_.:-]+$')):
    return request.app.state.manager.instrument_access(experiment_id,request.state.owner,
        control_session_id=request.state.auth.session_id,control_client_id=control_client_id)

@router.post('/{experiment_id}/instruments/generator',operation_id='configureExperimentGenerator',response_model=InstrumentCommandRecord,response_model_exclude_unset=True)
def generator_command(experiment_id:str,payload:InstrumentGeneratorCommand,request:Request,
        control_client_id:str=Header(alias='X-Control-Client',min_length=1,max_length=128,pattern=r'^[A-Za-z0-9_.:-]+$'),
        operation_key:str=Header(alias='Idempotency-Key',min_length=1,max_length=128,pattern=r'^[A-Za-z0-9_.:-]+$')):
    return request.app.state.manager.configure_generator_command(experiment_id,request.state.owner,payload.model_dump()['configuration'],operation_key,
        control_session_id=request.state.auth.session_id,control_client_id=control_client_id)

@router.get('/{experiment_id}/instruments/commands/{operation_key}',operation_id='getExperimentInstrumentCommand',response_model=InstrumentCommandRecord,response_model_exclude_unset=True)
def get_generator_command(experiment_id:str,operation_key:str,request:Request):
    return request.app.state.manager.generator_command(experiment_id,request.state.owner,operation_key)
