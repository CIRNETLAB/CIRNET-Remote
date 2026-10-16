"""Payload I/O has independent lifetime from electrical control and history."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import pytest
from test_lab_lifecycle import setup_manager,create
from app.services.capture_store import FilesystemCaptureStore

def captured(tmp_path):
    manager,repo,gateway,jobs,_,_=setup_manager(tmp_path)
    manager.captures.store=FilesystemCaptureStore(tmp_path/'captures')
    identity=create(manager,'owner')['experiment_id'];manager.run(identity,'owner');jobs.run_one()
    return manager,repo,gateway,jobs,identity,manager.get(identity,'owner')['capture']

def test_slow_payload_read_and_hash_cannot_hold_the_global_stop_lock(tmp_path):
    manager,repo,gateway,jobs,identity,metadata=captured(tmp_path)
    active=create(manager,'other')['experiment_id'];manager.run(active,'other')
    entered,release=Event(),Event();original=manager.captures.store.get
    def blocked(value):
        entered.set();assert release.wait(5);return original(value)
    manager.captures.store.get=blocked
    with ThreadPoolExecutor(max_workers=2) as pool:
        read=pool.submit(manager.capture_payload,metadata['capture_id'],'owner')
        assert entered.wait(1)
        stopped=pool.submit(manager.stop,active,'other')
        try:assert stopped.result(timeout=.5)['state']=='STOPPING'
        finally:release.set()
        assert read.result(timeout=2)
    jobs.run_one();assert not repo.leases()
    manager.close();repo.close()

def test_capture_lookup_never_scans_historical_experiment_json(tmp_path,monkeypatch):
    manager,repo,_,_,_,metadata=captured(tmp_path)
    with monkeypatch.context() as guard:
        guard.setattr(repo,'list_experiments',lambda *args:pytest.fail('Capture lookup must use its relational index'))
        assert manager.capture_payload(metadata['capture_id'],'owner')
    manager.close();repo.close()

def test_retiring_an_older_generation_does_not_replace_the_current_capture(tmp_path):
    manager,repo,_,_,identity,old=captured(tmp_path)
    current=manager.captures.persist({'available':True,'samples':[{'signal':'new','time_ns':0,'value':0}]},'hardware')
    record=repo.get_experiment(identity);record['capture']=current;repo.save_experiment(record)
    retired=manager.delete_capture(old['capture_id'],'owner')
    assert retired['available'] is False
    assert manager.get(identity,'owner')['capture']==current
    assert manager.capture_payload(current['capture_id'],'owner')
    with pytest.raises(ValueError,match='CAPTURE_UNAVAILABLE'):manager.capture_payload(old['capture_id'],'owner')
    manager.close();repo.close()

def test_failed_filesystem_cleanup_keeps_a_private_tombstone_and_can_be_retried(tmp_path):
    from app.services.hardware_client import GatewayError
    manager,repo,_,_,_,metadata=captured(tmp_path)
    original=manager.captures.store.delete
    def blocked(value):raise OSError('test storage unavailable')
    manager.captures.store.delete=blocked
    with pytest.raises(GatewayError,match='CAPTURE_STORAGE_UNAVAILABLE'):manager.delete_capture(metadata['capture_id'],'owner')
    reference=repo.capture_reference(metadata['capture_id'],'owner')
    assert reference['cleanup_pending'] and not reference['metadata']['available']
    with pytest.raises(ValueError,match='CAPTURE_UNAVAILABLE'):manager.capture_payload(metadata['capture_id'],'owner')
    manager.captures.store.delete=original
    assert manager.expire_captures()['deleted']==1
    assert not repo.capture_reference(metadata['capture_id'],'owner')['cleanup_pending']
    manager.close();repo.close()


def test_revoked_session_cannot_receive_bytes_after_a_slow_read(tmp_path):
    manager,repo,_,_,_,metadata=captured(tmp_path)
    active=[True];manager.control_session_active=lambda session:active[0]
    original=manager.captures.store.get
    def revoke_during_read(value):
        payload=original(value);active[0]=False;return payload
    manager.captures.store.get=revoke_during_read
    with pytest.raises(ValueError,match='SESSION_EXPIRED'):
        manager.capture_payload(metadata['capture_id'],'owner',auth_session_id='revoked')
    manager.close();repo.close()


def test_slow_cleanup_cannot_hold_the_global_stop_lock(tmp_path):
    manager,repo,_,jobs,_,metadata=captured(tmp_path)
    other=create(manager,'other')['experiment_id'];manager.run(other,'other')
    entered,release=Event(),Event();original=manager.captures.store.delete
    def blocked(value):
        entered.set();assert release.wait(5);return original(value)
    manager.captures.store.delete=blocked
    with ThreadPoolExecutor(max_workers=2) as pool:
        deleting=pool.submit(manager.delete_capture,metadata['capture_id'],'owner')
        assert entered.wait(1)
        stopped=pool.submit(manager.stop,other,'other')
        try:
            assert stopped.result(timeout=.5)['state']=='STOPPING'
            assert not repo.capture_reference(metadata['capture_id'],'owner')['available']
        finally:release.set()
        assert deleting.result(timeout=2)['available'] is False
    jobs.run_one();manager.close();repo.close()


def test_active_capture_delete_preserves_the_existing_invalid_state_error(tmp_path):
    manager,repo,_,_,identity,metadata=captured(tmp_path)
    value=repo.get_experiment(identity);value['state']='CAPTURING';repo.save_experiment(value)
    with pytest.raises(ValueError,match='^INVALID_STATE$'):
        manager.delete_capture(metadata['capture_id'],'owner')
    assert manager.capture_payload(metadata['capture_id'],'owner')
    manager.close();repo.close()


def test_payload_storage_failure_is_explicit_and_does_not_retire_evidence(tmp_path):
    from app.services.hardware_client import GatewayError
    manager,repo,_,_,_,metadata=captured(tmp_path)
    original=manager.captures.store.get
    def unavailable(value):raise OSError('fixture storage unavailable')
    manager.captures.store.get=unavailable
    with pytest.raises(GatewayError,match='CAPTURE_STORAGE_UNAVAILABLE'):
        manager.capture_payload(metadata['capture_id'],'owner')
    assert repo.capture_reference(metadata['capture_id'],'owner')['available']
    manager.captures.store.get=original
    assert manager.capture_payload(metadata['capture_id'],'owner')
    manager.close();repo.close()


@pytest.mark.parametrize('failure_site,expected', [('driver','DRIVER_ERROR'),('capture_write','CAPTURE_STORAGE_UNAVAILABLE'),('capture_read','CAPTURE_STORAGE_UNAVAILABLE')])
def test_capture_storage_error_does_not_mislabel_a_driver_io_failure(tmp_path,failure_site,expected):
    manager,repo,gateway,jobs,_,_=setup_manager(tmp_path)
    manager.captures.store=FilesystemCaptureStore(tmp_path/'captures')
    if failure_site=='driver':
        original=gateway.call
        def fail_driver(station,experiment,method,**kwargs):
            if method=='read_capture':raise OSError('fixture driver transport error')
            return original(station,experiment,method,**kwargs)
        gateway.call=fail_driver
    else:
        def fail_storage(*args):raise OSError('fixture disk unavailable')
        setattr(manager.captures.store,'put' if failure_site=='capture_write' else 'get',fail_storage)
    identity=create(manager,'owner')['experiment_id'];manager.run(identity,'owner');jobs.run_one()
    record=manager.get(identity,'owner')
    assert record['state']=='FAULT' and record['error_code']==expected
    assert not repo.leases()
    manager.close();repo.close()
