# CRUMB Component Placement Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans, with tests before each functional change.

**Goal:** Implement the complete user-supplied component placement prompt, including real two-contact authoring, rigid bodies/flexible leads, direct editing, generic design properties and visual evidence.

**Architecture:** Keep frozen Graph 1.0/1.1 and mount v1 byte compatible. Add Graph 1.2, a separately versioned flexible mount, immutable mechanical authoring profiles and opt-in API DTOs/routes. A pure geometry solver and placement controller project through the existing renderer, document commands, history and camera lifetime.

**Tech Stack:** Existing Vue/Pinia/Three.js/TypeScript, canonical JSON Schema/Python generation, FastAPI, Playwright; no new product dependency or hardware implementation.

**Spec:** User-authorized `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/PROMPT_CODEX_Component_Placement_CRUMB_netCircuit.md`, read in full. `docs/ARCHITECTURE.md` remains canonical authority. Video evidence: the user's crumb.mp4 and netcircuit.mp4, sampled throughout into ignored `.build/component-placement-reference/`.

## Global constraints

- CircuitGraph owns design; observations and physical identity remain separate; Safety != Correctness.
- No reset, automatic commit, push, merge or deployment. User wants commit text after completion.
- Preserve recent selection Move (`bb0ceb1`), rigid DIP/switch/bench, Wire/Orbit/gizmo, legacy lead properties and opaque stored data.
- Flexible assemblies use one board-local body-center pose, Euler YXZ degrees, immutable package/profile revisions and explicit stable pin/contact bonds.
- Electrical connectivity never comes from mesh intersections. Exactly one transaction per completed gesture; cancellation never mutates the graph.
- Generic display names and editable enums/colors are canonical catalog metadata. Unsupported nonlinear/transient/BJT/buzzer models remain unavailable.

## Review focus

- Same-strip distinct holes remain legal; occupied exact contact and cross-board attempts fail explicitly.
- Right drag remains Orbit while a stationary right click adds a bend; cancellation/principal/document changes release capture and preview resources.
- Type changes preserve/rewrite endpoints only through an explicit bijection in one validated command.
- Tilt/lift uses actual full 3D body clearance; bodies/diameter never scale to fit, and lead lengths remain bounded.
- All visual/picking/label/wire/thumbnail consumers share the resolved endpoints and geometry; persistence and Undo reproduce the same shape.

## Task 1: Additive contracts and persistence (contracts agent)

Files: new flexible mount/Graph 1.2 schemas and profiles, manifest and generated artifacts; `contracts/flexible_mounting.py`, physical/property/execution consumers, API opt-in DTOs/routes and tests.

Interface: `FlexibleMountV1` uses `kind: breadboard-flexible`, `version: 1`, board/part/package/profile identities and revisions, `geometryRevision: 1`, `bodyPose: {position, rotation}`, contacts and per-pin `controlPoints` (max 8). Body position/control points use board-local world units; profile dimensions use mm.

- [x] Observe rejecting new 1.2 before additive schema; preserve all compatibility baselines.
- [x] Implement bounded geometry validation/parity fixtures, opt-in storage/validation/Create support and explicit old-route rejection.
- [x] Verify generation, compatibility, Python property/geometry/API persistence tests before accepting the new variant.

## Task 2: Pure geometry and authoring controller (root)

Files: `electrical/flexibleGeometry.ts`, `editor/FlexiblePlacementController.ts`, `electrical/mounting.ts`, `electrical/modulePose.ts`, canonical type aliases and geometry/controller tests.

Interface: deterministic solve from two exact contacts + body/bend intent; reconstruct leads from exit, outward straight, persisted controls, insertion stub, contact. Return diagnostics without selecting a different hole. Cache contact occupancy by immutable graph identity.

- [x] RED tests for close/medium/long spans, standing/flat/tilted axial and radial families, continuity, bounds and stable pin identity.
- [x] Implement bounded pose candidates and deterministic hysteresis; controller first/second contact, bends and cancellation remain outside graph.
- [x] Verify fixtures with Python and keep rigid mount behavior intact.

## Task 3: Document commands and existing Move integration (root)

Files: graph commands/store, batch commands/clipboard, import/serialization and tests.

Interfaces: atomic place/update flexible mount; `changeComponentDesign(id, nextType, patch, pinMap?)`; reanchor changes only one pin; body pose changes no bonds; Move translates the whole assembly and revalidates exact contact ownership.

- [x] RED tests for graph/history, cancellation, copy/paste/delete board, board transforms and recent selection Move.
- [x] Implement explicit legacy-to-flexible conversion only through an authored command, preserving unknown properties and existing endpoints.
- [x] Verify exact Save/Open/recovery and immutable API snapshots.

## Task 4: Renderer and pointer integration (root)

Files: dedicated flexible geometry adapter/handles, PackageModel/Leads/Labels/Thumbnails, SceneManager, useCircuitEditor and pointer regressions.

- [x] RED tests for body dimension invariance, resolved tips/labels/targets/wires, ownership/disposal and no scene recreation.
- [x] Project body pose and lead sweeps through existing models; coalesce preview by frame.
- [x] Integrate two clicks, drop-first-anchor only, bends/backspace/Escape, exact one-pin handles, direct body lift/tilt and camera/pointer rollback.

## Task 5: Generic catalog and compact draft-aware Component Info (UI agent)

Files: canonical physical-parts/generator, data descriptors/property metadata, workspace, Component Info/form/Ribbon/Inspector/CSS and tests.

Interfaces: eight new descriptors with a single Capacitor palette entry; exact legacy IDs retained. `workspace.placementEpoch` increments only on Add/arm; `updatePlacementProperties(patch, nextType?)` preserves the current placement transaction. Component form emits patches; selected subtype changes use the root atomic design command.

- [x] RED canonical enum/color/finite property and exact SI numeric round-trip tests.
- [x] Implement generic names, compact fields/units/swatches/Update, draft preview before instance, centralized legacy Add mapping and no Edit Leads UI.
- [x] Retain stored ratings/unknown properties and honest simulation capability; verify actual per-instance LED model parameters.

## Task 6: Integrated acceptance and actual visual evidence (all)

- [x] Run generation/compatibility, full Python, Web tests/build/typecheck/boundaries and independent reviews; fix substantiated regressions.
- [x] Real canvas pointer E2E: placement/bends/cancel/reanchor/body/Move/board/Undo/Save/reload, rigid and Wire/Orbit regression.
- [x] Capture actual post-change clip and TOP/FRONT/oblique/close-ups at 1280x720 and 1920x1080. Reference video frames are comparison evidence only.
- [x] Publish a truthful verification report with source inventory, migration decision, exact commands/results, media paths and remaining limitations; provide concise commit text.


Final evidence: full Python1070 PASS/1 Icarus SKIP, Web1117 PASS, native Chromium18 PASS, build/typecheck/AST/generation/OpenAPI/compatibility/catalog/installed-package gates PASS. User requested report only; no media package. See docs/verification/2026-10-18-component-placement.md.
