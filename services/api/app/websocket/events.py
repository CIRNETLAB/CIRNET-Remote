import asyncio
import json
from contextlib import suppress
from anyio import CancelScope
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jsonschema import ValidationError
from contracts.registry import validate_contract
from app.services.auth import AuthError

router=APIRouter()

@router.websocket("/ws/events")
async def events_socket(websocket:WebSocket):
    await asyncio.to_thread(websocket.app.state.initialize)
    auth=websocket.app.state.auth
    try:
        auth.verify_origin(websocket.headers.get('origin'))
    except AuthError:
        await websocket.close(code=4403); return
    context=await asyncio.to_thread(auth.current,websocket.cookies.get('netcircuit_session'))
    if context is None or not context.principal_id:
        await websocket.close(code=4401); return
    owner=context.owner_id
    hub=websocket.app.state.events
    token,queue=hub.subscribe(owner,session_id=context.session_id)
    receive=outgoing=None
    disconnect_code='DISCONNECTED'
    try:
        await websocket.accept()
        await websocket.send_json(validate_contract('HelloEvent',hub.hello(token),profile='transport'))
        receive=asyncio.create_task(websocket.receive())
        outgoing=asyncio.create_task(queue.get())
        while True:
            # Quiet sockets must expire too. Check again before delivering any
            # queued private event, so revocation cannot drain a stale queue.
            completed,_=await asyncio.wait([receive,outgoing],timeout=1,return_when=asyncio.FIRST_COMPLETED)
            if not await asyncio.to_thread(auth.session_active,context.session_id):
                disconnect_code='SESSION_EXPIRED'
                await websocket.close(code=4401); return
            if receive in completed:
                message=receive.result()
                if message["type"]=="websocket.disconnect": return
                if message.get("text") is None:
                    await websocket.close(code=1003); return
                text=message["text"]
                if len(text.encode('utf-8'))>65536:
                    await websocket.close(code=1009); return
                try: body=json.loads(text)
                except (ValueError,TypeError): body=None
                if isinstance(body,dict) and body.get('type')=='client.hello':
                    try: validate_contract('ClientHelloMessage',body,profile='transport')
                    except ValidationError:
                        failure=hub.protocol_error(token,'INVALID_MESSAGE','Invalid realtime negotiation message.')
                        await websocket.send_json(validate_contract('ProtocolErrorEvent',failure,profile='transport'))
                        await websocket.close(code=1002); return
                    if body['protocol_version']!='1.0':
                        failure=hub.protocol_error(token,'UNSUPPORTED_VERSION','Realtime protocol version is unsupported.')
                        await websocket.send_json(validate_contract('ProtocolErrorEvent',failure,profile='transport'))
                        await websocket.close(code=1002); return
                    if body.get('control_client_id') and not hub.bind_control(token,body['control_client_id']):
                        failure=hub.protocol_error(token,'INVALID_MESSAGE','A control context cannot change within one connection.')
                        await websocket.send_json(validate_contract('ProtocolErrorEvent',failure,profile='transport'))
                        await websocket.close(code=1002); return
                else:
                    # Versionless echo remains a compatibility/debug response, never a command.
                    await websocket.send_json(validate_contract('LegacyServerEvent',{'type':'echo','payload':text},profile='transport'))
                receive=asyncio.create_task(websocket.receive())
            if outgoing in completed:
                await websocket.send_json(validate_contract('ServerEvent',outgoing.result(),profile='transport'))
                outgoing=asyncio.create_task(queue.get())
    except WebSocketDisconnect: pass
    finally:
        control=hub.control_context(token)
        hub.unsubscribe(token)
        # ASGI disconnect cancels the connection scope. Its safety cleanup must
        # finish before that scope exits rather than becoming an orphan task.
        with CancelScope(shield=True):
            if control and not hub.has_control(*control):
                await asyncio.to_thread(websocket.app.state.manager.disconnect_control,control[1],control[2],disconnect_code)
            for task in (receive,outgoing):
                if task:
                    task.cancel()
                    with suppress(asyncio.CancelledError,WebSocketDisconnect): await task
