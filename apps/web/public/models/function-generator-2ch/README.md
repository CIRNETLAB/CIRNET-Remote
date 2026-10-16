# net*CIRCUIT L1571979 — Function Generator 2 CH

Reference-based bench instrument for the existing Three.js workspace. The front
layout follows the supplied design; `L1571979` is the requested model name.
Silver powder-coated enclosure (`#a1aab4`, metalness 0.32, roughness 0.54), matte
charcoal bezel/panels (`#30383e` / `#272e33`) and gently beveled edges.

## Coordinate and integration contract

- Root `net_circuit_function_generator_2ch`, unit scale, center-bottom origin.
- Y-up, front +Z, catalog size `[6,3.6,2.8]` in editor world units.
- `visual_chassis` contains every case/front detail and local control pivot;
  it pitches backward **10°** around local X (`-Math.PI / 18`). The root retains
  its supplied position, Y rotation and scale for editor transforms.
- `InstrumentChassis.ts` measures actual detached-assembly vertices to derive
  the chassis Y offset. The horizontal bail crossbar and the rear edge of the
  pitched enclosure rest directly and flush on the workspace plane (Y=0).
- Catalog type `GENERATOR`, Instruments family, `visualOnly: true`, no logical ports/parameters.
- Palette click arms placement. Existing selection, Move-only body dragging,
  X/Z/free/Y gizmo and graph Undo/Redo manipulate the complete instrument.
- Screen values, ON badges, waveform previews and indicator colors are
  illustrative artwork. DDS synthesis, switching, counter acquisition and
  physical ratings are separate future contracts.

## Separate objects

| Objects | Purpose |
|---|---|
| `enclosure`, `front_bezel`, `front_panel` | Metal case and front surfaces |
| `screen` | Independent unlit plane, 1024×768 CanvasTexture: yellow CH1 sine/cyan CH2 square; Frequency/Amplitude/Offset/Duty/Phase for both |
| `brand_owl`, `front_legends` | Supplied favicon owl, brand/model/description/control labels |
| `soft_key_1` … `soft_key_6` | Six vertical keys with separate `_led` meshes |
| `waveform_button`, `sweep_button`, `vco_button` | Top function row |
| `counter_button`, `system_button`, `utility_button` | Middle function row |
| `ch1_button`, `ok_button`, `ch2_button` | Bottom row, colored CH1/CH2 frames and `_led` meshes |
| `encoder_knob` | Centered local-Z pivot, including body/flutes/cap/finger recess |
| `encoder_led_arc`, `left_button`, `right_button` | Curved LED dots and arrow keys |
| `ch1_output`, `ch2_output`, `sync_counter` | Hollow BNC assemblies, yellow/cyan/green rings; Sync/Counter is not a third channel |
| `power_button` | Round key with light ring and power glyph |
| `tilt_stand` | Inclined hinged bail resting directly on the workspace plane (Y=0) |
| `visual_chassis`, `visual_supports` | Pitched case assembly and ground-aligned supports |

Animate `encoder_knob.rotation.z` to rotate around its own center. Buttons expose
`interaction: 'button'` / `pressAxis: 'Z'` for later bindings. These parts currently
select the entire module; they do not yet alter generated waveforms.

Reuse/redraw a workspace screen's canvas and set `texture.needsUpdate = true`.
For a loaded GLB/glTF, a replacement CanvasTexture uses `SRGBColorSpace` and
`flipY = false`, matching image-top V=0 UVs. Dispose replaced maps and remove model
resources through `disposeObject`.

## Reproducible assets

From `apps/web`:

```bash
npm ci
npm run export:generator
npm test
npm run dev
```

Open `/function-generator-preview.html` to verify the actual delivered GLB,
switch front/side/angled views over the Y=0 grid and test CanvasTexture replacement. This is a
asset entry, separate from application routing and included in production builds.
The shared provider verifies its SHA-256 revision and byte bound, shares pending
loads, and releases owned resources when the viewer closes. The main workspace
keeps its current procedural coating materials; this delivered export retains its
older housing finish. See `docs/verification/2026-10-16-w5-assets.md` at repository
root for the asset ownership decision.

Source of truth: `src/three/FunctionGeneratorModel.ts` (geometry),
`FunctionGeneratorArtwork.ts` (layout/decals), `InstrumentArtwork.ts` (Canvas/SVG),
`scripts/export-function-generator.mjs` (export) and
`tests/function-generator.test.ts` (placement/history/layout/pivot/budget/round trips)
and `tests/instrument-chassis.test.ts` (pitch, root pose and physical support contact).

The export regenerates self-contained `function-generator-2ch.glb`, external
`.gltf` + `.bin` + `screen.png`/`legends.png`/`owl.png`, `preview.svg`, `preview.png`
and authored palette icon `src/assets/icons/function_generator_2ch.svg`.
PNG decals share the live CanvasTexture recipe. The front SVG/PNG are illustrations;
the GLB viewer shows actual geometry and materials.

Budget: **18,086 triangles, 88 meshes, approximately 1.47 MB GLB**. Repeated vents, grips,
bumpers, LED dots and encoder flutes are merged. sharp is an offline authoring
dependency only. Tests round-trip both exported formats through GLTFLoader and
verify embedded PNGs, named nodes, UV orientation, centered pivots, enclosure
pitch and actual ray intersections between case, stands and ground pads.
