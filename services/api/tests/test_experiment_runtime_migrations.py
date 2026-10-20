"""Forward scheduler backfill preserves original payloads and rolls back atomically."""
import sqlite3
from sqlalchemy import create_engine,insert,select,text,event
import pytest
from app.migrations import migrate,HEAD
from app.migrations.schema_v0002 import experiments
from app.services.persistence import Repository


def test_scheduler_backfill_on_verified_backup_is_batched_and_preserves_history(tmp_path):
    original=tmp_path/'before.sqlite';backup=tmp_path/'restore.sqlite'
    engine=create_engine('sqlite:///'+original.as_posix());migrate(engine,'0005_captures')
    values=[{'experiment_id':f'e-{index:04}','state':'QUEUED' if index==104 else 'COMPLETE',
        '_queue_sequence':index,'_control_session_id':'session','_control_client_id':'tab',
        'private_historical_data':{'keep':[None,'unchanged']}} for index in range(105)]
    with engine.begin() as db:
        db.execute(insert(experiments),[{'experiment_id':value['experiment_id'],'owner_id':'owner','payload':value} for value in values])
    engine.dispose()
    with sqlite3.connect(original) as source,sqlite3.connect(backup) as destination:
        source.backup(destination);assert destination.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    repo=Repository('sqlite:///'+backup.as_posix())
    assert repo.list_experiments()==values
    assert repo.admission_sequence()==104
    assert repo.active_experiments()==[values[-1]]
    with repo.engine.connect() as db:
        assert db.execute(text('SELECT count(*) FROM lab_experiment_runtime')).scalar()==105
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
        plan=db.execute(text('EXPLAIN QUERY PLAN SELECT experiment_id FROM lab_experiment_runtime WHERE active=1 ORDER BY experiment_id LIMIT 100')).all()
        assert any('ix_lab_runtime_active' in str(row) for row in plan)
    repo.close()
    with sqlite3.connect(original) as source:
        assert source.execute('SELECT version_num FROM alembic_version').fetchone()[0]=='0005_captures'
        assert source.execute("SELECT count(*) FROM sqlite_master WHERE name='lab_experiment_runtime'").fetchone()[0]==0


def test_scheduler_projection_and_payload_update_share_one_transaction():
    repo=Repository('sqlite://')
    before={'experiment_id':'atomic','state':'CREATED'}
    repo.create_experiment('owner',before)
    def reject_projection(connection,clause,*args):
        if getattr(clause,'is_update',False) and clause.table.name=='lab_experiment_runtime':raise RuntimeError('projection fixture failure')
    event.listen(repo.engine,'before_execute',reject_projection)
    try:
        with pytest.raises(RuntimeError,match='projection fixture failure'):
            repo.save_experiment({**before,'state':'RUNNING','_control_session_id':'active'})
    finally:event.remove(repo.engine,'before_execute',reject_projection)
    assert repo.get_experiment('atomic')==before
    assert not repo.has_active_experiment('owner')
    with repo.engine.connect() as db:
        assert db.execute(select(repo.experiment_runtime.c.state)).scalar()=='CREATED'
    repo.close()
