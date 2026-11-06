# CIRNET migration plan for C++ and Rust

[Tiếng Việt](../../vi/architecture/native-migration.md) · [Original plan dated 2026-11-05](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) · [Stage 0 record](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

**Gate 0 PASS on the selected 0.1.4 reference. Gate 1 PASS on Windows x64 with r7. Gate 2 PASS on the r2 Contracts matrix.** The published 0.1.4 profile is the rollback reference. Stages 3–5 are `NOT RUN`.

> **For implementation agents.** Use superpowers:subagent-driven-development or superpowers:executing-plans. Complete each gate and record its evidence before beginning the next stage.

**Goal.** Preserve compatibility with the released system, then migrate to Interface Vue/TypeScript → Remote Rust → Hardware Rust → Simulator C++.

**Architecture.** Interface keeps REST and WebSocket on the same origin. Remote owns orchestration, data and leases. Hardware owns local RPC, station control and the Simulator process. Contracts supplies schemas, SDKs and canonical data. During stages 1–2, preview continues through the Remote adapter. From stage 3, preview may go through Hardware after that stage's combination passes its gate.

**Tools.** Use C++20 and CMake for the worker, Rust and the Cargo lock for binaries and generators, Node for the TypeScript SDK, and pytest and Playwright Python for acceptance. Lock the compiler, linker, target and dependencies in the candidate manifest before measuring. Choose release versions of the C++ and Rust tools in their corresponding stages.

## Rules for every stage

- Follow the order **0 → 1 → 2 → 3 → 4 → 5**. Each required gate records its command, artifact combination, result and evidence. A required FAIL or NOT RUN blocks both switching the default and starting the next stage.
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
- [ ] **Matrix and Gate 3.** Compare B with current Interface → Python Remote → Rust Hardware → C++ Simulator, using the legacy wheel in Remote and the crate in Hardware. Retain `test_server.py`, `test_virtual_execution.py`, `test_simulation_workers.py`, `test_rpc_lifecycle.py`, `test_ncap_rpc.py` and `test_physical_station.py` as references. Port assertions tied to Python internals into pytest against a separate RPC binary. Test Start/Stop/reset, lease expiry, disconnect, hung or dead workers, late replies, concurrent Stop with a full queue, and quarantine when ACK is missing. Run Remote integration tests. Compare Stop p95/p99, RSS/CPU, RPC throughput and NCAP throughput. Keep energization precondition checks in PR gates. Run both pinned RTL testbenches and HIL matching advertised capabilities. Report unavailable equipment separately. Switch the default only after the new combination passes. Roll back using the lease and quarantine procedure and restore Python Hardware with a compatible worker.

## 4. Rust Remote

- [ ] **Replace route groups.** Remote keeps the existing topology, auth and orchestration. Port reads and preview first, then `services/auth.py`, `websocket/events.py`, persistence, and finally commands, idempotency and `services/experiments.py`. Compare the exact OpenAPI handoff, HTTP/errors/cookies/CSRF/Origin, WebSocket hello/sequence/resync/close, ownership/control client and disconnect. Shadow only genuinely side-effect-free routes against a data copy. Test session bootstrap and a control WebSocket in isolation because they can change sessions or cancel jobs.
- [ ] **Data and control.** Port Remote schemas and migrations to native migrations. Compare real SQLite and PostgreSQL against existing data, CAS revisions, login, ownership and captures. Rehearse `pg_dump`/`pg_restore` with the capture backup and check hashes, keeping idempotency and quarantine. Keep the Hardware control endpoint inaccessible to a shadow scheduler. Revoke the old scheduler's access and verify that it has stopped. Inspect the restored queue before granting the candidate access. Test competing schedulers, a queue with pending commands and loss of connectivity during cutover.
- [ ] **Matrix and Gate 4.** Compare Python Remote → Rust Hardware → C++ against current Interface → Rust Remote → Rust Hardware → C++ by route group. Keep `scripts/export_openapi.py --check` for the Python comparison. Export or serve OpenAPI from the Rust binary and compare with the same handoff and operation table. Retain auth, ownership, operation identity and WebSocket fixtures and `services/api/tests/postgres_cases.py`. Port assertions tied to internals to pytest using REST, WebSocket, the binary and Rust migrations on real test databases. Keep the existing Interface E2E and add Playwright Python. Compare API and database p95/p99, CPU/RSS, throughput and loaded Stop. Switch default traffic after all routes and the rollback rehearsal pass. Rollback revokes the candidate's scheduler access, restores the matching database and capture pair when needed, and verifies authority and quarantine before reconnecting the old backend.

## 5. Accept the exact release artifacts

- [ ] **Replace product entrypoints.** Add a native manifest and checker in Remote. Update `run-cirnet.bat` and `scripts/launcher/` to call binaries. Update `deployment/` for systemd, Nginx, migration, admin and maintenance, as well as release workflows and bootstrap. Replace `scripts/build_release.py` in the Interface product build, retaining Node/Vue. Contracts uses the Rust generator. The new manifest records commit, version, SHA-256, platform/ABI and advertised capabilities. Keep the immutable 0.1.4 manifest, old packages, v1 installer and a separate Python environment for rollback. Check missing packages, wrong digests or targets, path traversal, provenance and reproducible packaging.
- [ ] **Smoke test real processes.** Build the product and generate the SDK in a clean lane without Python. Move the exact hashed artifacts to another clean runtime image for installation, startup, Doctor and operation. Record the manifest digest in both lanes and inspect the process tree, entrypoints and dependencies. Interface/static server, Remote, Hardware and Simulator run as separate processes. Smoke test login, Run → NCAP → display, preview, WebSocket reconnect and Stop under load. Record PIDs, readiness, cleanup and single-scheduler enforcement. Run Python test clients on the orchestration host outside the image.
- [ ] **Release gate.** Run full browser E2E with Playwright Python, preserving existing WebGL, Web Locks and image matrix cases until equivalent coverage is shown. Run PostgreSQL backup and restore, package/SDK/compatibility, security, performance and load, and both RTL testbenches with the pinned toolchain. Security covers auth/CSRF/Origin, revocation, frame bounds, RPC loopback, absent-driver declarations and dependency checks. The FPGA currently advertises only a scaffold. Record HIL NOT RUN for the scaffold and check that physical capabilities remain unavailable. When physical execution is advertised, HIL on suitable equipment becomes a required gate. Rehearse actual rollback to 0.1.4 and the most recent gated combination if different, using the matching backup pair and checking station state, quarantine and interrupted commands. Each advertised platform has an independent gate. Select the new manifest only after all required gates pass.

## Report template for each stage

- Repositories and files changed, commit and harness, artifacts and digests, configuration, environment and commands.
- Combination matrix and PASS/FAIL/NOT RUN for each gate. Report simulation, RTL and HIL on separate rows.
- Sample counts, p50/p95/p99, throughput, CPU/job, RSS and Stop to safe state before and after. Record absolute values, variability and decision thresholds.
- Open failures, conditions for switching defaults, rollback artifacts and backups, and rehearsal outcome.
