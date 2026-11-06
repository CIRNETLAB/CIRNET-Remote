"""Build Stage 4 migration inputs using the exact installed Python Remote.

The SQLite fixture directory must be fresh inside the allocator's session.
Optional PostgreSQL URLs must name empty, isolated loopback databases.
"""
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.migrations import migrate
from app.migrations.schema_v0002 import (
    LEGACY, assignment_access, assignments, experiments, leases, operations, sessions,
)

REVISIONS = (
    "0001_legacy", "0002_auth", "0003_projects", "0004_assignments",
    "0005_captures", "0006_experiment_runtime", "0007_auth_maintenance",
)
RAW_SEALED = (
    '{"state" : "COMPLETE", "label":"Mạch", "capture":{"capture_id":"migration-sealed",'
    '"available":true,"payload_byte_count":7,"payload_ref":"captures/sealed.ncap",'
    '"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",'
    '"timestamp_ns":"1700000000000000125"}}'
)
RAW_INLINE = (
    '{"state":"RUNNING","station_id":"migration-station","_control_session_id":"migration-session",'
    '"_control_client_id":"migration-client","_queue_sequence":9007199254740991,'
    '"capture":{"samples":[0,1,"X"]}}'
)
RAW_TOMBSTONE = (
    '{"state":"COMPLETE","capture":{"capture_id":"migration-tombstone","available":false,'
    '"payload_byte_count":0,"payload_ref":null,"sha256":null}}'
)


def legacy(engine, duplicate=False):
    if inspect(engine).get_table_names():
        raise RuntimeError("Migration fixture must start with an empty database.")
    with engine.begin() as db:
        for table in LEGACY:
            table.create(db)
        db.execute(assignments.insert().values(
            assignment_id="migration-assignment",
            payload={"assignment_id": "migration-assignment", "label": "Mạch", "custom": [1, None, True]},
        ))
        payload = "CAST(:payload AS JSON)" if engine.dialect.name == "postgresql" else ":payload"
        for identity, raw in (
            ("migration-sealed", RAW_SEALED), ("migration-inline", RAW_INLINE),
            ("migration-fault", "{}"), ("migration-tombstone", RAW_TOMBSTONE),
        ):
            db.execute(text(
                "INSERT INTO lab_experiments (experiment_id, owner_id, payload) "
                f"VALUES (:identity, 'migration-guest', {payload})"
            ), {"identity": identity, "payload": raw})
        if duplicate:
            db.execute(text(
                "INSERT INTO lab_experiments (experiment_id, owner_id, payload) "
                f"VALUES ('migration-duplicate', 'migration-guest', {payload})"
            ), {"payload": RAW_SEALED})
        db.execute(experiments.insert(), [
            dict(experiment_id=f"migration-bulk-{i}", owner_id="migration-guest", payload={"state": "CREATED"})
            for i in range(103)
        ])
        db.execute(leases.insert().values(station_id="migration-station", slot=2,
            experiment_id="migration-inline", expires_at=1_700_000_001.5, quarantined=True))
        db.execute(sessions.insert().values(session_id="migration-cookie", expires_at=1_800_000_000.5))
        db.execute(operations.insert().values(owner_id="migration-orphan", kind="run",
            scope="migration-sealed", operation_key="old-key", fingerprint="old-fingerprint",
            payload={"status": "REQUESTED", "extension": {"retained": True}}))


def historical(engine, rank, *, duplicate=False):
    legacy(engine, duplicate=duplicate)
    if rank == 0:
        return
    migrate(engine, REVISIONS[min(rank, 2) - 1])
    if rank >= 2:
        with engine.begin() as db:
            db.execute(assignment_access.update().values(published=True))
    if rank > 2:
        migrate(engine, REVISIONS[rank - 1])


def sqlite_fixture(directory):
    with (directory / "legacy.sqlite").open("xb"):
        pass
    for rank in range(8):
        filename = "legacy.sqlite" if rank == 0 else f"r{rank:04}.sqlite"
        engine = create_engine("sqlite:///" + (directory / filename).as_posix())
        try:
            historical(engine, rank)
            if rank == 3:
                with engine.begin() as db:
                    db.exec_driver_sql("CREATE INDEX ix_lab_experiments_owner_sequence "
                                       "ON lab_experiments (owner_id, sequence)")
        finally:
            engine.dispose()
    for filename, revision in (("unknown.sqlite", "9999_unknown"),
                               ("branched.sqlite", REVISIONS[0]),
                               ("bad-legacy.sqlite", None),
                               ("bad-index.sqlite", REVISIONS[2]),
                               ("duplicate.sqlite", REVISIONS[3])):
        engine = create_engine("sqlite:///" + (directory / filename).as_posix())
        try:
            if filename == "bad-index.sqlite":
                historical(engine, 3)
                with engine.begin() as db:
                    db.exec_driver_sql("CREATE INDEX ix_lab_experiments_owner_sequence "
                                       "ON lab_experiments(owner_id, sequence) WHERE owner_id <> ''")
            elif filename == "duplicate.sqlite":
                historical(engine, 4, duplicate=True)
            else:
                with engine.begin() as db:
                    if revision is None:
                        db.exec_driver_sql("CREATE TABLE lab_experiments (experiment_id VARCHAR)")
                    else:
                        db.exec_driver_sql("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)")
                        db.execute(text("INSERT INTO alembic_version VALUES (:revision)"), {"revision": revision})
                        if filename == "branched.sqlite":
                            db.execute(text("INSERT INTO alembic_version VALUES (:revision)"), {"revision": REVISIONS[-1]})
        finally:
            engine.dispose()


def postgres_fixture(value, *, duplicate=False):
    url = make_url(value)
    if (url.drivername != "postgresql+psycopg" or url.host not in {"127.0.0.1", "::1"}
            or not url.database or not url.database.startswith("cirnet_stage4_db_") or url.query):
        raise RuntimeError("Use an isolated loopback PostgreSQL migration fixture.")
    engine = create_engine(url)
    try:
        historical(engine, 4 if duplicate else 0, duplicate=duplicate)
    finally:
        engine.dispose()


if __name__ == "__main__":
    if directory_value := os.getenv("CIRNET_REMOTE_DB_MIGRATION_SQLITE_DIR"):
        session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
        directory = Path(directory_value).resolve()
        if directory == session or not directory.is_relative_to(session):
            raise RuntimeError("SQLite migration fixtures must use the owned artifact session.")
        directory.mkdir()
        sqlite_fixture(directory)
    if postgres_url := os.getenv("CIRNET_REMOTE_DB_MIGRATION_POSTGRES"):
        postgres_fixture(postgres_url)
    if duplicate_url := os.getenv("CIRNET_REMOTE_DB_MIGRATION_POSTGRES_DUPLICATE"):
        postgres_fixture(duplicate_url, duplicate=True)
