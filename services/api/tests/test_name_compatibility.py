"""Current identifiers keep the existing session, configuration and payload ABI."""
from types import SimpleNamespace
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select, update

from app.compatibility import (
    CAPTURE_MEDIA_TYPE, LEGACY_CAPTURE_MEDIA_TYPE, default_database_url,
    getenv, session_cookie,
)
from app.config import Settings
from app.main import create_app
from app.services.persistence import Repository
from app.services.auth import AuthService


def test_current_environment_wins_and_old_environment_remains_readable(monkeypatch):
    monkeypatch.delenv('CIRNET_CAPTURE_MAX_FILES', raising=False)
    monkeypatch.setenv('NETCIRCUIT_CAPTURE_MAX_FILES', '42')
    assert getenv('CIRNET_CAPTURE_MAX_FILES') == '42'
    monkeypatch.setenv('CIRNET_CAPTURE_MAX_FILES', '')
    assert getenv('NETCIRCUIT_CAPTURE_MAX_FILES') == ''


def test_existing_database_is_selected_without_renaming_user_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    legacy = tmp_path / 'netcircuit.db'
    legacy.write_bytes(b'preserved legacy database')
    assert default_database_url() == 'sqlite:///./netcircuit.db'
    (tmp_path / 'cirnet.db').write_bytes(b'current database')
    assert default_database_url() == 'sqlite:///./cirnet.db'
    assert legacy.read_bytes() == b'preserved legacy database'


def test_session_cookie_priority_never_revives_a_stale_legacy_login():
    assert session_cookie({'netcircuit_session': 'old'}) == 'old'
    assert session_cookie({'cirnet_session': 'invalid', 'netcircuit_session': 'valid'}) == 'invalid'


def test_current_worker_setting_overrides_the_legacy_setting(monkeypatch):
    monkeypatch.setenv('NETCIRCUIT_SIMULATION_WORKERS', '7')
    monkeypatch.setenv('CIRNET_SIMULATION_WORKERS', '2')
    assert Settings().simulation_workers == 2


@pytest.mark.parametrize('revoked', [False, True], ids=['expired', 'revoked'])
def test_upgrade_retains_preexisting_legacy_read_revocation_identity(revoked):
    repository = Repository('sqlite://')
    now = [1000.0]
    auth = AuthService(repository, Settings(session_ttl_seconds=60), clock=lambda: now[0])
    proof = 'persisted-legacy-proof'
    original_id = uuid.uuid5(uuid.NAMESPACE_URL, 'netcircuit-legacy-read:' + proof).hex
    try:
        with repository.engine.begin() as db:
            db.execute(insert(repository.sessions).values(session_id=proof, expires_at=4600))
            db.execute(insert(repository.auth_principals).values(principal_id=proof, kind='GUEST', created_at=1000))
            auth._new_session(db, proof, session_id=original_id, expires_at=4600)
            if revoked:
                db.execute(update(repository.auth_sessions).values(revoked=True))
        if not revoked:
            now[0] = 1061.0
        assert auth.ensure_session(proof, consume_legacy=False, allow_create=False) == (None, None)
        with repository.engine.connect() as db:
            assert db.execute(select(repository.auth_sessions.c.session_id)).scalars().all() == [original_id]
    finally:
        repository.close()


def test_both_session_names_and_csrf_headers_share_the_existing_auth_flow():
    application = create_app(repository=Repository('sqlite://'),
                             configuration=Settings(environment='test', allow_guest=True,
                                                    trusted_origins=('http://testserver',)))
    with TestClient(application) as client:
        preflight = client.options('/api/auth/logout', headers={
            'Origin': 'http://testserver', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'X-CIRNET-CSRF'})
        assert preflight.status_code == 200
        assert 'x-cirnet-csrf' in preflight.headers['access-control-allow-headers'].lower()
        session = client.get('/api/auth/session')
        assert session.status_code == 200
        assert client.cookies['cirnet_session'] == client.cookies['netcircuit_session']
        csrf = session.json()['csrf_token']
        client.cookies.delete('cirnet_session')
        restored = client.get('/api/auth/session')
        assert restored.status_code == 200 and restored.json()['csrf_token'] == csrf
        legacy = client.post('/api/auth/logout', json={}, headers={'Origin': 'http://testserver', 'X-CSRF-Token': csrf})
        assert legacy.status_code == 200
        assert client.cookies['cirnet_session'] == client.cookies['netcircuit_session']
        csrf = legacy.json()['csrf_token']
        rejected = client.post('/api/auth/logout', json={}, headers={
            'Origin': 'http://testserver', 'X-CIRNET-CSRF': 'invalid', 'X-CSRF-Token': csrf})
        assert rejected.status_code == 403 and rejected.json()['code'] == 'CSRF_REJECTED'
        current = client.post('/api/auth/logout', json={}, headers={'Origin': 'http://testserver', 'X-CIRNET-CSRF': csrf})
        assert current.status_code == 200


def test_capture_names_negotiate_the_same_binary_bytes():
    from app.api.captures import payload
    binary = b'NCAP-compatible-payload'
    state = SimpleNamespace(owner='owner', auth=SimpleNamespace(session_id='session'))
    manager = SimpleNamespace(capture_payload=lambda *args, **kwargs: binary)
    application = SimpleNamespace(state=SimpleNamespace(manager=manager))
    for requested, expected in ((CAPTURE_MEDIA_TYPE, CAPTURE_MEDIA_TYPE),
                                (LEGACY_CAPTURE_MEDIA_TYPE, LEGACY_CAPTURE_MEDIA_TYPE)):
        response = payload('capture', SimpleNamespace(headers={'accept': requested}, state=state, app=application))
        assert response.body == binary
        assert response.headers['content-type'] == expected
