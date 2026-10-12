# CONTEXT — net*CIRCUIT Remote Project Constitution

This file is the first document an AI or new contributor must read. It records architectural decisions that must not drift silently between sessions.

## 1. Project identity

**Project:** net*CIRCUIT Remote  
**Purpose:** remote digital-electronics laboratory using real logic ICs, Web control and FPGA real-time hardware.

## 2. Immutable-until-approved decisions

- Main controller: **Raspberry Pi 5**.
- OS baseline: Raspberry Pi OS 64-bit.
- Frontend: **Vue 3 + TypeScript + Vite + Pinia + Three.js**.
- Application backend: **Python + FastAPI + Pydantic + SQLAlchemy + WebSocket**.
- Hardware backend: **Python + gRPC + Protobuf**.
- Database baseline: **SQLite**.
- Deployment baseline: **Nginx + systemd**.
- Development strategy: **Web-first**, simulation-first, FPGA integration later.
- Frontend UX architecture: **Single Workspace**, desktop-style virtual electronics workbench.
- `/` opens the laboratory workspace directly; do not rebuild the product around Dashboard / Circuits / Stations / Experiments / Settings pages.
- Approved workbench layout: application/file actions at top, component ribbon below, left interaction tool rail, dominant central Three.js workspace, bottom simulation status bar, contextual/floating instrument windows.
- Reference images and CRUMB-like workflows are inspiration for interaction and density only; do not copy proprietary source, branding, icons or assets pixel-for-pixel.
- Prototype FPGA: **EP4CE6E22C8N**, no SDRAM, Experiment Controller only.
- Final V1 FPGA: **EP4CE10E22C8N**.
- Final V1 external memory: **64 MB SDR SDRAM, 16-bit**.
- Final V1 architecture: **one FPGA** unless evidence later justifies splitting.
- Breadboard target: **at least two physical breadboards**.
- RTL must remain portable EP4CE6 -> EP4CE10 where practical.
- Timing-critical operations belong in FPGA, not Linux userspace.
- Frontend must never directly access raw FPGA registers, Linux SPI device paths or raw MUX addresses.
- Backend validates Circuit Graph and hardware policy before physical execution.
- Breadboard holes must never be equated directly with FPGA GPIO or independent routing channels.
- Unknown electrical values, part numbers and timing values must never be invented.

## 3. Required session-start protocol

Before editing code:

1. Read `docs/CONTEXT.md`.
2. Read `docs/ARCHITECTURE.md`.
3. Read `docs/ROADMAP.md`.
4. Read `docs/DEV_LOG.md`.
5. For frontend work, read `docs/superpowers/specs/2026-10-09-single-workspace-ui-design.md`.
6. Read task-specific specs/contracts.
7. Inspect related source and tests.
8. Plan the smallest safe change.

## 4. Required session-end protocol

After meaningful work:

1. Run relevant verification.
2. Update affected docs/contracts when required.
3. Update `docs/DEV_LOG.md`.
4. Record tests actually run and any checks that were not available.
5. Never write “working”, “fixed”, or “done” without current evidence.

## 5. Boundary rules

### Frontend may depend on

Application API, WebSocket protocol, Circuit Graph and capability descriptors.

### Frontend must not depend on

FPGA register maps, physical SPI details, raw MUX/crosspoint addressing or hardware driver implementation.

### Application backend may depend on

Circuit contracts and Hardware Service contract.

### Hardware Service may depend on

Hardware RPC contract, FPGA protocol/driver implementation and simulator adapter.

### FPGA may depend on

Documented register/protocol contracts and hardware electrical design; it does not implement Web/session logic.

## 6. Contract-change rule

Before an incompatible contract change:

- identify all consumers;
- version the contract;
- update tests;
- update documentation;
- update `CHANGELOG.md` when release-visible.

## 7. Architectural-change rule

Changing an immutable decision requires explicit reasoning, trade-off analysis, user approval, update to `ARCHITECTURE.md`/`CONTEXT.md`, and a changelog entry when applicable.

## 8. Definition of Done

A task is complete only when implementation exists, relevant tests pass, known regressions are absent, affected documentation is updated and DEV_LOG is updated. If verification cannot be performed, use **IMPLEMENTED — NOT VERIFIED**.

## 9. Source style

- Prefer small modules with one responsibility.
- Preserve public contracts across internal refactors.
- Use structured error codes instead of generic `error` strings.
- Do not hard-code future resource counts unless the hardware design proves them.
- Add comments for architectural constraints, not for obvious syntax.
- Keep hardware-specific assumptions out of frontend code.

## 10. FPGA rules

- Synthesizable Verilog HDL for RTL.
- Clear reset behavior.
- Avoid unintended latches and arbitrary gated clocks.
- Treat CDC/metastability explicitly.
- Keep common RTL separate from target-specific constraints.
- EP4CE6 source is a prototype target, not the permanent resource ceiling.
- Do not claim SDRAM timing correctness until the exact SDRAM datasheet is selected and used.


## 11. Single Workspace frontend rules

- Treat the old six-page Vue Router design as **superseded**.
- Do not add new Dashboard/Circuits/Stations/Experiments/Settings UI.
- Route-level separation must not be used to hide core lab tools; core lab interaction stays in one workspace.
- Prefer component ribbon + contextual menus for component insertion.
- Prefer floating windows for instruments, memory editors and detailed inspectors.
- Keep the circuit workspace visible while instruments are open.
- Keep UI state separate from Circuit Graph electrical state.
- Component/library definitions must be metadata-driven.
- Visual 3D position must never define an electrical node.
- Preserve typed API/WebSocket/hardware boundaries during UI migration.
- Do not claim the Single Workspace source migration is complete until frontend tests and production build pass.

## 12. Current frontend implementation — 2026-10-09

Single Workspace Phase 1 is implemented. App renders one shell; legacy/unknown URLs redirect to `/`. No legacy page components, permanent inspector/library columns or bottom dock remain. Six Pinia stores and typed REST/WebSocket boundaries are retained. Project file/history actions are local JSON; scene resources stay outside stores. Shared floating windows support activation/focus, drag, keyboard movement/Escape and viewport clamping.

Use supplied artwork through the committed thumbnails in `apps/web/src/assets/icons`; regenerate with `scripts/prepare_workbench_icons.py` after source artwork/device metadata changes. Do not bundle the large original SVG/embedded-PNG files. Read `docs/SOURCE_ANALYSIS_SINGLE_WORKSPACE.md` and the current DEV_LOG before Phase 2.

Phase 2 now implements metadata-backed placement, models, picking, graph commands, wire/unwire, orbit/pan/snap and gesture history. Canonical editor metadata lives in `device-library/editor/components.json`; sync with `scripts/sync_editor_catalog.py`. Memory has a separate local image v1.0 contract and working Hex Editor; it is configuration, not SDRAM/capture. Structure and power-supply visuals have no electrical ports. Read `docs/SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md` and the Phase 2 spec/plan for current ownership and verification.

Current navigation: left drag empty surface pans on XZ; only Move permits direct model dragging, including structures. Select only selects models/wires. Right drag orbits and XYZ follows camera orientation. Compact orbit/pan buttons sit beside the gizmo; the separate View controls box is removed. A move records one Undo on release, retains Y/rotation/endpoints and cancels cleanly; camera pan never edits Circuit Graph. Read `docs/SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md` and `docs/verification/2026-10-09-move-tool-browser.md` for the current rule and evidence.

Next work: Phase 3 simulator/event/clock/model adapters and real output/capture data. Run/Stop/Step, acquisition and generator output remain unavailable until their execution contracts exist. Geometry/rotation/snapping never creates electrical connectivity. Preserve unknown imported metadata and keep every editor mutation within command history.

Latest technical refinement: selected models have a 2 CSS px Medium Gold #d4af37 contour. Breadboards use perforated deck/decal and instanced socket cavities, keyed-joint clearance and inward bevels; dimensions/contact counts/docking contracts remain. The adaptive technical grid has dark minors, majors every five cells, distance fade and projected-pixel detail suppression. Component Info only appears for an existing selected model, with contained artwork and Add +; deselection/placement/deletion hides it. The canvas WORKSPACE/project caption is removed. Move-only capture, graph/history and other floating windows remain. Read `docs/SOURCE_ANALYSIS_TECHNICAL_WORKBENCH.md` and `docs/verification/2026-10-09-technical-workbench-browser.md`.

## Current transform/view refinement — 2026-10-09

Explicit adjacent Component Transform Gizmo handles move selection on X/Z or rotate around Y, with hover, live pose/port/wire preview and one history command on release. Direct body dragging remains Move-only. SceneManager owns the tool outside graph; useCircuitEditor owns pointer capture, rollback/commit and angle unwrapping. Pixel scale updates during active motion; reusable neighbor snapshots and visible window/navigation regions inform placement. Snap uses 0.5-unit movement and 15-degree gizmo rotation; arbitrary-angle breadboards use conservative rotated AABB footprints.

Perspective and generic tool-title overlays are removed. Status-bar right defines Zoom In/Out, Zoom To View Entire Circuit and Workspace Object Snap. Fit uses model/wire bounds, preserves heading and excludes grid/tools. The original bench Power Supply enclosure/controls/vents keep zero electrical ports and unknown/OFF readouts. No Delete/Confirm/Check is added to gizmo. See `SOURCE_ANALYSIS_COMPONENT_TRANSFORM_GIZMO.md` and `verification/2026-10-09-component-transform-gizmo-browser.md`. Final production bundle remains unverified under the previously declined sandbox elevation.

## Current ribbon/gizmo/supply refinement — 2026-10-09

Ribbon palettes now contain component choices without Info rows, anchor below the clicked family and clamp/reposition on resize or horizontal scroll. Embedded/Controller stays on one line. The brighter/thicker gizmo keeps X/Z world-aligned while its Y arc/grip follow live model yaw; the pick marker is the real grip position. Cached unposed visual bounds inform selected-model clearance, and viewport clipping has stronger priority. Direct body drag remains Move-only.

Power Supply has superseded the earlier wide four-knob/three-terminal visual: canonical dimensions [2.4, 2.8, 3.2], upright metal case, portrait V/A/W unknown/OFF screen, two Voltage/Ampe knobs, two hollow Vcc/Gnd binding posts, I/O switch/vents/feet/screws and no USB. Its new original SVG preview and introduction match these controls. Geometry still creates no electrical ports/source/telemetry. Supplied SVG provenance and user-added reference PNGs remain intact. Read `SOURCE_ANALYSIS_RIBBON_GIZMO_SUPPLY.md` and `verification/2026-10-09-ribbon-gizmo-supply-browser.md` for current implementation/evidence; older reports are historical.

## Current stability audit — 2026-10-10

Source audit fixes unify wheel/toolbar zoom as target-relative dolly (50–200%, fixed FOV, no model scaling), guard zero-sized/captured camera input and near-horizon pan, reconcile incident wires, reuse supply visuals on settings commits and normalize extreme yaw before visual math. Shared resource disposal, owned Sprite geometry and pending logo callbacks follow model lifetime. Combined Undo/Redo snapshots have a 20 MB/50-entry budget with one immediate oversized snapshot; station/discovery/file/validation revisions prevent stale completions. Backend structural validation follows canonical optional fields, invalid logic levels reject before bitwise evaluation and gRPC interruption terminates the server.

Frontend153/153 and production build pass; Python96/97 with the sole supplied-icon provenance failure during concurrent user artwork edits. The user explicitly asked to keep icon files while they finish those edits; do not restore/regenerate them to hide this failure. This current build verification supersedes older declined-sandbox-build notes, which remain historical. Read `SOURCE_ANALYSIS_STABILITY_AUDIT.md`, `verification/2026-10-10-stability-audit-browser.md` and the current DEV_LOG. Simulator execution/capture, generated RPC handlers and physical/FPGA bring-up remain Phase 3+ boundaries.

## Current area zoom — 2026-10-11

Status-bar Zoom To Area sits immediately right of Fit. It temporarily captures a rectangle ahead of editor actions, focuses the selected surface depth and fits boundary samples while preserving heading/FOV/aspect, graph/history and prior tool/selection. Escape/right click/toggle, editor/graph changes, resize and visibility/context/capture loss cancel; small rectangles retry. Name-only titles replace the three earlier verbose zoom titles. Framing rebases wheel/toolbar to 100%, like Fit. Final frontend161/161, Python97/97 and production build pass; the old icon provenance failure no longer reproduces and this task did not change artwork. See SOURCE_ANALYSIS_ZOOM_TO_AREA, browser verification and DEV_LOG.

## Current collapsible toolbars — 2026-10-11

Current drawer refinement: Components and Tools are absolute overlays over a permanently full-size workbench viewport. Their mounted inner containers slide via translate3d for200 ms; collapse never changes canvas CSS dimensions or enters its resize pipeline. Hidden content is inert/aria-hidden immediately and visibility-hidden after motion finishes. One post-commit animation check handles same-frame reversals without an end event; reduced motion settles safely. Manual drawer resizing, its handles/composable/preferences/actions and motion branch are removed. Components is fixed at96 px; Tools is66 px or54 px when workbench width is560 px or less. Computed drawer insets bound windows and contextual chrome independently of the WebGL viewport. Cached gizmo obstacles reserve drawer and toggle swept areas until motion completes. Existing frameTasks/SceneManager retain deduplicated RAF handling for actual viewport changes. Latest checks: frontend181/181, production build and Python97/97 pass. Evidence: `verification/2026-10-11-fixed-drawers.md`.

The earlier zero-height/zero-width flex implementation, opacity-only performance refinement and manual drawer sizing are historical (`verification/2026-10-11-resizable-panels-browser.md`, `verification/2026-10-11-panel-resize-performance.md`, `verification/2026-10-11-overlay-drawers.md`). Current overlays allocate no layout space even though their offscreen mounted boxes retain fixed dimensions. Persistent edge toggles, native keyboard access, palette closure, short-height tool scrolling and hidden-opener focus return remain. Menu motion preserves camera/graph/history/selection/tool/placement/Zoom To Area; actual viewport resize still cancels transient gestures. Current ownership and algorithms: `SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md`.

## Current instrument presentation — 2026-10-12

Scope now has a responsive 2D front panel matching its 3D model's Horizontal/Trigger/Vertical groups, seven dials, key labels and CH1 yellow/CH2 cyan colors. Signal Monitor has a configured-channel list, empty timeline grid, division markers, capture/trigger status and measurement footer. Presentation-only shared metadata owns scope colors/labels; geometry, instrument state and future acquisition remain separate. Default windows are760×530 and720×500, using existing bounds/scrolling. Capture controls stay disabled; NO CAPTURE SOURCE/NO WAVEFORM DATA/NO TRACE DATA and unknown measurements remain explicit. No graph, simulator, manager or hardware contract changed. Frontend185/185, Python97/97, build and browser checks pass; details/files/screenshots: `verification/2026-10-12-instrument-gui.md`.

Current continuation adds editing-state-preserving Power Supply/Function Generator sidebar launchers and removes only the sidebar Delete button. Keyboard/gizmo deletion remains. PowerSupplyWindow binds selected canonical voltage_v/current_limit_a/power_on through CircuitStore; it has no parallel setpoints or telemetry, W stays unknown. Generator uses shared model/artwork presentation spec and two local configuration previews; flat legacy fields remain CH1, nested channel2 is independent. Output/DDS controls stay unavailable. Defaults are600×510 Supply and760×530 Generator; existing floating-window and drawer/workspace architecture remain. Latest frontend191/191, Python97/97 and build pass; evidence/files: `verification/2026-10-12-supply-generator-launchers.md`.

## Current placement ghost Gizmo — 2026-10-12

The render-only PlacementDraft follows the cursor on XZ without holding a button, preserving rotation through snapping and setGhost. Its existing ComponentTransformGizmo exposes X/Z/XZ/Rotate Y and hides only Delete. Ghost and gizmo now update together in the same frame using a cached relative offset; the placement anchor and160 ms idle timer are removed. Ordinary follow validates constant-size cached clearance, without candidate/model/obstacle traversal. Candidate/direction is sticky; valid layouts resist small score changes and relayout on invalid clearance, camera/projection, viewport, yaw, obstacles or graph revision. Spatial capture uses entry/exit hysteresis and a directed approach corridor to make handles reachable without chasing the cursor. Gizmo picking/capture precedes follow/commit; hover/drag pauses follow, moving away resumes. Capture is reset at transform start/release and layout/lifecycle changes so stale corridors cannot freeze a later pose. Placement body drag, pickPlacement and hoveredPlacement remain absent. Preview never creates graph identity/ports/Info/history; an outside click commits the full pose in one Undo/Redo step, and Escape/right click cancels. Rotation-aware axis-safe docking/anti-overlap, pointer ownership and selected-model behavior remain. Latest frontend213/213, Python97/97 and build pass; native checks cover Breadboard, Oscilloscope, Function Generator and Power Supply. Current evidence/files: `verification/2026-10-12-placement-sticky-gizmo.md`; earlier placement reports are historical.
