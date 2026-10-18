# Contacts, deep insertion, continuous wires and Label implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development. The user supplied the complete approved design and explicitly requested implementation. Work in the existing clean checkout at `e41c260`; leave source uncommitted for the user.

**Goal:** Implement the SS12D10/contact/display/buzzer models, versioned deep breadboard insertion and continuous wire routing, independent capacitor menu entries, and a persistent visual-only Label.

**Architecture:** Extend the existing versioned catalogs, package builders, conductor paths and document commands. Keep canonical electrical contacts separate from inserted conductor tips. Labels use normal module pose/history and an optional visual board association; rendering remains a projection of the document.

**Tech Stack:** Vue/TypeScript/Three.js, Python contracts/FastAPI, JSON Schema/code generation, Node tests/pytest, Playwright Chromium.

**Spec:** `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/PROMPT_CODEX_Model_3D_SS12D10_Day_Dan_Label_netCircuit.md` and twelve supplied images.

## Global constraints

- Preserve `MM_TO_WORLD=.13/2.54`, topology/contact/node IDs, camera/FOV, Instrument materials and Lab-First safety/capability boundaries.
- Keep prior sealed packages and resistor body4.90×1.75 mm; do not restore Edit Lead/lift/tilt controls.
- Version package/profile changes and preserve historical descriptors. Existing files do not re-layout; explicit rebuild uses validation, rollback and one Undo.
- Use source physical/editor catalogs and generators, never edit generated snapshots independently.
- SS12D10 case12.7×6.8×6.4 mm, knob2.8×2×4 mm, travel±1.1; complete envelope H10.4 mm. Adapter contacts−5.08/0/+5.08 are CAD, not a verified native footprint.
- Tactile case3.4/total4.3; raised DIP4 case3.4/total4.4; display envelopes/glyphs and buzzer12.2×6.5 follow the spec exactly.
- New board mechanics: conductor insertion3.0 mm, cavity3.5 mm, floor clearance0.5 mm. Old pinned geometry retains its mechanics; new profiles opt in and declare a real lead budget.
- New wire insulationØ1.50/coreØ0.62, preferred radius2/minimum1 mm; preserve old custom appearance and meaningful manual points.
- LABEL has no ports/nets/mount. Typed properties contain version1, plain text≤256 Unicode characters/4 lines, font2–6 mm, colors, padding1 mm and optional visual boardId. Pose lives only in module.position/rotation.
- No commit, staging, push, merge or deployment.

## Review focus

- Unmarked legacy modules, historical package IDs and changed CAD identities must resolve to their original descriptor; revision ties cannot select a new preset accidentally.
- Deep metal must occupy only the selected cavity; moving/yawed boards, horizontal plastic crossings, wrong holes and insufficient exact leads retain negative validation.
- Short/manual wire routes must remain C1 and non-self-intersecting, or fail atomically without moving endpoints or deleting meaningful control points.
- Label Unicode, multiline input, association copy/delete, cancelled gestures and Undo must survive save/open/API without changing netlists or executability.
- Native renders must show real recesses/openings and measured heights; OFF/UNKNOWN segments and actuator animations must not invent electrical evidence.

## Task 1: Versioned catalogs, typed properties and visual execution

Owner: `catalog_labels`.

Files: source `device-library/editor/components.json`, `device-library/parts/physical-parts.json`; contract schemas/registry/property validation; generated outputs; Python domain/compiler/persistence tests. Coordinate shared schema/generator mutations with task3.

Interfaces: generate the SS12D10 contact-switch definition and family-specific package shapes for task2. Export shared LabelPropertiesV1 normalization/validation/defaults for task4; boardId is visual association only. New package insertion metadata consumes task3's versioned contract.

- [x] Write/run failing catalog and historical snapshot tests; Label text/line/color/version/portless/VISUAL and unchanged netlist/domain/API tests.
- [x] Implement new source definitions, corrected versioned package profiles, capacitor names/unhide, Label schema/validation and VISUAL backend dispatch.
- [x] Keep raised DIP4 as a distinct CAD identity, old exact descriptors byte-equivalent, and legacy unmarked resolution explicit.
- [x] Generate artifacts with repository scripts and pass focused catalog/contract/backend tests plus generation checks.

## Task 2: Contact, display and buzzer package builders

Owner: `contact_models`.

Files: new small switch/display/buzzer builders under `apps/web/src/three/package`; PackageFactory/PackageModel/appearance integrations, contact-state helper/composable and focused model/state tests. Root applies shared SceneManager/Workspace hooks.

Interfaces: consume task1's shape specification and task3's shared sections/feedthroughs. Expose actuator hit/press/release/cancel helpers; use existing contact-switch truth tables and graph transactions.

- [x] Write/run failing actual-mesh bounds, planar-normal, ray cavity, glyph-fit/round-DP, closed-feedthrough and state/resource tests.
- [x] Build SS12D10 real slot/folded case, tactile corrected total height/stamped legs, raised DIP4 actual recesses/markings, mm glyphs and blind buzzer mouth.
- [x] Keep historical shape branches, actual pin numbering, A6D pairs and tactile momentary behavior; update display base/emissive from actual OFF/ON/UNKNOWN evidence.
- [x] Pass focused geometry/state/thumbnail tests and send exact pointer integration hooks to root.

## Task 3: Board mechanics and a continuous conductor pipeline

Owner: `contact_mechanics`.

Files: versioned board mechanical contract/profile and Python mirror; BreadboardGeometrySpec/BreadboardSockets/housing; rigid/flexible lead paths and mounting; WireGeometry/WireTerminals/routing/appearance; parity fixtures/tests.

Interfaces: canonical contact remains unchanged. `updateMountedPackageInsertion(group,module,modules)` integrates mounted geometry after pose synchronization; final signature is coordinated with root before editing shared scene files. New package metadata explicitly opts into board profile/budget. Mesh, collision, preview and picking consume the same conductor path.

- [x] Write/run failing 830/630/100 cutaway, every-family tip/floor/anchor, board move/yaw and negative cavity/budget/collision tests.
- [x] Add profile/schema/version validation and actual deep throat/floor/housing geometry; extend round/square/stamped paths through their correct cavity with closed tips and bounded exceptions.
- [x] Write/run failing straight/90°/near-elbow/diagonal/short/custom-thickness wire tests for continuity, radii, no lumps/folds and stable electrical endpoints.
- [x] Allocate route/terminal space before filleting, sweep one tangent path with sealed annular insulation ends, and render the real core to depth.
- [x] Pass TypeScript/Python parity and focused routing/geometry/resource tests; retain legacy readers/custom appearance and report unsupported exact fits honestly.

## Task 4: Label, independent capacitors and shared editor integration

Owner: root.

Files: new LabelModel/text cache, Label authoring/properties components; ComponentModel/SceneManager/CircuitWorkspace3D; document label-association helpers/graphCommands; ribbon/ComponentPropertiesForm/Inspector/partCatalog transition; tests.

Interfaces: consume task1's Label property normalizer; create a LABEL module with graph pose and optional properties.boardId. Derive sheet size from text/font within60×25 mm; render0.1 mm sheet and0.3 mm corners at deck+0.15 mm. Integrate tasks2/3 through their provided hooks.

- [x] Write/run failing Label command tests: one-entry placement/edit/move/rotate/duplicate/delete, cancel rollback, board move/yaw, delete-detach preserving world pose and board+label copy remapping.
- [x] Implement Label renderer with bounded≤1024px texture cache, font-ready refresh, depth-tested board-plane text and deterministic cleanup; test multilingual text/update/disposal.
- [x] Implement compact text entry → native pointer ghost → click placement, double-click/Inspector editing, normal selection/tools/history and cancelled gestures. Selection must consume the pointer before underlying wire activation.
- [x] Add the real Notation entry and two capacitor entries; hide the ordinary capacitor Type control and stop value updates from changing type/pins/metadata. Preserve both definitions' electrical fields.
- [x] Integrate mounted conductor/actuator hooks and pass focused command/UI/render tests.

## Task 5: Integrated verification and delivery

- [x] Review cross-boundary APIs, run catalog/contract/context/boundary checks, full Python/Web tests, test/E2E typechecks and production build. Serialize heavy suites/native browsers.
- [x] Native E2E: SS12D10 both states/Undo; tactile press/release/cancel; DIP4 independent bits; real display evidence; wires/endpoints/cutaway; capacitor menus; Label pointer entry/edit/move/rotate/copy/delete/board association/Undo/reload.
- [x] Retain actual native before/after views and inspect top/side/recess geometry, glyphs, wire joints and buried metal. Report draw calls/GPU resource counts for the same scene and repeated place/edit/delete cycles; do not invent FPS.
- [x] Record measured mesh mm values, CAD/native distinctions, migration behavior, exact commands/results and any blocked gate in `docs/verification/2026-10-18-contacts-wires-label.md`.
- [x] Leave source uncommitted and provide a concise commit message covering the final implementation.
