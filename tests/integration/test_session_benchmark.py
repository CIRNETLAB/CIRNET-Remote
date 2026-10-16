"""Benchmark claims and limits must be checked before measuring real traffic."""
import pytest
from scripts.benchmark_web_sessions import LoginPacer,Metrics,validate_options,verify_digital_evidence,stop_owned_backend
from contracts.capture_codec import encode_digital
from hashlib import sha256


def test_latency_report_uses_observed_nearest_rank_and_does_not_invent_empty_timings():
    metrics=Metrics()
    assert metrics.report()=={}
    for index in range(1,21):metrics.record('read',index/1000,200,True)
    metrics.record('private-read',.002,403,True)
    result=metrics.report()
    assert result['read']=={'count':20,'unexpected':0,'status_counts':{'200':20},'p50_ms':10.0,'p95_ms':19.0,'p99_ms':20.0,'max_ms':20.0}
    assert result['private-read']['status_counts']=={'403':1} and result['private-read']['unexpected']==0


@pytest.mark.parametrize('values',[(29,10,8,3),(51,10,8,3),(50,0,8,3),(50,51,8,3),(50,10,17,3),(50,10,8,21),(True,1,1,1)])
def test_workload_cannot_silently_expand_outside_the_bounded_smoke(values):
    with pytest.raises(ValueError):validate_options(*values)


def test_synthetic_fixture_checks_the_benchmark_observation_assertion_not_a_runtime_fallback():
    samples=[{'signal':'G.Y1','time_ns':0,'value':'X'},{'signal':'G.Y1','time_ns':8,'value':0},{'signal':'G.Y1','time_ns':28,'value':1}]
    binary=encode_digital(samples,40)
    metadata={'source':'simulation','available':True,'sample_count':3,'payload_byte_count':len(binary),'sha256':sha256(binary).hexdigest()}
    assert verify_digital_evidence(metadata,binary)==3
    with pytest.raises(ValueError,match='CAPTURE_INTEGRITY'):verify_digital_evidence(metadata,binary+b'x')
    wrong=encode_digital(samples[:-1],40)
    with pytest.raises(ValueError,match='OBSERVATION_MISMATCH'):
        verify_digital_evidence({**metadata,'sample_count':2,'payload_byte_count':len(wrong),'sha256':sha256(wrong).hexdigest()},wrong)


def test_login_bootstrap_respects_one_shared_address_window_without_weakening_auth():
    now=[0.0];waits=[]
    def wait(seconds):waits.append(seconds);now[0]+=seconds
    pacer=LoginPacer(limit=2,window_seconds=60.25,clock=lambda:now[0],wait=wait)
    pacer.acquire();pacer.acquire();pacer.acquire()
    assert waits==[60.25] and now[0]>=60


def test_unresponsive_owned_process_is_reaped_after_the_graceful_shutdown_bound():
    import subprocess,sys
    import psutil
    process=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'],stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
    try:
        with pytest.raises(ValueError,match='OWNED_BACKEND_SHUTDOWN_DEADLINE'):
            stop_owned_backend(process,psutil,graceful_seconds=.05,force_seconds=.2)
        assert process.poll() is not None
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)


def test_process_inspection_denial_still_closes_and_reaps_the_owned_backend():
    import subprocess,sys
    from types import SimpleNamespace
    import psutil
    process=subprocess.Popen([sys.executable,'-c','import sys; sys.stdin.buffer.read()'],stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
    def denied(pid):raise psutil.AccessDenied(pid)
    restricted=SimpleNamespace(Process=denied,NoSuchProcess=psutil.NoSuchProcess,AccessDenied=psutil.AccessDenied,wait_procs=psutil.wait_procs)
    try:
        with pytest.raises(ValueError,match='OWNED_BACKEND_INSPECTION_DENIED'):
            stop_owned_backend(process,restricted,graceful_seconds=5)
        assert process.poll() is not None
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)


def test_real_uvicorn_idle_boundary_expires_benchmark_connection_before_reuse(monkeypatch):
    """Model descheduling after the pool's check across Uvicorn's real deadline.

    Both exchanges use real TCP and the unchanged five-second server policy.
    Only the scheduling point is injected: a stale availability decision is
    paused until after the server closes. Windows may report a reset ReadError
    rather than EOF RemoteProtocolError; neither failed request reaches ASGI.
    """
    import socket,threading,time
    import httpx,uvicorn
    from scripts.benchmark_web_sessions import Session
    counts={'default':0,'benchmark':0};ports={'default':set(),'benchmark':set()}
    completed={};cookie_preserved={}
    async def application(scope,receive,send):
        label=scope['path'].strip('/');counts[label]+=1;ports[label].add(scope['client'][1])
        cookie=('benchmark_boundary='+label).encode()
        if counts[label]>1:cookie_preserved[label]=cookie in dict(scope['headers']).get(b'cookie',b'')
        headers=[(b'content-type',b'application/json')]
        if counts[label]==1:headers.append((b'set-cookie',cookie+b'; Path=/; HttpOnly'))
        await send({'type':'http.response.start','status':200,'headers':headers})
        await send({'type':'http.response.body','body':b'{"ok":true}'})
        completed.setdefault(label,time.monotonic())
    listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(128)
    port=listener.getsockname()[1]
    config=uvicorn.Config(application,host='127.0.0.1',port=port,log_level='critical',access_log=False,lifespan='off')
    assert config.timeout_keep_alive==5
    server=uvicorn.Server(config)
    thread=threading.Thread(target=lambda:server.run(sockets=[listener]),daemon=True);thread.start()
    observed={}
    def second_request(client,request,label):
        assert request().status_code==200
        connection=client._transport._pool.connections[0];original=connection.has_expired
        def checked_before_descheduling():
            expired=original();observed[label]=expired
            if not expired:
                # The real server closes this idle connection during this gap.
                time.sleep(max(0,completed[label]+5.4-time.monotonic()))
            return expired
        monkeypatch.setattr(connection,'has_expired',checked_before_descheduling)
        time.sleep(1.2)
        return request()
    try:
        deadline=time.monotonic()+5
        while not server.started:
            assert thread.is_alive() and time.monotonic()<deadline
            time.sleep(.005)
        url=f'http://127.0.0.1:{port}'
        with httpx.Client(base_url=url,trust_env=False,timeout=3) as control:
            with pytest.raises(httpx.TransportError) as failed:
                second_request(control,lambda:control.get('/default'),'default')
            assert isinstance(failed.value,(httpx.RemoteProtocolError,httpx.ReadError,httpx.WriteError))
        assert observed['default'] is False and counts['default']==1
        metrics=Metrics();session=Session(url,metrics)
        try:
            response=second_request(session.client,lambda:session.request('boundary','GET','/benchmark'),'benchmark')
            assert response.status_code==200
            assert observed['benchmark'] is True
            assert counts['benchmark']==2 and len(ports['benchmark'])==2
            assert cookie_preserved['benchmark'] is True
            assert metrics.report()['boundary']['count']==2 and metrics.report()['boundary']['unexpected']==0
        finally:session.close()
    finally:
        server.should_exit=True;thread.join(timeout=5)
        if thread.is_alive():server.force_exit=True;thread.join(timeout=2)
        listener.close()
        assert not thread.is_alive(),'The owned diagnostic server must terminate.'


@pytest.mark.parametrize('header_shape',['mapping','headers'])
def test_transport_failures_are_bounded_correlated_and_never_retry_or_expose_private_details(header_shape):
    import json,httpx
    from scripts.benchmark_web_sessions import Session
    private='PRIVATE_TRANSPORT_PASSWORD_PATH_SENTINEL';attempts=[];metrics=Metrics()
    def disconnected(request):
        attempts.append(request)
        raise httpx.RemoteProtocolError(private)
    session=Session('http://127.0.0.1',metrics)
    session.client.close()
    # Failure injection tests reporting only; the test above uses actual sockets.
    session.client=httpx.Client(base_url='http://127.0.0.1',transport=httpx.MockTransport(disconnected))
    try:
        for _ in range(15):
            with pytest.raises(httpx.RemoteProtocolError):
                supplied={'x-request-id':private,'X-Request-ID':private}
                session.request('read_projects','GET','/'+private,headers=httpx.Headers(supplied) if header_shape=='headers' else supplied)
        report=metrics.transport_report()
        assert len(attempts)==15 and report['count']==15 and len(report['recent'])==10
        assert metrics.report()['read_projects']['count']==15
        assert metrics.report()['read_projects']['status_counts']=={'0':15}
        assert metrics.report()['read_projects']['unexpected']==15
        for failure in report['recent']:
            assert set(failure)=={'operation','method','request_id','error_type'}
            assert failure['operation']=='read_projects' and failure['method']=='GET'
            assert failure['error_type']=='RemoteProtocolError'
            assert failure['request_id'].startswith('bench:') and len(failure['request_id'])==38
        assert len({request.headers['X-Request-ID'] for request in attempts})==15
        assert [request.headers['X-Request-ID'] for request in attempts[-10:]]==[failure['request_id'] for failure in report['recent']]
        assert private not in json.dumps(report)
    finally:session.close()
