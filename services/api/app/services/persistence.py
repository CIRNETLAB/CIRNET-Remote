"""SQLAlchemy persistence; PostgreSQL production, SQLite development/tests."""
from copy import deepcopy
from threading import RLock
import time
import uuid
from sqlalchemy import Boolean, Column, Float, Integer, JSON, MetaData, String, Table, create_engine, delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool
from contracts.validation import validate

class Repository:
    def __init__(self, url):
        options={}
        if url.startswith("sqlite"):
            options["connect_args"]={"check_same_thread":False}
            if url in ("sqlite://","sqlite:///:memory:"):
                options["poolclass"]=StaticPool
        self.engine=create_engine(url, **options)
        self.lock=RLock()
        meta=MetaData()
        self.assignments=Table("lab_assignments",meta,Column("assignment_id",String,primary_key=True),Column("payload",JSON,nullable=False))
        self.experiments=Table("lab_experiments",meta,Column("sequence",Integer,primary_key=True,autoincrement=True),
            Column("experiment_id",String,unique=True,nullable=False),Column("owner_id",String,nullable=False),Column("payload",JSON,nullable=False))
        self.lease_table=Table("lab_leases",meta,Column("station_id",String,primary_key=True),Column("slot",Integer,primary_key=True),
            Column("experiment_id",String,unique=True,nullable=False),Column("expires_at",Float,nullable=False),Column("quarantined",Boolean,nullable=False))
        self.sessions=Table("lab_sessions",meta,Column("session_id",String,primary_key=True),Column("expires_at",Float,nullable=False))
        meta.create_all(self.engine)

    def create_assignment(self,value):
        value=validate("AssignmentDefinition",value)
        try:
            with self.lock,self.engine.begin() as db:
                db.execute(insert(self.assignments).values(assignment_id=value["assignment_id"],payload=value))
        except IntegrityError:
            raise ValueError("ASSIGNMENT_EXISTS") from None
        return value

    def get_assignment(self,assignment_id):
        with self.lock,self.engine.connect() as db:
            value=db.execute(select(self.assignments.c.payload).where(self.assignments.c.assignment_id==assignment_id)).scalar_one_or_none()
        if value is None: raise KeyError("ASSIGNMENT_NOT_FOUND")
        return deepcopy(value)

    def list_assignments(self):
        with self.lock,self.engine.connect() as db:
            return deepcopy(list(db.execute(select(self.assignments.c.payload).order_by(self.assignments.c.assignment_id)).scalars()))

    def create_experiment(self,owner,value):
        with self.lock,self.engine.begin() as db:
            db.execute(insert(self.experiments).values(experiment_id=value["experiment_id"],owner_id=owner,payload=deepcopy(value)))

    def get_experiment(self,experiment_id,owner=None):
        with self.lock,self.engine.connect() as db:
            row=db.execute(select(self.experiments).where(self.experiments.c.experiment_id==experiment_id)).mappings().first()
        if row is None: raise KeyError("EXPERIMENT_NOT_FOUND")
        if owner is not None and row["owner_id"] != owner: raise PermissionError("FORBIDDEN")
        return deepcopy(row["payload"])

    def owner(self,experiment_id):
        with self.lock,self.engine.connect() as db:
            row=db.execute(select(self.experiments.c.owner_id).where(self.experiments.c.experiment_id==experiment_id)).scalar_one_or_none()
        if row is None: raise KeyError("EXPERIMENT_NOT_FOUND")
        return row

    def save_experiment(self,value):
        with self.lock,self.engine.begin() as db:
            db.execute(update(self.experiments).where(self.experiments.c.experiment_id==value["experiment_id"]).values(payload=deepcopy(value)))

    def list_experiments(self,owner=None):
        query=select(self.experiments.c.payload).order_by(self.experiments.c.sequence)
        if owner is not None: query=query.where(self.experiments.c.owner_id==owner)
        with self.lock,self.engine.connect() as db:
            return deepcopy(list(db.execute(query).scalars()))

    def reserve(self,station_id,slot,experiment_id,expires):
        try:
            with self.lock,self.engine.begin() as db:
                db.execute(insert(self.lease_table).values(station_id=station_id,slot=slot,experiment_id=experiment_id,expires_at=expires,quarantined=False))
            return True
        except IntegrityError: return False

    def leases(self):
        with self.lock,self.engine.connect() as db:
            return [dict(row) for row in db.execute(select(self.lease_table)).mappings()]

    def release(self,experiment_id):
        with self.lock,self.engine.begin() as db:
            db.execute(delete(self.lease_table).where(self.lease_table.c.experiment_id==experiment_id))

    def quarantine(self,experiment_id):
        with self.lock,self.engine.begin() as db:
            db.execute(update(self.lease_table).where(self.lease_table.c.experiment_id==experiment_id).values(quarantined=True))

    def session(self,cookie,ttl=86400):
        now=time.time()
        with self.lock,self.engine.begin() as db:
            db.execute(delete(self.sessions).where(self.sessions.c.expires_at<now))
            expiry=db.execute(select(self.sessions.c.expires_at).where(self.sessions.c.session_id==cookie)).scalar_one_or_none() if cookie else None
            if expiry is not None: return cookie
            session=uuid.uuid4().hex
            db.execute(insert(self.sessions).values(session_id=session,expires_at=now+ttl))
            return session

    def session_exists(self,cookie):
        if not cookie: return False
        with self.lock,self.engine.connect() as db:
            expiry=db.execute(select(self.sessions.c.expires_at).where(self.sessions.c.session_id==cookie)).scalar_one_or_none()
        return expiry is not None and expiry>time.time()

    def close(self):
        self.engine.dispose()
