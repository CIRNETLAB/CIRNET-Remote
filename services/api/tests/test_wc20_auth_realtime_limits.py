"""WC20 bounded unauthenticated ingress and realtime regressions."""
import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import Settings
from app.main import create_app
from app.services.events import EventHub
from app.services.persistence import Repository
from test_lab_lifecycle import DeferredJobs, LabGateway


@pytest.mark.parametrize('allow_guest', [True, False])
@pytest.mark.parametrize('requests', [20,1000])
def test_health_and_missing_credentials_do_not_allocate_auth_rows(tmp_path, allow_guest,requests):
    repo = Repository('sqlite:///' + str(tmp_path / 'auth.db'))
    app = create_app(repository=repo, gateway=LabGateway(), submit=DeferredJobs(),
                     configuration=Settings(allow_guest=allow_guest))
    with repo.engine.connect() as db:
        principals=db.scalar(select(func.count()).select_from(repo.auth_principals))
    with TestClient(app) as client:
        for _ in range(requests):
            response = client.get('/api/health')
            assert response.status_code == 200
            assert 'set-cookie' not in response.headers
        response = client.get('/api/stations')
        assert response.status_code == 401
        with repo.engine.connect() as db:
            assert db.scalar(select(func.count()).select_from(repo.auth_sessions)) == 0
            assert db.scalar(select(func.count()).select_from(repo.auth_principals)) == principals
        assert client.get('/api/auth/session').status_code == 200
        with repo.engine.connect() as db:
            assert db.scalar(select(func.count()).select_from(repo.auth_sessions)) == 1


def test_burst_publications_schedule_only_one_bounded_drain(monkeypatch):
    async def check():
        hub = EventHub()
        token, queue = hub.subscribe('owner', session_id='session')
        loop = asyncio.get_running_loop()
        original = loop.call_soon_threadsafe
        scheduled = []
        def schedule(callback, *args, **kwargs):
            scheduled.append(callback)
            return original(callback, *args, **kwargs)
        monkeypatch.setattr(loop, 'call_soon_threadsafe', schedule)
        for revision in range(1001):
            hub.publish('owner', {'type': 'station.updated', 'station': {'station_id': 's1', 'revision': revision}})
        assert len(scheduled) <= 1
        assert hub.metrics()['ingress_events'] <= 128
        assert hub.metrics()['retained_bytes'] <= 1024 * 1024
        await asyncio.sleep(0)
        messages = []
        while not queue.empty():
            messages.append(queue.get_nowait())
        assert any(event['type'] == 'resync.required' for event in messages)
        assert messages[-1]['station']['revision'] == 1000
        hub.unsubscribe(token)
        assert hub.metrics()['retained_bytes'] == 0
    asyncio.run(check())


@pytest.mark.parametrize('body,expected', [
    (b'['*65+b'0'+b']'*65,'REQUEST_COMPLEXITY_EXCEEDED'),
    (b' '* (4*1024*1024+1),'REQUEST_TOO_LARGE'),
],ids=['depth','bytes'])
def test_request_ingress_caps_unknown_chunked_lengths_before_auth_or_parse(tmp_path,body,expected):
    repo=Repository('sqlite:///'+str(tmp_path/'body.db'))
    app=create_app(repository=repo,gateway=LabGateway(),submit=DeferredJobs())
    with TestClient(app) as client:
        response=client.post('/api/experiments',content=(body[index:index+8192] for index in range(0,len(body),8192)),
                             headers={'Content-Type':'application/json','Origin':'http://testserver'})
        assert response.status_code==400
        assert response.json()['code']==expected
        with repo.engine.connect() as db:
            assert db.scalar(select(func.count()).select_from(repo.auth_sessions))==0


def test_auth_maintenance_is_batched_and_retains_owner_identity(tmp_path):
    from sqlalchemy import update
    repo=Repository('sqlite:///'+str(tmp_path/'maintenance.db'))
    config=Settings(auth_maintenance_batch=2,auth_retention_seconds=60)
    app=create_app(repository=repo,gateway=LabGateway(),submit=DeferredJobs(),configuration=config)
    auth=app.state.auth
    with repo.engine.connect() as db:
        principals=db.scalar(select(func.count()).select_from(repo.auth_principals))
    for _ in range(5):auth.ensure_session(None)
    with repo.engine.begin() as db:
        db.execute(update(repo.auth_sessions).values(expires_at=0,revoked=True))
    assert auth.maintain()['sessions_removed']==2
    with repo.engine.connect() as db:
        assert db.scalar(select(func.count()).select_from(repo.auth_sessions))==3
        assert db.scalar(select(func.count()).select_from(repo.auth_principals))==principals+5
    app.state.manager.close();repo.close()


def test_subscription_quota_and_closed_loop_cannot_retain_control():
    from app.services.events import SubscriptionLimit
    hub=EventHub(maximum_per_session=1)
    async def subscribe():
        token,_=hub.subscribe('owner',session_id='session')
        hub.bind_control(token,'control')
        with pytest.raises(SubscriptionLimit):hub.subscribe('owner',session_id='session')
    asyncio.run(subscribe())
    assert not hub.has_control('owner','session','control')
    hub.publish('owner',{'type':'station.updated','station':{'station_id':'s1'}})
    assert hub.metrics()['subscriptions']==0


def test_outgoing_event_keeps_byte_reservation_until_delivery_or_disconnect():
    async def check():
        hub=EventHub();token,queue=hub.subscribe('owner')
        queue.account_delivery=True
        hub.publish('owner',{'type':'station.updated','station':{'station_id':'s1'}})
        await asyncio.sleep(0)
        value=await queue.get()
        assert value['type']=='station.updated'
        assert hub.metrics()['retained_bytes']>0
        queue.release_delivery()
        assert hub.metrics()['retained_bytes']==0
        hub.unsubscribe(token)
    asyncio.run(check())


def test_bootstrap_creation_is_address_limited_and_reuse_is_not(tmp_path):
    repo=Repository('sqlite:///'+str(tmp_path/'bootstrap.db'))
    app=create_app(repository=repo,gateway=LabGateway(),submit=DeferredJobs(),configuration=Settings(bootstrap_limit=2))
    with TestClient(app) as client:
        assert client.get('/api/auth/session').status_code==200
        for _ in range(4):assert client.get('/api/auth/session').status_code==200
        client.cookies.clear()
        assert client.get('/api/auth/session').status_code==200
        client.cookies.clear()
        response=client.get('/api/auth/session')
        assert response.status_code==429 and response.json()['code']=='RATE_LIMITED'


def test_content_length_digit_limit_and_false_lengths_remain_bounded(tmp_path):
    repo=Repository('sqlite:///'+str(tmp_path/'length.db'))
    app=create_app(repository=repo,gateway=LabGateway(),submit=DeferredJobs())
    with TestClient(app) as client:
        response=client.post('/api/experiments',content=b'{}',headers={'Content-Length':'9'*5000})
        assert response.status_code==400 and response.json()['code']=='REQUEST_TOO_LARGE'
        response=client.post('/api/experiments',content=b' '* (4*1024*1024+1),headers={'Content-Length':'2'})
        assert response.status_code==400 and response.json()['code']=='REQUEST_TOO_LARGE'


@pytest.mark.parametrize('nonreading', [True,False])
def test_socket_send_or_hello_timeout_releases_subscription(tmp_path,nonreading):
    from starlette.websockets import WebSocket
    from app.websocket.events import events_socket
    repo=Repository('sqlite:///'+str(tmp_path/'socket.db'))
    config=Settings(websocket_handshake_seconds=0.5,websocket_send_seconds=0.05)
    app=create_app(repository=repo,gateway=LabGateway(),submit=DeferredJobs(),configuration=config)
    _,cookie=app.state.auth.ensure_session(None)
    async def check():
        sent=[]
        async def receive():await asyncio.Event().wait()
        async def send(message):
            if nonreading and message['type']=='websocket.send':await asyncio.Event().wait()
            sent.append(message)
        socket=WebSocket({'type':'websocket','path':'/ws/events','app':app,
            'headers':[(b'origin',b'http://testserver'),(b'cookie',('netcircuit_session='+cookie).encode())]},receive,send)
        # Starlette consumes the ASGI connection message during accept().
        connected=False
        async def incoming():
            nonlocal connected
            if not connected:connected=True;return {'type':'websocket.connect'}
            return await receive()
        socket._receive=incoming
        await asyncio.wait_for(events_socket(socket),2)
        assert app.state.events.metrics()['subscriptions']==0
        assert any(message['type']=='websocket.close' and message['code']==4408 for message in sent)
    asyncio.run(check())
    app.state.manager.close();repo.close()


@pytest.mark.parametrize('revoked',[False,True],ids=['expired','revoked'])
def test_legacy_read_context_ttl_does_not_insert_duplicate_or_resurrect_authority(tmp_path,revoked):
    from sqlalchemy import insert,update
    repo=Repository('sqlite:///'+str(tmp_path/'legacy-ttl.db'))
    app=create_app(repository=repo,gateway=LabGateway(),submit=DeferredJobs(),
        configuration=Settings(session_ttl_seconds=60,auth_retention_seconds=0))
    now=[1000.0];auth=app.state.auth;auth.clock=lambda:now[0]
    with repo.engine.begin() as db:db.execute(insert(repo.sessions).values(session_id='legacy-proof',expires_at=4600))
    with TestClient(app) as client:
        client.cookies.set('netcircuit_session','legacy-proof',domain='testserver.local',path='/')
        assert client.get('/api/health').status_code==200
        with repo.engine.connect() as db:original=dict(db.execute(select(repo.auth_sessions)).mappings().one())
        if revoked:
            with repo.engine.begin() as db:db.execute(update(repo.auth_sessions).values(revoked=True))
        now[0]=1061
        response=client.get('/api/health')
        assert response.status_code==401 and response.json()['code']=='SESSION_EXPIRED'
        assert 'set-cookie' not in response.headers
        # Maintenance must retain a revocation/expiry fence while the same
        # still-live legacy proof could otherwise recreate this internal ID.
        auth.maintain()
        response=client.get('/api/health')
        assert response.status_code==401 and response.json()['code']=='SESSION_EXPIRED'
        with repo.engine.connect() as db:
            current=dict(db.execute(select(repo.auth_sessions)).mappings().one())
            assert current['session_id']==original['session_id']
            assert current['expires_at']==original['expires_at']
            assert current['revoked']==revoked
        # Explicit bootstrap can still consume the original ownership proof;
        # an ordinary failed read neither consumes it nor allocates a cookie.
        response=client.get('/api/auth/session')
        assert response.status_code==200 and response.json()['principal']['principal_id']=='legacy-proof'
        assert client.cookies.get('netcircuit_session')!='legacy-proof'

