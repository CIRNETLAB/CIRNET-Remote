"""Seed real Python-r8 guest claim and stale Stop cases on isolated databases."""
import json
import os
from pathlib import Path
import secrets

from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url

from app.config import Settings
from app.services.auth import AuthService
from app.services.operations import request_fingerprint
from app.services.persistence import Repository


def seed(url, output):
    engine = create_engine(url)
    try:
        if inspect(engine).get_table_names():
            raise RuntimeError("Stop claim fixtures require an empty database.")
    finally:
        engine.dispose()
    repo = Repository(url)
    try:
        auth = AuthService(repo, Settings(environment="test", database_url=url, allow_guest=True))
        password = secrets.token_urlsafe(24)
        auth.bootstrap_admin("stop-claim-user", password)
        sessions = {}
        for identity in ("claim-keyless", "claim-keyed", "revoked-stop"):
            guest, _ = auth.ensure_session(None)
            if identity.startswith("claim-"):
                with repo.lock, repo.engine.begin() as db:
                    older, _ = auth._new_session(db, guest.owner_id)
                account, _ = auth.login(guest, "stop-claim-user", password)
                assert account.claimable_guest_id == older.owner_id
                sessions[identity] = {"old": older.session_id, "claim": account.session_id}
            else:
                older = guest
                sessions[identity] = {"old": older.session_id}
            repo.create_experiment(older.owner_id, {
                "schema_version": "1.0", "experiment_id": identity, "circuit_id": identity,
                "mode": "simulation", "station_id": "virtual-station-01", "state": "CREATED",
                "revision": 0, "state_history": ["CREATED"], "capture": None,
                "assignment_id": None, "error_code": None, "queue_position": None,
                "lease_expires_at": None,
            })
            if identity == "claim-keyed":
                repo.begin_operation(older.owner_id, "stop", "old-stop", identity,
                                     request_fingerprint({"experiment_id": identity}))
        with output.open("x", encoding="utf-8") as stream:
            json.dump(sessions, stream)
    finally:
        repo.close()


if __name__ == "__main__":
    session = Path(os.environ["CIRNET_ARTIFACTS_SESSION"]).resolve(strict=True)
    folder = Path(os.environ["CIRNET_REMOTE_STOP_CLAIM_DIR"]).resolve()
    if folder == session or not folder.is_relative_to(session):
        raise RuntimeError("Stop claim fixtures must use the owned artifact session.")
    folder.mkdir()
    seed("sqlite:///" + (folder / "stop.sqlite").as_posix(), folder / "sqlite-sessions.json")
    if value := os.getenv("CIRNET_REMOTE_STOP_CLAIM_POSTGRES"):
        url = make_url(value)
        if (url.drivername != "postgresql+psycopg" or url.host not in {"127.0.0.1", "::1"}
                or not url.database or not url.database.startswith("cirnet_stage4_db_") or url.query):
            raise RuntimeError("Use a dedicated loopback PostgreSQL Stop claim fixture.")
        seed(value, folder / "postgres-sessions.json")
