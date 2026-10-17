from fastapi import APIRouter,Query,Request,Response
from contracts.boundary.models import Project,ProjectPage,ProjectCreate,ProjectUpdate,ProjectDelete,ProjectDeletion,CircuitPage,CircuitCreate,CircuitDocument,CircuitSave,CircuitDelete,CircuitDeletion
from app.services.api_contracts import ERROR_RESPONSES

router=APIRouter(prefix='/api',responses=ERROR_RESPONSES)

def with_etag(response,value):
    response.headers['ETag']='"'+str(value['revision'])+'"'
    return value

def legacy_document(value):
    if value.get('graph_schema_version')=='1.2' or any(item.get('graph_schema_version')=='1.2' for item in value.get('items',[])):
        raise ValueError('UNSUPPORTED_DOCUMENT_VERSION')
    return value

@router.get('/projects',operation_id='listProjects',response_model=ProjectPage,response_model_exclude_unset=True)
def list_projects(request:Request,limit:int=Query(default=50,ge=1,le=100),cursor:str|None=Query(default=None,max_length=256)):
    return request.app.state.projects.list_projects(request.state.owner,limit=limit,cursor=cursor)

@router.post('/projects',operation_id='createProject',status_code=201,response_model=Project,response_model_exclude_unset=True)
def create_project(payload:ProjectCreate,request:Request,response:Response):
    return with_etag(response,request.app.state.projects.create_project(request.state.owner,payload.model_dump(),auth_session_id=request.state.auth.session_id))

@router.get('/projects/{project_id}',operation_id='getProject',response_model=Project,response_model_exclude_unset=True)
def get_project(project_id:str,request:Request,response:Response):
    return with_etag(response,request.app.state.projects.get_project(request.state.owner,project_id))

@router.patch('/projects/{project_id}',operation_id='updateProject',response_model=Project,response_model_exclude_unset=True)
def update_project(project_id:str,payload:ProjectUpdate,request:Request,response:Response):
    return with_etag(response,request.app.state.projects.update_project(request.state.owner,project_id,payload.model_dump(),auth_session_id=request.state.auth.session_id))

@router.delete('/projects/{project_id}',operation_id='deleteProject',response_model=ProjectDeletion,response_model_exclude_unset=True)
def delete_project(project_id:str,payload:ProjectDelete,request:Request):
    return request.app.state.projects.delete_project(request.state.owner,project_id,payload.base_revision,auth_session_id=request.state.auth.session_id)

@router.get('/projects/{project_id}/circuits',operation_id='listCircuits',response_model=CircuitPage,response_model_exclude_unset=True)
def list_circuits(project_id:str,request:Request,limit:int=Query(default=50,ge=1,le=100),cursor:str|None=Query(default=None,max_length=256)):
    return legacy_document(request.app.state.projects.list_circuits(request.state.owner,project_id,limit=limit,cursor=cursor))

@router.post('/projects/{project_id}/circuits',operation_id='createCircuit',status_code=201,response_model=CircuitDocument,response_model_exclude_unset=True)
def create_circuit(project_id:str,payload:CircuitCreate,request:Request,response:Response):
    return with_etag(response,request.app.state.projects.create_circuit(request.state.owner,project_id,payload.model_dump(),auth_session_id=request.state.auth.session_id))

@router.get('/circuits/{document_id}',operation_id='getCircuit',response_model=CircuitDocument,response_model_exclude_unset=True)
def get_circuit(document_id:str,request:Request,response:Response):
    return with_etag(response,legacy_document(request.app.state.projects.get_circuit(request.state.owner,document_id)))

@router.put('/circuits/{document_id}',operation_id='saveCircuit',response_model=CircuitDocument,response_model_exclude_unset=True)
def save_circuit(document_id:str,payload:CircuitSave,request:Request,response:Response):
    legacy_document(request.app.state.projects.get_circuit(request.state.owner,document_id))
    return with_etag(response,request.app.state.projects.save_circuit(request.state.owner,document_id,payload.model_dump(),auth_session_id=request.state.auth.session_id))

@router.delete('/circuits/{document_id}',operation_id='deleteCircuit',response_model=CircuitDeletion,response_model_exclude_unset=True)
def delete_circuit(document_id:str,payload:CircuitDelete,request:Request):
    return request.app.state.projects.delete_circuit(request.state.owner,document_id,payload.base_revision,auth_session_id=request.state.auth.session_id)
