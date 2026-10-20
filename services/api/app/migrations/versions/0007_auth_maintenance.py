"""Indexed bounded credential maintenance without deleting identity/evidence."""
from alembic import op

revision='0007_auth_maintenance'
down_revision='0006_experiment_runtime'


def upgrade():
    op.create_index('ix_auth_sessions_expiry','auth_sessions',['expires_at','session_id'])
    op.create_index('ix_auth_sessions_principal','auth_sessions',['principal_id','revoked'])
    op.create_index('ix_auth_rate_limits_window','auth_rate_limits',['window_start','bucket'])


def downgrade():
    raise RuntimeError('Restore a verified backup before rolling back credential maintenance.')
