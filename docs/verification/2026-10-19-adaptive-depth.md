# 3D depth stability — 2026-10-19

> Historical evidence status — 2026-10-19 audit: command outputs, Git state and local artifact locations below describe the original session. They do not report this audit’s results or authorize new output under `.build`, `.superpowers`, `.test-build` or `docs/verification`. For reruns use [VERIFICATION.md](../VERIFICATION.md); generated visual and raw diagnostic artifacts must start outside the repository. Existing outputs await separate owner review and have not been deleted or moved.

## Scope and cause

The previous camera policy capped near at `.005` even when zooming out. At
eye-depth 30, near `.005` and far 150, a 24-bit depth step is about `.0107`
world units. Several authored layers are closer than that. Opaque material
sorting and `LEQUAL` can therefore expose a backing surface at equal depth.

Measurements use transformed geometry and intersections along the same ray:

| Surface pair | World gap |
| --- | ---: |
| Current Display face / white cavity floor; glyph or DP / face | `.00153543` |
| Historical Display face / body; glyph or DP / face | `.004`; `.0027` |
| Breadboard artwork / actual beveled deck top | `.002000005` |
| Scope control panel / silver backing | `.0080000005` |
| Generator function panel / backing | `.0115000002` |
| Scope / Generator screen and recess | `.0045000001` |
| Supply screen / recess | `.0014999999` |

The deck's bevel ends at `h+.028`, while its artwork is at `h+.030`.
Display fixtures explicitly pin current revision 2 and historical revision 1
for each 1/2/4 digit package; a bare editor type can select the historical model.

## Rendering changes

`apps/web/src/three/SceneClipping.ts` owns the workbench projection depth.
It caches rendered geometry bounds in world space and transforms their corners
to camera eye-depth when the camera moves. Bounds wholly outside the four
camera side planes are rejected independently of previous near/far. Crossing
boxes clip all six faces against that side cone and the eye plane; merely
discarding negative-depth corners would be unsafe. A scratch Three camera
preserves film/view offsets without extra projection writes on the main camera.
For positive visible bounds, near is 85%
of the nearest depth and far is 115% of the farthest depth. The 15% margin
allows numerical and surface clearance while preserving precision. Expansions
apply immediately, without hysteresis or previous-frustum culling.

Camera-containing bounds or a visible interval reaching the camera plane use
the conservative `.00001` near floor. Empty, offscreen or entirely rear-facing
scenes use that floor and a finite far of
`4 * max(1, camera.position.length())`. Such bounds stay cached and reappear
after a turn; fallback clipping never decides whether to collect them.
The finite near floor necessarily excludes depths below `.00001`.

Visible models, artwork, committed wires, placement/flexible/selection previews
and drawing/duplicate wire previews participate. Grid, editor gizmos, outlines
and hidden proxies do not. `ignorePick` is never an exclusion criterion.
Geometry boxes refresh on attribute identity/version changes. Instanced bounds
aggregate on geometry, instance matrix version or active count changes;
navigation reuses eight corners per renderable rather than rescanning vertices
or instances. Sprite labels use their exact camera-facing quad, including
pivot, world scale, material rotation and depth scaling. Offscreen labels
cannot lower near; visible billboard edges remain protected. No GPU resource
is created by the clipping policy.

`SceneManager` invalidates bounds after graph/pose/geometry/route/preview changes
and asynchronous artwork changes. An idempotent `ensureProjection()` flushes
wire geometry and synchronizes camera matrices/projection before render,
picking, marquee selection, gizmo projection and translation projection.
Wheel/toolbar zoom, Orbit, pan, Fit, area framing, ViewCube transitions, reset
and resize converge on that policy. Previous independent near/far writes were
removed.

Navigation standoff retains its own distance-based policy. Ground interaction
uses a finite ray-distance reach of `max(150, 4 * zoomReferenceDistance)`,
independent of rendered far. Actual content clipping uses eye-depth, including
off-axis picking. Wire handle size also uses eye-depth rather than camera near.

The existing small `stabilizeThinSurface` bias (`factor=-1`, `units=-2`) now
covers breadboard artwork and current/historical Display face, glyphs and DP.
Owned materials retain depth testing and their opaque depth writing. Existing
instrument screen/legend bias, shadows, PMREM, metallic response, authored
geometry, functional anchors and descriptor revisions are preserved.
CircuitGraph, topology, Contracts, simulation and FPGA code are unchanged.

Source files: `SceneClipping.ts`, `SceneManager.ts`, `ScenePicking.ts`,
`TechnicalGrid.ts`, `SelectionPreview.ts`, `WireLayer.ts`,
`config/workbenchViewport.ts`, `BreadboardHousing.ts`,
`package/DisplayPackageModels.ts` and `package/PackageFactory.ts` under
`apps/web/src/three/` (config is under `apps/web/src/`). Unit regressions and
native WebGL/workspace E2E fixtures accompany these changes.

## Workspace Grid regression and correction

The grid is intentionally absent from model depth bounds. Its former ordinary
vertex clip depth nevertheless used those model planes, producing a straight
foreground cutoff. The original fade center also followed the selected model;
moving that model could move the visible grid footprint.

`TechnicalGrid.ts` now sets only the helper's carrier clip Z to zero and carries
the original clip Z/W into the fragment shader. X/Y/W projection and side
clipping remain intact. Constant carrier depth also avoids reversed clamp bounds
for vertices behind the camera, whose result is undefined by the
[GLSL ES specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf).
Their perspective-correct ratio
restores physical fragment depth, clamped to the standard depth range. Depth
testing remains enabled and depth writing remains disabled, so opaque models
still occlude the grid. CPU frustum culling is disabled for this helper because
its depth-clamped shader does not match ordinary camera depth culling.

The fade center follows the camera target. Fade scale uses only camera-target
distance relative to the original default view, preserving the original
default appearance while retaining a broad grid after zooming out. The finite
carrier plane grows past the soft fade boundary with a mesh transform; no
geometry is rebuilt. World-space cell sizes, axis phase, colors, line widths,
base opacity and the XZ plane at `y=-.015` are unchanged. Model bounds, selected
objects and adaptive clip values do not control the footprint or fade.

The pre-fix real-WebGL grid regression found 29,516 changed pixels out of a
foreground region containing 32,244 visible grid pixels when only camera
clipping changed. A separate regression first failed when moving a selected
model moved the fade center. These failures were retained before correction.

## Automated source verification

- `npm test`: **1,293 passed, 0 failed, 0 skipped**. An initial sandbox run had
  six localhost HTTP/Vite failures; the unrestricted rerun passed the complete
  suite. Final log: `apps/web/.test-build/depth-grid-unit-verified.log`.
- `npm run build`: **exit 0**. Vite reports its existing large-chunk advisory.
  Final log: `apps/web/.test-build/depth-grid-build-verified.log`.
- `npm run check:boundaries`: **PASS**, 225 source modules.
- `tsc --noEmit -p tsconfig.e2e.json`: **exit 0**. Both test and production
  TypeScript checks also run in the complete test/build commands above.
- New clipping, synchronous navigation and picking regressions were observed
  failing before implementation and passing afterward. Existing assertions
  requiring a permanently tiny near or unavoidable depth collisions now check
  retained visibility, same-ray surface geometry and depth semantics.
- Independent source review found no blocking defect in bounds invalidation,
  projection synchronization, interaction reach or material ownership.

An actual 830-contact breadboard cache benchmark measured 200 navigation
updates in 3.21 ms for one board and 28.63 ms for 500 boards, with zero instance
matrix rescans during navigation or pose-only invalidation. Initial bounds
collection for 500 boards measured 62.68 ms. These are local CPU
observations, not a hardware-independent frame-time guarantee.

## Real renderer evidence

The diagnostic uses the actual SceneManager and model factories, Three r171,
WebGL2 / ANGLE Vulkan SwiftShader, a 24-bit depth buffer and a 1916×908 drawing
buffer at DPR 1. Exact pre-fix render sources and their immutable browser bundle were
retained under the ignored `apps/web/.test-build/depth-artifacts` directory.
Diagnostic recoloring is isolated from production and must preserve material
IDs and legitimate foreground occlusion when interpreting changed pixels.

The retained pre-fix causal probe found 16/421 interior Display pixels,
338/7,188 Scope panel pixels and 123/1,661 Generator panel pixels exposing
their backing. Recoloring preserves material IDs; foreground controls and MSAA
edges are excluded by same-ray masks. Changing only near `.005` to `.1` at the
same pose reduced each count to zero. `.1` is a diagnostic control, never a
production policy constant.

An isolated original-source Vue application also passed the real
Fit → 50% → trusted right-drag capture, with pinned current Display descriptor,
near `.005`, unchanged exported graph and no JavaScript errors. Evidence:
`apps/web/.test-build/depth-artifacts/before-workspace/`.

Final-source native workspace acceptance passed navigation, wire drawing/editing
and history, and empty-scene preview/place/Move/history. Earlier seven related
E2E cases also passed: pinned Display closeups, flexible placement/reanchor,
server persistence, GPU lifecycle, Labels and contact controls. Final
navigation repeated 13 stages at actual toolbar 50/100/1000%, right-drag Orbit,
middle-pan, Fit, area framing, ViewCube and Home. Graph and owned resource
identities/transforms stayed unchanged; GPU memory remained 389 geometries /
13 textures. Backend shutdown returned exit 0.

At the exact previously failing 1000% pose, near/far improved from
`.00001 / 9.73189` to `1.11138 / 8.26021`. After right-drag they improved from
`.00001 / 8.17722` to `.89456 / 7.76828`. Both final screenshots were inspected:
Display, Generator, breadboard lettering and grid are clean. A fixed 120×100
background ROI is byte-identical through empty, placement preview, committed
board and native Move, retaining 1,297 grid pixels at every stage.

Workspace artifacts/logs: `apps/web/.test-build/depth-workspace-acceptance/`:
`navigation-evidence.json`, `empty-placement-evidence.json`, `wire-evidence.json`,
`run-navigation-final.log`, `zoom-1000.png` and `zoom-1000-right-orbit.png`.
`initial-crossing-fallback/` retains failing poses/images. Render artifacts stay
in ignored test output.

The standalone pixel matrix uses camera distances 60/30/3 at DPR 1/2, distinct
from the actual toolbar percentages tested in the full application. Its final
buffers are 1280×720 and 2560×1440. Instrument and Display faces use oblique
views; breadboard printed strips use TOP so legitimate subpixel socket-edge
coverage is not misclassified as an underlayer leak. Oblique/low breadboard
views also received native workspace image inspection. Diagnostic callbacks
recolor only the underlying meshes, preserving shared foreground material
colors and opaque sort IDs. Current/historical glyph and decimal-point checks,
illumination, TOP/low views, offscreen labels and grid occlusion are separate
focused cases.

Both final distance/DPR matrices passed: **60/60 cases**, each with a nonempty
interior mask and zero backing-color leaks. They cover current 1/2/4-digit
Displays, Scope, Generator, Supply and breadboard, plus all three historical
Display packages. Results: `apps/web/.test-build/depth-artifacts/final/after-dpr1.json`
and `after-dpr2.json`. The final carrier-Z portability correction changes only
the grid vertex shader; model matrix contexts retain the same model projection
and materials. Fresh grid cases verify the final shader separately.

With the final zero-carrier shader, tight/broad clipping produces **0 changed
pixels** in a foreground region containing **34,047 grid pixels**. All **421
opaque-face samples** remain unchanged when hiding the grid. Adding, moving,
deleting models and clearing the scene each produce zero changes in the fixed
background region. Empty scenes retain 322,813 / 243,040 / 40,694 grid pixels at
actual zoom 50 / 100 / 1000%. Fresh results are `grid-clip-invariance.json`,
`grid-scene-invariance.json` and `grid-after.png` in the final directory.
The main GPU gate returned exit 0: **8 passed**, with only the optional retained
baseline capture skipped (that capture passed separately). The fresh final-shader
grid rerun returned exit 0: **2 passed**. Extracted terminal summaries and
Playwright's authoritative last-run statuses are retained as `main-run-summary.log`,
`grid-run-summary.log`, `main-playwright-last-run.json` and
`grid-playwright-last-run.json`. Owned browser/Vite test processes were shut down.

Focused checks also passed: 20 current/historical LED illumination/orientation
cases and 24 glyph/decimal-point cases all have zero backing-color leaks.
ON states illuminate 56 glyph/DP objects across the three packages; OFF states
illuminate none. An offscreen CLOCK beside the eye preserves near `23.49183`
and zero Display leaks. Evidence: `led-orbit-illumination.json`,
`glyph-decimal-point.json` and `offscreen-clock.json` in the same final directory.

Reproduce from `apps/web` after the repository's documented dependency setup:

```powershell
npm test
npm run build
npm run test:e2e -- e2e/workspace-depth-navigation.spec.ts
npm run test:e2e -- --config playwright.depth.config.ts
```

The retained pre-fix capture is optional and requires its ignored original-source
snapshot; clean-checkout regressions exercise current source independently.
