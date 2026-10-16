# net*CIRCUIT Oscilloscope · 2 channels

`oscilloscope-2ch.glb` is self-contained. `oscilloscope-2ch.gltf` uses the adjacent
`oscilloscope-2ch.bin`, `screen.png`, `legends.png` and `owl.png`; retain those files
together. No compression extension or decoder is required. Materials use core PBR
and `KHR_materials_unlit` for the screen/printed decals.

The same `src/three/OscilloscopeModel.ts` factory supplies the workspace model.
Choose **Instruments → Oscilloscope · 2 channels**, then click the surface or drag
from the palette. Selection, Move-only body dragging, X/Z and Y gizmo transforms,
Undo/Redo and circuit JSON persistence use the existing editor commands.

## Coordinate contract

- Root: `net_circuit_oscilloscope_2ch`; translation/rotation zero, scale `[1,1,1]`.
- Origin at the center of the device footprint; beveled feet soles and enclosure rear touch Y=0 on the work
  surface. Y up, front +Z.
- Catalog size: `[6,3.8,2.8]` **editor world units**, consistent with workspace
  models. These are visual dimensions, not measurements in meters or device ratings.
- `visual_chassis` pitches the entire case, screen, printed artwork, control
  pivots and BNCs backward **10°** around local X (`-Math.PI / 18`), matching the
  Function Generator. Root position, Y rotation and scale remain unchanged.
- `InstrumentChassis.ts` derives the chassis Y offset from actual vertices in
  the detached assembly. The front feet have level soles resting flush on the
  workspace plane (Y=0), and the rear edge of the pitched enclosure rests directly at Y=0.
- Catalog size describes the original front layout; the tilted assembly has a
  slightly larger projected height (below 4 world units). Editor gizmo bounds
  are measured from the full assembly.
- 16,974 triangles, 98 meshes, 7 knob pivots, three BNC assemblies: two channel
  inputs and Trig Out. GLB is approximately 1.23 MB. Shared materials, merged vents/flutes/fasteners,
  1024×704 screen, 1536×960 transparent legends and a 64×64 supplied owl decal.

## Named objects

| Object | Contract |
|---|---|
| `screen` | Independent front plane, unlit material; waveform texture slot |
| `time_div_knob`, `horizontal_position` | Horizontal knob pivot groups |
| `trigger_level` | Trigger knob pivot group |
| `ch1_volts_div`, `ch1_position` | CH1 knob pivot groups |
| `ch2_volts_div`, `ch2_position` | CH2 knob pivot groups |
| `run_stop_button`, `auto_set_button`, `single_button` | Independent button meshes |
| `default_button` | Fourth Horizontal button |
| `trigger_source_button`, `trigger_mode_button`, `trigger_slope_button`, `trigger_menu_button` | Independent 2×2 trigger button meshes |
| `power_button`, `power_led` | Bottom-left power button and separate visual status indicator |
| `ch1_bnc`, `ch2_bnc` | Separate connector assemblies, channel-colored rings |
| `trig_out_bnc` | Third aligned BNC; trigger-output role, no third input channel |
| `tilt_foot_left`, `tilt_foot_right` | Two inclined front feet with level soles resting directly on the workspace plane (Y=0) |
| `visual_chassis`, `visual_supports` | Pitched case assembly and ground-aligned supports |
| `brand_owl`, `front_legends` | Owl and original net*CIRCUIT panel legends |

Each knob group has its own center pivot; rotate its local **Z** to turn its body,
flutes, cap and index together. Rotate the instrument root about **Y** to orient
it on the bench. Button press direction is local Z. Interactive scene picking
continues to select the complete module; controls are prepared for later wiring.

## Reference layout and materials

The existing factory follows the supplied front design: a wide left screen,
stacked Horizontal/Trigger/Vertical panels on the right, four Horizontal buttons,
a 2×2 Trigger button bank and independent CH1/CH2 columns. Three BNCs share one
row beneath the display; the power button and LED occupy its lower-left corner.
Two inclined front stands replace the former four cylinder feet.

The case is cool industrial silver `#a1aab4` (metalness 0.32, roughness 0.54),
the frame is matte charcoal `#30383e` and the inset panels are `#272e33`.
`SCOPE_LAYOUT` in `OscilloscopeArtwork.ts` owns front coordinates for geometry,
printed CanvasTexture/PNG legends and the regenerated SVG palette preview.
Housing silhouettes retain two bevel subdivisions; small panels/buttons use one.
The model does not reuse the Power Supply control layout.

The initial yellow square trace and cyan sine trace are **illustrative previews**.
No acquisition, sample rate, bandwidth, physical pinout or working button behavior
is implied. The visual-only catalog entry creates no logical electrical ports.

For a GLTFLoader-imported screen, assign a reused CanvasTexture with
`colorSpace = SRGBColorSpace` and `flipY = false` (glTF image-top UV convention).
Set `texture.needsUpdate = true` after repainting; dispose the replaced texture
once. The procedural workspace factory already provides a CanvasTexture using
the normal Three.js `flipY = true` convention. Neither requires geometry rebuilds.

## Regenerate and inspect

From `apps/web`, after `npm ci` (`sharp` is a development dependency):

```text
npm run export:oscilloscope
```

If sharp is installed elsewhere, use
`npm run export:oscilloscope -- --sharp-module /absolute/path/to/sharp`.
The script exports geometry through Three's GLTFExporter and rasterizes the same
shared drawing recipe used by the live CanvasTextures. It also regenerates the
original SVG palette preview. No external image service or model download is used.

Run `npm test` for names, pivots, geometry budget, catalog/graph/gizmo integration,
GLB buffer/PNG validation and GLTFLoader round trips. For development WebGL
inspection, run Vite and open `/oscilloscope-preview.html`: it loads the delivered
GLB through the revision-checked shared provider and provides front/side/angled
views over a Y=0 grid and a CanvasTexture replacement test. This standalone asset
viewer is included in production builds and adds no navigation to the single
workspace application. The main workspace keeps its current procedural coating
materials; this delivered export retains its older housing finish. See
`docs/verification/2026-10-16-w5-assets.md` at repository root for the asset
ownership decision.

The regression suite verifies enclosure pitch, root transform preservation,
ground clearance, actual case/stand/pad surface intersections, centered pivots,
gizmo integration and both exported formats. The same assertions run after
GLTFLoader round trips, so stale upright exports cannot pass.
