"""Legacy API tests use the same CSRF handshake and control context as a browser.

Security rejection tests deliberately import FastAPI's unwrapped TestClient.
This helper never changes production policy or grants an authenticated role.
"""
from contextlib import contextmanager
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient


class CsrfTestClient(TestClient):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.control_client_id = uuid4().hex

    def browser_headers(self):
        url = urlsplit(str(self.base_url))
        origin = f'{url.scheme}://{url.netloc}'
        response = super().request('GET', '/api/auth/session', headers={'Origin': origin})
        assert response.status_code == 200, response.text
        return {'Origin': origin, 'X-CSRF-Token': response.json()['csrf_token'],
                'X-Control-Client': self.control_client_id}

    def request(self, method, url, **kwargs):
        if method.upper() not in {'GET', 'HEAD', 'OPTIONS'}:
            headers = httpx.Headers(self.browser_headers())
            headers.update(kwargs.pop('headers', None) or {})
            kwargs['headers'] = headers
        return super().request(method, url, **kwargs)

    @contextmanager
    def websocket_connect(self, url, **kwargs):
        headers = httpx.Headers(self.browser_headers())
        headers.update(kwargs.pop('headers', None) or {})
        kwargs['headers'] = dict(headers)
        with super().websocket_connect(url, **kwargs) as websocket:
            websocket.send_json({'type': 'client.hello', 'protocol_version': '1.0',
                                 'control_client_id': self.control_client_id})
            yield websocket


def login_admin(client, username='fixture-admin', password='fixture admin password'):
    """Create the test's first admin explicitly, then use the public login route."""
    client.app.state.auth.bootstrap_admin(username, password)
    response = client.post('/api/auth/login', json={'username': username, 'password': password})
    assert response.status_code == 200, response.text
    return client.app.state.auth.current(client.cookies.get('netcircuit_session'))


def publish_fixture_assignment(application, value):
    """Repository seeding is deliberate; HTTP authoring tests use login_admin."""
    author = application.state.auth.bootstrap_admin('fixture-author', 'fixture author password')
    application.state.repository.create_assignment(value)
    application.state.repository.publish_assignment(value['assignment_id'], author['principal_id'])
