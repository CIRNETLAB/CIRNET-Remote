from fastapi import APIRouter, Request
from contracts.boundary.models import UserCreate, UserUpdate, UserView
from app.services.api_contracts import ERROR_RESPONSES

router=APIRouter(prefix='/api/admin/users',responses=ERROR_RESPONSES)

@router.get('',operation_id='listUsers',response_model=list[UserView],response_model_exclude_unset=True)
def list_users(request:Request): return request.app.state.auth.list_users(request.state.auth)

@router.post('',operation_id='createUser',status_code=201,response_model=UserView,response_model_exclude_unset=True)
def create_user(payload:UserCreate,request:Request):
    return request.app.state.auth.create_user(**payload.model_dump(),actor=request.state.auth)

@router.patch('/{principal_id}',operation_id='updateUser',response_model=UserView,response_model_exclude_unset=True)
def update_user(principal_id:str,payload:UserUpdate,request:Request):
    return request.app.state.auth.update_user(principal_id,payload.model_dump(),actor=request.state.auth)
