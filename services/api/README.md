# CIRNET Application Backend

FastAPI modular-monolith Lab-First laboratory. Authority: ../../docs/ARCHITECTURE.md. The application includes durable authentication/RBAC, owned Project/Circuit revisions, published assignments, experiments/history, verification, captures and FIFO/lease lifecycle. PostgreSQL is required in production; SQLite is for tests/development. Public contracts and all typed routes: ../../contracts/api/README.md.

Install the reviewed `netcircuit-contracts==0.1.1` wheel into both service environments using the current versioned artifact manifest (`python scripts/install_contracts.py --with-dev --manifest ABSOLUTE_MANIFEST` from Remote root for development). Both services also install the same reviewed `netcircuit-simulator==0.1.1` wheel using `python scripts/install_simulator.py --manifest ABSOLUTE_SIMULATOR_MANIFEST`; no retained Simulator source or editable install is required. API also needs grpcio/protobuf and psycopg (declared dependencies). RPC bindings and offline resources come from that wheel; `python scripts/generate_hardware_rpc.py --check` verifies them without writing retained source. Production needs neither source Contracts nor DEV tools. Start hardware_service.server in its own process on localhost50051. An absent gateway reports unavailable; the virtual station executes the existing real digital simulator.

Use one API worker; do not start multiple scheduler workers against the same stations. SQLAlchemy persists definitions/results/sessions/leases and FIFO order; versioned migrations through 0007 upgrade new and legacy databases, including indexed runtime state and bounded auth maintenance. Restart recovers active leases and quarantines failed safe cleanup. Actual PostgreSQL migration/backup/restore and independent-writer tests have run locally; target production deployment remains unverified. Durable principals, server sessions, Argon2id passwords, CSRF/exact-origin and role/object authorization protect HTTP/WebSocket. Follow [auth setup](../../docs/architecture/auth-and-migrations.md) for administrator bootstrap, and the [production guide](../../deployment/README.md) for installed wheels, migration checks, TLS/origins, persistent data and maintenance. Development guests are explicit; production disables them.

Current source owner: [CIRNETLAB/CIRNET-Remote](https://github.com/CIRNETLAB/CIRNET-Remote).
All six product selections are 0.1.1; Python/npm/import/environment identities
remain compatible. Earlier M1–M5 pins in dated reports are historical. Use the
current [system installer/runbook](../../deployment/multi-repo-release.md) for
artifact-only clean installation; the editable API commands below are owner-local
development setup. Existing immutable packages retain their recorded source SHA,
and unpublished rename candidates are not selected implicitly.

## Post-R7 execution and data plane

Physical orchestration is scan → safety verification → TopologyResolver → topology diagnostics → pure infrastructure compilation/executability → ExecutionPolicy → apply routing/guarded power-up → capture → functional verification/assessment. `TopologyResolutionResult.endpoint_bindings` is ResolvedLabBindings; the compiler routes observed student nodes. Reference physical node != student physical node. Topology mismatch and assessment policy cannot block a safe executable circuit; missing required bindings yield BLOCK_UNEXECUTABLE.

Experiment SQL JSON and `experiment.updated` contain CaptureMetadata, never sample arrays. `CaptureStore` uses immutable, atomic NCAP v1 files under `NETCIRCUIT_CAPTURE_DIR`; keep this directory durable with the database. Functional verification consumes raw stored samples and preserves X/absence. Owner/session authorization protects GET/DELETE `/api/captures/{capture_id}/payload`, including a final check after slow reads. Indexed terminal-owner retirement commits unavailable metadata/audit before file deletion; old generations remain separate and failed cleanup is retryable. Byte I/O never holds the global control lock. Stop/release retains historical captures. Default quotas are 256 MiB/4,096 files for one writer; explicit `python -m app.capture_maintenance --limit 100 --dry-run` previews the 30-day bounded policy. Retention 0 disables expiration but retries pending cleanup; active/quarantined captures are excluded. NCAP v2 sampled codecs are library adapters only and install no runtime analog producer. Restart safe cleanup still precedes legacy inline migration. Default observed_only feedback removes reference/answer diagnostics from every HTTP/event/operation snapshot while retaining complete DB evidence.

Hardware admission uses current validated capabilities.physical_execution_slots (zero means unavailable), with FIFO dispatch and station quarantine. `NETCIRCUIT_SIMULATION_WORKERS` is positive/default 4 and must match the Hardware Service setting. Keep one API scheduler process. Instrument channels are 1-based and `instrument_capabilities` is the sole authority. `/api/experiments/{id}/instruments` delegates to ExperimentManager under ownership/lease/state synchronization. Baseline generator configuration is part of the execution plan; live configuration requires RUNNING, explicit runtime support, allocation, fresh safety and profile limits. Current Scope/Generator have zero channels; no electrical bounds are invented.

Typed `/instruments/access`, `/instruments/generator` and `/instruments/commands/{key}` add allocation-aware durable acknowledgement without changing the legacy instrument response. REQUESTED/unknown never replays output; ACCEPTED does not imply APPLIED. Required mutation keys and control-client headers are recorded in OpenAPI. Pre-run configuration is immutable; the server independently validates it.

Set `NETCIRCUIT_SIMULATION_BACKEND=legacy` in both API and Hardware environments to preserve existing behavior. API settings freeze the selection at app creation; both physical-preview routes use that setting. The reserved `ngspice` backend returns an explicit unavailable response while structural validation and document storage remain usable. Unknown or empty selectors fail startup. Restart both services when changing this setting; no native executable/library is installed or discovered by it.

Projects/circuits use saved revisions and database CAS, with session fences against revoke/guest claim. Create pins the owned document revision and assignment publication. History/active endpoints are bounded and read-only; connection recovery cannot grant Run authority. Students receive only published redacted assignment views. See the architecture guides for [projects](../../docs/architecture/projects-and-revisions.md), [assignments](../../docs/architecture/assignments-and-publication.md), [capture catalog](../../docs/architecture/capture-catalog.md) and [domains](../../docs/architecture/signal-domains-and-simulation.md).

Additive `/api/v2` placement/document/experiment and assignment routes accept Graph
1.2 while legacy public shapes stay frozen. They share the existing ownership, CAS,
publication and immutable admission authority; see [versioned placement](../../contracts/design-models/flexible-placement.md).
New verification follows [VERIFICATION.md](../../docs/VERIFICATION.md), with raw/visual
diagnostics created outside the checkout and retained reports in Markdown. Earlier
test/deployment claims describe their dated evidence, not a rerun during a doc edit.

Final review corrections: observed terminal aliases and resource allocations are solved jointly, without changing student wiring. Unscoped/zero-confidence pin/net evidence cannot infer required physical endpoints; fixed terminals still work. ReadCapture RPC data uses bounded NCAP binary rather than repeating sample signal names in result_json; gateway rejects inconsistent descriptors. Install the same reviewed Contracts artifact and restart both local services together before use.

Full supported verification environment from root:

```bash
python scripts/install_contracts.py --with-dev --manifest ABSOLUTE_MANIFEST
python scripts/install_simulator.py --manifest ABSOLUTE_SIMULATOR_MANIFEST
python scripts/install_hardware.py --manifest ABSOLUTE_HARDWARE_MANIFEST
python -m pip install -r requirements-verification.txt -e './services/api[test]'
export NETCIRCUIT_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)"
export NETCIRCUIT_FPGA_ARTIFACT_MANIFEST=/absolute/reviewed/fpga-artifacts.json
export NETCIRCUIT_FPGA_ROOT="$(python -B scripts/install_fpga.py --manifest "$NETCIRCUIT_FPGA_ARTIFACT_MANIFEST" | python -c 'import json,sys; print(json.load(sys.stdin)["fpgaRoot"])')"
python scripts/generate_hardware_rpc.py --check
python scripts/check_context.py
python scripts/sync_lab_contracts.py --check
python scripts/check_release.py --group python
python scripts/check_release.py --show-plan
```

Hardware is installed as the reviewed `netcircuit-hardware-service==0.1.1` wheel using `scripts/install_hardware.py`; the retained service source is a frozen reference. Runtime RPC bindings come from Contracts, so RPC tests do not generate code or require Hardware dev extras. Root generator verification dependencies remain in requirements-codegen.txt. Full release verification also selects FPGA source/scaffold 0.1.1 as shown above; API local runtime needs no FPGA artifact. Mandatory native RTL acceptance belongs to CIRNET-FPGA; missing pinned tools fail that gate, and software/compiler results do not establish physical safety.

## Local run

The web application's `npm run dev` starts Vite only. Run this API in a second
terminal so Vite can proxy `/api` and `/ws` to `127.0.0.1:8000`. A refused
connection to that address means the API is not listening; restarting Vite alone
does not start it.

### Windows PowerShell

First-time setup from the Remote repository root, with Python 3.12 (package minimum 3.11). Select the reviewed current 0.1.1 artifact manifest before installing consumer packages:

```powershell
py -3.12 -m venv services/api/.venv
$env:NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST = 'C:\absolute\reviewed\artifacts.json'
.\services\api\.venv\Scripts\python.exe scripts/install_contracts.py --with-dev --manifest $env:NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST
$env:NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST = 'C:\absolute\reviewed\simulator-artifacts.json'
.\services\api\.venv\Scripts\python.exe scripts/install_simulator.py
$env:NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST = 'C:\absolute\reviewed\hardware-artifacts.json'
.\services\api\.venv\Scripts\python.exe scripts/install_hardware.py
.\services\api\.venv\Scripts\python.exe -m pip install -r requirements-verification.txt -e './services/api[test]'
.\services\api\.venv\Scripts\python.exe scripts/generate_hardware_rpc.py --check
.\services\api\.venv\Scripts\python.exe -m pip check
```

#### Refresh an existing environment after pulling source changes

Editable consumer source updates immediately, but installed dependency metadata
changes only when the packages are installed again. An older environment can
therefore lack newly declared dependencies even if `pip check` still passes.
For example, `argon2-cffi` supplies `argon2`, and authentication also requires
Alembic; both are declared by the API package.

Keep the existing environment. From Remote root, rerun the reviewed Contracts,
Simulator and Hardware installers when selecting an updated artifact set, then rerun the consumer
installation and `pip check` commands above using this same interpreter.
Restart both local services after updating their compatibility set. RPC bindings
come from the installed Contracts wheel; `generate_hardware_rpc.py --check`
verifies their provenance. Root Contracts source installation and regeneration
are not development prerequisites.

Start the local Hardware Service in one terminal, from Remote root:

```powershell
.\services\api\.venv\Scripts\python.exe -m hardware_service.server 127.0.0.1:50051
```

It provides the existing virtual station. Start the API in another terminal,
also from Remote root:

```powershell
.\services\api\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir services/api --reload-dir services/api --host 127.0.0.1 --port 8000 --reload
```

`--app-dir` selects the import path; `--reload-dir` selects watched source.
Keep one API on port 8000. To inspect an existing listener before taking action:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Start Vite in a separate terminal from an explicitly selected, prepared
CIRNET-Interface product (its local directory may still be named `net-Circuit-Interface`). Its own README and the [M2 ledger](../../docs/superpowers/plans/2026-10-24-multi-repo-migration-m2.md)
cover the digest-verified artifact bootstrap and locked install:

```powershell
$env:NETCIRCUIT_INTERFACE_ROOT = 'C:\absolute\reviewed\net-Circuit-Interface'
Set-Location -LiteralPath $env:NETCIRCUIT_INTERFACE_ROOT
npm run dev
```

Vite proxies `/api` and `/ws` to `127.0.0.1:8000`. Verify directly and through
the Vite port printed at startup (5173 by default):

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod http://localhost:5173/api/auth/session -SessionVariable labWebSession
Invoke-RestMethod http://localhost:5173/api/stations -WebSession $labWebSession
```

The health response identifies `netcircuit-api`; virtual station discovery
returns `virtual-station-01`. These explicit interpreter commands need no
PowerShell activation or execution-policy changes. A physical station is not
required for virtual execution.

### Linux/macOS

Run setup from Remote root with an installed Python 3.12 interpreter:

```bash
python3.12 -m venv services/api/.venv
export NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST=/absolute/reviewed/artifacts.json
services/api/.venv/bin/python scripts/install_contracts.py --with-dev --manifest "$NETCIRCUIT_CONTRACTS_ARTIFACT_MANIFEST"
export NETCIRCUIT_SIMULATOR_ARTIFACT_MANIFEST=/absolute/reviewed/simulator-artifacts.json
services/api/.venv/bin/python scripts/install_simulator.py
export NETCIRCUIT_HARDWARE_ARTIFACT_MANIFEST=/absolute/reviewed/hardware-artifacts.json
services/api/.venv/bin/python scripts/install_hardware.py
services/api/.venv/bin/python -m pip install -r requirements-verification.txt -e './services/api[test]'
services/api/.venv/bin/python scripts/generate_hardware_rpc.py --check
services/api/.venv/bin/python -m pip check
```

Start each service in its own terminal from Remote root, using that interpreter:

```bash
# Hardware Service terminal:
services/api/.venv/bin/python -m hardware_service.server 127.0.0.1:50051
# API terminal:
services/api/.venv/bin/python -m uvicorn app.main:app --app-dir services/api --reload-dir services/api --host 127.0.0.1 --port 8000 --reload
```

In a third terminal, select the prepared independent Interface product:

```bash
export NETCIRCUIT_INTERFACE_ROOT=/absolute/reviewed/net-Circuit-Interface
cd "$NETCIRCUIT_INTERFACE_ROOT"
npm run dev
```

Remote retains `apps/web` as a frozen compatibility/rollback reference. Current
Web development and release checks use Interface; integrated browser verification
uses `node scripts/e2e-interface.mjs --interface-root ABSOLUTE_PRODUCT --forbid-only`
from Remote root and the [shared external-output policy](../../docs/VERIFICATION.md).

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
