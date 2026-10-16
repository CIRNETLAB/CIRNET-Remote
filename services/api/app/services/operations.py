"""Durable mutation identity. HTTP cancellation never undoes server intent."""
import hashlib
import json
import re
from contextlib import contextmanager
from threading import RLock
from weakref import WeakValueDictionary
from app.services.observability import correlation,log_event


def request_fingerprint(payload):
    wire=json.dumps(payload,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
    return hashlib.sha256(wire.encode('utf-8')).hexdigest()


def operation_key(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',value):
        raise ValueError('INVALID_OPERATION_KEY')
    return value


class OperationIdentity:
    def __init__(self,manager):
        self.manager=manager
        self._locks=WeakValueDictionary()
        self._locks_guard=RLock()

    @contextmanager
    def guard(self,owner,kind,key,scope):
        identity=(owner,kind,key,scope)
        with self._locks_guard:
            lock=self._locks.get(identity)
            if lock is None:
                lock=RLock()
                self._locks[identity]=lock
        # Waiting/active callers retain this lock; idle identities are collected.
        with lock:
            yield

    def existing(self,owner,kind,key,scope,fingerprint):
        try: value=self.manager.repo.operation(owner,kind,key,scope)
        except KeyError: return None
        if value['_fingerprint']!=fingerprint:
            log_event('operation.rejected',kind=kind,operation_key=key,experiment_id=scope or None,outcome='CONFLICT',error_code='IDEMPOTENCY_CONFLICT')
            raise ValueError('IDEMPOTENCY_CONFLICT')
        log_event('operation.reused',kind=kind,operation_key=key,experiment_id=value.get('experiment_id'),outcome='REUSED')
        return value

    def create(self,owner,payload,key,*,auth_session_id=None):
        with correlation(kind='create',operation_key=key):return self._create(owner,payload,key,auth_session_id=auth_session_id)

    def _create(self,owner,payload,key,*,auth_session_id=None):
        key=operation_key(key)
        fingerprint=request_fingerprint(payload)
        with self.guard(owner,'create',key,''):
            previous=self.existing(owner,'create',key,'',fingerprint)
            if previous:
                return self.manager.get(previous['experiment_id'],owner)
            # The experiment and completed Create identity commit together.
            return self.manager._create(owner,payload,operation={'key':key,'fingerprint':fingerprint},auth_session_id=auth_session_id)

    def mutate(self,kind,eid,owner,key,invoke):
        with correlation(kind=kind,experiment_id=eid,operation_key=key):return self._mutate(kind,eid,owner,key,invoke)

    def _mutate(self,kind,eid,owner,key,invoke):
        key=operation_key(key)
        fingerprint=request_fingerprint({'experiment_id':eid})
        with self.guard(owner,kind,key,eid):
            # Verify resource ownership even on an operation retry.
            experiment=self.manager.get(eid,owner)
            record=self.existing(owner,kind,key,eid,fingerprint)
            if record and record['status']=='FAILED':
                raise ValueError(record['error_code'])
            if record and record['status'] in {'ACCEPTED','APPLIED'}:
                return experiment
            recovering=record is not None
            if record is None:
                record=self.manager.repo.begin_operation(owner,kind,key,eid,fingerprint)
            try:
                # A persisted aggregate transition proves a lost Run request
                # was already admitted. Never replay Start after recovery.
                if recovering and kind=='run' and experiment['state']!='CREATED':
                    result=experiment
                else:
                    result=invoke()
                record.update(status='ACCEPTED',revision=record['revision']+1)
                self.manager.repo.save_operation(owner,record,eid)
                return result
            except (ValueError,PermissionError,KeyError) as error:
                code=str(error) if isinstance(error,ValueError) else 'FORBIDDEN' if isinstance(error,PermissionError) else 'NOT_FOUND'
                record.update(status='FAILED',error_code=code,revision=record['revision']+1)
                self.manager.repo.save_operation(owner,record,eid)
                raise

    def get(self,owner,key,kind='create',experiment_id=None):
        key=operation_key(key)
        if kind not in {'create','run','stop'} or kind!='create' and not experiment_id:
            raise ValueError('INVALID_CONFIGURATION')
        scope='' if kind=='create' else experiment_id
        with self.guard(owner,kind,key,scope):
            record=self.manager.repo.operation(owner,kind,key,scope)
            experiment=self.manager.get(record['experiment_id'],owner)
            # Acceptance is distinct from service completion and safe release.
            if record['status']=='ACCEPTED':
                terminal=experiment['state'] in {'COMPLETE','FAULT'}
                released=experiment['lease_expires_at'] is None and not any(
                    lease['experiment_id']==experiment['experiment_id'] for lease in self.manager.repo.leases())
                # CAPTURING is persisted only after Start acknowledges. A later
                # acquisition fault belongs to the experiment, regardless of
                # whether a client happened to poll before that fault.
                acknowledged=(kind=='run' and 'CAPTURING' in experiment['state_history']
                              or kind=='stop' and terminal and released)
                failed=not acknowledged and (experiment['state']=='FAULT'
                        or (experiment.get('execution_decision') or {}).get('decision','').startswith('BLOCK_')
                        or kind=='run' and terminal and released)
                if acknowledged or failed:
                    record.update(status='FAILED' if failed else 'APPLIED',
                                  error_code=(experiment['error_code'] or 'UNEXECUTABLE') if failed else None,
                                  revision=record['revision']+1)
                    self.manager.repo.save_operation(owner,record,scope)
            log_event('operation.observed',kind=kind,operation_key=key,experiment_id=experiment['experiment_id'],outcome=record['status'],revision=record['revision'],error_code=record.get('error_code'))
            return {**{key:value for key,value in record.items() if not key.startswith('_')},'experiment':experiment}
