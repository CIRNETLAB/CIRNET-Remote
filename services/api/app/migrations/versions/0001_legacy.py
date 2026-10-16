"""Recognize compatible pre-versioned databases without rewriting payloads."""
from alembic import op
from sqlalchemy import inspect
from app.migrations.schema_v0002 import LEGACY

revision='0001_legacy'
down_revision=None

def upgrade():
    db=op.get_bind(); inspector=inspect(db); existing=set(inspector.get_table_names())
    for table in LEGACY:
        if table.name in existing:
            actual={column['name'] for column in inspector.get_columns(table.name)}
            if not set(table.c.keys()).issubset(actual):
                raise ValueError('MIGRATION_INCOMPATIBLE_SCHEMA: '+table.name)
    for table in LEGACY:
        if table.name not in existing: table.create(db)

def downgrade():
    raise RuntimeError('Destructive downgrade is disabled; restore the verified database backup.')
