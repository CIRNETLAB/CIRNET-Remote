"""Terminal graphs stay out of scheduler admission, expiry and recovery."""
from sqlalchemy import event,select
from app.services.experiments import ExperimentManager
from test_lab_lifecycle import setup_manager,create,DeferredJobs


def test_monitor_admission_shutdown_and_recovery_never_scan_terminal_history(tmp_path,monkeypatch):
    manager,repo,gateway,jobs,clock,_=setup_manager(tmp_path)
    for index in range(105):
        record=create(manager,f'old-{index}')
        manager._transition(record['experiment_id'],'COMPLETE')
    monkeypatch.setattr(repo,'list_experiments',lambda *args:(_ for _ in ()).throw(AssertionError('unbounded terminal history hydration')))
    manager.expire_control_sessions(lambda _:False)
    manager.disconnect('old-0');manager.disconnect_control('missing')
    record=create(manager,'fresh');manager.run(record['experiment_id'],'fresh')
    manager.stop(record['experiment_id'],'fresh');jobs.run_one();manager.close()
    recovered=ExperimentManager(repo,gateway,submit=DeferredJobs())
    recovered.close();repo.close()


def test_runtime_projection_tracks_payload_and_filters_before_hydration(tmp_path):
    manager,repo,_,_,_,_=setup_manager(tmp_path)
    record=create(manager,'one');eid=record['experiment_id']
    manager.run(eid,'one',control_session_id='session',control_client_id='tab')
    runtime=repo.experiment_runtime
    with repo.engine.connect() as db:
        indexed=db.execute(select(runtime).where(runtime.c.experiment_id==eid)).mappings().one()
    assert indexed['active'] and indexed['state']=='RESERVED'
    assert indexed['control_session_id']=='session' and indexed['control_client_id']=='tab'
    assert repo.has_active_experiment('one')
    assert [value['experiment_id'] for value in repo.active_experiments(session_id='session',client_id='tab')]==[eid]
    assert repo.active_experiments(session_id='other')==[]
    manager._transition(eid,'COMPLETE')
    assert not repo.has_active_experiment('one')
    assert repo.active_experiments()==[]


def test_run_rate_map_expires_and_refuses_overflow_without_eviction(tmp_path):
    manager,repo,_,jobs,clock,_=setup_manager(tmp_path)
    manager.rate_limit_entries=2
    for owner in ('one','two'):
        record=create(manager,owner);manager.run(record['experiment_id'],owner);jobs.run_one()
    import pytest
    record=create(manager,'three')
    with pytest.raises(ValueError,match='RATE_LIMITED'):manager.run(record['experiment_id'],'three')
    assert len(manager.rate)==2
    clock[0]=2;manager.run(record['experiment_id'],'three')
    assert len(manager.rate)==1
