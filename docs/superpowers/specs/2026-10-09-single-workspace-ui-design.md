# Single Workspace UI Architecture Design

**Project:** net*CIRCUIT Remote  
**Date:** 2026-10-09  
**Status:** APPROVED  
**Replaces:** [the archived Web Foundation design](../../archive/legacy-v1/2026-10-08-web-foundation-design.md) for user-facing UI architecture (originally `docs/superpowers/specs/2026-10-08-web-foundation-design.md`)

**Phase 1 implementation:** shell migration implemented on 2026-10-09. See `docs/DEV_LOG.md` and `docs/verification/2026-10-09-single-workspace-browser.md` for current verification evidence. The broader editor/simulator vision below remains the roadmap.

**Phase 2 implementation:** interactive metadata-backed scene/graph editing and local memory image editor are implemented on 2026-10-09. Current boundaries are in `2026-10-09-interactive-workspace-design.md`, source analysis and DEV_LOG. Simulation/execution/capture remain later work.

**Latest technical UI refinement:** Component Info is one upper-right introduction/Add panel, visible only for an existing selected model; supplied artwork is contained without transform. The selection action card and canvas WORKSPACE/project caption are removed. A 2 CSS px Medium Gold contour follows selected/moving housing. Breadboards have real socket cavities, matched openings and joint/bevel clearance. The technical grid has dark minors, majors every five cells, distance fade and zoom-based detail suppression. Direct dragging requires Move. This supersedes older selection-window descriptions below; see `docs/SOURCE_ANALYSIS_TECHNICAL_WORKBENCH.md`.

Implementation notes: use the user's exact twelve ribbon groups (Structure through Notation, without an extra Interaction group); retain Vue Router only for address compatibility, with App rendering its shell directly. Local JSON/project history provides the five file actions, with a shared 2 MB round-trip limit. Shared windows restore focus to stable ribbon controls and focus on repeated activation. Supplied embedded-raster SVGs are preserved and consumed through small provenance-checked SVG derivatives. Three.js lifecycle currently renders a disposable visual grid; placement, wiring, acquisition/output and memory editing remain future integrations.

## 1. Intent

net*CIRCUIT Remote must feel like a **virtual electronics workbench**, not a conventional website.

The user should remain inside one laboratory workspace while:

- placing boards and components;
- wiring circuits;
- configuring inputs;
- observing outputs;
- opening instruments;
- editing memory;
- running/stopping simulation;
- later switching the same logical experiment between Virtual and Physical Hardware.

The interaction direction is based on the five supplied reference images and CRUMB-like electronics-workbench workflows.

The project must not copy proprietary source code, logos, branding, icons or visual assets pixel-for-pixel.

## 2. Why the previous UI is superseded

The current source has:

```text
Dashboard
Laboratory
Circuits
Stations
Experiments
Settings
```

and a Laboratory page with:

```text
Component Library | Lab Workspace | Properties Inspector
             + bottom Instrument Dock
```

That structure fragments a continuous electronics task into website pages and permanently consumes workspace area with side panels.

The approved design replaces it with one workbench.

## 3. Target screen composition

```text
┌──────────────────────────────────────────────────────────────────────┐
│ net*CIRCUIT Remote | New | Open | Save | Undo | Redo                 │
├──────────────────────────────────────────────────────────────────────┤
│ Component Ribbon                                                     │
│ Interaction | Structure | Passive | Active | Output | Input |        │
│ Logic ICs | Arithmetic ICs | Memory | Display | Instruments | ...    │
├────────┬────────────────────────────────────────────────────┬────────┤
│ Tool   │                                                    │ View   │
│ Rail   │             3D Circuit Workspace                   │ opts   │
│        │                                                    │        │
│ Select │ board / breadboard / IC / passive / wires / LEDs   │        │
│ Wire   │                                                    │        │
│ Move   │                                                    │        │
│ Rotate │                                                    │        │
│ Delete │                                                    │        │
│ Scope  │                                                    │        │
│ Probe  │                                                    │        │
├────────┴────────────────────────────────────────────────────┴────────┤
│ ▶ Simulation | state | frequency | step | components | wires        │
└──────────────────────────────────────────────────────────────────────┘
```

## 4. Reference-image interpretation

### Reference 1

Key concepts:

- dark desktop-style application chrome;
- top component categories;
- left interaction rail;
- large angled breadboard scene;
- minimal right-side view options;
- floating Oscilloscope covering only part of workspace;
- bottom simulation/status strip.

### Reference 2

Adds:

- floating Function Generator;
- waveform preview and generator controls;
- instrument remains visible while the breadboard stays interactable.

### Reference 3

Shows:

- sequential circuit/shift register example;
- oscilloscope with fewer channels;
- instrument window adapts to experiment instead of forcing a fixed dock layout.

### Reference 4

Shows:

- contextual IC information window;
- memory Hex Editor window;
- detailed tools are invoked as independent floating windows, not separate routes.

### Reference 5

Shows:

- dense computer-like circuit;
- LCD/display component;
- Signal Monitor with multiple digital traces;
- workspace can contain complex assemblies while monitoring remains an overlay.

## 5. Application bar

Top application bar contains the product identity and project actions.

Initial actions:

```text
New
Open
Save
Undo
Redo
```

Possible later actions may include export/import or project metadata, but they must not turn into separate full-page settings screens.

Browser applications should not fake OS minimize/maximize/close buttons unless the project is later wrapped as a desktop/PWA shell where those controls are real.

## 6. Component ribbon

The component ribbon replaces the permanent Component Library sidebar.

Suggested groups:

```text
Interaction
Structure / Breadboard
Passive
Active
Output
Input
Logic ICs
Arithmetic ICs
Memory
Display
Embedded / Controller
Instruments
Notation
```

A group may open a compact dropdown/popup palette.

Component definitions must come from metadata/device-library structures where possible.

Do not encode electrical behavior only in visual Vue components.

## 7. Left tool rail

Primary interaction modes:

```text
Select
Wire
Move
Rotate
Delete
Probe
Scope
```

Rules:

- exactly one primary interaction mode is active at a time unless a mode is explicitly temporary;
- keyboard shortcuts may be added later;
- selected tool state lives in `workspace.ts`;
- tool state must not mutate electrical Circuit Graph until a completed user action occurs.

## 8. Central Three.js workspace

The workspace is the dominant screen region.

Responsibilities:

- render board/breadboard;
- render component representations;
- selection/picking;
- drag placement;
- movement/rotation;
- wire anchoring;
- camera zoom/pan/orbit;
- hover/selection feedback;
- labels where useful.

Do not use 3D position as an electrical node identifier.

Recommended architecture:

```text
VisualObject
  visual_id
  transform
  model/mesh

LogicalComponent
  component_id
  device_type
  pins

ElectricalNode
  node_id

CircuitGraph
  modules[]
  connections[]
```

## 9. Wires

Wires need both:

```text
visual geometry
logical connection
```

The visual path may change without changing the logical connection.

The logical endpoints are device/pin/node IDs, not Three.js vertex indices.

## 10. Floating window system

Create one shared floating-window framework instead of custom drag logic for every instrument.

Required behavior:

- open/close;
- bring-to-front;
- drag;
- bounded movement;
- later resize;
- optional minimize;
- initial sensible position;
- prevent windows from becoming irretrievably off-screen.

Suggested state:

```text
window_id
type
open
x
y
width
height
z_index
minimized
payload/context
```

## 11. Instrument windows

### Oscilloscope

Simulation-first shell supports:

- channels;
- volts/div-like presentation;
- time/div;
- run/acquire;
- trigger controls;
- waveform grid.

Physical analog behavior is not claimed until ADC/AFE exists.

### Function Generator

Simulation-first shell may support:

```text
sine
square
triangle
pulse
frequency
amplitude
offset
duty cycle
output enabled
```

Physical analog output later requires DAC/AFE.

### Signal Monitor / Logic Analyzer

Supports digital channels and timing traces.

### Component / IC Information

Shows metadata, pin names, description and constraints from project data. Do not invent datasheet values.

### Memory Hex Editor

Used only for device models that expose editable memory.

The editor must modify simulator/device memory through a defined model interface rather than directly manipulating arbitrary UI state.

## 12. Inspector

A permanent right-side Inspector is not required.

Component details may appear as:

- compact contextual overlay;
- floating Inspector;
- property window near the selected component.

The workspace should remain the dominant surface.

## 13. Status bar

Bottom status strip may show:

```text
Run / Stop
Simulation Running / Stopped
execution mode
frequency
time step
component count
wire count
connection state
fault indicator
```

Do not display fabricated hardware measurements.

## 14. Routing policy

Target route policy:

```text
/ -> SingleWorkspace
```

Recommended migration choice:

- keep Vue Router temporarily if it reduces migration risk;
- route `/` to the Single Workspace;
- redirect legacy paths to `/`;
- remove user-facing navigation;
- delete legacy page components only after tests prove nothing depends on them.

Vue Router may later be removed if it has no remaining responsibility.

## 15. Reusable current code

Prefer reuse of:

```text
stores/circuit.ts
stores/workspace.ts
stores/station.ts
stores/experiment.ts
stores/instrument.ts
stores/ui.ts

services/api/*
services/websocket/*
types/*
```

Refactor state fields where the old panel/page model no longer applies, but do not rewrite working transport logic without need.

## 16. Suggested component structure

```text
src/
├── App.vue
├── components/
│   ├── workbench/
│   │   ├── AppTitleBar.vue
│   │   ├── ComponentRibbon.vue
│   │   ├── RibbonGroup.vue
│   │   ├── ToolRail.vue
│   │   ├── CircuitWorkspace3D.vue
│   │   ├── ViewportControls.vue
│   │   └── SimulationStatusBar.vue
│   └── windows/
│       ├── FloatingWindow.vue
│       ├── FloatingWindowManager.vue
│       ├── OscilloscopeWindow.vue
│       ├── FunctionGeneratorWindow.vue
│       ├── SignalMonitorWindow.vue
│       ├── ComponentInfoWindow.vue
│       ├── InspectorWindow.vue
│       └── HexEditorWindow.vue
├── composables/
├── data/
├── services/
├── stores/
└── types/
```

Names may be adjusted to existing conventions, but responsibilities should remain separated.

## 17. Visual direction

Use the references as direction for:

- dark technical desktop-app atmosphere;
- dense but legible controls;
- electronics-focused visuals;
- blue/graphite work surface;
- high-contrast signal colors;
- realistic but performant 3D components;
- compact typography;
- subtle borders/shadows;
- instrument-like windows.

Avoid:

- marketing landing-page aesthetics;
- oversized cards;
- excessive whitespace;
- excessive gradients;
- glassmorphism everywhere;
- decorative animation that slows circuit editing;
- pixel-perfect copying of another product.

## 18. Performance

The UI must remain responsive with increasingly complex circuits.

Guidelines:

- avoid recreating Three.js scene graph on every Vue reactive update;
- use explicit scene managers/adapters;
- dispose geometries/materials/textures;
- use instancing where repeated geometry is large enough to benefit;
- keep waveform rendering isolated from Vue DOM updates;
- throttle expensive hover/picking operations where necessary;
- avoid storing raw Three.js objects in serialized Circuit Graph state.

## 19. Accessibility and usability

Even though the app is visually dense:

- provide tooltips/labels;
- keyboard focus for non-canvas controls;
- visible active tool;
- do not rely only on color for state;
- dialogs/windows must be closable without a mouse where practical;
- destructive actions need undo and/or confirmation depending on scope.

## 20. Migration acceptance criteria

The shell migration is complete when:

```text
/ opens the workbench
no visible six-page navigation
component ribbon exists
tool rail exists
workspace dominates viewport
status bar exists
floating-window manager works
legacy routes no longer define the user workflow
typed APIs/stores still work
npm test PASS
npm run build PASS
frontend boundary tests PASS
browser checks PASS
docs updated
```

Full Phase 2 3D editing is not required merely to complete shell migration.

## 21. Non-goals of the shell migration

Do not implement yet unless explicitly included in the task:

- FPGA driver;
- SPI;
- SDRAM;
- physical routing;
- analog ADC/DAC;
- production Oscilloscope;
- production Generator;
- complete device library;
- SPICE simulation;
- multi-user scheduler.

## 22. Future hardware compatibility

The Single Workspace is still only the frontend.

It must communicate through logical contracts so the same UI can drive:

```text
VirtualHardwareStation
or
PhysicalHardwareStation
```

without exposing FPGA register/MUX details.

## Current transform/view refinement — 2026-10-09

Perspective and generic tool-title/hint overlays are removed. Status-bar right contains defined Zoom In/Out, Zoom To View Entire Circuit (model/wire bounds, preserve heading), and Workspace Object Snap. Selected models show adjacent X/Z/free-move/Y-rotation handles with hover, live preview, stable active pixel scale, neighboring-model/window avoidance and one Undo on release; no Delete/Confirm/Check. Direct body dragging remains Move-only. Snap is 0.5-unit movement and 15-degree gizmo rotation. The original bench Power Supply case/controls/vents have unknown/OFF display and zero electrical ports. This supersedes older view/reset descriptions above. Source/evidence: `docs/SOURCE_ANALYSIS_COMPONENT_TRANSFORM_GIZMO.md` and its dated browser report.
