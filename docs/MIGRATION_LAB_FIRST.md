# Lab-First R0–R7 migration ledger

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
| R6 | DONE | resolve subject refactor(r6) in Git | Parsers/UI/review fixes RED→GREEN; 180 Python; 225 frontend; build PASS | Real browser capture; independent review 42 Python/12 frontend PASS |
| R7 | PENDING | — | — | FPGA scaffold |

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
