"""Upgrade rehearsal preserves W3 identities, operations, and safety reservations."""
import sqlite3
from sqlalchemy import create_engine,insert,inspect,select,text
from app.migrations import HEAD,migrate
from app.migrations import schema_v0002 as previous
from app.services.persistence import Repository


def test_w3_backup_rehearsal_upgrade_keeps_original_and_preserves_existing_rows(tmp_path):
    original=tmp_path/'before.sqlite'; backup=tmp_path/'verified-backup.sqlite'
    engine=create_engine('sqlite:///'+original.as_posix()); migrate(engine,'0002_auth')
    experiment={'experiment_id':'old-experiment','state':'FAULT','capture':{'payload_ref':'retained-capture-reference'},'private-preserve':{'value':[None,1]}}
    operation={'schema_version':'1.0','operation_key':'retained-key','kind':'create','status':'APPLIED','experiment_id':'old-experiment','error_code':None,'revision':1}
    with engine.begin() as db:
        db.execute(insert(previous.principals).values(principal_id='old-owner',kind='GUEST',created_at=123))
        db.execute(insert(previous.auth_sessions).values(session_id='retained-session',token_hash='retained-opaque-digest',principal_id='old-owner',csrf_token='retained-csrf',expires_at=9999999999,revoked=False,auth_revision=0,claimable_guest_id=None))
        db.execute(insert(previous.experiments).values(sequence=7,experiment_id='old-experiment',owner_id='old-owner',payload=experiment))
        db.execute(insert(previous.operations).values(owner_id='old-owner',kind='create',scope='',operation_key='retained-key',fingerprint='retained-fingerprint',payload=operation))
        db.execute(insert(previous.leases).values(station_id='station',slot=0,experiment_id='old-experiment',expires_at=0,quarantined=True))
    engine.dispose()
    with sqlite3.connect(original) as source,sqlite3.connect(backup) as target:
        source.backup(target)
        assert target.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    repo=Repository('sqlite:///'+backup.as_posix())
    assert repo.get_experiment('old-experiment')==experiment
    assert repo.owner('old-experiment')=='old-owner' and repo.leases()[0]['quarantined'] is True
    assert repo.operation('old-owner','create','retained-key')=={**operation,'_fingerprint':'retained-fingerprint'}
    with repo.engine.connect() as db:
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
        assert db.execute(select(repo.auth_sessions.c.token_hash)).scalar()=='retained-opaque-digest'
        assert db.execute(select(repo.projects)).first() is None
        assert db.execute(select(repo.circuit_documents)).first() is None
    with sqlite3.connect(original) as source:
        assert source.execute('SELECT version_num FROM alembic_version').fetchone()[0]=='0002_auth'
        assert source.execute('PRAGMA integrity_check').fetchone()[0]=='ok'


def test_project_migration_is_independent_of_future_head_table_metadata(monkeypatch):
    from sqlalchemy import Column,MetaData,String,Table
    from app.db import schema
    future=Table('future_feature',MetaData(),Column('future_column',String))
    monkeypatch.setattr(schema,'PROJECTS',(future,))
    engine=create_engine('sqlite://'); migrate(engine)
    tables=inspect(engine).get_table_names()
    assert {'projects','circuit_documents','circuit_revisions','experiment_document_refs'}<=set(tables)
    assert 'future_feature' not in tables


def test_postgresql_project_tables_compile_owner_and_snapshot_relationships():
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable
    from app.migrations.schema_v0003 import PROJECTS
    ddl='\n'.join(str(CreateTable(table).compile(dialect=postgresql.dialect())) for table in PROJECTS)
    assert 'FOREIGN KEY(project_id, owner_id) REFERENCES projects (project_id, owner_id) ON UPDATE CASCADE' in ddl
    assert 'FOREIGN KEY(document_id, revision) REFERENCES circuit_revisions (document_id, revision)' in ddl
    assert 'FOREIGN KEY(experiment_id) REFERENCES lab_experiments (experiment_id)' in ddl
    assert 'revision BIGINT NOT NULL' in ddl
