"""Exact Python-r8 DB-only reference driver, executed from its verified venv."""
from hashlib import sha256
from importlib.metadata import version
import json
import os
from pathlib import Path
import re
import sys
from time import perf_counter_ns

from sqlalchemy import create_engine, inspect, insert
from sqlalchemy.engine import make_url

from app.migrations.schema_v0006 import projection
from app.services.persistence import Repository

WARMUP = 10
SAMPLES = 200


def owned_path(name):
    return Path(os.environ[name]).resolve(strict=True)


def validated_url(mode, lane):
    raw = os.environ["CIRNET_DATABASE_URL"]
    url = make_url(raw)
    assert not url.query
    if url.drivername == "sqlite":
        path = Path(url.database).resolve()
        assert path.parent == lane and path.name == ("seed.sqlite" if mode == "seed" else "remote.sqlite")
        assert (not path.exists()) if mode == "seed" else path.is_file()
    else:
        assert url.drivername == "postgresql+psycopg" and url.host in {"127.0.0.1", "::1"}
        assert re.fullmatch(r"stage4_http_[0-9a-f]{16}", url.database)
    return raw


def configure(repo):
    with repo.engine.connect() as db:
        if repo.engine.dialect.name == "sqlite":
            result = {name: db.exec_driver_sql(f"PRAGMA {name}").scalar_one()
                      for name in ("journal_mode", "synchronous", "foreign_keys")}
            assert result == {"journal_mode": "delete", "synchronous": 2, "foreign_keys": 1}
            result["sqlite_version"] = db.exec_driver_sql("SELECT sqlite_version()").scalar_one()
            return result
        result = {}
        for setting in ("server_version", "transaction_isolation", "synchronous_commit",
                        "fsync", "full_page_writes", "block_size"):
            result[setting] = db.exec_driver_sql(f"SHOW {setting}").scalar_one()
        assert result["transaction_isolation"] == "read committed"
        assert result["synchronous_commit"] == result["fsync"] == "on"
        return result


def seed(url, spec, lane):
    engine = create_engine(url)
    try:
        assert not inspect(engine).get_table_names(), "The diagnostic seed must be empty."
    finally:
        engine.dispose()
    repo = Repository(url)
    try:
        config = configure(repo)
        history = [
            (spec["owner"], {**spec["read_payload"], "experiment_id": f"history-{index:05d}"})
            for index in range(spec["history_count"])
        ]
        active = []
        for index in range(spec["active_count"]):
            owner = spec["owner"] if index == 0 else f"db-profile-owner-{index:02d}"
            active.append((owner, {
                **spec["read_payload"], "experiment_id": f"active-{index:02d}", "state": "QUEUED",
                "revision": 1, "state_history": ["CREATED", "QUEUED"], "_queue_sequence": index + 1,
                "_control_session_id": spec["session"] if index == 0 else f"db-profile-session-{index:02d}",
                "_control_client_id": spec["client"] if index == 0 else f"db-profile-client-{index:02d}",
            }))
        rows = [*history, *active, (spec["owner"], spec["read_payload"]),
                (spec["owner"], spec["update_payload"])]
        with repo.lock, repo.engine.begin() as db:
            assert db.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one() == "0007_auth_maintenance"
            db.execute(insert(repo.experiments), [{"experiment_id": payload["experiment_id"],
                "owner_id": owner, "payload": payload} for owner, payload in rows])
            db.execute(insert(repo.experiment_runtime), [projection(payload) for _, payload in rows])
            db.exec_driver_sql("ANALYZE lab_experiments")
            db.exec_driver_sql("ANALYZE lab_experiment_runtime")
        assert repo.experiment_snapshot(spec["read_payload"]["experiment_id"]) == (spec["owner"], spec["read_payload"])
        receipt = {"row_count": len(rows), "database_configuration": config,
                   "payloads_sha256": sha256(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
        with (lane / "seed.json").open("x", encoding="utf-8") as out:
            json.dump(receipt, out, indent=2)
    finally:
        repo.close()


def measure(url, spec, lane):
    repo = Repository(url)
    try:
        config = configure(repo)
        read_id = spec["read_payload"]["experiment_id"]
        update_id = spec["update_payload"]["experiment_id"]
        assert repo.experiment_snapshot(update_id) == (spec["owner"], spec["update_payload"])
        cases = {"snapshot": [], "active_page": [], "update": []}
        payload = spec["update_payload"].copy()
        start_revision = payload["revision"]

        for index in range(WARMUP + SAMPLES):
            start = perf_counter_ns()
            owner, read = repo.experiment_snapshot(read_id)
            elapsed = perf_counter_ns() - start
            assert owner == spec["owner"] and read == spec["read_payload"]
            snapshot = {"total_ns": elapsed}

            start = perf_counter_ns()
            active = repo.active_experiments(spec["owner"], session_id=spec["session"],
                                             client_id=spec["client"], after="", limit=100, payload=False)
            elapsed = perf_counter_ns() - start
            assert active == spec["active_rows"]
            page = {"total_ns": elapsed}

            payload["revision"] = start_revision + index + 1
            start = perf_counter_ns()
            with repo.lock:
                locked = perf_counter_ns()
                with repo.engine.begin() as db:
                    begun = perf_counter_ns()
                    changed = repo._save_experiment(db, payload)
                    operated = perf_counter_ns()
                committed = perf_counter_ns()
            total = perf_counter_ns() - start
            assert changed.rowcount == 1
            if index >= WARMUP:
                cases["snapshot"].append(snapshot)
                cases["active_page"].append(page)
                cases["update"].append({
                    "total_ns": total, "lock_ns": locked - start, "begin_ns": begun - locked,
                    "operation_ns": operated - begun, "commit_ns": committed - operated,
                })
        owner, final = repo.experiment_snapshot(update_id)
        assert owner == spec["owner"] and final == payload
        with (lane / "samples.json").open("x", encoding="utf-8") as out:
            json.dump({"backend": repo.engine.dialect.name.replace("postgresql", "postgres"),
                       "config": config, "config_scope": "production SQLAlchemy repository connection",
                       "driver_versions": {"python": sys.version.split()[0], "sqlalchemy": version("sqlalchemy"),
                                           "psycopg": version("psycopg") if "server_version" in config else None},
                       "read_payload": spec["read_payload"], "active_rows": spec["active_rows"],
                       "final_payload": final, "observations": cases}, out)
    finally:
        repo.close()


if __name__ == "__main__":
    assert len(sys.argv) == 2 and sys.argv[1] in {"seed", "measure"}
    assert not any(key in os.environ for key in ("CIRNET_SQLITE_ROLLBACK_JOURNAL",
                                                 "NETCIRCUIT_SQLITE_ROLLBACK_JOURNAL"))
    lane = owned_path("CIRNET_STAGE4_DB_COMPONENT_LANE")
    session = owned_path("CIRNET_ARTIFACTS_SESSION")
    spec_path = owned_path("CIRNET_STAGE4_DB_COMPONENT_SPEC")
    assert lane != session and lane.is_relative_to(session) and spec_path.is_relative_to(session)
    spec = json.loads(spec_path.read_bytes())
    assert (spec["warmup"], spec["samples"]) == (WARMUP, SAMPLES)
    mode = sys.argv[1]
    url = validated_url(mode, lane)
    (seed if mode == "seed" else measure)(url, spec, lane)
