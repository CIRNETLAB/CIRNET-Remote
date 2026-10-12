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
| R2 | DONE | resolve subject refactor(r2) in Git | 4 RED→GREEN; 50 targeted; 120 Python; 213 frontend; build PASS | RPC 2.0; generated-at-build; loopback only |
| R3 | PENDING | — | — | Safety lifecycle |
| R4 | PENDING | — | — | Backend lifecycle |
| R5 | PENDING | — | — | Simulator |
| R6 | PENDING | — | — | Frontend |
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
