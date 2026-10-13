# Application Backend

FastAPI modular-monolith Lab-First laboratory on a Linux Mini PC. Authority: ../../docs/ARCHITECTURE.md. R4 implements assignment/experiment/station/verification/persistence and FIFO/lease lifecycle. PostgreSQL is required in production; SQLite is optional for tests/development. Public contracts: ../../contracts/api/README.md.

Install root contracts package into both service environments. API also needs grpcio/protobuf and psycopg (declared dependencies). Install Hardware Service dev extras and run python scripts/generate_hardware_rpc.py before startup/package build to create shared contracts/generated. Start hardware_service.server in its own process on localhost 50051. An absent gateway reports unavailable; R5 enables actual virtual execution.

V1 uses one API worker (systemd default); do not start multiple scheduler workers against the same stations. SQLAlchemy persists definitions/results/sessions/leases and FIFO order, creates schema on bootstrap, recovers active leases on restart and quarantines failed safety cleanup. Production PostgreSQL server/deployment have not been validated here. Anonymous owner sessions isolate users; login/RBAC is a later deployment boundary.

## Post-R7 execution and data plane

Physical orchestration is scan → safety verification → TopologyResolver → topology diagnostics → pure infrastructure compilation/executability → ExecutionPolicy → apply routing/guarded power-up → capture → functional verification/assessment. `TopologyResolutionResult.endpoint_bindings` is ResolvedLabBindings; the compiler routes observed student nodes. Reference physical node != student physical node. Topology mismatch and assessment policy cannot block a safe executable circuit; missing required bindings yield BLOCK_UNEXECUTABLE.

Experiment SQL JSON and `experiment.updated` contain CaptureMetadata, never inline sample arrays. `CaptureStore` V1 uses atomic filesystem files under `NETCIRCUIT_CAPTURE_DIR` (default `.runtime/captures`); keep this directory durable alongside the database in production. FunctionalVerificationService loads the payload through CaptureService and returns declared signal/truth-case evidence, preserving X/absence. Anonymous session ownership is enforced for GET/DELETE `/api/captures/{capture_id}/payload`. GET returns NCAP binary; DELETE requires a terminal experiment after lease cleanup, removes payload and marks historical metadata unavailable. No automatic retention expiry in V1; owners delete explicitly. Restart safe cleanup precedes migration of old inline captures; storage I/O failure preserves valid old evidence for retry.

Hardware admission uses current validated capabilities.physical_execution_slots (zero means unavailable), with FIFO dispatch and station quarantine. `NETCIRCUIT_SIMULATION_WORKERS` is positive/default 4 and must match the Hardware Service setting. Keep one API scheduler process. Instrument channels are 1-based and `instrument_capabilities` is the sole authority. `/api/experiments/{id}/instruments` delegates to ExperimentManager under ownership/lease/state synchronization. Baseline generator configuration is part of the execution plan; live configuration requires RUNNING, explicit runtime support, allocation, fresh safety and profile limits. Current Scope/Generator have zero channels; no electrical bounds are invented.

Final review corrections: observed terminal aliases and resource allocations are solved jointly, without changing student wiring. Unscoped/zero-confidence pin/net evidence cannot infer required physical endpoints; fixed terminals still work. ReadCapture RPC data uses bounded NCAP binary rather than repeating sample signal names in result_json; gateway rejects inconsistent descriptors. Regenerate RPC bindings and restart both local services together before use.

Full supported verification environment from root:

```bash
pip install -e . -e './services/api[test]' -e './services/hardware-service[dev]' -e './simulator/circuit-simulator[test]'
python scripts/generate_hardware_rpc.py
python scripts/check_context.py
python scripts/sync_lab_contracts.py --check
pytest -q
```

`grpcio-tools` comes from Hardware Service dev extras; missing grpc_tools must be repaired in the environment before judging RPC tests. FPGA behavioral tests explicitly skip when Icarus/vvp are absent; static compiler tests do not establish physical safety.

## Local run

The web application's `npm run dev` starts Vite only. Run this API in a second
terminal so Vite can proxy `/api` and `/ws` to `127.0.0.1:8000`. A refused
connection to that address means the API is not listening; restarting Vite alone
does not start it.

### Windows PowerShell

First-time setup, from the repository root (Python 3.11 or newer):

```powershell
py -3 -m venv services/api/.venv
.\services\api\.venv\Scripts\python.exe -m pip install -e . -e './services/api[test]'
```

Root contracts packaging automatically creates
`.build/metadata/netcircuit_contracts.egg-info/` and places other build files
under `.build/`. This ignored cache is independent of `.audit-runtime` and the
service virtual environments. It can be deleted and is recreated on the next
install or build; no manual directory setup is needed on a fresh checkout.

Start the API and keep this terminal running:

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
Invoke-RestMethod http://localhost:5173/api/stations
```

The health response should identify `netcircuit-api`; station discovery in
simulation mode should return `virtual-station-01` with state `ready`.

### Linux/macOS

```bash
cd services/api
python -m venv .venv
. .venv/bin/activate
pip install -e ../.. -e '.[test]'
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Current endpoints:

- `GET /api/health`
- `POST /api/circuits/validate`
- `GET /api/stations`
- `GET/POST /api/assignments`
- `GET/POST /api/experiments`, `GET /api/experiments/{id}`
- `POST /api/experiments/{id}/run`, `POST /api/experiments/{id}/stop`
- `GET /api/experiments/{id}/results`, `POST /api/experiments/{id}/instruments`
- `GET/DELETE /api/captures/{capture_id}/payload`
- `WS /ws/events`

This layer validates application intent. It does not write FPGA registers directly.
