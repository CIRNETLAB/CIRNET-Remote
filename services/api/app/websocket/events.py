import asyncio
from contextlib import suppress
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router=APIRouter()

@router.websocket("/ws/events")
async def events_socket(websocket:WebSocket):
    owner=websocket.cookies.get("netcircuit_session")
    repo=websocket.app.state.repository
    if not repo.session_exists(owner): owner=None
    hub=websocket.app.state.events
    token,queue=hub.subscribe(owner)
    receive=outgoing=None
    try:
        await websocket.accept()
        await websocket.send_json({"type":"hello","service":"netcircuit-api"})
        receive=asyncio.create_task(websocket.receive())
        outgoing=asyncio.create_task(queue.get())
        while True:
            completed,_=await asyncio.wait([receive,outgoing],return_when=asyncio.FIRST_COMPLETED)
            if receive in completed:
                message=receive.result()
                if message["type"]=="websocket.disconnect": return
                if message.get("text") is None:
                    await websocket.close(code=1003); return
                await websocket.send_json({"type":"echo","payload":message["text"]})
                receive=asyncio.create_task(websocket.receive())
            if outgoing in completed:
                await websocket.send_json(outgoing.result())
                outgoing=asyncio.create_task(queue.get())
    except WebSocketDisconnect: pass
    finally:
        for task in (receive,outgoing):
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError,WebSocketDisconnect): await task
        if hub.unsubscribe(token) and owner is not None:
            await asyncio.to_thread(websocket.app.state.manager.disconnect,owner)
