import asyncio
import json
from contextlib import suppress
from anyio import CancelScope,move_on_after,to_thread
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jsonschema import ValidationError
from contracts.registry import validate_contract
from app.services.auth import AuthError
from app.services.events import SubscriptionLimit
from app.services.request_limits import MutationAdmission,json_complexity

router=APIRouter()

@router.websocket("/ws/events")
async def events_socket(websocket:WebSocket):
    config=websocket.app.state.configuration
    async def send(value):
        await asyncio.wait_for(websocket.send_json(value),config.websocket_send_seconds)
    async def close(code):
        with suppress(TimeoutError,WebSocketDisconnect,RuntimeError):
            await asyncio.wait_for(websocket.close(code=code),config.websocket_send_seconds)
    try:
        async with asyncio.timeout(config.websocket_handshake_seconds):
            await asyncio.to_thread(websocket.app.state.initialize)
            auth=websocket.app.state.auth
            auth.verify_origin(websocket.headers.get('origin'))
            context=await asyncio.to_thread(auth.current,websocket.cookies.get('netcircuit_session'))
    except AuthError:
        await close(4403); return
    except TimeoutError:
        await close(4408); return
    if context is None or not context.principal_id:
        await close(4401); return
    owner=context.owner_id
    hub=websocket.app.state.events
    try:token,queue=hub.subscribe(owner,session_id=context.session_id)
    except SubscriptionLimit:
        await close(4429);return
    receive=outgoing=None
    disconnect_code='DISCONNECTED'
    try:
        await asyncio.wait_for(websocket.accept(),config.websocket_handshake_seconds)
        await send(validate_contract('HelloEvent',hub.hello(token),profile='transport'))
        handshake_deadline=asyncio.get_running_loop().time()+config.websocket_handshake_seconds
        negotiated=False
        admission=MutationAdmission(limit=config.websocket_message_limit,maximum_principals=1)
        queue.account_delivery=True
        receive=asyncio.create_task(websocket.receive())
        outgoing=asyncio.create_task(queue.get())
        while True:
            # Quiet sockets must expire too. Check again before delivering any
            # queued private event, so revocation cannot drain a stale queue.
            wait_seconds=1 if negotiated else min(1,max(0,handshake_deadline-asyncio.get_running_loop().time()))
            completed,_=await asyncio.wait([receive,outgoing],timeout=wait_seconds,return_when=asyncio.FIRST_COMPLETED)
            if not negotiated and asyncio.get_running_loop().time()>=handshake_deadline:
                await close(4408);return
            if not await asyncio.to_thread(auth.session_active,context.session_id):
                disconnect_code='SESSION_EXPIRED'
                await close(4401); return
            if receive in completed:
                message=receive.result()
                if message["type"]=="websocket.disconnect": return
                if message.get("text") is None:
                    await close(1003); return
                text=message["text"]
                raw=text.encode('utf-8')
                if len(raw)>65536 or not json_complexity(raw,maximum_depth=32,maximum_tokens=2048):
                    await close(1009); return
                if not admission.allow(context.session_id):
                    await close(4429);return
                try: body=json.loads(text)
                except (ValueError,TypeError): body=None
                if isinstance(body,dict) and body.get('type')=='client.hello':
                    try: validate_contract('ClientHelloMessage',body,profile='transport')
                    except ValidationError:
                        failure=hub.protocol_error(token,'INVALID_MESSAGE','Invalid realtime negotiation message.')
                        await send(validate_contract('ProtocolErrorEvent',failure,profile='transport'))
                        await close(1002); return
                    if body['protocol_version']!='1.0':
                        failure=hub.protocol_error(token,'UNSUPPORTED_VERSION','Realtime protocol version is unsupported.')
                        await send(validate_contract('ProtocolErrorEvent',failure,profile='transport'))
                        await close(1002); return
                    if body.get('control_client_id') and not hub.bind_control(token,body['control_client_id']):
                        failure=hub.protocol_error(token,'INVALID_MESSAGE','A control context cannot change within one connection.')
                        await send(validate_contract('ProtocolErrorEvent',failure,profile='transport'))
                        await close(1002); return
                    negotiated=True
                else:
                    # Versionless echo remains a compatibility/debug response, never a command.
                    if len(raw)>1024:
                        await close(1009);return
                    negotiated=True
                    await send(validate_contract('LegacyServerEvent',{'type':'echo','payload':text},profile='transport'))
                receive=asyncio.create_task(websocket.receive())
            if outgoing in completed:
                await send(validate_contract('ServerEvent',outgoing.result(),profile='transport'))
                queue.release_delivery()
                outgoing=asyncio.create_task(queue.get())
    except WebSocketDisconnect: pass
    except TimeoutError: await close(4408)
    finally:
        control=hub.control_context(token)
        hub.unsubscribe(token)
        # ASGI disconnect cancels the connection scope. Its safety cleanup must
        # finish before that scope exits rather than becoming an orphan task.
        with CancelScope(shield=True):
            with move_on_after(config.websocket_cleanup_seconds):
                if control and not hub.has_control(*control):
                    await to_thread.run_sync(websocket.app.state.manager.disconnect_control,control[1],control[2],disconnect_code,abandon_on_cancel=True)
            for task in (receive,outgoing):
                if task:
                    task.cancel()
                    with suppress(asyncio.CancelledError,WebSocketDisconnect): await task
