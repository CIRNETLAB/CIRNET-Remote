"""Add owner-scoped projects, CAS documents and retained immutable snapshots."""
from alembic import op
from app.migrations.schema_v0003 import PROJECTS

revision='0003_projects'
down_revision='0002_auth'

def upgrade():
    for table in PROJECTS: table.create(op.get_bind())

def downgrade():
    raise RuntimeError('Document downgrade would erase retained snapshots; restore a verified backup.')
