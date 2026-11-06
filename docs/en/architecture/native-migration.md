# CIRNET migration plan for C++ and Rust

[Tiếng Việt](../../vi/architecture/native-migration.md) · [Original plan dated 2026-11-05](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) · [Stage 0 record](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md)

**Gate 0 PASS on the selected 0.1.4 reference. Gate 1 remains open.** Six external load windows, two integrated phase runs, three loaded Stop runs and both database/capture restorations passed. The local C++ 74HC08 slice passed Run, capture and preview. Stages 2–5 are `NOT RUN`.

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

- [ ] **Digital slice.** In Simulator, add CMake and an independent C++ worker. Start with 74HC08 AND from the corpus and check the event sequence through `cirnet_sim/backends.py`. Extend it according to `engine.py`, `nets.py`, `logic.py`, `dispatch.py` and published model behavior. Keep preview and the supported static DC fixtures for supply, resistor, LED and powered 74HC08. Analog, SPICE and mixed execution remain unavailable. Compare timestamps, simultaneous event ordering, 0/1/X, NCAP bytes and errors. Run Simulator tests, pytest against the binary directly, and ASan/UBSan on supported targets.
- [ ] **Packaging and supervision.** Use local IPC with bounded frames, a version handshake and request/generation IDs. The Simulator artifact exports the binary and a private protocol description. Hardware's `station/virtual.py` Run adapter and Remote's preview adapter use the same core with separate budgets and pools. Add host deadlines, queue/CPU/RAM limits, cancellation, process reaping and fencing of late results. Check timeout, invalid frames, hung or dead workers, Stop/reset and running again. Preserve REST, RPC 2.0 and NCAP.
- [ ] **Matrix and Gate 1.** A = current Interface / Python Remote / Python Hardware / Python Simulator. B = the same combination with the C++ worker enabled for Run and preview, keeping Contracts Python 0.1.2. Run the fixtures, `tests/integration/test_virtual_lab_execution.py`, `test_capture_rpc_data_plane.py`, `test_simulation_backend_selection.py` and `services/api/tests/test_physical_preview.py` on artifacts. Compare with Stage 0 and choose B only after parity and measurable improvement. Roll back to A after cancellation, reaping and generation fencing. Interrupted jobs never replay automatically.

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

## 2. Rust Contracts

- [ ] **Keep canonical sources.** Contracts retains JSON Schema and the manifest, `device-library/` and catalog projections, `contracts/hardware/v2/rpc_v2.proto`, `contracts/capture/layout.json` and `ncap.schema.json`. Port `validation.py`, semantic validators, `capture_codec.py` and generators in `contracts/codegen/`. `contracts/api/openapi.json` is the approved handoff from the Remote exporter. Generate Rust crates and types, the `@cirnet/contracts` SDK and Python bindings for pytest, and retain the old Python wheel for transition consumers. Run the Rust runtime and SDK generation on a machine without Python.
- [ ] **Matrix and Gate 2.** Run B with the current Python wheel and npm artifact. Repeat with the SDK from the Rust generator on Interface, keeping the legacy wheel installed for Remote and Hardware. Run the same corpus through legacy Python, the Rust binary or bindings, and the packed npm tarball. Preserve descriptor field numbers, both service names, absent/default distinctions, errors, 0/1/X, order and canonical NCAP1/NCAP2 bytes. Check JSON, timing and gaps, and NCAP2 INT16/UINT16/FLOAT32 encodings. Run legacy generator checks, `scripts/check_public_compatibility.py`, SDK runtime and type checks, and two clean builds with the same commit and toolchain to compare digests. Report generation time, package size and validation and codec throughput. Change the default generator only after parity and reproducibility pass. Roll back to the verified old crate, SDK and wheel set, keeping prior artifacts.

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
