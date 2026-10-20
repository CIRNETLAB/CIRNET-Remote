"""Explicit real-PostgreSQL gate; never silently skip an unavailable database.

Run this file explicitly with NETCIRCUIT_TEST_POSTGRES_URL configured. Every
case owns fresh, strictly named schemas and never changes existing app tables.
"""
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import re
import shutil
import subprocess
from threading import Barrier,Event
import time
import uuid

import pytest
from sqlalchemy import create_engine,insert,select,text,update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateSchema,DropSchema

from app.config import Settings
from app.migrations import HEAD,migrate
from app.migrations import schema_v0002 as legacy
from app.services.auth import AuthService
from app.services.persistence import Repository
from app.services.projects import ProjectService,RevisionConflict

PREFIX='netcircuit_test_w34_'
ROOT=Path(__file__).resolve().parents[3]


class IsolatedPostgres:
    def __init__(self,url):
        self.url=url; self.admin=create_engine(url,hide_parameters=True)
        self.schemas=[]; self.resources=[]

    def new_schema(self,*,create=True):
        name=PREFIX+uuid.uuid4().hex
        assert re.fullmatch(PREFIX+r'[0-9a-f]{32}',name)
        self.schemas.append(name)
        if create:
            with self.admin.begin() as db: db.execute(CreateSchema(name))
        query=dict(self.url.query)
        query['options']=f'-csearch_path={name} -clock_timeout=5000 -cstatement_timeout=20000'
        return name,self.url.set(query=query).render_as_string(hide_password=False)

    def engine(self,url):
        engine=create_engine(url,hide_parameters=True); self.resources.append(engine)
        return engine

    def repository(self,url):
        repository=Repository(url); self.resources.append(repository.engine)
        return repository

    def clean(self):
        for engine in reversed(self.resources): engine.dispose()
        try:
            with self.admin.begin() as db:
                for name in reversed(self.schemas):
                    if not re.fullmatch(PREFIX+r'[0-9a-f]{32}',name):
                        raise AssertionError('Refusing cleanup outside the dedicated test-schema prefix.')
                    db.execute(DropSchema(name,cascade=True,if_exists=True))
        finally: self.admin.dispose()

    def command_environment(self):
        # Keep credentials out of command arguments, traces, and test output.
        environment=dict(os.environ)
        environment.update(PGHOST=self.url.host or '127.0.0.1',PGPORT=str(self.url.port or 5432),
                           PGDATABASE=self.url.database or 'postgres',PGUSER=self.url.username or '',
                           PGPASSWORD=self.url.password or '',PGCONNECT_TIMEOUT='5',PGOPTIONS='')
        return environment


@pytest.fixture
def pg():
    raw=os.getenv('NETCIRCUIT_TEST_POSTGRES_URL')
    if not raw:
        pytest.fail('NETCIRCUIT_TEST_POSTGRES_URL is required for the explicit PostgreSQL gate.',pytrace=False)
    try:
        url=make_url(raw)
        if url.get_backend_name()!='postgresql' or not url.database: raise ValueError()
        if url.drivername=='postgresql': url=url.set(drivername='postgresql+psycopg')
    except Exception:
        pytest.fail('The PostgreSQL gate requires a valid PostgreSQL database URL.',pytrace=False)
    isolated=IsolatedPostgres(url)
    try:
        with isolated.admin.connect() as db:
            assert db.execute(text('SELECT 1')).scalar()==1
        yield isolated
    finally: isolated.clean()


def graph():
    return {'schema_version':'1.1','circuit_id':'embedded-original-id',
            'modules':[{'id':'M','type':'MEMORY','position':{'x':10**400,'y':1.25,'z':0},
                        'properties':{'memory':{'version':'1.0','word_bits':8,'depth':2,'data':[0,255]}},
                        'future_extension':{'keep':[None,True,1,2.5]}}],
            'connections':[],'metadata':{'foreign':{'preserve':['original',None]}}}


def initialized(pg):
    schema,url=pg.new_schema(); repository=pg.repository(url)
    auth=AuthService(repository,Settings()); context,cookie=auth.ensure_session(None)
    projects=ProjectService(repository,authorize_session=auth.require_principal_session)
    return schema,url,repository,auth,context,projects


def tool(name):
    directory=Path(os.getenv('NETCIRCUIT_TEST_PG_BIN',str(ROOT/'.runtime/postgresql/pgsql/bin')))
    bundled=directory/(name+('.exe' if os.name=='nt' else ''))
    executable=str(bundled) if bundled.is_file() else shutil.which(name)
    if not executable: pytest.fail(f'{name} is required for the real PostgreSQL backup rehearsal.',pytrace=False)
    return executable


def run_database_tool(pg,name,arguments):
    result=subprocess.run([tool(name),*arguments],env=pg.command_environment(),capture_output=True,timeout=30)
    # Do not print connection diagnostics or archive contents containing data.
    assert result.returncode==0,f'{name} failed; inspect the isolated local server privately.'


def backend_pid(db):
    return db.connection.driver_connection.info.backend_pid


def assert_blocked_by(pg,blocked,blocker):
    """Observe the actual PostgreSQL lock dependency, without timing guesses."""
    deadline=time.monotonic()+3
    with pg.admin.connect() as db:
        while time.monotonic()<deadline:
            if blocker in db.execute(text('SELECT pg_blocking_pids(:pid)'),{'pid':blocked}).scalar_one():
                return
            time.sleep(0.01)
    pytest.fail('The competing writer never waited on the owning transaction lock.')


def test_postgresql_legacy_upgrade_and_real_backup_restore_rehearsal(pg,tmp_path):
    source_name,source_url=pg.new_schema(); engine=pg.engine(source_url)
    experiment={'experiment_id':'legacy-e','state':'FAULT','capture':{'payload_ref':'retained-capture-reference'},'private_keep':{'data':[None,1]}}
    assignment={'schema_version':'1.0','assignment_id':'legacy-a','title':'Legacy assignment','lab_endpoints':[],'assessment_policy':'FUNCTIONAL_ONLY'}
    operation={'schema_version':'1.0','operation_key':'legacy-key','kind':'create','status':'APPLIED','experiment_id':'legacy-e','error_code':None,'revision':1}
    with engine.begin() as db:
        for table in legacy.LEGACY: table.create(db)
        db.execute(insert(legacy.assignments).values(assignment_id='legacy-a',payload=assignment))
        db.execute(insert(legacy.experiments).values(experiment_id='legacy-e',owner_id='legacy-owner',payload=experiment))
        db.execute(insert(legacy.sessions).values(session_id='legacy-owner',expires_at=9999999999))
        db.execute(insert(legacy.operations).values(owner_id='legacy-owner',kind='create',scope='',operation_key='legacy-key',fingerprint='retained-fingerprint',payload=operation))
        db.execute(insert(legacy.leases).values(station_id='station',slot=0,experiment_id='legacy-e',expires_at=0,quarantined=True))
    migrate(engine,'0001_legacy')
    with engine.connect() as db: assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()=='0001_legacy'

    backup=tmp_path/'legacy-schema.sql'
    run_database_tool(pg,'pg_dump',['--schema='+source_name,'--no-owner','--no-privileges','--file='+str(backup)])
    restored_name,restored_url=pg.new_schema(create=False)
    restored_sql=tmp_path/'restore-isolated-schema.sql'
    restored_sql.write_bytes(backup.read_bytes().replace(source_name.encode(),restored_name.encode()))
    run_database_tool(pg,'psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--file='+str(restored_sql)])

    migrate(engine,'0002_auth')
    with engine.begin() as db:
        assert db.execute(select(legacy.principals.c.principal_id).where(legacy.principals.c.principal_id=='legacy-owner')).scalar()=='legacy-owner'
        assert db.execute(select(legacy.assignment_access.c.published)).scalar() is False
        db.execute(insert(legacy.principals).values(principal_id='w3-user',kind='USER',created_at=123))
        db.execute(insert(legacy.users).values(principal_id='w3-user',username='retained-user',username_key='retained-user',display_name='Retained user',password_hash='opaque-existing-password-digest',role='INSTRUCTOR',active=True,auth_revision=4))
        db.execute(insert(legacy.auth_sessions).values(session_id='retained-auth-session',token_hash='opaque-existing-token-digest',principal_id='w3-user',csrf_token='retained-csrf',expires_at=9999999999,revoked=False,auth_revision=4,claimable_guest_id=None))
    migrate(engine,'0003_projects')
    source=pg.repository(source_url); restored=pg.repository(restored_url)
    for repository in (source,restored):
        assert repository.get_experiment('legacy-e')==experiment
        assert repository.owner('legacy-e')=='legacy-owner'
        assert repository.get_assignment('legacy-a')==assignment
        assert repository.operation('legacy-owner','create','legacy-key')=={**operation,'_fingerprint':'retained-fingerprint'}
        assert repository.leases()[0]['quarantined'] is True
        with repository.engine.connect() as db:
            assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
            assert db.execute(select(repository.experiments.c.sequence)).scalar()==1
    with source.engine.connect() as db:
        user=db.execute(select(source.auth_users)).mappings().one()
        assert user['auth_revision']==4 and user['role']=='INSTRUCTOR'
        session=db.execute(select(source.auth_sessions)).mappings().one()
        assert session['token_hash']=='opaque-existing-token-digest' and session['auth_revision']==4
    with restored.engine.connect() as db:
        assert db.execute(select(restored.auth_users)).first() is None


def test_postgresql_independent_compare_and_swap_retains_one_winner_and_history(pg):
    _,url,repo,auth,context,projects=initialized(pg)
    project=projects.create_project(context.owner_id,{'name':'CAS project'},auth_session_id=context.session_id)
    document=projects.create_circuit(context.owner_id,project['project_id'],{'name':'Original','graph':graph()},auth_session_id=context.session_id)
    other=ProjectService(pg.repository(url)); barrier=Barrier(2)
    def save(pair):
        service,label=pair; candidate=graph(); candidate['metadata']['writer']=label
        barrier.wait(timeout=5)
        try: return service.save_circuit(context.owner_id,document['document_id'],{'base_revision':1,'name':label,'graph':candidate})
        except RevisionConflict as error: return error
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(save,[(projects,'first'),(other,'second')]))
    accepted=[item for item in results if isinstance(item,dict)]; rejected=[item for item in results if isinstance(item,RevisionConflict)]
    assert len(accepted)==len(rejected)==1 and rejected[0].current_revision==2
    assert projects.get_circuit(context.owner_id,document['document_id'])==accepted[0]
    assert projects.resolve_snapshot(context.owner_id,document['document_id'],1)['graph']==graph()
    assert type(projects.resolve_snapshot(context.owner_id,document['document_id'],1)['graph']['modules'][0]['position']['x']) is int


@pytest.mark.parametrize('pending_kind',['project','experiment'])
def test_postgresql_session_fence_orders_real_guest_claim_after_pending_commit(pg,monkeypatch,pending_kind):
    _,url,repo,auth,context,projects=initialized(pg)
    auth.bootstrap_admin('teacher','sufficiently long password')
    other_auth=AuthService(pg.repository(url),Settings())
    project=projects.create_project(context.owner_id,{'name':'Guest project'},auth_session_id=context.session_id)
    document=projects.create_circuit(context.owner_id,project['project_id'],{'name':'Guest document','graph':graph()},auth_session_id=context.session_id)
    authorized=Event(); release=Event(); claim_started=Event(); claim_finished=Event(); backends={}
    def delayed(db,session_id,owner):
        auth.require_principal_session(db,session_id,owner)
        backends['writer']=backend_pid(db); authorized.set(); assert release.wait(10)
    monkeypatch.setattr(projects,'authorize_session',delayed)
    original_consume=other_auth._consume_session
    def watched_consume(db,current):
        backends['claim']=backend_pid(db); claim_started.set()
        return original_consume(db,current)
    monkeypatch.setattr(other_auth,'_consume_session',watched_consume)
    def claim():
        account,_=other_auth.login(context,'teacher','sufficiently long password')
        claimed,_=other_auth.claim_guest(account,True); claim_finished.set(); return claimed
    def pending_write():
        if pending_kind=='project':
            return projects.create_project(context.owner_id,{'name':'Pending project'},auth_session_id=context.session_id)
        return repo.create_experiment(context.owner_id,{
            'experiment_id':'pending-experiment','state':'CREATED',
            '_document_reference':{'document_id':document['document_id'],'revision':1},
            '_operation':{'key':'pending-create','fingerprint':'verified-fingerprint'}},
            auth_session_id=context.session_id,authorize_session=delayed)
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending=pool.submit(pending_write)
        assert authorized.wait(2); transfer=pool.submit(claim)
        try:
            assert claim_started.wait(5)
            assert_blocked_by(pg,backends['claim'],backends['writer'])
            assert not claim_finished.is_set()
        finally: release.set()
        pending.result(timeout=5); claimed=transfer.result(timeout=5)
    assert projects.list_projects(context.owner_id)['items']==[]
    names={'Guest project','Pending project'} if pending_kind=='project' else {'Guest project'}
    assert {item['name'] for item in projects.list_projects(claimed.owner_id)['items']}==names
    assert projects.get_circuit(claimed.owner_id,document['document_id'])['owner_id']==claimed.owner_id
    if pending_kind=='experiment':
        assert repo.owner('pending-experiment')==claimed.owner_id
        assert repo.operation(claimed.owner_id,'create','pending-create')['status']=='APPLIED'
        with pytest.raises(KeyError): repo.operation(context.owner_id,'create','pending-create')
        with repo.engine.connect() as db:
            reference=db.execute(select(repo.experiment_document_refs)).mappings().one()
            assert reference['document_id']==document['document_id'] and reference['revision']==1
    with repo.engine.connect() as db:
        assert db.execute(select(repo.circuit_revisions.c.saved_by)).scalar()==context.owner_id
        session=db.execute(select(repo.auth_sessions).where(repo.auth_sessions.c.session_id==context.session_id)).mappings().one()
        assert session['expires_at']==context.expires_at and session['auth_revision']==0 and session['revoked'] is True


def test_postgresql_parent_row_lock_serializes_delete_and_child_creation(pg,monkeypatch):
    _,url,repo,auth,context,creator=initialized(pg)
    deleter=ProjectService(pg.repository(url)); project=creator.create_project(context.owner_id,{'name':'Parent lock'})
    locked=Event(); release=Event(); deletion_started=Event(); original=creator._project; backends={}
    def delayed(db,identity,owner,**kwargs):
        row=original(db,identity,owner,**kwargs)
        if kwargs.get('lock'):
            backends['creator']=backend_pid(db); locked.set(); assert release.wait(10)
        return row
    monkeypatch.setattr(creator,'_project',delayed)
    original_authorize=deleter._authorize
    def watched_authorize(db,owner,session_id):
        original_authorize(db,owner,session_id)
        backends['deleter']=backend_pid(db); deletion_started.set()
    monkeypatch.setattr(deleter,'_authorize',watched_authorize)
    def delete():
        return deleter.delete_project(context.owner_id,project['project_id'],1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        creation=pool.submit(creator.create_circuit,context.owner_id,project['project_id'],{'name':'Concurrent child','graph':graph()})
        assert locked.wait(2); deletion=pool.submit(delete)
        try:
            assert deletion_started.wait(2)
            assert_blocked_by(pg,backends['deleter'],backends['creator'])
            assert not deletion.done()
        finally: release.set()
        document=creation.result(timeout=5); deleted=deletion.result(timeout=5)
    assert deleted['deleted'] is True
    with pytest.raises(KeyError): creator.get_circuit(context.owner_id,document['document_id'])
    with repo.engine.connect() as db:
        row=db.execute(select(repo.circuit_documents)).mappings().one()
        assert row['deleted'] is True
        assert db.execute(select(repo.circuit_revisions.c.graph)).scalar()==graph()


def test_postgresql_revision_foreign_keys_and_failed_admission_are_atomic(pg):
    _,url,repo,auth,context,projects=initialized(pg)
    project=projects.create_project(context.owner_id,{'name':'Reference project'})
    document=projects.create_circuit(context.owner_id,project['project_id'],{'name':'Snapshot','graph':graph()})
    reference={'document_id':document['document_id'],'revision':1}
    other=pg.repository(url)
    accepted={'experiment_id':'saved-e','state':'CREATED','_document_reference':reference,
              '_operation':{'key':'saved-create','fingerprint':'verified-fingerprint'}}
    other.create_experiment(context.owner_id,accepted,auth_session_id=context.session_id,
                            authorize_session=auth.require_principal_session)
    assert other.get_experiment('saved-e')==accepted and other.owner('saved-e')==context.owner_id
    assert other.operation(context.owner_id,'create','saved-create')['status']=='APPLIED'
    candidate=graph(); candidate['metadata']['later']=True
    projects.save_circuit(context.owner_id,document['document_id'],{'base_revision':1,'name':'Later edit','graph':candidate})
    assert projects.resolve_snapshot(context.owner_id,document['document_id'],1)['graph']==graph()
    with other.engine.connect() as db:
        assert db.execute(select(other.experiment_document_refs.c.revision)).scalar()==1
    failed={'experiment_id':'bad-revision','state':'CREATED','_document_reference':{**reference,'revision':999},
            '_operation':{'key':'bad-revision-operation','fingerprint':'verified-fingerprint'}}
    with pytest.raises(IntegrityError):
        other.create_experiment(context.owner_id,failed,auth_session_id=context.session_id,
                                authorize_session=auth.require_principal_session)
    with pytest.raises(KeyError): other.get_experiment('bad-revision')
    with pytest.raises(KeyError): other.operation(context.owner_id,'create','bad-revision-operation')
    stranger,_=auth.ensure_session(None)
    with pytest.raises(ValueError,match='DOCUMENT_UNAVAILABLE'):
        other.create_experiment(stranger.owner_id,{'experiment_id':'bad-owner','state':'CREATED','_document_reference':reference},
                                auth_session_id=stranger.session_id,authorize_session=auth.require_principal_session)
    with pytest.raises(KeyError): other.get_experiment('bad-owner')


def test_postgresql_revision_limit_never_overflows_the_public_contract(pg):
    _,url,repo,auth,context,projects=initialized(pg); maximum=9007199254740991
    project=projects.create_project(context.owner_id,{'name':'Revision bound'})
    document=projects.create_circuit(context.owner_id,project['project_id'],{'name':'Snapshot','graph':graph()})
    with repo.engine.begin() as db:
        previous=dict(db.execute(select(repo.circuit_revisions)).mappings().one())
        db.execute(insert(repo.circuit_revisions).values(**{**previous,'revision':maximum}))
        db.execute(update(repo.circuit_documents).where(repo.circuit_documents.c.document_id==document['document_id']).values(revision=maximum))
    for action in (lambda:projects.save_circuit(context.owner_id,document['document_id'],{'base_revision':maximum,'name':'Overflow','graph':graph()}),
                   lambda:projects.delete_circuit(context.owner_id,document['document_id'],maximum),
                   lambda:projects.delete_project(context.owner_id,project['project_id'],1)):
        with pytest.raises(ValueError,match='REVISION_LIMIT_REACHED'): action()
    assert projects.get_project(context.owner_id,project['project_id'])['revision']==1
    assert projects.get_circuit(context.owner_id,document['document_id'])['revision']==maximum


def test_postgresql_w4_backup_restores_and_upgrades_published_and_private_assignment_revisions(pg,tmp_path):
    source_name,source_url=pg.new_schema();engine=pg.engine(source_url);migrate(engine,'0003_projects')
    definitions={name:{'retained-pre-authoring':{'values':[None,True,3]},'title':name} for name in ('published','private')}
    with engine.begin() as db:
        # An unversioned/head-metadata deployment can already have this index.
        # The restored PostgreSQL upgrade must inspect and adopt it safely.
        db.execute(text('CREATE INDEX ix_lab_experiments_owner_sequence ON lab_experiments (owner_id, sequence)'))
        db.execute(insert(legacy.principals).values(principal_id='author',kind='GUEST',created_at=1))
        for name,definition in definitions.items():
            db.execute(insert(legacy.assignments).values(assignment_id=name,payload=definition))
            db.execute(insert(legacy.assignment_access).values(assignment_id=name,owner_id='author',published=name=='published',feedback_policy='observed_only'))
    backup=tmp_path/'w4-schema.sql'
    run_database_tool(pg,'pg_dump',['--schema='+source_name,'--no-owner','--no-privileges','--file='+str(backup)])
    restored_name,restored_url=pg.new_schema(create=False)
    restored=tmp_path/'restore-w4-schema.sql';restored.write_bytes(backup.read_bytes().replace(source_name.encode(),restored_name.encode()))
    run_database_tool(pg,'psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--file='+str(restored)])
    repository=pg.repository(restored_url)
    with repository.engine.connect() as db:
        heads={row['assignment_id']:dict(row) for row in db.execute(select(repository.assignment_documents)).mappings()}
        assert heads['published']['published_revision']==1 and heads['private']['published_revision'] is None
        assert {row['assignment_id']:row['definition'] for row in db.execute(select(repository.assignment_revisions)).mappings()}==definitions
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
    with engine.connect() as db:
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()=='0003_projects'
    for name,definition in definitions.items():assert repository.get_assignment(name)==definition


def assignment_setup(pg):
    from app.services.assignments import AssignmentService
    from test_assignment_documents import definition
    _,url,repo,auth,guest,_=initialized(pg)
    password='a sufficiently long test password'
    auth.bootstrap_admin('teacher',password);teacher,_=auth.login(guest,'teacher',password)
    auth.create_user('student',password,actor=teacher)
    fresh,_=auth.ensure_session(None);student,_=auth.login(fresh,'student',password)
    service=AssignmentService(repo,auth);service.create(teacher,definition())
    service.publish(teacher,'assignment',{'base_revision':1,'published':True})
    return url,repo,auth,service,teacher,student


def test_postgresql_independent_assignment_edit_cas_keeps_published_content_and_revision_pairs(pg):
    from app.services.assignments import AssignmentService
    from test_assignment_documents import definition
    url,repo,auth,service,teacher,student=assignment_setup(pg)
    other_repo=pg.repository(url);other=AssignmentService(other_repo,AuthService(other_repo,Settings()));barrier=Barrier(2)
    def save(pair):
        writer,title=pair;barrier.wait(5)
        try:return writer.save(teacher,'assignment',{'base_revision':2,'definition':definition(title=title)})
        except RevisionConflict as error:return error
    with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(save,[(service,'First'),(other,'Second')]))
    assert sum(isinstance(value,dict) for value in results)==1
    assert [value.current_revision for value in results if isinstance(value,RevisionConflict)]==[3]
    assert service.legacy_view(student,'assignment')['title']=='Original'
    assert service.get_document(teacher,'assignment')['published_revision']==2
    with pytest.raises(IntegrityError):
        with repo.engine.begin() as db:
            db.execute(update(repo.assignment_documents).values(published_revision=999))
    assert service.get_document(teacher,'assignment')['published_revision']==2


@pytest.mark.parametrize('publish_again',[False,True])
def test_postgresql_snapshot_authority_locks_publication_until_admission_finishes(pg,monkeypatch,publish_again):
    from app.services.assignments import AssignmentService
    url,repo,auth,service,teacher,student=assignment_setup(pg)
    other_repo=pg.repository(url);other=AssignmentService(other_repo,AuthService(other_repo,Settings()))
    snapshot=service.resolve_snapshot(student.owner_id,'assignment')
    locked=Event();release=Event();publication_started=Event();backends={};original=other._current
    def watched(db,context,**kwargs):
        result=original(db,context,**kwargs);backends['publisher']=backend_pid(db);publication_started.set();return result
    monkeypatch.setattr(other,'_current',watched)
    def authorize(db,current,identity,revision,definition):
        reference=service.authorize_snapshot(db,current,identity,revision,definition)
        backends['admission']=backend_pid(db);locked.set();assert release.wait(10)
        return reference
    record={'experiment_id':'published-before-private','state':'CREATED','_assignment_snapshot':snapshot['definition'],
            '_assignment_reference':{'assignment_id':'assignment','revision':snapshot['revision']},
            '_operation':{'key':'published-before-private','fingerprint':'verified-fingerprint'}}
    def admit():
        repo.create_experiment(student.owner_id,record,auth_session_id=student.session_id,
            authorize_session=auth.require_principal_session,authorize_assignment=authorize)
    with ThreadPoolExecutor(max_workers=2) as pool:
        admission=pool.submit(admit);assert locked.wait(2)
        publication=pool.submit(other.publish,teacher,'assignment',{'base_revision':2,'published':publish_again})
        try:
            assert publication_started.wait(2)
            assert_blocked_by(pg,backends['publisher'],backends['admission'])
        finally:release.set()
        admission.result(5);publication.result(5)
    assert repo.get_experiment('published-before-private')['_assignment_reference']=={'assignment_id':'assignment','revision':2}
    assert repo.operation(student.owner_id,'create','published-before-private')['status']=='APPLIED'
    rejected={**record,'experiment_id':'rejected-after-publication',
              '_operation':{'key':'rejected-after-publication','fingerprint':'verified-fingerprint'}}
    with pytest.raises(ValueError,match='ASSIGNMENT_CHANGED' if publish_again else 'FORBIDDEN'):
        repo.create_experiment(student.owner_id,rejected,auth_session_id=student.session_id,
            authorize_session=auth.require_principal_session,authorize_assignment=service.authorize_snapshot)
    with pytest.raises(KeyError):repo.get_experiment('rejected-after-publication')
    with pytest.raises(KeyError):repo.operation(student.owner_id,'create','rejected-after-publication')


def test_postgresql_w6_backup_upgrade_indexes_only_sealed_captures(pg,tmp_path):
    from test_capture_catalog import metadata,experiment
    source_name,source_url=pg.new_schema();engine=pg.engine(source_url);migrate(engine,'0004_assignments')
    sealed=experiment('sealed',metadata());inline=experiment('inline',{'capture_id':'inline','available':True,'samples':[{'signal':'x','time_ns':0,'value':1}]})
    with engine.begin() as db:
        for value in (sealed,inline):db.execute(insert(legacy.experiments).values(experiment_id=value['experiment_id'],owner_id='historical-owner',payload=value))
        db.execute(insert(legacy.leases).values(station_id='station',slot=0,experiment_id='sealed',expires_at=1,quarantined=True))
    payload=tmp_path/'retained.ncap';payload.write_bytes(b'filesystem-payload-preserved')
    backup=tmp_path/'w6-schema.sql'
    run_database_tool(pg,'pg_dump',['--schema='+source_name,'--no-owner','--no-privileges','--file='+str(backup)])
    restored_name,restored_url=pg.new_schema(create=False)
    restored=tmp_path/'restore-w6-schema.sql';restored.write_bytes(backup.read_bytes().replace(source_name.encode(),restored_name.encode()))
    run_database_tool(pg,'psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--file='+str(restored)])
    repo=pg.repository(restored_url)
    assert repo.capture_reference('cap-one','historical-owner')['metadata']==metadata()
    assert repo.get_experiment('sealed')==sealed and repo.get_experiment('inline')==inline
    assert payload.read_bytes()==b'filesystem-payload-preserved' and repo.leases()[0]['quarantined'] is True
    with repo.engine.connect() as db:
        assert db.execute(select(repo.captures.c.capture_id)).scalars().all()==['cap-one']
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
    with engine.connect() as db:assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()=='0004_assignments'


def test_postgresql_capture_retirement_session_fence_linearizes_guest_claim(pg,monkeypatch):
    from test_capture_catalog import metadata,experiment
    from app.services.auth import AuthError
    _,url,repo,auth,guest,_=initialized(pg)
    password='capture regression '+uuid.uuid4().hex
    auth.bootstrap_admin('capture-admin',password)
    repo.create_experiment(guest.owner_id,experiment());repo.save_experiment(experiment(capture=metadata()))
    other_repo=pg.repository(url);other=AuthService(other_repo,Settings())
    locked=Event();release=Event();consuming=Event();backends={}
    original=other._consume_session
    def consume(db,context):
        backends['claim']=backend_pid(db);consuming.set();return original(db,context)
    monkeypatch.setattr(other,'_consume_session',consume)
    def authorize(db,session_id,owner):
        context=auth.require_principal_session(db,session_id,owner)
        backends['retirement']=backend_pid(db);locked.set();assert release.wait(10)
        return context
    def retire():return repo.retire_capture('cap-one',guest.owner_id,auth_session_id=guest.session_id,authorize_session=authorize)
    def claim():
        logged,_=other.login(guest,'capture-admin',password)
        return other.claim_guest(logged,True)[0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        retirement=pool.submit(retire);assert locked.wait(2)
        claiming=pool.submit(claim)
        try:
            assert consuming.wait(5)
            assert_blocked_by(pg,backends['claim'],backends['retirement'])
        finally:release.set()
        assert retirement.result(5)['changed'] is True
        claimed=claiming.result(5)
    reference=repo.capture_reference('cap-one',claimed.owner_id)
    assert reference['metadata']['available'] is False and reference['cleanup_pending'] is True
    with pytest.raises(PermissionError):repo.capture_reference('cap-one',guest.owner_id)
    with pytest.raises(AuthError,match='SESSION_EXPIRED'):
        repo.retire_capture('cap-one',guest.owner_id,auth_session_id=guest.session_id,authorize_session=auth.require_principal_session)
    with repo.engine.connect() as db:assert db.execute(select(repo.audit.c.action).where(repo.audit.c.subject_id=='cap-one')).scalars().all()==['CAPTURE_DELETED']


def test_postgresql_terminal_save_fences_an_independent_reservation_and_old_generation_delete(pg):
    from sqlalchemy import event
    from test_capture_catalog import metadata,experiment
    _,url,repo,auth,guest,_=initialized(pg);other=pg.repository(url)
    repo.create_experiment(guest.owner_id,experiment(state='CREATED'))
    current=experiment(capture=metadata(),state='CREATED');repo.save_experiment(current)
    started=Event();backends={}
    @event.listens_for(other.engine,'before_cursor_execute')
    def observed(connection,cursor,statement,parameters,context,many):
        if statement.startswith('UPDATE lab_experiments'):
            backends['reserve']=backend_pid(connection);started.set()
    with ThreadPoolExecutor(max_workers=1) as pool:
        with repo.engine.begin() as db:
            current={**current,'state':'COMPLETE'}
            db.execute(update(repo.experiments).where(repo.experiments.c.experiment_id=='e1').values(payload=current))
            pending=pool.submit(other.reserve,'station',0,'e1',100)
            assert started.wait(2)
            assert_blocked_by(pg,backends['reserve'],backend_pid(db))
        assert pending.result(5) is False
    current['capture']=metadata('cap-two');repo.save_experiment(current)
    assert other.retire_capture('cap-one',guest.owner_id)['changed'] is True
    assert repo.get_experiment('e1')==current and repo.capture_reference('cap-two')['metadata']['available'] is True
    assert repo.leases()==[]


@pytest.mark.parametrize('safe',[True,False])
def test_postgresql_restart_recovery_commits_lease_state_and_audit_atomically_after_retry(pg,safe):
    from sqlalchemy import event
    from sqlalchemy.sql.dml import Insert
    from app.services.experiments import ExperimentManager
    _,_,repo,_,owner,_=initialized(pg)
    identity='recover-after-restart'
    baseline={'experiment_id':identity,'state':'RUNNING','state_history':['CREATED','RUNNING'],
        'revision':2,'station_id':'p1','mode':'hardware','capture':None,'lease_expires_at':100}
    repo.create_experiment(owner.owner_id,baseline)
    assert repo.reserve('p1',0,identity,100)
    leases=repo.leases()
    class RecoveryGateway:
        def __init__(self):self.calls=[]
        def call(self,station,eid,method,**kwargs):
            self.calls.append(method)
            assert station=='p1' and eid==identity and method=='stop_execution'
            return {'accepted':safe,'hardware_applied':safe}
    gateway=RecoveryGateway()
    def refuse_audit(connection,clauseelement,*args):
        if isinstance(clauseelement,Insert) and clauseelement.table.name==repo.audit.name:
            raise RuntimeError('fixture recovery audit failure')
    event.listen(repo.engine,'before_execute',refuse_audit)
    try:
        with pytest.raises(RuntimeError,match='recovery audit failure'):
            ExperimentManager(repo,gateway,submit=lambda *_:pytest.fail('Recovery cannot schedule Start.'))
        assert repo.get_experiment(identity)==baseline
        assert repo.leases()==leases
        with repo.engine.connect() as db:assert db.execute(select(repo.audit)).all()==[]
    finally:event.remove(repo.engine,'before_execute',refuse_audit)
    recovered=ExperimentManager(repo,gateway,submit=lambda *_:pytest.fail('Recovery cannot schedule Start.'))
    try:
        record=repo.get_experiment(identity)
        assert record['state']=='FAULT' and record['error_code']=='RESTART_RECOVERY'
        assert record['state_history']==['CREATED','RUNNING','FAULT'] and record['revision']==3
        assert record['lease_expires_at'] is None
        assert repo.leases()==([] if safe else [{**leases[0],'quarantined':True}])
        with repo.engine.connect() as db:
            assert db.execute(select(repo.audit.c.action,repo.audit.c.subject_id,repo.audit.c.actor_id)).all()==[
                ('EXPERIMENT_RESTART_RECOVERED' if safe else 'EXPERIMENT_RESTART_QUARANTINED',identity,None)]
        assert gateway.calls==['stop_execution','stop_execution']
    finally:recovered.close()


def test_postgresql_scheduler_queries_read_indexed_active_subset_after_accumulated_history(pg):
    from app.migrations.schema_v0006 import projection
    _,_,repo,_,owner,_=initialized(pg)
    runtime=repo.experiment_runtime
    terminal=[{'experiment_id':f'history-{index:05}','state':'COMPLETE','private_graph':{'padding':'x'*4096}} for index in range(2000)]
    running={'experiment_id':'running-only','state':'RUNNING','_control_session_id':'session','_control_client_id':'tab'}
    with repo.engine.begin() as db:
        values=[*terminal,running]
        db.execute(insert(repo.experiments),[{'experiment_id':value['experiment_id'],'owner_id':owner.owner_id,'payload':value} for value in values])
        db.execute(insert(runtime),[projection(value) for value in values])
        db.execute(text('ANALYZE lab_experiment_runtime'));db.execute(text('ANALYZE lab_experiments'))
        plan=db.execute(text('EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS) SELECT experiment_id FROM lab_experiment_runtime WHERE active=true ORDER BY experiment_id LIMIT 100')).scalar()
    def nodes(node):
        yield node
        for child in node.get('Plans',[]):yield from nodes(child)
    assert any(node.get('Index Name')=='ix_lab_runtime_active' for node in nodes(plan[0]['Plan']))
    assert repo.has_active_experiment(owner.owner_id)
    assert repo.active_experiments(owner.owner_id)==[running]
    assert repo.active_experiments(session_id='session',client_id='tab',payload=False)==[
        {'experiment_id':'running-only','owner_id':owner.owner_id,'control_session_id':'session','control_client_id':'tab'}]
    assert repo.active_experiments(session_id='other',payload=False)==[]


def test_postgresql_scheduler_backup_restore_upgrade_keeps_payload_and_indexes(pg,tmp_path):
    source_name,source_url=pg.new_schema();engine=pg.engine(source_url);migrate(engine,'0005_captures')
    value={'experiment_id':'old-queued','state':'QUEUED','_queue_sequence':72,
        '_control_session_id':'old-session','_control_client_id':'old-tab','private_keep':{'original':[None,2]}}
    with engine.begin() as db:db.execute(insert(legacy.experiments).values(experiment_id=value['experiment_id'],owner_id='retained-owner',payload=value))
    backup=tmp_path/'scheduler.sql';run_database_tool(pg,'pg_dump',['--schema='+source_name,'--no-owner','--no-privileges','--file='+str(backup)])
    restored_name,restored_url=pg.new_schema(create=False)
    restored=tmp_path/'scheduler-restore.sql';restored.write_bytes(backup.read_bytes().replace(source_name.encode(),restored_name.encode()))
    run_database_tool(pg,'psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--file='+str(restored)])
    repo=pg.repository(restored_url)
    assert repo.get_experiment('old-queued')==value and repo.active_experiments()==[value]
    assert repo.admission_sequence()==72
    with repo.engine.connect() as db:assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
    with engine.connect() as db:assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()=='0005_captures'
