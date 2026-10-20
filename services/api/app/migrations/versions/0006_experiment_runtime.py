"""Backfill indexed scheduler state in keyset batches without rewriting history."""
from alembic import op
from sqlalchemy import insert,select
from app.migrations.schema_v0006 import experiments,experiment_runtime,projection

revision='0006_experiment_runtime'
down_revision='0005_captures'


def upgrade():
    db=op.get_bind();experiment_runtime.create(db);after=0
    while True:
        rows=list(db.execute(select(experiments.c.sequence,experiments.c.experiment_id,experiments.c.payload)
            .where(experiments.c.sequence>after).order_by(experiments.c.sequence).limit(100)).mappings())
        if not rows:break
        for row in rows:
            db.execute(insert(experiment_runtime).values(**projection({**row['payload'],'experiment_id':row['experiment_id']})))
        after=rows[-1]['sequence']


def downgrade():
    raise RuntimeError('Restore a verified backup to downgrade scheduler state.')
