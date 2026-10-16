from fastapi import APIRouter, Request, Response
from contracts.boundary.models import CaptureMetadata
from app.services.api_contracts import ERROR_RESPONSES

router=APIRouter(prefix='/api/captures', responses=ERROR_RESPONSES)


@router.get('/{capture_id}/payload', operation_id='getCapturePayload', response_class=Response, responses={200:{'description':'Bounded NCAP v1 payload',
    'content':{'application/vnd.netcircuit.capture; version=1':{'schema':{'type':'string','format':'binary'}}}}})
def payload(capture_id:str,request:Request):
    binary=request.app.state.manager.capture_payload(capture_id,request.state.owner,auth_session_id=request.state.auth.session_id)
    return Response(binary,media_type='application/vnd.netcircuit.capture; version=1',
                    headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})


@router.delete('/{capture_id}/payload', operation_id='deleteCapturePayload', response_model=CaptureMetadata, response_model_exclude_unset=True)
def delete_payload(capture_id:str,request:Request):
    return request.app.state.manager.delete_capture(capture_id,request.state.owner,auth_session_id=request.state.auth.session_id)
