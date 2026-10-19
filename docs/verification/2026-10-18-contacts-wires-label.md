# Contacts, deep insertion, continuous wires and visual Label

> Historical evidence status — 2026-10-19 audit: command outputs, Git state and local artifact locations below describe the original session. They do not report this audit’s results or authorize new output under `.build`, `.superpowers`, `.test-build` or `docs/verification`. For reruns use [VERIFICATION.md](../VERIFICATION.md); generated visual and raw diagnostic artifacts must start outside the repository. Existing outputs await separate owner review and have not been deleted or moved.

Baseline: `e41c260`. Scope: the approved `PROMPT_CODEX_Model_3D_SS12D10_Day_Dan_Label_netCircuit.md` and its twelve reference images. Source is left uncommitted for the user.

## Geometry and provenance

All dimensions below are mm; world scale remains `.13 / 2.54`. Envelope excludes standoff and leads. Mesh bounds, ray intersections, solid closure and electrical anchors are checked by the dedicated contact/insertion tests.

| Package | Implemented envelope/detail | Provenance and CAD distinction |
|---|---|---|
| SS12D10 slide | Case 12.7 × 6.8 × 6.4; complete height 10.4; knob 2.8 × 2 × 4; travel ±1.1; actual 6 × 2.6 slot | Supplied Swiclick envelope/travel; new `SS12D10_BREADBOARD_ADAPTED_V1` contacts −5.08/0/+5.08 are an explicit virtual adapter, not verified native terminals. Steel .25 and insulating base .8 lie inside case height. |
| B3F tactile | 6 × 6 × 3.4 case; total 4.3; Ø3.5 button; .25 press travel; four Ø.65 rivets | Supplied Omron dimensions; black button, rivets and .7 × .3 stamped legs are CAD choices. Native 6.5 × 4.5 footprint differs from formed virtual 7.62 × 5.08. |
| Raised DIP4 | 12.2 × 6.6 × 3.4 case; total 4.4; four actual 1.7 × 3.8 recesses .7 deep; white 1.4 × 1.6 actuators; ON/1–4 | Distinct raised CAD identity retains original flat A6D identity and pin pairs 1–8/2–7/3–6/4–5. Pitch 2.54, rows 7.62; .5 × .25 stamped tails. |
| Seven-segment 1/2/4 | 12.7 × 19.05 × 8; 25 × 19.05 × 8; 50.3 × 19 × 8.1; common 14.22-high glyph, 1.5 stroke, round Ø1.5 DP, 8° shear | Supplied Kingbright single-digit dimensions; double/quad envelopes and 10/18/12-pin mappings retain catalog data, without a new native-fit claim. Ivory case, charcoal face and light OFF diffusers stay inside envelope. |
| PS1240 buzzer | Ø12.2 × 6.5; actual blind Ø3 opening with 1.5 depth and retained floor | Supplied TDK envelope; mouth dimensions/shoulder .25 are CAD. Native pitch 5 differs from formed virtual 5.08. No fabricated polarity, audio or active driver. |
| Wire | New insulation Ø1.50, core Ø.62; preferred bend radius 2, minimum 1 | Supplied hookup-wire diameters; radii and insertion are CAD. Existing custom diameters/colors persist. Continuous line/arc sweep, annular insulation end faces and the same centerline for core, envelope and picking. |
| Label | Rounded .1-thick sheet, corner .3, bottom deck +.15; ≤60 × 25; bounded ≤1024px bitmap | Visual-only CAD note with sole world pose in module.position/rotation and optional visual boardId. Plain Unicode text ≤256 codepoints/four lines; requested font 2–6 auto-fits. |

Board mechanics profile V1 retains deck .330 and canonical contact .309. Tip = deck −3mm ≈.176457; cavity floor = deck −3.5mm ≈.150866; tip/floor clearance .5mm. Tests inspect real 830/630/100 socket instances and rear housing. All 22 current rigid package families and flexible discrete leads preserve canonical anchors on translated/yawed boards. Correct-cavity exceptions are narrow; wrong-hole, plastic crossing, floor penetration, touching leads and finite short-budget failures remain enforced. Banana/BNC and unmounted packages do not receive deep extensions.

## Compatibility and behavior

New packages explicitly opt into versioned insertion metadata and finite lead budgets. Historical part/package/footprint and mechanical-profile descriptors remain frozen and resolvable. Old documents keep original body poses and shallow conductor behavior; the existing explicit Rebuild geometry workflow validates before one Undoable commit. The prior sealed discrete/DIP/TO92 improvements, resistor 4.90 × Ø1.75 and five-band blue `#4A90E2` are retained.

SS12D10 uses the existing passive contact model: pin2 common, false→2–3, true→2–1. DIP switches retain independent bits. OFF/UNKNOWN display segments remain unlit; actual observed common/segment pin levels are required for illumination. Existing unsupported per-diode/multiplex execution gates remain unsupported. No physical hardware capabilities were added.

Ceramic and Electrolytic Capacitor are separate existing types/menu entries with separate thumbnails. Ordinary Type conversion is removed; value updates preserve family, pin IDs, ratings, tolerance and metadata. Legacy migration readers remain.

Label is a normal persistent visual-only module with no pins, net, physical mount or occupied hole. Rendering, compact properties, native pointer placement, selection, double-click editing, Move/Rotate/Duplicate/Delete and history use existing document commands. A board move/yaw carries associated notes atomically; board deletion detaches notes at their world pose; copying board+notes remaps association IDs. Font readiness updates live text in place; shared bitmap leases and owned geometry are disposed deterministically. Netlist/domain/execution and API persistence invariants are tested.

## Latest reference-image pass

The five additional user images supersede the first cosmetic pass for Contacts. The SS12 now has a genuinely punched steel wrap (side windows and U relief), black inner case/end faces/base and five raised knob ribs. The tactile cap has rounded corners, a real button opening, domed retaining heads and a molded button lip/seat. DIP4 now separates the white caps from their guide stems and track, with naturally proportioned fitted ON/1–4 lettering. These are cosmetic CAD details within the same approved envelopes, travel, footprints and closed lead exits. No camera, global lighting or Instrument materials were changed. Existing historical parts still require explicit Rebuild geometry to opt into changed mechanical profiles.

Native visual review also caught diagonal self-shadow banding on the .03mm display face. The enclosing case continues to cast its shadow; only the printed face stops casting into the shadow map and still receives external shadows. Fresh single/double/quad closeups verify the smooth face after this local fix. Geometry, dimensions, materials and electrical evidence did not change.

## Verification record

| Gate | Result |
|---|---|
| Full Python, `.audit-runtime/Scripts/python.exe -m pytest -q -rs` | **1194 passed, 1 skipped**, 307.26 s. Skip: Icarus/vvp unavailable locally at `tests/fpga/test_lab_first_control.py:68`; FPGA CI requires it. Existing Starlette/httpx deprecation warning. |
| Contact geometry/package/tone tests after the five-image pass | **43 passed**; real panel holes/U relief, domes, ribbed knob, natural legend aspect, dimensions, contacts, resources and old/new color contracts. |
| Captured tactile history regressions | **17 passed**; release/cancel/tab switch/delete/intervening edits and Undo/Redo cannot re-latch a captured press. Explicit authored/imported states remain ordinary data. Captured momentary changes validate and refresh graph revisions but consume no authored Undo entry. |
| Board/continuous-wire/interaction regression group | **61 passed**; rounded peer insulation, bounded common-endpoint convergence, mode/bend/order feasibility and atomic rejection remain enforced. |
| Final legacy preview/copy fixture group | **21 passed**; all eight stale positive fixtures now use physically feasible spacing/routing, preserving knots, ownership, endpoints, history and negative cases. |
| Native Label and Contacts, `npm run test:e2e -- e2e/labels-contact-interaction.spec.ts` | **3 passed**, 2.7 min. Actual native mouse/keyboard actions, full Undo/Redo, Unicode, cancel, board copy/remap/move/yaw/delete-detach, local recovery, API save/readback and server reload; SS12 both states, independent DIP bits and tactile press/release/cancel. |
| Native geometry/resource gallery, `npm run test:e2e -- e2e/contacts-wires-gallery.spec.ts` | **1 passed**, 6.9 min (before adding the separate display recapture test). Actual mesh heights, 3mm insertion/.5mm floor clearance, round DPs, OFF evidence, real slots/recesses/blind mouth, Ø1.50 and custom Ø1.10 wire annuli, ten native document add/remove cycles and unmodified export. |
| Native capacitor authoring, `npm run test:e2e -- e2e/flexible-placement.spec.ts --grep "generic property drafts"` | **1 passed**, 2.8 min. Both independent capacitor entries/thumbnails, no ordinary Type selector, actual drag-drop/two-hole placement, upright 47µF electrolytic with PLUS/MINUS and ceramic A/B, plus draft and multiview images at 1280×720 and 1920×1080. |
| Final native display/cutaway, `npm run test:e2e -- e2e/contacts-wires-gallery.spec.ts --grep "native display face"` | **1 passed**, 1.7 min. Latest smooth single/double/quad faces with unchanged dimensions and actual OFF diffusers; diagnostic terminal cutaway with unrelated packages hidden and the saved graph unchanged. All native runners shut down their owned API cleanly, exit 0. |
| Test and E2E typechecks | `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.tests.json` and `-p tsconfig.e2e.json`: passed; E2E check repeated after the final capture-spec update. |
| Catalog, generated contracts, breadboard snapshots, public compatibility and context | Passed the repository `--check`/verification scripts. Catalog: 86 editor types, 64 current physical parts. |
| Full frontend suite, `node .test-build/test-bounded.mjs` | **1266 passed, 0 failed, 0 skipped**, 119.63 s; complete repository test list with four workers. Final log: `apps/web/.test-build/full-web-final.log`. Includes the final display-shadow change. |
| Production build, `npm run build` | **Passed, exit 0**: application `vue-tsc --noEmit` and Vite, 336 modules; Vite build 10.23 s. Vite reports the existing large-chunk advisory (main 5,782.12 kB / gzip 613.06 kB); no build error. |

The standard frontend command initially encountered sandbox loopback `EACCES` in API/proxy tests. Those files passed with local-server permission. Full frontend verification uses the same complete test list and esbuild bundling with four workers, through an ignored temporary copy of `scripts/test.mjs`; the production test runner is unchanged. The final log is `apps/web/.test-build/full-web-final.log`. Interrupted redirected/unbuffered Python attempts are not counted as passes.

Native Label/Contacts PNGs, JSON and three videos are retained in `apps/web/.test-build/labels-contact-evidence/`, outside Playwright's per-run cleanup. Gallery measurements, images and repeated-cycle resource records are retained separately in `apps/web/.test-build/contacts-wires-gallery/`; capacitor draft/placement/multiview captures are in `apps/web/.test-build/capacitor-native-evidence/`. These are locally generated artifacts; rerun the committed E2E specs to recreate them.

## Native resource measurements

Chromium/SwiftShader, actual 1920×1080 editor scene: two boards, seven mounted target packages and three wires. The observer wraps the original renderer only to read `renderer.info`; model edits, camera changes, importing and captures use the existing editor. This is a warmed **current-scene before/after lifecycle comparison**, not a claimed benchmark against the historical renderer; no FPS was inferred.

| Measurement | Warm scene | With seven extra packages + one Label | After removal, each of all ten cycles |
|---|---:|---:|---:|
| GPU geometries | 177 | 341 | 177 |
| GPU textures | 9 | 15 | 9 |
| Draw calls | 170 | 327 | 170 |
| Triangles | 160,094 | 220,392 | 160,094 |

All ten cycles returned exactly to the same resource/draw counts. The final diagnostic cutaway restores original geometry and disposes temporary cut surfaces. In-place Label text editing/cache disposal is covered by the focused renderer tests and the separate native interaction flow; the table describes bulk native document add/remove cycles. The first terminal closeup was occluded by SS12, so a separate unoccluded native cutaway hides unrelated packages while retaining the actual conductor, socket walls and floor. Mesh-derived numeric checks independently verify the annulus, 3mm tip and .5mm floor clearance.

Native Contacts views retained for review: `slide-native-oblique.png`, `tactile-native-detail.png`, `dip-native-detail.png` and `dip-native-oblique.png`. Display shadow diagnosis retains the original `*-native-detail.png` and corrected `single-native-final.png`, `double-native-final.png`, `quad-native-final.png`. `display-face-native-evidence.json` records the final rerun; `wire-terminal-unoccluded-native-final.png` is its restored-after-capture diagnostic cutaway. These captures are original editor output, without image postprocessing.

Final HEAD remains `e41c260`; no source was staged or committed. Suggested commit:

```text
feat: refine 3D contacts, wiring and visual labels

- Remodel switches, seven-segment displays and buzzer
- Add versioned deep insertion and continuous wire geometry
- Add Label editing and separate capacitor menus
```
