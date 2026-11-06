"""Create isolated project transaction fixtures using the pinned Python reference."""
import json, os, sys
from pathlib import Path
from uuid import uuid4
from urllib.parse import quote

directory=Path(sys.argv[1]).resolve(strict=True)
state=json.loads(Path(sys.argv[2]).read_text())
import psycopg
password=Path(state["password_file"]).read_text().strip()
with psycopg.connect(host=state["host"],port=state["port"],user=state["admin_user"],password=password,dbname="postgres",autocommit=True) as db:
    name="stage4_projects_"+uuid4().hex[:14]
    db.execute(psycopg.sql.SQL("CREATE DATABASE {}").format(psycopg.sql.Identifier(name)))
postgres=f"postgresql+psycopg://{quote(state['admin_user'])}:{quote(password)}@{state['host']}:{state['port']}/{name}"
urls={"sqlite": "sqlite:///"+(directory/"projects.sqlite").as_posix(), "postgres":postgres}
os.environ["CIRNET_DATABASE_URL"]=urls["sqlite"]
os.environ["CIRNET_CAPTURE_DIR"]=(directory/"captures").as_posix()
os.environ["CIRNET_SIMULATION_BACKEND"]="legacy"
from app.config import Settings
from app.services.auth import AuthService
from app.services.persistence import Repository
results={}
for key,url in urls.items():
    repo=Repository(url)
    try:
        auth=AuthService(repo,Settings())
        fixture={"url":url}
        for role in ("owner","other","revoked"):
            ctx,token=auth.ensure_session(None)
            fixture[role]={"token":token,"session_id":ctx.session_id,"owner_id":ctx.owner_id}
            if role=="owner":
                with repo.engine.begin() as db: peer,peer_token=auth._new_session(db,ctx.principal_id)
                fixture["peer"]={"token":peer_token,"session_id":peer.session_id,"owner_id":peer.owner_id}
            if role=="revoked": auth.logout(ctx)
        results[key]=fixture
    finally: repo.close()
(directory/"fixture.json").write_text(json.dumps(results),encoding="utf-8")
