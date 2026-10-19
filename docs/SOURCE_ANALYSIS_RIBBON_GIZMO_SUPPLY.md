# Ribbon, transform gizmo and upright supply — 2026-10-09

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

## Source paths and boundaries

`App.vue` → `SingleWorkspaceShell` composes the ribbon, tool rail, canvas, status bar and windows. `ComponentRibbon.vue` uses `data/ribbon.ts` for artwork/families and `editorCatalog` to decide whether an item can be placed. The canonical model contracts remain in `device-library/editor/components.json`; `scripts/sync_editor_catalog.py` generates the browser copy. UI selection/tool state is owned by the workspace/UI stores; the circuit store owns schema 1.0 graph commands and history.

`SceneManager` builds models with `ComponentModel`, owns their camera/renderer/picking/disposal and renders an adjacent `ComponentTransformGizmo`. `useCircuitEditor` owns pointer capture, ray/plane intersection, preview, cancellation and graph commit. These changes do not import FPGA drivers, create an electrical source, or make decorative geometry the Circuit Graph.

## Ribbon root causes and correction

The palette previously used absolute `left: 10px` for every family. It also contained a separate Info button for each entry, and the family label had `max-width: 92px` plus `overflow-wrap: anywhere`, splitting Embedded/Controller.

The palette now contains only component/action choice cards and a compact family name. There are no per-entry Info rows. Component Info remains a selected-model window; selecting from the ribbon arms placement or opens the corresponding instrument/tool as before.

`anchorPalette` measures the clicked family's bounding rectangle relative to the ribbon. Desired width is `26 + N × 120 + (N − 1) × 8`: card widths, gaps, padding and borders. Width is capped at ribbon width minus 20 px; left position is clamped between the two 10 px margins. The palette starts immediately below the triggering group. Right-edge groups shift left only as needed to keep their choices visible.

A Vue watcher waits for the next DOM update when the family changes. A root ResizeObserver and ribbon scroll listener recalculate the anchor. Cleanup disconnects the observer and document listeners. Outside click/Escape dismiss the palette; choosing an item first returns keyboard focus to its family. Ribbon buttons use intrinsic label width, share one height and retain horizontal scrolling when all twelve families cannot fit. Labels use `white-space: nowrap`.

## Gizmo appearance and Y rotation

The old handles used small, muted geometry; scene lighting/tone mapping further reduced their apparent contrast. The Y grip also stayed at a fixed local coordinate because neither its subgroup rotation nor its marker changed with model yaw.

The new gizmo uses a coral X arrow, blue Z arrow, ivory free-move diamond and gold Y arc/grip. Arrow stems and heads are thicker. A dark under-stroke separates the gold arc from geometry/grid; the diamond has a dark frame. Materials use `MeshBasicMaterial`, disable tone mapping and preserve opaque tool colors. Invisible wider raycast targets remain separate from visible strokes. Hover/drag highlights only the active handle; fixed dark backing meshes retain their color. There are no Delete, Confirm or Check buttons.

X/Z handles remain world-aligned because their constraints mean movement along world X/Z. Only the rotation subgroup takes `model.rotation.y`. The rotation marker reads the actual grip's world position, so picking and visual feedback agree at every angle. This update runs before the active-gesture early return: the ring moves during preview, not only after release.

The existing gesture center stays locked during a drag, avoiding feedback into `atan2` angle accumulation. Pixel scale remains derived from camera-space depth/FOV/viewport height/zoom and is recomputed during active movement. Releasing commits once through the circuit store; cancellation restores committed pose. Direct body drag still requires Move. Explicit selected-object gizmo handles remain available in Select.

## Placement beside tall models

Footprint clearance alone did not prevent a ground-plane arc from covering the projected screen of the taller supply. Candidate placement now also checks the selected model's projected visual bounds, in addition to neighboring models, windows/navigation and viewport margins.

`ComponentModel` caches geometry bounds before applying model pose. The gizmo projects those local corners through the current model matrix and camera. Reprojecting a world-aligned bounding box after arbitrary yaw inflated the silhouette and pushed the tool outside a small canvas; using the unposed bounds avoids that extra expansion. Viewport clipping carries a stronger penalty than ordinary clearance, keeping the complete tool usable when screen space is tight. Active gestures retain their chosen offset; placement resumes after release.

## Upright Power Supply

The previous supply contract was `[2.4, 1.2, 1.5]`, with a landscape face, four small knobs and three terminals. The latest reference calls for a taller case and two of each control. Canonical visual size is now `[2.4, 2.8, 3.2]`; the generated browser catalog matches it.

`PowerSupplyModel` now builds a beveled metallic enclosure, dark front bezel, portrait screen with vertically stacked V/A/W rows, two fluted Voltage/Ampe knobs with collars/index marks, two Vcc/Gnd binding posts, an I/O rocker switch, side vents, case screws and four rubber feet. There is no USB geometry or label. Display and printed legends use their own readable textures/materials. Segmented unknown values and OUTPUT OFF are deliberate: there is no implemented supply measurement or electrical source to report.

The binding posts have open base/grip/bore cylinders, an annular flange/lip and a dark recessed floor. Independent review found that an earlier closed base cap still blocked this floor; a front-center ray regression reproduced the red cap and passed after opening the base. This creates visible socket depth rather than painting a dark disk onto a capped post.

The ribbon and Component Info use a new original vector preview, `power_supply_upright.svg`, consistent with the two-knob/two-post layout. The 22 supplied SVG derivatives and their provenance manifest remain intact. The two user-added PNG reference assets remain untouched.

## Evidence and remaining limits

Frontend tests: **82/82 PASS**, including live Y grip position/picking at 45/90/180/270°, fixed world X/Z, preview rollback, tall-model clearance, small-canvas yaw changes, two knobs/two sockets with dark recessed floors, existing history/graph/Move-only behavior and resource disposal. Initial tests reproduced the frozen grip, obsolete controls, tall-model overlap and capped socket before corrections.

See [browser verification](verification/2026-10-09-ribbon-gizmo-supply-browser.md) for native dragging, responsive palette measurements and screenshots. Production TypeScript is verified; Vite bundling is blocked by sandbox `EPERM` resolving `src/main.ts`. The previous refusal to elevate build is respected. No hosted CI, commit, push or deployment is claimed.
