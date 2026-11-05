# Application API and local service setup

[Tiếng Việt](../../vi/api/application.md) · [System architecture](../architecture/system.md) · [Existing backend guide](../../../services/api/README.md)

Remote runs a FastAPI modular monolith for authentication, revisioned projects and circuits, published assignments, experiments, scheduling and captures. The separate Hardware Service owns station control and FPGA transport. The API reaches it through local-only RPC `2.0`. Keep one API scheduler. Production requires PostgreSQL, explicit HTTPS origins and guest access disabled. [Auth and migrations](../architecture/auth-and-migrations.md) · [Production deployment](../../../deployment/README.md)

## Select and start the services

The [release lock](../../../integration/release-set.json) selects system and Interface `0.1.4`, API, Contracts, Simulator, Hardware and FPGA scaffold `0.1.2`, and independently pinned DEV tools. The [artifact-only release runbook](../../../deployment/multi-repo-release.md) installs exact versions and digests into fresh environments. Production runs installed packages. The Windows launcher uses the checked-out API through `--app-dir services/api`, the installed Hardware module and the extracted Interface. Source verification uses Python 3.14 and Node 26. The API package supports Python 3.11 and later. [Windows launcher](../../../README.md) · [Selected Interface setup](https://github.com/cirnetlab/cirnet-interface/blob/f1fe0c4738e105727aff1a331327caf7172cdf5f/README.md)

For a manual POSIX development run, prepare an external virtual environment with the reviewed Contracts, Simulator and Hardware wheels and API dependencies. Use [the consumer setup](../../../contracts/README.md) for the installer entry points and use the lock for current pins. Set `CIRNET_ARTIFACTS_SESSION` to an owned external session and `CIRNET_API_PYTHON` to the prepared interpreter. In both service terminals, from the Remote root, select isolated local state and the same simulation backend and worker count.

```sh
export CIRNET_ENV=development
export CIRNET_DATABASE_URL="sqlite:///${CIRNET_ARTIFACTS_SESSION}/local.sqlite"
export CIRNET_CAPTURE_DIR="${CIRNET_ARTIFACTS_SESSION}/captures"
export CIRNET_SIMULATION_BACKEND=legacy
export CIRNET_SIMULATION_WORKERS=4
```

Start each service in its own terminal.

```sh
# Terminal 1, from Remote root
"$CIRNET_API_PYTHON" -m hardware_service.server 127.0.0.1:50051

# Terminal 2, from Remote root
"$CIRNET_API_PYTHON" -m uvicorn app.main:app --app-dir services/api --host 127.0.0.1 --port 8000

# Terminal 3, from the prepared Interface product
npm run dev
```

Vite starts the Web service only and proxies `/api` and `/ws` to the API. Use the origin Vite prints, typically `http://127.0.0.1:5173`. Check `GET /api/health` directly on port `8000` and through Vite. The selected API/Contracts pair identifies as `cirnet-api`. Health proves the HTTP service responds. Use `GET /api/stations` with an authenticated or enabled development-guest session to check station discovery. The local simulation station is `virtual-station-01`. Hardware unavailability is reported separately from HTTP health.

## HTTP and realtime contracts

The [generated REST reference at the selected Contracts revision](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/api/README.md) specifies DTOs and operations. [FastAPI registrations](../../../services/api/app/api) are the implementation source. `/api/v2` document, validation, preview, experiment-admission and assignment operations support Graph 1.2 alongside the legacy operations.

| Task | Example operations |
| --- | --- |
| Bootstrap or rotate a session | `GET /api/auth/session`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/claim-guest` |
| Validate or preview a circuit | `POST /api/circuits/validate`, `POST /api/circuits/physical-preview`, or the matching `/api/v2/circuits/…` routes |
| Read a station | `GET /api/stations`, `GET /api/stations/{station_id}/capabilities`, `GET /api/stations/{station_id}/queue` |
| Save an owned circuit revision | `GET /api/circuits/{document_id}`, then `PUT /api/circuits/{document_id}` with `base_revision` in the JSON body, or use the matching `/api/v2/circuits/…` routes. Both versions return `ETag`. |
| Read published assignments | `GET /api/assignments`, `GET /api/assignments/{assignment_id}` |
| Admit, run and stop an experiment | `POST /api/experiments`, `POST /api/experiments/{experiment_id}/run`, `POST /api/experiments/{experiment_id}/stop` |
| Recover an outcome | `GET /api/operations/{operation_key}`, `GET /api/experiments/history`, `GET /api/experiments/active`, `GET /api/experiments/{experiment_id}/results` |
| Read or retire raw capture data | `GET` or `DELETE /api/captures/{capture_id}/payload` |
| Subscribe to bounded live events | `WS /ws/events` |

The selected API issues HttpOnly, SameSite=Lax session cookies under `cirnet_session` and the legacy alias `netcircuit_session`. Production cookies are Secure. The canonical cookie wins when present. `GET /api/auth/session` supplies the `csrf_token`. Unsafe methods need an exact configured Origin and `X-CIRNET-CSRF`, including login and logout. The legacy `X-CSRF-Token` is accepted when the canonical header is absent. `X-Request-ID` identifies a response for diagnostics. Role and object checks apply to HTTP, WebSocket and capture access.

For example, with an authenticated browser session or development guests enabled, run these read requests from the Interface origin.

```js
const session = await fetch('/api/auth/session')
if (!session.ok) throw new Error(`Session bootstrap failed (${session.status})`)
const stations = await fetch('/api/stations')
if (!stations.ok) throw new Error(`Station discovery failed (${stations.status})`)
const stationList = await stations.json()
```

Run requires `X-Control-Client`, a non-secret tab identifier bound to the session. Create, Run and Stop support `Idempotency-Key` for durable principal-scoped reconciliation. A Run acknowledgment records admission or start. Measurement completion is reported separately. Stop acknowledgment requires safe release. Use the operation or command read when an acknowledgment is lost. Reconnecting and reloading restore authorized observation without replaying a mutation or granting control. [Pending observations](../architecture/pending-observations.md)

## Instrument and capture boundaries

`GET /api/experiments/{experiment_id}/instruments/access` reports allocation-aware access. The typed Generator route `POST /api/experiments/{experiment_id}/instruments/generator` requires `X-Control-Client` and `Idempotency-Key`. Read its record at `GET /api/experiments/{experiment_id}/instruments/commands/{operation_key}`. `ACCEPTED` and hardware application are separate states. A live change needs a `RUNNING` lease, active control, allocated channel, declared runtime support, fresh safety and profile limits. Baseline Scope and Generator availability is zero. The station and server enforce capability and safety independently of the UI. [Physical lab safety](../architecture/physical-lab-safety.md)

Experiment JSON and `experiment.updated` carry `CaptureMetadata`. Owner-scoped payload access uses bounded binary NCAP v1 and rechecks authorization after slow reads. Store `CIRNET_CAPTURE_DIR` with the durable database backup. Stop preserves previous captures. Retire old data through the audited capture catalog and maintenance policy. NCAP v2 codecs cover sampled formats, while runtime capture remains on NCAP v1. [Capture catalog](../architecture/capture-catalog.md)

## Verify the selected environment

Run `python -B scripts/generate_hardware_rpc.py --check` to check installed Contracts bindings and `python -B scripts/export_openapi.py --check` to compare route export to the selected contract. Use `node scripts/e2e-interface.mjs --interface-root ABSOLUTE_PRODUCT --forbid-only` for integrated browser verification with the selected Interface and owned external outputs. Keep the published Interface selection separate from the [master browser candidate pin](../../../integration/browser-interface-source.json). [Verification rules](../../VERIFICATION.md)

The [0.1.4 local release report](../../verification/2026-11-05-cirnet-release-0.1.4.md) records API and native first-start checks for its exact inputs. The [test audit](../../verification/2026-11-05-test-infrastructure-audit.md) and [native migration Stage 0 record](../../verification/2026-11-05-native-migration-stage-0.md) cover different runs and environments.
