SUPERSEDED
Do not use as current implementation authority.
Current authority: docs/ARCHITECTURE.md

# SUPERSEDED — Historical Web Foundation Implementation Plan

> **Status:** SUPERSEDED on 2026-10-09 for user-facing routing/layout decisions.  
> The completed API, WebSocket, store and test work remains useful.  
> Do not extend the six-page UI described below. Use `docs/superpowers/specs/2026-10-09-single-workspace-ui-design.md` and `docs/PROMPT_SINGLE_WORKSPACE_UI_AI.md` for the next frontend migration.

---

# Web Foundation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver all Phase 1 foundation requirements in `apps/web`.

**Architecture:** Extend the existing Vue shell with routed pages and a shared layout. Keep state in six Pinia stores and transport in typed API/WebSocket services. Adapt existing backend contracts without adding hardware dependencies.

**Tech Stack:** Vue 3, TypeScript, Vite, Pinia, Vue Router 4, Node test runner, esbuild.

**Spec:** `docs/superpowers/specs/2026-10-08-web-foundation-design.md`

## Global Constraints

- Circuit Graph schema version `1.0`; preserve current API contracts.
- Status values: `SIMULATION`, `HARDWARE_AVAILABLE`, `HARDWARE_BUSY`, `HARDWARE_OFFLINE`, `FAULT`.
- Fetch exists only in `src/services/api/client.ts`.
- No frontend imports of physical drivers or FPGA protocols.
- No fabricated capture, execution or physical readiness.
- Circuit drafts live only in this browser session; backend persistence belongs to Phase 4.

## Review Focus

- A physical station disappears during refresh: remain hardware/offline until explicit mode selection.
- A graph changes during validation: discard stale validation results.
- A closed/replaced WebSocket fires late: do not schedule extra connections.
- The API returns malformed data or a structured 422: show an actionable error/validation outcome.
- Narrow desktop layouts or long identifiers: panels remain usable without body overflow.

### Task 1: Typed API boundary

**Files:** `src/types/{api,station,experiment}.ts`, `src/services/api/{client,circuits,stations,experiments}.ts`, compatibility `api.ts`, `tests/api.test.ts`, `scripts/test.mjs`, `package.json`.

**Interfaces:** `createApiClient(options).request<T>(path, options): Promise<T>`; `circuitsApi.validate(graph): Promise<CircuitValidation>`; `stationsApi.list(): Promise<Station[]>`; `experimentsApi.list/get` reserved for future backend.

- [x] Write and run failing tests for network/HTTP/JSON errors, headers, cancellation, timeout, malformed discovery and structured 422 validation.
- [x] Implement DTOs, decoders, client and domain services; keep backend endpoints unchanged.
- [x] Run `npm test`; expected API tests pass.

### Task 2: Store boundaries and resilient events

**Files:** Six `src/stores/*.ts`, `src/services/websocket/{client,events}.ts`, compatibility `websocket.ts`, `tests/{stores,websocket}.test.ts`.

**Interfaces:** Stores consume Task 1 DTOs/services. `createEventClient(options)` produces `connect()`, `disconnect()`, typed lifecycle and event callbacks. `parseServerEvent(unknown): ServerEvent | null` validates envelopes.

- [x] Write and run failing tests for all status mappings, explicit simulation selection, offline physical selection, validation races, exponential retry/reset and disconnect cleanup.
- [x] Implement stores and event client with cancellation and stale-callback guards.
- [x] Run `npm test`; expected all runtime tests pass.

### Task 3: Routed application and Laboratory layout

**Files:** `src/router/index.ts`, `src/pages/*.vue`, `src/components/*.vue`, `src/composables/useLabConnection.ts`, `src/{App.vue,main.ts,style.css}`.

**Interfaces:** Pages consume stores from Task 2. Connection composable owns socket mount/unmount and event routing. Router exports navigation metadata.

- [x] Implement six routes and not-found handling; split top bar, library, inspector and dock by responsibility.
- [x] Implement session draft controls and backend discovery/validation error states.
- [x] Run build, browser navigation and draft/validation smoke checks; check desktop widths 1024/1280/1440 and a small viewport.

### Task 4: CI, boundaries and handoff

**Files:** `.github/workflows/frontend.yml`, `tests/frontend/test_frontend_shell.py`, `apps/web/README.md`, `contracts/api/README.md`, `docs/{ROADMAP,DEV_LOG,CHANGELOG}.md`.

- [x] Strengthen source boundary checks and update expected scaffold files.
- [x] Add `npm ci`, `npm test` and build to frontend CI.
- [x] Run runtime tests, build, Python regression/context checks and review the whole diff.
- [x] Record exact outcomes and remaining Phase 2/backend limitations in documentation.

## Execution record

- Baseline: build PASS outside Windows filesystem sandbox; context check PASS. System Python lacks pytest; use bundled runtime for Python checks.
- Work is implemented in the user-selected checkout. Changes remain reviewable without committing/pushing or modifying other branches.
- Final evidence: locked install/build PASS, 20 frontend runtime tests PASS, 41 Python regression tests PASS. Browser desktop/mobile and real API/event smoke checks PASS. All three independent review findings reproduced and fixed. See DEV_LOG for limitations and local/hosted CI distinction.
