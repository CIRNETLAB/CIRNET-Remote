"""Owner-scoped relational document persistence with database compare-and-swap."""
import base64
from copy import deepcopy
import json
import time
import uuid
from sqlalchemy import insert, literal, select, update
from contracts.registry import load_schema

MAX_REVISION=load_schema('https://netcircuit.local/contracts/public/projects/1.0/schema.json#/$defs/CircuitSave/properties/base_revision')['maximum']

class RevisionConflict(ValueError):
    code='REVISION_CONFLICT'
    def __init__(self,current_revision):
        super().__init__(self.code); self.current_revision=current_revision

class ProjectRepository:
    def __init__(self,repository,*,clock=None,authorize_session=None):
        self.repo=repository; self.clock=clock or time.time
        self.authorize_session=authorize_session

    def _authorize(self,db,owner,auth_session_id):
        if auth_session_id is not None:
            if self.authorize_session is None: raise ValueError('SESSION_EXPIRED')
            self.authorize_session(db,auth_session_id,owner)

    def _audit(self,db,owner,action,identity):
        db.execute(insert(self.repo.audit).values(occurred_at=self.clock(),actor_id=owner,action=action,subject_id=identity))

    def _revision_failure(self,current,base):
        if current==base and current>=MAX_REVISION: raise ValueError('REVISION_LIMIT_REACHED')
        raise RevisionConflict(current)

    def _owned(self,db,table,key,identity,owner,*,lock=False):
        query=select(table).where(key==identity)
        if lock: query=query.with_for_update()
        row=db.execute(query).mappings().first()
        if row is None or row['deleted']: raise KeyError('DOCUMENT_NOT_FOUND' if table is self.repo.circuit_documents else 'PROJECT_NOT_FOUND')
        if row['owner_id']!=owner: raise PermissionError('FORBIDDEN')
        return row

    def _project(self,db,project_id,owner,*,lock=False): return self._owned(db,self.repo.projects,self.repo.projects.c.project_id,project_id,owner,lock=lock)

    def _circuit(self,db,document_id,owner):
        row=self._owned(db,self.repo.circuit_documents,self.repo.circuit_documents.c.document_id,document_id,owner)
        self._project(db,row['project_id'],owner)
        return row

    def _project_view(self,row):
        return {'schema_version':'1.0',**{key:row[key] for key in ('project_id','owner_id','name','description','revision','created_at','updated_at')},'access_scope':'private'}

    def _summary(self,row):
        return {'schema_version':'1.0',**{key:row[key] for key in ('document_id','project_id','owner_id','name','graph_schema_version','revision','created_at','updated_at')}}

    def _document(self,db,row,revision=None):
        table=self.repo.circuit_revisions; version=row['revision'] if revision is None else revision
        snapshot=db.execute(select(table).where(table.c.document_id==row['document_id'],table.c.revision==version)).mappings().first()
        if snapshot is None: raise KeyError('REVISION_NOT_FOUND')
        return {**self._summary(row),'revision':snapshot['revision'],'name':snapshot['name'],'graph_schema_version':snapshot['graph_schema_version'],'updated_at':snapshot['saved_at'],'graph':deepcopy(snapshot['graph'])}

    def _cursor(self,cursor,kind,scope):
        if cursor is None: return 0
        try:
            if not isinstance(cursor,str) or len(cursor)>256: raise ValueError()
            value=json.loads(base64.b64decode(cursor+'='*((-len(cursor))%4),altchars=b'-_',validate=True))
            if not isinstance(value,dict) or set(value)!={'version','kind','scope','after'} or value['version']!=1 or value['kind']!=kind or value['scope']!=scope or type(value['after']) is not int or not 0<=value['after']<=9007199254740991: raise ValueError()
            return value['after']
        except (ValueError,TypeError,UnicodeError): raise ValueError('INVALID_CURSOR') from None

    def _next_cursor(self,sequence,kind,scope):
        raw=json.dumps({'version':1,'kind':kind,'scope':scope,'after':sequence},separators=(',',':')).encode()
        return base64.urlsafe_b64encode(raw).decode().rstrip('=')

    def _list(self,db,table,owner,limit,cursor,kind,scope=''):
        if type(limit) is not int or not 1<=limit<=100: raise ValueError('INVALID_PAGE_LIMIT')
        after=self._cursor(cursor,kind,scope)
        query=select(table).where(table.c.owner_id==owner,table.c.deleted==False,table.c.sequence>after)
        if scope: query=query.where(table.c.project_id==scope)
        rows=list(db.execute(query.order_by(table.c.sequence).limit(limit+1)).mappings())
        next_cursor=self._next_cursor(rows[limit-1]['sequence'],kind,scope) if len(rows)>limit else None
        return rows[:limit],next_cursor

    def list_projects(self,owner,*,limit=50,cursor=None):
        with self.repo.lock,self.repo.engine.connect() as db:
            rows,next_cursor=self._list(db,self.repo.projects,owner,limit,cursor,'projects')
            return {'schema_version':'1.0','items':[self._project_view(row) for row in rows],'next_cursor':next_cursor}

    def get_project(self,owner,project_id):
        with self.repo.lock,self.repo.engine.connect() as db: return self._project_view(self._project(db,project_id,owner))

    def create_project_record(self,owner,payload,*,auth_session_id=None):
        now=self.clock(); identity=uuid.uuid4().hex; table=self.repo.projects
        row={'project_id':identity,'owner_id':owner,'name':payload['name'],'description':payload.get('description',''),'created_at':now,'updated_at':now,'revision':1,'deleted':False}
        with self.repo.lock,self.repo.engine.begin() as db:
            self._authorize(db,owner,auth_session_id)
            db.execute(insert(table).values(**row)); self._audit(db,owner,'PROJECT_CREATED',identity)
        return self._project_view(row)

    def update_project_record(self,owner,project_id,payload,*,auth_session_id=None):
        table=self.repo.projects
        with self.repo.lock,self.repo.engine.begin() as db:
            self._authorize(db,owner,auth_session_id)
            self._project(db,project_id,owner)
            values={key:payload[key] for key in ('name','description') if key in payload}
            result=db.execute(update(table).where(table.c.project_id==project_id,table.c.owner_id==owner,table.c.deleted==False,table.c.revision==payload['base_revision'],table.c.revision<MAX_REVISION).values(**values,revision=table.c.revision+1,updated_at=self.clock()).returning(table)).mappings().first()
            if result is None: self._revision_failure(self._project(db,project_id,owner)['revision'],payload['base_revision'])
            self._audit(db,owner,'PROJECT_UPDATED',project_id)
            return self._project_view(result)

    def delete_project_record(self,owner,project_id,base_revision,*,auth_session_id=None):
        table=self.repo.projects; documents=self.repo.circuit_documents
        with self.repo.lock,self.repo.engine.begin() as db:
            self._authorize(db,owner,auth_session_id)
            self._project(db,project_id,owner); now=self.clock()
            row=db.execute(update(table).where(table.c.project_id==project_id,table.c.owner_id==owner,table.c.deleted==False,table.c.revision==base_revision,table.c.revision<MAX_REVISION).values(deleted=True,revision=table.c.revision+1,updated_at=now).returning(table.c.revision)).first()
            if row is None: self._revision_failure(self._project(db,project_id,owner)['revision'],base_revision)
            db.execute(update(documents).where(documents.c.project_id==project_id,documents.c.deleted==False,documents.c.revision<MAX_REVISION).values(deleted=True,revision=documents.c.revision+1,updated_at=now))
            if db.execute(select(documents.c.document_id).where(documents.c.project_id==project_id,documents.c.deleted==False)).first():
                raise ValueError('REVISION_LIMIT_REACHED')
            self._audit(db,owner,'PROJECT_DELETED',project_id)
            return {'schema_version':'1.0','project_id':project_id,'deleted':True,'revision':row[0]}

    def list_circuits(self,owner,project_id,*,limit=50,cursor=None):
        with self.repo.lock,self.repo.engine.connect() as db:
            self._project(db,project_id,owner)
            rows,next_cursor=self._list(db,self.repo.circuit_documents,owner,limit,cursor,'circuits',project_id)
            return {'schema_version':'1.0','items':[self._summary(row) for row in rows],'next_cursor':next_cursor}

    def get_circuit(self,owner,document_id,*,revision=None):
        with self.repo.lock,self.repo.engine.connect() as db: return self._document(db,self._circuit(db,document_id,owner),revision)

    def _insert_revision(self,db,owner,row,graph):
        db.execute(insert(self.repo.circuit_revisions).values(document_id=row['document_id'],revision=row['revision'],name=row['name'],graph_schema_version=graph['schema_version'],graph=deepcopy(graph),saved_by=owner,saved_at=row['updated_at']))

    def create_circuit_record(self,owner,project_id,payload,*,auth_session_id=None):
        now=self.clock(); identity=uuid.uuid4().hex
        row={'document_id':identity,'project_id':project_id,'owner_id':owner,'name':payload['name'],'graph_schema_version':payload['graph']['schema_version'],'created_at':now,'updated_at':now,'revision':1,'deleted':False}
        with self.repo.lock,self.repo.engine.begin() as db:
            self._authorize(db,owner,auth_session_id)
            self._project(db,project_id,owner,lock=True)
            # PostgreSQL serializes parent deletion through FOR UPDATE. SQLite
            # instead obtains its writer lock for this conditional statement,
            # reading parent liveness at the same point as the insertion.
            table=self.repo.circuit_documents; parent=self.repo.projects
            statement=insert(table).from_select(list(row),select(*(literal(value,type_=table.c[key].type) for key,value in row.items())).select_from(parent).where(parent.c.project_id==project_id,parent.c.owner_id==owner,parent.c.deleted==False))
            if db.execute(statement.returning(table.c.document_id)).scalar_one_or_none() is None:
                self._project(db,project_id,owner)
                raise ValueError('RESOURCE_CONFLICT')
            self._insert_revision(db,owner,row,payload['graph'])
            self._audit(db,owner,'CIRCUIT_CREATED',identity)
            return self._document(db,row)

    def save_circuit_record(self,owner,document_id,payload,*,auth_session_id=None):
        table=self.repo.circuit_documents
        with self.repo.lock,self.repo.engine.begin() as db:
            self._authorize(db,owner,auth_session_id)
            self._circuit(db,document_id,owner)
            row=db.execute(update(table).where(table.c.document_id==document_id,table.c.owner_id==owner,table.c.deleted==False,table.c.revision==payload['base_revision'],table.c.revision<MAX_REVISION).values(name=payload['name'],graph_schema_version=payload['graph']['schema_version'],revision=table.c.revision+1,updated_at=self.clock()).returning(table)).mappings().first()
            if row is None: self._revision_failure(self._circuit(db,document_id,owner)['revision'],payload['base_revision'])
            self._insert_revision(db,owner,row,payload['graph']); self._audit(db,owner,'CIRCUIT_SAVED',document_id)
            return self._document(db,row)

    def delete_circuit_record(self,owner,document_id,base_revision,*,auth_session_id=None):
        table=self.repo.circuit_documents
        with self.repo.lock,self.repo.engine.begin() as db:
            self._authorize(db,owner,auth_session_id)
            self._circuit(db,document_id,owner)
            row=db.execute(update(table).where(table.c.document_id==document_id,table.c.owner_id==owner,table.c.deleted==False,table.c.revision==base_revision,table.c.revision<MAX_REVISION).values(deleted=True,revision=table.c.revision+1,updated_at=self.clock()).returning(table.c.revision)).first()
            if row is None: self._revision_failure(self._circuit(db,document_id,owner)['revision'],base_revision)
            self._audit(db,owner,'CIRCUIT_DELETED',document_id)
            return {'schema_version':'1.0','document_id':document_id,'deleted':True,'revision':row[0]}
