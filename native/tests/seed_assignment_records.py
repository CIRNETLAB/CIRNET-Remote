"""Seed Stage 4 assignment tests on the pinned Python Remote."""
import json
import os
from importlib.resources import files
from pathlib import Path
import secrets

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url

from app.config import Settings
from app.services.assignments import AssignmentService
from app.services.auth import AuthService
from app.services.persistence import Repository


def definition(identity, title):
    return {
        "schema_version": "1.0", "assignment_id": identity, "title": title,
        "lab_endpoints": [{"endpoint_id": "UNRESOLVED", "role": "INPUT_SOURCE"}],
        "assessment_policy": "FUNCTIONAL_ONLY",
        "reference_design_graph": {
            "schema_version": "1.0", "circuit_id": "reference", "modules": [], "connections": [],
            "metadata": {"private-answer": "keep"},
        },
        "expected_behavior": {"truth_table": [{"inputs": {"A": 0}, "outputs": {"Y": 1}}]},
    }


def seed(url, output):
    engine = create_engine(url)
    try:
        if inspect(engine).get_table_names():
            raise RuntimeError("Assignment tests require a fresh fixture database.")
    finally:
        engine.dispose()
    repo = Repository(url)
    try:
        auth = AuthService(repo, Settings(environment="test", database_url=url, allow_guest=True))
        secret = secrets.token_urlsafe(24)
        auth.bootstrap_admin("assign-admin", secret)
        guest, _ = auth.ensure_session(None)
        admin, _ = auth.login(guest, "assign-admin", secret)
        for name, role in (
            ("assign-teacher", "INSTRUCTOR"), ("assign-other", "INSTRUCTOR"), ("assign-student", "STUDENT"),
        ):
            auth.create_user(name, secret, role=role, actor=admin)

        def login(name):
            guest, _ = auth.ensure_session(None)
            return auth.login(guest, name, secret)[0]

        teacher = login("assign-teacher")
        guest, _ = auth.ensure_session(None)
        actors = {
            "admin": admin, "teacher": teacher, "teacher2": login("assign-teacher"),
            "other": login("assign-other"), "student": login("assign-student"), "guest": guest,
        }
        service = AssignmentService(repo, auth)
        service.create(teacher, definition("revision-limit", "Revision limit"))
        maximum = 9_007_199_254_740_991
        with repo.engine.begin() as db:
            db.execute(repo.assignment_revisions.insert().values(
                assignment_id="revision-limit", revision=maximum,
                definition=definition("revision-limit", "Revision limit"),
                saved_by=teacher.principal_id, saved_at=1_700_000_000.25,
            ))
            db.execute(repo.assignment_documents.update()
                .where(repo.assignment_documents.c.assignment_id == "revision-limit")
                .values(revision=maximum))
        with output.open("x", encoding="utf-8") as stream:
            json.dump({name: actor.session_id for name, actor in actors.items()}, stream)
    finally:
        repo.close()


if __name__ == "__main__":
    session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
    folder = Path(os.environ["CIRNET_REMOTE_ASSIGNMENT_FIXTURE_DIR"]).resolve()
    if folder == session or not folder.is_relative_to(session):
        raise RuntimeError("Place assignment fixtures in the owned artifact session.")
    folder.mkdir()
    seed("sqlite:///" + (folder / "assignment.sqlite").as_posix(), folder / "sqlite-actors.json")
    graph = json.loads(files("contracts").joinpath(
        "design-models/fixtures/flexible-mounting-parity.json").read_text(encoding="utf-8")
    )["cases"][0]["graph"]
    with (folder / "flexible-graph.json").open("x", encoding="utf-8") as stream:
        json.dump(graph, stream, ensure_ascii=False)
    if value := os.getenv("CIRNET_REMOTE_ASSIGNMENT_FIXTURE_POSTGRES"):
        url = make_url(value)
        if (url.drivername != "postgresql+psycopg" or url.host not in {"127.0.0.1", "::1"}
                or not url.database or not url.database.startswith("cirnet_stage4_db_") or url.query):
            raise RuntimeError("Use an isolated loopback PostgreSQL assignment fixture.")
        seed(value, folder / "postgres-actors.json")
