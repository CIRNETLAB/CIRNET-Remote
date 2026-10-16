# API startup: stale editable environment — 2026-10-16

## Reproduction and cause

The reported command used `services/api/.venv/Scripts/python.exe` (Python 3.14.4)
from `apps/web`. Importing `app.main` failed in `app/services/auth.py` with
`ModuleNotFoundError: No module named 'argon2'`. The same failure was reproduced
with that interpreter before any dependency installation.

The current API `pyproject.toml` already declares `argon2-cffi==25.1.0` and
`alembic==1.20.0`. Both were absent from this environment. Its installed editable
`netcircuit-api==0.1.0` metadata still listed the previous dependency set, including
`grpcio>=1.60`, `protobuf>=5`, `fastapi>=0.110` and `sqlalchemy>=2.0`; it did not
declare Argon2, Alembic or the simulator. Contracts and simulator editable metadata
were also stale, and the Hardware Service distribution was absent.

Editable installation exposed the updated Python source immediately, while the
old installed dependency metadata remained unchanged. `pip check` consequently
reported no broken requirements even before repair: it checks installed metadata,
not the current checkout's `pyproject.toml`. This was environment drift rather
than a missing declaration or an authentication algorithm defect. Installing a
package named `argon2` is not the repair; `argon2-cffi` provides the imported
`argon2` module.

## Repair

Refreshed the existing environment using its exact interpreter, from the repository
root:

```powershell
.\services\api\.venv\Scripts\python.exe -m pip install -r requirements-verification.txt -e . -e './simulator/circuit-simulator[test]' -e './services/api[test]' -e './services/hardware-service[dev]'
.\services\api\.venv\Scripts\python.exe scripts/generate_hardware_rpc.py
.\services\api\.venv\Scripts\python.exe -m pip check
```

All four local package metadata sets were rebuilt. Argon2 25.1.0, Alembic 1.20.0
and their dependencies were installed, together with the declared development and
verification dependencies. The service environment was kept on Python 3.14.4.
No database, session, capture or virtual environment was deleted. Application
authentication, schemas, public contracts and dependency pins required no change.
The README now documents refresh instructions from both the repository root and
`apps/web`, followed by generation, dependency checks and an import smoke check.

The first installation attempt encountered a permission error in the tool's
default sandbox temporary directory before installation. Retrying with
process-local `TEMP`/`TMP` and pip cache under the writable checkout `.build`
completed successfully. These environment overrides were limited to the tool
process; no machine-wide environment settings were changed.

## Verification

- `pip check`: PASS after refresh.
- For all four local distributions, normalized installed runtime requirements
  exactly match their current source `pyproject.toml`, and every installed version
  satisfies its declared requirement: PASS.
- Actual Argon2id hash and verification using `PasswordHasher`: PASS.
- `import alembic` and `from app.main import app` with the user's interpreter:
  PASS. Import succeeds from both the repository root and `apps/web`.
- Hardware RPC generation, context check and `git diff --check`: PASS.
- Real Uvicorn, launched from `apps/web` with that Python 3.14.4 environment and
  `--app-dir ../../services/api`, reaches application startup and serves
  `GET /api/health` and `GET /api/auth/session`: HTTP 200. Session bootstrap
  returns a CSRF token and installs the HttpOnly session cookie. An isolated
  `.build/api-env-smoke-a1465188b41e44f4b648f81d9476ffbf/smoke.sqlite` database and
  separate capture directory were used on an ephemeral loopback port, without
  contacting an existing API or changing its database. Ctrl-Break shutdown logs
  confirm application shutdown and finished server; Windows reports exit 3 for
  this signal. No owned test process remains.
- Full Python suite with the repaired interpreter:
  `services/api/.venv/Scripts/python.exe -m pytest -q --basetemp .build/pytest-api-env-repair`:
  **1,014 PASS, 2 SKIP, 1 warning**, exit 0, 271.04 seconds. The optional FPGA
  compiler tests skip because `pyslang` and Icarus/vvp are absent in this
  environment. The warning is the existing Starlette/httpx TestClient deprecation.
  No Python 3.14 compatibility failure was observed in this run. This does not
  rerun the separate real PostgreSQL, browser or installed-wheel release gates.

Diagnostic logs: `.build/api-env-repair-pytest.log` and
`.build/api-env-smoke-a1465188b41e44f4b648f81d9476ffbf/uvicorn.log` (ignored local
artifacts).

## Reload verification boundary

The real HTTP smoke above ran without `--reload`. A separate invocation with
`--reload --reload-dir ../../services/api` failed inside the tool environment
before application import, at multiprocessing socket reconstruction /
`WaitNamedPipe`, with `FileNotFoundError: [WinError 2]`. A control run with the
previously verified Python 3.12 environment encountered the same IPC failure.
This failure differs from the user's traceback, where the reload child reaches
`app.services.auth` before missing Argon2. Reload startup is therefore not claimed
as verified here, and no Python downgrade or Uvicorn workaround was introduced.
Both owned diagnostic reload process trees were stopped.

The documented development command retains `--reload-dir` so a terminal in
`apps/web` watches the API directory. `--app-dir` controls imports; omitting
`--reload-dir` only changes what source is watched and did not cause the missing
Argon2 dependency. Stop the previous reloader in its own terminal before starting
another API on port 8000.

## Source scope and Git

Only the API setup instructions and this evidence report are changed. The actual
dependency repair lives in the ignored local `.venv`; it cannot be distributed
through a source commit. Other machines must run the documented refresh command.
No automatic package installation or fallback password implementation was added.
No commit, push, merge or deployment was performed for this fix; the user requested
commit text for their own commit.
