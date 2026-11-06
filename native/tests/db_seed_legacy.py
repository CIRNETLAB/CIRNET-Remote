"""Create Stage 4 Rust read fixtures using the installed Stage 3 Python migrations.

Point CIRNET_REMOTE_DB_FIXTURE_DIR at a fresh directory in an owned artifact
session. Set CIRNET_REMOTE_DB_FIXTURE_POSTGRES to seed an empty, isolated
loopback database named cirnet_stage4_db_* as well.
"""
import os
from pathlib import Path
import shutil

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url

from app.db import schema
from app.migrations import migrate

OWNER = "stage4-db-owner"
OTHER = "stage4-db-other"
GUEST = "stage4-db-guest"
BIG = 9_007_199_254_740_991
NOW = 1_700_000_000.125


def seed(engine):
    if inspect(engine).get_table_names():
        raise RuntimeError("The legacy DB fixture must start empty.")
    migrate(engine)
    with engine.begin() as db:
        db.execute(schema.principals.insert(), [
            dict(principal_id=OWNER, kind="user", created_at=NOW),
            dict(principal_id=OTHER, kind="user", created_at=NOW),
            dict(principal_id=GUEST, kind="guest", created_at=NOW),
        ])
        db.execute(schema.users.insert(), [
            dict(principal_id=OWNER, username="stage4-owner", username_key="stage4-owner",
                 display_name="Người dùng", password_hash="fixture-not-a-password-hash",
                 role="STUDENT", active=True, auth_revision=7),
            dict(principal_id=OTHER, username="stage4-other", username_key="stage4-other",
                 display_name="Other", password_hash="fixture-not-a-password-hash",
                 role="STUDENT", active=False, auth_revision=11),
        ])
        for identity, key, owner, revision, revoked, claimable in (
            ("account-session", "a", OWNER, 7, False, GUEST),
            ("guest-session", "b", GUEST, 0, False, None),
            ("anonymous-session", "c", None, 0, False, None),
            ("revoked-session", "d", OTHER, 10, True, None),
        ):
            db.execute(schema.auth_sessions.insert().values(
                session_id=identity, token_hash=key * 64, principal_id=owner,
                csrf_token="csrf-fixture", expires_at=1_900_000_000.125, revoked=revoked,
                auth_revision=revision, claimable_guest_id=claimable,
            ))
        for identity, owner, deleted in (
            ("project-foreign", OTHER, False), ("project-a", OWNER, False),
            ("project-b", OWNER, False), ("project-deleted", OWNER, True),
        ):
            db.execute(schema.projects.insert().values(
                project_id=identity, owner_id=owner, name="Mạch số", description="Legacy project",
                created_at=NOW, updated_at=NOW + 0.125, revision=BIG, deleted=deleted,
            ))
        for identity, project, owner, deleted in (
            ("circuit-a", "project-a", OWNER, False),
            ("circuit-deleted", "project-a", OWNER, True),
            ("circuit-b", "project-b", OWNER, False),
            ("circuit-other", "project-foreign", OTHER, False),
        ):
            db.execute(schema.circuit_documents.insert().values(
                document_id=identity, project_id=project, owner_id=owner, name="Mạch số",
                graph_schema_version="1.1", created_at=NOW, updated_at=NOW + 0.125,
                revision=BIG, deleted=deleted,
            ))
        db.execute(schema.circuit_revisions.insert().values(
            document_id="circuit-a", revision=BIG, name="Mạch số", graph_schema_version="1.1",
            graph={"schema_version": "1.1", "circuit_id": "embedded-fixture", "modules": [], "connections": [],
                   "metadata": {"label": "Mạch", "integer": BIG, "float": 0.125}},
            saved_by=OWNER, saved_at=NOW + 0.375,
        ))


def sqlite(directory):
    database = directory / "legacy.sqlite"
    engine = create_engine("sqlite:///" + database.as_posix())
    try:
        seed(engine)
    finally:
        engine.dispose()
    wrong = create_engine("sqlite:///" + (directory / "wrong.sqlite").as_posix())
    try:
        migrate(wrong, "0006_experiment_runtime")
    finally:
        wrong.dispose()
    shutil.copyfile(database, directory / "wal.sqlite")
    shutil.copyfile(database, directory / "hot.sqlite")
    (directory / "wal.sqlite-wal").write_bytes(b"not a closed SQLite snapshot")
    (directory / "hot.sqlite-journal").write_bytes(bytes.fromhex("d9d505f920a163d7"))


def postgres(value):
    url = make_url(value)
    if (url.drivername not in {"postgresql", "postgresql+psycopg"} or
            url.host not in {"127.0.0.1", "::1"} or not url.database or
            not url.database.startswith("cirnet_stage4_db_") or url.query):
        raise RuntimeError("Use an explicit isolated loopback PostgreSQL fixture.")
    engine = create_engine(url.set(drivername="postgresql+psycopg"))
    try:
        seed(engine)
    finally:
        engine.dispose()


if __name__ == "__main__":
    session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
    directory = Path(os.environ["CIRNET_REMOTE_DB_FIXTURE_DIR"]).resolve()
    if not directory.is_relative_to(session) or directory == session:
        raise RuntimeError("Place DB fixtures inside the owned artifact session.")
    directory.mkdir()
    sqlite(directory)
    pg_url = os.getenv("CIRNET_REMOTE_DB_FIXTURE_POSTGRES")
    if pg_url:
        postgres(pg_url)
