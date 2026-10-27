import asyncio
from contextlib import asynccontextmanager, suppress
import re
import time
import uuid
from threading import RLock
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from starlette.exceptions import HTTPException
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
from app.services.auth import AuthService, AuthError
from app.services.request_limits import MutationAdmission,RequestBudgetMiddleware
from app.services.experiment_access import ExperimentAccessProjection
from app.services.projects import ProjectService,RevisionConflict
from app.services.assignments import AssignmentService
from app.services.observability import configure_logging,correlation,log_event

def bind_session_revocation(auth,manager):
    auth.set_revoke_callback(lambda session_ids:manager.disconnect_controls(session_ids,code='SESSION_REVOKED'))

def create_app(*,repository=None,gateway=None,submit=None,configuration=None,capture_store=None,schema_only=False,lazy=False):
    config=configuration or settings
    repo=repository
    hub=EventHub(maximum_subscriptions=config.websocket_max_subscriptions,maximum_per_owner=config.websocket_max_per_owner,
        maximum_per_session=config.websocket_max_per_session,event_bytes=config.websocket_event_bytes,queue_bytes=config.websocket_queue_bytes,
        total_bytes=config.websocket_total_bytes)
    captures=capture_store
    manager=None
    auth=None
    admission=MutationAdmission(limit=config.mutation_limit)
    lifespan_lock=RLock()
    lifespan_users=0

    def initialize():
        nonlocal repo,gateway,captures,manager,auth
        if schema_only: raise ValueError('UNAVAILABLE')
        configure_logging()
        with lifespan_lock:
            if manager is None or manager.closed:
                if repo is None: repo=Repository(config.database_url)
                elif manager is not None: repo=Repository(repo.engine.url.render_as_string(hide_password=False))
                if gateway is None: gateway=HardwareServiceClient(config.hardware_grpc_target)
                if captures is None: captures=FilesystemCaptureStore(config.capture_dir,max_bytes=config.capture_max_bytes,max_files=config.capture_max_files)
                auth=AuthService(repo,config)
                projects=ProjectService(repo,authorize_session=auth.require_principal_session)
                assignments=AssignmentService(repo,auth)
                manager=ExperimentManager(repo,gateway,submit=submit,emit=hub.publish,capture_store=captures,
                    simulation_workers=config.simulation_workers,control_session_active=auth.session_active,
                    public_projection=ExperimentAccessProjection(repo),document_resolver=projects.resolve_snapshot,
                    authorize_session=auth.require_principal_session,assignment_resolver=assignments.resolve_snapshot,
                    authorize_assignment=assignments.authorize_snapshot,capture_retention_seconds=config.capture_retention_seconds)
                bind_session_revocation(auth,manager)
                application.state.repository=repo
                application.state.gateway=gateway
                application.state.manager=manager
                application.state.stations=StationService(gateway,manager)
                application.state.auth=auth
                application.state.projects=projects
                application.state.assignments=assignments

    async def monitor():
        last_maintenance=0
        while True:
            await asyncio.sleep(1)
            await asyncio.to_thread(manager.expire_leases)
            await asyncio.to_thread(manager.expire_control_sessions,auth.session_active)
            await asyncio.to_thread(manager.dispatch_cancelled_stops)
            if time.monotonic()-last_maintenance>=60:
                last_maintenance=time.monotonic()
                try:
                    result=await asyncio.to_thread(auth.maintain)
                    log_event('auth.maintenance',deleted=result['sessions_removed']+result['rate_buckets_removed'],limit=config.auth_maintenance_batch)
                except Exception:
                    # Keep the monitor alive; do not log database exception
                    # text or turn a transient maintenance failure into a scan.
                    log_event('auth.maintenance',outcome='FAILED',error_code='UNAVAILABLE')

    @asynccontextmanager
    async def lifespan(application):
        nonlocal lifespan_users
        if schema_only:
            yield
            return
        await asyncio.to_thread(initialize)
        with lifespan_lock:
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

    application=FastAPI(title="net*CIRCUIT Remote API",version="0.1.1",lifespan=lifespan)
    application.state.events=hub
    application.state.configuration=config
    application.state.initialize=initialize
    if not schema_only and not lazy: initialize()

    @application.middleware("http")
    async def session(request:Request,call_next):
        candidate=request.headers.get('X-Request-ID','')
        request.state.request_id=candidate if re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',candidate) else uuid.uuid4().hex
        with correlation(inherit=False,request_id=request.state.request_id):
            return await handle_session(request,call_next)

    async def handle_session(request,call_next):
        began=time.monotonic()
        is_api=request.url.path.startswith('/api/')
        rotated=None
        try:
            if is_api:
                if schema_only:
                    raise AuthError('UNAVAILABLE',503)
                await asyncio.to_thread(initialize)
                # SameSite=Lax can omit a login cookie on a hostile top-level
                # POST. Reject its origin before minting any replacement cookie.
                if request.method not in {'GET','HEAD','OPTIONS'}:
                    auth.verify_origin(request.headers.get('origin'))
                bootstrap=request.method=='GET' and request.url.path=='/api/auth/session'
                cookie=request.cookies.get('netcircuit_session')
                if bootstrap and await asyncio.to_thread(auth.current,cookie) is None:
                    await asyncio.to_thread(auth.admit_bootstrap,request.client.host if request.client else '')
                context,rotated=await asyncio.to_thread(auth.ensure_session,cookie,
                    consume_legacy=bootstrap,allow_create=bootstrap) if cookie is not None or bootstrap else (None,None)
                request.state.auth=context
                request.state.owner=context.owner_id if context else None
                if (cookie is not None and context is None) or (context and context.replaced_invalid_cookie and not bootstrap):
                    raise AuthError('SESSION_EXPIRED',401)
                if context is None and request.url.path!='/api/health' and request.method!='OPTIONS':
                    raise AuthError('UNAUTHENTICATED',401)
                if request.method not in {'GET','HEAD','OPTIONS'}:
                    await asyncio.to_thread(auth.verify_mutation,context,request.headers.get('origin'),request.headers.get('x-csrf-token'))
                if request.method!='OPTIONS' and request.url.path not in {'/api/health','/api/auth/session','/api/auth/login','/api/auth/logout'} and not context.principal_id:
                    raise AuthError('UNAUTHENTICATED',401)
                if (request.method not in {'GET','HEAD','OPTIONS'} and request.url.path not in {'/api/auth/login','/api/auth/logout'}
                        and not request.url.path.endswith('/stop') and not admission.allow(context.owner_id)):
                    raise AuthError('RATE_LIMITED',429)
            response=await call_next(request)
        except AuthError as exception:
            response=await error(request,exception)
        except Exception as exception:
            # The public envelope and allowlisted event report the failure.
            # Do not rethrow private exception text to the ASGI error logger.
            response=await error(request,exception)
        response.headers['X-Request-ID']=request.state.request_id
        if is_api:
            response.headers['Cache-Control']='no-store'
            # A read sent before login may arrive after the old credential was
            # consumed. Its fallback must not overwrite the newer login cookie.
            # Explicit bootstrap and auth mutations own credential installation.
            token=getattr(request.state,'new_session_cookie',None)
            if token is None and request.method=='GET' and request.url.path=='/api/auth/session':
                token=rotated
            if token:
                context=request.state.auth
                response.set_cookie('netcircuit_session',token,httponly=True,samesite='lax',path='/',
                                    secure=config.environment=='production',max_age=config.session_ttl_seconds)
        route=getattr(request.scope.get('route'),'path','/unmatched')
        log_event('http.completed',method=request.method,route=route,status=response.status_code,
                  duration_ms=round((time.monotonic()-began)*1000,3))
        return response

    async def error(request:Request,exception):
        issues=[]
        if isinstance(exception,AuthError): code,status=exception.code,exception.status
        elif isinstance(exception,RevisionConflict): code,status='REVISION_CONFLICT',409
        elif isinstance(exception,PermissionError): code,status="FORBIDDEN",403
        elif isinstance(exception,KeyError): code,status="NOT_FOUND",404
        elif isinstance(exception,GatewayError): code,status=exception.code,504 if exception.code in ('TIMEOUT','GATEWAY_TIMEOUT') else 503
        elif isinstance(exception,RequestValidationError):
            code,status='REQUEST_VALIDATION_ERROR',422
            for issue in exception.errors():
                path=''.join('/'+str(part).replace('~','~0').replace('/','~1') for part in issue['loc'])
                if issue['type']=='canonical_contract':
                    for canonical in issue.get('ctx',{}).get('issues',[]):
                        issues.append({**canonical,'path':path+canonical['path'],
                                       'message':'The request field does not match its declared contract.'})
                    continue
                issues.append({'code':issue['type'],'path':path,'severity':'error','profile':'http-request',
                               'message':'The request field does not match its declared contract.'})
        elif isinstance(exception,ResponseValidationError): code,status='RESPONSE_CONTRACT_MISMATCH',500
        elif isinstance(exception,ValidationError):
            code,status="INVALID_CONTRACT",422
            from contracts.semantic_profiles import validation_issues
            issues=[{**issue,'message':'The field does not match its declared contract.'} for issue in validation_issues(exception)]
        elif isinstance(exception,HTTPException):
            status=exception.status_code
            code={401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',405:'METHOD_NOT_ALLOWED'}.get(status,'HTTP_ERROR')
        elif not isinstance(exception,ValueError): code,status='INTERNAL_ERROR',500
        else:
            code=str(exception)
            if not re.fullmatch("[A-Z_]+",code): code="INVALID_CONFIGURATION"
            status=401 if code in ('SESSION_EXPIRED','SESSION_REVOKED') else 429 if code in ("RATE_LIMITED","QUEUE_FULL") else 409 if code in ("RESOURCE_CONFLICT","INVALID_STATE","ASSIGNMENT_EXISTS","ASSIGNMENT_CHANGED","IDEMPOTENCY_CONFLICT") else 503 if code=='UNAVAILABLE' else 422
        messages={'FORBIDDEN':'This resource is not available to the current principal.',
            'NOT_FOUND':'The requested resource was not found.', 'INVALID_STATE':'The operation is not allowed in the current state.',
            'IDEMPOTENCY_CONFLICT':'This operation key was already used with a different request.',
            'REVISION_CONFLICT':'This document has a newer server revision. Keep your changes, reload or save a separate copy.',
            'UNAUTHENTICATED':'Sign in to access this resource.',
            'INVALID_CREDENTIALS':'The username or password is incorrect.',
            'CSRF_REJECTED':'Refresh the current session before submitting this request.',
            'ORIGIN_REJECTED':'This origin is not permitted to access the application.',
            'REQUEST_VALIDATION_ERROR':'The request does not match the API contract.',
            'INVALID_CONTRACT':'The request contains invalid contract data.',
            'RATE_LIMITED':'Too many requests; retry after the admission interval.',
            'QUEUE_FULL':'The execution queue is full.', 'INTERNAL_ERROR':'The application could not complete the request.'}
        body={'code':code,'message':messages.get(code,'The operation could not be completed: '+code.replace('_',' ').lower()+'.'),
              'request_id':getattr(request.state,'request_id',uuid.uuid4().hex)}
        if issues: body['issues']=issues
        if isinstance(exception,RevisionConflict): body['current_revision']=exception.current_revision
        key=request.headers.get('Idempotency-Key')
        if key and re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',key): body['operation_key']=key
        log_event('http.error',request_id=body['request_id'],method=request.method,
                  route=getattr(request.scope.get('route'),'path','/unmatched'),status=status,error_code=code,
                  operation_key=body.get('operation_key'))
        return JSONResponse(status_code=status,content=body)

    for kind in (AuthError,ValueError,PermissionError,KeyError,GatewayError,ValidationError,RequestValidationError,ResponseValidationError,HTTPException,Exception):
        application.add_exception_handler(kind,error)
    for router in (health_router,circuits_router,stations_router,assignments_router,experiments_router,captures_router,websocket_router):
        application.include_router(router)
    from app.api.operations import router as operations_router
    application.include_router(operations_router)
    from app.api.auth import router as auth_router
    from app.api.users import router as users_router
    application.include_router(auth_router)
    application.include_router(users_router)
    from app.api.projects import router as projects_router
    application.include_router(projects_router)
    from app.api.placement import router as placement_router
    application.include_router(placement_router)
    application.add_middleware(RequestBudgetMiddleware,configuration=config)
    if config.trusted_origins:
        application.add_middleware(CORSMiddleware,allow_origins=list(config.trusted_origins),allow_credentials=True,
            allow_methods=['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
            allow_headers=['Content-Type','X-CSRF-Token','X-Control-Client','Idempotency-Key','X-Request-ID','If-Match'],
            expose_headers=['ETag','X-Request-ID'])
    from app.services.api_contracts import install_openapi
    install_openapi(application)
    return application

app=create_app(lazy=True)
