"""Immutable scheduler projection; historical JSON remains the source record."""
from sqlalchemy import BigInteger,Boolean,Column,ForeignKey,Index,Integer,JSON,MetaData,String,Table

metadata=MetaData()
experiments=Table('lab_experiments',metadata,Column('sequence',Integer,primary_key=True),
    Column('experiment_id',String,unique=True),Column('payload',JSON))
experiment_runtime=Table('lab_experiment_runtime',metadata,
    Column('experiment_id',String,ForeignKey('lab_experiments.experiment_id'),primary_key=True),
    Column('state',String,nullable=False),Column('active',Boolean,nullable=False),
    Column('station_id',String),Column('control_session_id',String),Column('control_client_id',String),
    Column('queue_sequence',BigInteger,nullable=False),Column('legacy_capture',Boolean,nullable=False))
Index('ix_lab_runtime_active',experiment_runtime.c.active,experiment_runtime.c.experiment_id)
Index('ix_lab_runtime_session_active',experiment_runtime.c.control_session_id,experiment_runtime.c.active,experiment_runtime.c.experiment_id)
Index('ix_lab_runtime_state_queue',experiment_runtime.c.state,experiment_runtime.c.queue_sequence,experiment_runtime.c.experiment_id)
Index('ix_lab_runtime_legacy_capture',experiment_runtime.c.legacy_capture,experiment_runtime.c.experiment_id)


def projection(value):
    state=value.get('state','FAULT');capture=value.get('capture')
    return {'experiment_id':value['experiment_id'],'state':state,'active':state not in ('COMPLETE','FAULT','CREATED'),
        'station_id':value.get('station_id'),'control_session_id':value.get('_control_session_id'),
        'control_client_id':value.get('_control_client_id'),'queue_sequence':value.get('_queue_sequence',0),
        'legacy_capture':isinstance(capture,dict) and 'samples' in capture}
