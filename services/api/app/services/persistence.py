"""SQLAlchemy persistence; PostgreSQL production, SQLite development/tests."""
from copy import deepcopy
from threading import RLock
import time
import uuid
from sqlalchemy import create_engine, delete, insert, literal, select, update, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool
from contracts.validation import validate
from app.services.observability import log_event

class Repository:
    def __init__(self, url):
        options={}
        if url.startswith("sqlite"):
            options["connect_args"]={"check_same_thread":False}
            if url in ("sqlite://","sqlite:///:memory:"):
                options["poolclass"]=StaticPool
        self.engine=create_engine(url, **options)
        if self.engine.dialect.name=='sqlite':
            @event.listens_for(self.engine,'connect')
            def foreign_keys(connection,record): connection.execute('PRAGMA foreign_keys=ON')
        self.lock=RLock()
        from app.db import schema
        from app.migrations import migrate
        migrate(self.engine)
        self.assignments=schema.assignments; self.experiments=schema.experiments
        self.lease_table=schema.leases; self.sessions=schema.sessions; self.operations=schema.operations
        self.auth_principals=schema.principals; self.auth_users=schema.users; self.auth_sessions=schema.auth_sessions
        self.assignment_access=schema.assignment_access; self.audit=schema.audit; self.rate_limits=schema.rate_limits
        self.projects=schema.projects; self.circuit_documents=schema.circuit_documents
        self.circuit_revisions=schema.circuit_revisions; self.experiment_document_refs=schema.experiment_document_refs
        self.assignment_documents=schema.assignment_documents; self.assignment_revisions=schema.assignment_revisions
        self.captures=schema.captures

    def create_assignment(self,value,*,owner_id='legacy-system',published=False,feedback_policy='observed_only'):
        value=validate("AssignmentDefinition",value)
        try:
            with self.lock,self.engine.begin() as db:
                db.execute(insert(self.assignments).values(assignment_id=value["assignment_id"],payload=value))
                db.execute(insert(self.assignment_access).values(assignment_id=value['assignment_id'],owner_id=owner_id,published=published,feedback_policy=feedback_policy))
                from app.migrations.schema_v0004 import seed_assignment
                seed_assignment(db,value['assignment_id'],value,{'owner_id':owner_id,'published':published},time.time())
        except IntegrityError:
            raise ValueError("ASSIGNMENT_EXISTS") from None
        return value

    def publish_assignment(self,assignment_id,owner_id,*,published=True,feedback_policy='observed_only'):
        with self.lock,self.engine.begin() as db:
            db.execute(update(self.assignment_access).where(self.assignment_access.c.assignment_id==assignment_id).values(owner_id=owner_id,published=published,feedback_policy=feedback_policy))
            table=self.assignment_documents
            db.execute(update(table).where(table.c.assignment_id==assignment_id).values(published_revision=table.c.revision if published else None))

    def assignment_policy(self,assignment_id):
        with self.lock,self.engine.connect() as db:
            row=db.execute(select(self.assignment_access).where(self.assignment_access.c.assignment_id==assignment_id)).mappings().first()
        if row is None: raise KeyError('ASSIGNMENT_NOT_FOUND')
        return dict(row)

    def get_assignment(self,assignment_id):
        with self.lock,self.engine.connect() as db:
            value=db.execute(select(self.assignments.c.payload).where(self.assignments.c.assignment_id==assignment_id)).scalar_one_or_none()
        if value is None: raise KeyError("ASSIGNMENT_NOT_FOUND")
        return deepcopy(value)

    def list_assignments(self):
        with self.lock,self.engine.connect() as db:
            return deepcopy(list(db.execute(select(self.assignments.c.payload).order_by(self.assignments.c.assignment_id)).scalars()))

    def create_experiment(self,owner,value,*,auth_session_id=None,authorize_session=None,authorize_assignment=None):
        with self.lock,self.engine.begin() as db:
            context=None
            if auth_session_id is not None:
                if authorize_session is None: raise ValueError('SESSION_EXPIRED')
                context=authorize_session(db,auth_session_id,owner)
            assignment=value.get('_assignment_reference')
            if assignment and authorize_assignment is not None:
                if context is None: raise ValueError('SESSION_EXPIRED')
                pinned=authorize_assignment(db,context,assignment['assignment_id'],assignment['revision'],value['_assignment_snapshot'])
                value={**value,'_assignment_reference':deepcopy(pinned)}
            reference=value.get('_document_reference')
            record={'experiment_id':value['experiment_id'],'owner_id':owner,'payload':deepcopy(value)}
            if reference:
                # Recheck ownership and liveness at the write itself. An earlier
                # resolver read cannot authorize a reference after claim/delete
                # in another repository connection. Immutable revision FK below
                # still pins the historical graph rather than the current head.
                documents,projects=self.circuit_documents,self.projects
                source=select(*(literal(item,type_=self.experiments.c[key].type) for key,item in record.items())).select_from(documents.join(projects,documents.c.project_id==projects.c.project_id)).where(
                    documents.c.document_id==reference['document_id'],documents.c.owner_id==owner,documents.c.deleted==False,
                    projects.c.owner_id==owner,projects.c.deleted==False)
                admitted=db.execute(insert(self.experiments).from_select(list(record),source).returning(self.experiments.c.experiment_id)).scalar_one_or_none()
                if admitted is None:
                    raise ValueError('DOCUMENT_UNAVAILABLE')
            else:
                db.execute(insert(self.experiments).values(**record))
            if reference:
                db.execute(insert(self.experiment_document_refs).values(experiment_id=value['experiment_id'],document_id=reference['document_id'],revision=reference['revision']))
            operation=value.get('_operation')
            if operation:
                self._insert_operation(db,owner,'create',operation['key'],'',operation['fingerprint'],{
                    'schema_version':'1.0','operation_key':operation['key'],'kind':'create','status':'APPLIED',
                    'experiment_id':value['experiment_id'],'error_code':None,'revision':1})
        if operation:log_event('operation.changed',kind='create',operation_key=operation['key'],experiment_id=value['experiment_id'],outcome='APPLIED',revision=1)

    def _insert_operation(self,db,owner,kind,key,scope,fingerprint,payload):
        db.execute(insert(self.operations).values(owner_id=owner,kind=kind,operation_key=key,scope=scope,
                   fingerprint=fingerprint,payload=deepcopy(payload)))

    def operation(self,owner,kind,key,scope=''):
        table=self.operations
        with self.lock,self.engine.connect() as db:
            row=db.execute(select(table.c.fingerprint,table.c.payload).where(table.c.owner_id==owner,
                table.c.kind==kind,table.c.operation_key==key,table.c.scope==scope)).mappings().first()
        if row is None: raise KeyError('OPERATION_NOT_FOUND')
        return deepcopy({**row['payload'],'_fingerprint':row['fingerprint']})

    def begin_operation(self,owner,kind,key,scope,fingerprint):
        payload={'schema_version':'1.0','operation_key':key,'kind':kind,'status':'REQUESTED',
                 'experiment_id':scope or None,'error_code':None,'revision':0}
        with self.lock,self.engine.begin() as db:
            self._insert_operation(db,owner,kind,key,scope,fingerprint,payload)
        log_event('operation.changed',kind=kind,operation_key=key,experiment_id=scope or None,outcome='REQUESTED',revision=0)
        return payload

    def begin_instrument_command(self,owner,payload,fingerprint,session_id,authorize_session):
        with self.lock,self.engine.begin() as db:
            if authorize_session is not None:authorize_session(db,session_id,owner)
            self._insert_operation(db,owner,'generator',payload['operation_key'],payload['experiment_id'],fingerprint,payload)
        log_event('instrument.command_changed',kind='generator',operation_key=payload['operation_key'],experiment_id=payload['experiment_id'],outcome='REQUESTED',revision=0)

    def save_instrument_command(self,owner,payload):
        table=self.operations
        with self.lock,self.engine.begin() as db:
            db.execute(update(table).where(table.c.owner_id==owner,table.c.kind=='generator',
                table.c.scope==payload['experiment_id'],table.c.operation_key==payload['operation_key']).values(payload=deepcopy(payload)))
        log_event('instrument.command_changed',kind='generator',operation_key=payload['operation_key'],experiment_id=payload['experiment_id'],outcome=payload['status'],revision=payload['revision'],error_code=payload.get('error_code'))

    def save_operation(self,owner,payload,scope=''):
        table=self.operations
        clean={key:value for key,value in payload.items() if not key.startswith('_') and key!='experiment'}
        with self.lock,self.engine.begin() as db:
            db.execute(update(table).where(table.c.owner_id==owner,table.c.kind==clean['kind'],
                table.c.scope==scope,table.c.operation_key==clean['operation_key']).values(payload=deepcopy(clean)))
        log_event('operation.changed',kind=clean['kind'],operation_key=clean['operation_key'],experiment_id=clean.get('experiment_id'),outcome=clean['status'],revision=clean['revision'],error_code=clean.get('error_code'))

    def get_experiment(self,experiment_id,owner=None):
        with self.lock,self.engine.connect() as db:
            row=db.execute(select(self.experiments).where(self.experiments.c.experiment_id==experiment_id)).mappings().first()
        if row is None: raise KeyError("EXPERIMENT_NOT_FOUND")
        if owner is not None and row["owner_id"] != owner: raise PermissionError("FORBIDDEN")
        return deepcopy(row["payload"])

    def owner(self,experiment_id):
        with self.lock,self.engine.connect() as db:
            row=db.execute(select(self.experiments.c.owner_id).where(self.experiments.c.experiment_id==experiment_id)).scalar_one_or_none()
        if row is None: raise KeyError("EXPERIMENT_NOT_FOUND")
        return row

    def _save_experiment(self,db,value):
        # Updating the parent row is also the fence used by claim, reservation
        # and capture retirement before related rows are changed.
        changed=db.execute(update(self.experiments).where(self.experiments.c.experiment_id==value["experiment_id"]).values(payload=deepcopy(value)))
        from app.services.capture_repository import sync_capture
        sync_capture(self,db,value)
        return changed

    def save_experiment(self,value):
        with self.lock,self.engine.begin() as db:
            self._save_experiment(db,value)

    def recover_experiment(self,value,*,safe):
        """Commit restart cleanup after the caller obtains the actual Stop ACK."""
        if type(safe) is not bool or value.get('state')!='FAULT' or value.get('error_code')!='RESTART_RECOVERY' or value.get('lease_expires_at') is not None:
            raise ValueError('INVALID_RECOVERY_STATE')
        with self.lock,self.engine.begin() as db:
            changed=self._save_experiment(db,value)
            if changed.rowcount!=1:raise KeyError('EXPERIMENT_NOT_FOUND')
            if safe:
                db.execute(delete(self.lease_table).where(self.lease_table.c.experiment_id==value['experiment_id']))
            else:
                db.execute(update(self.lease_table).where(self.lease_table.c.experiment_id==value['experiment_id']).values(quarantined=True))
            action='EXPERIMENT_RESTART_RECOVERED' if safe else 'EXPERIMENT_RESTART_QUARANTINED'
            db.execute(insert(self.audit).values(occurred_at=time.time(),actor_id=None,action=action,subject_id=value['experiment_id']))

    def capture_reference(self,identity,owner=None):
        from app.services.capture_repository import capture_reference
        return capture_reference(self,identity,owner)

    def retire_capture(self,identity,owner,reason='DELETED',*,auth_session_id=None,authorize_session=None):
        from app.services.capture_repository import retire_capture
        return retire_capture(self,identity,owner,reason,auth_session_id,authorize_session)

    def finish_capture_cleanup(self,identity):
        from app.services.capture_repository import finish_capture_cleanup
        return finish_capture_cleanup(self,identity)

    def expired_captures(self,cutoff,limit=100):
        from app.services.capture_repository import expired_captures
        return expired_captures(self,cutoff,limit)

    def list_experiments(self,owner=None):
        query=select(self.experiments.c.payload).order_by(self.experiments.c.sequence)
        if owner is not None: query=query.where(self.experiments.c.owner_id==owner)
        with self.lock,self.engine.connect() as db:
            return deepcopy(list(db.execute(query).scalars()))

    def experiment_page(self,owner,*,limit=50,cursor=None,active=False):
        from app.services.experiment_history import page_experiments
        return page_experiments(self,owner,limit=limit,cursor=cursor,active=active)

    def owned_experiment_ids(self,owner,identities):
        if not identities:return set()
        table=self.experiments
        with self.lock,self.engine.connect() as db:
            return set(db.execute(select(table.c.experiment_id).where(table.c.owner_id==owner,
                table.c.experiment_id.in_(identities))).scalars())

    def reserve(self,station_id,slot,experiment_id,expires):
        try:
            with self.lock,self.engine.begin() as db:
                locked=db.execute(update(self.experiments).where(self.experiments.c.experiment_id==experiment_id).values(owner_id=self.experiments.c.owner_id).returning(self.experiments.c.payload)).scalar_one_or_none()
                if locked is None or locked.get('state') in ('COMPLETE','FAULT'):return False
                db.execute(insert(self.lease_table).values(station_id=station_id,slot=slot,experiment_id=experiment_id,expires_at=expires,quarantined=False))
            return True
        except IntegrityError: return False

    def leases(self):
        with self.lock,self.engine.connect() as db:
            return [dict(row) for row in db.execute(select(self.lease_table)).mappings()]

    def release(self,experiment_id):
        with self.lock,self.engine.begin() as db:
            db.execute(delete(self.lease_table).where(self.lease_table.c.experiment_id==experiment_id))

    def quarantine(self,experiment_id):
        with self.lock,self.engine.begin() as db:
            db.execute(update(self.lease_table).where(self.lease_table.c.experiment_id==experiment_id).values(quarantined=True))

    def session(self,cookie,ttl=86400):
        now=time.time()
        with self.lock,self.engine.begin() as db:
            db.execute(delete(self.sessions).where(self.sessions.c.expires_at<now))
            expiry=db.execute(select(self.sessions.c.expires_at).where(self.sessions.c.session_id==cookie)).scalar_one_or_none() if cookie else None
            if expiry is not None: return cookie
            session=uuid.uuid4().hex
            db.execute(insert(self.sessions).values(session_id=session,expires_at=now+ttl))
            return session

    def session_exists(self,cookie):
        if not cookie: return False
        with self.lock,self.engine.connect() as db:
            expiry=db.execute(select(self.sessions.c.expires_at).where(self.sessions.c.session_id==cookie)).scalar_one_or_none()
        return expiry is not None and expiry>time.time()

    def close(self):
        self.engine.dispose()
