from fastapi import APIRouter, Request
from contracts.boundary.models import GuestClaimRequest, LoginRequest, LogoutRequest, SessionView
from app.services.api_contracts import ERROR_RESPONSES

router=APIRouter(prefix='/api/auth',responses=ERROR_RESPONSES)

def rotate(request,result):
    context,cookie=result
    request.state.auth=context; request.state.owner=context.owner_id
    request.state.new_session_cookie=cookie
    return request.app.state.auth.view(context)

@router.get('/session',operation_id='getSession',response_model=SessionView,response_model_exclude_unset=True)
def session(request:Request): return request.app.state.auth.view(request.state.auth)

@router.post('/login',operation_id='login',response_model=SessionView,response_model_exclude_unset=True)
def login(payload:LoginRequest,request:Request):
    return rotate(request,request.app.state.auth.login(request.state.auth,payload.username,payload.password,request.client.host if request.client else ''))

@router.post('/logout',operation_id='logout',response_model=SessionView,response_model_exclude_unset=True)
def logout(payload:LogoutRequest,request:Request): return rotate(request,request.app.state.auth.logout(request.state.auth))

@router.post('/claim-guest',operation_id='claimGuest',response_model=SessionView,response_model_exclude_unset=True)
def claim_guest(payload:GuestClaimRequest,request:Request): return rotate(request,request.app.state.auth.claim_guest(request.state.auth,payload.confirm))
