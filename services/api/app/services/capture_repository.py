"""Transactional sealed capture catalog; filesystem IO belongs to its caller."""
from copy import deepcopy
import math
import time
from sqlalchemy import and_,insert,or_,select,update
from contracts.validation import validate
from app.migrations.schema_v0005 import capture_created_at,sealed_metadata

TERMINAL=('COMPLETE','FAULT')
MAX_REVISION=9007199254740991


def _tombstone(value):
    return {**deepcopy(value),'available':False,'payload_ref':None,'payload_byte_count':0,'sha256':None}


def sync_capture(repo,db,value):
    metadata=value.get('capture')
    if not isinstance(metadata,dict) or not isinstance(metadata.get('capture_id'),str):return
    table=repo.captures
    row=db.execute(select(table).where(table.c.capture_id==metadata['capture_id']).with_for_update()).mappings().first()
    if not sealed_metadata(metadata):
        if row is not None:raise ValueError('CAPTURE_IDENTITY_CONFLICT')
        return  # Historical inline/unsealed JSON remains stored, never indexed.
    metadata=validate('CaptureMetadata',metadata)
    if row is None:
        db.execute(insert(table).values(capture_id=metadata['capture_id'],experiment_id=value['experiment_id'],
            metadata=deepcopy(metadata),created_at=capture_created_at(metadata,time.time()),available=metadata['available'],cleanup_pending=False))
        return
    if row['experiment_id']!=value['experiment_id']:raise ValueError('CAPTURE_IDENTITY_CONFLICT')
    if not row['available'] and metadata['available']:raise ValueError('CAPTURE_RETIRED')
    if row['metadata']==metadata:return
    if row['available'] and metadata==_tombstone(row['metadata']):
        db.execute(update(table).where(table.c.capture_id==metadata['capture_id']).values(metadata=deepcopy(metadata),available=False,cleanup_pending=True))
        return
    raise ValueError('CAPTURE_IDENTITY_CONFLICT')


def capture_reference(repo,identity,owner=None):
    table,experiments=repo.captures,repo.experiments
    with repo.lock,repo.engine.connect() as db:
        row=db.execute(select(table,experiments.c.owner_id).join(experiments,experiments.c.experiment_id==table.c.experiment_id).where(table.c.capture_id==identity)).mappings().first()
    if row is None:raise KeyError('CAPTURE_NOT_FOUND')
    if owner is not None and row['owner_id']!=owner:raise PermissionError('FORBIDDEN')
    return deepcopy(dict(row))


def retire_capture(repo,identity,owner,reason='DELETED',auth_session_id=None,authorize_session=None):
    table,experiments=repo.captures,repo.experiments
    with repo.lock,repo.engine.begin() as db:
        context=None
        if auth_session_id is not None:
            if authorize_session is None:raise ValueError('SESSION_EXPIRED')
            context=authorize_session(db,auth_session_id,owner)
        experiment_id=db.execute(select(table.c.experiment_id).where(table.c.capture_id==identity)).scalar_one_or_none()
        if experiment_id is None:raise KeyError('CAPTURE_NOT_FOUND')
        # Claim, lifecycle saves and reservation use this same parent-row fence.
        # On SQLite it obtains the writer lock before re-reading current owner.
        db.execute(update(experiments).where(experiments.c.experiment_id==experiment_id).values(owner_id=experiments.c.owner_id))
        row=db.execute(select(table,experiments.c.owner_id,experiments.c.payload).join(experiments,experiments.c.experiment_id==table.c.experiment_id).where(table.c.capture_id==identity).with_for_update()).mappings().one()
        if row['owner_id']!=owner:raise PermissionError('FORBIDDEN')
        if row['payload'].get('state') not in TERMINAL or db.execute(select(repo.lease_table.c.experiment_id).where(repo.lease_table.c.experiment_id==experiment_id)).first():raise ValueError('CAPTURE_ACTIVE')
        if not row['available']:return {'metadata':deepcopy(row['metadata']),'experiment_id':experiment_id,'changed':False}
        tombstone=validate('CaptureMetadata',_tombstone(row['metadata']))
        current=row['payload']
        if isinstance(current.get('capture'),dict) and current['capture'].get('capture_id')==identity:
            revision=current.get('revision',0)
            if type(revision) not in (int,float) or revision>=MAX_REVISION:raise ValueError('REVISION_LIMIT_REACHED')
            current={**deepcopy(current),'capture':deepcopy(tombstone),'revision':revision+1}
            db.execute(update(experiments).where(experiments.c.experiment_id==experiment_id).values(payload=current))
        db.execute(update(table).where(table.c.capture_id==identity).values(metadata=deepcopy(tombstone),available=False,cleanup_pending=True))
        db.execute(insert(repo.audit).values(occurred_at=time.time(),actor_id=context.principal_id if context else None,action='CAPTURE_'+str(reason)[:64],subject_id=identity))
        return {'metadata':deepcopy(tombstone),'experiment_id':experiment_id,'changed':True}


def finish_capture_cleanup(repo,identity):
    table=repo.captures
    with repo.lock,repo.engine.begin() as db:
        return db.execute(update(table).where(table.c.capture_id==identity,table.c.available==False).values(cleanup_pending=False)).rowcount>0


def expired_captures(repo,cutoff,limit=100):
    if type(limit) is not int or not 1<=limit<=1000 or cutoff is not None and (type(cutoff) not in (int,float) or not math.isfinite(cutoff)):raise ValueError('INVALID_CAPTURE_RETENTION_QUERY')
    table,experiments,leases=repo.captures,repo.experiments,repo.lease_table
    eligible=table.c.cleanup_pending==True if cutoff is None else or_(and_(table.c.available==True,table.c.created_at<=cutoff),table.c.cleanup_pending==True)
    query=select(table,experiments.c.owner_id).join(experiments,experiments.c.experiment_id==table.c.experiment_id).where(
        eligible,
        experiments.c.payload['state'].as_string().in_(TERMINAL),
        ~select(leases.c.experiment_id).where(leases.c.experiment_id==experiments.c.experiment_id).exists()).order_by(table.c.created_at,table.c.capture_id).limit(limit)
    with repo.lock,repo.engine.connect() as db:return deepcopy([dict(row) for row in db.execute(query).mappings()])
