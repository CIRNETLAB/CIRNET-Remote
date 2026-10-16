from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import pytest
from sqlalchemy import select
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository


def graph():
    return {'schema_version':'1.1','circuit_id':'embedded-original','modules':[{'id':'R','type':'RESISTOR_AXIAL','position':{'x':1,'y':2.5,'z':0},'properties':{'resistance_ohm':1000,'custom-supported':{'nested':[None,True,4]}}}],
            'connections':[],'metadata':{'foreign-extension':{'values':[1,None,{'keep':'exact'}]},'name':'Original import name'}}


def setup(url='sqlite://'):
    from app.services.projects import ProjectService
    repo=Repository(url); auth=AuthService(repo,Settings()); owner,_=auth.ensure_session(None); other,_=auth.ensure_session(None)
    return repo,auth,ProjectService(repo),owner.owner_id,other.owner_id


def test_document_roundtrip_preserves_graph_identity_types_and_metadata_after_restart(tmp_path):
    url='sqlite:///'+(tmp_path/'projects.sqlite').as_posix()
    repo,auth,service,owner,_=setup(url)
    project=service.create_project(owner,{'name':'Project','description':'A description'})
    original=graph(); document=service.create_circuit(owner,project['project_id'],{'name':'Server name','graph':original})
    assert document['document_id']!=original['circuit_id'] and document['graph']==original
    assert document['revision']==1 and document['graph_schema_version']=='1.1'
    repo.close(); repo=Repository(url)
    from app.services.projects import ProjectService
    loaded=ProjectService(repo).get_circuit(owner,document['document_id'])
    assert loaded==document and type(loaded['graph']['modules'][0]['position']['x']) is int


def test_two_writers_with_same_base_revision_cannot_silently_overwrite(tmp_path):
    from app.services.projects import ProjectService,RevisionConflict
    url='sqlite:///'+(tmp_path/'cas.sqlite').as_posix(); repo,auth,service,owner,_=setup(url)
    project=service.create_project(owner,{'name':'Project'})
    document=service.create_circuit(owner,project['project_id'],{'name':'Initial','graph':graph()})
    second=Repository(url); writer=ProjectService(second); barrier=Barrier(2)
    def save(pair):
        api,name=pair; candidate=graph(); candidate['metadata']['writer']=name; barrier.wait(timeout=10)
        try: return api.save_circuit(owner,document['document_id'],{'base_revision':1,'name':name,'graph':candidate})
        except RevisionConflict as error: return error
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(save,[(service,'first'),(writer,'second')]))
    accepted=[result for result in results if isinstance(result,dict)]; conflicts=[result for result in results if isinstance(result,RevisionConflict)]
    assert len(accepted)==len(conflicts)==1 and conflicts[0].current_revision==2
    assert service.get_circuit(owner,document['document_id'])==accepted[0]
    assert service.resolve_snapshot(owner,document['document_id'],1)['graph']==graph()


def test_private_owner_scope_pagination_soft_delete_and_revision_conflicts():
    from app.services.projects import RevisionConflict
    repo,auth,service,owner,other=setup()
    projects=[service.create_project(owner,{'name':f'Project {i}'}) for i in range(3)]
    service.create_project(other,{'name':'Other private'})
    first=service.list_projects(owner,limit=2); second=service.list_projects(owner,limit=2,cursor=first['next_cursor'])
    assert [item['project_id'] for item in first['items']+second['items']]==[item['project_id'] for item in projects]
    assert second['next_cursor'] is None
    with pytest.raises(PermissionError): service.get_project(other,projects[0]['project_id'])
    document=service.create_circuit(owner,projects[0]['project_id'],{'name':'Circuit','graph':graph()})
    for action in (lambda:service.get_circuit(other,document['document_id']),lambda:service.save_circuit(other,document['document_id'],{'base_revision':1,'name':'Hacked','graph':graph()}),lambda:service.delete_circuit(other,document['document_id'],1)):
        with pytest.raises(PermissionError): action()
    updated=service.update_project(owner,projects[0]['project_id'],{'base_revision':1,'description':'Changed'})
    assert updated['revision']==2
    with pytest.raises(RevisionConflict): service.delete_project(owner,projects[0]['project_id'],1)
    service.delete_project(owner,projects[0]['project_id'],2)
    with pytest.raises(KeyError): service.get_circuit(owner,document['document_id'])
    assert service.list_projects(owner)['items']==projects[1:]
    with repo.engine.connect() as db:
        assert db.execute(select(repo.circuit_revisions.c.graph)).scalar_one()==graph()


def test_experiment_revision_reference_is_atomic_and_snapshot_immutable():
    repo,auth,service,owner,_=setup()
    project=service.create_project(owner,{'name':'Project'}); original=graph()
    document=service.create_circuit(owner,project['project_id'],{'name':'Circuit','graph':original})
    reference={'document_id':document['document_id'],'revision':1}
    repo.create_experiment(owner,{'experiment_id':'from-doc','state':'CREATED','_document_reference':reference})
    changed=graph(); changed['metadata']['edited']=True
    service.save_circuit(owner,document['document_id'],{'base_revision':1,'name':'New','graph':changed})
    assert service.resolve_snapshot(owner,document['document_id'],1)['graph']==original
    with repo.engine.connect() as db:
        row=db.execute(select(repo.experiment_document_refs)).mappings().one()
        assert row['revision']==1 and row['experiment_id']=='from-doc'
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError): repo.create_experiment(owner,{'experiment_id':'bad-ref','state':'CREATED','_document_reference':{**reference,'revision':999}})
    with pytest.raises(KeyError): repo.get_experiment('bad-ref')


def test_confirmed_guest_claim_transfers_projects_documents_and_preserves_revision_author():
    repo,auth,service,guest,_=setup()
    context,cookie=auth.ensure_session(None)
    project=service.create_project(context.owner_id,{'name':'Guest project'})
    document=service.create_circuit(context.owner_id,project['project_id'],{'name':'Guest circuit','graph':graph()})
    auth.bootstrap_admin('teacher','sufficiently long password')
    account,_=auth.login(context,'teacher','sufficiently long password')
    claimed,_=auth.claim_guest(account,True)
    assert service.get_project(claimed.owner_id,project['project_id'])['owner_id']==claimed.owner_id
    assert service.get_circuit(claimed.owner_id,document['document_id'])['owner_id']==claimed.owner_id
    with repo.engine.connect() as db: assert db.execute(select(repo.circuit_revisions.c.saved_by)).scalar_one()==context.owner_id


def test_project_revision_columns_support_the_declared_safe_integer_range_in_postgresql():
    from sqlalchemy.dialects import postgresql
    from app.migrations.schema_v0003 import PROJECTS
    for table in PROJECTS:
        if 'revision' in table.c:
            assert table.c.revision.type.compile(dialect=postgresql.dialect())=='BIGINT'


@pytest.mark.parametrize('version',['1.0','1.1'])
def test_saved_and_duplicated_graphs_preserve_mounts_memory_wires_leads_and_extensions(version):
    import json
    from pathlib import Path
    repo,auth,service,owner,_=setup()
    project=service.create_project(owner,{'name':'Preservation'})
    source=json.loads((Path(__file__).resolve().parents[3]/'contracts/circuit-schema/examples/physical-hc08-led.json').read_text())
    source['schema_version']=version
    source['modules'].append({'id':'MEM','type':'MEMORY','position':{'x':10**400,'y':1.25,'z':0},'properties':{'memory':{'version':'1.0','word_bits':8,'depth':2,'data':[0,255]},'leadProperties':{'custom':{'x':[None,True]}}},'futureModuleExtension':{'preserve':'unchanged'}})
    source['metadata']={'future':{'supported':[None,True,1,2.5]}}
    original=deepcopy(source)
    first=service.create_circuit(owner,project['project_id'],{'name':'First','graph':source})
    saved=service.save_circuit(owner,first['document_id'],{'base_revision':1,'name':'Renamed','graph':source})
    duplicate=service.create_circuit(owner,project['project_id'],{'name':'Duplicate','graph':source})
    assert source==original
    assert saved['graph']==duplicate['graph']==service.resolve_snapshot(owner,first['document_id'],1)['graph']==original
    assert duplicate['document_id']!=saved['document_id'] and saved['graph']['circuit_id']==original['circuit_id']


def test_document_limits_bad_cursors_and_invalid_saves_preserve_existing_revision():
    from jsonschema import ValidationError
    repo,auth,service,owner,_=setup(); project=service.create_project(owner,{'name':'Project'})
    document=service.create_circuit(owner,project['project_id'],{'name':'Circuit','graph':graph()})
    for cursor in ('not-a-cursor','123','e30',''):
        with pytest.raises(ValueError,match='INVALID_CURSOR'): service.list_projects(owner,cursor=cursor)
    with pytest.raises(ValueError,match='INVALID_PAGE_LIMIT'): service.list_projects(owner,limit=101)
    large=graph(); large['metadata']['large']='x'*2_000_001
    with pytest.raises(ValueError,match='DOCUMENT_TOO_LARGE'): service.save_circuit(owner,document['document_id'],{'base_revision':1,'name':'Large','graph':large})
    with pytest.raises(ValidationError): service.save_circuit(owner,document['document_id'],{'base_revision':True,'name':'Bad revision','graph':graph()})
    assert service.get_circuit(owner,document['document_id'])==document


def test_circuit_creation_cannot_insert_after_an_independent_parent_deletion(tmp_path,monkeypatch):
    from threading import Event
    from app.services.projects import ProjectService
    url='sqlite:///'+(tmp_path/'parent-race.sqlite').as_posix()
    repo,auth,creator,owner,_=setup(url); second=Repository(url); deleter=ProjectService(second)
    project=creator.create_project(owner,{'name':'Delete race'}); checked=Event(); release=Event(); original=creator._project
    def delayed(db,identity,actor,**kwargs):
        result=original(db,identity,actor,**kwargs); checked.set(); assert release.wait(5); return result
    monkeypatch.setattr(creator,'_project',delayed)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending=pool.submit(creator.create_circuit,owner,project['project_id'],{'name':'Must not orphan','graph':graph()})
        try:
            assert checked.wait(2); deleter.delete_project(owner,project['project_id'],1)
        finally: release.set()
        with pytest.raises(KeyError): pending.result(timeout=5)
    with repo.engine.connect() as db: assert db.execute(select(repo.circuit_documents)).first() is None


def test_revoked_guest_project_create_cannot_commit_after_confirmed_claim(monkeypatch):
    from threading import Event
    from app.services.projects import ProjectService
    from app.services.auth import AuthError
    repo,auth,_,_,_=setup(); context,_=auth.ensure_session(None)
    service=ProjectService(repo,authorize_session=auth.require_principal_session)
    project=service.create_project(context.owner_id,{'name':'Existing'},auth_session_id=context.session_id)
    auth.bootstrap_admin('teacher','sufficiently long password')
    checked=Event(); release=Event(); original=service._request
    def delayed(name,payload):
        result=original(name,payload); checked.set(); assert release.wait(5); return result
    monkeypatch.setattr(service,'_request',delayed)
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending=pool.submit(service.create_project,context.owner_id,{'name':'Must not orphan'},auth_session_id=context.session_id)
        try:
            assert checked.wait(2)
            account,_=auth.login(context,'teacher','sufficiently long password'); claimed,_=auth.claim_guest(account,True)
        finally: release.set()
        with pytest.raises(AuthError,match='SESSION_EXPIRED'): pending.result(timeout=5)
    assert service.get_project(claimed.owner_id,project['project_id'])['owner_id']==claimed.owner_id
    assert service.list_projects(context.owner_id)['items']==[]


def test_independent_claim_and_authorized_commit_serialize_at_the_database(tmp_path,monkeypatch):
    from threading import Event
    from app.services.projects import ProjectService
    url='sqlite:///'+(tmp_path/'session-fence.sqlite').as_posix()
    repo=Repository(url); auth=AuthService(repo,Settings()); context,_=auth.ensure_session(None)
    auth.bootstrap_admin('teacher','sufficiently long password')
    other_repo=Repository(url); other_auth=AuthService(other_repo,Settings())
    creator=ProjectService(repo,authorize_session=auth.require_principal_session)
    existing=creator.create_project(context.owner_id,{'name':'Existing'},auth_session_id=context.session_id)
    authorized=Event(); release=Event(); claim_started=Event(); claim_finished=Event(); original=creator._authorize
    def delayed(db,owner,session_id):
        original(db,owner,session_id); authorized.set(); assert release.wait(5)
    monkeypatch.setattr(creator,'_authorize',delayed)
    def claim():
        claim_started.set()
        account,_=other_auth.login(context,'teacher','sufficiently long password')
        claimed,_=other_auth.claim_guest(account,True)
        claim_finished.set(); return claimed
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending=pool.submit(creator.create_project,context.owner_id,{'name':'Concurrent'},auth_session_id=context.session_id)
        assert authorized.wait(2)
        transfer=pool.submit(claim)
        try:
            assert claim_started.wait(2)
            completed_before_commit=claim_finished.wait(1)
        finally: release.set()
        pending.result(timeout=5); claimed=transfer.result(timeout=5)
    assert completed_before_commit is False
    assert creator.list_projects(context.owner_id)['items']==[]
    assert {value['name'] for value in creator.list_projects(claimed.owner_id)['items']}=={'Existing','Concurrent'}


def test_revision_limit_rejects_updates_saves_and_deletions_without_partial_changes():
    from sqlalchemy import insert,update
    maximum=9007199254740991
    repo,auth,service,owner,_=setup(); project=service.create_project(owner,{'name':'Bounded'})
    document=service.create_circuit(owner,project['project_id'],{'name':'Circuit','graph':graph()})
    with repo.engine.begin() as db:
        snapshot=dict(db.execute(select(repo.circuit_revisions)).mappings().one())
        db.execute(insert(repo.circuit_revisions).values(**{**snapshot,'revision':maximum}))
        db.execute(update(repo.circuit_documents).where(repo.circuit_documents.c.document_id==document['document_id']).values(revision=maximum))
    for action in (lambda:service.save_circuit(owner,document['document_id'],{'base_revision':maximum,'name':'Overflow','graph':graph()}),lambda:service.delete_circuit(owner,document['document_id'],maximum),lambda:service.delete_project(owner,project['project_id'],1)):
        with pytest.raises(ValueError,match='REVISION_LIMIT_REACHED'): action()
    assert service.get_circuit(owner,document['document_id'])['revision']==maximum
    assert service.get_project(owner,project['project_id'])['revision']==1
    with repo.engine.begin() as db:
        db.execute(update(repo.projects).where(repo.projects.c.project_id==project['project_id']).values(revision=maximum))
    for action in (lambda:service.update_project(owner,project['project_id'],{'base_revision':maximum,'name':'Overflow'}),lambda:service.delete_project(owner,project['project_id'],maximum)):
        with pytest.raises(ValueError,match='REVISION_LIMIT_REACHED'): action()
    assert service.get_project(owner,project['project_id'])['revision']==maximum
    assert service.get_project(owner,project['project_id'])['name']=='Bounded'
