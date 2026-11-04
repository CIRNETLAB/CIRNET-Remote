from fastapi import APIRouter, Request, Response
from contracts.boundary.models import CaptureMetadata
from app.services.api_contracts import ERROR_RESPONSES
from app.compatibility import CAPTURE_MEDIA_TYPE, LEGACY_CAPTURE_MEDIA_TYPE, health_service_name

router=APIRouter(prefix='/api/captures', responses=ERROR_RESPONSES)


@router.get('/{capture_id}/payload', operation_id='getCapturePayload', response_class=Response, responses={200:{'description':'Bounded NCAP v1 payload',
    'content':{media_type:{'schema':{'type':'string','format':'binary'}}
               for media_type in (CAPTURE_MEDIA_TYPE, LEGACY_CAPTURE_MEDIA_TYPE)}}})
def payload(capture_id:str,request:Request):
    binary=request.app.state.manager.capture_payload(capture_id,request.state.owner,auth_session_id=request.state.auth.session_id)
    accept = request.headers.get('accept','')
    if 'application/vnd.cirnet.capture' in accept:
        media_type = CAPTURE_MEDIA_TYPE
    elif 'application/vnd.netcircuit.capture' in accept:
        media_type = LEGACY_CAPTURE_MEDIA_TYPE
    else:
        media_type = CAPTURE_MEDIA_TYPE if health_service_name() == 'cirnet-api' else LEGACY_CAPTURE_MEDIA_TYPE
    return Response(binary,media_type=media_type,
                    headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})


@router.delete('/{capture_id}/payload', operation_id='deleteCapturePayload', response_model=CaptureMetadata, response_model_exclude_unset=True)
def delete_payload(capture_id:str,request:Request):
    return request.app.state.manager.delete_capture(capture_id,request.state.owner,auth_session_id=request.state.auth.session_id)
