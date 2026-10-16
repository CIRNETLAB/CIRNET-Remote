"""Execution consumes immutable admission snapshots, never a later editor save."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest
from sqlalchemy import delete,insert,update
from test_lab_lifecycle import setup_manager,create,assignment


@pytest.mark.parametrize('change_after_queue',[False,True])
def test_assignment_edits_after_create_do_not_change_the_graded_run(tmp_path,change_after_queue):
    manager,repo,_,jobs,_,_=setup_manager(tmp_path)
    eid=create(manager)['experiment_id']
    if change_after_queue: manager.run(eid,'student-1')
    changed=assignment()
    changed['expected_behavior']['expected_signals'][0]['value']=1
    with repo.engine.begin() as db:
        db.execute(update(repo.assignments).where(repo.assignments.c.assignment_id=='a1').values(payload=changed))
    if not change_after_queue: manager.run(eid,'student-1')
    jobs.run_one()
    # Measured y=1 still fails the admitted y=0 assignment, despite the edit.
    assert manager.get(eid,'student-1')['functional_verification']['status']=='FAIL'
    manager.close(); repo.close()


def test_saved_document_reference_pins_the_exact_owned_revision(tmp_path):
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    graph={'schema_version':'1.0','circuit_id':'logical-id','modules':[], 'connections':[],
           'metadata':{'future':{'preserve':[1,None,'x']}}}
    original=deepcopy(graph)
    from app.services.projects import ProjectService
    with repo.engine.begin() as db:
        db.execute(insert(repo.auth_principals).values(principal_id='student-1',kind='GUEST',created_at=0))
    projects=ProjectService(repo)
    project=projects.create_project('student-1',{'name':'Owned project'})
    document=projects.create_circuit('student-1',project['project_id'],{'name':'Owned document','graph':graph})
    manager.document_resolver=projects.resolve_snapshot
    eid=create(manager,circuit_document_id=document['document_id'],circuit_revision=1)['experiment_id']
    graph['metadata']['future']['preserve'].append('later-edit')
    projects.save_circuit('student-1',document['document_id'],{'base_revision':1,'name':'Edited document','graph':graph})
    stored=repo.get_experiment(eid)
    assert stored['_circuit_graph']==original
    assert stored['_document_reference']=={'document_id':document['document_id'],'revision':1}
    assert manager.document_reference(eid,'student-1')['revision']==1
    with pytest.raises(PermissionError): manager.document_reference(eid,'other')
    manager.close(); repo.close()


def test_document_reference_does_not_accept_a_different_inline_graph(tmp_path):
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    manager.document_resolver=lambda *args:pytest.fail('invalid source must be rejected before resolving')
    with pytest.raises(ValueError,match='INVALID_CONFIGURATION'):
        create(manager,circuit_document_id='saved-document',circuit_revision=3,
               circuit_graph={'schema_version':'1.0','circuit_id':'other','modules':[],'connections':[]})
    assert not repo.list_experiments()
    manager.close(); repo.close()


def test_legacy_created_record_pins_available_assignment_when_first_admitted(tmp_path):
    manager,repo,_,jobs,_,_=setup_manager(tmp_path)
    eid=create(manager)['experiment_id']
    legacy=repo.get_experiment(eid)
    legacy.pop('_assignment_snapshot',None)
    repo.save_experiment(legacy)
    manager.run(eid,'student-1')
    changed=assignment(); changed['expected_behavior']['expected_signals'][0]['value']=1
    with repo.engine.begin() as db:
        db.execute(update(repo.assignments).where(repo.assignments.c.assignment_id=='a1').values(payload=changed))
    jobs.run_one()
    assert manager.get(eid,'student-1')['functional_verification']['status']=='FAIL'
    manager.close(); repo.close()


def test_revocation_during_slow_create_cannot_commit_an_orphan_after_guest_claim(tmp_path):
    manager,repo,gateway,_,_,_=setup_manager(tmp_path)
    entered,release=Event(),Event()
    active=[True]
    manager.control_session_active=lambda session:active[0]
    original=gateway.capabilities
    def delayed(station):
        entered.set()
        assert release.wait(3)
        return original(station)
    gateway.capabilities=delayed
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending=executor.submit(manager.create,'student-1',{'station_id':'p1','assignment_id':'a1'},auth_session_id='login')
        try:
            assert entered.wait(1)
            active[0]=False
        finally: release.set()
        with pytest.raises(ValueError,match='SESSION_EXPIRED'): pending.result(timeout=3)
    assert not repo.list_experiments()
    manager.close(); repo.close()


def test_independent_claim_after_last_admission_read_cannot_orphan_saved_experiment(tmp_path):
    from app.config import Settings
    from app.services.auth import AuthError,AuthService
    from app.services.persistence import Repository
    from app.services.projects import ProjectService
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    auth=AuthService(repo,Settings()); guest,_=auth.ensure_session(None)
    projects=ProjectService(repo)
    project=projects.create_project(guest.owner_id,{'name':'Owned'})
    document=projects.create_circuit(guest.owner_id,project['project_id'],{'name':'Pinned','graph':{'schema_version':'1.0','circuit_id':'pinned','modules':[],'connections':[]}})
    other=Repository(repo.engine.url.render_as_string(hide_password=False))
    independent_auth=AuthService(other,Settings())
    independent_auth.bootstrap_admin('teacher','sufficiently long password')
    manager.control_session_active=auth.session_active
    manager.authorize_session=auth.require_principal_session
    checked,release=Event(),Event(); reads=[0]
    def delayed(owner,identity,revision):
        result=projects.resolve_snapshot(owner,identity,revision); reads[0]+=1
        if reads[0]==2:
            checked.set(); assert release.wait(5)
        return result
    manager.document_resolver=delayed
    with ThreadPoolExecutor(max_workers=1) as executor:
        pending=executor.submit(manager.create,guest.owner_id,{'station_id':'p1','assignment_id':'a1','circuit_document_id':document['document_id'],'circuit_revision':1},operation_key='pending-create',auth_session_id=guest.session_id)
        try:
            assert checked.wait(2)
            account,_=independent_auth.login(guest,'teacher','sufficiently long password')
            claimed,_=independent_auth.claim_guest(account,True)
        finally: release.set()
        with pytest.raises(AuthError,match='SESSION_EXPIRED'): pending.result(timeout=5)
    assert repo.list_experiments(guest.owner_id)==[]
    with pytest.raises(KeyError): repo.operation(guest.owner_id,'create','pending-create')
    assert projects.get_circuit(claimed.owner_id,document['document_id'])['owner_id']==claimed.owner_id
    manager.close(); repo.close(); other.close()


@pytest.mark.parametrize('missing_assignment',[False,True])
def test_legacy_queued_recovery_pins_available_assignment_or_blocks_missing_context(tmp_path,missing_assignment):
    from app.services.experiments import ExperimentManager
    from test_lab_lifecycle import DeferredJobs
    manager,repo,gateway,_,_,_=setup_manager(tmp_path)
    first=create(manager,'first')['experiment_id']; manager.run(first,'first')
    second=create(manager,'second')['experiment_id']; manager.run(second,'second')
    legacy=repo.get_experiment(second); legacy.pop('_assignment_snapshot')
    repo.save_experiment(legacy)
    if missing_assignment:
        with repo.engine.begin() as db:
            # Reproduce missing pre-authoring context; immutable authoring rows
            # now deliberately prevent deleting a referenced assignment alone.
            db.execute(delete(repo.assignment_documents).where(repo.assignment_documents.c.assignment_id=='a1'))
            db.execute(delete(repo.assignment_revisions).where(repo.assignment_revisions.c.assignment_id=='a1'))
            db.execute(delete(repo.assignment_access).where(repo.assignment_access.c.assignment_id=='a1'))
            db.execute(delete(repo.assignments).where(repo.assignments.c.assignment_id=='a1'))
    # An abrupt process exit loses submitted jobs; restart reconstructs FIFO.
    manager.closed=True
    jobs=DeferredJobs()
    recovered=ExperimentManager(repo,gateway,submit=jobs)
    if missing_assignment:
        value=recovered.get(second,'second')
        assert value['execution_decision']['decision']=='BLOCK_UNEXECUTABLE'
        assert not jobs.jobs and 'start_execution' not in gateway.calls
    else:
        changed=assignment(); changed['expected_behavior']['expected_signals'][0]['value']=1
        with repo.engine.begin() as db:
            db.execute(update(repo.assignments).where(repo.assignments.c.assignment_id=='a1').values(payload=changed))
        jobs.run_one()
        assert recovered.get(second,'second')['functional_verification']['status']=='FAIL'
    recovered.close(); repo.close()
