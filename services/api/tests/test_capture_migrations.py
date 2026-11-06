"""Frozen 0005 indexes sealed metadata, preserving historical JSON and payload files."""
import sqlite3
from contextlib import closing
from copy import deepcopy
from sqlalchemy import create_engine,insert,select,text,inspect
from app.migrations import migrate,HEAD
from app.migrations import schema_v0002 as old
from app.services.persistence import Repository
from test_capture_catalog import metadata,experiment


def test_persist_rollback_journal_keeps_full_sync_and_restores_into_default_sqlite(tmp_path, monkeypatch):
    source=tmp_path/'source.sqlite';backup=tmp_path/'backup.sqlite'
    monkeypatch.setenv('CIRNET_SQLITE_ROLLBACK_JOURNAL','persist')
    repo=Repository('sqlite:///'+source.as_posix())
    try:
        with repo.engine.connect() as first, repo.engine.connect() as second:
            for connection in (first,second):
                assert connection.exec_driver_sql('PRAGMA journal_mode').scalar()=='persist'
                assert connection.exec_driver_sql('PRAGMA synchronous').scalar()==2
                assert connection.exec_driver_sql('PRAGMA foreign_keys').scalar()==1
        with repo.engine.begin() as db:
            db.exec_driver_sql('CREATE TABLE journal_probe (value INTEGER)')
            db.exec_driver_sql('INSERT INTO journal_probe VALUES (1)')
        with repo.engine.connect() as db:
            db.exec_driver_sql('INSERT INTO journal_probe VALUES (2)')
            db.rollback()
        with closing(sqlite3.connect(source)) as original, closing(sqlite3.connect(backup)) as copy:
            original.backup(copy)
            assert copy.execute('PRAGMA integrity_check').fetchone()==('ok',)
    finally:
        repo.close()

    memory=Repository('sqlite://')
    try:
        with memory.engine.connect() as db:
            assert db.exec_driver_sql('PRAGMA journal_mode').scalar()=='memory'
    finally:
        memory.close()

    monkeypatch.delenv('CIRNET_SQLITE_ROLLBACK_JOURNAL')
    restored=Repository('sqlite:///'+backup.as_posix())
    try:
        with restored.engine.connect() as db:
            assert db.exec_driver_sql('PRAGMA journal_mode').scalar()=='delete'
            assert db.exec_driver_sql('SELECT value FROM journal_probe').scalars().all()==[1]
    finally:
        restored.close()


def test_capture_migration_backfills_sealed_metadata_only_on_a_verified_backup(tmp_path):
    source=tmp_path/'before.sqlite';backup=tmp_path/'rehearsal.sqlite';payload=tmp_path/'retained.ncap'
    payload.write_bytes(b'original-sealed-payload')
    engine=create_engine('sqlite:///'+source.as_posix());migrate(engine,'0004_assignments')
    sealed=experiment('sealed',metadata());inline=experiment('inline',{'capture_id':'inline-cap','available':True,'samples':[{'signal':'y','time_ns':0,'value':1}]})
    values={'sealed':sealed,'inline':inline}
    with engine.begin() as db:
        for identity,value in values.items():db.execute(insert(old.experiments).values(experiment_id=identity,owner_id='retained-owner',payload=value))
        db.execute(insert(old.leases).values(station_id='station',slot=0,experiment_id='sealed',expires_at=10,quarantined=True))
    engine.dispose()
    with sqlite3.connect(source) as original,sqlite3.connect(backup) as copy:
        original.backup(copy);assert copy.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    repo=Repository('sqlite:///'+backup.as_posix())
    assert hasattr(repo,'captures'),'Capture catalog migration is missing.'
    assert repo.capture_reference('cap-one','retained-owner')['metadata']==metadata()
    with repo.engine.connect() as db:
        assert db.execute(select(repo.captures.c.capture_id)).scalars().all()==['cap-one']
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
    for identity,value in values.items():assert repo.get_experiment(identity)==value
    assert repo.leases()==[{'station_id':'station','slot':0,'experiment_id':'sealed','expires_at':10,'quarantined':True}]
    assert payload.read_bytes()==b'original-sealed-payload'
    with sqlite3.connect(source) as original:assert original.execute('SELECT version_num FROM alembic_version').fetchone()[0]=='0004_assignments'


def test_capture_revision_does_not_import_mutable_head_metadata(monkeypatch):
    from sqlalchemy import Column,MetaData,String,Table
    from app.db import schema
    monkeypatch.setattr(schema,'CAPTURES',(Table('future_capture_shape',MetaData(),Column('future',String)),),raising=False)
    engine=create_engine('sqlite://');migrate(engine)
    assert 'lab_captures' in inspect(engine).get_table_names() and 'future_capture_shape' not in inspect(engine).get_table_names()
