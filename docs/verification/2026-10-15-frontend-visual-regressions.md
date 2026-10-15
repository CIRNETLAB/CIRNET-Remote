# Frontend visual and UI regression fixes

Verified: 15 October 2026. Baseline: `26c648f`. Changes are uncommitted.

## Root causes and fixes

1. **DC source dispatched to the generic package.** `buildComponent()` selected any physical part before its Structure visual dispatch. `DC_SUPPLY` therefore entered `PackageFactory`'s `terminal` branch and rendered a basic DC SOURCE box. Structure supply dispatch now takes precedence and reuses `PowerSupplyModel` with the original detailed dimensions, 2.4 × 2.8 × 3.2. Its enclosure, vents, display, knobs, rocker, posts, branding and logo retain their existing geometry and base colors.
2. **Visual and electrical supply controls used different keys.** The detailed renderer's knob is named `voltage_v`, whereas the electrical source stores `voltage`. A frontend adapter now reads canonical voltage first, supports the legacy visual alias explicitly, and writes canonical `voltage` for preview and the committed history command. The DC current knob retains its mesh without a current-limit interaction. Its A/W readouts are unavailable rather than invented measurements.
3. **Studio reflection affected Structure.** The previous change assigned PMREM to `scene.environment`, adding indirect illumination to materials authored under the original direct lights. The shared component factory now sets only Structure's standard-material `envMapIntensity` to zero. Scene lights, scene environment, background, wires, Display and Instruments keep their current settings. Breadboard housing/socket geometry, textures and base colors are unchanged.
4. **Search had global scope and unconditional layout.** The palette rendered Search for every group and changed to `libraryComponents` when the query was nonempty. Search now mounts only for Logic ICs and Arithmetic ICs and always filters `active.items`. Switching groups resets the query; other groups have no search wrapper or gap.

The allowed package body/coating materials and the ADDER/MULTIPLIER bodies use a 0.90 multiplier in sRGB, converted back to Three.js linear space. Silver leads, other metallic surfaces, resistor bands, LED hue, IC markings and polarity marks retain their existing colors/material parameters. Structure, Display and Instruments are excluded. Thumbnail and workspace models share the same factory; this is a material-color adjustment, not a measured 10% rendered-pixel or perceived-brightness claim.

## Preserved boundaries

- `DC_SUPPLY` remains the same electrical type with `PLUS/MINUS`. Its descriptor, canonical pin positions, revisions and saved graph data are unchanged. A frontend visual projection aligns wire endpoints, invisible pick targets, labels and highlights with the original visible binding-post openings; the source is not breadboard-mountable. No nets are derived from geometry.
- All three Breadboard renderers retain their existing dimensions, hole geometry, contact positions, topology, snapping and docking. `BreadboardHousing.ts`, `BreadboardSockets.ts`, geometry/topology definitions and catalogs have no changes in this fix.
- No Backend, Contracts, Simulator, Hardware Service or FPGA files were changed. No components or unrelated interface features were added.

## Verification results

Run in `apps/web`:

```text
npm test
PASS: 509 tests, 0 failures, 0 skipped

npm run build
PASS: vue-tsc --noEmit and Vite production build
200 modules transformed; built in 4.91 seconds
```

Vite retains its non-fatal chunk-size warning: main JavaScript 1,397.56 kB, 364.31 kB gzip. `git diff --check` passes, with Git line-ending notices only.

The temporary capture server encountered a Windows `EBUSY` file-watch error while a historical source snapshot was being extracted inside the app tree. That QA snapshot was moved outside the app tree; a fresh Vite dev startup succeeded in 528 ms and was stopped after the smoke check. This did not affect the passing production build or introduce a source change.

New regressions cover:

- Detailed DC supply dispatch and unchanged electrical identity/pins.
- Visible post/endpoint correspondence and picking from TOP, FRONT and oblique camera positions, including rotated sources.
- Canonical/legacy voltage precedence, knob preview, a single committed history command, Undo/Redo, Save/Open and source wires.
- Structure material isolation and unchanged material response for excluded groups.
- Search visibility across all ten groups, group-only results, query reset, code/alias matching, Clear/Escape/Enter, drag and placement state.
- Allowed body tone, untouched leads/bands/markings/Display, and shared thumbnail/workspace material colors.

The full suite also exercises breadboard topology, contacts, docking, mounting, wire rendering/editing, picking and history. Independent read-only review found no confirmed P1/P2 issues in the final diff.

## Images and remaining visual acceptance

No new TOP/FRONT/oblique WebGL screenshots were captured. Browser security rejected localhost access because of a saved blocking preference. After a follow-up check remained blocked, the user explicitly chose to finish the code and report the missing images. No alternate browser or rendering route was used to bypass that restriction.

Existing repository references and the previous renderer source were inspected. They are historical evidence, not new before/after captures. Final material appearance, texture rendition and the requested 8–15% perceived-brightness decrease still require real browser comparison from TOP, FRONT and oblique views. Geometric picking tests do not replace that visual acceptance.

## Changed files

- `apps/web/src/three/ComponentModel.ts`, `PowerSupplyModel.ts`, `PackagePinLabels.ts`, `SceneManager.ts` and `apps/web/src/composables/useCircuitEditor.ts`: Structure dispatch, projected post anchors and voltage-control mapping.
- `apps/web/src/three/StudioEnvironment.ts`: Structure-only material response.
- `apps/web/src/three/package/PackageMaterials.ts`, `PackageFactory.ts`: selective body tone.
- `apps/web/src/components/workbench/ComponentRibbon.vue`: scoped Search.
- `apps/web/tests/component-search.test.ts`, `package-model.test.ts`, `package-tone.test.ts`, `structure-lighting.test.ts`, `structure-supply-regression.test.ts`: regression evidence.
