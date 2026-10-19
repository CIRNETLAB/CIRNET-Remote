# Unified camera navigation implementation plan

> **For agentic workers:** Use systematic debugging, test-driven implementation and independent review. The user explicitly requests implementation and local verification; leave commits to the user.

**Goal:** Tight full-circuit overview shared by Fit, Home, Area and all zoom commands, without regressing clipping, Grid or domain state.

**Architecture:** Cache committed render bounds separately from adaptive clipping. Solve four viewport constraints in the real camera basis. One navigation controller owns overview calibration, finite limits and readback; SceneManager applies atomic camera transactions. UI intent has a revision separate from measured zoom.

**Tech stack:** Existing Vue/Pinia, Three r171, TypeScript, Node tests and Playwright.

**Spec:** `E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Prompt_Codex_Unified_Camera_Zoom_Fit_Reset_Area.md`.

## Constraints and review focus

- Preserve CircuitGraph/history, physical poses, descriptors, topology, Contracts and all depth/Grid surface fixes. No dependency changes or commits.
- Latest user correction overrides automatic 50% recenter and extended inspection: ordinary wheel/+/- retain the focal point, physically constrained to 50–1000%. Only Fit/Home establishes the reference; Area retains it. Fit/Home explicitly restores overview. Empty Home retains the original pose.
- Preserve pose on previews/commits/resize and preserve reference during Orbit/Pan; readback must never issue commands.
- Cover sparse/translated layouts, asymmetric viewport, TOP/roll, near/far isolation and geometry revisions.
- Partial Area geometry and empty/horizon fallback must stay finite; close dolly must retain collision guards and the real 50–1000% dolly limits.

## Tasks

- [x] Capture original native browser behavior and RED tightness/Area/Home regressions in ignored `.test-build/unified-camera`.
- [x] Add `CameraFraming.ts` and focused math/bounds tests: cached per-mesh/instance bounds, tight four-edge solver, selection-cone clipping and focal-plane fallback.
- [x] Add a small navigation controller and integration regressions. Own full-circuit calibration, reported zoom and effective limits; apply Fit/Home/Area/wheel/+/- through one transaction in `SceneManager.ts`.
- [x] Separate `workspace` command revision from readback; update `CircuitWorkspace3D.vue` bridge and status bar. Observe persistent layout only; transient selection/tooltips cannot change framing.
- [x] Replace assertions that require Area rebase or fixed-origin Home with behavioral coverage; retain picking, collision, gesture, transition and resource checks.
- [x] Run boundaries, full tests, build, E2E TypeScript and camera/zoom/framing browser filter. Recheck depth/Grid on native renderer and inspect before/after screenshots. Independently review source and document measured evidence.

## Verification

From `apps/web`: `npm run check:boundaries`, `npm test`, `npm run build`, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.e2e.json`, `npm run test:e2e -- --grep "camera|zoom|framing"`.

Final report records exact command results, projected coverage, reference/target/range transitions, graph/resource invariants and any unverified limitation. Supply a short commit message without staging or committing.
