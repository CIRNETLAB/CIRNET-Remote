from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import pytest
from app.services.capture_store import FilesystemCaptureStore
from app.services.captures import CaptureService

def test_storage_quota_is_bounded_and_an_immutable_capture_key_cannot_be_overwritten(tmp_path):
    store=FilesystemCaptureStore(tmp_path,max_bytes=200,max_files=1);service=CaptureService(store)
    metadata=service.persist({'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]},'simulation')
    original=store.get(metadata)
    store.put(metadata,original)
    with pytest.raises(ValueError,match='CAPTURE_KEY_CONFLICT'):store.put(metadata,b'different bytes')
    with pytest.raises(ValueError,match='CAPTURE_QUOTA_EXCEEDED'):
        service.persist({'available':True,'samples':[{'signal':'z','time_ns':0,'value':0}]},'simulation')
    assert len(list(tmp_path.glob('*.ncap')))==1 and store.get(metadata)==original

def test_two_store_instances_share_the_directory_quota_admission_lock(tmp_path):
    first,second=[CaptureService(FilesystemCaptureStore(tmp_path,max_bytes=10000,max_files=1)) for _ in range(2)]
    barrier=Barrier(2)
    def put(service):
        barrier.wait(2)
        try:service.persist({'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]},'simulation');return 'stored'
        except ValueError as error:return str(error)
    with ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(put,[first,second]))
    assert sorted(outcomes)==['CAPTURE_QUOTA_EXCEEDED','stored']
    assert len(list(tmp_path.glob('*.ncap')))==1

def test_byte_quota_rejects_the_second_payload_without_partial_files(tmp_path):
    from contracts.capture_codec import encode_digital
    samples=[{'signal':'y','time_ns':0,'value':1}]
    size=len(encode_digital(samples,0))
    store=FilesystemCaptureStore(tmp_path,max_bytes=size*2-1,max_files=10);service=CaptureService(store)
    service.persist({'available':True,'samples':samples},'simulation')
    with pytest.raises(ValueError,match='CAPTURE_QUOTA_EXCEEDED'):service.persist({'available':True,'samples':samples},'simulation')
    assert len(list(tmp_path.glob('*.ncap')))==1 and not list(tmp_path.glob('.capture-*'))

@pytest.mark.parametrize('limits',[{'max_bytes':True},{'max_bytes':0},{'max_files':0},{'max_files':1.5}])
def test_quota_configuration_is_explicit_and_strict(tmp_path,limits):
    with pytest.raises(ValueError,match='INVALID_CAPTURE_LIMIT'):FilesystemCaptureStore(tmp_path,**limits)
