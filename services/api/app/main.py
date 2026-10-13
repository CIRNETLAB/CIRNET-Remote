import asyncio
from contextlib import asynccontextmanager, suppress
import re
from threading import RLock
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from jsonschema import ValidationError
from app.config import settings
from app.api.health import router as health_router
from app.api.circuits import router as circuits_router
from app.api.stations import router as stations_router
from app.api.assignments import router as assignments_router
from app.api.experiments import router as experiments_router
from app.api.captures import router as captures_router
from app.websocket.events import router as websocket_router
from app.services.persistence import Repository
from app.services.experiments import ExperimentManager
from app.services.hardware_client import HardwareServiceClient, GatewayError
from app.services.events import EventHub
from app.services.stations import StationService
from app.services.capture_store import FilesystemCaptureStore

def create_app(*,repository=None,gateway=None,submit=None,configuration=None,capture_store=None):
    config=configuration or settings
    repo=repository or Repository(config.database_url)
    gateway=gateway or HardwareServiceClient(config.hardware_grpc_target)
    hub=EventHub()
    captures=capture_store or FilesystemCaptureStore(config.capture_dir)
    manager=ExperimentManager(repo,gateway,submit=submit,emit=hub.publish,capture_store=captures)
    lifespan_lock=RLock()
    lifespan_users=0
    async def monitor():
        while True:
            await asyncio.sleep(1)
            await asyncio.to_thread(manager.expire_leases)

    @asynccontextmanager
    async def lifespan(application):
        nonlocal lifespan_users,repo,manager
        with lifespan_lock:
            if manager.closed:
                repo=Repository(repo.engine.url.render_as_string(hide_password=False))
                manager=ExperimentManager(repo,gateway,submit=submit,emit=hub.publish,capture_store=captures)
                application.state.repository=repo
                application.state.manager=manager
                application.state.stations=StationService(gateway,manager)
            lifespan_users+=1
        task=asyncio.create_task(monitor())
        try: yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError): await task
            with lifespan_lock:
                lifespan_users-=1
                final_user=lifespan_users==0
            if final_user:
                await asyncio.to_thread(manager.close)
                close=getattr(gateway,"close",None)
                if close: close()
                repo.close()

    application=FastAPI(title="net*CIRCUIT Remote API",version="0.2.0",lifespan=lifespan)
    application.state.repository=repo; application.state.gateway=gateway
    application.state.manager=manager; application.state.events=hub
    application.state.stations=StationService(gateway,manager)

    @application.middleware("http")
    async def session(request:Request,call_next):
        if request.url.path.startswith("/api/"):
            cookie=request.cookies.get("netcircuit_session")
            owner=await asyncio.to_thread(repo.session,cookie)
            request.state.owner=owner
        response=await call_next(request)
        if request.url.path.startswith("/api/") and cookie!=owner:
            response.set_cookie("netcircuit_session",owner,httponly=True,samesite="lax",
                                secure=config.environment=="production",max_age=86400)
        return response

    async def error(request:Request,exception):
        if isinstance(exception,PermissionError): code,status="FORBIDDEN",403
        elif isinstance(exception,KeyError): code,status="NOT_FOUND",404
        elif isinstance(exception,GatewayError): code,status=exception.code,503
        elif isinstance(exception,ValidationError): code,status="INVALID_CONTRACT",422
        else:
            code=str(exception)
            if not re.fullmatch("[A-Z_]+",code): code="INVALID_CONFIGURATION"
            status=429 if code in ("RATE_LIMITED","QUEUE_FULL") else 409 if code in ("RESOURCE_CONFLICT","INVALID_STATE","ASSIGNMENT_EXISTS") else 422
        return JSONResponse(status_code=status,content={"code":code,"message":code})

    for kind in (ValueError,PermissionError,KeyError,GatewayError,ValidationError):
        application.add_exception_handler(kind,error)
    for router in (health_router,circuits_router,stations_router,assignments_router,experiments_router,captures_router,websocket_router):
        application.include_router(router)
    return application

app=create_app()
