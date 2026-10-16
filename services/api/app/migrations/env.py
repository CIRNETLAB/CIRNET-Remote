from alembic import context
from app.db.schema import metadata

connection=context.config.attributes.get('connection')
if connection is None:
    raise RuntimeError('Use python -m app.migrate with an explicit configured database.')
context.configure(connection=connection,target_metadata=metadata,render_as_batch=connection.dialect.name=='sqlite')
with context.begin_transaction(): context.run_migrations()
