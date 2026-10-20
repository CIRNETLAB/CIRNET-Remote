"""Bounded single-worker admission; safety Stop/logout bypass it at the boundary."""
from collections import OrderedDict,deque
from threading import RLock
import time
import uuid
import asyncio
from starlette.responses import JSONResponse


def json_complexity(body,*,maximum_depth,maximum_tokens):
    """Linear framing scan before JSON parsing; quoted delimiters are data."""
    depth=tokens=0; quoted=False; escaped=False
    for value in body:
        if quoted:
            if escaped: escaped=False
            elif value==92: escaped=True
            elif value==34: quoted=False
            continue
        if value==34: quoted=True;tokens+=1
        elif value in (123,91): depth+=1;tokens+=1
        elif value in (125,93): depth-=1
        elif value in (44,58): tokens+=1
        if depth>maximum_depth or tokens>maximum_tokens: return False
    return True


class RequestBudgetMiddleware:
    """ASGI input cap before Starlette/FastAPI eagerly parse a request body."""
    def __init__(self,app,configuration):
        self.app=app;self.config=configuration

    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or not scope['path'].startswith('/api/'):
            return await self.app(scope,receive,send)
        headers={key.lower():value for key,value in scope.get('headers',[])}
        maximum=self.config.auth_request_max_bytes if scope['path'].startswith('/api/auth/') else self.config.request_max_bytes
        async def reject(code,status):
            request_id=headers.get(b'x-request-id',b'').decode('latin1')
            if not request_id or len(request_id)>128 or not request_id.isascii() or any(not (c.isalnum() or c in '_.:-') for c in request_id): request_id=uuid.uuid4().hex
            response=JSONResponse({'code':code,'message':'The request exceeds the supported input budget.' if code in ('REQUEST_TOO_LARGE','REQUEST_COMPLEXITY_EXCEEDED') else 'The request framing is invalid.',
                'request_id':request_id},status_code=status,headers={'Cache-Control':'no-store','X-Request-ID':request_id})
            await response(scope,receive,send)
        length=headers.get(b'content-length')
        if length is not None:
            if not length.isdigit(): return await reject('INVALID_REQUEST_FRAMING',400)
            normalized=length.lstrip(b'0') or b'0'
            ceiling=str(maximum).encode()
            if len(normalized)>len(ceiling) or (len(normalized)==len(ceiling) and normalized>ceiling):
                return await reject('REQUEST_TOO_LARGE',400)
        body=bytearray()
        deadline=time.monotonic()+self.config.request_body_seconds
        while True:
            try:message=await asyncio.wait_for(receive(),max(0,deadline-time.monotonic()))
            except TimeoutError:return await reject('REQUEST_TIMEOUT',400)
            if message['type']=='http.disconnect': return
            if message['type']!='http.request': continue
            chunk=message.get('body',b'')
            if len(body)+len(chunk)>maximum: return await reject('REQUEST_TOO_LARGE',400)
            body.extend(chunk)
            if not message.get('more_body',False): break
        if body and (not headers.get(b'content-type') or 'json' in headers.get(b'content-type',b'').decode('latin1').lower()):
            # json.loads(bytes) can autodetect UTF-16/32, including BOMless
            # ASCII containing NUL. The byte framing scan is UTF-8 only; raw
            # NUL is never valid JSON and must not desynchronize its escapes.
            if 0 in body:return await reject('INVALID_REQUEST_FRAMING',400)
            try:body.decode('utf-8')
            except UnicodeDecodeError:return await reject('INVALID_REQUEST_FRAMING',400)
            if not json_complexity(body,maximum_depth=self.config.request_json_max_depth,maximum_tokens=self.config.request_json_max_tokens):
                return await reject('REQUEST_COMPLEXITY_EXCEEDED',400)
        delivered=False
        async def bounded_receive():
            nonlocal delivered
            if not delivered:
                delivered=True
                return {'type':'http.request','body':bytes(body),'more_body':False}
            return await receive()
        await self.app(scope,bounded_receive,send)


class MutationAdmission:
    def __init__(self,*,limit=60,window=60,maximum_principals=10000,clock=time.monotonic):
        if min(limit,window,maximum_principals)<=0: raise ValueError('INVALID_CONFIGURATION')
        self.limit,self.window,self.maximum_principals=limit,window,maximum_principals
        self.clock=clock
        self.lock=RLock()
        self.windows=OrderedDict()

    def allow(self,principal):
        now=self.clock()
        with self.lock:
            while self.windows and next(iter(self.windows.values()))[-1]<=now-self.window:
                self.windows.popitem(last=False)
            pending=self.windows.get(principal)
            if pending is None:
                if len(self.windows)>=self.maximum_principals: return False
                pending=deque()
                self.windows[principal]=pending
            while pending and pending[0]<=now-self.window: pending.popleft()
            if len(pending)>=self.limit: return False
            pending.append(now)
            self.windows.move_to_end(principal)
            return True
