"""Restore historical PostgreSQL dumps, then migrate with the exact native CLI."""
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
from uuid import uuid4

import pytest
from psycopg import sql
from sqlalchemy import create_engine, text

from scripts.artifact_paths import artifact_directory
from tests.integration.native_remote_cutover_cases import OwnedPostgres
from tests.integration.native_remote_gate_cases import _select_reference, REFERENCE_SHA256

ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = ROOT / "native/tests/db_seed_migrations.py"

# Preserve the complete legacy JSON text, not only a parsed/re-encoded equivalent.
QUERIES = {
    "assignments": "SELECT assignment_id, payload::text FROM lab_assignments ORDER BY assignment_id",
    "experiments": "SELECT sequence, experiment_id, owner_id, payload::text FROM lab_experiments ORDER BY sequence",
    "leases": "SELECT * FROM lab_leases ORDER BY station_id, slot",
    "sessions": "SELECT * FROM lab_sessions ORDER BY session_id",
    "operations": "SELECT owner_id,kind,scope,operation_key,fingerprint,payload::text FROM lab_operations ORDER BY owner_id,kind,scope,operation_key",
    "principals": "SELECT principal_id,kind FROM auth_principals ORDER BY principal_id",
    "access": "SELECT * FROM lab_assignment_access ORDER BY assignment_id",
    "heads": "SELECT sequence,assignment_id,revision,published_revision FROM assignment_documents ORDER BY sequence",
    "revisions": "SELECT assignment_id,revision,definition::text,saved_by FROM assignment_revisions ORDER BY assignment_id,revision",
    "captures": "SELECT capture_id,experiment_id,metadata,available,cleanup_pending FROM lab_captures ORDER BY capture_id",
    "capture_times": "SELECT capture_id,created_at FROM lab_captures WHERE available=TRUE ORDER BY capture_id",
    "projection": "SELECT * FROM lab_experiment_runtime ORDER BY experiment_id",
    "head": "SELECT version_num FROM alembic_version",
}
CATALOG = {
    "columns": """SELECT table_name,column_name,ordinal_position,data_type,is_nullable,column_default
        FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position""",
    "constraints": """SELECT c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid)
        FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' ORDER BY c.relname,k.conname""",
    "indexes": "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
}


def snapshot(pg, database, queries):
    with pg.connect(database) as db:
        return {name: db.execute(query).fetchall() for name, query in queries.items()}


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def cli(native, database_url, lane):
    env = {key: value for key, value in os.environ.items()
        if not key.upper().startswith(("CIRNET_", "NETCIRCUIT_"))}
    env["CIRNET_DATABASE_URL"] = database_url
    result = subprocess.run([str(native), "--migrate"], cwd=lane, env=env,
        capture_output=True, timeout=60)
    (lane / "native-migrate.stderr.log").write_bytes(result.stderr)
    assert result.returncode == 0, "Native migration failed; inspect owned stderr."
    return json.loads(result.stdout)


@pytest.mark.parametrize("rank", [1, 3, 4, 5])
def test_stage4_old_dump_restore_then_native_migration(rank):
    root = artifact_directory(f"native-remote-old-restore/r{rank}-{uuid4().hex}")
    print(f"Stage 4 historical restore r{rank}: {root}", flush=True)
    _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    digest = sha256(native.read_bytes()).hexdigest()
    pg = OwnedPostgres(Path(os.environ["CIRNET_REMOTE_PG_STATE"]))
    seed = runpy.run_path(str(SEED_PATH))
    source, reference, candidate = (pg.create(phase) for phase in ("source", "rollback", "native"))
    engine = create_engine(pg.url(source), hide_parameters=True)
    try:
        seed["legacy"](engine)
        with engine.begin() as db:
            db.execute(seed["assignments"].insert().values(assignment_id="migration-private",
                payload={"assignment_id": "migration-private", "custom": [None, True, 3]}))
        seed["migrate"](engine, seed["REVISIONS"][min(rank, 2)-1])
        if rank >= 2:
            with engine.begin() as db:
                db.execute(seed["assignment_access"].update().where(
                    seed["assignment_access"].c.assignment_id == "migration-assignment").values(published=True))
        if rank > 2:
            seed["migrate"](engine, seed["REVISIONS"][rank-1])
        if rank == 3:
            with engine.begin() as db:
                db.exec_driver_sql("CREATE INDEX ix_lab_experiments_owner_sequence ON lab_experiments(owner_id,sequence)")
        with engine.connect() as db:
            assert db.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == seed["REVISIONS"][rank-1]
    finally:
        engine.dispose()
    assert pg.clients(source) == 0
    source_rows = snapshot(pg, source, {k: QUERIES[k] for k in ("assignments","experiments","leases","sessions","operations")})
    archive = root / "database.dump"
    pg.run("pg_dump", source, ["--format=custom","--no-owner","--no-privileges",f"--file={archive}"], root)
    archive_digest = sha256(archive.read_bytes()).hexdigest()
    # Opaque historical file preservation is distinct from the real NCAP cutover proof.
    original_file = root / "legacy-payload.bin"
    original_file.write_bytes(b"legacy!")
    file_digest = sha256(original_file.read_bytes()).hexdigest()
    for label, database in (("python", reference), ("rust", candidate)):
        lane = root / label
        lane.mkdir()
        pg.run("pg_restore", database, ["--exit-on-error","--no-owner","--no-privileges",
            f"--dbname={database}",str(archive)], lane)
        assert snapshot(pg, database, {k: QUERIES[k] for k in source_rows}) == source_rows
        (lane / "legacy-payload.bin").write_bytes(original_file.read_bytes())
    engine = create_engine(pg.url(reference), hide_parameters=True)
    try:
        seed["migrate"](engine)
    finally:
        engine.dispose()
    result = cli(native, pg.url(candidate), root / "rust")
    assert result["from"] == seed["REVISIONS"][rank-1] and result["to"] == seed["REVISIONS"][-1]
    assert result["applied"] == 7-rank
    assert cli(native, pg.url(candidate), root / "rust")["applied"] == 0
    a, b = (snapshot(pg, database, QUERIES) for database in (reference, candidate))
    ca, cb = (snapshot(pg, database, CATALOG) for database in (reference, candidate))
    assert a == b, [name for name in a if a[name] != b[name]]
    assert ca == cb, [name for name in ca if ca[name] != cb[name]]
    assert snapshot(pg, candidate, {k: QUERIES[k] for k in source_rows}) == source_rows
    assert b["head"] == [("0007_auth_maintenance",)]
    assert len(b["experiments"]) == 107 and b["leases"][0][-1] is True
    assert len(b["captures"]) == 2
    heads = {row[1]: row[3] for row in b["heads"]}
    assert heads["migration-private"] is None
    assert heads["migration-assignment"] == (1 if rank >= 2 else None)
    for lane in (root, root/"python", root/"rust"):
        assert sha256((lane/"legacy-payload.bin").read_bytes()).hexdigest() == file_digest
    with pg.connect(source) as db:
        assert db.execute("SELECT version_num FROM alembic_version").fetchone() == (seed["REVISIONS"][rank-1],)
    assert sha256(archive.read_bytes()).hexdigest() == archive_digest
    assert sha256(native.read_bytes()).hexdigest() == digest
    (root / "comparison.json").write_text(json.dumps({
        "status":"PASS","rank":rank,"candidate_sha256":digest,
        "reference_manifest_sha256":REFERENCE_SHA256,"archive_sha256":archive_digest,
        "payload_sha256":file_digest,"rows_sha256":sha256(encoded(b)).hexdigest(),
        "catalog_sha256":sha256(encoded(cb)).hexdigest(),"legacy_experiments":107,
        "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),
        "seed_sha256":sha256(SEED_PATH.read_bytes()).hexdigest(),
        "databases":{"source":source,"python":reference,"native":candidate},
    },indent=2)+"\n",encoding="utf-8")


def test_stage4_native_active_index_plan():
    root = artifact_directory(f"native-remote-active-index/{uuid4().hex}")
    print(f"Stage 4 native active-index plan: {root}", flush=True)
    _select_reference(root)
    native = Path(os.environ["CIRNET_NATIVE_REMOTE_EXE"]).resolve(strict=True)
    assert native.is_relative_to(artifact_directory())
    pg = OwnedPostgres(Path(os.environ["CIRNET_REMOTE_PG_STATE"]))
    database = pg.create("native")
    assert cli(native, pg.url(database), root)["applied"] == 7
    from app.migrations.schema_v0006 import projection
    terminal=[{"experiment_id":f"history-{i:05}","state":"COMPLETE","private_graph":{"padding":"x"*4096}} for i in range(2000)]
    active={"experiment_id":"running-only","state":"RUNNING","_control_session_id":"session","_control_client_id":"tab"}
    from psycopg.types.json import Json
    with pg.connect(database) as db:
        with db.transaction():
            with db.cursor() as cursor:
                cursor.executemany("INSERT INTO lab_experiments(experiment_id,owner_id,payload) VALUES(%s,%s,%s)",
                    [(value["experiment_id"],"owner",Json(value)) for value in [*terminal,active]])
                for value in [*terminal,active]:
                    row=projection(value)
                    names=list(row)
                    query=sql.SQL("INSERT INTO lab_experiment_runtime ({}) VALUES ({})").format(
                        sql.SQL(",").join(map(sql.Identifier,names)),sql.SQL(",").join(sql.Placeholder()*len(names)))
                    cursor.execute(query,[row[name] for name in names])
            db.execute("ANALYZE lab_experiment_runtime")
            db.execute("ANALYZE lab_experiments")
        source=(ROOT/"native/src/db/runtime/queries.rs").read_text(encoding="utf-8")
        query=re.search(r'"(SELECT r.experiment_id, e.owner_id, r.control_session_id, r.control_client_id.*?LIMIT \$5)"',source,re.S).group(1)
        db.execute("PREPARE native_active(text,text,text,text,bigint) AS "+query)
        literal="EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS) EXECUTE native_active('',NULL,NULL,NULL,100)"
        plans={"native":db.execute(literal).fetchone()[0],
               "legacy":db.execute("EXPLAIN (ANALYZE, FORMAT JSON, BUFFERS) SELECT experiment_id FROM lab_experiment_runtime WHERE active=true ORDER BY experiment_id LIMIT 100").fetchone()[0]}
        assert db.execute("EXECUTE native_active('',NULL,NULL,NULL,100)").fetchall()==[("running-only","owner","session","tab")]
        assert db.execute("EXECUTE native_active('',NULL,'other',NULL,100)").fetchall()==[]
    def nodes(node):
        yield node
        for child in node.get("Plans",[]):yield from nodes(child)
    for plan in plans.values():
        assert any(node.get("Index Name")=="ix_lab_runtime_active" for node in nodes(plan[0]["Plan"]))
    (root/"plans.json").write_text(json.dumps(plans,indent=2)+"\n",encoding="utf-8")
    (root/"comparison.json").write_text(json.dumps({"status":"PASS","terminal_rows":2000,"active_rows":1,
        "candidate_sha256":sha256(native.read_bytes()).hexdigest(),"native_query_sha256":sha256(query.encode()).hexdigest(),
        "harness_sha256":sha256(Path(__file__).read_bytes()).hexdigest(),
        "scope":"Native-migrated schema and exact native SQL query plan; existing public runtime proof remains separate."
    },indent=2)+"\n",encoding="utf-8")
