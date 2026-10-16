"""Index sealed capture generations without changing historical experiment JSON."""
from copy import deepcopy
import time
from alembic import op
from sqlalchemy import insert,select
from app.migrations.schema_v0005 import CAPTURES,captures,experiments,sealed_metadata,capture_created_at

revision='0005_captures'
down_revision='0004_assignments'


def upgrade():
    db=op.get_bind()
    for table in CAPTURES:table.create(db)
    identities=set();now=time.time()
    for row in db.execute(select(experiments.c.experiment_id,experiments.c.payload)).mappings():
        value=row['payload'].get('capture')
        if not sealed_metadata(value):continue
        if value['capture_id'] in identities:raise RuntimeError('Duplicate historical capture identity; restore or repair the backup before upgrading.')
        identities.add(value['capture_id'])
        db.execute(insert(captures).values(capture_id=value['capture_id'],experiment_id=row['experiment_id'],
            metadata=deepcopy(value),created_at=capture_created_at(value,now),available=value['available'],cleanup_pending=False))


def downgrade():
    raise RuntimeError('Capture downgrade would erase retained generation identities; restore a verified backup.')
