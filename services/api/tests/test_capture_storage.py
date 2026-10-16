"""Capture data plane must be owner scoped, lossless and absent from lifecycle JSON."""
import importlib
import json
from copy import deepcopy

import pytest
from csrf_client import CsrfTestClient as TestClient
from csrf_client import publish_fixture_assignment
from contracts.validation import validate
from test_lab_lifecycle import setup_manager, create, assignment, LabGateway, DeferredJobs, modules


def codec(): return importlib.import_module('contracts.capture_codec')
def store(tmp_path): return importlib.import_module('app.services.capture_store').FilesystemCaptureStore(tmp_path)


def test_digital_binary_roundtrip_preserves_order_names_levels_and_timestamps():
    samples=[{'signal':'y','time_ns':0,'value':'X'}, {'signal':'x','time_ns':0,'value':1},
             {'signal':'y','time_ns':2**40,'value':0}]
    binary=codec().encode_digital(samples, 2**40)
    assert binary.startswith(b'NCAP')
    assert codec().decode_digital(binary)=={'samples':samples,'duration_ns':2**40}


@pytest.mark.parametrize('change',['truncated','version','level','trailing'])
def test_corrupt_binary_fails_explicitly(change):
    binary=bytearray(codec().encode_digital([{'signal':'x','time_ns':0,'value':1}],10))
    if change=='truncated': binary=binary[:-1]
    if change=='version': binary[4]=9
    if change=='level': binary[-1]=4
    if change=='trailing': binary.extend(b'extra')
    with pytest.raises(ValueError,match='CAPTURE_CORRUPT'): codec().decode_digital(bytes(binary))


def test_100k_capture_is_externalized_from_db_and_every_lifecycle_event(tmp_path):
    manager,repo,gateway,jobs,now,events=setup_manager(tmp_path)
    manager.captures.store=store(tmp_path/'captures')
    samples=[{'signal':'y','time_ns':i,'value':i%2} for i in range(100000)]
    original=gateway.call
    def call(station_id,eid,method,**kwargs):
        if method=='read_capture': return {'available':True,'samples':samples,'duration_ns':100000}
        return original(station_id,eid,method,**kwargs)
    gateway.call=call
    e=create(manager); manager.run(e['experiment_id'],'student-1'); jobs.run_one()
    record=manager.get(e['experiment_id'],'student-1')
    assert 'samples' not in record['capture']
    assert record['capture']['sample_count']==100000
    assert len(json.dumps(repo.get_experiment(e['experiment_id'])))<15000
    assert all('samples' not in event['experiment'].get('capture',{}) for event in events if event['experiment']['capture'])
    assert max(len(json.dumps(event)) for event in events)<12000
    actual=codec().decode_digital(manager.capture_payload(record['capture']['capture_id'],'student-1'))
    assert actual['samples']==samples
    assert record['functional_verification']['status']=='PASS'
    with pytest.raises(PermissionError): manager.capture_payload(record['capture']['capture_id'],'student-2')


def test_store_corruption_is_detected_and_deletion_is_explicit(tmp_path):
    captures=importlib.import_module('app.services.captures').CaptureService(store=store(tmp_path))
    metadata=captures.persist({'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]},'simulation')
    assert captures.load(metadata)['samples'][0]['value']==1
    file=next(tmp_path.glob('*.ncap')); file.write_bytes(b'broken')
    with pytest.raises(ValueError,match='CAPTURE_CORRUPT'): captures.load(metadata)
    assert captures.store.delete(metadata) is True
    assert captures.store.delete(metadata) is False
    with pytest.raises(ValueError,match='CAPTURE_UNAVAILABLE'): captures.load(metadata)


@pytest.mark.parametrize('encoding',['INT16','UINT16','FLOAT32'])
def test_future_scope_metadata_validates_without_fabricated_payload(encoding):
    value={'schema_version':'1.0','capture_id':'future-scope','source':'hardware','instrument':'oscilloscope',
           'encoding':encoding,'channel_count':2,'sample_count':0,'duration_ns':0,'available':False,
           'payload_ref':None,'payload_byte_count':0}
    assert validate('CaptureMetadata',value)==value


def test_capture_timestamp_preserves_exact_epoch_nanoseconds(tmp_path):
    captures=importlib.import_module('app.services.captures').CaptureService(store=store(tmp_path))
    metadata=captures.persist({'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]},'simulation')
    assert isinstance(metadata['timestamp_ns'],str) and metadata['timestamp_ns'].isdigit()
    assert int(metadata['timestamp_ns'])>2**53-1


@pytest.mark.parametrize('change',[
    {'instrument':'oscilloscope'}, {'encoding':'FLOAT32'}, {'signals':['y','y'],'channel_count':2},
    {'channel_count':2}, {'payload_ref':None}, {'payload_byte_count':0},
    {'available':False}, {'sample_count':100001}, {'timestamp_ns':1791856800123456789},
])
def test_capture_metadata_semantic_integrity_matches_browser(tmp_path,change):
    from jsonschema import ValidationError
    captures=importlib.import_module('app.services.captures').CaptureService(store=store(tmp_path))
    metadata=captures.persist({'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]},'simulation')
    metadata.update(change)
    with pytest.raises(ValidationError): validate('CaptureMetadata',metadata)


def test_store_rejects_metadata_that_disagrees_with_binary_header(tmp_path):
    captures=importlib.import_module('app.services.captures').CaptureService(store=store(tmp_path))
    metadata=captures.persist({'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]},'simulation')
    metadata.update(signals=['z'])
    with pytest.raises(ValueError,match='CAPTURE_CORRUPT'): captures.store.get(metadata)


def test_payload_rest_owner_check_and_delete_leave_small_unavailable_metadata(tmp_path):
    import app.main as main
    _,persistence=modules(); jobs=DeferredJobs()
    application=main.create_app(repository=persistence.Repository('sqlite://'),gateway=LabGateway(),submit=jobs,
                                capture_store=store(tmp_path))
    publish_fixture_assignment(application,assignment())
    with TestClient(application) as owner, TestClient(application) as stranger:
        e=owner.post('/api/experiments',json={'station_id':'p1','assignment_id':'a1'}).json()
        owner.post('/api/experiments/'+e['experiment_id']+'/run'); jobs.run_one()
        record=owner.get('/api/experiments/'+e['experiment_id']).json()
        metadata=record['capture']; path='/api/captures/'+metadata['capture_id']+'/payload'
        assert stranger.get(path).status_code==403
        assert stranger.delete(path).status_code==403
        reply=owner.get(path)
        assert reply.headers['content-type'].startswith('application/vnd.netcircuit.capture')
        assert codec().decode_digital(reply.content)['samples']==[{'signal':'y','time_ns':0,'value':1}]
        assert owner.delete(path).status_code==200
        assert owner.get(path).json()['code']=='CAPTURE_UNAVAILABLE'
        after=owner.get('/api/experiments/'+e['experiment_id']).json()['capture']
        assert after['available'] is False and after['payload_ref'] is None
        assert not list(tmp_path.glob('*.ncap'))


def test_recovery_stops_live_lease_before_legacy_capture_storage_failure(tmp_path):
    manager,repo,gateway,jobs,now,events=setup_manager(tmp_path)
    e=create(manager)
    legacy={'available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]}
    record=repo.get_experiment(e['experiment_id']); record.update(state='RUNNING',capture=legacy)
    repo.save_experiment(record); repo.reserve('p1',0,e['experiment_id'],100)
    class UnwritableStore:
        def put(self, metadata, payload): raise OSError('CAPTURE_STORE_UNWRITABLE')
    experiments,_=modules()
    with pytest.raises(OSError,match='CAPTURE_STORE_UNWRITABLE'):
        experiments.ExperimentManager(repo,gateway,submit=jobs,capture_store=UnwritableStore())
    assert 'stop_execution' in gateway.calls
    assert not repo.leases()
    assert repo.get_experiment(e['experiment_id'])['capture']==legacy


def test_malformed_legacy_capture_cannot_prevent_safe_restart_cleanup(tmp_path):
    manager,repo,gateway,jobs,now,events=setup_manager(tmp_path)
    e=create(manager)
    record=repo.get_experiment(e['experiment_id'])
    record.update(state='RUNNING',capture={'available':True,'samples':[{'signal':'y','time_ns':-1,'value':1}]})
    repo.save_experiment(record); repo.reserve('p1',0,e['experiment_id'],100)
    experiments,_=modules()
    recovered=experiments.ExperimentManager(repo,gateway,submit=jobs,capture_store=store(tmp_path/'captures'),
        emit=lambda owner,event:events.append(event))
    assert 'stop_execution' in gateway.calls and not repo.leases()
    assert all('samples' not in (event['experiment']['capture'] or {}) for event in events)
    record=recovered.get(e['experiment_id'],'student-1')
    assert record['capture'] is None
    assert record['functional_verification']['status']=='NO_RESPONSE'
    assert 'Malformed legacy capture' in record['functional_verification']['issues'][0]
