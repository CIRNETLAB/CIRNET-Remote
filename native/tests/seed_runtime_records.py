"""Seed distinct runtime repository DBs through the pinned Python Remote."""
import hashlib
import json
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url

from app.services.persistence import Repository
from contracts.capture_codec import encode_digital


def seed(url):
    engine = create_engine(url)
    try:
        if inspect(engine).get_table_names():
            raise RuntimeError("Runtime repository fixtures must start empty.")
    finally:
        engine.dispose()
    repo = Repository(url)
    try:
        for sequence, identity in enumerate(("queued-a", "queued-b"), 1):
            repo.create_experiment("runtime-owner", {
                "experiment_id": identity, "station_id": "simulation", "state": "QUEUED",
                "revision": 1, "_queue_sequence": sequence, "_control_session_id": "runtime-session",
                "_control_client_id": "runtime-client", "capture": None, "lease_expires_at": None,
            })
        for identity, station, revision, generation in (
            ("legacy", "legacy-station", 7, None),
            ("collision", "collision-station", 2, "existing-generation"),
        ):
            value = {"experiment_id": identity, "station_id": station, "state": "RUNNING",
                     "revision": revision, "capture": None, "lease_expires_at": 100.0}
            if generation:
                value["_reservation_generation"] = generation
            repo.create_experiment("runtime-owner", value)
            assert repo.reserve(station, 0, identity, 100.0)
        with repo.engine.begin() as db:
            for owner, role in (("runtime-owner", None), ("runtime-instructor", "INSTRUCTOR"),
                                ("runtime-admin", "ADMIN"), ("runtime-disabled", "ADMIN")):
                db.execute(repo.auth_principals.insert().values(
                    principal_id=owner, kind="USER" if role else "GUEST", created_at=1.25))
                if role:
                    db.execute(repo.auth_users.insert().values(
                        principal_id=owner, username=owner, username_key=owner, display_name=owner,
                        password_hash="fixture-not-a-password", role=role,
                        active=owner != "runtime-disabled", auth_revision=0))
            for identity, policy in (("observed", "observed_only"), ("detailed", "detailed")):
                db.execute(repo.assignments.insert().values(assignment_id=identity, payload={"identity": identity}))
                db.execute(repo.assignment_access.insert().values(
                    assignment_id=identity, owner_id="runtime-instructor", published=True, feedback_policy=policy))
            db.execute(repo.projects.insert().values(
                project_id="runtime-project", owner_id="runtime-owner", name="Project",
                description="", created_at=1.25, updated_at=1.25, revision=1, deleted=False))
            db.execute(repo.circuit_documents.insert().values(
                document_id="runtime-doc", project_id="runtime-project", owner_id="runtime-owner",
                name="Circuit", graph_schema_version="1.0", created_at=1.25, updated_at=1.25,
                revision=1, deleted=False))
            db.execute(repo.circuit_revisions.insert().values(
                document_id="runtime-doc", revision=1, name="Circuit", graph_schema_version="1.0",
                graph={"schema_version": "1.0", "circuit_id": "fixture", "modules": [], "connections": []},
                saved_by="runtime-owner", saved_at=1.25))
        if os.getenv("CIRNET_REMOTE_RUNTIME_CAPTURE_FIXTURE") == "true":
            seed_captures(repo)
    finally:
        repo.close()


def seed_captures(repo):
    def metadata(identity):
        binary = encode_digital([{"signal": "y", "time_ns": 0, "value": 1}], 10)
        return {"schema_version": "1.0", "capture_id": identity, "source": "simulation",
                "instrument": "logic_analyzer", "encoding": "digital_events", "available": True,
                "duration_ns": 10, "sample_count": 1, "channel_count": 1, "signals": ["y"],
                "timestamp_ns": "1000000000", "payload_ref": f"/api/captures/{identity}/payload",
                "payload_byte_count": len(binary), "sha256": hashlib.sha256(binary).hexdigest()}

    for identity, capture, state, revision in (
        ("capture-terminal", "capture-old", "COMPLETE", 2),
        ("capture-active-e", "capture-active", "RUNNING", 2),
        ("capture-held-e", "capture-held", "RUNNING", 2),
        ("capture-limit-e", "capture-limit", "COMPLETE", 9_007_199_254_740_991),
    ):
        record = {"experiment_id": identity, "station_id": "capture-station", "state": state,
                  "revision": revision, "capture": None, "lease_expires_at": None}
        repo.create_experiment("runtime-owner", record)
        repo.save_experiment({**record, "capture": metadata(capture)})
        if identity == "capture-terminal":
            repo.save_experiment({**record, "revision": 3, "capture": metadata("capture-current")})
        elif identity == "capture-held-e":
            assert repo.reserve("capture-station", 0, identity, 50.0)
            repo.quarantine(identity)
            repo.save_experiment({**record, "revision": 3, "state": "FAULT", "capture": metadata(capture)})


if __name__ == "__main__":
    session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
    folder = Path(os.environ["CIRNET_REMOTE_RUNTIME_FIXTURE_DIR"]).resolve()
    if folder == session or not folder.is_relative_to(session):
        raise RuntimeError("Runtime fixtures must use the owned artifact session.")
    folder.mkdir()
    seed("sqlite:///" + (folder / "runtime.sqlite").as_posix())
    capture_id = "runtime-fixture-capture"
    binary = encode_digital([{"signal": "y", "time_ns": 0, "value": 1}], 10)
    metadata = {"schema_version": "1.0", "capture_id": capture_id, "source": "simulation",
                "instrument": "logic_analyzer", "encoding": "digital_events", "available": True,
                "duration_ns": 10, "sample_count": 1, "channel_count": 1, "signals": ["y"],
                "timestamp_ns": "1000000000", "payload_ref": f"/api/captures/{capture_id}/payload",
                "payload_byte_count": len(binary), "sha256": hashlib.sha256(binary).hexdigest()}
    with (folder / "capture-metadata.json").open("x", encoding="utf-8") as stream:
        json.dump(metadata, stream)
    if value := os.getenv("CIRNET_REMOTE_RUNTIME_FIXTURE_POSTGRES"):
        url = make_url(value)
        if (url.drivername != "postgresql+psycopg" or url.host not in {"127.0.0.1", "::1"}
                or not url.database or not url.database.startswith("cirnet_stage4_db_") or url.query):
            raise RuntimeError("Use an isolated loopback PostgreSQL runtime fixture.")
        seed(value)
