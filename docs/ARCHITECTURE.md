# net*CIRCUIT Remote Architecture

## 1. System goal

net*CIRCUIT Remote is a remote laboratory for digital electronics. Users construct experiments in a Web workspace, validate them in software, run them through a Virtual Hardware Station during early development, and later execute the same model on real logic ICs routed and measured by FPGA hardware.

## 2. Top-level architecture

```text
User Browser
    |
    | HTTPS / REST / WebSocket
    v
Nginx on Raspberry Pi 5
    |----------------------> Vue static frontend
    |
    `--> FastAPI Application Server
              |
              | gRPC / local contract
              v
        Hardware Service
              |
        HardwareStation API
          /                    v             v
VirtualStation   PhysicalStation
(simulator)      (FPGA later)
                      |
                      v
           EP4CE6 prototype / EP4CE10 V1
                      |
                 Routing Fabric
                      |
              Real logic IC hardware
```

## 3. Responsibility boundaries

### Frontend

Owns the **Single Workspace** UI state, workspace interaction, Circuit Graph editing, component/tool selection, floating instrument windows, status presentation and waveform rendering. It **must not** know FPGA registers, chip-select details, raw MUX addresses, Linux device paths or physical switching sequences.

The user-facing application is not a dashboard-style multi-page site. `/` opens the workbench directly. The former Dashboard / Circuits / Stations / Experiments / Settings page model is superseded and must not be extended.


### Application Backend

Owns authentication/session boundaries, Circuit Graph validation, experiment lifecycle, resource locking, storage, WebSocket coordination and high-level policy.

### Hardware Service

Owns Hardware Station discovery, capability reporting, translation from validated logical requests to hardware operations, hardware safety transitions, transport drivers and physical/virtual adapter selection.

### FPGA

Owns deterministic and timing-critical behavior: routing apply sequences, experiment clock, trigger, capture, GPIO timing, Logic Analyzer, SDRAM access and later instrument datapaths.

## 3A. Single Workspace UI architecture

The approved frontend shell is a desktop-style virtual electronics workbench inspired by the supplied reference images and CRUMB-like workflows, while keeping original code/assets/visual identity.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ App bar: brand | New | Open | Save | Undo | Redo                   │
├─────────────────────────────────────────────────────────────────────┤
│ Component ribbon: Structure / Passive / Active / Output / Input /  │
│ Logic ICs / Arithmetic ICs / Memory / Display / Instruments / ...  │
├────────┬───────────────────────────────────────────────────┬────────┤
│        │                                                   │        │
│ Tool   │               Circuit Workspace                   │ Info   │
│ Rail   │       Three.js board / breadboard scene           │ window │
│        │                                                   │        │
├────────┴───────────────────────────────────────────────────┴────────┤
│ Execution / counts / status | right: Zoom In/Out/Fit/Object Snap     │
└─────────────────────────────────────────────────────────────────────┘
```

Primary tool rail:

```text
Select
Wire
Move
Rotate
Scope
Probe
Power Supply (window launcher)
Function Generator (window launcher)
```

Delete remains a canvas keyboard/gizmo/selection action and retained editor logic, with no sidebar button. The two new launchers call the existing UI window manager directly and do not select an editing mode.

Tools requiring a larger control surface open as floating windows over the workspace rather than routing to another page:

```text
Oscilloscope
Power Supply
Function Generator
Logic Analyzer / Signal Monitor
Component / IC Information
Properties / Inspector
Memory Hex Editor
Validation / execution status
```

The central workspace is the dominant visual area. Large permanent sidebars are avoided; information appears contextually through ribbon menus, overlays and floating windows.

### Frontend rendering layers

```text
HTML/CSS application chrome
        +
Three.js 3D circuit scene
        +
Canvas/SVG instrument plots
        +
optional scene labels
```

Electrical identity is never inferred from visual coordinates.

### Legacy UI migration

Phase 1 migration is implemented on 2026-10-09. `App.vue` renders only `SingleWorkspaceShell`; Vue Router only normalizes legacy/unknown addresses to `/`. All seven old page files and the five Library/Workspace/Inspector/Dock/LogicAnalyzer components were removed. Typed API clients, WebSocket and six stores remain reusable.

Current composition: `components/workbench/{AppTitleBar,ComponentRibbon,ToolRail,CircuitWorkspace3D,SimulationStatusBar}` and `components/windows/FloatingWindowManager`. Shared `FloatingWindow` owns drag, keyboard movement/Escape, activation/focus restoration and bounded workspace-relative placement for instruments, Inspector and Hex Editor. `ComponentInfoWindow` is the single anchored introduction panel at the upper right; it still uses the shared `ui.windows` open/z/activation state. Automatic selection opens it passively, preserving canvas focus and pointer capture; explicit ribbon Info activation focuses its header. `ui` owns ribbon/window state, `workspace` owns one active tool, and `circuit` owns local files, bounded project history and stale-validation guards. Validation and station selection live inside Inspector.

Phase 2: `three/SceneManager.ts` owns scene/camera/lights/grid/renderer, metadata-backed models, named port anchors, wire projections, ray picking and OrbitControls. `ComponentModel` owns procedural geometry/label textures and GPU disposal including instance buffers. Vue owns ResizeObserver, visibility/context/mount bridges; `useCircuitEditor` coordinates pointer capture, preview/cancel and command commit. Renders coalesce on demand; zero/hidden/lost-context scenes suspend; unmount releases frame/listener/control/GPU resources.

Current technical refinement: `BreadboardHousing` perforates deck/decal using shared `BreadboardSockets` coordinates; one InstancedMesh contains beveled socket entrances, walls and floors. Common keys have clearance and bevels remain inside nominal docking dimensions. `SelectionOutline` renders camera-dependent housing contours with LineSegments2/LineMaterial at 2 CSS pixels, Medium Gold #d4af37. Outlines follow model pose, ignore picking, retain body colors and dispose before replacement/removal. `TechnicalGrid` renders a derivative-filtered XZ plane with minor/major hierarchy, distance/focus fade and projected-pixel minor suppression in the existing RAF. Info only renders for a selected graph model; clearing/deleting selection closes it. Add + arms placement and the ordinary command commits graph/history. See `SOURCE_ANALYSIS_TECHNICAL_WORKBENCH.md`.

Navigation UX correction: only Move permits direct model dragging; Select selects without creating a move gesture or pointer capture. Empty-surface left-drag pans the XZ plane. Model motion uses a horizontal plane through the actual ray hit, retains elevation and commits once. Empty-surface pan translates camera and target by the world grab-anchor delta without editing graph/history. Right-button OrbitControls rotation updates `WorkspaceNavigator` through the same render callback: inverse camera quaternion projects the fixed world XYZ basis into SVG screen directions. Six adjacent accessible orbit/pan buttons replace the separate View controls box; button panning follows the camera's XZ heading. Passive gizmo regions pass pointer events to the canvas. See `SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md`.

`circuit` owns typed graph commands/history and rejects invalid changes before recording. Move previews geometry and commits once on release; delete cascades wires. `workspace` owns transient placement/selection/pending-port/snap state. Named IDs/functional ports define connectivity; no visual coordinate/hole/overlap does. Canonical functional catalog is `device-library/editor/components.json`, consumed through a verified generated snapshot. 74HC08 logical gates, generic arithmetic abstractions and memory do not imply confirmed package/electrical hardware mappings. The optional rotation field remains graph schema 1.0 compatible. Local memory images have a separate versioned byte contract; Hex Editor updates graph through history. Simulator execution/acquisition remain Phase 3+.

The supplied `assets/icon .svg` set currently has 20 files with large embedded PNG artwork. A reproducible script produces small SVG/WebP thumbnails with a provenance manifest and canonical starter metadata snapshots. Frontend imports remain inside `apps/web/src`; originals stay untouched. A separate standard-Python script synchronizes the functional editor catalog. Tests verify both pipelines.

The active Single Workspace UI specification is:

`docs/superpowers/specs/2026-10-09-single-workspace-ui-design.md`


## 4. Hardware Station abstraction

```text
HardwareStation
├── Experiment Controller
├── Instrument Controller
├── Routing Fabric
├── Breadboard[]
├── Logic IC Resources
└── Measurement Resources
```

Software must not assume that one Hardware Station always contains exactly one FPGA. V1 uses one FPGA architecture, but future Instrument logic may migrate to a second FPGA without changing the Browser-facing model.

## 5. Virtual vs physical execution

Both execution modes follow the same conceptual API: `get_capabilities`, `validate_configuration`, `apply_circuit`, `set_input`, `configure_clock`, `configure_generator`, `configure_trigger`, `arm_capture`, `run`, `stop`, `read_capture`, `safe_state`, and `reset`.

Virtual Hardware is the default development target before FPGA integration. Physical Hardware must never silently fall back to a simulated success state when FPGA hardware is unavailable.

## 6. Circuit Graph flow

```text
Browser Circuit Graph
    -> Backend parse
    -> logical validation
    -> electrical/resource validation
    -> acquire station lock
    -> generate routing plan
    -> Hardware Service
    -> safe state
    -> apply route
    -> configure input/clock/instrument
    -> arm
    -> run/capture
    -> stop
    -> read results
    -> release station
    -> Browser
```

## 7. Control plane and data plane

### Control plane

```text
Browser -> REST/WebSocket command -> FastAPI -> Hardware Service
        -> FPGA control registers -> routing / clock / trigger
```

### Data plane

```text
Real IC / ADC -> FPGA capture -> FIFO / SDRAM -> Hardware Service
              -> Application Backend -> WebSocket binary -> Browser
```

Bulk sample data should use binary transport when appropriate rather than JSON sample-by-sample.

## 8. FPGA development path

### Prototype

`EP4CE6E22C8N`, no external SDRAM. Scope is Experiment Controller bring-up only: clock/reset, device/version registers, communication interface, GPIO, safe-state FSM, basic routing control and basic experiment clock.

### Final V1

`EP4CE10E22C8N` + **64 MB SDR SDRAM, 16-bit**. V1 remains a single-FPGA architecture, with RTL separated into Experiment Control and Instrument domains.

```text
EP4CE10
├── Experiment Control Domain
│   ├── Routing Manager
│   ├── MUX/Crosspoint Control
│   ├── GPIO
│   ├── Experiment Clock
│   └── Safety FSM
└── Instrument Domain
    ├── Trigger
    ├── Logic Analyzer
    ├── Generator
    ├── Acquisition
    ├── Capture Buffer
    └── SDRAM Controller
```

An analog oscilloscope requires an external analog front-end and ADC. An analog/arbitrary waveform generator may require DAC and output analog circuitry.

## 9. Breadboard model

A physical contact is not automatically an independent routing channel.

```text
Physical Contact -> Electrical Node -> Routing Resource
                 -> MUX/Crosspoint -> FPGA-controlled Source/Destination
```

The initial target is at least two physical breadboards. Exact independent routing capacity remains subject to routing IC choice, FPGA I/O, topology, signal integrity and electrical constraints.

## 10. Fault behavior

```text
FAULT -> stop clock -> disable generator -> safe routing -> stop capture
      -> set error -> log -> release or quarantine station
```

Fault sources include timeout, invalid route, resource conflict, disconnect, protocol mismatch, capture overflow, SDRAM error or instrument failure.

## 11. Multi-user model

Concurrent Web users do not equal concurrent independent physical experiments. The application server manages sessions, queueing, reservations and ownership; concurrency of physical experiments is bounded by actual Hardware Stations/resources.

## 12. Web-first integration gate

FPGA integration begins only after milestone **W1 — Web Platform Ready for FPGA Integration**, defined in `ROADMAP.md`.

## Component transform and view ownership — 2026-10-09

`ComponentTransformGizmo` is scene-owned and never serialized. Raycast its explicit X/Z/free/Y handles before graph geometry; Move-only direct body dragging remains. The editor previews pose/endpoints/wires, unwraps Y angles, then commits one circuit command or restores graph geometry on cancel. Screen scale is refreshed during active movement; candidate positions avoid reusable neighbor snapshots and DOM window/navigation bounds. Arbitrary-angle breadboard snap uses conservative AABB extents. `PowerSupplyModel` owns the original visual case/panel/knobs/vents/terminals; no electrical ports or live measurements are invented.

View controls belong at Status Bar right: Zoom In/Out, fit entire model/wire bounds with viewing direction retained, and Workspace Object Snap (0.5 movement, 15-degree gizmo rotation). No Perspective or generic tool-title overlay. Scene resources stay outside Pinia and dispose with SceneManager. See `SOURCE_ANALYSIS_COMPONENT_TRANSFORM_GIZMO.md` for algorithms and verification limits.

Latest refinement: the ribbon palette owns DOM anchoring to its clicked family, with ResizeObserver/scroll recalculation and no per-entry Info rows. Labels remain single-line. Gizmo X/Z constraints stay world-aligned; a Y-only subgroup follows preview/committed model yaw, and its pick marker comes from the visible grip. Cached local visual bounds are projected through current pose/camera to avoid selected model controls without inflating arbitrary-yaw bounds; viewport margins keep handles usable. `PowerSupplyModel` now owns an upright two-knob/two-post metal visual with portrait V/A/W unknown/OFF texture, hollow binding posts and no USB. Canonical visual dimensions changed to [2.4, 2.8, 3.2]; electrical contracts/transport boundaries did not change. See `SOURCE_ANALYSIS_RIBBON_GIZMO_SUPPLY.md`.

## Stability and reconciliation refinement — 2026-10-10

SceneManager owns one target-relative dolly metric for wheel and toolbar zoom, reporting it to workspace state. Camera FOV/zoom and model scales stay fixed; Fit resets the reference distance. Controls require a positive viewport and an unsuspended/unlocked live scene. WireLayer reconciles endpoint-pair records, indexes incident edges and retains unrelated buffers/materials through previews. Same-type supply property commits reuse its existing in-place controls/display update. Model disposal collects unique owned geometry/material/texture resources, labels own their Sprite geometry and pending logo loads release their owner when disposed.

Circuit history remains session-snapshot based, bounded across both directions by 20 MB/50 entries with one oversized immediate snapshot. Validation transport controllers stay outside serializable Pinia state. Station event revisions and file/module/image revisions protect asynchronous completion order and teardown. API validation stays structural and follows canonical optional-field types; no electrical evaluator or hardware capability is invented. Details and measured limits: `SOURCE_ANALYSIS_STABILITY_AUDIT.md`.

## Area zoom ownership — 2026-10-11

Workspace owns the temporary `zoomAreaActive` flag; useCircuitEditor owns the captured rectangle and cancellation. SceneManager raycasts the center/boundary surfaces, retains viewing direction and computes perspective framing distance from camera-relative extents/depth. HTML/CSS draws the pointer-transparent rectangle. The frame resets the wheel/toolbar reference to 100% without serializing any camera/gesture resource or modifying Circuit Graph/history. Detailed formulas and regressions: `SOURCE_ANALYSIS_ZOOM_TO_AREA.md`.

## Collapsible workbench toolbars — 2026-10-11

The workbench region remains sized by the title/status shell. Its stage fills the region permanently; Components and Tools are absolute overlays that allocate no flex space. Only drawer/toggle transforms transition for200 ms. Both inner panels remain mounted, with inert/aria-hidden while closed and visibility hidden only after motion. `useDrawerMotion` owns temporary obstacle occupancy, reduced-motion listener and post-commit/end settlement; desired state stays in `ui`. This is not a second layout state or an animation frame loop. Same-frame reversals with no CSS transition settle after DOM commit. Manual drawer resizing has been removed: Components is fixed at96 px; Tools is66 px or54 px when workbench width is560 px or less.

`ui` retains session-only collapse flags and derives fixed/responsive overlay dimensions and insets; no manual dimension preferences or resize actions remain. Insets bound floating windows on expansion or genuine dimension changes, without rewriting `viewport`; closing does not move an instrument. Shell CSS variables keep contextual chrome outside open drawers. CircuitWorkspace3D caches DOM obstacles only when invalidated and reserves full swept corridors for drawers/edge buttons, using the fixed96 px ribbon height for the Tools toggle corridor. One local attribute observer releases an occupied drawer after its slide; it never resizes the canvas. Hidden inert openers return focus to the persistent outer toggle.

`frameTasks.ts` and SceneManager remain unchanged in the drawer refinement: observer contentRect coalesces per RAF and deduplicates actual viewport changes; buffer allocation is followed by drawing in the same scheduled frame. Menu animation triggers neither observer nor camera/buffer resize. No scene resources enter Pinia and no Circuit Graph operation is introduced. Details/evidence: `SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md`, `verification/2026-10-11-overlay-drawers.md`.

## Instrument presentation ownership — 2026-10-12

OscilloscopeWindow and SignalMonitorWindow own scoped responsive CSS and lightweight empty SVG grids. InstrumentDial is a static disabled visual control, without acquisition handlers, timers or render loops. `data/instrumentVisuals.ts` contains presentation-only scope colors/sections/control labels; OscilloscopeArtwork/Model consume the same values without geometry or behavior changes. Existing instrument state supplies configuration labels and configured channel names only. Both channels still read the existing shared scale; separate acquisition/channel contracts have not been invented. Unavailable positions/levels/source and all measurements are unknown.

Window definitions provide760×530 Scope and720×500 Monitor defaults. Existing FloatingWindow/manager and UI store continue owning clamp/drag/focus/scroll and drawer safe areas; no new manager or duplicated window state is introduced. SVG grid height follows channel rows, aligning36 px rows with guides without generating digital trace values. Time markers indicate configured divisions, not measured timestamps. Browser/SSR verification and changed files: `verification/2026-10-12-instrument-gui.md`.

PowerSupplyWindow600×510 derives selection and all setpoints directly from CircuitStore/workspace selection. Native change events call the existing validated property/history command; no instrument supply state or async adapter exists. Shared supply getters/limits keep GUI and model consistent. Display V/A are local setpoints, W is unknown; OFF retains configuration and an absent/non-supply selection disables controls. Visual Vcc/Gnd remain non-electrical.

Generator760×530 consumes GENERATOR_LAYOUT/colors/theme/parameter labels from FunctionGeneratorArtwork; model geometry and generated assets remain unchanged. Existing flat instrument.generator fields remain CH1 configuration; nested channel2 is independent local configuration, preserving legacy readers. Window-local channel focus creates no output/editor state. Static normalized SVG shapes are explicitly schematic previews, never samples; all function/encoder/output/power controls remain disabled. Current tests/browser/files: `verification/2026-10-12-supply-generator-launchers.md`.
