# Camera-independent mechanical placement

Frontend correction against the supplied `debe3fb1-f47f-405f-b7f4-8f76485a9b33/Pasted text.txt`, starting at `c11a59a`.

## Root cause

`createPlacementDraft()` unconditionally sampled `SceneManager.placementFacingYaw()`. This shared factory serves cursor-follow, immediate-click and drag/drop placement, so changing the camera changed the initial **world rotation** of every new breadboard. The docking solver correctly transforms local mating profiles by module world rotation. A new camera-derived yaw could therefore make those profiles incompatible with the already placed board.

The correction is at draft creation. Docking remains entirely in world XZ; no camera transform, capture-tolerance increase or pose-tolerance increase was added.

## Rotation policy

`geometry/placementRotation.ts` centralizes initial rotation and Rotate Y snapping:

| Policy | Classification | Initial world yaw | Gizmo snap step |
|---|---|---:|---:|
| MECHANICAL | Actual shared geometry spec has mechanical sides; currently Breadboard 830/630/100 | 0° | 90° |
| CAMERA_FACING | Other known editor definitions, including Power Supply, Scope and Generator | Current camera-facing yaw, sampled once | 15° |
| WORLD_ALIGNED | Unknown definition fallback | 0° | 15° |

The policy uses the existing mechanical profile authority rather than duplicating a list of breadboard names. A lazy camera callback is never evaluated for mechanical placement. Existing drafts retain their explicit rotation; camera changes do not recreate them. Snap OFF keeps the existing fine-rotation behavior. Both preview and selected-module Rotate Y use the same step helper. Completed placement or selected-module rotation still creates one history entry; pointer updates create none.

No changes to SceneManager, camera/ViewCube math, ComponentModel, docking geometry, solver, tolerances, wires, CircuitGraph/schema, backend, contracts or simulator were required.

## Changed files

| File | Change |
|---|---|
| `apps/web/src/geometry/placementRotation.ts` | Shared policy, lazy initial yaw and rotation-step helpers |
| `apps/web/src/composables/useCircuitEditor.ts` | Apply policy in the sole draft factory and shared Rotate Y gesture |
| `apps/web/tests/placement-rotation.test.ts` | Mechanical camera independence, single camera sample for generic models and unknown fallback |
| `apps/web/tests/interaction.test.ts` | Camera-invariant docking across all placement paths; rotation/navigation/history regressions; retain Power Supply camera-facing checks |
| `apps/web/tests/camera-navigation.test.ts` | Include a rotated committed breadboard in world-matrix/history invariants through ViewCube changes and 360° orbit |
| `apps/web/README.md` | Document initial rotation and mechanical snap steps |

## Regression evidence

Baseline: 407/407 tests passed. New editor regressions first failed against the old universal camera-facing factory and 15° mechanical rotation step.

- 81 actual projection/ground-ray placement cases: three breadboard types × follow/immediate/drop × default, FRONT, RIGHT, BACK, LEFT, TOP, TOP-FRONT-RIGHT, orbit 37° and orbit 123°. Every case docks against a fixed world-yaw-0 breadboard. Tests require identical committed world poses across views, valid mechanical mating, no body overlap and one-step Undo/Redo. Cardinal views use Fit first so their ground intersections are well defined.
- Power Supply retains camera-facing yaw across all three paths, including cardinal/corner/TOP fallback cases. Existing one-sample 180° orbit coverage remains.
- Preview and selected-model gizmos use 90° steps for all three breadboards and 15° for Power Supply when Snap is ON. Snap OFF preserves a deliberate 37° rotation. History stays unchanged during pointer movement.
- Explicit 90° draft rotation survives orbit, pan, zoom, corner view and Reset without moving the ghost. Resumed cursor follow docks against a matching rotated board and commits one pose command with Undo/Redo.
- Committed breadboard graph pose and model world matrix remain unchanged through all ViewCube orientations, a full 360° orbit and Reset. Existing collision, X/Z/XZ transforms, mixed-size/rotated docking and wire suites remain green.

## Verification results

Run from `apps/web`:

| Check | Result |
|---|---|
| `npm test` | **420 passed, 0 failed, 0 skipped**, 58.38 s, including test TypeScript checking |
| `npm run build` | Production TypeScript check passed; Vite failed before transforming modules with Windows `EPERM: realpath .../apps/web/src/main.ts` |
| Vite build with resolver adapter below | **Passed**, 4.47 s; existing large-chunk advisory |
| `git diff --check` | Passed |
| Fresh read-only implementation review | No findings |

Resolver adapter used only for verification; no project configuration or dependency changes:

```powershell
node --input-type=module -e 'import {build} from "vite"; await build({resolve:{preserveSymlinks:true}});'
```

## Remaining limits

No browser/GPU visual verification was performed. The new tests exercise the actual Three.js camera, projection, ground intersection, model transforms and editor interactions in the existing test harness.

An exact side camera whose horizon lies on the ground plane cannot uniquely pick that same ground plane. That existing SceneManager limitation is separate from initial world rotation; cardinal-view regression fixtures use a real fitted positive-height target to establish valid ground intersections. Camera math was left intact.

Quarter-turn snapping does not override mechanical compatibility: docking still requires the existing mating profiles, side normals, joint families and collision checks to agree. Arbitrary fine rotations remain user-controlled with Snap OFF.
