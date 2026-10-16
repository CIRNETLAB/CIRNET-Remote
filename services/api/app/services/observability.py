"""Allowlisted metadata logs; credentials, sessions and private evidence never enter."""
from contextlib import contextmanager
from contextvars import ContextVar
import json
import logging
from logging.handlers import QueueHandler,QueueListener
import math
from queue import Queue,Full
import re
from threading import RLock
import time
import atexit
import sys

_context=ContextVar('netcircuit_correlation',default=None)
_identifier=re.compile(r'[A-Za-z0-9_.:-]{1,128}')
_event=re.compile(r'[a-z][a-z0-9_.]{0,95}')
_route=re.compile(r'/[A-Za-z0-9_/{}/.:-]{0,255}')
_runtime=None
_runtime_lock=RLock()
_identifiers=frozenset(('request_id','causation_request_id','experiment_id','operation_key','capture_id','station_id'))
_counts=frozenset(('revision','status','duration_ms','scanned','deleted','failed','limit'))
_tokens={
    'method':frozenset(('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS')),
    'kind':frozenset(('create','run','stop','generator')),
    'state':frozenset(('CREATED','QUEUED','RESERVED','SAFE_STATE','TOPOLOGY_SCAN','SAFETY_CHECK','EXECUTION_DECISION','ROUTE_PREPARE','GUARDED_POWER_UP','RUNNING','CAPTURING','FUNCTIONAL_VERIFY','STOPPING','RELEASE','COMPLETE','FAULT')),
    'previous_state':frozenset(('CREATED','QUEUED','RESERVED','SAFE_STATE','TOPOLOGY_SCAN','SAFETY_CHECK','EXECUTION_DECISION','ROUTE_PREPARE','GUARDED_POWER_UP','RUNNING','CAPTURING','FUNCTIONAL_VERIFY','STOPPING','RELEASE','COMPLETE','FAULT')),
    'outcome':frozenset(('REQUESTED','ACCEPTED','APPLIED','FAILED','UNKNOWN','REUSED','CONFLICT','RECOVERED','QUARANTINED','SEALED','RETIRED','CLEANED')),
    'reason':frozenset(('DELETED','RETENTION','RESTART_RECOVERY')),
    'error_code':frozenset(('INTERNAL_ERROR','INVALID_CONFIGURATION','REQUEST_VALIDATION_ERROR','RESPONSE_CONTRACT_MISMATCH','INVALID_CONTRACT','UNAUTHENTICATED','FORBIDDEN','NOT_FOUND','METHOD_NOT_ALLOWED','HTTP_ERROR','SESSION_EXPIRED','SESSION_REVOKED','INVALID_CREDENTIALS','CSRF_REJECTED','ORIGIN_REJECTED','RATE_LIMITED','QUEUE_FULL','RESOURCE_CONFLICT','INVALID_STATE','REVISION_CONFLICT','IDEMPOTENCY_CONFLICT','UNAVAILABLE','UNEXECUTABLE','UNSAFE','SAFETY_INDETERMINATE','SAFE_STATE_FAILED','DRIVER_ERROR','HARDWARE_UNAVAILABLE','PROTOCOL_MISMATCH','TIMEOUT','GATEWAY_TIMEOUT','CANCELLED','STOPPED','DISCONNECTED','RESTART_RECOVERY','CAPTURE_ACTIVE','CAPTURE_UNAVAILABLE','CAPTURE_CORRUPT','CAPTURE_STORAGE_UNAVAILABLE','CAPTURE_QUOTA_EXCEEDED','CAPTURE_KEY_CONFLICT','CAPTURE_PAYLOAD_LIMIT','ACKNOWLEDGEMENT_UNKNOWN')),
}


def _safe(fields):
    result={}
    for name,value in fields.items():
        if name in _identifiers and isinstance(value,str) and _identifier.fullmatch(value):result[name]=value
        elif name in _counts and type(value) in (int,float) and 0<=value<=9007199254740991 and math.isfinite(value):result[name]=value
        elif name in _tokens and isinstance(value,str) and value in _tokens[name]:result[name]=value
        elif name=='route' and isinstance(value,str) and _route.fullmatch(value):result[name]=value
    return result


def current_correlation():
    return dict(_context.get() or {})


@contextmanager
def correlation(*,inherit=True,**fields):
    values={**(current_correlation() if inherit else {}),**_safe(fields)}
    token=_context.set(values)
    try:yield
    finally:_context.reset(token)


def log_event(event,**fields):
    """Only bounded scalar fields are serializable; never stringify exceptions."""
    if not isinstance(event,str) or not _event.fullmatch(event):return
    record={'event':event,**current_correlation(),**_safe(fields)}
    # No exc_info, request object, format arguments or caller-controlled message.
    logging.getLogger('netcircuit.api').info(json.dumps(record,separators=(',',':'),allow_nan=False))


class _BoundedHandler(QueueHandler):
    def __init__(self,queue):
        super().__init__(queue);self.dropped=0

    def enqueue(self,record):
        if self.dropped:
            notice=logging.LogRecord('netcircuit.api',logging.WARNING,'',0,json.dumps({'event':'observability.dropped','dropped':self.dropped}),(),None)
            try:self.queue.put_nowait(notice);self.dropped=0
            except Full:self.dropped+=1;return
        try:self.queue.put_nowait(record)
        except Full:self.dropped+=1


def configure_logging():
    """Runtime-only JSON sink. Bounded queueing never waits for a slow stream."""
    global _runtime
    with _runtime_lock:
        if _runtime is not None:return
        queue=Queue(maxsize=1024)
        output=logging.StreamHandler(sys.__stderr__ or sys.stderr);output.setFormatter(logging.Formatter('%(message)s'))
        listener=QueueListener(queue,output,respect_handler_level=True)
        handler=_BoundedHandler(queue)
        logger=logging.getLogger('netcircuit.api')
        logger.addHandler(handler);logger.setLevel(logging.INFO);logger.propagate=False
        listener.start();_runtime=(queue,listener,handler)


def flush_logging(timeout=1):
    """Best-effort bounded drain for CLI/process shutdown, outside control locks."""
    runtime=_runtime
    if runtime is None:return True
    deadline=time.monotonic()+timeout
    while runtime[0].unfinished_tasks and time.monotonic()<deadline:time.sleep(.005)
    return runtime[0].unfinished_tasks==0


atexit.register(flush_logging)
