from fastapi import APIRouter, Query, Request
from contracts.boundary.models import AssignmentDefinition, AssignmentView, InstructorAssignmentDocument, AssignmentPublication, AssignmentAuthoringCreate, AssignmentAuthoringSave, AssignmentAuthoringPublication, AssignmentAuthoringDocument, AssignmentAuthoringPage
from contracts.boundary.models import AssignmentViewV2, AssignmentAuthoringCreateV2, AssignmentAuthoringSaveV2, AssignmentAuthoringPublicationV2, AssignmentAuthoringDocumentV2, AssignmentAuthoringPageV2
from app.services.api_contracts import ERROR_RESPONSES

router=APIRouter(prefix="/api", responses=ERROR_RESPONSES)

@router.get("/assignments", operation_id='listAssignments', response_model=list[AssignmentView], response_model_exclude_unset=True)
def list_assignments(request:Request):
    return request.app.state.assignments.legacy_list(request.state.auth)

@router.post("/assignments", operation_id='createAssignment',status_code=201, response_model=InstructorAssignmentDocument, response_model_exclude_unset=True)
def create_assignment(payload:AssignmentDefinition,request:Request):
    service=request.app.state.assignments
    value=service.create(request.state.auth,payload.model_dump())
    return service.legacy_view(request.state.auth,value['assignment_id'])

@router.get("/assignments/{assignment_id}", operation_id='getAssignment', response_model=AssignmentView, response_model_exclude_unset=True)
def get_assignment(assignment_id:str,request:Request):
    return request.app.state.assignments.legacy_view(request.state.auth,assignment_id)

@router.patch('/assignments/{assignment_id}/publication',operation_id='publishAssignment',response_model=InstructorAssignmentDocument,response_model_exclude_unset=True)
def publish_assignment(assignment_id:str,payload:AssignmentPublication,request:Request):
    return request.app.state.assignments.legacy_publish(request.state.auth,assignment_id,payload.model_dump())

@router.get('/assignment-documents',operation_id='listAssignmentDocuments',response_model=AssignmentAuthoringPage,response_model_exclude_unset=True)
def list_documents(request:Request,limit:int=Query(default=50,ge=1,le=100),cursor:str|None=Query(default=None,max_length=256)):
    return request.app.state.assignments.list_documents(request.state.auth,limit=limit,cursor=cursor)

@router.post('/assignment-documents',operation_id='createAssignmentDocument',status_code=201,response_model=AssignmentAuthoringDocument,response_model_exclude_unset=True)
def create_document(payload:AssignmentAuthoringCreate,request:Request):
    return request.app.state.assignments.create(request.state.auth,payload.model_dump()['definition'])

@router.get('/assignment-documents/{assignment_id}',operation_id='getAssignmentDocument',response_model=AssignmentAuthoringDocument,response_model_exclude_unset=True)
def get_document(assignment_id:str,request:Request):
    return request.app.state.assignments.get_document(request.state.auth,assignment_id)

@router.put('/assignment-documents/{assignment_id}',operation_id='saveAssignmentDocument',response_model=AssignmentAuthoringDocument,response_model_exclude_unset=True)
def save_document(assignment_id:str,payload:AssignmentAuthoringSave,request:Request):
    return request.app.state.assignments.save(request.state.auth,assignment_id,payload.model_dump())

@router.patch('/assignment-documents/{assignment_id}/publication',operation_id='publishAssignmentDocument',response_model=AssignmentAuthoringDocument,response_model_exclude_unset=True)
def publish_document(assignment_id:str,payload:AssignmentAuthoringPublication,request:Request):
    return request.app.state.assignments.publish(request.state.auth,assignment_id,payload.model_dump())


@router.get('/v2/assignments',operation_id='listAssignmentsV2',response_model=list[AssignmentViewV2],response_model_exclude_unset=True)
def list_assignments_v2(request:Request):
    return request.app.state.assignments.legacy_list(request.state.auth,wire_version='2.0')


@router.get('/v2/assignments/{assignment_id}',operation_id='getAssignmentV2',response_model=AssignmentViewV2,response_model_exclude_unset=True)
def get_assignment_v2(assignment_id:str,request:Request):
    return request.app.state.assignments.legacy_view(request.state.auth,assignment_id,wire_version='2.0')


@router.get('/v2/assignment-documents',operation_id='listAssignmentDocumentsV2',response_model=AssignmentAuthoringPageV2,response_model_exclude_unset=True)
def list_documents_v2(request:Request,limit:int=Query(default=50,ge=1,le=100),cursor:str|None=Query(default=None,max_length=256)):
    return request.app.state.assignments.list_documents(request.state.auth,limit=limit,cursor=cursor,wire_version='2.0')


@router.post('/v2/assignment-documents',operation_id='createAssignmentDocumentV2',status_code=201,response_model=AssignmentAuthoringDocumentV2,response_model_exclude_unset=True)
def create_document_v2(payload:AssignmentAuthoringCreateV2,request:Request):
    return request.app.state.assignments.create(request.state.auth,payload.model_dump(exclude_unset=True)['definition'],wire_version='2.0')


@router.get('/v2/assignment-documents/{assignment_id}',operation_id='getAssignmentDocumentV2',response_model=AssignmentAuthoringDocumentV2,response_model_exclude_unset=True)
def get_document_v2(assignment_id:str,request:Request):
    return request.app.state.assignments.get_document(request.state.auth,assignment_id,wire_version='2.0')


@router.put('/v2/assignment-documents/{assignment_id}',operation_id='saveAssignmentDocumentV2',response_model=AssignmentAuthoringDocumentV2,response_model_exclude_unset=True)
def save_document_v2(assignment_id:str,payload:AssignmentAuthoringSaveV2,request:Request):
    return request.app.state.assignments.save(request.state.auth,assignment_id,payload.model_dump(exclude_unset=True),wire_version='2.0')


@router.patch('/v2/assignment-documents/{assignment_id}/publication',operation_id='publishAssignmentDocumentV2',response_model=AssignmentAuthoringDocumentV2,response_model_exclude_unset=True)
def publish_document_v2(assignment_id:str,payload:AssignmentAuthoringPublicationV2,request:Request):
    return request.app.state.assignments.publish(request.state.auth,assignment_id,payload.model_dump(exclude_unset=True),wire_version='2.0')
