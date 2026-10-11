# Roadmap

## Status legend

- `[x]` agreed/completed
- `[ ]` not implemented
- `[~]` in progress
- `[S]` superseded by a later approved design

## Phase 0 — Project Architecture

- [x] Select Web-first / simulation-first strategy.
- [x] Select modular monorepo boundary.
- [x] Select software stack.
- [x] Select EP4CE6 prototype and EP4CE10 + 64 MB SDR SDRAM V1 direction.
- [x] Create initial repository scaffold.
- [x] Approve **Single Workspace** frontend architecture on 2026-10-09.
- [S] Previous six-page Dashboard/Laboratory/Circuits/Stations/Experiments/Settings UX.

## Phase 1 — Single Workspace Web Foundation

Reusable Phase 1 engineering already exists:

- [x] Vue 3 + TypeScript + Vite + Pinia foundation.
- [x] Typed API layer.
- [x] WebSocket reconnect/lifecycle foundation.
- [x] Six Pinia store boundaries.
- [x] Frontend runtime tests, boundary checks and reproducible build/CI commands.

UI migration completed on 2026-10-09; evidence in `DEV_LOG.md`:

- [x] Replace routed multi-page shell with one `/` Single Workspace shell.
- [x] Remove visible main-page navigation.
- [x] Add application/file-action bar: New / Open / Save / Undo / Redo (local JSON/project history).
- [x] Add top component ribbon with twelve groups and supplied SVG artwork thumbnails; choice-only palettes anchored to their family and single-line labels.
- [x] Add left interaction tool rail with seven shared modes.
- [x] Fully collapse component ribbon/tools sidebar with floating edge toggles. Current mounted overlay drawers use fixed96 px Components and66/54 px Tools, sliding via200 ms transforms over a fixed Three.js viewport, with inert hidden content, reversal/reduced-motion handling and safe areas. Manual drawer resizing is removed; RAF/deduplicated WebGL resizing remains reserved for actual viewport changes. Current evidence: `verification/2026-10-11-fixed-drawers.md`; earlier flex-collapse/performance/overlay-resize evidence remains historical.
- [x] Add central workspace shell occupying most of the viewport.
- [x] Add status-bar-right Zoom In/Out/Fit Entire Circuit and Workspace Object Snap with definitions (supersedes Perspective overlay/reset).
- [x] Add bottom simulation status bar with honest unavailable execution controls.
- [x] Add shared floating-window manager: drag/focus/keyboard/clamp.
- [x] Add initial instrument window shells: Oscilloscope, Function Generator, Signal Monitor.
- [x] Refine Scope into a responsive 2D front-panel GUI and Signal Monitor into a channel/timeline Logic Analyzer layout, sharing scope presentation metadata with the 3D model. Capture controls/data/measurements remain unavailable pending Phase3 contracts. Evidence: `verification/2026-10-12-instrument-gui.md`.
- [x] Add Component Info, Inspector and Memory Hex Editor window shells.
- [x] Retire legacy routed page components after references/tests are migrated.
- [x] Keep API/WebSocket/hardware boundary tests green; verify build and desktop browser layout.

## Phase 2 — Interactive Circuit Workspace

- [x] Three.js scene/camera/lights/grid/models/picking and disposable render/resize/context lifecycle.
- [x] Breadboard/board/power-supply visual models, without invented electrical nodes or sources.
- [x] Canonical metadata-driven palette and generated browser catalog (21 editor types, including visual structures and two-channel Oscilloscope/Function Generator).
- [x] L1571979 two-channel Function Generator visual, reference front layout, silver case, independent screen/encoder/keys/BNCs/stand, shared GLB/glTF/PNG/SVG export and existing Move/Rotate/gizmo/Undo-Redo integration. DDS output remains later work; see `apps/web/public/models/function-generator-2ch/README.md`.
- [x] Two-channel Oscilloscope bench visual with a silver enclosure, wide screen, complete named front controls, three aligned BNCs (two inputs and Trig Out), two inclined stands and reusable GLB/glTF export. Signal acquisition remains later work; see `apps/web/public/models/oscilloscope-2ch/README.md` for the model contract.
- [x] Drag/drop and click-to-place from ribbon.
- [x] Component select/move/rotate/delete; keyboard equivalents in Inspector/canvas.
- [x] Explicit logical wire/unwire, duplicate/direction/width/input-driver checks.
- [x] Zoom/pan/orbit/picking/reset/snap, with keyboard view controls.
- [x] Status-bar Zoom To Area: captured rectangle, surface-depth camera framing, reversible toolbar/wheel zoom and cancellation without graph/history edits; name-only Zoom In/Out/Fit tooltips.
- [x] Navigation UX correction: Move-only direct model dragging, Select selection, empty-surface left pan, camera-oriented XYZ and adjacent orbit/pan buttons; low-angle drag regression covered.
- [x] Selection refinement: subtle shape-following yellow contours, recessed breadboard housing and one upper-right Component Info introduction/Add panel; graph/history and Move-only drag retained.
- [x] Technical workspace refinement: 2px Medium Gold contours, real socket cavities and matching deck openings, joint/bevel clearance, selection-only Info with contained artwork, adaptive minor/major faded grid and no canvas caption. Evidence: `verification/2026-10-09-technical-workbench-browser.md`.
- [x] Adjacent Component Transform Gizmo: X/Z/free movement, Y rotation, hover/live wires, stable active pixel scale, obstacle avoidance, one Undo/cancel; Move-only body dragging retained. Original bench Power Supply model and no tool-title overlay. Evidence: `verification/2026-10-09-component-transform-gizmo-browser.md`; final bundling still limited by sandbox.
- [x] Ribbon/gizmo/supply refinement: anchored choice-only palettes, one-line Embedded/Controller, clear handles with live rotating Y grip, tall-model/small-canvas clearance, upright metal two-knob/two-post supply without USB. Evidence: `verification/2026-10-09-ribbon-gizmo-supply-browser.md`; unknown/OFF visual-only source boundary retained.
- [x] Undo/redo graph commands; one committed step per drag; canceled preview changes no graph.
- [x] Circuit Graph updates independent of geometry; cascade deletion and JSON round trip.
- [x] Local JSON save/open project UX in the Single Workspace (server persistence remains Phase 4).
- [x] Selected-module Inspector and local Memory Hex Editor contract.

Implemented on 2026-10-09. Evidence: `DEV_LOG.md`, `SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md` and Phase 2 browser report. Models below provide placement/configuration contracts; simulation behavior belongs to Phase 3.

Initial component families:

- [x] Structure / breadboard / board / visual power supply.
- [x] Passive: resistor, capacitor functional terminals/configuration.
- [ ] Active/basic transistor/LED representations as supported by simulator scope.
- [x] Inputs: button, toggle switch, 4-bit DIP switch, clock.
- [x] Outputs: LED, single seven-segment, logical probe.
- [x] Metadata-driven 74HC08 logical gate ports, without a package pin map.
- [x] Generic adder/multiplier bus abstractions, no unconfirmed part number.
- [x] Generic memory with separate local byte-image contract and Hex Editor.
- [x] Generic 8-bit display. Dual/quad segment models remain pending.
- [ ] Labels/notation.

## Phase 3 — Simulator

- [~] Starter combinational logic (74HC08 foundation exists; broader library pending).
- [ ] Combinational device library.
- [ ] Sequential logic models.
- [ ] Virtual clock and event handling.
- [ ] Virtual capture/waveform.
- [ ] Simulated LED/display state linked to Circuit Graph.
- [ ] Function Generator simulation model.
- [ ] Virtual Oscilloscope/Signal Monitor data source.
- [~] Local initial memory image + Hex Editor implemented in Phase 2; runtime read/write/timing model remains.

## Phase 4 — Application Backend

- [~] FastAPI application shell and initial validation endpoints.
- [ ] Circuit validation.
- [ ] Save/load circuit.
- [ ] Project persistence.
- [ ] User/session boundary.
- [ ] Experiment lifecycle API.
- [ ] Station capability API refinements required by Single Workspace status UI.

## Phase 5 — Hardware Service

- [ ] gRPC service.
- [~] HardwareStation Python abstraction (gRPC handlers pending).
- [x] VirtualHardwareStation starter implementation.
- [x] PhysicalHardwareStation adapter boundary (driver not implemented).

## Phase 6 — Virtual End-to-End

- [ ] Single Workspace -> backend -> virtual station -> waveform -> floating instrument window.
- [ ] Resource locking.
- [ ] Structured fault handling.
- [ ] End-to-end virtual AND-gate experiment.
- [ ] Virtual clock/counter experiment.
- [ ] Open Oscilloscope/Signal Monitor without leaving circuit workspace.

## Phase 7 — Raspberry Pi Deployment

- [ ] Nginx deployment.
- [ ] systemd services.
- [ ] Raspberry Pi OS 64-bit deployment validation.
- [ ] Validate Single Workspace full-screen usability on Raspberry Pi-served frontend.

## Milestone W1 — Web Platform Ready for FPGA Integration

W1 requires:

- Single Workspace shell active at `/`;
- no legacy multi-page workflow;
- component ribbon and tool rail;
- interactive circuit workspace;
- Circuit Graph;
- save/load;
- validator;
- simulator;
- basic logic models;
- virtual clock;
- virtual Logic Analyzer / Signal Monitor;
- waveform rendering;
- simulated Generator/Oscilloscope UI where applicable;
- FastAPI;
- WebSocket;
- Hardware Service;
- station abstraction;
- session/resource locking;
- structured errors;
- Raspberry Pi deployment;
- automated Virtual end-to-end testing.

FPGA work must not start merely because the GUI looks complete.

## Phase 8 — EP4CE6 Experiment Controller

- [ ] Quartus bring-up.
- [ ] clock/reset.
- [ ] device/version registers.
- [ ] communication interface.
- [ ] GPIO.
- [ ] safe-state FSM.
- [ ] basic routing/MUX control.
- [ ] experiment clock.

## Phase 9 — Raspberry Pi ↔ FPGA Integration

- [ ] Hardware transport.
- [ ] protocol/version compatibility.
- [ ] timeout/fault behavior.

## Phase 10 — Routing Hardware

- [ ] select switching topology.
- [ ] validate electrical constraints.
- [ ] prove safe switching.

## Phase 11 — EP4CE10 Migration

- [ ] retarget Quartus.
- [ ] recompile/timing analysis.
- [ ] resource review.

## Phase 12 — SDR SDRAM 64 MB

- [ ] select exact 16-bit SDR SDRAM part.
- [ ] datasheet-derived timing.
- [ ] controller and memory tests.

## Phase 13 — Logic Analyzer

- [ ] trigger/capture buffer.
- [ ] binary waveform transport.
- [ ] feed Single Workspace Logic Analyzer/Signal Monitor floating window.

## Phase 14 — Generator

- [ ] digital generator baseline.
- [ ] map generator controls from floating UI window to Hardware Service contract.
- [ ] define DAC path if analog/AWG required.

## Phase 15 — Oscilloscope Acquisition

- [ ] select ADC/AFE architecture.
- [ ] acquisition/capture pipeline.
- [ ] map physical capture to Oscilloscope floating window.

## Phase 16 — 2+ Breadboard Integration

- [ ] physical node mapping.
- [ ] routing resource mapping.
- [ ] end-to-end hardware experiment.
- [ ] verify visual board IDs do not become implicit physical channel IDs.

## Phase 17 — Multi-user Validation

- [ ] sessions/queue/ownership.
- [ ] load and recovery tests.
- [ ] preserve one-workspace UX while station ownership changes.

## Phase 18 — Thesis V1

- [ ] measured results.
- [ ] documented limits.
- [ ] reproducible demo.
- [ ] V1 release.
