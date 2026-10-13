from fastapi import APIRouter, Request, Response

router=APIRouter(prefix='/api/captures')


@router.get('/{capture_id}/payload')
def payload(capture_id:str,request:Request):
    binary=request.app.state.manager.capture_payload(capture_id,request.state.owner)
    return Response(binary,media_type='application/vnd.netcircuit.capture; version=1',
                    headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})


@router.delete('/{capture_id}/payload')
def delete_payload(capture_id:str,request:Request):
    return request.app.state.manager.delete_capture(capture_id,request.state.owner)
