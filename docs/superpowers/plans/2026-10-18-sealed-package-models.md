# Dimensioned sealed package models implementation plan

> **For agentic workers:** Execute with superpowers:subagent-driven-development. The user supplied the complete approved design and requested direct implementation. Do not commit, push, merge or deploy.

**Goal:** Implement the exact new generic package dimensions and sealed lead feedthroughs, proper DIP/TO-92 solids and lead sections across fixed/flexible/live previews, retaining historical descriptors and interaction behavior.

**Architecture:** Extend the existing parametric package pipeline with a versioned catalog shape specification. Package body dimensions remain authoritative; shape-owned body-local exits, sections and 0.15 mm embedded feedthroughs drive rendering, mechanics, bounds and thumbnails. New descriptors coexist with historical IDs/revisions. Only external lead centerlines enter mechanical validation; section envelopes conservatively enclose their true cross section.

**Tech Stack:** TypeScript/Vue/Three.js, Python contracts, JSON Schema, esbuild/Node tests, pytest, Playwright Chromium.

**Spec:** `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/PROMPT_CODEX_Model_3D_Dung_Kich_Thuoc_Kin_Chan_netCircuit.md`, user images 1–17.

## Global constraints

- Preserve `MM_TO_WORLD = .13 / 2.54`, contact topology and camera/global instrument lighting.
- Resistor4.9×1.75 (latest user specifies the exact4.90mm length; preserve earlier observed presets), diode4.5×2.3, Zener3.5×1.6; ceramic5×5×2.2; electrolytic6.3×11; LED lens5/flange5.8/total8.7; DIP14 body19×3.04×6.35 and standoff1; TO-92 body4.6×5.1×3.9 and standoff2.5 (all mm, body axes X/Y/Z).
- Preserve old pinned descriptors and free-module descriptor rules; exact-part and non-DIP14 packages keep their declared identity/measurements.
- No manual Edit Lead/lift/tilt controls; preserve two-contact placement/re-anchor, automatic solver, move/yaw, camera/history and electrical identities.
- A catalog `shape` version1 owns family, leadExits (centered body-local positions/normals), leadSection, embeddedDepthMm, optional lens/flange/dome/bevel dimensions. `bodyMm` is the enclosing package envelope.
- No group scaling, contact relocation, collision suppression, global lighting changes or hardware/simulation identity inference.
- Latest DIP image correction: protect planar cap normals from notch/bevel smoothing; the shallow semicircular notch has a flat floor and upright curved wall matching the added reference.

## Review focus

- A closed AABB alone is insufficient: welded boundary edges, actual solid feedthrough intersection and surface joins must be tested.
- Legacy V1/V2 mounts and unmarked free modules retain their descriptors through open/save and Undo; rebuild explicitly adopts current geometry.
- Square/stamped sections use conservative collision envelopes and stable sweep frames; hidden embed does not affect external lead length/contact.
- DIP14 seated height is not body thickness; other pin counts retain distinct package dimensions.
- LED initialization and appearance updates share the same dark-resin mapping while ON/OFF/unknown remain simulation-driven.

## Tasks

### 1. Catalog, shape contracts and mechanical parity
- [x] RED dimension/shape/historical-resolution tests.
- [x] Version new generic and DIP14/TO-92 packages while preserving all old entries/profiles; add the shape contract and generated TypeScript/Python consumers.
- [x] Update round0.6mm minimum radii≥0.4, sections and conservative collision dimensions in Python/TypeScript; maintain parity fixtures and generation checks.

### 2. Axial/radial solids and local materials
- [x] RED axial open boundary, ceramic boot, LED lens/flange and marking/material regressions.
- [x] Add family builders for closed axial ends, lensed ceramic/boots, sleeve/lid/bung/vent and LED sealed shell/frame.
- [x] Keep instance markings/five bands/polarity and shared LED appearance mapping; preserve historical unshaped geometry paths.

### 3. DIP/TO-92 solids and sectioned leads
- [x] RED exact bounds/closure, shallow notch, shoulders/tails and TO-92 underside exit tests.
- [x] Build molded closed DIP body and stable variable-width stamped lead sweep; keep all pin counts descriptor-driven.
- [x] Build closed full-depth D-section TO-92 with bottom feedthroughs, rectangular fan-out leads and front marking.

### 4. Shared feedthrough rendering and rebuild integration
- [x] RED fixed/flexible embed/feedthrough equivalence, square-section sweep and expanded rebuild behavior tests.
- [x] Render the same declared hidden0.15mm feedthrough before the validated external line/arc path for fixed/flexible/ghost/thumbnail.
- [x] Expand explicit rebuild to free and rigid multi-pin selections, validating preserved contact bindings and committing one transaction with rollback/Undo.
- [x] Check pin targets/labels/wire anchors/bounds/cache signatures and geometry disposal.

### 5. Integration verification and delivery
- [x] Independent review and fixes.
- [x] Run catalog/contract compatibility, targeted then full Python/Web/build/typecheck gates; run localhost tests outside the restricted sandbox, serialize heavy full tests and browser renders.
- [x] Native E2E re-anchor/rebuild/save/history/GPU plus retained gallery in a dedicated output directory; visually inspect actual after renders.
- [x] Deliver actual mesh mm/pitch measurements, evidence/gaps and concise commit text; leave source uncommitted. See `docs/verification/2026-10-18-sealed-package-models.md`.
