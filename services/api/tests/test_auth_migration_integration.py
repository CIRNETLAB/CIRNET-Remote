"""Legacy data stays private until its actual session owner explicitly claims it."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import time

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, select

from app.db import schema
from app.main import create_app
from app.services.capture_store import FilesystemCaptureStore
from app.services.captures import CaptureService
from app.services.persistence import Repository
from test_auth_security import browser_headers, login
from test_lab_lifecycle import LabGateway, DeferredJobs, assignment
from test_realtime_protocol import record


def legacy_database(tmp_path):
    path = tmp_path / 'pre-auth.sqlite'
    engine = create_engine('sqlite:///' + path.as_posix())
    store = FilesystemCaptureStore(tmp_path / 'captures')
    capture = CaptureService(store=store).persist(
        {'available': True, 'samples': [{'signal': 'y', 'time_ns': 0, 'value': 1}]}, 'hardware')
    completed = {**record(7), 'experiment_id': 'legacy-owned', 'station_id': 'p1', 'mode': 'hardware',
                 'assignment_id': 'a1', 'state': 'COMPLETE', 'state_history': ['CREATED', 'COMPLETE'],
                 'capture': capture}
    orphan = {**deepcopy(completed), 'experiment_id': 'legacy-orphan', 'capture': None}
    quarantine = {**deepcopy(orphan), 'experiment_id': 'legacy-quarantine', 'state': 'FAULT',
                  'state_history': ['CREATED', 'FAULT'], 'error_code': 'SAFE_STATE_FAILED'}
    operation = {'schema_version': '1.0', 'operation_key': 'legacy-create', 'kind': 'create',
                 'status': 'APPLIED', 'experiment_id': 'legacy-owned', 'error_code': None, 'revision': 1}
    with engine.begin() as db:
        for table in schema.LEGACY: table.create(db)
        db.execute(insert(schema.assignments).values(assignment_id='a1', payload=assignment()))
        for owner, value in [('legacy-owner-cookie', completed), ('expired-orphan', orphan),
                             ('quarantine-orphan', quarantine)]:
            db.execute(insert(schema.experiments).values(experiment_id=value['experiment_id'], owner_id=owner, payload=value))
        db.execute(insert(schema.sessions).values(session_id='legacy-owner-cookie', expires_at=time.time() + 3600))
        db.execute(insert(schema.operations).values(owner_id='legacy-owner-cookie', kind='create', scope='',
                    operation_key='legacy-create', fingerprint='unchanged-fingerprint', payload=operation))
        db.execute(insert(schema.leases).values(station_id='p1', slot=0, experiment_id='legacy-quarantine',
                    expires_at=0.0, quarantined=True))
    engine.dispose()
    return path, store, completed, orphan, quarantine, operation


def test_migration_preserves_payloads_capture_operations_and_quarantine_without_claiming_orphans(tmp_path):
    path, store, completed, orphan, quarantine, operation = legacy_database(tmp_path)
    for _ in range(2):
        repository = Repository('sqlite:///' + path.as_posix())
        assert repository.get_experiment('legacy-owned') == completed
        assert repository.get_experiment('legacy-orphan') == orphan
        assert repository.get_experiment('legacy-quarantine') == quarantine
        assert repository.owner('legacy-orphan') == 'expired-orphan'
        assert repository.leases() == [{'station_id': 'p1', 'slot': 0,
            'experiment_id': 'legacy-quarantine', 'expires_at': 0.0, 'quarantined': True}]
        assert repository.operation('legacy-owner-cookie', 'create', 'legacy-create') == {
            **operation, '_fingerprint': 'unchanged-fingerprint'}
        assert repository.get_assignment('a1') == assignment()
        assert repository.assignment_policy('a1')['published'] is False
        assert store.get(completed['capture']).startswith(b'NCAP')
        repository.close()


def test_real_legacy_cookie_claims_only_its_data_and_operation_after_login(tmp_path):
    path, store, completed, _, _, _ = legacy_database(tmp_path)
    repository = Repository('sqlite:///' + path.as_posix())
    # This test isolates ownership migration; the quarantined slot remains
    # private and reserved, while the independent owner's completed data moves.
    gateway = LabGateway()
    original = gateway.call
    def unacknowledged_cleanup(station, eid, method, **kwargs):
        if eid == 'legacy-quarantine' and method == 'stop_execution':
            return {'accepted': False, 'hardware_applied': False}
        return original(station, eid, method, **kwargs)
    gateway.call = unacknowledged_cleanup
    application = create_app(repository=repository, gateway=gateway, submit=DeferredJobs(), capture_store=store)
    application.state.auth.bootstrap_admin('admin', 'administrator password')
    with TestClient(application) as owner, TestClient(application) as stranger:
        owner.cookies.set('netcircuit_session', 'legacy-owner-cookie', domain='testserver.local', path='/')
        assert owner.get('/api/experiments/legacy-owned').status_code == 200
        assert owner.cookies.get('netcircuit_session') == 'legacy-owner-cookie'
        with repository.engine.connect() as db:
            assert db.execute(select(repository.sessions.c.session_id)).scalar()=='legacy-owner-cookie'
        payload_path='/api/captures/'+completed['capture']['capture_id']+'/payload'
        assert owner.get(payload_path).content==store.get(completed['capture'])
        assert owner.cookies.get('netcircuit_session')=='legacy-owner-cookie'
        assert owner.get('/api/auth/session').status_code==200
        assert owner.cookies.get('netcircuit_session') != 'legacy-owner-cookie'
        assert stranger.get('/api/experiments/legacy-owned').status_code == 403
        login(owner, 'admin', 'administrator password')
        assert owner.get('/api/experiments/legacy-owned').status_code == 403
        response = owner.post('/api/auth/claim-guest', json={'confirm': True}, headers=browser_headers(owner))
        assert response.status_code == 200, response.text
        principal = application.state.auth.current(owner.cookies.get('netcircuit_session')).principal_id
        assert repository.owner('legacy-owned') == principal
        assert repository.owner('legacy-orphan') == 'expired-orphan'
        assert repository.owner('legacy-quarantine') == 'quarantine-orphan'
        assert repository.leases()[0]['quarantined'] is True
        assert owner.get('/api/operations/legacy-create').status_code == 200
        path = '/api/captures/' + completed['capture']['capture_id'] + '/payload'
        assert owner.get(path).content == store.get(completed['capture'])
        assert stranger.get(path).status_code == 403
        with repository.engine.connect() as db:
            assert db.execute(select(repository.operations.c.owner_id)).scalar() == principal


def test_held_legacy_read_cannot_consume_claim_proof_or_overwrite_completed_login(tmp_path,monkeypatch):
    path,store,completed,_,_,_=legacy_database(tmp_path)
    repository=Repository('sqlite:///'+path.as_posix())
    application=create_app(repository=repository,gateway=LabGateway(),submit=DeferredJobs(),capture_store=store)
    application.state.auth.bootstrap_admin('admin','administrator password')
    entered=Event();release=Event();original=application.state.auth.ensure_session
    def held(cookie,**kwargs):
        value=original(cookie,**kwargs)
        if cookie=='legacy-owner-cookie' and kwargs.get('consume_legacy') is False:
            entered.set();assert release.wait(10)
        return value
    monkeypatch.setattr(application.state.auth,'ensure_session',held)
    with TestClient(application) as owner,ThreadPoolExecutor(max_workers=1) as pool:
        owner.cookies.set('netcircuit_session','legacy-owner-cookie',domain='testserver.local',path='/')
        pending=pool.submit(owner.get,'/api/health')
        try:
            assert entered.wait(2),'The ordinary legacy read must defer proof consumption.'
            with repository.engine.connect() as db:
                assert db.execute(select(repository.sessions.c.session_id)).scalar()=='legacy-owner-cookie'
            current=login(owner,'admin','administrator password')
            claimed=owner.post('/api/auth/claim-guest',json={'confirm':True},headers=browser_headers(owner))
            assert claimed.status_code==200
            installed=owner.cookies.get('netcircuit_session')
        finally:release.set()
        response=pending.result(timeout=5)
        assert response.status_code==200
        emitted='set-cookie' in response.headers
        assert not emitted,'A held legacy read cannot install a stale credential.'
        unchanged=owner.cookies.get('netcircuit_session')==installed
        assert unchanged,'The late legacy response must preserve the completed login/claim cookie.'
        resolved=application.state.auth.current(owner.cookies.get('netcircuit_session'))
        assert resolved and resolved.authenticated and resolved.principal_id==current.principal_id
        assert repository.owner('legacy-owned')==current.principal_id
        assert owner.get('/api/operations/legacy-create').status_code==200
        assert owner.get('/api/captures/'+completed['capture']['capture_id']+'/payload').content==store.get(completed['capture'])
        assert repository.owner('legacy-orphan')=='expired-orphan'


def test_legacy_capture_read_rechecks_internal_session_after_confirmed_claim(tmp_path,monkeypatch):
    path,store,completed,_,_,_=legacy_database(tmp_path)
    repository=Repository('sqlite:///'+path.as_posix())
    application=create_app(repository=repository,gateway=LabGateway(),submit=DeferredJobs(),capture_store=store)
    application.state.auth.bootstrap_admin('admin','administrator password')
    entered=Event();release=Event();original=store.get
    def held(metadata):
        payload=original(metadata)
        if not entered.is_set():entered.set();assert release.wait(10)
        return payload
    monkeypatch.setattr(store,'get',held)
    payload_path='/api/captures/'+completed['capture']['capture_id']+'/payload'
    with TestClient(application) as owner,ThreadPoolExecutor(max_workers=1) as pool:
        owner.cookies.set('netcircuit_session','legacy-owner-cookie',domain='testserver.local',path='/')
        pending=pool.submit(owner.get,payload_path)
        try:
            assert entered.wait(2)
            current=login(owner,'admin','administrator password')
            response=owner.post('/api/auth/claim-guest',json={'confirm':True},headers=browser_headers(owner))
            assert response.status_code==200
            installed=owner.cookies.get('netcircuit_session')
        finally:release.set()
        rejected=pending.result(timeout=5)
        assert rejected.status_code==401 and rejected.json()['code']=='SESSION_EXPIRED'
        emitted='set-cookie' in rejected.headers
        assert not emitted,'Revocation during byte I/O cannot install an obsolete credential.'
        unchanged=owner.cookies.get('netcircuit_session')==installed
        assert unchanged
        assert repository.owner('legacy-owned')==current.principal_id
        assert owner.get(payload_path).content==original(completed['capture'])
