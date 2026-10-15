# Component visuals and authoring verification

Date: 15 October 2026. Work was implemented in the existing `refactor` worktree and left uncommitted. The user's adopted Pasted text.txt supplied the requirements; the component visual audit supplied evidence to investigate.

## Implemented behavior

- Package construction is split into factory, continuous swept round/ribbon leads, materials, bodies, markings and property appearance modules under `apps/web/src/three/package/`. DIP markings use short codes. Bodies, opaque LED shells and display depth separation were revised. Pin pitch, anchors, definition/package revisions and saved mount identities remain unchanged.
- Scene and thumbnail rendering use owned neutral PMREM environment resources. R/C edits update bands and value markings in place, preserving the body and unrelated models. Pin labels appear on hover or Show pins. These changes retain demand-driven rendering.
- Physical palette and Component Info previews use the same package factory through one shared, serialized thumbnail renderer with cache leases, cancellation, fallback and disposal. Cards do not create separate WebGL contexts.
- Component Info provides R/C unit-aware draft fields, Update, Cancel, Add and Delete. Update is one history command; Add carries the validated draft into an independent instance. LED and DIP Add are also covered, without invoking the R/C form.
- `resistanceOhms`, `powerWatts`, `tolerancePercent`, `capacitanceFarads` and `voltageRatingVolts` are numeric design properties across Web, files, Python and API. The explicit legacy normalizer migrates `resistance_ohm` only for resistors, with canonical-key precedence. It preserves mounting, wires and unknown legacy metadata.
- Five-band paint uses three significant digits, multiplier and tolerance. 220 ohms, 1 kilohm, 4.7 kilohms and 100 kilohms have exact regression fixtures. Power is independent of the bands. Nonrepresentable values retain their exact design value and produce a warning; zero ohms is rejected.
- All 37 requested logic codes are present and searchable, including CD4013 in Logic ICs. The registry has 55 physical parts and 76 total editor definitions. Exact TTL/LS/HC/CD4000 identities are explicit; the existing HC/LS IDs, revisions and pin maps remain intact. No requested pinout is outstanding.
- Palette Search covers code, aliases and function without changing selection or placement. The grid has bounded scrolling, empty state, keyboard navigation, clear and Escape. Memory, Logic tools and Embedded are hidden from normal menus/Add, while legacy definitions and file parsing remain available. Arithmetic remains visible.
- The generated `editorParts.json` excludes execution/manufacturer/datasheet/provenance fields. Authoring and rendering use descriptors and instance properties. Optional execution profiles remain in full development/runtime snapshots; existing simulator behavior is preserved. A stub result provider feeds the same renderer through `ExecutionPresentationResult`.
- SafetyGate, HardwareProfile and the existing validation/compiler/HardwareStation route were retained. No solver, physical analog model or FPGA capability was added.

The per-code manufacturer source matrix and exact selected families are in [the registry README](../device-library/parts/README.md). Independent pin fixtures are in `tests/fixtures/logic-pinouts.json`. Units, defaults, validation and migration rules are in [the design-model contract](../contracts/design-models/README.md).

## Verification

Commands run from the repository root unless indicated otherwise:

```text
python scripts/sync_editor_catalog.py --check
  PASS: 76 editor definitions, 55 physical parts; generated snapshots current.

PYTHONPATH=.;simulator/circuit-simulator;services/api;services/hardware-service
.audit-runtime/Scripts/python.exe -m pytest services/api/tests tests/contracts \
  simulator/circuit-simulator/tests tests/frontend/test_editor_catalog.py \
  tests/frontend/test_physical_catalog.py tests/frontend/test_logic_catalog.py \
  services/hardware-service/tests tests/integration/test_virtual_lab_execution.py \
  --basetemp=.build/pytest-visuals-final -q
  PASS: 411 tests, one existing Starlette/httpx deprecation warning.

apps/web: npm test
  PASS: 498 tests, no failures.

apps/web: npm run build
  PASS: vue-tsc and Vite production build; 200 modules transformed.
  Vite reports a non-fatal large-chunk warning (main JavaScript 1,395.19 kB).

git diff --check
  PASS; Git emits line-ending conversion notices for some files.
```

The independent integration review found an Add failure for physical parts without an R/C form. The form is now mounted only for R/C types; actual compiled Component Info regressions cover resistor, both capacitors, LED and DIP. A full-suite test exposed a pre-existing shared SFC output-file race between parallel test workers; worker-specific runtime paths fix it without weakening assertions. The 19 affected UI regressions pass together.

Coverage includes property/store/renderer integration, five-band colors, instance isolation, history, Save/Open, mounted pin bonds and nets, unsupported execution profiles, result-driven display, menu/Search compatibility, exact pin maps, API preservation, and thumbnail resource lifecycle. These checks establish behavior and structural invariants; they do not establish final visual quality.

## Visual verification still outstanding

No new real-browser screenshots were captured. Local browser access was explicitly denied earlier in this conversation, and that restriction was not bypassed. Top, oblique, side and close-up inspection of DIP, resistor bands, both capacitors, transistor, diode, LED, switches and all three displays remains unverified. In particular, final lead highlights, seams, material appearance and close-zoom display artifacts require actual WebGL inspection. Thumbnail GPU output is also unverified on the user's browser; fallback/lifecycle behavior is tested.

## Main changed areas and limits

- `device-library/parts/`, `scripts/sync_editor_catalog.py`, generated Web/contract catalogs and pin fixtures: catalog, provenance and lean authoring data.
- Web component windows, palette, stores and file services: Search, generic R/C editing, migration, history and result presentation.
- `apps/web/src/three/`: package geometry/appearance, labels, neutral environment and shared thumbnails.
- `contracts/`, API boundaries and the simulator profile accessor: property preservation/validation and optional execution metadata. Existing execution mathematics and hardware safety boundaries are unchanged.
- Web/Python regression suites and implementation/verification documentation.

Placeable/wireable new ICs do not imply simulator or FPGA support. Generic R/C editing does not resize packages or command real hardware. Unrelated document moves/deletions that appeared concurrently in the workspace were left untouched and are outside this implementation.
