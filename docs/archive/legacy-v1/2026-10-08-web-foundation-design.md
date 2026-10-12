SUPERSEDED
Do not use as current implementation authority.
Current authority: docs/ARCHITECTURE.md

# SUPERSEDED — Historical Web Foundation UI Design

> **Status:** SUPERSEDED on 2026-10-09 for user-facing UI architecture.  
> **Replacement:** `docs/superpowers/specs/2026-10-09-single-workspace-ui-design.md`  
> Keep this file only as historical context for the already-built typed API/WebSocket/store foundation. Do **not** use its six-page routing/layout design for new frontend work.

---

# Phase 1 — Web Foundation

## Intent and scope

Implement the user's Phase 1 brief on the existing Vue application. The result is a stable browser shell for subsequent circuit editing, simulation and hardware integration. Keep Vue 3, TypeScript, Vite, Pinia and the existing Circuit Graph v1.0. Do not implement physical drivers, a 3D editor, waveform capture, resource locking or backend persistence in this phase.

## Application

Use Vue Router with history URLs: `/` (Dashboard), `/laboratory`, `/circuits`, `/stations`, `/experiments`, `/settings`. Redirect `/dashboard` to `/`; handle unknown URLs with an accessible not-found page. Nginx already provides the SPA fallback.

The shared top bar contains branding, navigation, execution status and event connection status. Laboratory has Component Library, Lab Workspace, Properties/Inspector and a bottom dock with Instruments, Logic Analyzer and Console tabs. Desktop columns shrink at intermediate widths and stack on smaller screens. No page should force body horizontal overflow at 1024, 1280 or 1440 px. Controls use labels, visible focus, and semantic links/buttons.

Circuits allows creating, renaming and opening session-only drafts and validating the current graph using the actual backend. A new graph is empty and uses schema version `1.0`. Library selection previews component metadata; placement/wiring and real measurements remain explicitly identified as later phases. Stations displays backend discovery results with loading, empty, failure and retry states. Dashboard links to primary workflows; Experiments and Settings expose useful foundation state while clearly identifying future backend-dependent functionality.

## State

Six stores: `circuit` owns session drafts/current graph/validation; `workspace` owns selection and viewport; `station` owns discovery, selection and execution status; `experiment` owns future lifecycle state; `instrument` owns dock selection and bounded console events; `ui` owns panel visibility and connection state. Keep transient connection health separate from execution mode.

Frontend status values are exactly `SIMULATION`, `HARDWARE_AVAILABLE`, `HARDWARE_BUSY`, `HARDWARE_OFFLINE`, `FAULT`. Adapt the current API's `mode`/`state` without changing its wire contract. An unavailable or disconnected physical station cannot become simulated success. Default simulation describes the selected editing mode, not a successful simulator run.

## Services

Only `services/api/client.ts` calls fetch. Centralize base URL, JSON headers, cancellation/timeout and structured errors. Domain modules use explicit DTOs and validate responses. Existing calls: health, station list, circuit validation (including structured 422 validation failures). `experiments.ts` defines a typed future list/get interface; pages do not call unimplemented endpoints. Preserve old service modules as compatibility exports.

WebSocket client connects to `/ws/events`, reports lifecycle, validates supported envelopes, and reconnects with exponential delay (1 s base, 30 s cap, bounded jitter). Reset delay on open. Explicit disconnect cancels retry and prevents stale socket callbacks from rescheduling. Ignore malformed/unsupported messages without changing station state. Initial hello/echo remain compatible. Station change envelopes are reserved/documented for later backend support. Re-discover stations after a reconnect; physical status becomes offline while events are disconnected.

## Acceptance and verification

Build with `npm run build`. Add runtime tests for API failures/422, station normalization and selection, graph validation invalidation/races, reconnect/reset/cleanup and malformed events. Use Node's test runner with esbuild for TypeScript tests. Strengthen frontend architectural boundary checks across all source files. CI uses `npm ci`, runtime tests, production build and boundary tests. Verify actual UI navigation, session drafts, errors and desktop layout in a browser. Record local CI-equivalent results separately from hosted GitHub Actions, which requires a pushed commit.
