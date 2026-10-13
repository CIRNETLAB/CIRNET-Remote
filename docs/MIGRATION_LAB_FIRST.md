# Lab-First R0–R7 migration ledger

## Post-R7 architecture hardening H0–H6

Approved plan: [archived Post-R7 prompt](archive/PROMPT_CODEX_net-Circuit-Remote_Post-R7_Architecture_Hardening.md), exact SHA256 `D1C5608E508E9F1BB313136A08158C349D0A54A5994E33E3AEE2C7D191984CA0`, copied from the user document. Baseline `f5df5ac`, clean branch `refactor`, existing linked worktree. Execute one commit per phase; no merge or push. Authority remains canonical Lab-First v3.1.

Pre-flight: context PASS; Python 184 PASS / 1 SKIP; frontend 225 PASS; build PASS. Icarus/vvp unavailable locally, static HDL compilation available. Known warnings: Starlette/httpx, jsonschema RefResolver deprecations, frontend bundle size. Native/loopback checks passed outside the restricted sandbox.

Shared interfaces: H0 evidence/bindings/results feed H1 resolver and H5 display; H2 capture metadata/store feeds grading, UI and deployment; H3 worker/slot configuration feeds H4 capabilities/control; H4 capabilities feed compiler, RPC and UI. H6 repairs historical prompt provenance using Git evidence.

Ruling: Direct phase gates use Windows commands and a durable ledger because helper scripts expect Task-N briefs; cost if wrong: translate evidence, no product behavior change.
Ruling: Keep Lab schema 1.0 on this unpublished branch; cost if wrong: bump/migrate before external release.
Ruling: Keep legacy `node_id` as deprecated fixed-only binding; cost if wrong: migrate saved assignments explicitly.
Ruling: Missing pin evidence stays unknown and never supplies guessed roles; cost if wrong: legacy scans cannot resolve arbitrary placement until evidence exists.

| Phase | Evidence / status |
| --- | --- |
| H0 | Pin/endpoints/resolution/rich-result contracts; Python RED 13 failures, semantic RED 10 failures after pin schema acceptance, two additional rich-field failures; browser RED 3 failures. GREEN: Python 209 PASS / 1 SKIP, frontend 228 PASS, build/context/generated check PASS. Driver malformed scans enter FAULT and safe fallback before drive. |
| H1 | From H0 `0619141`: deterministic component/pin/net resolver, physical compiler consumes resolved student nodes, topology Counter/incidence diagnostics. RED: 10 failures (missing resolver); GREEN: Python 221 PASS / 1 SKIP, context/generated checks PASS. Independent review added RED 3 failures: routable aliases on the same observed net, complete bipartite infrastructure allocation, and incremental repeated-component incidence pruning. GREEN: 17 targeted / 182 affected / 239 full Python PASS, 1 Icarus SKIP (includes pending H2 work). Frontend unchanged by H1. Required endpoint uncertainty blocks executability only; fixed endpoints allow safe opaque/ambiguous circuits. |
| H2 | From H1 `99b4566`: metadata-only SQL/events; atomic filesystem CaptureStore, owner-scoped binary GET/DELETE, bounded lossless NCAP digital codec, functional loader, active-only browser cache/cancellation. RED: 11 missing data-plane cases, 2 restart cleanup cases, 11 metadata/integrity cases; frontend contract/cancellation/timestamp races RED→GREEN. GREEN: 25 targeted Python, 250 full PASS / 1 Icarus SKIP (one new H3 control test deselected, new H3 worker file excluded while its RED phase runs); frontend 244 PASS, production build/context/generated checks PASS. |
| H3 | Pending: execution capacity and process workers. |
| H4 | Pending: authoritative instrument capabilities/control. |
| H5 | Pending: resolved diagnostics and measured grading in UI. |
| H6 | Pending: final architecture/provenance/review matrix. |

## Historical R0–R7 ledger

Ruling H2: Keep captures until the owner explicitly deletes the payload; no automatic time expiry in V1. `NETCIRCUIT_CAPTURE_DIR` defaults to ignored `.runtime/captures`, separate from SQL. GET/DELETE `/api/captures/{capture_id}/payload` use server-session ownership; deletion is allowed only after terminal cleanup and leaves historical counts/signals/duration with `available=false`, null reference/hash and zero bytes. Cost if wrong: introduce an explicit retention policy and owner-facing expiry before operating at scale.

Ruling H2: NCAP v1 uses `NCAP` + uint8 version + little-endian uint32 JSON-header byte count, then UTF-8 digital header (`encoding`, `signals`, `sample_count`, `duration_ns`) and 11-byte events (uint16 channel, uint64 time, uint8 0/1/2=X). Limits are 100k events / 4096 channels / 64KiB header; event/duration integers stay JS-safe. Epoch `timestamp_ns` is a decimal string for exact browser transport. Analog INT16/UINT16/FLOAT32 metadata is extensible, unavailable until a real payload implementation exists. Cost if wrong: version the codec for future analog/streaming support.

Ruling H2: Restart stops/releases or quarantines live hardware leases before migrating legacy inline captures. Malformed old evidence becomes explicit NO_RESPONSE; storage I/O failure aborts startup after safe cleanup and preserves valid old SQL data for retry. Cost if wrong: repair storage permissions then restart; no large legacy capture reaches lifecycle events.

Ruling H1: Limit deterministic matching to supported digital identities or explicit instructor profiles, with 32 components / 64 mappings / 4096 search steps; budget exhaustion remains AMBIGUOUS — avoids unbounded graph-isomorphism and guessed evidence — cost if wrong: expand supported profiles/bounds after measured performance.
Ruling H1: Build/validate the pure infrastructure plan to establish executability before committing ExecutionDecision, then apply it only after permission — preserves independent safety/resource policy — cost if wrong: separate an equivalent resource admission pass from final compilation.

Plan: docs/PROMPT_CODEX_net-Circuit-Remote_Lab-First_Refactor_R0-R7.md.
Authority: ARCHITECTURE.md, cleaned Lab-First v3.1; v3 proposal/audit are provenance.

## Pre-flight — 2026-10-13

- Isolated worktree E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor; branch refactor; clean user tree.
- Start HEAD 2ab69c4; merge-base main a02d8e5b4623c25731b427528c51dda3886eada6.
- Context PASS. Python original baseline: 95 PASS / 2 FAIL (stale deployment path and SVG CRLF byte mismatch). Re-ran original tests with temporary baseline copies, then restored R0 changes.
- Frontend baseline: 213/213 PASS; build PASS, 147 modules, 906.26 kB JS. Known non-blocking Vite chunk >500 kB warning.
- Default Python/old .venv lacked pytest. Created ignored .audit-runtime Python 3.12 with test dependencies. Sandbox blocks HTTP localhost, Vite realpath/full Python collection; approved verification outside sandbox.
- Icarus not found in PATH; no Quartus/hardware evidence.
- R0 guardrails observed RED: six expected failures before canonical docs/archive implementation.

## Phase status

| Phase | Status | Commit | Tests | Notes |
|---|---|---|---|---|
| R0 | DONE | 66dbe36 | Context PASS; 10 guardrails; 98 Python; 213 frontend; build PASS | 6 archives; Mini-PC→mini-pc; LF icons |
| R1 | DONE | 8a6b387 | 18 new RED→GREEN; 36 contracts/boundaries; 116 Python; 213 frontend; build PASS | Lab schemas 1.0; CircuitGraph unchanged |
| R2 | DONE | 877f5e7 | 4 RED→GREEN; 50 targeted; 120 Python; 213 frontend; build PASS | RPC 2.0; generated-at-build; loopback only |
| R3 | DONE | 0f09dcf | Physical/virtual/RPC RED→GREEN; 27 hardware; 132 Python; 213 frontend; build PASS | Safety/freshness/ownership/driver ACK enforced |
| R4 | DONE | 44578bf | 13 initial RED + restart/generator RED→GREEN; 86 targeted; 149 Python; 213 frontend; build PASS | SQLAlchemy persistence/FIFO/lease/session/events; packages install PASS |
| R5 | DONE | 66ab8e8 | Engine/worker/capture/RPC RED→GREEN; 169 Python; 213 frontend; build PASS | Real REST→RPC→process AND capture/function PASS; analog unavailable |
| R6 | DONE | 24de394 | Parsers/UI/review fixes RED→GREEN; 180 Python; 225 frontend; build PASS | Real browser capture; independent review 42 Python/12 frontend PASS |
| R7 | DONE | resolve subject refactor(r7) in Git | 7 FPGA PASS/1 Icarus skip; slang RTL/bench compile PASS; 184 Python/1 skip; 225 frontend; build PASS | Scaffold only; independent final review 49 PASS/1 skip |

Phase SHAs are recorded in the next phase commit. Final phase uses its exact Git subject (self-SHA cannot be embedded in its own commit); final report records resolved HEAD without an extra implementation commit.

## Interface pre-flight

| Producer → consumer | Shared contract | Finding |
|---|---|---|
| R1 → R2/R3/R4/R6 | assignment/topology/results/capabilities/plan | snake_case, versions; separate physical graph |
| R2 → R3/R4 | safety RPC/errors | replace direct physical raw-graph Run |
| R3 → R4/R5 | HardwareStation | virtual may omit electrical scan; physical cannot |
| R4/R5 → R6 | lifecycle/results/captures | validated parser/events; no fake waveforms |
| R2/R3 → R7 | protocol/control/safety | abstract scaffold until hardware evidence |

## Rulings and blockers

Ruling: This committed migration log is the Windows execution ledger.
Finding: Skill shell helpers assume task-block brief format; user plan is R0–R7 sections.
Decision: Execute user gates directly; retain ignored verification logs.
Reason: User phase/commit discipline governs; ledger survives compaction.
Cost if wrong: Less bookkeeping automation, independently checked by Git/gates.

Ruling: Canonical icon LF bytes; unchanged artwork and manifest checks.
Finding: Git blob byte counts equal manifest; checkout CRLF adds bytes to all 22 SVGs.
Decision: Scoped eol=lf attributes and CRLF→LF checkout normalization only.
Reason: Local baseline reproduces mismatch; fix byte drift at source.
Cost if wrong: Icon-only line-ending policy, no visual change.

Ruling: Electrical values/capabilities require evidence.
Finding: No schematic/pinout/ADC/DAC/SDRAM/protection driver.
Decision: TBD_BY_HARDWARE_DESIGN, truthful unavailable scaffold/interfaces.
Reason: Explicit prompt requirement.
Cost if wrong: Hardware bring-up awaits exact inputs.

No merge/push to main; preserve user changes.

Ruling: R7 control behavior is abstract; software protocol and binary board ABI are separate.
Finding: Original top only blinked reset/clock; no schematic, transport IC, pins or measured limits exist.
Decision: Guarded scan/prepare/route/power/arm/start FSM, protected-drive/clock permits, asynchronous fault/watchdog latch and fail-closed sequence errors. Transport-independent logical 1.0-scaffold envelope; register map 1.0-reserved; Serial/USB-SPI adapters remain unavailable; future instrument RTL asserts no capabilities/data/output/SDRAM requests.
Reason: Approved R7 control-boundary scope, with no invented electrical design or internal student wiring.
Cost if wrong: Actual decoder/driver, synchronization/reset release, synthesis/timing, protection and all pin/part/measurement inputs still required.

Ruling: Compile locally with slang; Icarus behavior is explicitly unverified locally.
Finding: Icarus/vvp absent from PATH and checked install locations; compiler installation through PyPI provides pyslang12.0.0 for parsing/type-checking/elaboration only.
Decision: Compile both tops + testbench locally; keep one truthful Icarus skip. FPGA CI installs Icarus and runs syntax/behavior tests. Review identified a STATUS/scan_done pulse collision; process completion independently of STATUS, with testbench assertion.
Reason: No claim of behavioral simulation or electrical/synthesis proof from static compilation.
Cost if wrong: Run Icarus testbench and target Quartus checks in the intended environment; local pass covers compiler/contracts only.

Ruling: R6 publishes one canonical response/capture contract and separates requested from observed signals.
Finding: Wire results require nested validation; Pinia proxies cannot be structured-cloned; previous capture ports could leak into a new draft.
Decision: Generate TS/schema snapshot from Lab 1.0; validate HTTP/events identically; monotonic revisions; serialize immutable Run input; separate captureSignals configuration from observed channels. Physical Run sends assignment, never editor graph.
Reason: Actual UI tests and browser runs; preserve editor/history and honest capture.
Cost if wrong: Regenerate snapshot with --check; unsupported trigger/analog remain explicit.

Ruling: Repair substantiated R3–R5 dependencies before committing R6.
Finding: Independent review reproduced stale physical RPC Start ownership, restart queue inactivity/creation-order FIFO, cancellation masking UNSAFE, queue-position updates with unchanged revision, silent clock truncation and ignored trigger configuration.
Decision: Atomic physical operation/ownership lock; virtual target/generation check; persisted private admission sequence and automatic dispatch; preserve hardware faults during Stop; publish revised queue positions; fail clock budget/tiny-frequency overflow honestly; reject unimplemented trigger acquisition. Unknown Generator waveform never falls back silently.
Reason: All reproduced RED→GREEN, full 180 Python/225 frontend PASS; independent recheck 42 Python/12 frontend PASS, no remaining actionable R0–R6 finding.
Cost if wrong: Single scheduler still required; legacy persisted records without admission metadata fall back to creation order, because past Run order cannot be reconstructed. No electrical/analog support is inferred.

Ruling: Virtual observations use 0/1/X, software nanosecond timing and bounded process workers.
Finding: Floating input and primitive-only fake running/capture would misrepresent execution.
Decision: Real deterministic event engine, model delays, default 1 ms window/100k event budget/four probes; preserve X and held signal values. Add optional Assignment LabEndpoint.design_port for virtual bindings while retaining physical node_id.
Reason: Truthful digital execution through shared lifecycle; these are software models, not electrical ratings.
Cost if wrong: Additional models/analog/real device timing remain explicit future support.

Ruling: Normalize the empty clock message at the RPC schema boundary and refresh runtime safety results.
Finding: Real REST→RPC test reproduced empty clock converted to zero fields; runtime UNSAFE retained a stale SAFE result. Failed codegen could corrupt existing bindings.
Decision: Preserve empty-clock contract semantics, update safety/decision on runtime faults, and stage codegen with per-file atomic replacement.
Reason: Integration evidence; no schema/guardrail weakening.
Cost if wrong: Rebuild bindings; wire defaults remain documented and tested.

Ruling: Generate shared wire bindings under contracts/generated for R4 gateway consumers.
Finding: R2 output lived under the Hardware Service implementation package.
Decision: Keep proto/codegen policy; move default output to shared contracts, imported by both processes as wire types only.
Reason: API depends on RPC abstraction, not station implementations.
Cost if wrong: Re-run codegen/build; old generated files remain ignored.

Ruling: One API scheduler process V1; PostgreSQL target, SQLite automated tests.
Finding: No production database/target deployment is provided.
Decision: SQLAlchemy persists assignments/experiments/sessions/FIFO order/leases; validate PostgreSQL production URL, include psycopg. Quarantine unacknowledged cleanup; recover persisted leases on restart.
Reason: V1 boundaries without broker/cluster or fabricated deployment evidence.
Cost if wrong: Multi-process scheduling/live PostgreSQL validation need follow-up.

Ruling: Server-issued anonymous sessions establish ownership before login/RBAC.
Finding: Full auth/OAuth is outside R4 scope.
Decision: HTTP-only cookie, server lookup/expiry, owner-scoped APIs/events/disconnect cleanup; no client-supplied owner ID.
Reason: Real isolation/rate limiting without inventing authenticated roles.
Cost if wrong: Login/roles/production access policy remain deployment work.

Ruling: Replace legacy tests requiring direct physical Run success with mandatory safety lifecycle invariants.
Finding: Old driver test explicitly bypassed scan/safety/plan/routing/power-up.
Decision: Test guarded driver invocation, invalid sequences, unavailable/fault/freshness/acknowledgement and real loopback RPC.
Reason: Existing test contradicted binding Lab-First safety requirements.
Cost if wrong: Legacy physical v1 callers must migrate; v2 explicitly replaces them.
