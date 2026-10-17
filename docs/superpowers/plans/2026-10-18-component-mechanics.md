# Component mechanics correction implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the tasks below. The user has supplied and authorized the detailed design and direct execution; no commit, push, merge or deploy is authorized.

**Goal:** Correct automatic two-contact component mechanics and compact generic proportions while removing manual lift/tilt interaction and preserving historical designs.

**Architecture:** Preserve CircuitGraph 1.2 and the existing mounting architecture. Resolve historical pinned descriptors, use deterministic board-local standing/horizontal/upright templates, and share tangent circular lead paths between rendering and validation. Re-anchor/rebuild are previewed, validated document transactions.

**Tech Stack:** TypeScript/Vue/Three.js, Python contracts, JSON Schema, Node tests, pytest, Playwright.

**Spec:** `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/PROMPT_CODEX_Sua_Chan_Linh_Kien_Ty_Le_3D_netCircuit_v2.md` and the 18 attached reference images.

## Global constraints

- Keep `MM_TO_WORLD = .13 / 2.54`; topology owns contact coordinates.
- Keep stable pin/contact identity, properties, connections, metadata and legacy pose/control fields.
- Remove all manual component lift/tilt interaction; preserve terminal re-anchor, planar movement/yaw, camera and independent wire routing.
- Preserve geometry revision 1 readers and frozen compatibility fixtures; version new intent/geometry explicitly if semantics change.
- Generic descriptor changes originate in `device-library/parts/physical-parts.json` and must retain historical ID/revision resolution.
- No automatic legacy re-layout during open/save. Explicit rebuild and re-anchor may adopt new profiles after valid preview.
- Count holes inclusively: 2/3/4/5 holes = 1/2/3/4 pitches; solve diagonal spans continuously.

## Review focus

- Reversed contacts and A/K or PLUS/MINUS pin identity remain stable through template changes.
- Collinear subdivision cannot alter validity; real reversals and crossings still fail.
- Historical descriptor IDs and manual pose/control snapshots survive reload and Undo/Redo.
- Invalid previews and pointer cancellation never mutate the graph or leave stale hit targets.
- Renderer meshes, envelopes, labels/thumbnails and validation use the selected descriptor and the same curved centerline.

## Task 1: Versioned catalog and persistence contracts

- [x] Add regressions for historical descriptors and compact defaults; observe baseline failure.
- [x] Preserve old catalog entries and introduce resolvable compact generic revisions/default mapping; synchronize generated catalogs.
- [x] Add versioned auto-routing intent without changing the geometryRevision 1 contract; update schema/codegen/registry as required.
- [x] Update Python/TS pinned descriptor consumers and compatibility/parity fixtures; verify generation and round trips. Preserve free historical modules and explicitly pin new free descriptors too.

## Task 2: Deterministic solver and curved validation

- [x] Reproduce upright radial false self-collision and resistor 3-pitch horizontal bend-fit failure.
- [x] Implement `axial-standing`, `axial-horizontal`, `radial-upright` in board-local coordinates with rigid exits and explicit minimum/preferred radii.
- [x] Normalize collinear subdivisions, preserve endpoint straights, and validate the same tangent circular centerline used by rendering.
- [x] Cover inclusive span thresholds, reversed/diagonal/transformed boards, max lengths, clearance, crossings and Python/TS parity. Closest-point arclength regression catches the 270-degree return crossing.

## Task 3: Authoring and rebuild transactions

- [x] Add failing interaction/command tests for removal of lift/tilt and automatic re-anchor reflow.
- [x] Remove component lift/tilt handles, picking, dragging, actions and hints while retaining pin handles and legacy readers.
- [x] Add explicit `Rebuild component geometry` valid preview/confirm with one Undo, preserving properties and connections.
- [x] Verify pointer-up transaction, Escape/pointercancel rollback, movement/yaw/duplicate and native pointer E2E.

## Task 4: Renderer integration, verification and delivery

- [x] Use shared circular fillets and per-bend radii in lead rendering, preserving conservative collision bounds.
- [x] Verify body shape envelopes including LED flange/ceramic rim, instance resistor bands/markings and historical descriptors.
- [x] Run full Web tests/build, targeted and full Python checks, codegen/catalog/compatibility gates and relevant browser E2E.
- [x] Review screenshots and GPU/listener lifecycle; record exact passed gates and blockers with mm/pitch dimension table in `docs/verification/2026-10-18-component-mechanics.md`.
- [x] Deliver integrated working-tree changes and a concise commit message for the user to commit; no commit/push/merge/deploy performed.
