# CIRNET migration plan for C++ and Rust

[Tiếng Việt](../../vi/history/native-migration-ledger.md) · [Original plan dated 2026-11-05](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) · [Stage 0 record](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

Use [Current status and evidence by stage](../architecture/native-migration-status.md) for the active decisions. This page holds the full plan and dated checkpoint records. Each checkpoint's status applies to its recorded inputs and time.

> **For implementation agents.** Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete each gate and record its evidence before beginning the next stage.

**Goal.** Preserve compatibility with the released system, then migrate to Interface Vue/TypeScript → Remote Rust → Hardware Rust → Simulator C++.

**Architecture.** Interface keeps REST and WebSocket on the same origin. Remote owns orchestration, data and leases. Hardware owns local RPC, station control and the Simulator process. Contracts supplies schemas, SDKs and canonical data. During stages 1–2, preview continues through the Remote adapter. From stage 3, preview may go through Hardware after that stage's combination passes its gate.

**Tools.** Use C++20 and CMake for the worker, Rust and the Cargo lock for binaries and generators, Node for the TypeScript SDK, and pytest and Playwright Python for acceptance. Lock the compiler, linker, target and dependencies in the candidate manifest before measuring. Choose release versions of the C++ and Rust tools in their corresponding stages.

## Rules for every stage

- Follow the order **0 → 1 → 2 → 3 → 4 → 5**. Each required gate records its command, artifact combination, result and evidence. A required FAIL or NOT RUN blocks advancement through its acceptance lane. Gate 3 Windows functional and safety acceptance governs the next implementation stage. Production default selection and release require the separate Linux Xeon performance gate as well as the other required release evidence.
- Each combination uses released or packaged candidate artifacts identified by commit, version, SHA-256, target and build flags. Use sibling source for development or to export separate artifacts. Distinguish the surveyed HEAD, build revision and harness revision. Raw data and traces go in a session outside Git allocated by the pinned DEV allocator. Keep only Markdown reports in the repository.
- The final product keeps Python in tests and benchmarks. During the transition, keep compatible Python artifacts and all reference tests. PRs run tests near the change and relevant auth and safety checks. Integration gates exercise real processes and artifacts. Release gates run the exact artifacts intended for delivery.
- Use the same valid and invalid fixtures to check wire behavior. Pin both canonical and legacy RPC paths, protobuf presence, REST names, types, statuses and errors, WebSocket sequence and resync, NCAP bytes, ownership and durable data. A breaking change requires a wire version and a separate consumer migration plan.
- Before switching a default, record how to restore the most recent gated combination. Stop admitting Run, wait for safe cleanup or retain quarantine, and keep the matching database and capture backup with the manifest. At startup, the Python scheduler can dispatch `QUEUED` records. Before giving a scheduler permission to call Hardware after cutover or restore, inspect the restored queue and resolve or isolate all pending commands. Check ownership, capture digests, leases, quarantine and that only one scheduler can control Hardware. Check that Start is never replayed after a crash or an uncertain ACK.

## Reference set and source survey

The system selects [release-set.json](../../../integration/release-set.json) **0.1.4**, with 15 artifacts. It uses Hardware RPC **2.0**, FPGA logical **1.0-scaffold**, register map **1.0-reserved**, one origin, one scheduler and local-only Hardware RPC. The surveyed HEAD reproduces the source survey. The artifact revision identifies the source of the selected bytes.

| Repository | Artifact version | Surveyed HEAD | Artifact revision |
| --- | --- | --- | --- |
| Remote | system 0.1.4, API/deployment 0.1.2 | `37cb350b8492799fa1f8ad2ec85b11fbdd2d5bda` | `ce84ec4cf3602ef6fd001f91877e864c8955f9c7` |
| Simulator | 0.1.2 | `47026eb4031ed1ec453e5b08eb5af2e4e0a7044e` | `9ec36fa2772ba8227e15ae33fec9710943a9a775` |
| Contracts | 0.1.2, DEV Python 1.0.0a1, DEV npm 1.0.0-m1.0 | `98897f4291ed381da2245b5daced92c9bc9c3aa5` | `524cc7a5e2e65f39077feefe70c7fb2ae3a773d6` |
| Hardware | 0.1.2 | `65dbf0a55d29026817ddf11458259ce312e94bc6` | `9a8935b6a596abe2d21ce90416ba3b914e9f36be` |
| Interface | 0.1.4 | `879c6fdbff34462df6e112c8dd7afc3a96ff9933` | `f1fe0c4738e105727aff1a331327caf7172cdf5f` |
| FPGA | 0.1.2 scaffold | `c4bf5f04df063aa417ab1e22c65bca680305e4dd` | `d27c818aca0eb95e9ee8d9b5ba6bda3182909914` |

The checkout lock SHA-256 is `90a8ef4d30ddc19d3024dcb3790fef5d5e041f45fa47922bfd5e34c2fd19c419`. The CI Interface source lock records a separate revision in `integration/browser-interface-source.json`. Take reference measurements from the selected release set. Record HEAD differences and test overlays in provenance.

| Flow | Current entrypoints and boundaries |
| --- | --- |
| Run and Stop | Interface adapter → `services/api/app/api/experiments.py` → `services/experiments.py` → `hardware_client.py` → Hardware `server.py`, `rpc.py`, `station/virtual.py` → Simulator `cirnet_sim/backends.py`. Record Run acceptance, work completion, Stop acceptance, safe ACK, and lease release or station quarantine separately. |
| Preview | Remote `api/circuits.py` and `api/placement.py` currently call Simulator synchronously. Stage 1 adds a separate preview budget. |
| Capture | Hardware returns `OperationReply.capture_payload` and a descriptor. The Remote gateway validates them, `capture_store.py` stores payloads and `capture_repository.py` stores metadata. Interface reads via REST. WebSocket sends metadata. |
| Auth and WebSocket | Remote `services/auth.py`, `services/operations.py` and `websocket/events.py` maintain cookies and CSRF, principals, control clients, ownership, sequence and resync. Interface validates DTOs with the packaged SDK. |
| Data and release | Remote Alembic and `app/db/schema.py` manage SQLite and PostgreSQL. The installer, CI, launcher and deployment use the version lock. `cirnet-cli` currently contains only README and LICENSE. |

## 0. Measure and pin released Python behavior

[Stage 0 record](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

- [x] **Install and identify the reference set.** Run `python -B -m scripts.install_release --manifest integration/release-set.json --environment-file release-env.json` in a virtual environment in a separate owned session and apply both installer environment blocks. Verify all 15 artifact SHA-256 digests, installed wheel provenance, `pip check`, host/OS/CPU/RAM, toolchain versions, database, worker count, limits and same-origin configuration. Use a fresh environment and the exact artifacts as the reference. Stage 0 rollback stops the test processes and cleans up their owned session while retaining the existing lock.
- [x] **Pin the reference corpus.** Reuse fixtures from Contracts `contracts/compatibility` and `tests/contracts`, and Remote `tests/contracts`, `tests/integration` and `services/api/tests`. Run `scripts/export_openapi.py --check` and `scripts/check_public_compatibility.py`. Keep sanitized inputs and outcomes for REST/OpenAPI, gRPC including aliases, presence and errors, NCAP small samples and 100,000-sample case, WebSocket and database schema version. Create SQLite and PostgreSQL snapshots from synthetic principals, projects and revisions, idempotent commands, history, leases and quarantine, and captures. Keep capture digests with the snapshots. Check owner authorization, CSRF and Origin, revocation, replay, guarded power and invalid captures. Lock fixture digests after verifying the reference.
- [x] **Measure the external path.** Run `python -B -m scripts.benchmark_web_sessions --sessions 50 --concurrency 10 --runs 8 --read-rounds 3` as the smoke baseline. Keep the existing AND workload, X at 0 ns, 0 at 8 ns and 1 at 28 ns, and add an event-heavy digital graph and a large NCAP payload from existing fixtures. Pin the input, harness and dependency inventory SHA-256, 50 principals, 10 concurrent HTTP requests, four workers, current auth policy, seed, warmup and measurement window for separate SQLite and PostgreSQL profiles. Calculate throughput as requests completed in the load window divided by seconds in that window. Calculate jobs/s and capture bytes/s separately. Collect CPU seconds per job, peak aggregate RSS for the process tree and sample count. RSS can count shared pages more than once. Separate bootstrap and login pacing from the load window. Collect at least 100 valid observations for each p99 distribution on each run, measure at least three independent runs after warmup, and report the sample count and nearest-rank method. The existing benchmark shares an API/Hardware process and issues Stop after COMPLETE. Use a pytest harness with separate processes for per-service and PostgreSQL measurements.
- [x] **Measure Stop under load and separate phases.** Extend the pytest harness in `tests/integration/` and reuse `scripts/benchmark_web_sessions.py` for HTTP and resource metrics. Pin the graph and confirm all slots are busy, the worker has started the target job and that job is still running when Stop is issued. Discard the observation if the job finishes first. Measure Stop to HTTP response, gRPC ACK, and safe release or durable quarantine separately. Use natural graph load for timing and separate injected hang, crash and late-ACK cases for invariants. Use a monotonic clock in each process and request/experiment IDs to attribute Remote planning, queue and API time, Hardware graph compile, worker wait, Simulator run, NCAP encode/read/transfer/decode, payload store/read and database waits and transactions. Separate instrumented measurements from external measurements on original artifacts. Report parallel time as spans to avoid double-counting.
- [x] **Compare core measurements.** Run `python -B -m pytest -q tests/integration/native_baseline_cases.py --basetemp <owned>/pytest-native-baseline` separately, using the verified environment. Reuse the HTTP benchmark's AND graph and check the event and capture sequence before measuring. Compare compile, run, NCAP encode and decode separately inside the pytest process. Use these microbenchmarks to compare against integrated spans.
- [x] **Lock thresholds before testing a candidate.** The implementer's initial rule allows zero corpus or safety-invariant differences. Compare medians across runs for each identically configured profile. Require p95/p99 and peak RSS ≤ 110% of baseline, CPU/job ≤ 110%, and throughput ≥ 95%. For Stop, use the stricter of the current operational limit and 110% of baseline p95/p99. Keep leases unavailable until safe ACK. Require the C++ Simulator to reduce p95 core run time or CPU/job by at least 10%, with an effect larger than measurement variation across three paired runs, while meeting the other thresholds. If sample size, load or variation is insufficient, finish measuring and record absolute values before evaluating a candidate.
- [x] **Gate 0.** PASS requires authenticated artifacts, a reference corpus, phase measurements, loaded Stop and locked thresholds. Report using the template at the end.

### Run the installed reference gates

Apply the two environment blocks from the isolated 0.1.4 installation. Set
`CIRNET_NATIVE_RELEASE_STATE` to its absolute `release-env.json` path. Provide
a dedicated PostgreSQL loopback test cluster using `CIRNET_TEST_POSTGRES_URL`
and its matching backup tools in `CIRNET_TEST_PG_BIN`. Run the performance
commands serially with their default sample sizes. The short-run overrides are
for harness diagnostics.

```powershell
python -B -m pytest -q tests/integration/native_external_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-external"
$env:CIRNET_PHASE_DATABASE = 'sqlite'
python -B -m pytest -q tests/integration/native_phase_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-phases-sqlite"
$env:CIRNET_PHASE_DATABASE = 'postgresql'
python -B -m pytest -q tests/integration/native_phase_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-phases-postgresql"
1..3 | ForEach-Object {
    python -B -m pytest -q tests/integration/native_stop_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-stop-$_"
    if ($LASTEXITCODE -ne 0) { throw "Loaded Stop run $_ failed." }
}
python -B -m pytest -q tests/integration/native_state_baseline_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-state"
```

The external profile runs API and Hardware in separate child processes from
the installed wheel set. Simulator jobs execute in spawned workers. Each
database profile starts three independent runs with 50 synthetic Student
principals, four Simulator slots, a ceiling of 10 client threads and four
clock-job warmups. Each run measures 100 jobs per graph. The AND capture has
three samples and the 100 MHz clock capture has 4,001 samples. The separate
100,000-sample NCAP test covers compatibility at the larger payload size.
Fixed-operation throughput counts create, Run, capture GET and scheduled
reads. The separate observed HTTP throughput also includes polling. API and
Hardware process-tree CPU/RSS include the Simulator workers. PostgreSQL
server resources and the load generator are outside that measurement scope.

The Stop profile uses four guest principals on SQLite and the pinned
four-branch 1 MHz clock → 74HC08 → LED fixture with a 6 ms simulation horizon.
Timing starts at the HTTP client. Qualification requires four real workers
still computing when Hardware receives the target Stop RPC. Report HTTP
response, gRPC ACK, worker completion, cleanup ACK and durable release
separately. Phase probes describe their instrumented run and produce
overlapping spans. The matched gRPC residual includes scheduling and codec
work in addition to transport.

### External profile evidence on 2026-11-06

The formal windows used release set 0.1.4 and the selected 0.1.2 service
wheels on Windows 11 build 26300, Core i5-12500H, 16 logical CPUs and
34,049,417,216 bytes of RAM. The power plan was Balanced. The runtime
used CPython 3.14.4, SQLite 3.50.4 and PostgreSQL 18.6. All six windows
passed and verified 1,200 captures. The table shows the median of the
three independent windows for each database.

| Database | Fixed HTTP requests/s | All HTTP requests/s | Jobs/s | NCAP bytes/s | CPU seconds/job | Peak aggregate RSS MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SQLite | 8.55 | 22.57 | 1.71 | 37,823 | 0.513 | 607.5 |
| PostgreSQL | 9.26 | 25.68 | 1.85 | 40,970 | 0.500 | 613.2 |

| Database and operation | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| SQLite AND Run | 433.864 | 1,617.278 | 2,141.406 |
| SQLite AND capture GET | 45.849 | 81.019 | 608.845 |
| SQLite clock Run | 394.578 | 1,592.767 | 1,930.552 |
| SQLite clock capture GET | 49.802 | 107.525 | 215.112 |
| PostgreSQL AND Run | 360.839 | 1,213.428 | 2,492.763 |
| PostgreSQL AND capture GET | 49.835 | 84.143 | 139.424 |
| PostgreSQL clock Run | 321.098 | 1,045.678 | 1,218.074 |
| PostgreSQL clock capture GET | 53.217 | 103.482 | 143.936 |

Fixed-operation throughput ranged from 8.54 to 17.00 requests/s on SQLite
and from 9.15 to 9.60 requests/s on PostgreSQL. Keep all three windows when
evaluating the threshold. Pair candidate and reference runs in the same
environment and account for variation before claiming a performance gain.

### Integrated phase evidence

The probe run passed on each database with 200 byte-verified captures and
four Simulator worker PIDs. The table shows the p95 of individual spans.
The phases and their sample counts are kept separately in the evidence.

| Span | SQLite p95 ms | PostgreSQL p95 ms |
| --- | ---: | ---: |
| API plan compile | 3.225 | 2.689 |
| Hardware graph compile | 9.163 | 6.562 |
| Simulator queue to worker entry | 1.164 | 1.019 |
| Simulator Run, both graphs | 46.106 | 34.962 |
| Capture RPC round trip | 33.916 | 28.352 |
| Matched gRPC residual | 12.321 | 7.687 |
| API NCAP decode | 4.312 | 3.917 |
| Capture store | 45.788 | 41.081 |
| Capture read and validation | 35.848 | 28.612 |
| DB connection acquisition | 0.051 | 0.047 |
| DB cursor execute | 3.473 | 4.171 |
| DB commit | 7.989 | 2.575 |

The Simulator Run p95 for the AND and clock workloads respectively was
1.184 and 50.016 ms on SQLite, and 1.052 and 39.275 ms on PostgreSQL.

### Loaded Stop evidence

Three independent SQLite runs each passed with 100 qualified observations
and zero rejections. Each observation matched the target HTTP Stop to the
actual gRPC ingress while all four Simulator workers were computing.
Every accepted observation reached `COMPLETE` with `STOPPED`, withheld
stale capture and recorded worker completion before final safe ACK and
durable lease release. The SQLite lease table was empty after shutdown.

| Milestone from HTTP Stop | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: |
| HTTP response | 153.345 | 179.595 | 528.324 |
| Initial gRPC ACK | 112.205 | 126.550 | 478.829 |
| Target worker finished | 1,765.172 | 1,825.176 | 1,841.799 |
| Final cleanup gRPC ACK | 1,841.353 | 1,985.796 | 2,207.238 |
| Durable lease release | 1,918.033 | 2,304.143 | 2,362.159 |

The table shows the median of each percentile across the three runs. The
individual durable-release p95 values ranged from 1,653.794 to 2,492.834 ms.
These results apply to the loaded SQLite fixture. The PostgreSQL checks
cover load, integrated spans and restoration of a quarantined lease.

### Reference archive and acceptance thresholds

`cirnet-stage-0-reference.zip` has SHA-256 `73185795872bc1ec7e40e30ecc9732a27ba3cbb5dcf657053db5264302117fbb`.
The Stage 0 harness and results are recorded in `18c4f526030687601e292eef05c474ee1feb0741`.
Use the digests below to verify the lock and the frozen thresholds before
running a candidate against the reference.

| Archive member | SHA-256 |
| --- | --- |
| `release/release-set.json` | `90a8ef4d30ddc19d3024dcb3790fef5d5e041f45fa47922bfd5e34c2fd19c419` |
| `performance/thresholds.json` | `fd7412c675c0372521519626b77a0e74e83d8967037a597e283086378ba0685a` |

The verified archive retains the exact 15 release assets, release lock, test
and dependency inventory, raw timing samples, gRPC descriptors and responses,
OpenAPI, Contracts fixtures, and digital NCAP at 100,000 samples. The two
database and capture pairs carry per-file digests and schema
`0007_auth_maintenance`. Each pair was restored in isolation. Both checks
passed for saved revisions, history, idempotency, access control, revoked
sessions, an empty queue and durable quarantine. Keep each backup paired
with its own captures, and restore it only into an isolated environment.

The archive's `performance/thresholds.json` records the absolute p95/p99
limits for each operation, CPU and RSS ceilings, throughput floors and
the Simulator improvement targets. These examples are rounded.

| Limit | SQLite | PostgreSQL |
| --- | ---: | ---: |
| Minimum fixed HTTP requests/s | 8.123 | 8.799 |
| Maximum CPU seconds/job | 0.565 | 0.550 |
| Maximum peak aggregate RSS MiB | 668.254 | 674.506 |
| Maximum AND Run p95 ms | 1,779.006 | 1,334.771 |
| Maximum clock Run p95 ms | 1,752.044 | 1,150.246 |
| AND worker p95 for a 10% gain, ms | 1.066 | 0.947 |
| Clock worker p95 for a 10% gain, ms | 45.014 | 35.347 |

Loaded Stop limits on SQLite are 139.205/526.712 ms for initial gRPC ACK
p95/p99 and 2,534.557/2,598.375 ms for durable lease release p95/p99. The
corpus and safety invariants permit zero differences. A candidate gain
must also exceed the variation of paired measurements on the same profile.
The reference archive supports reinstalling the pinned 0.1.4 set and
restoring the matched synthetic state. The native release rollback rehearsal
is a separate gate.

## 1. C++ Simulator and transition adapters

- [x] **Digital slice.** In Simulator, add CMake and an independent C++ worker. Start with 74HC08 AND from the corpus and check the event sequence through `cirnet_sim/backends.py`. Extend it according to `engine.py`, `nets.py`, `logic.py`, `dispatch.py` and published model behavior. Keep preview and the supported static DC fixtures for supply, resistor, LED and powered 74HC08. Analog, SPICE and mixed execution remain unavailable. Compare timestamps, simultaneous event ordering, 0/1/X, NCAP bytes and errors. Run Simulator tests, pytest against the binary directly, and ASan/UBSan on supported targets.
- [x] **Packaging and supervision.** Use local IPC with bounded frames, a version handshake and request/generation IDs. The Simulator artifact exports the binary and a private protocol description. Hardware's `station/virtual.py` Run adapter and Remote's preview adapter use the same core with separate budgets and pools. Add host deadlines, queue/CPU/RAM limits, cancellation, process reaping and fencing of late results. Check timeout, invalid frames, hung or dead workers, Stop/reset and running again. Preserve REST, RPC 2.0 and NCAP.
- [x] **Matrix and Gate 1.** A = current Interface / Python Remote / Python Hardware / Python Simulator. B = the same combination with the C++ worker enabled for Run and preview, keeping Contracts Python 0.1.2. Run the fixtures, `tests/integration/test_virtual_lab_execution.py`, `test_capture_rpc_data_plane.py`, `test_simulation_backend_selection.py` and `services/api/tests/test_physical_preview.py` on artifacts. Compare with Stage 0 and choose B only after parity and measurable improvement. Roll back to A after cancellation, reaping and generation fencing. Interrupted jobs never replay automatically.

### C++ 74HC08 slice on 2026-11-06

Simulator adds a C++20 worker, CMake build and explicit Python transition
adapter. The Windows x64 Release worker SHA-256 is
`02375db7996c46e97858a247937c49caf6a3c8f10480434ea28d89ae5bda323d`.
The local transition wheel SHA-256 is
`c2265f648cf33425f246ed7b3c5265f81dfe9d6b5ccb73b3d2f65fb6b07ad8c2`.
The wheel overlays `cpp_backend.py` on the pinned Simulator producer
revision. The integration test verifies installed wheel provenance and
byte equality of the pre-existing runtime modules and legacy shim.
The local review archive `cirnet-stage-1-cpp-slice-windows-x64.zip` has
SHA-256 `6845cf3e2d8e7230b6e9decadcc7dd13dbe214dec4266241de5eddc5ef8c9806`.

The worker uses a private `CNP1` frame over standard input and output with
request/generation IDs and bounded frames, events and capture records.
Run and preview use the same C++ event loop with separate admission slots
and deadlines. This provider handles ideal digital graphs. The reference
profile supplies the existing public REST, RPC 2.0 and NCAP.

| Configuration and check | Result | Evidence |
| --- | --- | --- |
| A with selected 0.1.4 artifacts | PASS | Gate 0 reference set and recorded thresholds. |
| Local C++ worker and transition adapter | PASS | 150 installed-candidate cases including 17 direct worker cases, plus 13 explicitly selected adapter cases. Coverage includes ordered 0/1/X, timeout, cancellation, child crash, stale response identity and integral JSON number normalization. |
| Installed Python Remote → Python Hardware → C++ worker for 74HC08 | PASS | Real REST and gRPC with separate services and a spawned simulator wrapper. Test-only registry composition selects C++. Both preview routes match A and Run emits the same 124-byte NCAP. |
| Full Gate 1 | NOT RUN | Powered DC and remaining parity, Hardware-driven Stop/reset and reaping, OS CPU/RAM bounds, sanitizers and full paired performance gate remain open. |
| RTL and HIL | NOT RUN | This slice exercises virtual digital simulation. |

To reproduce the slice, install the 0.1.4 set in a separate owned test venv
and apply its release environment. Preserve `CIRNET_NATIVE_RELEASE_STATE`
and force-install the candidate wheel with `pip install --no-index --no-deps
--force-reinstall`. Set `CIRNET_CPP_STAGE1_WORKER` and
`CIRNET_CPP_STAGE1_SIMULATOR_WHEEL` to the absolute extracted paths and
set their corresponding `_SHA256` variables from the candidate manifest.

```powershell
python -B -m pytest -q tests/integration/native_cpp_slice_cases.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-cpp-slice"
```

The serial paired diagnostic measured 100 observations per workload and
backend. The C++ span includes worker launch, digest check, IPC and decode.
The formal load comparison still requires the stage integration gate.

| Workload | Python p50 / p95 / p99 ms | C++ p50 / p95 / p99 ms |
| --- | ---: | ---: |
| 74HC08 AND | 0.389 / 0.600 / 0.732 | 19.387 / 38.619 / 44.814 |
| 100 MHz clock | 11.698 / 13.460 / 23.633 | 23.274 / 32.273 / 44.079 |

The one-process-per-job path exceeds the reference in both diagnostics.
Stage 1 still needs to amortize worker startup and IPC while preserving
independent preview limits, cancellation and generation fencing. The
rollback for this local configuration is to stop the owned test services
and select the archived 0.1.4 artifacts with `legacy`.

### Candidate with persistent CNP1/CNP2 workers

Remote and Hardware select C++ through service configuration. Run and
preview use the same event loop through separate pools. Each worker serves
multiple requests, checks frame/event/sample bounds and runs with an OS
memory limit. Hardware waits for cancellation and reaping before safe Stop
or reset acknowledgement. A stale generation cannot update capture for a
replacement session. CNP2 adds powered gates, final pin levels and the
bounded series DC LED model. Contracts Python 0.1.2 encodes NCAP in B.

| Check | Result | Scope |
| --- | --- | --- |
| Windows x64 Release, AddressSanitizer and UBSan worker | PASS | 41 cases per build, including malformed and consecutive frames, DC behavior and a request near the protocol bounds. |
| Adapter on the installed wheel and final CNP2 worker | PASS | 30 focused cases covering AND/OR/XOR/NOT, four powered HC08 gates, DC, the event limit and rollback to legacy. |
| Hardware lifecycle over gRPC with a real worker | PASS | Five cases on the final candidate covering Stop while saturated, reset, crash, timeout and delayed reply. Verified PID reaping and NCAP bytes on a subsequent Run. |
| Remote → Hardware → C++ through service configuration | PASS | Two cases on the final worker and selected transition wheels. Both preview routes and NCAP bytes for AND, clock and the powered HC08 circuit matched Python. |
| RTL and HIL | NOT RUN | This candidate verification used virtual simulation. |

The final Windows x64 CNP2 worker SHA-256 is
`c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf`.
The Simulator and Hardware transition wheels have SHA-256
`f8cdada13405dc0f06d4034309df366ca42f8b55ba6fa895c17cd22b69451090` and
`03e08365f3888682e6eefc547b46c58c6f7700578de62c1d9afbb6d886696c63`.

In three paired diagnostic windows with 100 observations per workload and
backend, the persistent CNP1 worker reduced p95 for the 100 MHz clock from
16.545–18.022 ms to 3.833–4.487 ms. The AND p95 increased from 0.286–0.413
ms to 0.353–0.476 ms. These spans cover the Simulator facade. Gate 1 still
requires service measurements on SQLite/PostgreSQL and qualified loaded
Stop observations against the frozen profile.

The three SQLite pairs completed 200 jobs per backend and window. The
candidate passed the frozen CPU, peak RSS and throughput limits. Seven
latency checks exceeded their limits, so the SQLite load gate is **FAIL**.

| Median of three windows | Reference A | Candidate B | Stage 0 limit |
| --- | ---: | ---: | ---: |
| CPU seconds/job | 0.232 | 0.213 | ≤ 0.565 |
| Peak RSS, MiB | 608.94 | 281.62 | ≤ 668.25 |
| Jobs/second | 3.262 | 3.418 | ≥ 1.625 |
| AND create p95, ms | 145.423 | 405.322 | ≤ 332.187 |
| Clock capture p99, ms | 72.951 | 497.010 | ≤ 236.623 |
| History read p95, ms | 115.875 | 751.402 | ≤ 364.995 |

The same reference re-run also exceeded the frozen limit for clock
creation p99. The API log shows time within application request handling
for some of the high-latency requests. Additional phase measurements
are needed to separate database contention from other causes.

In an instrumented SQLite pair of 96 jobs per backend, the two slowest
candidate capture downloads spent 435.8 of 455.5 ms and 430.0 of
440.9 ms waiting for the Remote repository lock. The same wait occurred
on A, including 901.2 of 908.6 ms on its slowest download. In B, the
four slowest history reads took 1,025–1,034 ms, with 4–7 ms of recorded
lock wait. The measured lock explains the slow downloads and leaves a
separate gap in the history tail. The p95 Simulator facade span in this
pair was 0.569 → 0.728 ms for AND and 15.353 → 16.421 ms for clock.
The C++ worker round trip alone was 0.239 ms and 1.219 ms respectively.

The short loaded Stop trial on the frozen SQLite workload qualified 0 of
4 required samples. Native request-to-reply spans took 8.240–37.735 ms.
The four measured waves reached peak concurrency of 1, 2, 2 and 2 workers.
All 11 matched client Stop RPCs entered after the target worker returned.
There were 20 durable lease releases, no quarantines and no residual
leases. This trial leaves the loaded Stop latency gate open. The separate
gRPC tests cover cancellation while the actual worker is in flight.

The supplemental `saturated-v1` trial used a heavier common circuit and a
test rendezvous before simulation dispatch. The C++ activity span starts
when the IPC request is flushed and ends when the reply is read or the
request aborts. It excludes the rendezvous. Each backend qualified all four
observations. The median durable release time was 4,103 ms for A and
82 ms for B. Each cancelled native child exited before release, and
peer Runs returned identical 7,001-sample NCAP. The trial established
that the workload qualifies on both backends. The p95/p99 gate needs
the full sample set.

The PostgreSQL 18.6 diagnostic also completed 96 jobs per backend. Its
Simulator facade p95 was 0.513 → 0.971 ms for AND and 14.120 → 6.348 ms
for clock. Service throughput was 4.322 → 3.582 jobs/second in that pair.
This candidate completed no three-pair PostgreSQL acceptance run and
failed the SQLite limits. The subsequent candidates are reported below.
The release profile selects `legacy`.

For local reproduction, preserve the reference venv and its release
environment. Install the two selected transition wheels in a separate
copy. Set `CIRNET_NATIVE_RELEASE_STATE` to the original release state and
`CIRNET_NATIVE_STAGE1_CANDIDATE` to the candidate manifest. Use absolute
artifact paths in that manifest after extraction.

```powershell
python -B -m pytest -q tests/integration/native_cpp_pool_cases.py -k "configured_cpp or paired_worker" --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-cpp-pool"
python -B -m pytest -q tests/integration/native_cpp_pool_cases.py -k paired_service_profile --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest-cpp-load"
```

The service profile defaults to three pairs of 200 jobs per backend.
Use an isolated loopback cluster for the PostgreSQL node. An explicit
`CIRNET_NATIVE_PROFILE_PHASES=1` adds diagnostic timing probes and writes
a separate report. Set `CIRNET_NATIVE_STAGE0_REFERENCE` to the archived
Stage 0 ZIP for the uninstrumented run to verify the workload and fail
when a frozen service limit is exceeded.

To return to A, stop admitting Run, wait for safe acknowledgement and
worker reaping, then restart with the pinned 0.1.4 artifacts and `legacy`.
Remove `CIRNET_SQLITE_ROLLBACK_JOURNAL` from the reference environment.
Stored graph and NCAP formats carry over. An interrupted job requires a
new Run request.

### Candidate after the latency investigation

An instrumented SQLite diagnostic compared three rollback journal modes
with the first candidate and 96 jobs per mode. Clock capture GET p99 was
765.587 ms with DELETE, 419.439 ms with TRUNCATE and 145.015 ms with
PERSIST. Commit p99 was 11.763, 11.708 and 14.828 ms respectively.
Throughput was 3.279, 3.711 and 2.333 jobs/second. These single windows
led to retaining the existing rollback journal for the next candidate.

Remote returns empty owner-scoped history and active pages directly after
the repository read. Pages with records still use the scheduler lock to
read queue positions. Simulator plan format 3 prepackages static wire
data and reuses successful exact capture configuration validation with a
bounded cache. Clock packing and single-probe decoding retain event order
and validation. The installed candidate wheels differ from the earlier
API and Simulator wheels in exactly one runtime member each. Remote
SHA-256 is `6131adcfd6821d12e304707403c8fa4cd9856e9015e137198d368956db667506`.
Simulator SHA-256 is `d77359ee16a74ceab2035fff7474663aed296b4cab2a6f96a737d01df6dc512d`.
The candidate uses the same Hardware and CNP2 worker digests recorded above.

The optimized facade matched all captures in three alternating windows of
100 observations per backend and workload. The median p95 was 0.344 →
0.173 ms for AND and 24.670 → 4.530 ms for the clock. These timings include
adapter and IPC. The full service profile measures API and database
latency separately.

The full SQLite retry completed its first 200-job pair. The second
candidate warmup then reached `CAPTURING` and failed with `DRIVER_ERROR`
before sealing the capture. Hardware acknowledged safe cleanup and the
lease was released. The incomplete run has no three-window gate result.
A separate error-probe run verified 120 clock captures across three
restarts and four simultaneous Runs. An exact 50-owner diagnostic
verified its four warmup captures and 200 measured captures. Neither
diagnostic reproduced the fault, so its cause remains open.

A second PERSIST diagnostic on the same installed r2 wheels verified 200
jobs plus four warmup captures. It ran at 4.774 jobs/second and stayed
within all frozen operation latency limits for that one window. The
next Remote wheel uses a single fresh lease snapshot for the station
list. It also supports selecting PERSIST with `synchronous=FULL` on
file-backed SQLite. The r3 candidate selects this option for SQLite,
and the reference uses its original connection settings. The workloads
and frozen thresholds come from the Stage 0 archive. The r3 Remote
wheel SHA-256 is
`17257f6a99faef0a5dc82044f97eb2728869d61bea7830da02112e99ee0c5329`.
The installed API suite passed 45 cases, including commit, rollback,
backup and reopen with the default SQLite connection settings.

The r3 SQLite service gate passed all 29 frozen limits. Three pairs
completed 200 measured jobs per backend and pair with byte-verified
NCAP and no capture failures. Median fixed HTTP throughput was
17.575 → 23.047 requests/second. Jobs/second was 3.515 → 4.609,
CPU seconds/job was 0.217 → 0.192, and peak RSS was 607.65 →
294.58 MiB. Median clock Run p95 was 575.7 → 414.2 ms. The
PostgreSQL service gate and full loaded Stop verification are separate.

The r3 PostgreSQL 18.6 service gate also passed all 29 frozen limits
across three pairs of 200 jobs per backend. Median jobs/second was
4.889 → 4.854, CPU seconds/job was 0.200 → 0.199, and peak RSS
was 616.15 → 287.19 MiB. The isolated cluster used the Stage 0
PostgreSQL binary.

### Configurable Run capacity

The r4 Simulator wheel SHA-256 is
`e0f8db8f2830e6ea321c2ec4ade46793946fe5675c1cb6222aa53dd50932fdaa`.
Its only changed runtime file from r3 is `cirnet_sim/cpp_backend.py`.
The configured C++ Run pool now uses `CIRNET_SIMULATION_WORKERS`.
The preview limit stays separate. Both sealed service profiles use four
Run workers, which was also the r3 pool size. Their measurements above
identify the exact r3 artifacts used for those runs.

The installed r4 adapter passed 87 focused tests. Five simultaneous
configured Runs reached five distinct worker processes, produced identical
7,001-sample NCAP payloads and reaped all five processes. The five
loopback Hardware lifecycle cases and the two paired REST/gRPC digital
and powered DC cases also passed on r4. Its Hardware and Remote wheels
and the CNP2 worker are byte-identical to those used for r3.
The four planned integration suites passed 27 cases against the installed
wheels. They covered C++ Run and preview, the 100,000-sample NCAP gRPC
boundary, and compatibility with the legacy and unavailable backends.

To reproduce r4, apply the archived release environment to an isolated
copy of the reference venv. Install the three selected transition wheels
for Simulator, Hardware and Remote there, and point the candidate
manifest at the extracted worker and wheels with absolute paths. Keep
the original venv available for A.

Run the supplemental Stop gate with `CIRNET_NATIVE_STOP_PROFILE=saturated-v1`,
`CIRNET_NATIVE_STOP_GATE=1` and `CIRNET_NATIVE_STOP_SAMPLES=100`.
The test verifies the same archived Stage 0 thresholds through
`CIRNET_NATIVE_STAGE0_REFERENCE`. For each pair, run
`tests/integration/native_stop_baseline_cases.py::test_loaded_stop_baseline`
first with the original reference interpreter and backend `legacy`.
Run it next with the selected candidate interpreter and backend `cpp`,
and set `CIRNET_NATIVE_STOP_REFERENCE_RECEIPT` to the matching reference
receipt. A qualifying observation has the same four active workers at
both HTTP Stop dispatch and gRPC ingress. Keep the independent receipts
for the three pairs.

The first full reference retry recorded 100 qualifying Stop observations
with zero rejections. Its median and p95 to durable lease release were
4,282.508 and 4,616.636 ms on the supplemental workload. The matching r4
window aborted in warmup before any client Stop. All four native workers
returned. One Run entered `CAPTURING` and reported `DRIVER_ERROR` before
sealing NCAP. Hardware acknowledged safe cleanup and the lease was
released. The other three NCAP payloads matched byte for byte. The fault
occurred at the same capture boundary as the r2 warmup failure. The
initial receipt did not record the underlying exception. The second full
r4 candidate window reproduced the warmup failure with the diagnostic
enabled. `FilesystemCaptureStore._path` rejected a valid capture name on
Windows. A first writer created the capture directory between another
writer's path lookups. Python changed from Win32 error 3 to error 2 and
returned an extended-length spelling of the same parent. A controlled
reproduction on the installed r4 wheel triggered the same rejection.
The fix resolves the path under the existing directory lock before `mkdir`.
The resolved-parent check still applies. The regression failed before
the fix, and the capture storage, quota and control isolation suites
passed 43 tests with the fix.

The r5 Remote wheel contains that one runtime change. Its SHA-256 is
`401bd7ff62c278b0491d09fc11aecf9a10c67df747008a380d7d910092a7ecd9`.
The same 43 tests passed on the installed wheel. Export took 0.29 seconds,
the Remote wheel build 5.45 seconds, and copying the environment and
installing the wheel 100.90 seconds. The other artifacts were verified
and reused. Two compatible independent legacy Stop receipts can supply
the reference sides for r5. Their pytest times total 1,628.96 seconds.
All candidate measurements must use the r5 Remote wheel.

### Stage 1 verification time and reuse

Run installed-artifact compatibility checks as a development lane. Keep
the paired load and loaded Stop gates in a separate lane. Use independent
runners for parallel suites and reserve an idle runner for each timed A/B
comparison. Keep the reference and candidate venvs available for the whole
comparison. Reuse the unchanged CNP2 worker, Hardware wheel and Remote
wheel after verifying their hashes and dependency pins. The installed
Remote-only suite is the single receipt for the unchanged Remote wheel.

The default compatibility smoke runs the digital and powered DC fixtures
with the same installed wheels and one API–Hardware startup per backend.
It uses new guest sessions for every Run and preview. It still checks all
five captures per backend, both preview routes per fixture, independent
Run and preview workers, and process reaping. Set
`CIRNET_NATIVE_SMOKE_PROFILE=digital` or `physical` for a separate cold
diagnostic. On the same installed r4 artifacts, pytest time fell from
177.60 seconds to 84.27 seconds (53%) with the same five captures per
backend. The combined run recorded 11.40 seconds for provenance and
setup, 62.53 for service startup, 8.06 for the smoke operations and
assertions, and 1.62 for cleanup. It reused the existing build. The
recorded capture lengths were 124, 44,109, 124, 142 and 142 bytes, with
each payload checked against its expected SHA-256.

For a short Stop diagnostic, set `CIRNET_NATIVE_STOP_GATE=0` and
`CIRNET_NATIVE_STOP_SAMPLES=12`. Use `CIRNET_NATIVE_CAPTURE_FAULT_DIAGNOSTIC=1`
to record a bounded exception trace. Five r4 restarts produced 60 valid
diagnostic observations. Keep these receipts separate from the gate.

Reuse a receipt only for the matching source commit and file inventory,
artifact and dependency digests, harness, workload, configuration,
toolchain and machine environment. Keep the r3 load numbers with the r3
Simulator digest. Four-slot behavior explains their relevance to r4. The
final r4 service gate requires r4 receipts. A compatible full Stop reference
can be reused when its candidate attempt aborts. Pass its absolute receipt
path as `CIRNET_NATIVE_STOP_REFERENCE_RECEIPT`. Candidate verification checks
the harness, launcher, client and diagnostic source, workload, clock and
settings before running. Count each full A/B pair once. Keep failed and
short diagnostic runs separate from the three independent full pairs.

On this Windows runner, restoring the reference took about 234 seconds
and the remaining tool setup about 46 seconds. Each of the changed r3 and
r4 wheels took about 3 seconds to build. The r3 service profiles took
about 1,172 seconds overall across SQLite and PostgreSQL, with 548 seconds
inside the measured windows. About 399 seconds elapsed through database
preparation and both service startups. The remaining 225 seconds included
health checks, client setup, warmup and cleanup. These are estimates from
retained timestamps. New service receipts separate database preparation,
startup, client setup, warmup, measured work and cleanup with a monotonic
clock. Package builds occur before that run.

The first matched r4 Stop pair with the same diagnostic on both sides
passed all six frozen limits. Each backend recorded 100 valid observations.
A and B rejected one and fourteen waves respectively on the load check.
Durable lease release p50/p95/p99 was 4,312.387 / 5,209.127 / 5,824.744 ms
for A and 93.802 / 129.613 / 135.933 ms for B. One passing pair is partial
evidence for the three-pair Stop gate. This pair took about 911 seconds
from the two Hardware starts through their sealed receipts. Keep a
verified pair when restarting an interrupted later pair.

The r5 loaded Stop gate **PASS** covers all three independent pairs with
100 observations per backend per pair. It reused two matching A receipts
and measured three new B windows. One A wave and 21 B waves missed the
load qualification. Every accepted observation met the safe ACK, worker
cleanup, capture and lease invariants. There were no residual leases.
The table gives the median across windows for each percentile.

| Stop latency | A p50 / p95 / p99 ms | r5 p50 / p95 / p99 ms |
| --- | ---: | ---: |
| HTTP Stop | 54.715 / 128.714 / 336.275 | 65.137 / 86.017 / 137.575 |
| gRPC ACK | 38.254 / 117.519 / 313.666 | 45.041 / 66.614 / 83.415 |
| Durable lease release | 4,362.157 / 7,854.343 / 8,050.876 | 85.692 / 122.815 / 184.875 |

The four planned integration suites passed 27 cases against r5's installed
wheels. The full SQLite and PostgreSQL load checks use separate receipts.
In the first r5 SQLite attempt, all 1,200 measured jobs returned matching
captures, but the gate **FAIL** was 27 of 29 checks. Project-list p95/p99
were 223.000/264.910 ms against limits of 200.994/245.163 ms. The unchanged
reference reached 290.020/305.144 ms in the same attempt, compared with
67.8/88.6 ms in the earlier r3 comparison. Other processes were using CPU
during the first attempt. Keep its failure and repeat the same workload
and thresholds when the runner is idle.

The first r5 SQLite attempt took 995.62 seconds. The recorded phases
include 31.72 seconds for setup and verification, 225.75 for service
startup, 197.57 for client setup, 18.43 for warmup, 514.86 for measured work
and 6.99 for cleanup. Wheel builds occurred separately.

The full r5 SQLite retry **PASS** covers all 29 limits and 1,200 measured
jobs with byte-verified NCAP. Project-list p95/p99 were 71.435/117.923 ms.
Median jobs/second were 1.889 for A and 4.309 for r5. Median peak RSS was
606.90 and 292.31 MiB. The retry took 896.21 seconds, with 211.26 for
service startup, 160.75 for client setup, 17.32 for warmup, 476.27 for
measured work and 6.89 for cleanup. The first attempt's measurements and
threshold failure remain part of the record.

The r5 PostgreSQL 18.6 load gate **FAIL** passed 22 of 29 limits after
all three pairs and 1,200 byte-verified jobs. Median throughput was
1.818 → 1.970 jobs/second and peak RSS 612.07 → 289.61 MiB. The same
reference reached 4.889 jobs/second in the r3 PostgreSQL comparison.
There was concurrent desktop CPU use. The available observations do
not isolate the cause of the full slowdown.

| PostgreSQL check | A ms | r5 ms | Limit ms |
| --- | ---: | ---: | ---: |
| AND capture p95 / p99 | 93.504 / 131.866 | 129.545 / 154.760 | 92.557 / 153.366 |
| AND poll p95 / p99 | 195.070 / 341.884 | 263.268 / 538.285 | 194.792 / 386.104 |
| Clock Run p99 | 1,515.386 | 1,379.434 | 1,339.881 |
| Project-list p95 / p99 | 289.003 / 304.442 | 303.022 / 332.575 | 302.778 / 330.987 |

The PostgreSQL profile took 1,109.17 seconds. The timed workload used
614.72 seconds. Database and window preparation, service startup,
client setup, warmup and cleanup used 2.67, 222.99, 212.06, 21.55 and
8.95 seconds respectively, with the remaining time in verification and
reporting. The owned cluster stopped after the run. This result applies
to the exact r5 artifacts. The released profile selects `legacy`.

A second full PostgreSQL run on the same r5 bytes verified all 1,200
captures and passed 20 of 29 checks. Median throughput was 1.736 → 1.747
jobs/second against a 1.760 minimum. The fixed HTTP and capture throughput
limits also failed. AND capture p95, AND create p99, AND poll p95/p99,
clock create p95 and clock Run p95 exceeded their limits. The released
reference was close to the frozen Stage 0 range of 1.830–1.920 jobs/second.
The much faster r3 run remains a separate observation. The CPU sample
before the repeat showed less desktop CPU use, so that factor alone did
not explain the PostgreSQL gate result.

A paired diagnostic ran 40 jobs per backend. Among the slowest five
percent of r5 polls, the median application time was 283.70 ms, with
253.74 ms waiting for the scheduler lock and 1.94 ms executing SQL. The
same diagnostic found that slow capture and project reads spent much of
their time waiting for the repository lock. The probes measure overlapping
spans and this short run does not score the frozen limits.

R6 uses a committed, owner-checked snapshot for the two REST reads of a
non-queued experiment. A queued read rechecks ownership and state under
the scheduler lock before reporting its live position. Run, Stop, event
publication and operation recovery still use the serialized snapshot.
The new tests cover the unlocked read, wrong-owner rejection and dispatch
between a queued read's initial observation and the locked re-read. The
focused scheduler, API and access suites passed 65 cases. The rebuilt
Remote wheel SHA-256 is
`7a050978ca43083dfd3e119f475d0a8d939b9c22341e372b588f2408ad955a96`.
The other product artifact bytes match r5. The full r6 PostgreSQL profile
passed 16 of 29 limits. It brought AND poll p95/p99 down to 105.335/166.265
ms, but the first two candidate windows handled 4,401 and 4,471 HTTP
requests for 200 jobs. Shorter polls let the same client cadence issue
more requests while a Run was active. Median throughput fell to 1.449
jobs/second and CPU rose to 0.592 seconds/job. All 1,200 captures matched.

R7 retains the polling change and reads session and user data in one SQL
statement per authorization lookup. The existing transactional write fence
and post-fence expiry, revocation and revision checks still apply. The
query-count regression passed within the 121-case API and access suite. Five
PostgreSQL cases verified concurrent session fences, capture retirement
and assignment admission. The Remote wheel SHA-256 is
`d66ea041d27b3215be106c1bb18ca3efd90eb2e4d9904715fb1b0e264e1f30f0`.

The r7 PostgreSQL 18.6 load gate **PASS** met all 29 frozen limits across
three pairs of 200 jobs per backend on Windows x64. All 1,200 NCAP
captures matched byte for byte. The timed workload and client cadence
were unchanged. Median throughput was 4.410 → 4.633 jobs/second, CPU
0.235 → 0.216 seconds/job and peak RSS 615.75 → 300.98 MiB for A and r7.

| Previously failing PostgreSQL check | r5 ms | r7 ms | Frozen limit ms |
| --- | ---: | ---: | ---: |
| AND capture p95 / p99 | 129.545 / 154.760 | 62.202 / 78.271 | 92.557 / 153.366 |
| AND poll p95 / p99 | 263.268 / 538.285 | 49.596 / 121.351 | 194.792 / 386.104 |
| Clock Run p99 | 1,379.434 | 502.861 | 1,339.881 |
| Project-list p95 / p99 | 303.022 / 332.575 | 86.128 / 119.113 | 302.778 / 330.987 |

The r7 PostgreSQL profile took 814.08 seconds of pytest wall time versus
1,109.17 seconds on the first r5 run. R7 reused the verified build.
Profile setup took 41.66 seconds. Across the six windows, database and
window preparation, service startup, client setup, warmup, timed work,
measurement teardown and cleanup took 1.97, 242.07, 140.36, 14.87,
365.35, 0.17 and 6.86 seconds respectively. The remaining time was spent
in verification and reporting. The A windows varied from 40.45 to
116.04 seconds, so the reduction in wall time includes run-to-run
variation. The owned PostgreSQL cluster stopped at the end of the run.

The r7 SQLite load gate **FAIL** passed 28 of 29 checks, with all 1,200
NCAP captures matching byte for byte. AND capture p95 was 85.662 ms
for A and 98.726 ms for r7 against the 89.121 ms limit. The three
r7 windows measured 111.156, 98.726 and 45.312 ms. Median throughput
was 2.051 → 2.061 jobs/second, CPU 0.406 → 0.471 seconds/job and peak
RSS 607.68 → 281.07 MiB. The candidate generated 2,521 and 2,516 poll
requests in its first two windows, compared with 1,226 and 1,156 in the
first two r5 retry windows under the same client cadence.

The r7 SQLite run took 1,010.99 seconds of pytest wall time. Setup took
31.94 seconds. The six windows used 217.66 seconds for service startup,
205.31 for client setup, 19.34 for warmup, 528.33 for timed work,
0.23 for measurement teardown and 7.57 for cleanup.

A separate instrumented comparison of 80 jobs per backend found that
the slowest 20% of r7 AND capture GETs spent a median of 21.27 ms waiting for the
repository lock, 3.41 ms reading and validating the file and 1.04 ms
executing SQL. The wait was spread across the existing ownership and
session checks. The short run did not reproduce the formal latency.
The next formal run kept the artifact and gate unchanged and sampled
background process CPU throughout the paired windows.

The r7 SQLite retry **PASS** met all 29 limits with 1,200 byte-matched
captures. AND capture p95 was 49.859 ms for A and 53.139 ms for r7.
The three r7 windows were 42.237, 53.139 and 88.515 ms. Median
throughput was 2.989 → 4.643 jobs/second, CPU 0.233 → 0.194 seconds/job
and peak RSS 606.82 → 283.45 MiB. Pytest wall time was 809.96 seconds.
Setup took 32.20 seconds. Service startup, client setup, warmup, timed
work, measurement teardown and cleanup took 237.71, 117.45, 13.36,
402.17, 0.19 and 6.18 seconds. The same r7 build was used in both runs.
Their difference shows Windows runner variability, and both receipts
remain part of the record.

### Gate 1 decision for Windows x64

The r7 `saturated-v1` Stop gate **PASS** met all six frozen limits in
each of three independent pairs. Each side supplied 100 qualified
observations per pair. The three legacy receipts were reused after
the harness verified their release, workload and probe digests. All
qualified samples met safe ACK, worker cleanup, capture and durable
lease requirements. There were no residual leases. A and B discarded
one and 23 waves respectively because they did not meet the load check.
The candidate windows took 384.30, 405.82 and 298.51 seconds.

| Stop latency | A median p50 / p95 / p99 ms | r7 median p50 / p95 / p99 ms |
| --- | ---: | ---: |
| HTTP Stop | 54.715 / 128.714 / 336.275 | 79.088 / 114.662 / 138.435 |
| gRPC ACK | 38.254 / 117.519 / 313.666 | 50.958 / 77.013 / 88.645 |
| Durable lease release | 4,362.157 / 7,854.343 / 8,050.876 | 113.206 / 175.904 / 239.915 |

The original Stage 0 Stop circuit remains a separate qualification
record. It gave zero qualifying observations in the early C++ trial.
The supplemental gate used the same heavier circuit and qualification
for both sides with the original sample counts and absolute limits.
All 27 planned integration cases passed on the installed r7 wheels.
The same Simulator, Hardware and worker bytes carry the prior direct,
lifecycle and sanitizer evidence. The worker's memory and process
bounds are enforced by the OS. Its CPU work is bounded by admission,
event limits and host deadlines.

Use the verified r7 combination for Stage 2 with
`CIRNET_SIMULATION_BACKEND=cpp`, the pinned worker path and SHA-256,
four Run workers, and PERSIST/FULL for the SQLite load configuration.
The measured local manifest SHA-256 is
`e7e2ce0056b11eb6cbf42304cb35607b2263e464a57cddb9485e43d61ac0f50d`.
Rollback follows the cancellation, reaping and generation fencing
procedure above and reinstalls the 0.1.4 reference. RTL, HIL and SPICE
remain `NOT RUN` for this Windows virtual simulation gate.

### Future SPICE core based on ngspice

**Proposed.** Keep the Stage 1 C++ digital core and its bounded DC model
for compatibility. Develop a separate SPICE backend from upstream ngspice
source. Evaluate the shared C library inside the isolated C++ worker so
Remote and Hardware retain their current process and safety boundaries.
Compare its callbacks and cooperative interruption with a pinned batch
child for the first analog cases. Start with one simulation per child.
Deadline expiry or failed interruption requires terminating and reaping the
child before reporting safe cleanup. [ngspice shared library](https://ngspice.sourceforge.io/shared.html)

- [ ] **Select a reproducible input.** Start the experiment with upstream
  `ngspice-46` and a headless shared build with XSPICE enabled. Record the
  archive SHA-256, exact toolchain and options, patches, target ABI, library
  and code-model hashes, and each model's origin, version and SHA-256.
  Audit the selected source and all packaged components against their
  notices and redistribution terms before packaging. [Upstream release archive](https://sourceforge.net/projects/ngspice/files/ng-spice-rework/old-releases/46/)
- [ ] **Translate and capture.** Validate `CircuitGraph` first. Assign stable
  net and element names, map approved parts and pin order to a versioned
  model catalog, and emit a bounded netlist. Resolve model paths inside
  the pinned model directory. Collect analog vectors and XSPICE events
  through bounded callbacks. Specify units, time conversion, quantization,
  ordering and how gaps and unknowns are represented before emitting
  Contracts-compatible NCAP. [ngspice documentation](https://ngspice.sourceforge.io/docs.html)
- [ ] **Evaluate parity and failure handling.** Run RC and diode/LED analog
  references, 74HC08 gates, clocks, fan-out, unpowered inputs, conflicting
  drivers and analog/digital bridges. Compare event order, equal timestamps,
  propagation delay and CIRNET `0/1/X` against the C++ corpus. Define a
  mapping for XSPICE logic and drive strength before testing parity. Exercise
  invalid graphs and models, nonconvergence, limits, timeout, cancel, crash
  and late replies through Run and preview. [XSPICE in ngspice](https://ngspice.sourceforge.io/xspice.html)

The downloaded `ngspice-46.tar.gz` matched the selected SHA-256
`a0d1699af1940b06649276dcd6ff5a566c8c0cad01b2f7b5e99dedbb4d64c19b`.
The Simulator backend plan records verified source digests for the first
three XSPICE models. SPICE build, runtime, review of distributed components
and digital parity are **NOT RUN**. [Upstream tarball](https://sourceforge.net/projects/ngspice/files/ng-spice-rework/old-releases/46/ngspice-46.tar.gz/download) · [Pinned build recipe](https://github.com/Homebrew/homebrew-core/blob/539f6abfdfdff8af39757bc100dfbce1db0c5618/Formula/lib/libngspice.rb#L3-L5)

Select a digital replacement only after parity and performance pass. Expose
only implemented and verified capabilities in the release manifest. The
Simulator backend documentation owns the detailed implementation sequence.

## 2. Rust Contracts

- [x] **Keep canonical sources.** Contracts retains JSON Schema and the manifest, `device-library/` and catalog projections, `contracts/hardware/v2/rpc_v2.proto`, `contracts/capture/layout.json` and `ncap.schema.json`. Port `validation.py`, semantic validators, `capture_codec.py` and generators in `contracts/codegen/`. `contracts/api/openapi.json` is the approved handoff from the Remote exporter. Generate Rust crates and types, the `@cirnet/contracts` SDK and Python bindings for pytest, and retain the old Python wheel for transition consumers. Run the Rust runtime and SDK generation on a machine without Python.
- [x] **Matrix and Gate 2.** Run B with the current Python wheel and npm artifact. Repeat with the SDK from the Rust generator on Interface, keeping the legacy wheel installed for Remote and Hardware. Run the same corpus through legacy Python, the Rust binary or bindings, and the packed npm tarball. Preserve descriptor field numbers, both service names, absent/default distinctions, errors, 0/1/X, order and canonical NCAP1/NCAP2 bytes. Check JSON, timing and gaps, and NCAP2 INT16/UINT16/FLOAT32 encodings. Run legacy generator checks, `scripts/check_public_compatibility.py`, SDK runtime and type checks, and two clean builds with the same commit and toolchain to compare digests. Report generation time, package size and validation and codec throughput. Change the default generator only after parity and reproducibility pass. Roll back to the verified old crate, SDK and wheel set, keeping prior artifacts.

### Stage 2 candidate verification

The Contracts candidate commit `e640f80b1199779659d3db7817fee16d13cc24c1` builds on
`f559ec5b21ea7ecf50db4dc5c5e1dc7c5eb5ad39`. Its Rust crate provides offline
validation, NCAP1 and NCAP2 codecs, Hardware RPC types and descriptors, and
a generator for the TypeScript SDK. The Python test binding compares
against the selected 0.1.2 wheel. Remote and Hardware still use that wheel.

| Check on the first frozen candidate | Result | Evidence |
| --- | --- | --- |
| Windows x64 Rust | PASS | 41 tests, including the external SDK generation and packaging cases. |
| Windows x64 installed-wheel comparison | PASS | 142 cases covering validation, NCAP bytes, timestamps, errors and the RPC descriptor. |
| Legacy generator and public compatibility | PASS | Python generation, editor catalog and board topology checks and the public wire anchors. |
| SDK and Interface 0.1.4 | PASS | Native SDK tarball matches the sealed npm artifact byte for byte. Interface passed 11 package checks and 1,498 tests. The build reproduced all 34 served files. The release archive adds its own manifest. This permits reuse of the Stage 1 B integration evidence for those exact runtime bytes. |
| Two clean Linux x64 builds without Python | PASS | Offline Rust 1.90.0 and Node 26.12.1. Both runs reproduced the executable, crate and npm digests. The first verified the packaged crate and passed 34 native runtime tests. |
| Compound-invalid schema diagnostics | FAIL | Some documents that violate several constraints can return a different first issue from the legacy validator. |

The two clean builds took 33.06 and 32.54 seconds before generation.
SDK projections took 3.97 and 2.77 seconds. The legacy generator check
took 13.56 seconds and also checked Python model generation. The executable,
crate and SDK archive sizes were 7,045,320, 692,769 and 825,291 bytes.
Keep the first candidate's failed diagnostic comparison with its receipts.

R2 restores the legacy first issue when a declared property fails before
a direct required-property failure in the named schema. It passed the two
reported compound cases in both structural and transport profiles.
**Gate 2 PASS** covers 42 Windows Rust tests, 146 installed-wheel cases,
35 native runtime tests in the Linux build and the same sealed SDK and
Interface matrix. Two clean builds used the same source snapshot SHA-256
`d9d6de46c7cc4b46cf2fe0926ce962a5f2775a2bb8965a0e74e26f2a8447aca8`.
Both produced the same three artifacts. The first also verified the
packaged crate by building it.

| R2 artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Linux x64 executable | 7,064,152 | `a09a9341b0266b86cdc8b55b0cd4ebd56c42855d03dab27322bf5ad3ca3b5a44` |
| Contracts crate | 693,535 | `35c22067f497d68f6461c201dc164e7567ee641fbce66cc243da8567f3b69ec7` |
| npm SDK | 825,291 | `b963cf4990fee8b5a9294a6aaf85cfd803ed7724efc9ad2b3ee1ec302646b3c8` |

The clean release builds took 34.77 and 34.07 seconds. SDK projections
took 2.97 and 3.20 seconds. The Windows throughput comparison used
three alternating windows on identical inputs. It includes the JSON
boundary of the test-only PyO3 binding.

| Workload | Observations per window | Python operations/s | R2 operations/s |
| --- | ---: | ---: | ---: |
| Validation across 18 fixtures | 3,000 | 4,623 | 97,352 |
| NCAP1 encode, 7,001 events | 100 | 250 | 113 |
| NCAP1 decode, 7,001 events | 100 | 547 | 122 |
| NCAP2 decode across 10 fixtures | 1,800 | 1,032 | 15,574 |

Both runtimes matched outcomes on the agreed corpus. Schema message text and
first-issue ordering for other compound-invalid inputs can differ.
Rust strings require Unicode scalar values. The sampled time helper
uses exact rational arithmetic even for integral decimal rate terms
that can round in the legacy helper. The legacy verification lane
continues to lint private schemas. Use the r2 generator for the
verified transition SDK. The original SDK and wheel are the rollback
pair and remain available for Python consumers.

## 3. Rust Hardware

- [ ] **Replace the server and lifecycle.** Port Hardware `server.py`, `rpc.py` and `station/` to Rust with Rust Contracts and the pinned C++ worker. Retain RPC 2.0 with both `cirnet.hardware.v2.HardwareService` and `netcircuit.hardware.v2.HardwareService`, loopback or Unix transport, and the existing ACK, ownership, deadline and NCAP rules. Move preview through a negotiated internal endpoint and keep the Python Remote adapter compatible with old Hardware. Give Stop separate resources for RPC handling, worker cancellation and safe response. Remote still owns leases and quarantine. Keep published capabilities unavailable for stations without a driver.
- [ ] **Matrix and Gate 3.** Compare B with current Interface → Python Remote → Rust Hardware → C++ Simulator, using the legacy wheel in Remote and the crate in Hardware. Retain `test_server.py`, `test_virtual_execution.py`, `test_simulation_workers.py`, `test_rpc_lifecycle.py`, `test_ncap_rpc.py` and `test_physical_station.py` as references. Port assertions tied to Python internals into pytest against a separate RPC binary. Test Start/Stop/reset, lease expiry, disconnect, hung or dead workers, late replies, concurrent Stop with a full queue, and quarantine when ACK is missing. Run Remote integration tests. Apply the [current host-specific policy](#gate-3-acceptance-policy-by-host) to performance and loaded Stop. Keep energization precondition checks in PR gates. Run both pinned RTL testbenches and HIL matching advertised capabilities. Report unavailable equipment separately. Roll back using the lease and quarantine procedure and restore Python Hardware with a compatible worker.

### Gate 3 acceptance policy by host

The Windows x64 development host with Intel Core i5-12500H qualifies
functionality, compatibility and safety for Stage 3. The 29 ordinary
service metrics are diagnostic on this host. They cover CPU/job, peak
RSS, fixed requests/s, jobs/s and NCAP bytes/s, plus p95/p99 for AND
and CLOCK create, Run, poll and capture and for the active, history,
projects and stations reads. Prior Windows comparisons retain their
original measured values, limits and PASS/FAIL results as history.
Ordinary service metrics do not block the Windows gate. A failed
functional assertion, mismatched capture or invalid run still needs
valid evidence for the affected requirement. This policy governs current
decisions. The historical records after the formal Stop receipt retain
their original acceptance context.

Windows requires the B/C matrix on SQLite and PostgreSQL with matching
NCAP digests and valid completion, both Hardware RPC namespaces,
compatible preview and released Interface behavior, ownership and
session fences, fault/timeout and stale-result handling, durable safe
ACK, lease and quarantine, and rollback. Loaded Stop remains a safety
gate with the [approved Hardware rendezvous method](#gate-3-approved-start-synchronization-profile),
the same workloads, three paired windows of 100 valid samples per
side and the existing attempt limit. Record
`CIRNET_NATIVE_STAGE3_STOP_ACCEPTANCE_SCOPE=windows-functional-safety-v1`
separately from the Start method. All six frozen absolute Stop p95/p99
operational ceilings and the existing hard deadlines are required. Report the six paired
110%-of-B comparisons and their PASS/FAIL as diagnostics. Ingress,
worker exit before ACK, lease release, quarantine and late-result
rejection proofs still apply. Keep RTL evidence separate from HIL.
The scaffold advertises physical execution as unavailable and HIL
remains **NOT RUN**.

| Windows evidence for exact r8-R2 | Current status |
| --- | --- |
| PostgreSQL matrix capture and completion | **PASS**. The full r8 run verified 1,200 measured captures across B and C. Its ordinary service result remains a historical **FAIL**. |
| SQLite API and released Interface | **PASS** for 130 source-level SQLite/API cases and exact r8-R2 B/C browser AND capture. Browser receipt SHA-256 `b20393483709467efa5f09e85db87172c5cadb10110e8b789994e4354376de93`. |
| Exact SQLite matrix smoke and rollback | **PASS**. Two focused r8-R2 checks in 134.99 s verified AND and CLOCK captures, both preview routes, station parity and rollback to Python Hardware. |
| Exact native lifecycle and Remote safety checks | **PASS** for 25 Rust lifecycle and three exact Remote lease, quarantine and disconnect cases. |
| Concurrent Stop at full Remote admission and scheduler budget | **PASS**. Two component tests on installed r8 in 5.15 s. |
| Pinned FPGA RTL | **PASS** for the 30 prior testbench checks on the same pinned FPGA scaffold. HIL remains **NOT RUN**. |
| Formal loaded Stop and aggregate Windows gate | **PASS**. All 600 qualified samples met the required causal and safety checks. All six frozen operational ceilings passed. See the [formal Stop receipt](#gate-3-formal-windows-loaded-stop). |

The exact SQLite smoke and rollback receipts have SHA-256 values
`bcaf7513f286a928e3fec9a19e7dd99614ccdfdfa1f97c20540456e05b087c56`
and `d6f78f7ed3c08eb3b31c3716428237426085548e65d30b2784b8059c352d31ea`.
Controller SHA-256 is
`045a3c3aea3c687ae66a9fa9f61921e3090bbab003d4772ab6ce106f4b422080`.
The older r4 SQLite and r6 smoke/rollback receipts remain comparison
history for their own Remote and Hardware manifests.

The [full-admission Stop test](../../../services/api/tests/test_control_sweep_isolation.py#L107)
filled all 50 Remote queue slots, overlapped Stops for active and queued
jobs, and verified lease retention until safe cleanup and rejection of
late results. The [Stop dispatch budget test](../../../services/api/tests/test_control_sweep_isolation.py#L71)
verified that cancellations beyond the 16-dispatch budget were retained
and retried. These SQLite tests used a controlled station. The formal
loaded Stop run separately exercised four busy Hardware workers. All 71
`app/` members matched the installed r8 wheel byte for byte and all 31
`app` module imports came from its `site-packages`. Receipt
`gate3-r8-queue-safety/4458bff5993541f09067dd3d2f82c1a5/pytest.log`
SHA-256 `be0bf1403962a3a1e8df321c6d30e0a86eee56e652712da873f7050d8b8df0d5`.

The approved production performance platform is a Linux Xeon host.
Production performance remains **NOT RUN** until that host and exact
Linux artifacts are ready. Build or select platform-native B and C at
their pinned versions. Pin the Linux manifests, binaries, wheels, worker,
toolchain, dependencies and harness hashes. Compare B and C on the same
Xeon host with the same cpuset and NUMA policy, Linux and database
configuration, test data, workload, concurrency, warmup, client cadence
and measurement procedure. Record topology, OS and kernel, memory,
power and scheduling policy, storage, PostgreSQL durability and concurrent
load. Use isolated, equivalent starts and alternate the paired order.

Verify functional, compatibility and safety evidence on Linux, including
NCAP and loaded Stop, before production acceptance. The Linux Stop harness
needs equivalent monotonic ingress, worker exit, ACK and lease proofs
for the Windows QPC measurements. Keep the operational deadlines and
quarantine and stale-result checks. Run a separate Linux reference
calibration and approve and record the sample count, comparison method
and Linux-specific thresholds in preflight before formal measurement.
Use the approved Linux thresholds and Linux artifact digests for the
Linux result. The six absolute Stop ceilings still govern Windows.

The r8-R2 evidence closes Windows functionality, compatibility and safety.
Commit Stage 3 before starting Stage 4. Linux performance and
production/release acceptance remain **NOT RUN**.

#### Gate 3 formal Windows loaded Stop

The formal r8-R2 run passed with
`CIRNET_NATIVE_STAGE3_STOP_METHOD=natural-loaded-stop-hardware-rendezvous-v1`
and `CIRNET_NATIVE_STAGE3_STOP_ACCEPTANCE_SCOPE=windows-functional-safety-v1`.
The unchanged workload and cap of 403 attempts per side and window yielded
600 qualified samples from 802 attempts. The Python B reference had 202
attempts that did not qualify. Rust C qualified on every attempt.

| Window | Python B qualified / attempts | Rust C qualified / attempts |
| --- | ---: | ---: |
| 1 | 100 / 175 | 100 / 100 |
| 2 | 100 / 153 | 100 / 100 |
| 3 | 100 / 174 | 100 / 100 |

All times below are milliseconds. All six Windows ceilings passed.
The three relative failures remain in the receipt for performance diagnosis.

| Stop metric | Python B | Rust C | Frozen Windows ceiling | 110% of B | Relative diagnostic |
| --- | ---: | ---: | ---: | ---: | --- |
| HTTP p95 | 78.6032 | 89.1368 | 197.55406 | 86.46352 | FAIL |
| HTTP p99 | 100.8966 | 100.4389 | 581.1564 | 110.98626 | PASS |
| gRPC safe ACK p95 | 56.3787 | 62.2677 | 139.20478 | 62.01657 | FAIL |
| gRPC safe ACK p99 | 69.3376 | 78.5544 | 526.71179 | 76.27136 | FAIL |
| Safe lease release p95 | 145.9619 | 144.0377 | 2534.55686 | 160.55809 | PASS |
| Safe lease release p99 | 168.5140 | 163.8268 | 2598.37468 | 185.36540 | PASS |

The formal test passed in 2,953.75 s. Its controller exited 0 after
2,954.467 s. All digests below are SHA-256.

| Artifact or receipt | SHA-256 |
| --- | --- |
| r8-R2 candidate manifest | `ebc49c57c052e0a78c98074af240c78010f787872a4ad32ac23617ada1fc15bd` |
| Formal Stop harness | `939b362c7fc12d463e79e7fec5a54d8a86dfa78e5c579fab1d60b0b97d08b330` |
| Loaded Stop workload | `e48b3d87456a93e3b97f8872fa39ea45099bbf34a49d0e32b888d9b4458a0c2c` |
| `native-hardware-stop/97612df8bfb942bfbb131dbaf78c1b10/stop-summary.json` | `41b41bb221ec29118e324637119cf2fdfd5a267760b2b7a1da8d9da3310593b0` |
| `lifecycle-rpc/start-rendezvous/r8-r2-windows-safety-stop-7afac62f5d3241489dde91a070ad2cb7/controller.json` | `35374c64a4268f56f920cf62e66ef03b6bdc721388e1723a1b32d61b954922bd` |

The formal harness bytes are preserved at
`stage3-formal-stop-harness/native_hardware_stop_cases.py` with the
original SHA-256 above. The repository version removes one trailing
blank line and has SHA-256
`fb07d42f98e6bcc2ebed006ce9f05364b2c2e96c2979032a7557b3da45e8d9f0`.
The parsed syntax tree and its source locations match the archived copy.
The edited harness passed 26 service-free tests and two gRPC loopback
tests covering both RPC namespaces.
The Stage 3 Hardware source is recorded at commit
`3ad140f24ae5f3f2e6b735b5cff4beec7bffda54`.

### Gate 3 progress

The Windows x64 candidate implements both RPC 2.0 namespaces, virtual
station lifecycle, NCAP capture, and a separate preview lane. Python Remote
opts in through `CIRNET_HARDWARE_PREVIEW=true` and falls back to local preview
when an older Hardware returns `UNIMPLEMENTED` on the version check.

The r2 Windows x64 measurements used Rust 1.90.0 and
`cargo build --release --locked --offline`. The Hardware binary SHA-256 is
`39e206e1e306f2e3e041bc52c1802ba9a6da333e1592009d01920c7c9a31221b`.
The Remote candidate wheel SHA-256 is
`e44bd8be68ecc46895ac195bfc8f767173a8932e1ac8d7dc9e456984bbe3d33e`.
B used Stage 1 r7 wheels. B and C used the same Stage 1 r7 C++ worker and
the approved Python Contracts wheel. C Hardware used the Stage 2 r2 crate.

| Verification | Status |
|---|---|
| Pinned C++ worker parity | PASS, 4 tests including NCAP SHA-256 and physical graph validation |
| Python Remote preview and exact OpenAPI handoff | PASS, 40 tests and byte comparison in both configurations |
| Rust Hardware gRPC lifecycle with exact Windows candidate | PASS, 12 tests including lease expiry, disconnect and restart quarantine |
| Large capture on exact B and C binaries | PASS, 100,000 samples and 1,100,101 matching NCAP bytes |
| Existing Python Hardware reference tests | PASS, 46 tests |
| Remote integration and selected API regressions | PASS, 114 cases across the initial run and the artifact-setup rerun |
| Released Interface in Chromium with real B and C services | PASS, identical AND waveform and 124-byte NCAP capture |
| Both pinned Windows FPGA RTL testbenches | PASS, 30 tests |
| HIL | NOT RUN. The selected FPGA scaffold advertises no physical execution |
| B/C SQLite load, three 200-job windows per side | FAIL, 29/29 frozen and 19/29 paired checks. All 1,200 captures matched |
| B/C PostgreSQL load, three 200-job windows per side | FAIL, 29/29 frozen and 21/29 paired checks. All 1,200 captures matched |
| Natural loaded Stop | FAIL, 76 of 100 qualified observations in the first Python window |

The held-worker diagnostic compares three windows of 100 Stops per side.
The first Rust candidate recorded p95/p99 of 31.041/34.599 ms. Reducing the
bounded cancellation and reap poll from 10 ms to 2 ms yielded 18.261/19.481 ms
against 22.498/24.927 ms for the paired Python lane. The 600 Stops in the new
pair each verified safe ACK, reaping and a fenced capture. This diagnostic
uses a suspended child. The natural-load gate runs separately.

Direct loopback `GetCapabilities` matched all 3,000 replies per side. Aggregate
throughput across the three windows was 2,097 RPC/s for Python and 5,822 RPC/s
for Rust. The corresponding p95/p99 were 0.681/0.954 and 0.243/0.294 ms.

The SQLite windows recorded 4.943 → 4.567 jobs/s and 109,315 → 101,003
NCAP bytes/s by median. The active-experiments read had p99 of 54.776 →
110.925 ms. The first Python window took 85.24 s and the next two took
39.47 and 40.46 s. All windows remain in the paired result.

PostgreSQL median throughput was 5.578 → 5.534 jobs/s. Eight HTTP latency
checks failed the paired bounds, including clock Run p99 at 371.575 →
501.905 ms. The dedicated PostgreSQL 18.6 test cluster shut down after
the measurements.

The first natural Stop window attempted 403 measured waves. In 202 of
the rejected waves at least one Start had completed before Stop reached
gRPC. The six-sample diagnostic and the held-child results are reported
separately. The natural Stop comparison remains incomplete.

In a separate 40-job-per-side diagnostic, total Hardware RPC time per job
had p95 of 43.47 → 21.77 ms. Union of scheduler lock-wait intervals had p95
of 1,089.33 → 1,278.57 ms. These samples locate time within the path. The
cause of the HTTP latency failures remains open.

The rollback rehearsal drained the Rust stack, reopened the same SQLite and
capture state with Python Hardware, verified the retained NCAP SHA-256 and
completed a new Run. Gate 3 is open pending the remaining qualifications.
The checked Windows evidence archive SHA-256 is
`4ed962dcc9e30c6229cd3a0490a403e1575594637e03f50d5e98abb7ba0582cd`.

### Gate 3 retest on Windows x64

r3 reuses the experiment record read for the pre-RPC cancellation and session
check. The post-RPC check remains fresh. r4 also reads the committed owner and
payload in one query before publishing the experiment update. The existing
manager lock still orders transitions and events. The SQLite regression
verified a concurrent owner transfer and the corresponding public snapshot.
r4 passed 137 focused regressions, four PostgreSQL session and lease cases,
and the exact OpenAPI comparison.

| Candidate and profile | Result | Frozen | Paired | Matching captures |
|---|---|---:|---:|---:|
| r3 SQLite | FAIL | 29/29 | 14/29 | 1,200 |
| r3 PostgreSQL | NOT RUN | — | — | — |
| r4 SQLite | FAIL | 29/29 | 28/29 | 1,200 |
| r4 PostgreSQL | FAIL | 29/29 | 17/29 | 1,200 |

Each load profile used three paired windows with 200 jobs per side per
window. r4 median jobs/s increased from 4.707 to 5.004 on SQLite and from
4.997 to 5.374 on PostgreSQL. Median CPU seconds/job decreased from
0.194 to 0.174 and from 0.199 to 0.180 respectively. SQLite missed clock
creation p95 at 116.670 ms against the paired limit of 114.925 ms.
PostgreSQL missed 12 paired HTTP latency checks, including AND poll p99 at
222.723 ms against 114.236 ms. All windows and host CPU samples are retained.

The strict Stop diagnostic verified eight observations per side with r3.
The separate r4 alignment diagnostic paused the four verified idle workers
during setup and resumed all of them before the measured workload and Stop.
It qualified 8/11 Python attempts and 8/9 Rust attempts. The same Python
artifact qualified 8/35 attempts without the setup alignment. Every accepted
attempt proved complete in-flight frames, target exit before safe ACK, and
durable lease release after cleanup. The formal natural Stop retest is
NOT RUN for r3 and r4. Its default path, three windows of 100 samples per
side, and thresholds remain the gate requirements.

The r4 Remote wheel SHA-256 is
`f4c71271760ca95843c50378fced2c4c81407fe4bfad616886cf57d273805c2f`.
The verified r3/r4 evidence archive SHA-256 is
`400f0bb54a731f0b1819d6d5c9c404cbe44aad1b8c7d2d68f187de2a7b0915fa`.
Gate 3 remains **FAIL**. The Stage 3 changes are pending integration.

### Gate 3 boundary diagnosis after r4

The worktree bases are Hardware `c41027d` and Remote `fd546f1`. The r4 manifest
SHA-256 `f8b7feb73b8cd3c2bee6b9a2528a4db04dd2951d4513e2b17fef51a13b95f694`
matched its three packaged artifacts and all seven recorded Remote source
overlays. Reused the exact installed wheels, Rust binary, Contracts crate,
pinned C++ worker and reference evidence. The formal r4 results above still
apply. The short comparisons used fresh loopback PostgreSQL 18.6 schemas.
Historical paired B timing remains specific to its original run conditions.

Run the external diagnostics from the Remote worktree with the verified
Stage 1 Python interpreter, selected r4 manifests, and an isolated PostgreSQL
URL. The second command also uses the separately verified experimental wheel.

~~~powershell
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . "$diag/rpc/test_rpc_phase_diagnostic.py"
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . "$diag/test_auth_snapshot_http.py"
~~~

The first diagnostic ran 40 jobs per side with the same r4 Remote wheel and
only Hardware changed. It took 287.35 s and exited FAIL on the process
inventory guard because Rust started a second pinned worker after warmup.
Both lanes retained 40 completed jobs and four warmup captures with exact
hashes. The external `analyze_retained_spans.py` reconstructed only job and
request spans identified in the trace. For `GET /api/experiments/active`,
server p95 rose from 102.437 to 136.512 ms. Repository lock wait rose from
78.726 to 102.407 ms and SQL changed from 13.414 to 11.644 ms. That route
made zero Hardware RPCs. The first lock acquisition, the session read, rose
from 42.822 to 66.736 ms. Scheduler RPC-union p95 improved from 93.004 to
53.679 ms. Endpoint CPU observations were 24.609 → 22.672 s for Remote and
1.813 → 0.547 s for Hardware. Pinned Simulator CPU deltas were 0.016 and
0.031 s at Windows timer granularity, with different warm-worker inventories.
This isolates a measured contention point. The cause of the full set of
formal misses and the effect of the runner remain open.

The experimental wheel changes only PostgreSQL cookie lookup and wheel
metadata. A real concurrent logout reproduced the old lock wait and passed
with the experiment. The old cookie was rejected after commit, and the
mutation fence waited and rejected the revoked session. Four PostgreSQL
session/lease tests and 50 auth regressions passed. The 40-job-per-side
HTTP comparison took 234.83 s with the same Rust Hardware and byte-verified
captures. Active-read p95 improved from 128.049 to 109.986 ms, while throughput
fell from 1.585 to 1.302 jobs/s and clock-create p95 rose from 164.569 to
278.782 ms. Kept the experiment external and retained r4 in the worktree.
The short comparison took 335.73 s less than the historical 570.56 s formal
PostgreSQL invocation. The two runs have different purposes and sample counts.

The retained boundary report SHA-256 is
`7b349df4c0b597765857aacb279e611d2c86511328650b67aa5d9c851fcbef73`.
The experimental wheel SHA-256 is
`8f3203fb2c60623199d2c189311008b5d293d529bbb53f2986d011919d5430bf`
and the short HTTP summary SHA-256 is
`10dcb8a6e9423949e0a8b74f06016d5bbfe6f78f80f9cf688ccd8ce3eed2da29`.

Gate 3 remains **FAIL**. The next diagnostic needs lock-hold attribution by
caller and PostgreSQL connection waits. The full SQLite and PostgreSQL
retests and natural loaded Stop remain pending for a qualified candidate.
The sample counts, paired/frozen thresholds, and Stop safety proof remain
the formal requirements.

### Gate 3 lock attribution and Stop observer

The worktree bases remain Hardware `c41027d` and Remote `fd546f1`. The
diagnostics reused the verified r4 manifest, Stage 1 interpreter, Rust
Hardware binary, Contracts crate, and pinned C++ Simulator listed above.
PostgreSQL diagnostics used fresh loopback schemas on PostgreSQL 18.6.
The server executable SHA-256 was
`8b8bf5d400487159e3e117053d3f5a89fad0c740b310a3ac69e5720ce4f818e1`.

Run the external diagnostics from the Remote worktree with the verified
release environment, the installed wheels, the isolated PostgreSQL URL, and
`CIRNET_STAGE3_PAGE_EXPERIMENT` pointing to the diagnostic wheel receipt.

~~~powershell
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp "$ownedTmp" "$diag/test_pg_lock_holders.py"
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp "$ownedTmp" "$diag/test_page_snapshot_http.py"
& $B -B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp "$ownedTmp" "$diag/test_page_snapshot_http_reverse.py"
~~~

The r4 lock diagnostic passed in 115.37 s with 24 exact captures. The
service lane took 92.55 s, including an 18.46 s workload window. Active
GET p95 was 95.537 ms, with repository wait p95 at 69.773 ms, SQL at
8.919 ms and pool acquisition at 0.099 ms. `AuthService.current`,
`page_experiments` and `_experiment_row` were the largest named holders
overlapping active reads. History GET p95 was 230.914 ms, with 135.619 ms
of manager lock wait at p95. The largest overlapping manager holder was
`_transition`. Holder overlap is summed across waiting requests. The
profile identifies contention in Remote on these paths. Attribution of
all formal PostgreSQL misses remains open. Lock report SHA-256
`7d769352e1e59875804a193ea7e94766f89d43915c5c0b332d69f97fb7443a10`.

The Stop harness now waits on the exact Windows worker process handles
while retaining the later four-worker pipe-counter proof. It checks
same-PID ordering against the last all-alive observation and the later
counter sample. It cancels and joins the wait before closing handles.
The ACK, reap, lease, quarantine and stale-result checks retain their
existing requirements. Five focused checks passed in 0.52 s. With
`CIRNET_NATIVE_STAGE3_STOP_SMOKE=1` and
`CIRNET_NATIVE_STAGE3_STOP_IDLE_BARRIER=1`, the r4 smoke invocation
`tests/integration/native_hardware_stop_cases.py` passed six tests in
174.35 s. Each side qualified all eight attempts. The earlier aligned
diagnostic required 11 attempts for Python and nine for Rust, with four
observer-timing rejections. The smoke receipt SHA-256 is
`4f8bc69684d70e66d9ad03304215cb62d3481c15854f76adcfa67d8cda494d1a`.
The applied harness source SHA-256 is
`c0506faf521e6f4977d11fc3fb24fca0102097f715c5d3b6d525e3b1f19a626d`.
The formal path still runs unpaused with three windows of 100 valid
samples per side and the existing Stage 0 and paired p95/p99 ceilings.

A separate unpaused r4 diagnostic used only
`CIRNET_NATIVE_STAGE3_STOP_SMOKE=1` and ran
`tests/integration/native_hardware_stop_cases.py::test_stage3_natural_stop`.
It took 282.01 s and failed sample qualification (**FAIL**). Python qualified
5 of 35 attempts and Rust qualified all eight. On Python, 19 attempts
were rejected before the four-worker proof. In 18 of those, at least
one child showed zero new request bytes when a reply was observed.
Across those 18 attempts, the median spread between the first and last
Remote Start RPC sends was 0.365 ms and the maximum was 0.991 ms. The
median spread between their returns was 168.743 ms. Eight other
attempts completed a Start RPC before Stop ingress. The observed send
spread narrows the investigation to stages after the Remote send
timestamps. The traces do not separate gRPC ingress, Hardware
dispatch or child scheduling. The short diagnostic did not establish
Stop percentiles. Summary SHA-256
`e58d4618ddd0fe0165e99a42eed94be5da57a272de158b35ee92a7a5a45b3cda`.
Offline attribution SHA-256
`0a0c9315a8eed3ae63d19bc7de53fff5e0f115e12c75f7931563922bf0e7f52f`.

The separate PostgreSQL page experiment lets the existing single
owner-filtered SELECT use its own MVCC snapshot, keeping SQLite and
session, control and write fences as before. A real concurrent guest
claim demonstrated that r4 blocked during the transaction. The experiment
returned the old owner's page until commit and only the new owner's
page afterward, with cursor ownership and the quarantined lease
verified. That test passed in 4.26 s. Four PostgreSQL session/lease
tests passed in 4.32 s and 14 history/feedback tests in 14.62 s. The
experiment wheel SHA-256 is
`15eba833e6397394ff5383da50d825a40c2b392dafe146027f6fbf9046e09d59`.

Both 24-job comparisons passed capture and status verification. They
used the same Rust Hardware, pinned Simulator, 50 principals, four
slots, four warmup clock jobs and the same workload definition
`3c5130be3873d53b4d65d4f1698f9a0ff5e6256999c740b6c4eb4ce0d5cc01dd`.

| Order | Total pytest | Active p95 r4 → trial | History p95 r4 → trial | Workload seconds r4 → trial |
| --- | ---: | ---: | ---: | ---: |
| r4 first | 193.43 s | 100.856 → 37.360 ms | 235.426 → 90.479 ms | 18.363 → 6.500 |
| Trial first | 217.64 s | 103.933 → 87.955 ms | 340.725 → 376.900 ms | 18.801 → 21.953 |

The first pair saved 11.86 s inside the workload window. The reverse
pair added 3.15 s and throughput fell from 1.277 to 1.093 jobs/s.
The swing warrants caution about the wider performance effect. The
cause of that variance is open. The page change remains external.
The deployed-code candidate in the worktree remains r4. Comparison
summary SHA-256 values in run order are
`27d2446000b021a8393a4338c5c169d83d310603118490bf064ae60e54a31224`
and `9c82e1b909f5c25759a70d444940de30f5c0032235712f59f4cae3db19c2bee7`.

The last formal load receipts are still r4 **FAIL**, at 28/29 paired
checks on SQLite and 17/29 on PostgreSQL. Both met 29/29 frozen
checks and matched all 1,200 captures per database. SQLite missed
`clock_create.p95_ms`. PostgreSQL missed p95 and p99 for AND create,
AND poll, active reads and history reads, p99 for clock capture,
clock create and projects, and p95 for stations.

| r4 formal receipt | Total pytest | DB setup | Service start | Client setup | Warmup | Workload | Cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SQLite | 552.57 s | <0.01 s | 179.73 s | 95.19 s | 6.97 s | 243.63 s | 4.33 s |
| PostgreSQL | 570.56 s | 1.49 s | 192.30 s | 106.45 s | 6.41 s | 236.92 s | 4.68 s |

The phase totals come from six retained lane clocks and exclude time
outside the lanes, including artifact verification. The diagnostics
reused installed artifacts and the reference archive and performed
no release rebuilds. A shorter diagnostic invocation has a different
sample count and cannot be compared as a formal gate time saving.

Gate 3 remains **FAIL**. The new full SQLite and PostgreSQL retests
and the three-pair natural Stop gate are **NOT RUN**. HIL remains
**NOT RUN** for the current scaffold. Before the next full invocation, instrument gRPC ingress, Hardware
enqueue and CNP request writes on Python B and correlate them with
child-read counters. For PostgreSQL, split the manager lock hold in
`_transition` into persistence, snapshot projection and event
publication. Use repeatable short-run results to select a candidate
under the existing load, sample counts, and limits.

### Gate 3 timing from gRPC dispatch through persistence

On Windows x64, reused exact Python B from Stage 1 and the r4 Remote,
Rust Hardware, Contracts and C++ Simulator artifacts recorded above.
The Stage 1 manifest SHA-256 is
`2e42cd74dbe59dd02e0afbd22aaa6ce2dd48dd9400b8c4ae83b1b0defee4e011`.
The Stage 3 manifest remains r4. The diagnostics ran sequentially
and used owned external output. They rebuilt no release artifacts.

The Python B diagnostic used the pinned unpaused saturated-v1 workload,
SHA-256 `e48b3d87456a93e3b97f8872fa39ea45099bbf34a49d0e32b888d9b4458a0c2c`.
It reused the installed C++ worker, the original qualification
predicates and peer capture verification. The external probe recorded
timestamps in memory and wrote them at Hardware teardown. Its bounded
diagnostic target was four qualifying waves within 19 attempts.

~~~powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
@'
import sys
sys.path.insert(0, sys.argv[1])
import pytest
raise SystemExit(pytest.main(['-q', '-s', '-p', 'no:cacheprovider',
    '--rootdir', sys.argv[1], '--basetemp', sys.argv[3], sys.argv[2]]))
'@ | & $B -I -B - $remote "$stopTrace/python_b_stop_trace.py::test_python_b_unpaused_stop_path" "$ownedTmp"
~~~

The tracing invocation returned **PASS** in 116.25 s with four qualifying
waves in six attempts. It recorded 24 Starts and five actual Stop
handler entries. One rejected wave had a Start complete before Stop
and one reached a reply before the four-frame proof.

| Start timing | Median | p95 |
| --- | ---: | ---: |
| First to last of four Remote sends | 0.33 ms | 0.49 ms |
| First to last of four Python handler entries | 134.60 ms | 161.79 ms |
| Remote send to handler entry | 14.07 ms | 161.90 ms |
| Handler entry to executor submit | 0.14 ms | 0.18 ms |
| Executor queue | 0.18 ms | 63.78 ms |
| Executor entry to lane exchange | 140.53 ms | 221.81 ms |
| CNP event synthesis | 137.29 ms | 219.35 ms |
| CNP frame serialization | 3.63 ms | 5.78 ms |
| Pipe queue | 6.93 ms | 77.95 ms |
| Pipe write | 4.39 ms | 62.78 ms |

In the incomplete-frame wave, handler entries were 1.27, 66.75,
143.30 and 162.28 ms after the first Remote send. At 221.99 ms one
child had written its entire reply while two children had read zero
bytes. No Stop was issued in that wave.

The table describes six instrumented waves. Handler entry measures
Python dispatch after transport and scheduling. Event synthesis and
other wall spans can include time waiting for the GIL or the scheduler.
The data locate delays but do not separate transport from gRPC
dispatch scheduling or establish event synthesis as the sole cause.

In all four qualifying observations, the last all-alive witness was
4.94–12.73 ms after actual Stop handler entry. The selected exact-PID
exit bound was 5.96–13.61 ms after entry and the safe ACK followed it
by 1.37–2.50 ms. All four parent pipe intervals covered handler entry
and the existing proof still used the worker counters and durable
release. Stage 0 qualifies load at Hardware ingress. The current
formal Stage 3 harness uses the API-side Stop send as its ingress
marker. Before a formal PASS, require an actual correlated Hardware
ingress witness or equivalent causal proof for each accepted sample
on both sides. Keep the existing ACK, reap, lease, quarantine and
stale-result checks.

The external probe, raw trace and summary SHA-256 values are
`6ccd20128e22286de347241fbe9c9f826315dcb1cdc3ccfd5fdf3c492dd615d9`,
`f8969f7a23867e2c1d13b163f1431eefe809117f67d8ea8af0f8a071edfaf114`
and `dff54640a5224d9a8140b4466ca76007e77db0068588ecf22d8e5fc13047628d`.

The PostgreSQL 18.6 diagnostic reused the pinned server executable.
Run its external controller from the Remote worktree.

~~~powershell
& "$pgTrace/launch-transition-pg.ps1"
~~~

The first initdb attempt hit its 180 s sandbox timeout before pytest.
A fresh owned cluster started with the process permissions used
for earlier measurements. It selected 100 maximum connections
and 128 MB shared buffers. Initialization, startup, pytest and
shutdown took 8.18, 0.46, 123.16 and 0.92 s. Pytest reported **PASS**
in 121.60 s. The 21.28 s workload window verified 24 captures
byte-for-byte. The four warmup captures matched too. PostgreSQL stopped
after the run.

Of 373 measured `_transition` calls, 240 took the manager lock
directly and 133 entered with the caller holding it. Exclusive
manager hold inside transitions totaled 16.134 s, with 10.017 s
(62.1%) in nested Repository lock wait. Initial read, persistence
and post-commit snapshot accounted for 3.952, 3.056 and 3.008 s
of that wait.

| Inclusive transition phase | Total | p95 |
| --- | ---: | ---: |
| Initial state read | 5.355 s | 42.099 ms |
| Persistence | 6.163 s | 42.379 ms |
| Capture catalog sync, inside persistence | 0.358 s | 3.336 ms |
| Database commit, inside persistence | 0.715 s | 3.136 ms |
| Post-commit public snapshot read | 4.431 s | 29.353 ms |
| Public projection | 0.025 s | 0.116 ms |
| EventHub publish | 0.039 s | 0.191 ms |

Of 100 history requests, 40 waited for the manager lock. HTTP p95
was 275.783 ms and manager-wait p95 was 176.760 ms. Of 4.933 s
cumulative manager wait, 2.770 s (56.1%) overlapped Repository
waits inside transitions and 0.013 s overlapped EventHub publication.
The probe distinguishes the outer lock owner from the transition's
own phases. This single instrumented simulation run had no
assignment-specific queries or subscriber delivery load.

The PostgreSQL diagnostic launcher SHA-256 is
`3deed55a72c043fe87b0e09f504ce53c93ecd996fb6d6227c1c1daca605a9479`.
The summary SHA-256 is
`f6ef032a774107e34ce3ad6c095e675a80c991bffb3946ae742a61d34b67c1d8`.
The summary records raw trace and probe source digests. Five
focused Stop proof checks passed in 0.71 s. The two owner-and-payload
snapshot checks passed on installed r4 in 1.15 s.

At this r4 checkpoint, Gate 3 remained **FAIL** with SQLite at 28/29
and PostgreSQL at 17/29 paired limits. The next natural Stop
qualification needs actual ingress evidence on both sides. Retain the
same unpaused workload, three windows of 100 valid samples per side,
the fixed and paired ceilings, and all capture and safety criteria.

### Gate 3 Remote lock changes after r4

The Stage 3 r5 Remote trial replaced the PostgreSQL experiment snapshot
read's process-wide lock with a single-row `FOR SHARE` read at
`READ COMMITTED`. Two regressions first reproduced the r4 blocking
behavior. The trial passed 22 real PostgreSQL cases, including a real
guest claim and same-row payload commit and rollback. In the short
24-job-per-side comparison, throughput fell from 3.762 to 3.441 jobs/s
and CPU/job rose 18.4%. Active p95/p99 rose from 36.913/40.573 to
51.873/57.506 ms and history from 98.328/103.292 to 150.233/170.668 ms.
The candidate was rejected. Its source and regression changes were
removed from the worktree. The r4 owner-and-payload snapshot code was
restored byte-for-byte after normalizing checkout line endings. The r5
wheel, test diff and comparison remain in the external evidence.

The rejected r5 wheel SHA-256 is
`02245c8cca5633770d4d4666e2a9c5e7c97f2647a363aa529fab191de80ca35b`.
The comparison and archived test diff SHA-256 values are
`6c0e2429612589bd88acf6d6047ba2cb485ea59225c3237a4a1f5c60c49ca76f`
and `52340d84df168635c43f3a235333af372bd7ea6d9032f7c7857b9f29d8583918`.

The Stage 3 r6 worktree change holds one Repository lock through the
initial state read, save or recovery, and fresh post-commit snapshot in
`ExperimentManager._transition`. The Repository lock is released before
public projection and EventHub publication. The manager lock still
orders the event stream. Transaction boundaries and the claim, session,
capture, lease and quarantine write fences are preserved. The new
concurrent regression failed on r4 and passed on r6. It checks that
another thread can take the Repository lock during both callbacks.
The existing independent-connection owner-transfer fixture still verifies
the fresh post-commit owner and payload. Affected checks passed on SQLite
**78/78** in 24.31 s and on PostgreSQL **18/18** in 14.51 s. The first
SQLite functional attempt stalled at TestClient in the sandbox. The
reported result is the complete retry with the required process permissions.

The short comparisons used the same Rust Hardware and C++ worker on both
sides, separate PostgreSQL schemas and no phase probes. Each side ran
24 measured jobs and four warmup jobs in each order. All captures matched
the pinned hashes. The table expresses each comparison as r4 → r6.

| Order | Jobs/s | CPU s/job | History p95/p99 ms | Active p95/p99 ms | Projects p95/p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| r4 then r6 | 3.499 → 3.873 | 0.279 → 0.252 | 104.141/123.933 → 65.301/121.490 | 35.035/43.449 → 45.243/126.800 | 116.866/128.681 → 88.870/97.541 |
| r6 then r4 | 2.383 → 3.496 | 0.395 → 0.275 | 130.939/144.297 → 78.203/80.633 | 56.125/57.454 → 42.497/47.153 | 81.084/95.020 → 103.427/118.022 |

Throughput and history p95 improved in both orders. Active and project
tails changed direction. Station p99 and AND capture maximum increased
in both orders, with only 12 measured AND captures per side in each run.
The short comparisons are diagnostic and leave the formal sample sizes
and thresholds unchanged.

The r6 Remote wheel SHA-256 is
`a27f22cdffefd6f91d9102b82fa40d2749a939762a6d294a6d3cabcf25746a09`.
The Remote-only manifest SHA-256 is
`f04a0ca11c95ac79527a1dc799b6ed1c7fc219018ca904d6137d029e4c2157c5`.
The installed API inventory and all 77 hashed `RECORD` entries matched.
The forward and reverse comparison SHA-256 values are
`48a3b053d595f5f5a7ffe7474153636688fd1efdc4591d418de7da623e3eaeb0`
and `2647a8519eb963f984e1c8fa1c2c12ff6e77108f032acb99b20e57666a1f91f7`.

The formal smoke and rollback checks **PASS**. The r6 service-load
acceptance is **FAIL**: SQLite passes 25/29 frozen limits, 17/29 paired
limits and 15/29 combined; PostgreSQL passes 29/29 frozen limits and
14/29 paired/combined. Each database completed the unchanged three
paired windows of 200 measured jobs per side; all 1,200 captures per
database matched. The combined r6/QPC manifest SHA-256 is
`60b40c21c5bdaf78b4a7ef6e99d7203680feb461f37ce3743824b3b1aa8303d4`.
The command was the pinned baseline Python running
`-B -m pytest -q -s -p no:cacheprovider --rootdir . --basetemp <owned>/pytest-tmp tests/integration/native_hardware_gate_cases.py`,
with the r6 manifest and candidate Python selected through the owned
PostgreSQL controller. Pytest reports two passed and two failed in
1,683.35 s. Controller phases were preparation/initdb 10.759 s,
service startup 0.662 s, test process 1,685.432 s and cleanup 1.041 s;
the owned PostgreSQL service stopped successfully.

Evidence remains under the allocated `cirnet-aVTc6V` directory:
`native-hardware-services/sqlite-116243b649e4449f98f1cf90c9e702b0/gate-load-summary.json`
(SHA-256 `861b6d66c958cf123c1dd5856ac29bb6c131b7d17d022d4752cf161d598b6b17`),
`native-hardware-services/postgresql-7289655c93384fae9cd881b903f9b015/gate-load-summary.json`
(`4fdb68c5ff06f863c26c230fc018776509ef655f66ac67d07803a5e9784fc405`)
and `gate3-r6-pg-d402d4aa1593438c8845720a7df011f3/controller.json`
(`c2af670d1aeb6cea52199e67a45985f9f53a8201b72bb6a4d69bb69245349dda`).

The coalesced-lock r6 candidate is rejected and its source/test delta
archived before restoring the r4 transition. Short throughput gains
did not predict acceptable API tails. SQLite baseline window duration
varied from 48.92 to 93.34 s, with candidate duration 40.66–86.30 s.
This establishes substantial variation, but does not identify its cause.
The incomplete process-monitor snapshots cannot support a claim about
background CPU load. No test-time saving is claimed from this rerun.

The next r7 experiment changes only the PostgreSQL post-commit
`experiment_snapshot` read. All `get_experiment` control/authorization
reads retain their lock. Broadly unlocking these reads was rejected:
a Stop authorized against an uncommitted old owner could otherwise
mutate the new owner's experiment after claim commits. Required r7
checks cover claim commit/rollback, fresh owner and payload, old-owner
Stop rejection and session revocation before event delivery.
The user-approved four-Start synchronization experiment is separate;
its equivalence and safety must be demonstrated before formal use.
Full natural Stop and HIL remain **NOT RUN**. Gate 3 stays **FAIL/open**,
Gate 4 remains **NOT RUN**, and the default stays unchanged.

### Gate 3 r7 post-commit snapshot

The r7 Remote overlay starts from the r4 transition. Only the
post-commit `Repository.experiment_snapshot` uses a normal PostgreSQL
statement outside the Repository lock. Owner and payload come from
the same committed row. SQLite and every `get_experiment` call use the
original lock. The two concurrency checks reproduced the r4 wait.
R7 passed **23/23** real PostgreSQL cases in 25.63 s and **115/115**
SQLite/API cases in 78.51 s. The new PostgreSQL cases verify snapshots
across an unrelated write, claim and payload commit/rollback, old-owner
Stop rejection without mutation, viewer-session revocation and the
owner committed between transition save and event publication.

The forward short comparison used the same Rust Hardware and C++
worker, isolated PostgreSQL schemas and canonical resource sampling.
Each lane verified 24 measured and four warmup captures against the
pinned hashes. Of 29 metrics, **23 improved** and **25 were within the
descriptive paired envelope**. Throughput rose from 1.227 to 1.353 jobs/s
and CPU/job fell from 0.775 to 0.674 s. Active p95/p99 fell from
142.922/182.615 to 129.050/152.272 ms and history from
307.075/380.140 to 281.798/327.517 ms. Projects and stations also
improved at both tails. AND capture fell from 229.910 to 180.882 ms
and CLOCK capture rose from 127.884 to 131.540 ms. The four outside
the envelope were CLOCK run and poll p95/p99. Each run or capture
group had 12 samples, so both quantiles reduce to the maximum.

The full 29-metric receipt is `gate3-r7-event-pg-receipts/c202f6e5834f4f86aed162a056feb76f/comparison-29-metrics.json`
under the external session. Its SHA-256 is
`d4a68e7caf4a72bcf7cca7e9dfac8cbda035e4cfd018f6a31dfa6dfe6662704f`.
The Remote wheel and candidate manifest SHA-256 values are
`7be54ff8af31dccfae519d29378e11b9ce7d5006294b58ac909309bab1d4bbc8`
and `04a9016d135f4c203b0791ab3b8fca2c6b169636eeb74b836a19aba23c6f37d7`.
The installed inventory and all 77 hashed `RECORD` entries matched.
The r4 window took 19.57 s compared with 6–10 s in earlier short
comparisons. The reverse order did not produce a valid pair. The
strict resource monitor saw two process-inventory changes in the r4
lane. Its error recorded the service parent PIDs without the changed
child identities. Both lanes logged 28 completions including warmups,
and all retained captures matched the reference hashes. The partial
application log summary SHA-256 is
`f5d4b2b2e582e25bd4fba17fe3ee140dd6b0e3f3f5ac01c74b65ddd99d403042`.
It does not replace the missing matched client and resource profile.
Formal r7 load acceptance remains **NOT RUN**.

### Gate 3 artifact setup timing

The Remote adapter passes an explicit or inherited context directly to
the pinned `cirnet-artifact-paths` 1.0.0a1 bridge. Node still verifies
the Git roots, canonical destination, symlinks and session ownership
marker. Checkout context discovery and cleanup use their original paths.
[Adapter source](../../../scripts/artifact_paths.py)

One direct Windows x64 timing pair measured `_owned_directory` after
imports with the same owned directory and six-root inherited context.
Node CLI calls decreased from five to three and elapsed time went from
11.755 s to 9.223 s, a reduction of 2.532 s or 21.5%. The measurement
covers directory validation and session lookup. Full startup and gate
wall-time savings remain to be measured.

The call-count regression failed before the change at five invocations.
All five adapter checks passed across two invocations. The initial run
passed four checks and the Windows sandbox blocked creation of the
junction fixture. The isolated junction rerun passed. Coverage includes
both environment prefixes, explicit and inherited contexts, malformed
context JSON, wrong owners, unowned sessions, foreign Git roots and
junction escapes. [Adapter checks](../../../tests/test_artifact_paths.py)

The pinned Node entrypoint SHA-256 is
`742ef11f9083beaf901d0d4f9a5a777d87aeae71a990597f9640a1b3a9329b5a`.
The external `timing-before.json` and `timing-after.json` receipts have
SHA-256 values `a6d737543ff0fed2f22cc4eb0ce0e36995f29ecfd4ce2a30ebee4cf8be34780f`
and `eecac21c24442fdee64b66e787d76ebf189262c9d6d98ad1763e9d7cb3cbe722`.

### Gate 3 r8 keyed operations and PostgreSQL result

For a new keyed Run or Stop, r8 checks ownership through the locked
Repository before operation lookup. Existing operations still read the
live public projection, including queue position, for replay and
recovery. The two regressions for recording new intent while the manager
lock is held failed on r7 and passed on r8. The candidate passed **130/130**
SQLite/API and **24/24** real PostgreSQL cases, including guest claim
with keyed and keyless Stop. The exact r8-R2 combination passed three
Remote lease, quarantine and disconnect checks and released Interface
browser smoke on both sides.

The r8 Remote wheel SHA-256 is
`0e3280dc41d81e1b00b4ee7a5e35a3646b06b32276181000ee874b43e113bd01`.
The exact r8-R2 manifest SHA-256 is
`ebc49c57c052e0a78c98074af240c78010f787872a4ad32ac23617ada1fc15bd`.
The short PostgreSQL comparison of 24 measured jobs per side was within
26/29 frozen and 26/29 paired envelopes, 23/29 combined, descriptively.
All eight read-route p95/p99 values improved and throughput rose from
2.765 to 3.701 jobs/s. The short receipt SHA-256 is
`2043229644d88fe38001f101a4130fa8a8c416e5dc9142b00d661429ea956b95`.

Formal PostgreSQL service load **FAIL** on the same manifest. All three
pairs completed 200 jobs per side with 1,200 measured captures matching
the pinned digests. The result was **25/29 frozen, 4/29 paired and 4/29
combined**. The four combined checks that passed were peak RSS, AND Run
p95 and p99, and CLOCK Run p95. The frozen misses were AND capture p95
and p99 at 97.082 and 157.097 ms against 92.557 and 153.366 ms, CLOCK
create p99 at 363.643 ms against 353.771 ms, and history p99 at 355.203 ms
against 321.567 ms. Paired history p95/p99 rose from 104.241/118.055 to
295.570/355.203 ms. The pinned pytest run took 789.32 s and the owned
PostgreSQL instance stopped successfully.

| Window | Workload s | Fixed requests | Polls | CPU ms/request | CPU s/job |
| --- | ---: | ---: | ---: | ---: | ---: |
| B1 | 51.100 | 1,000 | 1,798 | 17.211 | 0.2408 |
| C1 | 57.289 | 1,000 | 1,815 | 18.933 | 0.2665 |
| C2 | 104.110 | 1,000 | 2,558 | 25.567 | 0.4548 |
| B2 | 36.093 | 1,000 | 1,489 | 14.263 | 0.1775 |
| B3 | 119.385 | 1,000 | 3,004 | 25.186 | 0.5042 |
| C3 | 51.890 | 1,000 | 1,670 | 18.493 | 0.2469 |

More polls and higher CPU per request both amplified CPU/job in the
slow windows of each variant. B2 to B3 had 1.61 times the requests per
job and 1.77 times the CPU per request. C3 to C2 had corresponding
factors of 1.33 and 1.38. Sampled CPU includes API, Hardware and their
descendants. It includes scheduler work and excludes the separate
PostgreSQL process and other host activity. The profiles lack per-request
timestamps and the application log durations lack a common absolute
clock. When the last of 400 read requests finished in each lane, the
logs showed eight completed captures including four warmups. The history
p95 median from application logs increased from 98.775 to 247.712 ms, so
the read-tail gap was already present in the opening phase. The log
records 71–72 measured transitions between the first and last read
completions in B and 85–95 in C. It cannot distinguish more overlapping
work from a longer read window. The short comparison had 19.67 fixed
requests per job versus 5.00 in the full run.

The formal summary `native-hardware-services/postgresql-cc20821c896941ebb7636809665369ff/gate-load-summary.json`
has SHA-256 `51fa434b570b1c8721d4ce7f6196c0e9e428ae5883e594abf17dab7b204693e6`.
The controller receipt `gate3-r8-formal-pg-86708c85164c418bb8457b02d3baae9a/controller.json`
has SHA-256 `5e6b41d36f6dbb499343a4b97de8cb8a7739f87abfaa697b4f3902c146382baf`.
The exact service harness SHA-256 is
`0a4af0a2daabb8ab3554b59e2fa14e0a403124ae77cf91727c2c1e6fbd182850`.
At that checkpoint Gate 3 was open. Formal r8 SQLite and loaded Stop
were **NOT RUN**.

### Gate 3 approved Start synchronization profile

The user approved `natural-loaded-stop-hardware-rendezvous-v1` for
formal Stop acceptance after reviewing the separate diagnostic.
Select it explicitly with
`CIRNET_NATIVE_STAGE3_STOP_METHOD=natural-loaded-stop-hardware-rendezvous-v1`.
The unset default remains the original Remote rendezvous method.
This is a recorded method change, not a claim that aligned and unaligned
latency distributions are equivalent. Worker execution is never paused.
The additional Hardware handler rendezvous binds four exact experiment
IDs to one QPC release on both Python B and Rust; the Remote ticket
barrier remains. Cancellation, missing/duplicate/foreign participants
and deadlines abort the group before station actions.

The original approval required three alternating paired windows,
100 valid samples per side/window, maximum 403 attempts per window,
and all six frozen/110%-of-B p95/p99 limits. The [current Windows
scope](#gate-3-acceptance-policy-by-host) retains the method, samples,
attempt cap and six absolute ceilings. Full request frames without
reply writes at actual Hardware Stop ingress, worker exit before safe
ACK, durable lease release, quarantine and stale-result rejection remain
required. A shortfall now records **FAIL** and remaining windows
**NOT RUN**, rather than allowing an empty comparison to imply PASS.
The final harness SHA-256 is
`519b2b6231a19d7a513b24c7dd96ce632ffa1ff40b0d5e0f8026914a76dbbd4f`.
The exact Rust R2 binary SHA-256 is
`22d3d0a1c57aad0d2d01d512f3a890149566bc799228559b6943843cba1e85e6`.
It passed 25 lifecycle cases; r8-R2 passed three Remote safety cases.
The receipt/proof suite passed 22 service-free cases.

The unpaused diagnostic qualified B 8/10 and C 8/8 attempts, versus
the previous B 3/35 and C 8/8. All six short comparisons were within
limits, but eight samples do not establish formal tails. Wall time
199.80 versus 180.96 seconds used different valid/warmup counts and
does not establish a speedup. Its summary SHA-256 is
`001033e2476c81f65aae46fdb754f38203d8e91a717c8e299a514499b6aac712`.
At that checkpoint official aligned Stop was **NOT RUN** while service
acceptance failed. See the [completed formal Windows run](#gate-3-formal-windows-loaded-stop).

The r8 PostgreSQL log also records timed checkpoints overlapping the
slow C2 and B3 windows: 2026-11-06 23:56:24–23:57:04 and
2026-11-07 00:01:24–00:02:31 at UTC+07. Window alignment is approximate,
derived from profile file timestamps and recorded cleanup/workload times.
Checkpoint sync was 0.674/0.439 seconds; total 39.770/67.281 seconds
includes paced writing. This correlation does not prove checkpoint
contention caused the slowdown, and C1/C3 also missed read limits.
The next diagnostic adds common timestamps and bounded CPU observation;
no PostgreSQL durability, checkpoint or gate settings have been changed.


## 4. Rust Remote

- [x] **Replace route groups.** Remote keeps the existing topology, auth and orchestration. Port reads and preview first, then `services/auth.py`, `websocket/events.py`, persistence, and finally commands, idempotency and `services/experiments.py`. Compare the exact OpenAPI handoff, HTTP/errors/cookies/CSRF/Origin, WebSocket hello/sequence/resync/close, ownership/control client and disconnect. Shadow only genuinely side-effect-free routes against a data copy. Test session bootstrap and a control WebSocket in isolation because they can change sessions or cancel jobs.
- [x] **Data and control.** Port Remote schemas and migrations to native migrations. Compare real SQLite and PostgreSQL against existing data, CAS revisions, login, ownership and captures. Rehearse `pg_dump`/`pg_restore` with the capture backup and check hashes, keeping idempotency and quarantine. Keep the Hardware control endpoint inaccessible to a shadow scheduler. Revoke the old scheduler's access and verify that it has stopped. Inspect the restored queue before granting the candidate access. Test competing schedulers, a queue with pending commands and loss of connectivity during cutover.
- [x] **Matrix and Gate 4 Windows.** Compare Python Remote → Rust Hardware → C++ with current Interface → Rust Remote → Rust Hardware → C++ by route group. Keep `scripts/export_openapi.py --check` for the Python comparison and compare native OpenAPI with the same handoff and operation table. Retain auth, ownership, operation identity, WebSocket and PostgreSQL assertions through public boundaries or scoped native components. Keep Interface E2E and Playwright Python. Apply the [host-specific policy](#gate-4-acceptance-policy-by-host) to ordinary performance and loaded Stop. Rollback revokes candidate scheduler authority, restores the matching database/capture pair when needed, and verifies authority and quarantine before reconnecting Python. Windows acceptance does not authorize a default or release change.
- [ ] **Linux/Xeon production and applicable HIL.** Run full fixed load and the full loaded-Stop matrix after project stability and target-host readiness, with approved production thresholds and Linux safety validation. Run real HIL before accepting any advertised physical-control capability. Keep production/release acceptance NOT RUN until all applicable requirements pass.

### Gate 4 acceptance policy by host

This user-approved policy supersedes the earlier Stage 4 acceptance scope.
It changes the use of measurements, not historical results, artifacts,
digests or safety requirements. The checkpoints below retain the decisions
and PASS/FAIL/NOT RUN recorded under their original policy.

Windows x64 / Intel Core i5 is the development acceptance host. **Gate 4
Windows** requires functional, compatibility and safety evidence for the
identified Remote, Hardware, Simulator and Contracts combination. Required
coverage includes REST/OpenAPI, Interface, WebSocket and NCAP; real SQLite
and PostgreSQL, old data, explicit migrations and rollback; auth, ownership,
sessions, idempotency and scheduler authority; Run/Stop, disconnect,
hung/dead workers, missing/late ACK, reaping, stale-result rejection, leases
and quarantine. Reuse requires verified artifact or unchanged compiled
component inputs, configuration, fixture and assertion scope; old executable
results remain attributed to that executable. Missing or invalid evidence
leaves the affected requirement FAIL or NOT RUN.

CPU/RAM, throughput, ordinary API/database latency and relative comparisons
with Python on Windows are **diagnostic**, not blockers. The full fixed-load
comparison and synchronized Stop matrix of **three alternating pairs × 100
qualified samples per side**, with the existing 403-attempt ceiling per
window, move to Linux/Xeon acceptance. No full Windows replay is needed to
exceed an old performance threshold. This does not waive a functional or
safety failure observed during any diagnostic run.

All approved safety invariants and deadlines remain mandatory on Windows.
Stop evidence must prove its actual precondition, including workers active
at Hardware ingress where the case claims a running workload, reaping before
safe ACK, and safe disposition before durable lease release. Missing or
uncertain final cleanup ACK required for release must retain authority
restrictions and quarantine; a missing early explicit Stop ACK can still be
followed by independently verified safe cleanup. Late
results must not publish captures or revive old generations. The retained
Stop safety ceilings in milliseconds are HTTP p95/p99
197.55406000000002 / 581.1564, raw ACK
139.20478000000003 / 526.7117900000001, and committed lease release
2534.55686 / 2598.3746800000004. A short sample is not a production percentile
estimate. Keep the underlying per-operation deadlines and fail-closed
behavior; do not reclassify these safety bounds as ordinary latency.

Before production acceptance, require a stable project and an actual
Linux/Xeon target. Pin the baseline and candidate on the **same machine**,
with matching database, dependency versions, workload and measurement
conditions. Record CPU model/cores, RAM, Linux/kernel, filesystem, database
version/durability/settings, build options, artifact/model and harness
digests, warmup, background load, phase timings and process-resource scope.
Before the first acceptance run, approve the workload, sample counts,
method and production performance thresholds. The retained full-load and
three-pair Stop design is the starting plan; any change needs an explicit
decision before measurement. Production performance thresholds are
**TBD before acceptance**, never converted from Windows absolute values.
Revalidate Stop, deadlines, cancellation/reaping, late results, scheduler
authority and lease/quarantine on Linux. Existing Windows-only probe and
process helpers must be ported and validated before they can be used there.

Report **Gate 4 Windows**, **Linux/Xeon performance and full loaded Stop**,
and **HIL** separately. Linux/Xeon and HIL remain NOT RUN until their
requirements are actually exercised. Production/release acceptance waits
for Linux/Xeon and, if physical control is advertised, suitable real HIL.
Unavailable physical capabilities remain unavailable. Windows PASS does not
select a release or change default traffic. Keep Stage 4 changes in the
review worktree; no commit, merge or branch/worktree removal is authorized
by this policy update.

### Stage 4 first read and preview slice

Stage 3 was committed and fast-forward merged locally into both `master`
branches: Hardware `3ad140f24ae5f3f2e6b735b5cff4beec7bffda54` and Remote
`3cc5063df984c73f05d50979a7b50dbc853323a9`. Both named Stage 3 branches
and their E: worktrees were removed after post-merge checks. Commit history
and all selected receipts remain available. The clean detached Hardware
worktree managed by the app remains because archive reports another active
task using it. Its contents were not deleted forcibly.

Stage 4 work continues on `codex/native-remote-stage4`. The first native
Windows debug binary implements seven HTTP operations: health, project list
and detail, and validation/preview for v1 and v2. A real-process comparison
against exact Python r8 and Hardware R2 passed 19 observations per side in
26.89 seconds. It includes pagination, ownership, missing/revoked sessions,
canonical and legacy cookie/CSRF precedence, and real preview. The native
SQLite copy stayed byte-identical and its capture directory stayed empty.
This is functional evidence for these observations, not performance evidence
or full error-input coverage.

| First-slice artifact or receipt | SHA-256 |
| --- | --- |
| Native Windows debug binary | `426073ff0f98fe076f49f555da7d09217fc340c8936906846524767bfb502eb4` |
| HTTP harness | `0146109ea1dfeb5279733fc3494d1f05e388170476f048acd8b82ad008c58c6f` |
| `native-remote-http/7cca71c236be4ba08cd3b813e2785769/comparison.json` | `66307313fec415a2b083c8ae5544889e9efddeadaca3f37adc77a16121433d83` |

The typed SQLite/PostgreSQL read adapter also passed legacy-row and
read-only checks. Actual writes through the read-only connections were
rejected. SQLite uses only a closed consistent copy, with immutable access
and dirty-sidecar rejection; this mode must not shadow a changing live
database. PostgreSQL uses read-only connections and MVCC. Tests use the
Stage 4 DEV-owned session `cirnet-4PiLwh`; earlier Stage 3 evidence remains
in its original session.

Authentication writes, native migrations, WebSocket and command/scheduler
integration are in progress. The other 56 HTTP operations, complete runtime
OpenAPI comparison, full database/cutover/rollback matrix and full Gate 4
are **NOT RUN**. Detailed malformed v2 validation messages beyond the
selected fixtures still need parity evidence. No default traffic or release
manifest has been switched; Linux/Xeon production acceptance remains
**NOT RUN**.


### Stage 4 native data and protocol checkpoint

Stage 4 remains uncommitted on codex/native-remote-stage4, based on Remote
3cc5063df984c73f05d50979a7b50dbc853323a9. This checkpoint records component
and route-group evidence, not Gate 4 acceptance.

Native migration passed 16 disposable scenarios in three tests: fresh and
unversioned SQLite, all seven historical revisions, five atomic refusals,
and PostgreSQL legacy/duplicate-capture cases. Independent Python r8
comparison found all 56 normalized SQLite catalog objects equal and
PostgreSQL schema dumps byte-identical (SHA-256
ba9232944070c88777670be368c47c2c4090987a93fa6bc5aef767bd7e496572).
Both engines retained five legacy tables and 107 original experiment
payload texts per engine, and matched ownership, assignment history,
sealed capture adoption and scheduler projections. The explicit --migrate
CLI passed fresh migration and idempotence; startup does not migrate.

Auth components passed on real SQLite and PostgreSQL, including Python
Argon2 hashes, opaque token rotation, revocation, legacy proofs, guest
ownership transfer, roles and last-admin protection. These service tests
do not establish HTTP callbacks or cancellation of running jobs.
Project components passed independent-pool and distinct-session CAS on
both engines, immutable snapshots, owner isolation, revoked-session
rejection and atomic rollback when a child reaches the revision limit.
The ordinary native library suite passed 26 tests; 10 environment-gated
tests remained ignored in that invocation and are not counted as passes.

Frozen debug candidate
3abbfd9ce1fa1fdd51299347a5bb9942d783e0ad97f8beedbd7fb011f223a3a0
passed the two SQLite REST slices in 57.48 seconds of pytest time
(58.62 seconds with controller overhead): 19/63 operations, with
19 read/preview and 26 document observations per side. The document slice
covers canonical errors, ownership, ETags, CAS and soft deletion. Only
new IDs and server timestamps are normalized; timestamps are separately
bounded and creation times must agree. Project receipt SHA-256:
46aa355e16738b4734046b807d8077b0cde02a2a5c4517f4eb6bdfeb9f198ab9;
read/preview receipt:
cbdf12ea6e8c6ae46a561f75643d398b3ea6c9c0d27f788d5eb38bea6145ce56.
Earlier candidates and receipts remain historical evidence.
Document writes require explicit CIRNET_REMOTE_READ_ONLY=false; the
default remains read-only. Eight HTTP boundary tests passed.

EventHub passed four queue/cleanup tests. A standalone native WebSocket
fixture passed four tests and matched twelve real Python wire outcomes,
including malformed frames, UTF-8, oversized frames, rate limits, rejected
sessions and last-controller cleanup. It is not yet connected to the
application's real experiment manager; loaded disconnect/Stop safety
cannot be inferred from these component results.

A missing physical-mounting check in the first preview implementation
was reproduced and corrected. The pinned Contracts API lacks a public
standalone physical validator. A small compatibility helper invokes the
existing public assignment validator with fixed valid wrapper fields,
without duplicating geometry rules or changing the dependency pin.
Three pinned physical-design cases passed. An additive producer API is
a follow-up to remove this coupling.

Raw evidence remains in DEV session cirnet-4PiLwh: project-http-paired,
native-remote-projects/7e32b73bdd7049aca31ba4e1736ebc7d,
native-remote-http/a0101eb3e898420d9bf5743fb78fda6e,
project-cas-safety, stage4-db-compatibility/migration-audit and
events-websocket. Full OpenAPI/63-operation parity, live scheduler/control
integration, loaded Stop, cutover/restore/competing-scheduler rehearsal
and Interface E2E are **NOT RUN**. Gate 4 is **NOT RUN**. Default traffic,
release selection and outstanding Linux/Xeon production acceptance are
unchanged.

### Stage 4 assignment, compiler and control checkpoint

This checkpoint supersedes the earlier implementation inventory, while retaining
its artifacts and observations. Full Gate 4 remains **NOT RUN**.

The frozen Windows debug candidate
`029b8c20574de6bb8bf64c604f187437df821302c332f0a21d2b9097f4c13d06`
passed 43 observations for 16 assignment HTTP operations and 26 observations
for 12 document mutation operations against exact Python r8. The paired suites
took 53.04 seconds (54.20 seconds including the controller). Their receipts are
`native-remote-assignments/1838e04358ef4afe898f6fbbcb5ca39c/comparison.json`
(SHA-256 `2dec73fdf46e032c431c7034fa0a0250d443933bed24c9f00c5f1a31eeefaa1b`)
and `native-remote-projects/8ca55f282c3f4f51a4a16aa569dfda4d/comparison.json`
(SHA-256 `c936b51398df84cb5c89d12a427d1ca8a4372b3a27e662b297cd1e76362c2cd5`).
These isolated SQLite HTTP checks cover instructor/student/admin visibility,
frozen publication versus subsequent drafts, revision conflicts, and integral
float revisions. The prior seven read/preview operations retain their separate
candidate receipts; this is not a combined final-artifact acceptance claim.

Numeric regression tests first reproduced project-write failures on SQLite
and PostgreSQL and 14 compiler mismatches in a 22-case Python oracle. Bounded
integer conversion now accepts valid integral float tokens without rounding
large integer tokens. Generator limit comparisons retain exact integer versus
binary64 ordering; strict integer-only endpoint allocation remains strict.
Project and assignment numeric regressions each passed both engines. Compiler
checks passed the original 173-case corpus and the separate 22-case numeric
corpus. The changed compiler still needs the combined final-source replay.

Topology edge checks preserve pin order and search limits. Ten fresh Python
processes produced two orders for the same `shorted_nets` diagnostics (6/4);
only this proven unordered diagnostic list is compared as a multiset. This does
not relax event, signal, timestamp, capture or safety ordering. Evidence:
`topology-ordering/91f7cbee658e4e6f949ed6ff709b169e/ordering-summary.json`,
SHA-256 `4c864d66af4ee3587ad9067436a9d0a58a3b46a3d99daf1b79be5a9f89d0a2b0`.

The isolated native auth HTTP fixture passed seven operations with 25
observations and five CORS preflight cases (36.63 seconds). Receipt:
`native-remote-auth-http/cbe10a191da84e76bc0068e2877e3ec6/comparison.json`,
SHA-256 `66643ff73b3c95da60583c4ebc883da48a1df833976a05c189fbc4e948dbe009`.
Its revocation receiver proves durable session revocation before callback;
it is not evidence for a production scheduler cancellation callback.

Native runtime repository tests passed on disposable SQLite and PostgreSQL:
lease reservation and generation CAS, transactional creation and operation
identity, history/privacy queries, and capture retirement. A real R2/C++ manager
component test passed Create → Run → byte-exact NCAP → safe lease release,
and restart recovery retained quarantine when physical capability was absent.
The extended check passed capture read, retirement, repeated delete and file
removal. Startup performs actual lease cleanup before reporting a blocked
capture destination.

Independent review identified mandatory unresolved control checks: public Stop
must fence the current session and owner in the same transaction as its state
mutation; a lifetime scheduler authority must prevent a second native process
from recovering a live process's leases; shutdown must drain admitted detached
mutations before releasing that authority. Fixes and deterministic regressions
are in progress. HTTP/WebSocket integration, PostgreSQL control races, competing
scheduler and loss-of-authority tests, full route/OpenAPI matrix, loaded Stop,
backup/restore/cutover/rollback, and browser E2E remain **NOT RUN**.

All raw receipts are retained under the owned DEV session `cirnet-4PiLwh`.
Stage 3 history and evidence are unchanged. No Stage 4 commit, default traffic,
release selection or Linux/Xeon production acceptance is claimed.

### Stage 4 optimized integration checkpoint

This checkpoint supersedes the implementation status above without replacing
the older artifacts or results. Stage 4 remains uncommitted. Full Gate 4 is
**NOT RUN**; this is an integration checkpoint, not release acceptance.

The first optimized Windows candidate is
`7bae8cdc0af803d7487c8b25df5b2333e5f43f242e87ea4d22cc837335ddce79`,
built with Rust 1.90.0 using `cargo build --release --locked --offline`
in 134 seconds. Its build receipt is
`native-remote-release/766f95f64741496e8f7f1cbabc2fa4ba/candidate.json`,
SHA-256 `43bcba4d0079b167ef699f68a912f7bf1621190efc3bd786eed695f4098ac4ce`.
The separately recorded runtime-source digest is
`1d1de69a6a7878de5b9810ccee71ae32b020a003f6de21a6ec7df9422f803787`.
Subsequent safety review requires a new candidate; these results remain
attributed to the exact bytes above.

Actual HTTP comparisons passed all six route groups on each of SQLite and
PostgreSQL: auth, projects, assignments, experiments, reads/preview and stations.
The operation union contains all 63 canonical IDs. Each lane used exact Python
r8, the same Rust Hardware R2, Contracts and C++ worker, with separate disposable
databases and processes. NCAP payload bytes and digital event times matched;
only separately checked resource identities and server wall clocks were
normalized. Station HTTP checks include both owners and an empty queue; live
queue ownership has separate component evidence. The two runners passed
6 tests each in 191.88 and 202.77 seconds, with six deliberate backend
deselections each. This parallel functional run is not a performance benchmark.
The aggregate receipt is `final-http-sqlite/paired-summary.json`,
SHA-256 `a25b63b426025b6bbf6baa428ec0a91eabd88800b6f903b6fab8054ae0256ec0`.

Python `scripts/export_openapi.py --check` and the exact optimized binary's
OpenAPI export passed against Contracts SHA-256
`dc39c874386eba2b58f8b5c631cbee0d63ded86cf287aea63f54e4a237ff8f08`.
The binary registers the same 63 unique operations. Its migration CLI applied
seven migrations, repeated with zero changes, and refused implicit database
creation. Final-source Rust checks passed 43 ordinary library tests; 23 ignored
fixture tests are not counted as passes. Separate selected checks passed the
CLI, original 173 compiler cases, 22 numeric cases, three topology cases and
54 HTTP body cases. Raw commands and results are in `final-native-checks`
and `final-openapi`.

The earlier Stop ownership, scheduler authority and detached shutdown findings
now have focused passing proofs. Public Stop fences current owner/session in
its mutation transaction. A lifetime native authority excludes an independent
SQLite or PostgreSQL scheduler and fails closed after PostgreSQL connection
loss. Active cleanup retains the lease until the final safe ACK; failed durable
settlement fences the station. Startup fault tests cover both committed
reservation and an actual R2/C++ Start, with no READY, no stale capture and
cleanup before exit.

The optimized candidate passed the real PostgreSQL cutover and rollback
rehearsal in 65.30 seconds. It verifies both database/capture backup pairs,
retirement of the old control endpoint, a competing process rejected before
READY, pending operation identities, a queue held by physical quarantine,
loss of the exact advisory-lock connection, retained lease during the held
final ACK, rejection of late Start capture, and restoration before reconnecting
exact Python r8. Receipt:
`stage4-postgres-cutover/721efd638fe747caa082505aac2647fd/cutover-summary.json`,
SHA-256 `1c97f5bac090c0ebf064bed606a3c8b1cd0bb4794e03348477f56874aded9c8e`.
This uses unavailable physical capability and makes no energized HIL claim.

Review after this run identified two additional checks: monitor panic must
still stop admission and drain cleanup, and loss of scheduler authority during
local post-capture work must prevent publication. Deterministic regressions and
repairs are in progress. Additional PostgreSQL claim/ownership interleavings,
browser workflows, actual child crash/timeout propagation, the formal fixed-load
comparison and loaded Stop remain pending. Browser-driver failures observed
against Python alone are retained as harness failures, not native API results.

The Stop adapter retains the approved synchronized Start workload, three paired
windows of 100 qualified samples per side, the 403-attempt ceiling and all six
absolute safety bounds. Gate 4 also retains its paired 110% comparisons; the
Gate 3 Windows performance exception is not silently extended to Gate 4.
Short diagnostics cannot satisfy the formal gate. Linux/Xeon production
performance and physical HIL are **NOT RUN**. Default traffic, release pins,
Stage 3 commits and acceptance evidence remain unchanged. All raw evidence is
under the owned DEV session `cirnet-4PiLwh`.

### Stage 4 safety and compatibility checkpoint: 20cbd915

This checkpoint records the later Windows candidate without rewriting the
previous candidates or their results. Stage 4 remains uncommitted on
`codex/native-remote-stage4`, based on Remote
`3cc5063df984c73f05d50979a7b50dbc853323a9`. Its executable SHA-256 is
`20cbd915780e6bc14a0fef95d1c2359ab2771ffe37b745d77639f4457411ff36`.
The release build took 39.82 seconds. The receipt is
`native-remote-release-successor/c1c9ab11b1194fc9b79942cbbf0b8e49/candidate.json`,
SHA-256 `872f14b968a9cf78e64a109a9927553a0203418077ecca27df6af51cfba8c35f`.
All raw paths below are relative to the owned DEV session `cirnet-4PiLwh`.

Three safety findings now have failing reproductions followed by passing
regressions. Monitor termination or panic closes admission and still drains
cleanup; diagnostic output failure cannot interrupt that cleanup. Loss of the
PostgreSQL scheduler connection after capture sealing prevents ordinary
publication and removes the unreferenced capture. Recovery now atomically
clears the old private reservation generation with terminal state, lease
disposition and audit. A stale worker cannot reuse the successor's newer
revision to overwrite recovery or release quarantine. Both release and
quarantine successor interleavings passed. This does not claim that a
connection health check and every subsequent pooled database commit are one
atomic operation. Normal manager tests passed 6/6 in 4.43 seconds and the
SQLite/PostgreSQL runtime record checks passed 2/2 in 0.81 seconds.

The inherited `db/` ignore rule hid ten authored Rust database source files
from the earlier Git-filtered inventories. The narrow source exceptions now
include those files. Historical inventories remain preserved and are explicitly
incomplete; their exact executable results have not been relabelled. The
current filesystem inventory, Cargo dependency inputs and generated protocol
hashes were verified before and after a locked, offline release command.
Cargo reported the executable as fresh in 0.67 seconds, with no compilation
and the same executable hash. This is an input/identity audit, not a second
clean build. Receipt:
`native-remote-release-dependency-audit/655607b9c0df463087ed9d52b8eccf88/verification.json`,
SHA-256 `d7c72263a46ac6ebfd241b610c5c82fde8d93042528ad27a85c52cb41e9b1953`.
The complete dependency inventory SHA-256 is
`7a7d4c47fed1bc197c659872388b469a7ac01f66aaf9aefea71161a221d371e5`.

| Exact candidate check | Result and scope |
| --- | --- |
| Paired HTTP compatibility | PASS: 12 backend/route groups, all 63 operations; SQLite 161.63 s and PostgreSQL 172.85 s. Six deliberate other-backend deselections per runner are not passes. |
| Browser and Interface integration | PASS: two selected Interface tests on each runtime plus Playwright Python WebSocket reconnect/resync, exact 124-byte NCAP, waveform rendering, physical preview and recovery from a lost Create response. This is not the complete Stage 5 browser matrix. |
| PostgreSQL transaction and control races | PASS in 23.69 s: real blocking/commit interleavings, ownership, revision limits, publication/admission, old-session Stop and WebSocket revocation. Unsafe recovery audit rollback followed by quarantine also passed. |
| PostgreSQL cutover and rollback | PASS in 54.12 s: matching database/capture backups, competing scheduler exclusion, pending queue, lost authority, held safe ACK, late-result rejection and verified Python reconnection. |
| Real C++ worker faults | PASS in 52.00 s: crash and ten-second timeout on both runtimes; child exit before safe ACK, no fault capture or residual lease, then replacement-worker capture parity. |
| Formal fixed load and loaded Stop | NOT RUN for this candidate. Short Stop comparisons below do not satisfy the formal gate. |
| Linux/Xeon performance, Linux signal execution and physical HIL | NOT RUN. No production or release PASS is claimed. |

The exact HTTP aggregate is `successor-http-sqlite/paired-summary.json`,
SHA-256 `ac9e7a32c98745e3165abda288121b0cbd5867622f3f76098b71f12100cd9c82`.
Browser evidence is
`stage4-interface-e2e/paired-d07fdf7109f84ad6ae32d7771e1aa51a/comparison.json`,
SHA-256 `7caa567e646ccf9be88c330dd5267bddd591d5a2a40db633ff14248815ac50da`.
The candidate took 140.86 seconds; the 136.46-second Python calibration was
reused after checking its receipts, source, configuration and raw capture
digests. Reuse avoided one measured 136.46-second baseline replay; it does not
establish an application speedup. The PostgreSQL race and rollback receipts are
`stage4-postgres-races/32db37b4196649828428de6f6a6c7f32/observations.json`
(SHA-256 `f6664656b31788e3af8829d5fc53dfb4a2e644b3f053f6db7eafa2482d9b1cc0`),
`stage4-postgres-cutover/694141961f524dc088a29603a4d01f33/cutover-summary.json`
(SHA-256 `9d918ad480d03ce359d259d9d61393259c1b2f1feaa811d21c5e0837e5d79fa6`),
and `stage4-worker-faults/6d36cc0329194a4887a72087e72b46d2/worker-fault-summary.json`
(SHA-256 `220c0b12dcab96997dc866c60af68c3f8ae33e8e41bedd44661cd20143fb8847`).
The exact older internal pause between commit and event lookup and the direct
repository reservation interleaving have not been replayed literally.
Public protocol equivalents are recorded separately, not presented as those
same internal tests.

Historical `7bae8cdc` also passed five old-database restore/index checks in
156.80 seconds: revisions 0001/0003/0004/0005, 107 retained payloads, schema
catalog parity and the active-index query with 2,000 terminal rows. Receipt
`old-restore-controller/summary.json`, SHA-256
`da313495a5b7e7a29c3b7f634d31d0c73b5e9653ffee4a9dbb181abd83182fc9`.
Migration and query source identities justify retaining that scoped evidence;
it is not a new run on `20cbd915`. The earlier optimized CLI/OpenAPI result
also remains attributed to its original executable.

The first short Stop attempt failed its Run precondition with HTTP 429.
The common driver started its one-second owner cooldown before all four Run
responses, allowing a later admission to remain rate-limited. The Stage 4
adapter now waits until 1.010 seconds after the last successful Run response,
before the next Create. Both lanes use this rule; no Run limit or retry policy
changed. The three deterministic pacing regressions passed. The adapter SHA-256
is `51c5f933d80068ffe999a4788c8f3dfa0ea5b294ec47953ea760aad60f67d361`.
The measured Stop interval, synchronized Start, workload, four running workers,
pipe condition, worker reaping before ACK, capture, lease and quarantine checks
are unchanged.

The corrected diagnostic took 104.63 seconds: B and D each qualified 8/8
attempts, with zero rejected samples and eight warmups. Its six absolute safety
comparisons passed; paired performance passed 4/6. HTTP p95/p99 were
77.5356 ms for B and 100.8298 ms for D, above the paired 85.28916 ms limit.
With eight samples these two tail values are the maximum, not a formal tail
estimate. Raw ACK was 56.7754/38.2203 ms and durable lease release
124.9691/88.7484 ms. Added untimed pacing was 4.1486/4.1984 seconds.
The worst native HTTP response followed ACK at 38.22 ms and lease commit at
83.42 ms, returning at 100.83 ms. Existing evidence localizes the extra time
after ACK but does not distinguish database acquisition, SQL, commit and
response work. Receipt:
`native-remote-loaded-stop/91e03eabd3bc486ba27ec2ae501f0924/stop-summary.json`,
SHA-256 `c967c9e09daa1bf8973731dd0627fd41c3fe7658f3789d7bfbc312d3bfb40f22`.

Full Gate 4 remains unaccepted. Preserve three paired windows of 100 qualified
Stop samples per side, the 403-attempt ceiling, all six absolute safety bounds
and paired comparisons. Fixed-load acceptance still requires both SQLite and
PostgreSQL, three paired windows of 200 jobs per side, unchanged workload and
frozen/paired thresholds. Database timings must be identified separately from
HTTP timings. The Gate 3 Windows policy is not a waiver for these Stage 4
requirements. Default traffic, immutable release selection, Stage 3 commits and
all historical evidence remain unchanged.


### Stage 4 Windows compatibility and safety checkpoint · 717402ba

The Windows x64/MSVC candidate is `native-remote-sqlite-writer-release/f07bbb29b41d4a7c9120379547450752/cirnet-remote.exe`
(SHA-256 `717402ba92e7a0f1864fe4f5f70dbc8f6a55c154e9880a35d470dd2e07f51203`).
Rust 1.90.0 built it in 39.10 seconds with
`cargo +1.90.0 build --release --locked --offline --bin cirnet-remote`.
The candidate manifest SHA-256 is `6bd5a0d8d71303f62f149c492f541f04221dc30bc82688fcab12b925cd0a9a51`.
The full compiled-input audit `complete-after.json` has SHA-256
`f7adace56acb5817bfba4da3b16e9207455062def19aefa4c2efe5cf90cda9f4`. The historical `20cbd915`
and `d4d0fa3e` results retain their original candidate and verdict.

| Check | Evidence and scope |
| --- | --- |
| HTTP and CLI compatibility | **PASS**. All 63 operations across 12 paired HTTP groups. SQLite took 237.36 s and PostgreSQL 250.94 s, with six deliberate other-backend deselections per lane. The CLI export matches registered operations. Migrations applied seven revisions, then zero on repeat. A missing database was refused. |
| Interface | **PASS** in 152.75 s. Playwright Python verified WebSocket reconnect/resync, the rendered waveform and exact 124-byte NCAP, physical simulation preview and Stop after a committed Create. Two selected Interface source cases also passed. The unchanged 136.46 s Python reference was reused after verifying the workflow, tools, fixture and raw evidence hashes. The full Stage 5 browser matrix remains pending. |
| SQLite and scheduler component checks | **PASS**. Two optimized-source writer checks cover clone concurrency, cancellation and rollback. Six manager checks with the pinned Hardware cover control, quarantine and cleanup. These ran in Rust test executables. |
| PostgreSQL transaction and recovery checks | **PASS**. Two public-boundary cases in 75.38 s cover real transaction blocking, publication/admission, claim and revocation, WebSocket handoff, and recovery rollback followed by quarantine and generation revocation. |
| PostgreSQL cutover and real worker faults | **PASS**. Backup pairs, exclusive scheduler, lost authority, held safe ACK, late capture fencing and verified Python reconnection passed. Real C++ child crash and timeout tests verified reaping before safe ACK, lease settlement and replacement capture parity. |
| Short loaded Stop | **PASS for observed functional/safety conditions; timing DIAGNOSTIC**, in 103.54 s with the opt-in phase probe enabled. B and D each qualified 8/8 with eight warmups and no rejection. Qualification checked four live in-flight workers, reaping before safe ACK and durable cleanup. All six absolute and all six paired comparisons passed in this sample. HTTP p95/p99 were 67.0223 ms for B and 43.8271 ms for D, both equal to their side’s maximum at this sample size. |
| Windows functional, compatibility and safety scope | **PASS**. The approved Windows scope keeps mandatory safety deadlines and invariants. Ordinary performance and paired timing are diagnostic. |
| Linux/Xeon performance and full loaded Stop | **NOT RUN**. Await project stability, actual target host, approved production method/thresholds and platform-native safety validation. |
| HIL | **NOT RUN**. Physical capabilities remain unavailable; real HIL becomes mandatory when physical control is advertised. |

**Gate 4 Windows: PASS** for the functional, compatibility and safety
scope defined above, on the identified Windows candidate. **Linux/Xeon
performance and full loaded Stop: NOT RUN. HIL: NOT RUN. Production/release:
NOT RUN**, pending the applicable platform and physical-hardware gates.
No default, release selection, commit, merge or branch/worktree deletion is
part of this policy update.

The exact combination is Remote `717402ba…`, Rust Hardware R2 SHA-256
`22d3d0a1c57aad0d2d01d512f3a890149566bc799228559b6943843cba1e85e6`,
C++ worker SHA-256
`c0b114fd5c7fd6e65df991c303090cd3e87946bde4d11b65377e9b5797383adf`,
Contracts native 0.1.2 at `e640f80b1199779659d3db7817fee16d13cc24c1`,
and Interface source `66845b01f9b02b70e6ec28ececd163133cdcdfa2`.
The Python r8 comparison manifest is pinned in each receipt. Current
Windows acceptance reuses valid scoped evidence and the verified Python
browser reference; it does not convert old performance FAIL results to PASS.
No total time-saving estimate is claimed for avoiding unrun full Windows
gates. The reused browser calibration itself had a measured 136.46-second
duration; that is not an application-performance improvement.

The owned DEV session `cirnet-4PiLwh` contains the receipts below. Keep the
formal workload at three paired 200-job windows per side for each database and
three paired 100-qualified-sample Stop windows per side, with the 403-attempt
cap. Windows diagnostics and historical comparisons retain their recorded
scope. The worktree remains available for review before Git integration or a
default or release change.

| Receipt | Session-relative path | SHA-256 |
| --- | --- | --- |
| HTTP | `native-remote-writer-http/sqlite-85cbfefdf1634643b6e22329c2159655/paired-summary.json` | `5aeac02e40c8ce368e2e90ec48e4f4571b7c89af230d1e3e15fe72a31721d224` |
| CLI | `stage4-717-cli/fa738d3f78ea4003bd4a350d2895f4ae/cli-summary.json` | `d6a52004606ab8197be52b5a266232a69bd7ecf30e07b9e22f74cd2f4c968e6f` |
| Interface | `stage4-interface-e2e/paired-e1b9932fcb4e4fe0b2549f9942e03417/comparison.json` | `ef7f7d2f047acf972c291d8d2e520621e971b6c904b078c084bc6e43a1e22b7f` |
| Reused Python browser reference | `stage4-interface-e2e/paired-35ff5d0d77134e5b93e419417fa99f16/reference-calibration.json` | `456868143719bbe7a2218cb34cd30351caf1ce1d7ce4269fcbdb52245e535e0b` |
| Writer component | `stage4-sqlite-writer-gate/3aca07aa008b4c929fc9d851600ade6b/cargo.log` | `134a30e4754fda5e50fe04ebe7bbafd8069dbed5eedf9e5181ea4b6a93955e48` |
| Manager component | `stage4-sqlite-writer-gate-safety/fad56c3c234f471b9f238b57e39aa1f8/tests.log` | `04fb67b7330ccc43759dedf2f2a5ff833b56ca79b2451ef5d9448cd8a8d35d30` |
| PostgreSQL public races | `stage4-postgres-races/dd38c8bba6ef404381e29dd295e75812/observations.json` | `248528c8642941abddba59f7ef8e0b47ea11c85e24e4aa749de55a0feb4687f1` |
| PostgreSQL unsafe recovery | `stage4-postgres-races/unsafe-recovery-6843987f616b49b2965d8bf7e3ceb077/observations.json` | `01772fef03d94176b2f672e31d9c0019711ff7d453f5f4cf31bba3107218b2ef` |
| PostgreSQL cutover and rollback | `stage4-postgres-cutover/6e26c077430a483c94a835e222ca71c5/cutover-summary.json` | `c07283642f8a6faa2a7e72d1da9ec83fecd55521d8fc4917d65e69f232e56301` |
| C++ worker faults | `stage4-worker-faults/81e17b60192747249448db86b353575d/worker-fault-summary.json` | `b848f2e26544a599737dfe48280c1cfd207c53372a8c17288946b6ad651fce7e` |
| Short loaded Stop | `native-remote-loaded-stop/7cf28ed9776c46b58bd8f3fd3e2578c8/stop-summary.json` | `7a401513a5ab7b475eaab107699557bb5d533702d0e137d723aba831cfe9d98c` |

Exact-candidate old-data acceptance now covers revisions 0001, 0003, 0004
and 0005 plus the active-index query. The first replay took 126.75 s:
four cases passed; rank 0004 stopped during fixture preparation because
the source database reported one backend after seeding, before any dump
or native migration. The original receipt remains FAIL
(`old-restore-controller/717-a12e0a60907943f198458e74362a7003/summary.json`,
SHA-256 `c4500aa8392ad9354f5ffa2b828288479f5e5e569c84d9bedb0c18c7c0da9aa9`).
Only rank 0004 was retried, passing in 29.35 s with the same immutable binary,
harness, seed and assertions. A versioned readiness observer retained the
zero-backend guard; it saw zero immediately and did not wait. The initial
backend type is unknown, not proven to be autovacuum. Retry receipt:
`old-restore-controller/717-r4-retry-f2ad472e7f754c8b80ed457999f666d4/rank4-summary.json`,
SHA-256 `1c6505f3bfa423cbcf69458024cd81329f5435be3e7b3ce2e99139a92c0636ea`.
This closes the exact-artifact gap left by the incomplete older inventory;
the historical `7bae8cdc` evidence remains unchanged.

Current compiled-source checks passed 47 default library tests and ten
selected SQLite/PostgreSQL write, runtime, authority, writer and Stop-claim
cases. The first PostgreSQL claim fixture used a disallowed name and failed
before the tested mutation; its original receipt is retained. The same
test executable passed on a fresh correctly named fixture. Receipts:
`stage4-717-db-regressions/6ae81db335a84e41a618cd6d34d99401/component-regressions.json`
(SHA-256 `f225089fd9c2e80db855d1437121c526e2a4cf81997a15b5687352c51eb325b7`)
and `stage4-717-db-regressions/b3a854439c364bc7859943135d009003/postgres-stop-claim-retry.json`
(SHA-256 `68b9f8848d1cde10e77da4d6c6365ba0bde299e39cce10ea4e2ff888d4d41259`).
A final audit matched all 87 Rust source files, 55 compiled source inputs,
two generated protocol inputs and three build manifests to the frozen build
(`stage4-policy-docs/current-compiled-input-audit.json`,
SHA-256 `ebfec38409c1d0b2b55dc60ad217a40bd128e6c1881d19070c39295920618280`).

Historical monitor-panic/cleanup wrapper tests and the post-seal
PostgreSQL authority/successor regressions are reused only for their
verified unchanged helper/source and PostgreSQL branch. They are not
reported as fresh executions of the immutable CLI. Current 717 cutover,
unsafe recovery, worker faults and held-ACK checks cover the integrated
paths. The reuse/coverage audit is
`old-restore-controller/717-a12e0a60907943f198458e74362a7003/windows-coverage-audit.md`,
SHA-256 `2b4ffa09bb74149088a57413e4e56bfc38fe624d43f871e81e11a7a0125cc9fe`.
The exact older Python-internal pause/lookup interleavings remain not
literally rerun; their public protocol equivalents are attributed
separately. The full Stage 5 browser matrix, Linux signal behavior,
Linux/Xeon full load and Stop, and real HIL remain NOT RUN.

Two missing clock-driven triggers were then checked directly against
the immutable 717 CLI. A quiet control WebSocket closed from the server
with code 4401 after a future session timestamp elapsed, without explicit
revocation, Stop, client close or a changed auth revision. Cleanup retained
`SESSION_EXPIRED`. A separate live-session case expired the actual lease
and retained `TIMEOUT`. Both verified lease retention after early ACK and
while the final cleanup ACK was held, release only after that ACK, and no
capture from the late Start response. The relay held a successful Start
response after Hardware had completed; these are expiry/control proofs,
not evidence of a worker still executing. The separate 16-sample Stop
evidence establishes that running-worker condition.

The first session test reached teardown after its functional assertions
but failed a disposable database DROP statement timeout; that 70.08-second
two-case run remains one FAIL/one PASS. The lease PASS is retained under
harness `74de6ae93d24abb0aece8a095bba0c934a1e16ea3c508b0bbe05fe88a72548f0`.
Only session was rerun, passing in 30.58 s, after the harness preserved its
owned database and recorded functional observations before teardown. Its
receive-only loop allows server events before close. The final harness
is `1fd1613e90bfa2a1aab2fb221fefc2b7f50a9f21aaefe83ef6a983a8f36bd8a4`;
the lease exercise and product deadlines did not change.
Receipts are `stage4-clock-expiry/session-cf553de8ad614ca98165963ef8e9e0de/expiry-summary.json`
(SHA-256 `67fef4569f07b9ef04e94ad5d54365e409f4d1eac2603cff67c0576a3756681f`)
and `stage4-clock-expiry/lease-b157b5485b3549de899556006493f229/expiry-summary.json`
(SHA-256 `d28184bef17926b839d355ae2c937f51a0b50234794815b1677d4210dbdd0409`).
No product source or executable changed for this policy update.
After all checks, the session's PostgreSQL server was stopped with zero
external clients; data, dumps and evidence were preserved. Cleanup receipt:
`stage4-policy-docs/postgres-closeout.json`,
SHA-256 `4216c7c6690a44a42c35ea71c54282fc5d0cdf96779c6fc213d3327fbbbadd24`.

### SQLite diagnosis and current Windows evidence

The current candidate adds a SQLite-only writer permit before checking out a
pooled connection. Cloned repositories share the permit; reads bypass it and
PostgreSQL is unchanged. The permit is held through commit/rollback. SQLite's
`BEGIN IMMEDIATE`, durable commits and driver locking still fence independent
pools. Queue and connection checkout share the existing 30-second acquisition
budget, followed by the unchanged driver busy timeout. Individual contended
requests can wait at the permit where they previously reached a busy database
connection sooner; no lease is released because a wait or commit failed.

The earlier instrumented candidate `d4d0fa3e…` identified
pool checkout plus BEGIN as the largest measured post-ACK span; this does
not exclude RPC or decoding cost in other phases. A separate controlled
SQLite test split these phases: checkout medians were about 0.05–0.06 ms
while competing BEGIN calls waited 45.36–92.62 ms under 10/25/50 ms held
writers. The failing read-capacity reproduction then passed after the permit
change, as did cancellation/drop/rollback and independent-pool fencing.
Two writer tests passed in 0.14 s; six manager safety cases passed in 1.64 s.
These are causal component and short diagnostic results, not production
performance acceptance.

On exact `717402ba…`, with the opt-in phase probe enabled, the
eight-sample-per-side Stop diagnostic took
103.54 s, with 16/16 qualified attempts and zero rejects. Each sample proved
four real C++ workers active at Hardware ingress, pipe progress without a
reply, target reaping before safe ACK, durable release after cleanup ACK,
three byte-verified peer captures and no capture for the stopped target.
All six retained absolute safety comparisons passed. HTTP/raw ACK/lease
observed maxima were B 67.0223/52.4368/106.3526 ms and D
43.8271/29.3413/76.9102 ms. The six relative comparisons also passed but are
diagnostic under the current policy. With eight samples, the reported
p95/p99 are the maximum; no formal tail estimate is claimed.
Native checkout-plus-BEGIN median fell from 25.229 ms in the prior short
diagnostic to 2.5583 ms; different short windows cannot establish production
tail performance. Receipt `native-remote-loaded-stop/7cf28ed9776c46b58bd8f3fd3e2578c8/stop-summary.json`
has SHA-256 `7a401513a5ab7b475eaab107699557bb5d533702d0e137d723aba831cfe9d98c`;
its `phase-summary.json` has SHA-256
`ce06b34ecf3952d40e5d4362e86527bf78394ab24cec323e0638df3625cf079c`.
The short method retains the approved synchronized Start and unchanged
pacing/workload; moving the full sample matrix to Linux is a policy decision,
not a claim that 16 samples replace its statistical evidence.

No full Windows load or 600-sample Stop acceptance run was started when
the policy changed. The already-running short SQLite comparison finished
normally in 101.44 s: one test passed, PostgreSQL was intentionally skipped.
Its receipt remains **DIAGNOSTIC**, with no formal threshold decisions:
`native-remote-load/sqlite-diagnostic-01953cf81ac34f908ac19e07abfae22f/load-summary.json`,
SHA-256 `b77f7ba3aee72228aae6387a0d261f365994bc629dacfe7947d1f73b1d054408`.
Each side ran eight measured jobs; B/D CPU per job was 0.7734375/0.234375 s,
peak RSS 257708032/134193152 bytes and throughput 1.38175/3.97858 jobs/s.
All recorded API, worker and console-host PIDs were absent after teardown.
Closeout receipt:
`stage4-policy-closeout/bb0520bdb9024eb6a2428fab27ecee7f/diagnostic-closeout.json`,
SHA-256 `dea388bf2af5c409eddf3fd81f6bfd3689f676c85df88d30c3f93459130526b5`.

Earlier load setup failures are retained. The inventory helper initially
counted Windows console hosts as workers, then incorrectly required four
resident workers. The unchanged workload configures four slots and runs four
warmup jobs, but Rust Hardware creates workers lazily. The corrected inventory
accepts one to four exact workers and only verified system console hosts;
the original stable-PID resource monitor still applies. It does not relax
the four-active-worker requirement of loaded Stop. Six service-free helper
checks passed; the successful short profile followed. Windows uses
`journal_mode=DELETE` and `synchronous=FULL` in this Stage 4 comparison, distinct from Stage 3 PERSIST;
Stage 0 did not record the journal PRAGMA. No Linux equivalence is inferred.

Separate SQLite/PostgreSQL repository timing diagnostics are retained under
`native-remote-db-component`. They used three alternating pairs of 200
operations after ten warmups against identical 2010-row fixtures on the
earlier instrumented source. They compare complete repository operations.
The separate BEGIN timings use different boundaries because Python begins
lazily and Rust begins explicitly. SQLite client library
versions differ (3.50.4 and 3.46.0); PostgreSQL uses the same owned server.
Their results are not relabelled as measurements of `717402ba…`.


## 5. Accept the exact release artifacts

- [ ] **Replace product entrypoints.** Add a native manifest and checker in Remote. Update `run-cirnet.bat` and `scripts/launcher/` to call binaries. Update `deployment/` for systemd, Nginx, migration, admin and maintenance, as well as release workflows and bootstrap. Replace `scripts/build_release.py` in the Interface product build, retaining Node/Vue. Contracts uses the Rust generator. The new manifest records commit, version, SHA-256, platform/ABI and advertised capabilities. Keep the immutable 0.1.4 manifest, old packages, v1 installer and a separate Python environment for rollback. Check missing packages, wrong digests or targets, path traversal, provenance and reproducible packaging.
- [ ] **Smoke test real processes.** Build the product and generate the SDK in a clean lane without Python. Move the exact hashed artifacts to another clean runtime image for installation, startup, Doctor and operation. Record the manifest digest in both lanes and inspect the process tree, entrypoints and dependencies. Interface/static server, Remote, Hardware and Simulator run as separate processes. Smoke test login, Run → NCAP → display, preview, WebSocket reconnect and Stop under load. Record PIDs, readiness, cleanup and single-scheduler enforcement. Run Python test clients on the orchestration host outside the image.
- [ ] **Release gate.** Run full browser E2E with Playwright Python, preserving existing WebGL, Web Locks and image matrix cases until equivalent coverage is shown. Run PostgreSQL backup and restore, package/SDK/compatibility, security, performance and load, and both RTL testbenches with the pinned toolchain. Security covers auth/CSRF/Origin, revocation, frame bounds, RPC loopback, absent-driver declarations and dependency checks. The FPGA currently advertises only a scaffold. Record HIL NOT RUN for the scaffold and check that physical capabilities remain unavailable. When physical execution is advertised, HIL on suitable equipment becomes a required gate. Rehearse actual rollback to 0.1.4 and the most recent gated combination if different, using the matching backup pair and checking station state, quarantine and interrupted commands. Each advertised platform has an independent gate. Select the new manifest only after all required gates pass.

## Report template for each stage

- Repositories and files changed, commit and harness, artifacts and digests, configuration, environment and commands.
- Combination matrix and PASS/FAIL/NOT RUN for each gate. Report simulation, RTL and HIL on separate rows.
- Sample counts, p50/p95/p99, throughput, CPU/job, RSS and Stop to safe state before and after. Record absolute values, variability and decision thresholds.
- Open failures, conditions for switching defaults, rollback artifacts and backups, and rehearsal outcome.
