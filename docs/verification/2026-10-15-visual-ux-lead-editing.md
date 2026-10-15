# Visual/UI fixes and lead appearance editing

Date: 15 October 2026. Baseline: `315ad15`. Changes remain uncommitted; no merge or push was performed.

## Evidence and root causes

The seven supplied screenshots were compared with the source. The supplied 26-second, 1918×910 recording was decoded locally into seven frames spanning the recording; these are original user evidence, not captures of the changed application. They show view-dependent highlights on instrument paint and diagonal artifacts on the dark Power Supply display during Orbit.

Two distinct causes were investigated:

- **Coating response:** several instrument paint/plastic materials used metalness 0.12–0.48 and roughness 0.36–0.57. Direct lights and the neutral PMREM environment then produced a relatively narrow moving specular highlight. Coatings now use a dielectric response, roughness at least 0.8 and restrained nonzero environment response. Exposed BNCs, collars, screws and package leads retain their separate metallic finish. Scene lights, environment, camera, Orbit controls, instrument geometry and artwork were not changed.
- **Near-coplanar surfaces:** the Power Supply screen is an unlit MeshBasicMaterial, so its diagonal interference cannot be explained by PMREM highlights. Its separation from the backing surface is only 0.0015 world unit; Scope/Generator screen separation is about 0.0045, with printed button overlays about 0.001 apart. A regression using the existing near/far settings and a 24-bit depth model reproduces equal quantized depth at multiple recording-like angles/distances. Material polygon offset stabilizes the existing screen/legend layers with depth testing retained. No vertices, screen pixels, waveform, knob, camera or global depth setting was changed. Actual GPU depth format and the final rendered result remain unverified.

Breadboard artwork had a nearly white `#fafbfc` background and CanvasTexture lacked its sRGB color-space declaration. Together with its material response this made the plastic appear much brighter than intended. The deck/artwork now share neutral off-white `#d5d6d3`, correct sRGB conversion, matte roughness and a small environment contribution. Rail/coordinate ink and socket geometry are preserved. Baseline SHA256 regressions cover all geometry attributes, normals, UVs, indices and contact instance transforms for all three boards.

The thumbnail cropped models through a combination of intrinsic image/grid minimum sizing and a short clipped preview frame. It also used brighter photographic lighting and ACES exposure rather than Workbench lighting. The preview now uses constrained flex sizing and `contain`; its height is responsive and bounded. Camera fitting uses visible transformed mesh/instance bounds including leads, excludes hidden targets and overlays, recenters the projected silhouette and sets valid clipping planes. Thumbnail lights, tone mapping, exposure and environment intensity match Workbench. The existing shared cache, serialized renderer, leases and disposal remain in place.

## Resistor and lead editing

Only the resistor coating changes from beige to subdued metal-film blue (`#467697` before the existing color adjustment). Its five exact bands, rounded geometry and silver leads are retained; diode color is unchanged. Resistance/tolerance updates still change the bands in place.

Component Info now offers an explicit **Edit Leads** mode for `RESISTOR_AXIAL`, `CAPACITOR_CERAMIC` and `CAPACITOR_ELECTROLYTIC`:

| Instance property | Values / bounds | Default when omitted |
| --- | --- | --- |
| `leadForm` | `straight`, `formed90`, `offset-s` | `formed90` |
| `leadLengthMm` | 0–4 mm of extra visual formed slack | 0 |
| `bodyLiftMm` | 0–6 mm of additional body lift | 0 |

These are frontend appearance properties stored with the instance, not manufacturing dimensions or electrical changes. Extra length is a bounded slack control, not a claim to measure exact total wire length. Straight uses a direct span with the required insertion/body-entry sections and requires zero extra slack because its endpoints stay fixed.

Draft changes preview in the Component Info thumbnail. They do not mutate CircuitGraph or workspace geometry until Update. Update creates one history command; Reset changes the draft to defaults; Cancel/Escape discards it. Selection changes and closing/reopening the window discard the mode. Add carries the current R/C and lead drafts into an independent placement. No canvas drag handles or new Orbit/Move/Wire gesture were added.

Omitted properties preserve the previous paths. Editing a mounted part holds canonical pin tips, picking targets, contact bindings and wires fixed; changing holes still requires normal mounting validation. The renderer replaces and disposes only that model's two lead sweeps, keeps its body/material resources and peers, moves its body markings with body lift, and refreshes selected bounds/outline when geometry changes. Value-only edits allocate no lead geometry. Old files, Undo/Redo and Save/Open remain covered.

Finite ranges, enum types and Straight/slack coupling are checked before store commits and file acceptance. No descriptor, footprint, pin number, mounting contract, topology or electrical net was changed. Backend, Contracts, Simulator, Hardware Service, FPGA and Safety Gate have no changes in this task.

## Verification

Run in `apps/web`:

```text
npm test
PASS: 531 tests, 0 failures, 0 skipped; 28.82 seconds.

npm run build
PASS: vue-tsc --noEmit and Vite production build.
204 modules transformed; built in 5.16 seconds.

git diff --check
PASS; Git emits line-ending notices only.
```

Vite retains its non-fatal large-chunk warning: main JavaScript is 1,406.49 kB (367.37 kB gzip). Focused RED→GREEN regressions established the missing editing mode, invalid-field rejection, framing/containment, coating behavior, depth bias and lead bounds before their fixes. Independent review found no confirmed P1/P2 issues in the final implementation.

Coverage includes a full 360° camera Orbit without graph/resource changes, projected thumbnail containment for short/tall/long/detailed models, five-band paint, all three R/C types and lead forms at boundary values, insertion clearance, concealed body entry, geometry ownership/disposal, mounted endpoint/net preservation, one-command history, Save/Open, invalid input, preview/Add independence, selection/close/Escape handling, plus the existing gesture, wire, zoom, docking and Search suites.

## Visual acceptance still outstanding

No new browser before/after screenshots were captured. The saved browser permission blocked localhost in this conversation; the user's preceding choice was to finish code and report missing images. This restriction was not bypassed with another browser or render path.

The original screenshots/video establish the reported problems; numerical depth tests, model projection and CSS containment tests establish source-level corrections. They do **not** establish final visual acceptance. TOP, FRONT, oblique and close-up renders, 360° pixel stability, and actual Component Info layout at 1280×720 and 1920×1080 remain to be checked in a real browser. No CPU image or extracted input-video frame is presented as an after-render.

## Changed areas

- `StudioEnvironment.ts`, package materials and instrument model material constructors: local coating response and thin-surface depth bias.
- `BreadboardHousing.ts` and Breadboard texture code in `ComponentModel.ts`: color/color-space response only.
- `PackageThumbnails.ts`, preview CSS and Component Info properties: visible-geometry fit, containment, matching lighting and draft preview.
- `leadProperties.ts`, `ComponentLeadForm.vue`, property normalization/store boundaries: appearance-only validated draft editing.
- `LeadGeometry.ts`, `PackageLeads.ts`, package factory/appearance and selected-outline reconciliation: continuous owned geometry and fixed contacts.
- Regression tests: material/depth, thumbnail framing, lead geometry, lead form integration and existing affected material assertions.
