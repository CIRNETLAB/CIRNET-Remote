# Compact Wire Routing Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and one fresh final review.

**Goal:** Fixed short silver terminals, compact lateral bundles and local crossing bridges without distorted wire bodies.

**Architecture:** Keep semantic routes independent from cached derived rendering routes. Attribute every displayed span to its semantic segment so editing cannot bake in bundle/lift offsets.

**Tech Stack:** Vue, TypeScript, Three.js, node:test.

**Spec:** `docs/superpowers/specs/2026-10-15-compact-wire-routing-design.md`

## Global Constraints

- Frontend wire visuals only; preserve electrical graph, file schema, contracts, camera/placement/gizmo.
- Constant opaque diameter, bounded smoothing, no spline overshoot or global Y stacking.
- Missing legacy priority is 0; no schema bump or persisted derived points.
- One history entry per committed edit or priority action; no pointermove history.
- Work in the existing linked worktree. Git metadata is read-only; retain source edits for review.

## Review Focus

- Reversed and rotated multi-bend bundles must stay coherent and bounded.
- Closely spaced crossings, raised anchors and mixed diameters must clear safely.
- Picking a displaced lane or bridge must edit the original span without accumulating offsets.
- Old/new conflict groups on move/delete/preview must update without rebuilding unrelated wires.
- Short spans/shared endpoints must not generate spikes, loops or non-finite/inside-out geometry.

### Task 1: Fixed terminals and base route

**Files:** `WireTerminals.ts`, `wireAppearance.ts`, `wireRouting.ts`, `wireRouteEditing.ts`, wire geometry/routing/layer tests.

**Interfaces:** `solveWireRoute` remains the semantic solver; optional contact deck heights support fixed collars. Existing `wireLayerOffset` compatibility call returns zero until consumers are removed.

- [x] Add regression tests comparing terminal collar, insertion and exposure for priority 0/10, fixed low base and metallic opaque pins.
- [x] Run focused tests; expect exposure/height/material failures against current code.
- [x] Remove global Y arithmetic, derive deck-based fixed collars, set silver material, preserve explicit anchor Y.
- [x] Update assertions that intentionally encoded old global layers; run focused tests, expect PASS.

### Task 2: Derived compact layout

**Files:** new `wires/wireLayout.ts`, `wireStacking.ts`, layout/stacking tests.

**Interfaces:** layout input `{wire, visual, route}`; output base `SolvedWireRoute` with optional render points/segments/handles. Display spans retain semantic `index` and base interpolation endpoints.

- [x] Add real geometry/layout tests: 10/20 lanes, spacing .0546 for diameter .052, centered distribution, side Y, reversal, rotations/multi-bend, mixed sizes, crossing/local return, terminal invariants and short spans.
- [x] Run focused tests; expect missing derived layout behavior.
- [x] Implement corridor grouping, diameter-relative centered lanes with bounded transitions, ordered local bridges and attributed display spans.
- [x] Implement signature/pair cache and old/new conflict-group invalidation; test unchanged references and finite healthy geometry.
- [x] Run focused tests, expect PASS.

### Task 3: Scene, editing and order integration

**Files:** `WireLayer.ts`, wire-only portions of `SceneManager.ts`, `useWireRouting.ts`, `wireRouteEditing.ts`, `WireOptions.vue`, wire interaction/layer/options tests.

**Interfaces:** WireLayer renders cached layouts, exposes attributed display route; scene picks display spans and supplies base hit. Controller saves semantic coordinates only. `layer` remains a nonnegative integer priority.

- [x] Add integration regressions for atomic Up/Down/Top, over/under and lane order, picking/editing derived routes, repeated gestures, nets, v1 Save/Open/UndoRedo and unrelated buffer reuse.
- [x] Run regressions; expect old height-stack or offset-persistence failures.
- [x] Integrate layout cache into sync/dirty/drawing paths, use display path for feedback and picking, map editing back to base.
- [x] Replace physical occupancy cascade with atomic priority swaps; clarify compact UI copy while preserving control placement.
- [x] Run all wire tests and then `npm.cmd test`, expect PASS.

### Task 4: Verification and review

**Files:** README and verification report with CPU top/side/oblique geometry images.

- [x] Run full tests, build, whitespace checks and dense-wire cache/performance probe; report exact output and any environment limitation.
- [x] Dispatch one read-only fresh final reviewer against working diff and Review Focus. Fix important findings with failing regressions then full suite.
- [x] Inspect CPU geometry images, document algorithms/files/limitations; no browser/WebGL claim.
- [x] Leave the completed working diff for user review.
