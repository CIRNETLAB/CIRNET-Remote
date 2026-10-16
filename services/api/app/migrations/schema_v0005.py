"""Immutable sealed-capture catalog snapshot for revision 0005."""
import math
import re
from sqlalchemy import Boolean,Column,Float,ForeignKey,Index,JSON,MetaData,String,Table

metadata=MetaData()
experiments=Table('lab_experiments',metadata,Column('experiment_id',String,primary_key=True),Column('payload',JSON,nullable=False))
captures=Table('lab_captures',metadata,
    Column('capture_id',String,primary_key=True),
    Column('experiment_id',String,ForeignKey('lab_experiments.experiment_id'),nullable=False),
    Column('metadata',JSON,nullable=False),Column('created_at',Float,nullable=False),
    Column('available',Boolean,nullable=False),Column('cleanup_pending',Boolean,nullable=False))
Index('ix_lab_captures_available_created',captures.c.available,captures.c.created_at,captures.c.capture_id)
Index('ix_lab_captures_cleanup_pending',captures.c.cleanup_pending,captures.c.capture_id)
CAPTURES=(captures,)


def sealed_metadata(value):
    """Adopt only metadata with a sealed payload identity, never inline samples."""
    if not isinstance(value,dict) or 'samples' in value or not isinstance(value.get('capture_id'),str) or not value['capture_id'] or type(value.get('available')) is not bool or type(value.get('payload_byte_count')) is not int:return False
    if value['available']:
        return isinstance(value.get('payload_ref'),str) and bool(value['payload_ref']) and value['payload_byte_count']>0 and isinstance(value.get('sha256'),str) and re.fullmatch('[0-9a-f]{64}',value['sha256']) is not None
    return value.get('payload_ref') is None and value['payload_byte_count']==0 and value.get('sha256') is None


def capture_created_at(value,fallback):
    stamp=value.get('timestamp_ns')
    if isinstance(stamp,str) and stamp.isascii() and stamp.isdigit() and len(stamp)<=39:
        candidate=int(stamp)/1000000000
        if math.isfinite(candidate):return candidate
    return fallback
