import time
import pytest
from sqlalchemy import select
from app.config import Settings
from app.services.persistence import Repository


def service():
    from app.services.auth import AuthService
    return AuthService(Repository('sqlite://'), Settings())


def test_login_rotates_opaque_cookie_and_logout_revokes_session():
    auth=service()
    auth.bootstrap_admin('teacher','correct horse battery staple')
    guest,cookie=auth.ensure_session(None)
    admin,new_cookie=auth.login(guest,'teacher','correct horse battery staple')
    assert admin.authenticated and admin.role=='ADMIN'
    assert cookie != new_cookie and auth.current(cookie) is None
    assert auth.current(new_cookie).principal_id==admin.principal_id
    assert auth.session_active(admin.session_id)
    revoked=[]; auth.set_revoke_callback(revoked.extend)
    replacement,replacement_cookie=auth.logout(admin)
    assert not auth.session_active(admin.session_id)
    assert admin.session_id in revoked and replacement_cookie!=new_cookie
    assert not replacement.authenticated


def test_password_hash_and_cookie_not_stored_as_plaintext():
    auth=service(); password='a sufficiently long password'
    user=auth.bootstrap_admin('teacher',password)
    context,cookie=auth.ensure_session(None)
    with auth.repo.engine.connect() as db:
        rows=db.execute(select(auth.repo.auth_users)).mappings().all()
        sessions=db.execute(select(auth.repo.auth_sessions)).mappings().all()
    assert rows[0]['password_hash'].startswith('$argon2id$')
    assert password not in repr(rows) and cookie not in repr(sessions)
    assert 'password_hash' not in user


def test_csrf_origin_expiry_and_student_authoring_are_enforced():
    from app.services.auth import AuthError
    auth=service(); guest,cookie=auth.ensure_session(None)
    auth.verify_mutation(guest,'http://testserver',guest.csrf_token)
    for origin,csrf in [(None,guest.csrf_token),('https://evil.invalid',guest.csrf_token),('http://testserver','bad'),('http://testserver','é')]:
        with pytest.raises(AuthError): auth.verify_mutation(guest,origin,csrf)
    with pytest.raises(AuthError): auth.require_role(guest,'INSTRUCTOR','ADMIN')
    auth.clock=lambda: time.time()+90000
    assert auth.current(cookie) is None and not auth.session_active(guest.session_id)


def test_role_change_revokes_sessions_and_self_promotion_is_forbidden():
    from app.services.auth import AuthError
    auth=service(); auth.bootstrap_admin('teacher','sufficiently long password')
    pre,_=auth.ensure_session(None); admin,_=auth.login(pre,'teacher','sufficiently long password')
    student=auth.create_user('student','another long password',actor=admin)
    pre,_=auth.ensure_session(None); context,_=auth.login(pre,'student','another long password')
    with pytest.raises(AuthError): auth.update_user(student['principal_id'],{'role':'ADMIN'},actor=context)
    auth.update_user(student['principal_id'],{'role':'INSTRUCTOR'},actor=admin)
    assert not auth.session_active(context.session_id)


def test_explicit_guest_claim_transfers_operations_and_rotates_without_active_lease():
    auth=service(); auth.bootstrap_admin('teacher','sufficiently long password')
    guest,guest_cookie=auth.ensure_session(None)
    auth.repo.create_experiment(guest.owner_id,{'experiment_id':'created','state':'CREATED'})
    auth.repo.begin_operation(guest.owner_id,'run','once','created','fingerprint')
    admin,cookie=auth.login(guest,'teacher','sufficiently long password')
    assert auth.repo.owner('created')==guest.owner_id and auth.view(admin)['claim_available']
    claimed,rotated=auth.claim_guest(admin,True)
    assert auth.repo.owner('created')==admin.principal_id
    assert auth.repo.operation(admin.principal_id,'run','once','created')['status']=='REQUESTED'
    assert rotated!=cookie and auth.current(cookie) is None and auth.current(guest_cookie) is None
    assert not auth.view(claimed)['claim_available']


def test_guest_claim_rejects_quarantined_lease_and_conflicting_operation_atomically():
    from app.services.auth import AuthError
    auth=service(); auth.bootstrap_admin('teacher','sufficiently long password')
    guest,_=auth.ensure_session(None)
    auth.repo.create_experiment(guest.owner_id,{'experiment_id':'done','state':'COMPLETE'})
    # Seed a retained pre-recovery quarantine. New terminal reservations are
    # correctly refused; historical quarantine must still block guest claim.
    from sqlalchemy import insert
    with auth.repo.engine.begin() as db:
        db.execute(insert(auth.repo.lease_table).values(station_id='station',slot=0,experiment_id='done',expires_at=0,quarantined=True))
    admin,_=auth.login(guest,'teacher','sufficiently long password')
    with pytest.raises(AuthError,match='GUEST_CLAIM_ACTIVE_LEASE'): auth.claim_guest(admin,True)
    assert auth.repo.owner('done')==guest.owner_id and auth.session_active(admin.session_id)
    assert auth.repo.leases()[0]['quarantined'] is True
    auth.repo.release('done')
    auth.repo.begin_operation(guest.owner_id,'create','collision','','a')
    auth.repo.begin_operation(admin.owner_id,'create','collision','','b')
    with pytest.raises(AuthError,match='GUEST_CLAIM_CONFLICT'): auth.claim_guest(admin,True)
    assert auth.repo.owner('done')==guest.owner_id
    assert auth.repo.operation(guest.owner_id,'create','collision')['_fingerprint']=='a'
    assert auth.repo.operation(admin.owner_id,'create','collision')['_fingerprint']=='b'
    assert auth.session_active(admin.session_id)


def test_unknown_username_rotation_cannot_bypass_address_login_limit():
    from app.services.auth import AuthError
    auth=service(); context,_=auth.ensure_session(None)
    for index in range(auth.config.login_limit):
        with pytest.raises(AuthError,match='INVALID_CREDENTIALS'): auth.login(context,f'unknown{index}','irrelevant password','same-address')
    with pytest.raises(AuthError,match='RATE_LIMITED'): auth.login(context,'another-user','irrelevant password','same-address')


def test_assignment_insert_and_owner_policy_are_atomic():
    from sqlalchemy.exc import IntegrityError
    auth=service()
    value={'schema_version':'1.0','assignment_id':'atomic','title':'Atomic assignment','lab_endpoints':[],'assessment_policy':'FUNCTIONAL_ONLY'}
    with pytest.raises((IntegrityError,ValueError)): auth.repo.create_assignment(value,owner_id='missing-principal')
    with pytest.raises(KeyError): auth.repo.get_assignment('atomic')


def test_revoked_context_cannot_repeat_login_logout_claim_or_admin_mutations():
    from app.services.auth import AuthError
    auth=service(); auth.bootstrap_admin('teacher','sufficiently long password')
    guest,_=auth.ensure_session(None)
    admin,_=auth.login(guest,'teacher','sufficiently long password')
    for action in (lambda:auth.login(guest,'teacher','sufficiently long password'),lambda:auth.logout(guest)):
        with pytest.raises(AuthError,match='SESSION_EXPIRED'): action()
    claimed,_=auth.claim_guest(admin,True)
    with pytest.raises(AuthError,match='SESSION_EXPIRED'): auth.claim_guest(admin,True)
    auth.logout(claimed)
    with pytest.raises(AuthError,match='SESSION_EXPIRED'):
        auth.create_user('new-user','another long password',actor=claimed)


def test_admin_authority_is_rechecked_after_password_hash_work(monkeypatch):
    from app.services.auth import AuthError
    auth=service(); auth.bootstrap_admin('teacher','sufficiently long password')
    guest,_=auth.ensure_session(None); admin,_=auth.login(guest,'teacher','sufficiently long password')
    original=auth.hasher.hash
    def revoked_during_hash(password):
        result=original(password); auth.logout(admin); return result
    from types import SimpleNamespace
    monkeypatch.setattr(auth,'hasher',SimpleNamespace(hash=revoked_during_hash))
    with pytest.raises(AuthError,match='SESSION_EXPIRED'):
        auth.create_user('new-user','another long password',actor=admin)
    with auth.repo.engine.connect() as db:
        assert db.execute(select(auth.repo.auth_users).where(auth.repo.auth_users.c.username=='new-user')).first() is None


def test_concurrent_login_consumes_guest_proof_only_once(monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from types import SimpleNamespace
    from app.services.auth import AuthError
    auth=service(); auth.bootstrap_admin('teacher','sufficiently long password')
    guest,_=auth.ensure_session(None); hasher=auth.hasher; barrier=Barrier(2)
    def verify(*args):
        result=hasher.verify(*args); barrier.wait(timeout=10); return result
    monkeypatch.setattr(auth,'hasher',SimpleNamespace(verify=verify,hash=hasher.hash,check_needs_rehash=hasher.check_needs_rehash))
    def attempt():
        try: return auth.login(guest,'teacher','sufficiently long password')
        except AuthError as error: return error
    with ThreadPoolExecutor(max_workers=2) as pool: results=list(pool.map(lambda _:attempt(),range(2)))
    accepted=[result for result in results if isinstance(result,tuple)]
    rejected=[result for result in results if isinstance(result,AuthError)]
    assert len(accepted)==len(rejected)==1 and rejected[0].code=='SESSION_EXPIRED'
    assert accepted[0][0].claimable_guest_id==guest.principal_id


def test_invalid_cookie_replacement_is_explicit_but_real_legacy_exchange_is_not():
    from sqlalchemy import insert
    auth=service(); fresh,cookie=auth.ensure_session(None)
    assert fresh.replaced_invalid_cookie is False
    assert auth.ensure_session(cookie)[0].replaced_invalid_cookie is False
    invalid,replacement=auth.ensure_session('invalid-cookie')
    assert invalid.replaced_invalid_cookie is True and replacement
    assert 'replaced_invalid_cookie' not in auth.view(invalid)
    with auth.repo.engine.begin() as db:
        db.execute(insert(auth.repo.sessions).values(session_id='valid-legacy',expires_at=auth.clock()+1000))
    exchanged,rotated=auth.ensure_session('valid-legacy')
    assert exchanged.replaced_invalid_cookie is False and exchanged.owner_id=='valid-legacy'
    assert rotated!='valid-legacy'
    replayed,_=auth.ensure_session('valid-legacy')
    assert replayed.replaced_invalid_cookie is True
    auth.logout(fresh)
    assert auth.ensure_session(cookie)[0].replaced_invalid_cookie is True


def test_unconsumed_legacy_read_context_never_outlives_its_ownership_proof():
    from sqlalchemy import insert
    auth=service();now=[1000.0];auth.clock=lambda:now[0]
    try:
        with auth.repo.engine.begin() as db:
            db.execute(insert(auth.repo.sessions).values(session_id='bounded-legacy-read',expires_at=1100))
        context,_=auth.ensure_session('bounded-legacy-read',consume_legacy=False)
        expiry_matches=context.expires_at==1100
        assert expiry_matches,'Internal read authority cannot outlive the unconsumed proof.'
        assert auth.session_active(context.session_id)
        with auth.repo.engine.connect() as db:
            assert db.execute(select(auth.repo.sessions.c.session_id)).scalar()=='bounded-legacy-read'
        now[0]=1101
        assert not auth.session_active(context.session_id)
        assert auth.ensure_session('bounded-legacy-read')[0].replaced_invalid_cookie
    finally:auth.repo.close()


def test_disabling_guests_revokes_previously_persisted_guest_authority():
    from app.services.auth import AuthService
    enabled=service(); guest,cookie=enabled.ensure_session(None)
    disabled=AuthService(enabled.repo,Settings(allow_guest=False))
    assert disabled.current(cookie) is None
    assert disabled.session_active(guest.session_id) is False
    prelogin,replacement=disabled.ensure_session(cookie)
    assert prelogin.principal_id is None and prelogin.owner_id is None
    assert prelogin.replaced_invalid_cookie is True and replacement!=cookie


def test_no_guest_application_rejects_a_persisted_development_guest_cookie():
    from fastapi.testclient import TestClient
    from app.main import create_app
    from test_lab_lifecycle import LabGateway,DeferredJobs
    enabled=service(); _,cookie=enabled.ensure_session(None)
    application=create_app(repository=enabled.repo,gateway=LabGateway(),submit=DeferredJobs(),configuration=Settings(allow_guest=False))
    with TestClient(application) as client:
        client.cookies.set('netcircuit_session',cookie,domain='testserver.local',path='/')
        response=client.get('/api/stations')
        assert response.status_code==401 and response.json()['code']=='SESSION_EXPIRED'
        current=client.get('/api/auth/session')
        assert current.status_code==200 and current.json()['principal'] is None
        assert client.get('/api/stations').status_code==401
