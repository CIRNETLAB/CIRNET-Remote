# Automatic component mechanics — 2026-10-18

Implements the user-supplied `PROMPT_CODEX_Sua_Chan_Linh_Kien_Ty_Le_3D_netCircuit_v2.md`, using images 1–11 as the reported defects and 12–18 as shape references. These images do not specify measured hardware dimensions.

## Behavior and compatibility

New automatic geometry uses explicit `axial-standing`, `axial-horizontal` and `radial-upright` templates in the breadboard frame. Contact topology remains authoritative and `.13 / 2.54` world units/mm is unchanged. Two/three holes mean one/two pitches, including both endpoints; four/five holes mean three/four pitches. Diagonal distances remain continuous rather than rounding to a hole count.

Standing axial bodies place their lower exit over that pin's contact, with a short straight lower lead and a broad tangent U on the upper lead. The compact generic resistor fits horizontally at three pitches with symmetric real exit/socket straights and valid bend radii. Radial bodies remain upright and centered. Exact exit pitch gives straight vertical leads; other spans open the leads symmetrically within the mechanical limits.

The TypeScript renderer and validator share an analytic line/circular-arc path. Python mirrors this construction. Forward collinear subdivisions are removed before fitting, and bounded arc samples support collision checks without mistaking local tube continuity for self-intersection. Tube radius and arc sampling error are accounted for by the V2 clearance/obstacle checks. Real reversal, crossing, length, board/body clearance, hole occupancy and separate component lead collisions remain rejected.

New automatic mounts use a separate `FlexibleMountV2` / `geometryRevision: 2` contract with versioned automatic routing intent. The `FlexibleMountV1` / `geometryRevision: 1` definition, body pose and saved controls remain readable. Historical package descriptors and mechanical profiles remain resolvable by all pinned IDs/revisions. Opening/saving does not invoke rebuild. Explicit rebuild/re-anchor may adopt current geometry after valid preview; cancellation restores the prior mesh and data.

Historical **free/unmounted** generic modules also retain their original dimensions and pin spacing. Newly authored free modules explicitly pin a versioned `PhysicalDescriptorV1` and use CircuitGraph 1.2; unmarked historical modules resolve their original descriptor without adding fields during read/save. Rigid movement/yaw and mounting previews retain the selected descriptor. Type changes, detach and duplication carry the corresponding descriptor identity.

Manual component lift/tilt meshes, pick targets and pointer modes have been removed, along with the unused manual lead-edit form and placement bend override interaction. Pin re-anchor, whole-component planar movement/yaw, selection/deletion, camera and independent wire tools remain. Re-anchor recomputes from both exact contacts and stable pin IDs. `Rebuild component geometry` previews first; Apply commits one history transaction and Cancel/Escape leaves the graph unchanged.

## Dimensions

The pitch comparison below is dimension/pitch, with one standard breadboard pitch = 2.54 mm. These are generic visual authoring presets, not inferred hardware ratings or capacitance-dependent sizing.

| Current generic preset | Body X × Y × Z (mm) | Body X × Y × Z (pitches) | Exit pitch | Wire diameter |
|---|---|---|---|---|
| Resistor | 5 × 2 × 2 | 1.969 × 0.787 × 0.787 | Axial end exits | 0.5 mm |
| Diode | 3.9 × 1.9 × 1.9 | 1.535 × 0.748 × 0.748 | Axial end exits | 0.5 mm |
| Zener | 4.2 × 2.2 × 2.2 | 1.654 × 0.866 × 0.866 | Axial end exits | 0.5 mm |
| Electrolytic capacitor | 6.3 × 11 × 6.3 | 2.480 × 4.331 × 2.480 | 2.54 mm / 1 pitch | 0.5 mm |
| Ceramic capacitor | 4 × 4 × 2.6 | 1.575 × 1.575 × 1.024 | 2.54 mm / 1 pitch | 0.5 mm |
| LED, flange included | 5 × 8.6 × 5 | 1.969 × 3.386 × 1.969 | 2.54 mm / 1 pitch | 0.5 mm |

At three pitches (7.62 mm), the generic horizontal resistor center is 1.2 mm above the contact plane, its two bend radii are 0.6 mm, its real exit straights are 0.71 mm and its socket straights are 0.6 mm. Standing axial upper U radii are 1.27/2.54 mm for one/two-pitch spans; the lower straight lead is 1.15 mm. Radial exact-pitch exposed leads are 1.25 mm. Body dimensions remain invariant across spans. LED flange and ceramic rim/bevel meshes fit their declared envelopes. Instance resistor paint remains blue `#4A90E2`, with five value/tolerance bands; polarity and value markings follow the instance.

## Verification evidence

| Gate | Final result |
|---|---|
| Production build: `npm run build` (includes app typecheck) | PASS; Vite build completed. Non-fatal large-chunk warning remains. |
| Full Web: `npm test` (includes test typecheck), outside the localhost-restricted sandbox | 1,157 PASS; 0 FAIL / SKIP. |
| Full Python: `.audit-runtime/Scripts/python.exe -m pytest -q -rs --basetemp .superpowers/component-mechanics-final-pytest` | 1,082 PASS; 1 SKIP (Icarus/vvp unavailable locally; FPGA CI owns this unrelated RTL gate). |
| Catalog: `scripts/sync_editor_catalog.py --check` | PASS; 84 editor types / 63 current physical parts; historical descriptors retained separately. |
| Contracts: `scripts/generate_contracts.py --check` | PASS. |
| `scripts/check_public_compatibility.py` | PASS; retained API/NCAP compatibility anchors. |
| `scripts/check_context.py` | PASS. |
| `npm run check:boundaries` | PASS; 201 source modules. |
| `scripts/sync_breadboard_topologies.py --check` | PASS. |
| Browser: flexible-placement + flexible-assignment | 7 PASS; stronger historical generic rebuild rerun also PASS. |

The final logs are `.superpowers/component-mechanics-web-final.log`, `.superpowers/component-mechanics-python-final.log` and `.superpowers/component-mechanics-build-final.log`. Python's one warning is the existing Starlette/httpx TestClient deprecation. An initial sandbox-only Web run could not connect to localhost (`EACCES`); it is superseded by the final unsandboxed Web run. No validation/collision checks were disabled to make a gate pass.

Native Chromium/SwiftShader tests use real trusted pointer input and the actual WebGL scene, covering contact placement/re-anchor, right-drag camera, old handle coordinates dragged beyond the gesture threshold, Move/Undo/Redo, preview/cancel/apply/reload, assignment reference publication, and three place/edit/Escape/delete cycles. The geometry/texture counters after deletion do not increase across those three cycles and stale handles disappear. Multiview/draft layout runs covered 1280×720 and 1920×1080.

The related browser command was `npm run test:e2e -- flexible-placement.spec.ts flexible-assignment.spec.ts` (7 PASS). The strengthened saved-generic rebuild case and the retained gallery were then rerun individually (1 PASS each). The final gallery uses `--output .test-build/component-mechanics-gallery` to retain its nine images independently of later Playwright runs. All owned E2E backends shut down successfully.

No scoped acceptance gate remains blocked. Unrelated complete release groups (PostgreSQL, the external four-wheel installation matrix and target hardware/deployment) were not invoked for this geometry change. The unavailable Icarus/vvp test is explicitly recorded above; no FPGA, electrical safety/topology/function logic or hardware driver was modified.

The stronger saved-generic rebuild test loads `component-mechanics-legacy.json`: revision-1 manual body pose/controls remain exact until explicit action, preview switches actual body mesh size to compact revision 2, Cancel restores the old mesh and graph, and Apply/Undo/Redo restore the corresponding descriptors and shapes. Its retained screenshots are in `apps/web/.test-build/component-mechanics-rebuild/`.

Independent review found and corrected descriptor-only model reuse during cancellation, silent historical rigid/free preset upgrades, an inadequate native drag-distance assertion, and a true 270-degree self-crossing hidden by the local-continuity exemption. TypeScript and Python now evaluate continuity at the closest points along the curved path. Differential probes preserved acceptance of historical V1 override variants; fixtures and round-trip tests preserve their stored data.

## Retained visual evidence

All nine unselected closeups were visually inspected in the actual browser render. Standing axial parts have a short straight lower lead and a broad rounded upper U; horizontal parts have a low rigid body and symmetric rounded lead transitions; radial parts are upright with short exact-pitch legs. The gallery keeps the existing board scale, instance paint/markings and camera controls. These checks establish the intended proportions and routing, not pixel identity with the differently lit reference pictures or measured hardware dimensions.

The retained gallery lives in `apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/` (local generated artifacts, regenerated by the focused gallery E2E). Screenshots:

- [Resistor standing](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/resistor-standing.png), [horizontal](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/resistor-horizontal.png).
- [Diode standing](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/diode-standing.png), [horizontal](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/diode-horizontal.png).
- [Zener standing](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/zener-standing.png), [horizontal](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/zener-horizontal.png).
- [Electrolytic](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/electrolytic-upright.png), [ceramic](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/ceramic-upright.png), [LED](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-gallery/flexible-placement-actual--4f4b2--upright-radial-proportions/led-upright.png).

Rebuild: [preview](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-rebuild/historical-rebuild-preview.png) and [applied](E:/ALL_PROJECTS/LUAN_VAN_TOT_NGHIEP/REPO/Branch/refactor/apps/web/.test-build/component-mechanics-rebuild/historical-rebuilt-geometry.png). The native fixture rerun confirmed actual mesh dimensions and rollback, not only JSON descriptor fields.

No commit, push, merge or deployment is performed. Changes remain in the user's working tree for review and commit.
