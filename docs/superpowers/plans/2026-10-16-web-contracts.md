# Web & Contracts implementation plan

> **For agentic workers:** Use the phase ledger below, test before changing behavior, and verify each gate before beginning the next phase.

**Goal:** Complete the existing net*CIRCUIT Web and Contracts flows against the supplied W0–W8 specification.

**Architecture:** Preserve Lab-First v3.1, CircuitGraph as design truth, the existing Vue/Pinia/Three workspace, local Hardware Service RPC and HTTP NCAP data plane. JSON Schema owns shapes, route registrations own operations, and protobuf owns internal wire fields. Generation and validation are separate from named semantic/normalization profiles.

**Tech Stack:** Vue 3, TypeScript, Pinia, Three.js, FastAPI, Pydantic, SQLAlchemy, JSON Schema 2020-12, protobuf.

**Spec:** `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/PROMPT_CODEX_Hoan_Thien_Web_Contracts_netCircuit.md` (755 lines, read in full); repository authority is `docs/ARCHITECTURE.md`.

## Global constraints

- SAFETY != CORRECTNESS; topology/function/assessment cannot authorize or veto electrical Run.
- Preserve graph 1.0/1.1 documents, mounting, memory, unknown supported metadata and editor/history behavior.
- Do not expose private plans, physical routes/registers/drivers in browser contracts.
- Do not add physical drivers, RTL, numerical solvers or fabricated acquisition.
- No reset, deletion of user work, push, merge or deployment; leave changes reviewable in the existing worktree.
- User explicitly requests continuous implementation; ordinary design/phase confirmation is already authorized.

## Review focus

- Large legacy Python integers remain structurally preservable; browser editing rejects unrepresentable values explicitly.
- A lost mutation response must reconcile by principal/operation identity without replaying Run.
- A save acknowledgement must only mark the submitted document revision saved.
- Session rotation/revocation must preserve durable ownership while terminating old control authority.
- Slow capture I/O must not block Stop; absent hardware remains unavailable.

## Sequential phase ledger

- [x] W0: Read prompt/authority/current source; baseline and A01–A23 re-audit. Record evidence and decisions in `docs/verification/2026-10-16-web-contracts.md`.
- [x] W1: Freeze legacy schema baseline; machine-readable manifest, offline URI registry, pinned generation, generated Python/TS boundaries, JSON Schema runtime validation, typed parsers, semantic/numeric profiles, packaging. First add regression tests for numeric version/coercion, external refs/mount conditionals, state/capture coherence, unsupported keywords and deterministic/check-only generation. Gate: full graph/Lab/memory/mount conformance and consumer tests/build, package/resource checks.
- [x] W2: Canonical public request/response/event/error DTOs, typed routes/OpenAPI/browser operations, explicit resync and idempotent operations; versioned approved instrument paths. Gate: 571 Python PASS/1 Icarus SKIP, 732 browser unit PASS, production build and generation/package checks PASS; report `2026-10-16-w2-api-realtime.md`. Git checkpoint blocked by read-only metadata.
- [x] W3: Versioned DB migrations; users/server sessions, CSRF/origin/RBAC/rate limits and explicit legacy ownership. Gate: 677 Python PASS/1 Icarus SKIP, 749 Web unit PASS, 2 real Chromium E2E PASS, build/generation/package checks PASS; report `2026-10-16-w3-auth-migrations.md`. Live PostgreSQL remains a release/deployment blocker; Git metadata remains read-only.
- [x] W4: Project/Circuit repositories and conditional revisions, API/client, Project Manager, Save/Open/Save As, conflicts and bounded local recovery. Gate: 789 Web unit PASS, 6 real Chromium E2E PASS, 709 full Python PASS/1 SKIP plus 30 final regressions, 7 actual PostgreSQL migration/restore/concurrency PASS, build/generation/clean Contracts package PASS. See `2026-10-16-w4-projects.md`. Git checkpoint remains blocked by read-only metadata.
- [x] W5: Pure document/history/serialization and transport adapters, remove store cycle, actual asset provider lifecycle and AST dependency checks. Gate: 836 Web unit PASS, 9 real Chromium E2E PASS, 23 Python frontend smoke PASS, typecheck/multipage build/independent review PASS. See `2026-10-16-w5-boundaries.md`. Git checkpoint blocked by read-only metadata.
- [x] W6: Single-flight connection reconciliation, reload/history/queue, create/run/stop cancellation races, role-scoped assignments/authoring. Gate:895 Web unit PASS,12 real Chromium PASS/clean exit,744 full Python PASS/1 SKIP plus38 final queue/API regressions and3 real execution/harness tests,11 actual PostgreSQL PASS, build/generation/typecheck/AST/review PASS. See `2026-10-16-w6-remote-assignments.md`. Git checkpoint attempted after gates.
- [x] W7: Requested/acknowledged instruments, domain model/migration/dispatch, versioned analog descriptors/decoders, capture index/lock/retention. Gate:931 full Python PASS/1 Icarus SKIP plus17 event tests,1043 Web PASS,12 real Chromium PASS/clean exit,14 actual PostgreSQL PASS, generation/typecheck/build/AST/review PASS. See `2026-10-16-w7-instruments-domains-capture.md`. Git checkpoint attempted after gates.
- [x] W8: Independent Contracts/consumer/browser CI and operations/docs/handoff integrated. Final1015 Python PASS/1 Icarus SKIP,1054 Web PASS,14 native Chromium PASS/runner+API0,16 actual PostgreSQL PASS,355 Contracts, four installed wheels outside checkout, generation/typecheck/AST/build and50-session1195-request/0 unexpected workload PASS. See `2026-10-16-w8-release.md` and individual A01–A23/T01–T36 mapping. Hosted CI/target deployment/hardware remain explicitly NOT RUN/unavailable; Git checkpoint outcome is recorded in the closing report.

For each slice: failing regression → verify intended failure → implement → targeted verification → full relevant suite → boundary review → record evidence. Later phase implementation does not start before the preceding gate passes; independent read-only investigation may proceed.
