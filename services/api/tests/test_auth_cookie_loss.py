"""Invalid supplied credentials must signal loss before any guest fallback."""
import pytest
from fastapi.testclient import TestClient
from test_auth_security import security_application,login,browser_headers


@pytest.mark.parametrize('credential',['revoked-guest','absent'])
def test_late_prelogin_read_cannot_replace_a_successful_login_cookie(security_application,credential):
    with TestClient(security_application) as client:
        if credential=='revoked-guest':client.get('/api/auth/session')
        # Preserve the exact credentials of a read prepared before rotation,
        # then deliver it after the login response reached the browser jar.
        pending=client.build_request('GET','/api/health')
        current=login(client)
        installed=client.cookies.get('netcircuit_session')
        response=client.send(pending)
        assert response.status_code==(401 if credential=='revoked-guest' else 200)
        if credential=='revoked-guest':assert response.json()['code']=='SESSION_EXPIRED'
        replaced=client.cookies.get('netcircuit_session')!=installed
        assert not replaced,'A late ordinary read replaced the newly authenticated cookie.'
        emitted_cookie='set-cookie' in response.headers
        assert not emitted_cookie,'Only explicit session bootstrap/rotation may install credentials.'
        resolved=security_application.state.auth.current(client.cookies.get('netcircuit_session'))
        assert resolved is not None and resolved.authenticated and resolved.principal_id==current.principal_id


@pytest.mark.parametrize('path',['/api/health','/api/experiments'])
def test_revoked_cookie_signals_session_loss_even_in_guest_development(security_application,path):
    with TestClient(security_application) as client:
        context=login(client)
        previous=client.cookies.get('netcircuit_session')
        security_application.state.auth.logout(context)
        response=client.get(path)
        assert response.status_code==401 and response.json()['code']=='SESSION_EXPIRED'
        unchanged=client.cookies.get('netcircuit_session')==previous
        assert unchanged,'Expiry rejection must leave cookie installation to explicit bootstrap.'
        assert 'set-cookie' not in response.headers
        session=client.get('/api/auth/session')
        assert session.status_code==200 and not session.json()['authenticated']
        assert session.json()['principal']['principal_id']!=context.principal_id
        changed=client.cookies.get('netcircuit_session')!=previous
        assert changed,'Explicit bootstrap must replace the revoked credential.'


def test_expired_mutation_is_unauthenticated_before_replacing_old_csrf(security_application):
    with TestClient(security_application) as client:
        context=login(client)
        headers=browser_headers(client)
        security_application.state.auth.clock=lambda:context.expires_at+1
        response=client.post('/api/experiments',headers=headers,json={'station_id':'p1','assignment_id':'a1'})
        assert response.status_code==401 and response.json()['code']=='SESSION_EXPIRED'
        assert not security_application.state.repository.list_experiments(context.owner_id)


def test_cross_site_post_without_lax_cookie_cannot_overwrite_a_browser_login(security_application):
    with TestClient(security_application) as client:
        # A cross-site top-level POST omits an existing SameSite=Lax cookie.
        # Even the rejection response must not issue a replacement credential.
        response=client.post('/api/auth/logout',json={},headers={'Origin':'https://evil.invalid'})
        assert response.status_code==403 and response.json()['code']=='ORIGIN_REJECTED'
        assert 'set-cookie' not in response.headers
