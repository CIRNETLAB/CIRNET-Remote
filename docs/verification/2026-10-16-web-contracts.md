# Web & Contracts W0–W8 execution report

This is an execution ledger, not a replacement architecture. Authority: `docs/ARCHITECTURE.md`, Lab-First v3.1. Specification: the supplied 755-line `PROMPT_CODEX_Hoan_Thien_Web_Contracts_netCircuit.md`, read in full.

## W0 baseline — 2026-10-16

Existing linked worktree, branch `refactor`, HEAD `8100039988272c2fa2b5972a00a603261e80064e`; clean before work. No repository AGENTS.md/CLAUDE.md found. Read canonical architecture, context, circuit spec, safety, migration ledger, roadmap, schemas and relevant consumers/tests; proposals are provenance, not authority.

| Command | Fresh result |
| --- | --- |
| `.audit-runtime/Scripts/python.exe scripts/check_context.py` | PASS |
| `.audit-runtime/Scripts/python.exe scripts/sync_lab_contracts.py --check` | PASS |
| `.audit-runtime/Scripts/python.exe scripts/sync_editor_catalog.py --check` | PASS: 76 editor types / 55 physical parts |
| `.audit-runtime/Scripts/python.exe scripts/sync_breadboard_topologies.py --check` | PASS |
| `.audit-runtime/Scripts/python.exe scripts/generate_hardware_rpc.py --output .build/w0-baseline-rpc` | PASS |
| `.audit-runtime/Scripts/python.exe -m pytest -q` | 450 PASS / 1 SKIP, 41.19 s |
| `npm.cmd test` in `apps/web` | 659 PASS / 0 FAIL / 0 SKIP, typecheck PASS |
| `npm.cmd run build` in `apps/web` | PASS, 220 modules |

Skip: `tests/fpga/test_lab_first_control.py::test_iverilog_safety_behavior_when_available`, no Icarus/vvp. Existing warnings: Starlette/httpx deprecation and Vite large chunk. These are not new implementation evidence.

Environment: Python 3.12.14 in `.audit-runtime`, Node 24.20.0/npm 12.2.0. No PostgreSQL executables or browser cache; Docker daemon unavailable (missing `dockerDesktopLinuxEngine` named pipe). Dependencies can be fetched; missing tools will be installed where permitted or recorded as BLOCKED.

## Re-audit A01–A23

All findings remain applicable, with the qualifications below. Existing implementations listed in specification section 2 are preserved.

| IDs | Current evidence and disposition |
| --- | --- |
| A01–A03 | `sync_lab_contracts.py` only handles Lab; graph/Pydantic duplicate shapes, mini validator, caller-controlled generic parser. W1. |
| A04 | Known routes return dict/untyped DTOs; operation schemas absent. W2. |
| A05–A06 | Probes accept `period_ns=2**32`, `time_ns=2**53`, mismatching capture count. Python legacy `10**400` graph coordinate regression is intentional. W1 profile decision; no legacy downgrade. |
| A07 | Shared instrument guard and physical generator guard conflate instrument paths with arbitrary analog routing. W2 versioned path evidence, defaults unavailable. |
| A08–A10 | Four existing SQL tables, anonymous sessions, no account RBAC/project CRUD/versioned migrations. W3–W4. Existing experiments/leases/sessions are durable. |
| A11–A12 | Owner event queues silently discard oldest item; no version/resync; create/run cancellation can lose a created record. W2/W6. |
| A13 | `circuit.ts` mixes responsibilities; `experiment.ts` and `instrument.ts` import each other. W5. |
| A14–A15 | No SignalDomain dispatch; wire namespace has local typed/runtime definitions. W1 namespace contract, W7 domain version/migration. |
| A16–A17 | Generator UI configuration is not fully carried through immutable create request; analog encoding metadata has no complete waveform decoder pipeline. W7; no fake producer. |
| A18–A19 | No independent Contracts CI or real browser E2E workflow. W8. Existing Node/SFC tests remain. |
| A20 | Capture lookup scans experiments and payload read occurs inside global manager lock. W7 contention regression before refactor. |
| A21–A22 | Large orchestration modules and procedural model factories exist alongside functioning thumbnail cache/disposal. Refactor by responsibility only; integrate provider with a real supported asset use. W5. |
| A23 | API/capture/version docs lag implementation. Update authority and relevant READMEs with verified implementation. |

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| W0 | PASS | Fresh baseline and source re-audit above |
| W1 | PASS | `2026-10-16-w1-contracts.md`: 507 Python PASS/1 SKIP, 712 browser PASS, build/package/generation PASS |
| W2 | PASS | `2026-10-16-w2-api-realtime.md`: 571 Python PASS/1 SKIP, 732 browser PASS, build/package/generation PASS |
| W3 | PASS | `2026-10-16-w3-auth-migrations.md`: 677 Python PASS/1 SKIP, 749 Web unit PASS, 2 real Chromium E2E PASS; PostgreSQL runtime deployment not verified |
| W4 | PASS | `2026-10-16-w4-projects.md`: 709 full Python PASS/1 SKIP plus 30 final integration regressions, 7 actual PostgreSQL PASS, 789 Web unit PASS, 6 real Chromium E2E PASS, build/generation/clean Contracts package PASS |
| W5 | PASS | `2026-10-16-w5-boundaries.md`: 836 Web unit PASS, 9 real Chromium E2E PASS, 23 Python frontend smoke PASS, AST boundaries/typecheck/multipage build and independent review PASS |
| W6 | PASS | `2026-10-16-w6-remote-assignments.md`:895 Web unit PASS,12 real Chromium PASS/clean exit,744 full Python PASS/1 SKIP plus38 final queue/API and3 real execution/harness regressions,11 actual PostgreSQL PASS, build/generation/typecheck/AST/review PASS |
| W7 | PASS | `2026-10-16-w7-instruments-domains-capture.md`: 931 full Python PASS/1 Icarus SKIP plus17 event tests,1043 Web PASS,12 real Chromium PASS/clean exit,14 actual PostgreSQL PASS, generation/typecheck/build/AST/review PASS |
| W8 | PASS (local software gates) | `2026-10-16-w8-release.md`:1015 full Python PASS/1 Icarus SKIP,1054 Web PASS,14 actual Chromium PASS/runner+API0,16 actual PostgreSQL PASS,355 Contracts, four wheels outside checkout, generation/typecheck/AST/build and50-principal/1195-request workload PASS. Git checkpoint recorded below. |

Acceptance T01–T36 and findings A01–A23 are mapped individually to implementation/tests/results in [the final matrix](2026-10-16-acceptance-matrix.md). PASS denotes local software evidence; hosted CI, target deployment and hardware are explicitly separate. The [source inventory](2026-10-16-source-inventory.md) enumerates all452 changed/new publishable paths (145 modified,307 additions), verified against unchanged original HEAD. The [handoff](2026-10-16-web-contracts-handoff.md) records setup, schema/version compatibility and migration/operational limits.

All W0–W8 Git checkpoints were attempted after their gates and failed before staging because linked-worktree metadata is read-only. Final W8 `git add -- .` exited128: `Unable to create .../.git/worktrees/refactor/index.lock: Permission denied`; the conditional commit did not run. No staging or commit succeeded. Original HEAD is unchanged; no reset, push, merge or deployment occurred. There is no outstanding core Web/Contracts implementation TODO in this scope; physical producers/RTL/transport and full analog/mixed solvers remain the explicitly unimplemented external capabilities.
