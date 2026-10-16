"""Versioned assignment authoring and transaction-scoped disclosure authority."""
import base64
from copy import deepcopy
import json
import time
from sqlalchemy import insert,select,update
from sqlalchemy.exc import IntegrityError
from contracts.registry import load_schema,validate_contract
from app.services.auth import AuthError,SessionContext
from app.services.assignment_views import is_author,can_read,legacy_assignment_view
from app.services.projects import RevisionConflict

MAX_REVISION=load_schema('https://netcircuit.local/contracts/public/assignments/1.0/schema.json#/$defs/AssignmentAuthoringSave/properties/base_revision')['maximum']
MAX_ASSIGNMENT_BYTES=2_000_000

class AssignmentService:
    def __init__(self,repository,auth,*,clock=None):
        self.repo=repository;self.auth=auth;self.clock=clock or time.time

    def _current(self,db,context,*,author=False):
        current=self.auth.require_principal_session(db,context.session_id,context.owner_id)
        if author and (not current.authenticated or current.role not in ('INSTRUCTOR','ADMIN')):raise AuthError('FORBIDDEN')
        return current

    def _head(self,db,identity,*,lock=False):
        document,access=self.repo.assignment_documents,self.repo.assignment_access
        query=select(document,access.c.owner_id,access.c.published,access.c.feedback_policy).join(access,document.c.assignment_id==access.c.assignment_id).where(document.c.assignment_id==identity)
        if lock:query=query.with_for_update()
        row=db.execute(query).mappings().first()
        if row is None:raise KeyError('ASSIGNMENT_NOT_FOUND')
        return row

    def _definition(self,db,identity,revision):
        table=self.repo.assignment_revisions
        value=db.execute(select(table.c.definition).where(table.c.assignment_id==identity,table.c.revision==revision)).scalar_one_or_none()
        if value is None:raise KeyError('ASSIGNMENT_REVISION_NOT_FOUND')
        return deepcopy(value)

    def _audit(self,db,current,action,identity):
        self.auth._audit(db,current.principal_id,action,identity)

    def _admin_audit(self,db,current,head,action):
        if current.role=='ADMIN' and current.principal_id!=head['owner_id']:self._audit(db,current,'ASSIGNMENT_ADMIN_'+action,head['assignment_id'])

    def _summary(self,head,title):
        return {'schema_version':'1.0',**{key:head[key] for key in ('assignment_id','owner_id','revision','published_revision','published','feedback_policy','created_at','updated_at')},'title':title}

    def _document(self,db,head):
        definition=self._definition(db,head['assignment_id'],head['revision'])
        return {**self._summary(head,definition['title']),'definition':definition}

    def _request(self,name,payload):
        value=validate_contract(name,payload,profile='structural')
        if 'definition' in value:
            if not value['definition']['title'].strip():raise ValueError('INVALID_TITLE')
            try:raw=json.dumps(value['definition'],ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf-8')
            except (ValueError,TypeError,UnicodeError):raise ValueError('INVALID_ASSIGNMENT_JSON') from None
            if len(raw)>MAX_ASSIGNMENT_BYTES:raise ValueError('DOCUMENT_TOO_LARGE')
        return value

    def create(self,context,definition):
        value=self._request('AssignmentAuthoringCreate',{'definition':definition})['definition'];identity=value['assignment_id'];now=self.clock()
        try:
            with self.repo.lock,self.repo.engine.begin() as db:
                current=self._current(db,context,author=True)
                db.execute(insert(self.repo.assignments).values(assignment_id=identity,payload=value))
                db.execute(insert(self.repo.assignment_access).values(assignment_id=identity,owner_id=current.principal_id,published=False,feedback_policy='observed_only'))
                db.execute(insert(self.repo.assignment_revisions).values(assignment_id=identity,revision=1,definition=value,saved_by=current.principal_id,saved_at=now))
                db.execute(insert(self.repo.assignment_documents).values(assignment_id=identity,revision=1,published_revision=None,created_at=now,updated_at=now))
                self._audit(db,current,'ASSIGNMENT_CREATED',identity)
                return self._document(db,self._head(db,identity))
        except IntegrityError:raise ValueError('ASSIGNMENT_EXISTS') from None

    def get_document(self,context,identity):
        with self.repo.lock,self.repo.engine.begin() as db:
            current=self._current(db,context,author=True);head=self._head(db,identity)
            if not is_author(current,head):raise AuthError('FORBIDDEN')
            self._admin_audit(db,current,head,'READ')
            return self._document(db,head)

    def _cursor(self,cursor,owner):
        if cursor is None:return 0
        try:
            if not isinstance(cursor,str) or len(cursor)>256:raise ValueError()
            value=json.loads(base64.b64decode(cursor+'='*((-len(cursor))%4),altchars=b'-_',validate=True))
            if set(value)!={'version','scope','after'} or value['version']!=1 or value['scope']!=owner or type(value['after']) is not int or not 0<=value['after']<=9007199254740991:raise ValueError()
            return value['after']
        except (ValueError,TypeError,UnicodeError):raise ValueError('INVALID_CURSOR') from None

    def list_documents(self,context,*,limit=50,cursor=None):
        if type(limit) is not int or not 1<=limit<=100:raise ValueError('INVALID_PAGE_LIMIT')
        with self.repo.lock,self.repo.engine.begin() as db:
            current=self._current(db,context,author=True);scope=current.principal_id;after=self._cursor(cursor,scope)
            document,access,versions=self.repo.assignment_documents,self.repo.assignment_access,self.repo.assignment_revisions
            query=select(document,access.c.owner_id,access.c.published,access.c.feedback_policy,versions.c.definition['title'].as_string().label('title')).join(access,document.c.assignment_id==access.c.assignment_id).join(versions,(versions.c.assignment_id==document.c.assignment_id)&(versions.c.revision==document.c.revision)).where(document.c.sequence>after)
            if current.role!='ADMIN':query=query.where(access.c.owner_id==current.principal_id)
            rows=list(db.execute(query.order_by(document.c.sequence).limit(limit+1)).mappings());next_cursor=None
            if len(rows)>limit:
                payload={'version':1,'scope':scope,'after':rows[limit-1]['sequence']}
                next_cursor=base64.urlsafe_b64encode(json.dumps(payload,separators=(',',':')).encode()).decode().rstrip('=')
            for row in rows[:limit]:self._admin_audit(db,current,row,'READ')
            return {'schema_version':'1.0','items':[self._summary(row,row['title']) for row in rows[:limit]],'next_cursor':next_cursor}

    def _replace(self,context,identity,payload,*,publication=False,legacy=False):
        value=self._request('AssignmentPublication' if legacy else 'AssignmentAuthoringPublication' if publication else 'AssignmentAuthoringSave',payload)
        if not publication and value['definition']['assignment_id']!=identity:raise ValueError('ASSIGNMENT_ID_MISMATCH')
        with self.repo.lock,self.repo.engine.begin() as db:
            current=self._current(db,context,author=True);head=self._head(db,identity,lock=True)
            if not is_author(current,head):raise AuthError('FORBIDDEN')
            base=head['revision'] if legacy else value['base_revision']
            if base!=head['revision']:raise RevisionConflict(head['revision'])
            if head['revision']>=MAX_REVISION:raise ValueError('REVISION_LIMIT_REACHED')
            revision=head['revision']+1;now=self.clock()
            definition=self._definition(db,identity,head['revision']) if publication else value['definition']
            published_revision=(revision if value['published'] else None) if publication else head['published_revision']
            table=self.repo.assignment_documents
            matched=db.execute(update(table).where(table.c.assignment_id==identity,table.c.revision==base).values(revision=revision,published_revision=published_revision,updated_at=now).returning(table.c.revision)).first()
            if matched is None:raise RevisionConflict(self._head(db,identity)['revision'])
            db.execute(insert(self.repo.assignment_revisions).values(assignment_id=identity,revision=revision,definition=definition,saved_by=current.principal_id,saved_at=now))
            if publication:
                db.execute(update(self.repo.assignment_access).where(self.repo.assignment_access.c.assignment_id==identity).values(published=value['published'],feedback_policy=value.get('feedback_policy',head['feedback_policy'])))
                if value['published']:db.execute(update(self.repo.assignments).where(self.repo.assignments.c.assignment_id==identity).values(payload=definition))
            action='PUBLICATION' if publication else 'UPDATED'
            self._audit(db,current,'ASSIGNMENT_'+action,identity);self._admin_audit(db,current,head,action)
            return self._document(db,self._head(db,identity))

    def save(self,context,identity,payload):return self._replace(context,identity,payload)
    def publish(self,context,identity,payload):return self._replace(context,identity,payload,publication=True)
    def legacy_publish(self,context,identity,payload):
        self._replace(context,identity,payload,publication=True,legacy=True)
        return self.legacy_view(context,identity)

    def legacy_view(self,context,identity):
        with self.repo.lock,self.repo.engine.begin() as db:
            current=self._current(db,context);head=self._head(db,identity)
            if not can_read(current,head):raise AuthError('FORBIDDEN')
            version=head['revision'] if is_author(current,head) else head['published_revision']
            self._admin_audit(db,current,head,'READ')
            return legacy_assignment_view(current,head,self._definition(db,identity,version))

    def legacy_list(self,context):
        with self.repo.lock,self.repo.engine.begin() as db:
            current=self._current(db,context);result=[]
            for identity in db.execute(select(self.repo.assignment_documents.c.assignment_id).order_by(self.repo.assignment_documents.c.assignment_id)).scalars():
                head=self._head(db,identity)
                if not can_read(current,head):continue
                version=head['revision'] if is_author(current,head) else head['published_revision']
                self._admin_audit(db,current,head,'READ')
                result.append(legacy_assignment_view(current,head,self._definition(db,identity,version)))
            return result

    def _principal(self,db,owner):
        user=db.execute(select(self.repo.auth_users).where(self.repo.auth_users.c.principal_id==owner)).mappings().first()
        if user and not user['active']:raise AuthError('FORBIDDEN')
        return SessionContext('',owner,owner,user['role'] if user else 'STUDENT',bool(user),'',0)

    def resolve_snapshot(self,owner,identity):
        with self.repo.lock,self.repo.engine.connect() as db:
            current=self._principal(db,owner);head=self._head(db,identity)
            if not can_read(current,head):raise AuthError('FORBIDDEN')
            revision=head['revision'] if is_author(current,head) else head['published_revision']
            return {'definition':self._definition(db,identity,revision),'revision':revision}

    def authorize_snapshot(self,db,current,identity,expected_revision,definition):
        head=self._head(db,identity,lock=True)
        if not can_read(current,head):raise AuthError('FORBIDDEN')
        selected=head['revision'] if is_author(current,head) else head['published_revision']
        if selected!=expected_revision or self._definition(db,identity,selected)!=definition:raise ValueError('ASSIGNMENT_CHANGED')
        self._admin_audit(db,current,head,'EXECUTION')
        return {'assignment_id':identity,'revision':selected}
