"""Add durable principals, opaque sessions, ownership metadata and audit."""
import time
from alembic import op
from sqlalchemy import insert, select
from app.migrations.schema_v0002 import AUTH, assignments, assignment_access, experiments, operations, principals, sessions

revision='0002_auth'
down_revision='0001_legacy'

def upgrade():
    db=op.get_bind()
    for table in AUTH: table.create(db)
    owners=set(db.execute(select(experiments.c.owner_id)).scalars())|set(db.execute(select(operations.c.owner_id)).scalars())|set(db.execute(select(sessions.c.session_id)).scalars())
    owners.add('legacy-system')
    for owner in sorted(owners):
        db.execute(insert(principals).values(principal_id=owner,kind='LEGACY_SYSTEM' if owner=='legacy-system' else 'GUEST',created_at=time.time()))
    for assignment_id in db.execute(select(assignments.c.assignment_id)).scalars():
        db.execute(insert(assignment_access).values(assignment_id=assignment_id,owner_id='legacy-system',published=False,feedback_policy='observed_only'))

def downgrade():
    raise RuntimeError('Auth downgrade would destroy identities; restore the verified database backup.')
