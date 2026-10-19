# Source analysis — Single Workspace migration

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

Historical Phase 1 analysis. Current interactive editor source is analyzed in `SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md`; see DEV_LOG for Phase 2 status.

Analyzed on 2026-10-09 against the actual repository, including frontend source/tests, backend contracts, device metadata, simulator and CI. This report complements the approved Single Workspace spec.

## Before migration

`App.vue` rendered page navigation and RouterView. Six routed pages owned lab workflows: circuit creation/opening, station selection, settings and a Laboratory page composed from permanent Library/Workspace/Inspector columns and a bottom InstrumentDock. The CSS board was a placeholder; Three.js was installed but had no scene lifecycle. This distributed UI ownership makes contextual instruments and a dominant circuit workspace difficult to add coherently.

## Reusable engineering

| Boundary | Finding and migration decision |
|---|---|
| circuit store | Session-local independent schema v1 drafts; snapshot/version guards prevent stale backend validation. Retain and extend with file commands/history. |
| station store | Five distinct status outcomes; disconnected physical selections remain physical/offline. Preserve selection and discovery in Inspector. |
| workspace store | Existing selection/preview/zoom state; replace select/pan with the seven requested tools. |
| ui store | Permanent-panel flags belong to the retired layout; replace with ribbon and shared window state. |
| instrument store | Bounded event console reusable; retire dock tab state and add instrument configuration shells. |
| experiment store | No browser execution/capture contract. Display actual state and unavailable controls. |
| REST | Typed client centralizes requests, error codes, timeouts, cancellation and validation's structured 422 response. Keep unchanged. |
| WebSocket | Exponential reconnect with jitter, connection lifecycle, typed events and retired-socket guards. Root connection owner remains mounted once. |
| tests/CI | Runtime tests cover transport and stale state. Legacy file-presence checks require migration; preserve import/hardware/fetch boundaries. |

## Backend and metadata limits

The API exposes validation, station discovery and basic events. It does not yet expose browser circuit persistence, simulation run/stop/step, frequency, waveform acquisition or memory editing. The simulator has starter digital logic, but that does not constitute a browser execution contract. Local JSON files are consequently local files; disabled measurement/output controls explain the missing integration. Component imagery is not evidence of pinout, electrical parameters or simulation support. The small `device-library` metadata remains authoritative where available.

## Asset audit

All seventeen files in `assets/icon .svg` are SVG image wrappers around base64 PNGs, rather than vector drawings. Their combined source size is approximately 102 MB; most individual images are 5–9 MB. Importing them directly into a ribbon would substantially increase download and decode costs.

`scripts/prepare_workbench_icons.py` generates SVG wrappers containing downsampled WebP thumbnails, records each original SHA-256 and original/output byte counts in a manifest, and leaves source files intact. The frontend uses these generated SVGs, preserving the supplied component artwork. Action/tool icons are simple local stroke SVGs because the supplied collection represents components and instruments, not file commands.

## New ownership

`App` → `SingleWorkspaceShell` → AppTitleBar / ComponentRibbon / ToolRail / CircuitWorkspace3D / SimulationStatusBar / FloatingWindowManager. Router normalizes legacy and unknown URLs to `/` and never selects a lab workflow. Shared FloatingWindow handles drag, focus, keyboard dismissal and bounded placement; the six bodies only own their content. SceneManager owns graphics resources outside serializable stores; Circuit Graph remains the logical source of truth.

## Phase boundary

Phase 1 provides a usable shell, local file/history commands, metadata previews, live backend status/validation and a disposable Three.js grid. It does not implement component placement, picking, wiring, circuit visuals, an execution engine, fake traces or physical device controls. These require separate Phase 2+ work and explicit model/contracts.

## Verified result and review

The migration preserves the backend wire contracts. Frontend module position fields now correctly remain optional, matching the existing canonical schema. File imports validate structure before mutation; export uses compact JSON when necessary so accepted downloads can be reopened within the same size limit. Shared window activation separates intentional focus transfer from ordinary z-order changes, and palette dismissal retains a stable family-button focus target.

An independent review caught and reproduced the export-size and ribbon-focus defects before the final fix pass. Final evidence: npm test 31/31, production build PASS, Python frontend boundaries 9/9, whole repository regression 44/44, four desktop browser sizes PASS. Detailed interaction evidence and a screenshot are in `verification/2026-10-09-single-workspace-browser.md`. Vite's large-chunk advisory is a documented optimization opportunity; no hosted CI run or physical operation is claimed.
