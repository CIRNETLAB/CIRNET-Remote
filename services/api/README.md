# Application Backend

FastAPI modular-monolith Lab-First laboratory. Authority: ../../docs/ARCHITECTURE.md. The application includes durable authentication/RBAC, owned Project/Circuit revisions, published assignments, experiments/history, verification, captures and FIFO/lease lifecycle. PostgreSQL is required in production; SQLite is for tests/development. Public contracts and all typed routes: ../../contracts/api/README.md.

Install the root contracts package into both service environments. API also needs grpcio/protobuf and psycopg (declared dependencies). For source-checkout development, install Hardware Service dev extras and run `python scripts/generate_hardware_rpc.py` before startup/tests to create ignored shared RPC bindings. Installed production wheels already contain those bindings and resources; startup needs neither the checkout nor code generation/dev tools. Start hardware_service.server in its own process on localhost50051. An absent gateway reports unavailable; the virtual station executes the existing real digital simulator.

Use one API worker; do not start multiple scheduler workers against the same stations. SQLAlchemy persists definitions/results/sessions/leases and FIFO order; versioned migrations through 0007 upgrade new and legacy databases, including indexed runtime state and bounded auth maintenance. Restart recovers active leases and quarantines failed safe cleanup. Actual PostgreSQL migration/backup/restore and independent-writer tests have run locally; target production deployment remains unverified. Durable principals, server sessions, Argon2id passwords, CSRF/exact-origin and role/object authorization protect HTTP/WebSocket. Follow [auth setup](../../docs/architecture/auth-and-migrations.md) for administrator bootstrap, and the [production guide](../../deployment/README.md) for installed wheels, migration checks, TLS/origins, persistent data and maintenance. Development guests are explicit; production disables them.

## Post-R7 execution and data plane

Physical orchestration is scan → safety verification → TopologyResolver → topology diagnostics → pure infrastructure compilation/executability → ExecutionPolicy → apply routing/guarded power-up → capture → functional verification/assessment. `TopologyResolutionResult.endpoint_bindings` is ResolvedLabBindings; the compiler routes observed student nodes. Reference physical node != student physical node. Topology mismatch and assessment policy cannot block a safe executable circuit; missing required bindings yield BLOCK_UNEXECUTABLE.

Experiment SQL JSON and `experiment.updated` contain CaptureMetadata, never sample arrays. `CaptureStore` uses immutable, atomic NCAP v1 files under `NETCIRCUIT_CAPTURE_DIR`; keep this directory durable with the database. Functional verification consumes raw stored samples and preserves X/absence. Owner/session authorization protects GET/DELETE `/api/captures/{capture_id}/payload`, including a final check after slow reads. Indexed terminal-owner retirement commits unavailable metadata/audit before file deletion; old generations remain separate and failed cleanup is retryable. Byte I/O never holds the global control lock. Stop/release retains historical captures. Default quotas are 256 MiB/4,096 files for one writer; explicit `python -m app.capture_maintenance --limit 100 --dry-run` previews the 30-day bounded policy. Retention 0 disables expiration but retries pending cleanup; active/quarantined captures are excluded. NCAP v2 sampled codecs are library adapters only and install no runtime analog producer. Restart safe cleanup still precedes legacy inline migration. Default observed_only feedback removes reference/answer diagnostics from every HTTP/event/operation snapshot while retaining complete DB evidence.

Hardware admission uses current validated capabilities.physical_execution_slots (zero means unavailable), with FIFO dispatch and station quarantine. `NETCIRCUIT_SIMULATION_WORKERS` is positive/default 4 and must match the Hardware Service setting. Keep one API scheduler process. Instrument channels are 1-based and `instrument_capabilities` is the sole authority. `/api/experiments/{id}/instruments` delegates to ExperimentManager under ownership/lease/state synchronization. Baseline generator configuration is part of the execution plan; live configuration requires RUNNING, explicit runtime support, allocation, fresh safety and profile limits. Current Scope/Generator have zero channels; no electrical bounds are invented.

Typed `/instruments/access`, `/instruments/generator` and `/instruments/commands/{key}` add allocation-aware durable acknowledgement without changing the legacy instrument response. REQUESTED/unknown never replays output; ACCEPTED does not imply APPLIED. Required mutation keys and control-client headers are recorded in OpenAPI. Pre-run configuration is immutable; the server independently validates it.

Projects/circuits use saved revisions and database CAS, with session fences against revoke/guest claim. Create pins the owned document revision and assignment publication. History/active endpoints are bounded and read-only; connection recovery cannot grant Run authority. Students receive only published redacted assignment views. See the architecture guides for [projects](../../docs/architecture/projects-and-revisions.md), [assignments](../../docs/architecture/assignments-and-publication.md), [capture catalog](../../docs/architecture/capture-catalog.md) and [domains](../../docs/architecture/signal-domains-and-simulation.md).

Additive `/api/v2` placement/document/experiment and assignment routes accept Graph
1.2 while legacy public shapes stay frozen. They share the existing ownership, CAS,
publication and immutable admission authority; see [versioned placement](../../contracts/design-models/flexible-placement.md).
New verification follows [VERIFICATION.md](../../docs/VERIFICATION.md), with raw/visual
diagnostics created outside the checkout and retained reports in Markdown. Earlier
test/deployment claims describe their dated evidence, not a rerun during a doc edit.

Final review corrections: observed terminal aliases and resource allocations are solved jointly, without changing student wiring. Unscoped/zero-confidence pin/net evidence cannot infer required physical endpoints; fixed terminals still work. ReadCapture RPC data uses bounded NCAP binary rather than repeating sample signal names in result_json; gateway rejects inconsistent descriptors. Regenerate RPC bindings and restart both local services together before use.

Full supported verification environment from root:

```bash
pip install -r requirements-verification.txt -e . -e './services/api[test]' -e './services/hardware-service[dev]' -e './simulator/circuit-simulator[test]'
python scripts/generate_hardware_rpc.py
python scripts/check_context.py
python scripts/sync_lab_contracts.py --check
pytest -q
python scripts/check_release.py --show-plan
```

`grpcio-tools` comes from Hardware Service dev extras; missing grpc_tools must be repaired in the environment before judging RPC tests. FPGA behavioral tests explicitly skip when Icarus/vvp are absent; static compiler tests do not establish physical safety.

## Local run

The web application's `npm run dev` starts Vite only. Run this API in a second
terminal so Vite can proxy `/api` and `/ws` to `127.0.0.1:8000`. A refused
connection to that address means the API is not listening; restarting Vite alone
does not start it.

### Windows PowerShell

First-time setup, from the repository root (verified locally with Python 3.12; package minimum 3.11):

```powershell
py -3.12 -m venv services/api/.venv
.\services\api\.venv\Scripts\python.exe -m pip install -r requirements-verification.txt -e . -e './simulator/circuit-simulator[test]' -e './services/api[test]' -e './services/hardware-service[dev]'
.\services\api\.venv\Scripts\python.exe scripts/generate_hardware_rpc.py
```

#### Refresh an existing environment after pulling source changes

An editable install updates imported source immediately, but its installed
dependency metadata is only refreshed when the package is installed again. An
older `.venv` can therefore run new API source without its new dependencies;
`pip check` may still pass because it reads the old metadata. For example,
`ModuleNotFoundError: No module named 'argon2'` means the active interpreter lacks
`argon2-cffi`, the package that provides `argon2`. Authentication also requires
Alembic for the database migrations. Both are already declared in
`services/api/pyproject.toml`.

Keep the existing environment and refresh all local packages from the repository
root, then regenerate the ignored RPC bindings:

```powershell
.\services\api\.venv\Scripts\python.exe -m pip install -r requirements-verification.txt -e . -e './simulator/circuit-simulator[test]' -e './services/api[test]' -e './services/hardware-service[dev]'
.\services\api\.venv\Scripts\python.exe scripts/generate_hardware_rpc.py
.\services\api\.venv\Scripts\python.exe -m pip check
.\services\api\.venv\Scripts\python.exe -c "from argon2 import PasswordHasher; import alembic; from app.main import app; print('API imports OK')"
```

Use this interpreter explicitly for installation and startup; installing into a
different Python environment does not repair this one. Restart the API after the
refresh. Installing only `argon2-cffi` can leave other newly declared dependencies
missing. No database deletion or virtual environment reset is needed.

If your terminal is in `apps/web`, the refresh and checks are equivalent to:

```powershell
..\..\services\api\.venv\Scripts\python.exe -m pip install -r ..\..\requirements-verification.txt -e ..\.. -e '../../simulator/circuit-simulator[test]' -e '../../services/api[test]' -e '../../services/hardware-service[dev]'
..\..\services\api\.venv\Scripts\python.exe ..\..\scripts\generate_hardware_rpc.py
..\..\services\api\.venv\Scripts\python.exe -m pip check
..\..\services\api\.venv\Scripts\python.exe -c "from argon2 import PasswordHasher; import alembic; from app.main import app; print('API imports OK')"
```

Root contracts packaging automatically creates
`.build/metadata/netcircuit_contracts.egg-info/` and places other build files
under `.build/`. This ignored cache is independent of `.audit-runtime` and the
service virtual environments. It can be deleted and is recreated on the next
install or build; no manual directory setup is needed on a fresh checkout.

Start the API and keep this terminal running:

First start the local Hardware Service in another terminal with the same environment:

```powershell
.\services\api\.venv\Scripts\python.exe -m hardware_service.server 127.0.0.1:50051
```

It provides the existing virtual station. Starting Vite or the API does not start this RPC service.

```powershell
.\services\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir services/api --reload-dir services/api --host 127.0.0.1 --port 8000 --reload
```

If your terminal is already in `apps/web`, use this equivalent command:

```powershell
..\..\services\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir ..\..\services\api --reload-dir ..\..\services\api --host 127.0.0.1 --port 8000 --reload
```

`--app-dir` selects the import path; `--reload-dir` selects the watched source
directory. Start only one API on port 8000. If another API is already running,
use it or stop it in its original terminal before starting another instance.
On Windows a second bind may report `WinError 10013`.

To identify an existing listener before taking any action:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

These commands use the project's virtual environment directly, so PowerShell
activation and execution-policy changes are unnecessary. The default mode is
simulation; a physical station is not required for these endpoints.

In a separate terminal:

```powershell
cd apps/web
npm run dev
```

Verify the API directly and through Vite (use the port printed by Vite if 5173
is already occupied):

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod http://localhost:5173/api/auth/session -SessionVariable labWebSession
Invoke-RestMethod http://localhost:5173/api/stations -WebSession $labWebSession
```

The health response should identify `netcircuit-api`; station discovery in
simulation mode should return `virtual-station-01` with state `ready`.

### Linux/macOS

```bash
cd services/api
python -m venv .venv
. .venv/bin/activate
pip install -r ../../requirements-verification.txt -e ../.. -e '../../simulator/circuit-simulator[test]' -e '../../services/hardware-service[dev]' -e '.[test]'
python ../../scripts/generate_hardware_rpc.py
# In another terminal with this environment: python -m hardware_service.server 127.0.0.1:50051
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Core execution endpoints (the [generated API reference](../../contracts/api/README.md) lists the complete typed surface):

- `GET /api/health`
- `POST /api/circuits/validate`
- `GET /api/stations`
- `GET/POST /api/assignments`
- `GET/POST /api/experiments`, `GET /api/experiments/{id}`
- `POST /api/experiments/{id}/run`, `POST /api/experiments/{id}/stop`
- `GET /api/experiments/{id}/results`, `POST /api/experiments/{id}/instruments`
- `GET/DELETE /api/captures/{capture_id}/payload`
- `WS /ws/events`
- Authentication/session/admin, Project/Circuit revisions, assignment authoring/publication, bounded history/active snapshots and durable instrument commands are documented in that reference.

This layer validates application intent. It does not write FPGA registers directly.
