from sqlalchemy import create_engine, inspect, text
from app.services.persistence import Repository


def test_migrations_preserve_legacy_owners_operations_and_quarantines(tmp_path):
    path=tmp_path/'legacy.sqlite'; engine=create_engine('sqlite:///'+path.as_posix())
    with engine.begin() as db:
        db.execute(text('CREATE TABLE lab_experiments (sequence INTEGER PRIMARY KEY,experiment_id VARCHAR UNIQUE NOT NULL,owner_id VARCHAR NOT NULL,payload JSON NOT NULL)'))
        db.execute(text("INSERT INTO lab_experiments VALUES (7,'legacy','old-owner','{\"experiment_id\":\"legacy\",\"state\":\"CAPTURING\"}')"))
        db.execute(text('CREATE TABLE lab_leases (station_id VARCHAR,slot INTEGER,experiment_id VARCHAR UNIQUE NOT NULL,expires_at FLOAT NOT NULL,quarantined BOOLEAN NOT NULL,PRIMARY KEY(station_id,slot))'))
        db.execute(text("INSERT INTO lab_leases VALUES ('station',0,'legacy',1,1)"))
    engine.dispose(); repo=Repository('sqlite:///'+path.as_posix())
    assert repo.owner('legacy')=='old-owner'
    assert repo.leases()[0]['quarantined'] is True
    assert repo.get_experiment('legacy')['state']=='CAPTURING'
    assert 'alembic_version' in inspect(repo.engine).get_table_names()
    with repo.engine.connect() as db:
        from app.migrations import HEAD
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
        assert db.execute(text("SELECT principal_id FROM auth_principals WHERE principal_id='old-owner'")).scalar()=='old-owner'


def test_migration_is_idempotent_and_incompatible_legacy_schema_rejected(tmp_path):
    path=tmp_path/'current.sqlite'
    repo=Repository('sqlite:///'+path.as_posix()); repo.close()
    repo=Repository('sqlite:///'+path.as_posix()); repo.close()
    broken=tmp_path/'broken.sqlite'; engine=create_engine('sqlite:///'+broken.as_posix())
    with engine.begin() as db: db.execute(text('CREATE TABLE lab_experiments (unrelated VARCHAR)'))
    import pytest
    with pytest.raises(ValueError,match='MIGRATION_INCOMPATIBLE_SCHEMA'): Repository('sqlite:///'+broken.as_posix())


def test_historical_revisions_ignore_mutable_current_metadata(monkeypatch):
    from app.db import schema
    from sqlalchemy import Column, MetaData, String, Table
    future=Table('future_table',MetaData(),Column('required_future_column',String,nullable=False))
    monkeypatch.setattr(schema,'AUTH',(future,)); monkeypatch.setattr(schema,'LEGACY',(future,))
    repo=Repository('sqlite://')
    assert 'auth_users' in inspect(repo.engine).get_table_names()
    assert 'future_table' not in inspect(repo.engine).get_table_names()


def test_postgresql_migration_ddl_compiles_with_foreign_keys_and_unique_sessions():
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable
    from app.migrations.schema_v0002 import AUTH, LEGACY
    ddl='\n'.join(str(CreateTable(table).compile(dialect=postgresql.dialect())) for table in LEGACY+AUTH)
    assert 'FOREIGN KEY(principal_id) REFERENCES auth_principals (principal_id)' in ddl
    assert 'UNIQUE (token_hash)' in ddl and 'UNIQUE (username_key)' in ddl
    assert 'JSON NOT NULL' in ddl
