"""Immutable W6 authoring history. Do not import mutable head table metadata."""
from sqlalchemy import BigInteger,CheckConstraint,Column,Float,ForeignKey,ForeignKeyConstraint,Index,Integer,JSON,MetaData,String,Table

metadata=MetaData()
Table('auth_principals',metadata,Column('principal_id',String,primary_key=True))
Table('lab_assignments',metadata,Column('assignment_id',String,primary_key=True),Column('payload',JSON,nullable=False))
history=Table('lab_experiments',metadata,Column('sequence',Integer,primary_key=True),Column('owner_id',String,nullable=False))
HISTORY_INDEX=Index('ix_lab_experiments_owner_sequence',history.c.owner_id,history.c.sequence)
documents=Table('assignment_documents',metadata,
    Column('sequence',Integer,primary_key=True,autoincrement=True),
    Column('assignment_id',String,ForeignKey('lab_assignments.assignment_id'),unique=True,nullable=False),
    Column('revision',BigInteger,nullable=False),Column('published_revision',BigInteger),
    Column('created_at',Float,nullable=False),Column('updated_at',Float,nullable=False),
    ForeignKeyConstraint(['assignment_id','revision'],['assignment_revisions.assignment_id','assignment_revisions.revision'],deferrable=True,initially='DEFERRED'),
    ForeignKeyConstraint(['assignment_id','published_revision'],['assignment_revisions.assignment_id','assignment_revisions.revision'],deferrable=True,initially='DEFERRED'),
    CheckConstraint('revision >= 1',name='ck_assignment_documents_revision'))
Index('ix_assignment_documents_sequence',documents.c.sequence)
revisions=Table('assignment_revisions',metadata,
    Column('assignment_id',String,ForeignKey('lab_assignments.assignment_id'),primary_key=True),
    Column('revision',BigInteger,primary_key=True),Column('definition',JSON,nullable=False),
    Column('saved_by',String,ForeignKey('auth_principals.principal_id'),nullable=False),Column('saved_at',Float,nullable=False),
    CheckConstraint('revision >= 1',name='ck_assignment_revisions_revision'))
ASSIGNMENTS=(revisions,documents)

def seed_assignment(db,assignment_id,definition,policy,now):
    """Trusted imports are private unless their explicit policy publishes them."""
    from sqlalchemy import insert
    db.execute(insert(revisions).values(assignment_id=assignment_id,revision=1,definition=definition,saved_by=policy['owner_id'],saved_at=now))
    db.execute(insert(documents).values(assignment_id=assignment_id,revision=1,published_revision=1 if policy['published'] else None,created_at=now,updated_at=now))
