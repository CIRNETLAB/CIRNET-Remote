# Changelog

All notable project changes will be documented in this file. The project follows Keep-a-Changelog-style sections and Semantic Versioning for application releases.

## [Unreleased]

### Changed — 2026-10-12 Placement ghost Gizmo

- Reuse the single Component Transform Gizmo for ghost X/Z/XZ/Y transforms before placement. Anchored drafts stay outside graph/history; handle clicks cannot accidentally place a model or open Component Info.
- Ghost Delete/right click/Escape cancel; pointer capture guards include foreign pointercancel. Commit the entire position/rotation through one placement command and Undo/Redo step.
- Draft Breadboard snap/docking/anti-overlap uses its rotation, respects constrained X/Z and resolves rotation from the original gesture pose. Existing graph schema, model gestures, camera, drawers and instruments remain.
- Frontend200/200, Python97/97 and production build pass; details and browser evidence: `verification/2026-10-12-placement-ghost-gizmo.md`.

### Changed — 2026-10-12 Supply / Generator launchers

- Remove only the sidebar Delete button; retain Delete/Backspace, gizmo and selection deletion. Add distinct Power Supply/Function Generator icons and launchers that preserve editing state.
- Add600×510 Supply GUI bound to selected canonical graph properties with existing validation/history. Display local V/A settings, unknown W and explicit NO SUPPLY SELECTED; no telemetry or parallel setpoint state.
- Redesign760×530 Generator with two local configuration previews, shared artwork controls/colors, encoder/output visuals and channel focus. Retain legacy CH1 fields and add independent channel2 configuration. Hardware/DDS controls stay disabled.
- Frontend191/191, Python97/97 and production build pass; browser evidence/files: `verification/2026-10-12-supply-generator-launchers.md`.

### Changed — 2026-10-12 Instrument GUI

- Redesign Oscilloscope with a large empty display, seven dials, Horizontal/Trigger/Vertical groups and front-panel keys; share unchanged CH1 yellow/CH2 cyan colors and control labels with the 3D model.
- Redesign Signal Monitor with channel list, division grid/time markers, capture/trigger status, control bar and unknown measurements. Controls remain disabled and no acquired waveforms or samples are invented.
- Increase default Scope/Monitor sizes to760×530/720×500; use scoped responsive styles within the existing floating-window manager. Other window logic and graph/instrument stores remain unchanged.
- Actual-SFC/store regressions and browser checks pass. Frontend185/185, Python97/97 and production build pass; evidence: `verification/2026-10-12-instrument-gui.md`.

### Changed — 2026-10-11 Fixed drawer dimensions

- Remove manual Components/Tools resizing, separator handles, pointer/keyboard handlers, resize state/actions/limits, helper and obsolete tests/CSS. Keep Components at96 px and Tools at66 px (54 px at workbench width560 px or less).
- Preserve mounted overlay transforms, edge toggles, safe areas, floating windows and viewport/camera/graph behavior. Simplify motion occupancy to collapse/reduced-motion handling; use fixed ribbon height for gizmo toggle clearance.
- Add responsive/safe-area and reduced-motion regressions. Frontend181/181, production build and Python97/97 pass. Current evidence: `verification/2026-10-11-fixed-drawers.md`.

### Changed — 2026-10-11 Smooth overlay drawers (historical resizing behavior)

- Replace flex panel dimension switches with mounted absolute overlay drawers using200 ms translate3d transitions. Menu motion retains full canvas/buffer dimensions and camera projection, with no canvas observer/resize pipeline activity.
- Preserve icon styling, edge toggles, resize handles/preferences and tool/graph state. Add derived safe insets for floating/contextual UI, retained drawer obstacles and stable toggle corridors for gizmo clearance.
- Handle rapid/same-frame reversals, reduced motion, manual resizing and hidden inert opener focus. Seven regressions added; final frontend185/185, production build and full Python97/97 pass. Evidence: `verification/2026-10-11-overlay-drawers.md`.

### Changed — 2026-10-11 Panel resize performance (historical)

- Replace ribbon/sidebar width/height animations with one layout update and opacity-only content reveal; preserve expanded sizes, complete collapse, edge toggles and resizing.
- Coalesce and deduplicate observer sizes, UI viewport/window updates and palette anchoring. Skip unchanged camera projections and WebGL buffer allocations; allocate changed buffers immediately before their redraw to avoid an intermediate empty frame.
- Cache gizmo obstacle measurements until layout/window/selected-component content changes, prepare them before rendering and skip unchanged orientation-axis updates. Graph, camera pose/zoom, icons, models, wires and simulation controls retain their existing contracts.
- Verified frontend178/178, full Python97/97 and production build; native44-component/20-wire fixture reduces individual toggle allocations from11–15 to1. Evidence: `verification/2026-10-11-panel-resize-performance.md`.

### Added / Changed — 2026-10-11 Collapsible and resizable panels

- Component ribbon and tools sidebar fully collapse to zero height/width with floating top/left edge buttons; their headers, backgrounds, borders and content leave no layout strip.
- Bottom/right resize handles support captured dragging and keyboard arrows/Home/End with minimum/maximum dimensions. Responsive limits preserve saved expanded sizes across collapse/reopen and smaller viewports.
- Ribbon collapse closes the palette. Native Enter/Space, expanded/controls labels and visible focus return work in both states; tool lists scroll at short heights. Existing resize handling updates renderer/camera aspect and window bounds, cancels transient gestures and retains camera pose/zoom, graph/history and simulation state. Component palettes remain above the widened Tools rail.

### Added / Changed — 2026-10-11 Zoom To Area

- Added Zoom To Area immediately right of Zoom To View Entire Circuit: temporary crosshair/rectangle selection, depth-aware camera framing, retained heading/aspect and a new 100% reference compatible with toolbar/wheel zoom.
- Escape, right click (including a mouse-button chord), toggle, tool/placement/graph changes, resize, visibility/context loss and capture cancellation release the gesture without editing circuit/history. Tiny rectangles allow another attempt; keyboard focus navigation remains available.
- Reduced Zoom In, Zoom Out and Zoom To View Entire Circuit tooltips to their exact names.

### Added — 2026-10-10 L1571979 Function Generator 2 CH

- Added the reference-based silver/charcoal bench model with owl/net*CIRCUIT branding, two channel parameter/waveform panels, six screen keys, 3×3 function keypad, illuminated channel keys, centered encoder/LED arc, arrow keys, three colored BNCs, round power key and inclined bail stand.
- Instruments now places the visual-only Generator through the existing graph, Move/Rotate/gizmo and Undo-Redo lifecycle. Screen values/waveforms are illustrative; no DDS output or electrical ports are fabricated.
- Shared source geometry/artwork export GLB/glTF/bin/PNG/SVG. Budget: 18,386 triangles, 86 meshes, 1,481,888-byte GLB. Named control and screen/CanvasTexture integration notes are in source and the model README.
- Verified 102/102 frontend tests, production TypeScript, GLTFLoader round trips and browser GLB/CanvasTexture/placement/Move/Rotate/Y-gizmo/Undo-Redo checks.

### Changed — 2026-10-10 Oscilloscope reference refinement

- Refined the existing Oscilloscope factory against the supplied design: cool silver powder-coated enclosure, charcoal front, wide left display and stacked Horizontal/Trigger/Vertical controls.
- Added Default, Trigger Menu, power button/LED and Trig Out; the three BNCs share one row. Two inclined rectangular front stands replace the four cylinder feet.
- Preserved the root name, `[6,3.8,2.8]` size, Y-up/front +Z, seven centered knob pivots, independent CanvasTexture screen and visual-only graph/gizmo/Undo-Redo contract.
- Shared front coordinates now drive geometry, printed artwork and SVG export. Regenerated GLB/glTF/bin/PNG/SVG assets; the asset viewer provides reference front and angled views.
- Verified 97/97 frontend tests, production TypeScript checks, GLTFLoader round trips and native WebGL/CanvasTexture/Move/Rotate/Y-gizmo/Undo-Redo checks. Vite bundling retains sandbox `EPERM`; Python checks remain 16/17 due to the missing original `power_supply.svg`.

### Added — 2026-10-10 Two-channel Oscilloscope model

- Added an original graphite bench Oscilloscope with owl/net*CIRCUIT branding, illustrative yellow/cyan waveform screen, Horizontal/Trigger/independent Vertical controls, seven centered knob pivots, named buttons and exactly two BNC connectors.
- Instruments now places the Oscilloscope model through the existing graph, selection, Move/gizmo and Undo/Redo lifecycle. The Scope tool retains the acquisition window shell; the model creates no fabricated electrical ports or acquisition ratings.
- Committed self-contained GLB and glTF/bin/PNG assets, a reproducible exporter using shared geometry/artwork, and a development GLB/CanvasTexture viewer. Coordinate/export notes are in `apps/web/public/models/oscilloscope-2ch/README.md`; control integration notes are inline in source.
- Verified: 96/96 frontend tests, TypeScript checks, direct WebGL GLB loading/CanvasTexture replacement, native Move/Select/Undo/Y-gizmo gestures and context/diff checks. Vite production bundling remains blocked by sandbox `EPERM`; the Python provenance test retains its pre-existing missing `power_supply.svg` failure (16/17 pass).

### Changed — 2026-10-09 Ribbon, gizmo and upright Power Supply

- Removed ribbon Info rows; palettes follow the clicked family and clamp/update on resize/scroll. Embedded/Controller stays on one line.
- Strengthened X/Z/free/Y tool colors, strokes and backing. Y grip follows live object rotation; world movement constraints, cancellation, one Undo and Move-only body dragging remain.
- Added selected-model projection/viewport clearance using cached unposed geometry bounds.
- Replaced the supply with an upright metallic case, portrait V/A/W unknown/OFF screen, two Voltage/Ampe knobs, two recessed Vcc/Gnd sockets and an I/O switch; no USB or electrical ports. Canonical visual size and original SVG preview match the new model.
- Frontend tests 82/82 PASS, including rotating/pickable Y grip, tall/small-canvas clearance and open socket depth. See `verification/2026-10-09-ribbon-gizmo-supply-browser.md` for exact native browser/static/build evidence and limitations.

### Changed — 2026-10-09 Component Transform Gizmo

- Replaced Perspective/tool-title overlays with defined status-bar-right Zoom In/Out, Zoom To View Entire Circuit and Workspace Object Snap.
- Added adjacent X/Z/free/Y handles, hover/live wire/pose preview, stable active pixel scale, neighbor/window avoidance, captured cancellation and one Undo; body dragging stays Move-only.
- Fit now frames actual model/wire bounds. Arbitrary-angle breadboard snap uses conservative rotated footprints.
- Added original bench supply enclosure/panel/knobs/vents/terminals with unknown/OFF display and zero electrical ports.
- Final npm 79/79 and UTF-8 frontend/docs/context 17/17 PASS; native WebGL/gesture/responsive evidence recorded. Production bundle remains unverified under sandbox EPERM/prior elevation decline.

### Changed — 2026-10-09 Technical Workbench refinement

- Selection border now uses 2 CSS pixels, Medium Gold #d4af37 and camera-dependent housing contours.
- Breadboards have perforated deck/decal and real instanced socket cavities with tapered entrances/walls/floors. Shared keys have clearance; inward bevels prevent straight docking-edge overlap.
- Component Info is visible only for an existing selected model; artwork stays within its frame. Removed canvas WORKSPACE/project caption.
- Adaptive technical grid replaces uniform GridHelper with dark minors, majors every five cells, distance fade and zoom/derivative minor suppression.
- Final npm tests 68/68 PASS; WebGL/desktop verification and build sandbox limitation recorded in `verification/2026-10-09-technical-workbench-browser.md`.

### Changed — 2026-10-09 Selection contours and Component Info

- Replaced the thick emissive box cage with a subtle yellow shape contour; body colors stay unchanged. Curved model silhouette edges follow the camera within the existing render lifecycle.
- Rebuilt breadboard housing with beveled joints and recessed channels, retaining 830/630/100 visual contact instances and docking dimensions. Reduced excessive scene illumination so housing details remain readable.
- Replaced the selected-component action card and metadata-heavy Info window with one upper-right introduction panel using supplied artwork and Add +. Automatic opening preserves canvas focus/capture; Add arms placement and closing returns canvas focus. Unsupported entries cannot add a model.
- Added regression coverage for contours/materials/pose/disposal, real channel geometry, curved silhouette, unobstructed resistor contours and passive Info opening. Fixed the introduction fallback for supported Board models. Final npm tests 62/62 PASS; browser verified Add/Move/Undo/Select and four desktop sizes. Final bundling remains unverified because Vite realpath was blocked by the sandbox after build elevation was declined; an earlier build passed. Details: `SOURCE_ANALYSIS_SELECTION_AND_COMPONENT_INFO.md` and `verification/2026-10-09-component-information-browser.md`.

### Changed — 2026-10-09 Move-only model dragging

- Per the latest user request, only Move permits direct dragging of breadboards and other models. Select selects without moving geometry/camera or recording history.
- Updated workspace hints/cursor and current docs. Regression tests cover Select on breadboard/LED, Move drag/Undo and cancellation when switching to Select; npm 54/54 and production build PASS. Native browser confirms Select cannot drag and Move can; see `verification/2026-10-09-move-tool-browser.md`.

### Fixed — 2026-10-09 Workspace navigation (earlier behavior)

- Initially enabled left-drag model movement in Select; superseded by the Move-only rule above. Empty-surface left drag pans freely on XZ without circuit history changes.
- XYZ directions follow camera orbit through inverse-quaternion projection. Six adjacent accessible orbit/pan buttons replace the View controls box; directional pan follows camera heading.
- Added pointer capture/4 px drag threshold, single move commit and cancellation/hidden-context cleanup. Model elevation/rotation and logical connections are preserved.
- Fixed visible-model dragging at low camera angles using the picked surface's horizontal interaction plane. Passive gizmo regions let mouse gestures reach the canvas.
- Added real editor/graph/camera regression tests, genuine right-button OrbitControls pointer integration, source analysis and browser evidence. Verification details are recorded in DEV_LOG.

### Implemented — 2026-10-09 Interactive Circuit Workspace

- Added canonical functional catalog and verified browser snapshot for 17 placeable models; supplied icons and Single Workspace architecture retained.
- Added Three.js lights/models/labels/port anchors/logical wires/picking, orbit/pan/snap/zoom/reset and context/visibility/resize lifecycle.
- Added graph-backed placement, selection, move preview/commit/cancel, rotation, cascade delete, wire/unwire and bounded Undo/Redo. Import checks unique IDs, references, geometry and local memory images; unknown types/ports are retained.
- Added selected-component Inspector, keyboard edit/wiring equivalents and local Memory Hex Editor with validated Apply/Load/Save, instance isolation and history.
- Documented optional numeric editor rotation within graph schema 1.0 and a separate memory image 1.0 contract. Structural visuals have no ports; arithmetic has no fabricated part number; physical pinouts/power and execution are not inferred.
- Fixed final-review GPU instance-buffer disposal and Escape across ribbon/port focus. Ghost models are reused during placement motion.
- Extended frontend CI paths/provenance/behavior checks. Exact verification and browser evidence are in DEV_LOG.

### Implemented — 2026-10-09 Single Workspace shell

- Replaced App's page shell with SingleWorkspaceShell. Legacy/unknown URLs redirect to `/`; deleted seven routed pages and five legacy sidebar/workspace/dock components.
- Added New/Open/Save/Undo/Redo with local schema v1 JSON, structural/size guards, independent bounded history and stale validation invalidation. Large exports use compact JSON when pretty-printing would exceed the import limit; failed exports do not mark the project saved.
- Added twelve component families using supplied artwork, seven shared tool modes, dominant Three.js grid, contextual zoom/reset controls and simulation/status/count/connection presentation.
- Added six shared floating shells with dragging, bounded reflow, z-order, explicit activation, arrow-key movement, Escape and stable ribbon focus restoration.
- Preserved typed API, WebSocket reconnect and all six store boundaries. Inspector provides real station discovery, graph validation and bounded event console.
- Generated seventeen provenance-checked SVG thumbnails: 101,749,162 source bytes → 43,482 output bytes. Canonical device-library snapshots supply available metadata.
- Added state/file/router/scene regression tests and updated frontend CI triggers/boundary checks. Exact verification is recorded in DEV_LOG; placement, execution, acquisition and memory models remain later phases.

### Changed — 2026-10-09 Single Workspace architecture

- Approved a frontend redesign from the previous six-page Web shell to a **Single Workspace** virtual-electronics workbench.
- `/` is now the target entry point for the laboratory workspace; Dashboard / Circuits / Stations / Experiments / Settings are superseded as user-facing navigation concepts.
- Approved the target UI composition: app/file bar, top component ribbon, left interaction tool rail, dominant central Three.js workspace, contextual viewport controls, bottom simulation status bar and floating tool/instrument windows.
- Approved floating Oscilloscope, Function Generator, Signal Monitor/Logic Analyzer, Component/IC Info, Inspector and Memory Hex Editor concepts.
- Updated AI instructions so future implementation follows the supplied reference images and CRUMB-like workflow inspiration without copying proprietary source/assets pixel-for-pixel.
- Reopened the frontend shell work as `single-workspace-ui-migration`; existing typed API, WebSocket and Pinia boundaries are intended to be reused.
- Marked the previous Web Foundation multi-page design/spec as **SUPERSEDED**.

### Notes

- The initial 2026-10-09 architecture update was documentation-only; the subsequent source migration is implemented as recorded above.
- Exact SDRAM, routing IC, ADC, DAC and FPGA pin mappings remain intentionally unselected.

### Historical — Phase 1 Web Foundation (superseded UI shell, reusable infrastructure retained)

The following items were implemented on 2026-10-08 and remain useful engineering history. The page/layout decisions are superseded; transport/state/test infrastructure may be reused.

- Six routed pages and the old desktop Laboratory layout.
- Six separate Pinia stores.
- Typed API client/domain services, structured validation outcomes and explicit simulation/hardware status adapter.
- Resilient event WebSocket with capped exponential reconnect, station rediscovery and lifecycle cleanup.
- Session-only circuit drafts and backend-driven station discovery/graph validation.
- Frontend runtime tests with TypeScript checking; CI uses locked dependency installation, tests, build and source boundary checks.

### Initial Scaffold

- Approved architecture baseline for Web-first development.
- Modular monorepo design.
- Raspberry Pi 5 / Vue / FastAPI / Hardware Service technology baseline.
- EP4CE6 Experiment Controller prototype direction.
- EP4CE10E22C8N + 64 MB 16-bit SDR SDRAM V1 direction.
- Hardware Station and Circuit Graph abstractions.
- AI context-drift prevention documentation workflow.
- Added Vue/Vite frontend shell and explicit Three.js workspace boundary.
- Added FastAPI application backend shell with health/station/circuit-validation endpoints.
- Added Hardware Station abstraction with Virtual/Physical implementations.
- Added starter circuit simulator and 74HC08 functional model.
- Added FPGA directory structure and compile-safe placeholder top module.
- Added Nginx/systemd/Raspberry Pi deployment templates.
- Added GitHub Actions starter workflows and integration/context checks.
- Hardened the Physical Hardware adapter so it delegates to a real driver and never fabricates successful physical operations.

### Fixed

- Reject malformed station states and preserve the selected mode when a target changes its reported mode.
- Prevent stale discovery and circuit validation responses from replacing newer state.
- Wrap long circuit names in the legacy Inspector; run context subprocess checks with the current Python executable on Windows and Linux.
- Fixed frontend TypeScript CI build configuration by adding Node.js type definitions and the `ESNext.Disposable` library required by current Vite/Rollup declarations.
