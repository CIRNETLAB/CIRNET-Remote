"""Sealed capture identities persist across generations and owner transfers."""
from copy import deepcopy
from hashlib import sha256
import pytest
from contracts.capture_codec import encode_digital
from app.services.persistence import Repository


def metadata(identity='cap-one'):
    binary=encode_digital([{'signal':'y','time_ns':0,'value':1}],10)
    return {'schema_version':'1.0','capture_id':identity,'source':'simulation','instrument':'logic_analyzer',
        'encoding':'digital_events','available':True,'duration_ns':10,'sample_count':1,'channel_count':1,
        'signals':['y'],'timestamp_ns':'1000000000','payload_ref':f'/api/captures/{identity}/payload',
        'payload_byte_count':len(binary),'sha256':sha256(binary).hexdigest()}


def experiment(identity='e1',capture=None,state='COMPLETE'):
    return {'experiment_id':identity,'state':state,'revision':2,'capture':deepcopy(capture),'private-preserved':[None,True]}


def test_capture_generations_are_indexed_without_samples_and_follow_current_owner():
    repo=Repository('sqlite://');first=metadata();value=experiment(capture=first)
    repo.create_experiment('owner',experiment());repo.save_experiment(value)
    assert hasattr(repo,'capture_reference'),'Persistent capture lookup is missing.'
    assert repo.capture_reference('cap-one','owner')['metadata']==first
    with pytest.raises(PermissionError):repo.capture_reference('cap-one','stranger')
    value['capture']=metadata('cap-two');repo.save_experiment(value)
    assert repo.capture_reference('cap-one','owner')['metadata']==first
    assert repo.capture_reference('cap-two','owner')['experiment_id']=='e1'
    from sqlalchemy import update
    with repo.engine.begin() as db:db.execute(update(repo.experiments).values(owner_id='claimed-owner'))
    assert repo.capture_reference('cap-one','claimed-owner')['owner_id']=='claimed-owner'
    with pytest.raises(PermissionError):repo.capture_reference('cap-one','owner')


def test_retirement_keeps_old_generation_separate_and_tombstones_current_before_cleanup():
    repo=Repository('sqlite://');repo.create_experiment('owner',experiment())
    value=experiment(capture=metadata());repo.save_experiment(value)
    value['capture']=metadata('cap-two');repo.save_experiment(value)
    assert hasattr(repo,'retire_capture'),'Transactional capture retirement is missing.'
    result=repo.retire_capture('cap-one','owner')
    assert result['changed'] is True and result['metadata']['available'] is False
    assert repo.get_experiment('e1')==value
    assert repo.capture_reference('cap-one','owner')['cleanup_pending'] is True
    repo.finish_capture_cleanup('cap-one')
    assert repo.capture_reference('cap-one','owner')['cleanup_pending'] is False
    result=repo.retire_capture('cap-two','owner')
    current=repo.get_experiment('e1')
    assert current['revision']==3 and current['capture']==result['metadata']
    assert current['capture']['payload_ref'] is None and current['capture']['payload_byte_count']==0 and current['capture']['sha256'] is None
    assert current['private-preserved']==[None,True]
    assert repo.retire_capture('cap-two','owner')['changed'] is False


def test_retired_ids_cannot_resurrect_or_change_sealed_identity_in_an_experiment_save():
    repo=Repository('sqlite://');repo.create_experiment('owner',experiment())
    value=experiment(capture=metadata());repo.save_experiment(value)
    changed=deepcopy(value);changed['capture']['duration_ns']=11
    with pytest.raises(ValueError,match='CAPTURE_IDENTITY_CONFLICT'):repo.save_experiment(changed)
    changed=deepcopy(value);changed['capture'].pop('sha256')
    with pytest.raises(ValueError,match='CAPTURE_IDENTITY_CONFLICT'):repo.save_experiment(changed)
    assert repo.get_experiment('e1')==value
    repo.retire_capture('cap-one','owner')
    retired=repo.get_experiment('e1')
    with pytest.raises(ValueError,match='CAPTURE_RETIRED'):repo.save_experiment(value)
    assert repo.get_experiment('e1')==retired
    repo.create_experiment('other',experiment('e2'))
    with pytest.raises(ValueError,match='CAPTURE_IDENTITY_CONFLICT'):repo.save_experiment(experiment('e2',metadata()))


@pytest.mark.parametrize('state,leased,quarantined',[('CAPTURING',False,False),('COMPLETE',True,False),('FAULT',True,True)])
def test_active_or_leased_captures_cannot_be_retired(state,leased,quarantined):
    repo=Repository('sqlite://');repo.create_experiment('owner',experiment())
    value=experiment(capture=metadata(),state=state);repo.save_experiment(value)
    if leased:
        from sqlalchemy import insert
        with repo.engine.begin() as db:db.execute(insert(repo.lease_table).values(station_id='station',slot=0,experiment_id='e1',expires_at=100,quarantined=quarantined))
    assert hasattr(repo,'retire_capture'),'Transactional capture retirement is missing.'
    with pytest.raises(ValueError,match='CAPTURE_ACTIVE'):repo.retire_capture('cap-one','owner')
    assert repo.capture_reference('cap-one','owner')['metadata']['available'] is True


def test_retention_query_is_bounded_and_includes_pending_cleanup_but_excludes_any_lease():
    repo=Repository('sqlite://')
    assert hasattr(repo,'expired_captures'),'Bounded retention catalog is missing.'
    for index in range(3):
        value=experiment(f'e{index}',metadata(f'cap-{index}'));repo.create_experiment('owner',experiment(f'e{index}'));repo.save_experiment(value)
    repo.retire_capture('cap-0','owner')
    from sqlalchemy import insert
    with repo.engine.begin() as db:db.execute(insert(repo.lease_table).values(station_id='station',slot=0,experiment_id='e2',expires_at=100,quarantined=False))
    page=repo.expired_captures(2,limit=1)
    assert len(page)==1 and page[0]['capture_id']=='cap-0'
    assert {item['capture_id'] for item in repo.expired_captures(2)}=={'cap-0','cap-1'}
    assert {item['capture_id'] for item in repo.expired_captures(None)}=={'cap-0'}
    with pytest.raises(ValueError):repo.expired_captures(2,limit=1001)


def test_reservation_never_creates_a_new_lease_after_terminal_capture_retirement():
    repo=Repository('sqlite://');repo.create_experiment('owner',experiment())
    assert repo.reserve('station',0,'e1',100) is False
    assert repo.reserve('station',0,'missing',100) is False
    assert repo.leases()==[]


def test_retirement_rechecks_session_authority_and_audits_only_committed_changes():
    from app.config import Settings
    from app.services.auth import AuthService,AuthError
    repo=Repository('sqlite://');auth=AuthService(repo,Settings())
    context,_=auth.ensure_session(None)
    repo.create_experiment(context.owner_id,experiment());repo.save_experiment(experiment(capture=metadata()))
    auth.logout(context)
    with pytest.raises(AuthError,match='SESSION_EXPIRED'):
        repo.retire_capture('cap-one',context.owner_id,auth_session_id=context.session_id,authorize_session=auth.require_principal_session)
    assert repo.capture_reference('cap-one')['metadata']['available'] is True


def test_retirement_revision_limit_keeps_payload_and_catalog_unchanged():
    repo=Repository('sqlite://');repo.create_experiment('owner',experiment())
    value=experiment(capture=metadata());value['revision']=9007199254740991;repo.save_experiment(value)
    with pytest.raises(ValueError,match='REVISION_LIMIT_REACHED'):repo.retire_capture('cap-one','owner')
    assert repo.get_experiment('e1')==value and repo.capture_reference('cap-one')['metadata']['available'] is True


def test_maintenance_retirement_audits_reason_without_inventing_a_principal():
    from sqlalchemy import select
    repo=Repository('sqlite://');repo.create_experiment('legacy-owner',experiment());repo.save_experiment(experiment(capture=metadata()))
    repo.retire_capture('cap-one','legacy-owner',reason='RETENTION')
    with repo.engine.connect() as db:
        row=db.execute(select(repo.audit).where(repo.audit.c.subject_id=='cap-one')).mappings().one()
    assert row['actor_id'] is None and row['action']=='CAPTURE_RETENTION'


def test_session_authorized_retirement_audits_the_actual_principal():
    from sqlalchemy import select
    from app.config import Settings
    from app.services.auth import AuthService
    repo=Repository('sqlite://');auth=AuthService(repo,Settings());auth.bootstrap_admin('capture-admin','capture regression password')
    guest,_=auth.ensure_session(None);admin,_=auth.login(guest,'capture-admin','capture regression password')
    repo.create_experiment(admin.owner_id,experiment());repo.save_experiment(experiment(capture=metadata()))
    repo.retire_capture('cap-one',admin.owner_id,auth_session_id=admin.session_id,authorize_session=auth.require_principal_session)
    with repo.engine.connect() as db:assert db.execute(select(repo.audit.c.actor_id).where(repo.audit.c.subject_id=='cap-one')).scalar_one()==admin.principal_id


def test_disabled_retention_retries_pending_io_without_retiring_available_epoch_zero_capture(tmp_path):
    from app.services.capture_maintenance import expire_payloads
    from app.services.capture_store import FilesystemCaptureStore
    repo=Repository('sqlite://');store=FilesystemCaptureStore(tmp_path)
    binary=encode_digital([{'signal':'y','time_ns':0,'value':1}],10)
    for index in range(2):
        identity=str(index)*32;capture=metadata(identity);capture['timestamp_ns']='0'
        store.put(capture,binary);repo.create_experiment('owner',experiment(f'e{index}'));repo.save_experiment(experiment(f'e{index}',capture))
    repo.retire_capture('0'*32,'owner')
    report=expire_payloads(repo,store,retention_seconds=0,now=100)
    assert report['scanned']==report['deleted']==1 and report['failed']==0
    assert repo.capture_reference('1'*32)['metadata']['available'] is True
    assert repo.capture_reference('0'*32)['cleanup_pending'] is False
    assert len(list(tmp_path.glob('*.ncap')))==1
