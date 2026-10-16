import sqlite3
from sqlalchemy import create_engine,insert,inspect,select,text,update
from sqlalchemy.exc import IntegrityError
import pytest
from app.migrations import HEAD,migrate
from app.migrations import schema_v0002 as old
from app.services.persistence import Repository

def test_w4_backup_upgrade_retains_published_private_and_arbitrary_historical_json(tmp_path):
    source=tmp_path/'w4.sqlite';copy=tmp_path/'rehearsal.sqlite'
    engine=create_engine('sqlite:///'+source.as_posix());migrate(engine,'0003_projects')
    definitions={name:{'historical-data':{'keep':[None,True,3]},'title':name} for name in ('published','private')}
    with engine.begin() as db:
        db.execute(insert(old.principals).values(principal_id='historical-owner',kind='GUEST',created_at=1))
        for name,definition in definitions.items():
            db.execute(insert(old.assignments).values(assignment_id=name,payload=definition))
            db.execute(insert(old.assignment_access).values(assignment_id=name,owner_id='historical-owner',published=name=='published',feedback_policy='observed_only'))
    engine.dispose()
    with sqlite3.connect(source) as original,sqlite3.connect(copy) as backup:
        original.backup(backup);assert backup.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    repo=Repository('sqlite:///'+copy.as_posix())
    with repo.engine.connect() as db:
        assert db.execute(text('SELECT version_num FROM alembic_version')).scalar()==HEAD
        heads={row['assignment_id']:dict(row) for row in db.execute(select(repo.assignment_documents)).mappings()}
        assert heads['published']['published_revision']==1 and heads['private']['published_revision'] is None
        assert {row['assignment_id']:row['definition'] for row in db.execute(select(repo.assignment_revisions)).mappings()}==definitions
        assert set(db.execute(select(repo.assignment_revisions.c.saved_by)).scalars())=={'historical-owner'}
    for name,definition in definitions.items():assert repo.get_assignment(name)==definition
    with sqlite3.connect(source) as original:
        assert original.execute('SELECT version_num FROM alembic_version').fetchone()[0]=='0003_projects'
        assert original.execute('PRAGMA integrity_check').fetchone()[0]=='ok'

def test_assignment_migration_is_independent_of_mutable_future_head_metadata(monkeypatch):
    from sqlalchemy import Column,MetaData,String,Table
    from app.db import schema
    future=Table('future_assignment_feature',MetaData(),Column('future_column',String))
    monkeypatch.setattr(schema,'ASSIGNMENTS',(future,))
    engine=create_engine('sqlite://');migrate(engine)
    assert {'assignment_documents','assignment_revisions'}<=set(inspect(engine).get_table_names())
    assert 'future_assignment_feature' not in inspect(engine).get_table_names()

def test_deferred_assignment_selection_foreign_keys_reject_nonexistent_versions():
    repo=Repository('sqlite://')
    repo.create_assignment({'schema_version':'1.0','assignment_id':'a','title':'Assignment','lab_endpoints':[],'assessment_policy':'FUNCTIONAL_ONLY'})
    with pytest.raises(IntegrityError):
        with repo.engine.begin() as db:
            db.execute(update(repo.assignment_documents).values(published_revision=999))
    with repo.engine.connect() as db:
        assert db.execute(select(repo.assignment_documents.c.published_revision)).scalar() is None

def test_postgresql_assignment_ddl_uses_bigint_and_deferred_selected_revision_relationships():
    from sqlalchemy.dialects import postgresql
    from sqlalchemy.schema import CreateTable
    from app.migrations.schema_v0004 import ASSIGNMENTS
    ddl='\n'.join(str(CreateTable(table).compile(dialect=postgresql.dialect())) for table in ASSIGNMENTS)
    assert 'revision BIGINT NOT NULL' in ddl
    assert 'FOREIGN KEY(assignment_id, published_revision) REFERENCES assignment_revisions (assignment_id, revision) DEFERRABLE INITIALLY DEFERRED' in ddl

@pytest.mark.parametrize('compatible',[True,False])
def test_assignment_upgrade_adopts_only_a_compatible_existing_history_index(compatible):
    engine=create_engine('sqlite://');migrate(engine,'0003_projects')
    columns='owner_id, sequence' if compatible else 'owner_id'
    with engine.begin() as db:
        db.execute(text('CREATE INDEX ix_lab_experiments_owner_sequence ON lab_experiments ('+columns+')'))
    if compatible:
        migrate(engine)
        assert next(item for item in inspect(engine).get_indexes('lab_experiments') if item['name']=='ix_lab_experiments_owner_sequence')['column_names']==['owner_id','sequence']
    else:
        with pytest.raises(RuntimeError,match='incompatible existing history index'):migrate(engine)
        assert 'assignment_documents' not in inspect(engine).get_table_names()
