# Editor descriptors and instance properties

Signal domains and typed local dispatch are described in
[`signal-domains-and-simulation.md`](../../docs/architecture/signal-domains-and-simulation.md).
Run `scripts/sync_editor_catalog.py` to refresh their shared port-domain
projection after changing canonical component metadata. Saved graph versions and
unknown metadata remain preserved; declarations do not grant an execution model.
The event scheduling budget may reach 1,000,000; digital capture remains bounded
to 100,000 observations. Excess capture changes raise `CAPTURE_LIMIT`, with no
partial/truncated capture returned (the Hardware Service reports `UNEXECUTABLE`).

The canonical library is `device-library/parts/physical-parts.json`. Run
`python scripts/sync_editor_catalog.py` after changing it. The generated
`apps/web/src/data/editorParts.json` contains the editor descriptor: identity and
revision, short label/function, package/footprint, pin IDs and roles, polarity,
and property parameters/defaults. Development provenance and optional execution
profiles remain in the full registry snapshots. Rendering, placement, mounting
and property editing do not require an execution profile.

R/C instances describe configurable generic components. Historical definition
and package IDs remain stable for saved mounting bindings; editing a value does
not assert that a particular manufacturer's fixed SKU has changed its ratings.
Changing R/W/tolerance/C/V does not change the package, pin identity or footprint.
These values are design properties, not measurements or hardware commands.

| Type | Canonical numeric property | Unit | Accepted range | New-instance default |
|---|---|---|---|---|
| `RESISTOR_AXIAL` | `resistanceOhms` | Ω | 0.1–1,000,000,000 | 330 |
| `RESISTOR_AXIAL` | `powerWatts` | W | 0.001–100 | 0.25 |
| `RESISTOR_AXIAL` | `tolerancePercent` | % | 0.001–20 | 1 |
| Both capacitor types | `capacitanceFarads` | F | 1e-12–1 | ceramic 1e-7; electrolytic 47e-6 |
| Both capacitor types | `voltageRatingVolts` | V | 0.1–10,000 | ceramic 50; electrolytic 25 |

The property form converts engineering units to numeric SI values before saving.
Empty fields, strings in stored canonical fields, booleans, NaN, infinity and
out-of-range values are rejected. Older instances may omit newly added fields
and resolve them from descriptor defaults. Each edited instance owns its own
property values. Unknown legacy metadata remains preserved.

`contracts/component_properties.py` supplies semantic property validation and
explicit migration. Only `RESISTOR_AXIAL.properties.resistance_ohm` is migrated
to `resistanceOhms`; an existing canonical value takes precedence and the old key
is removed from the normalized copy. The typed API model, Web file/store
boundaries and virtual compiler entry apply this migration. The renderer reads
the canonical spelling. No migration changes module IDs, part/package revisions,
mount contacts, endpoints, connections or wire metadata. The mounted legacy
fixture is `fixtures/legacy-component-properties.json`.

Five-band resistor paint uses three exact digits, a multiplier and a separate
tolerance band. 220 Ω = 220×10⁰, 1 kΩ = 100×10¹, 4.7 kΩ = 470×10¹ and
100 kΩ = 100×10³. A value requiring more than three significant digits, an
unsupported multiplier or an unsupported tolerance color keeps its design value
and reports that it cannot be painted exactly. Values are never silently rounded
to fit a color code. Zero ohms is rejected; a jumper needs its own component.

# Optional execution presentation

`contracts/execution_profiles.py` adapts the full registry to the existing
simulator. Declared profiles are preserved. A missing profile becomes explicitly
unavailable and produces `UNSUPPORTED`/unknown pin values instead of invented
electrical behavior. This data adapter adds no solver and does not replace
HardwareStation, safety checks, hardware profiles or the execution compiler.

The existing `/api/circuits/physical-preview` endpoint and the generic Web
`ExecutionPresentationResult` use the same presentation shape:

```json
{
  "device_states": { "D1": { "state": "ON" } },
  "pin_values": { "D1.A": 1 },
  "diagnostics": []
}
```

Device state may include a reason and reported values; `model` is optional. The
renderer consumes supplied states and never calculates a current, voltage or
truth table. The function adapter type in
`apps/web/src/services/execution/presentation.ts` permits a result provider to
feed that shape into the existing renderer. Physical execution continues through
the established validation/compiler, Hardware Service and HardwareStation path;
raw CircuitGraph is not an FPGA register command.
