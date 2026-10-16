from sqlalchemy import Boolean, Column, Float, ForeignKey, Index, Integer, JSON, MetaData, String, Table, UniqueConstraint

metadata=MetaData()
assignments=Table('lab_assignments',metadata,Column('assignment_id',String,primary_key=True),Column('payload',JSON,nullable=False))
experiments=Table('lab_experiments',metadata,Column('sequence',Integer,primary_key=True,autoincrement=True),Column('experiment_id',String,unique=True,nullable=False),Column('owner_id',String,nullable=False),Column('payload',JSON,nullable=False))
Index('ix_lab_experiments_owner_sequence',experiments.c.owner_id,experiments.c.sequence)
leases=Table('lab_leases',metadata,Column('station_id',String,primary_key=True),Column('slot',Integer,primary_key=True),Column('experiment_id',String,unique=True,nullable=False),Column('expires_at',Float,nullable=False),Column('quarantined',Boolean,nullable=False))
sessions=Table('lab_sessions',metadata,Column('session_id',String,primary_key=True),Column('expires_at',Float,nullable=False))
operations=Table('lab_operations',metadata,Column('owner_id',String,primary_key=True),Column('kind',String,primary_key=True),Column('scope',String,primary_key=True),Column('operation_key',String,primary_key=True),Column('fingerprint',String,nullable=False),Column('payload',JSON,nullable=False))
principals=Table('auth_principals',metadata,Column('principal_id',String,primary_key=True),Column('kind',String,nullable=False),Column('created_at',Float,nullable=False))
users=Table('auth_users',metadata,Column('principal_id',String,ForeignKey('auth_principals.principal_id'),primary_key=True),Column('username',String,nullable=False),Column('username_key',String,unique=True,nullable=False),Column('display_name',String,nullable=False),Column('password_hash',String,nullable=False),Column('role',String,nullable=False),Column('active',Boolean,nullable=False),Column('auth_revision',Integer,nullable=False))
auth_sessions=Table('auth_sessions',metadata,Column('session_id',String,primary_key=True),Column('token_hash',String,unique=True,nullable=False),Column('principal_id',String,ForeignKey('auth_principals.principal_id')),Column('csrf_token',String,nullable=False),Column('expires_at',Float,nullable=False),Column('revoked',Boolean,nullable=False),Column('auth_revision',Integer,nullable=False),Column('claimable_guest_id',String,ForeignKey('auth_principals.principal_id')))
assignment_access=Table('lab_assignment_access',metadata,Column('assignment_id',String,ForeignKey('lab_assignments.assignment_id'),primary_key=True),Column('owner_id',String,ForeignKey('auth_principals.principal_id'),nullable=False),Column('published',Boolean,nullable=False),Column('feedback_policy',String,nullable=False))
audit=Table('auth_audit',metadata,Column('sequence',Integer,primary_key=True,autoincrement=True),Column('occurred_at',Float,nullable=False),Column('actor_id',String,ForeignKey('auth_principals.principal_id')),Column('action',String,nullable=False),Column('subject_id',String,nullable=False))
rate_limits=Table('auth_rate_limits',metadata,Column('bucket',String,primary_key=True),Column('window_start',Float,nullable=False),Column('attempts',Integer,nullable=False))

LEGACY=(assignments,experiments,leases,sessions,operations)
AUTH=(principals,users,auth_sessions,assignment_access,audit,rate_limits)

from app.migrations.schema_v0003 import PROJECTS as _PROJECT_SNAPSHOT
projects,circuit_documents,circuit_revisions,experiment_document_refs=(table.to_metadata(metadata) for table in _PROJECT_SNAPSHOT)
PROJECTS=(projects,circuit_documents,circuit_revisions,experiment_document_refs)

from app.migrations.schema_v0004 import ASSIGNMENTS as _ASSIGNMENT_SNAPSHOT
assignment_revisions,assignment_documents=(table.to_metadata(metadata) for table in _ASSIGNMENT_SNAPSHOT)
ASSIGNMENTS=(assignment_documents,assignment_revisions)

from app.migrations.schema_v0005 import CAPTURES as _CAPTURE_SNAPSHOT
captures,=(table.to_metadata(metadata) for table in _CAPTURE_SNAPSHOT)
CAPTURES=(captures,)
