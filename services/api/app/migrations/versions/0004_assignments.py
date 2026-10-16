"""Retain immutable authoring revisions and a stable published selection."""
import time
from alembic import op
from sqlalchemy import inspect,select
from app.migrations.schema_v0002 import assignments,assignment_access
from app.migrations.schema_v0004 import ASSIGNMENTS,HISTORY_INDEX,seed_assignment

revision='0004_assignments'
down_revision='0003_projects'

def upgrade():
    db=op.get_bind()
    existing=next((index for index in inspect(db).get_indexes('lab_experiments') if index['name']==HISTORY_INDEX.name),None)
    if existing is not None and (existing['column_names']!=['owner_id','sequence'] or
            any(key.endswith('_where') and value is not None for key,value in existing.get('dialect_options',{}).items())):
        raise RuntimeError('Refusing incompatible existing history index; restore or repair its definition before upgrading.')
    for table in ASSIGNMENTS:table.create(db)
    HISTORY_INDEX.create(db,checkfirst=True)
    now=time.time()
    for row in db.execute(select(assignments.c.assignment_id,assignments.c.payload,assignment_access.c.owner_id,assignment_access.c.published).join(assignment_access,assignments.c.assignment_id==assignment_access.c.assignment_id)).mappings():
        seed_assignment(db,row['assignment_id'],row['payload'],row,now)

def downgrade():
    raise RuntimeError('Assignment downgrade would erase retained revisions; restore a verified backup.')
