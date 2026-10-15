# Physical components implementation and verification

Implemented on 15 October 2026 in the existing refactor worktree. Source changes remain uncommitted for the user to review and commit.

## Behavior and compatibility

The editor offers 19 exact physical variants alongside the 21 legacy definitions. The physical palette uses canonical part pins and package dimensions rather than logical input/output layouts. The [part matrix](../device-library/parts/README.md) records every selected part, manufacturer datasheet, pinout, lead-forming profile, mounting declaration and simulation status.

CircuitGraph 1.1 adds typed `MountBinding` and `PinContactBinding` records. Physical types are distinct from legacy `LED.IN`, the 12-port logical `74HC08` and ideal switch sources. Existing schema 1.0 files retain their meaning and round-trip without conversion or automatically added power, ground or wires. Adding a physical part upgrades that draft to 1.1 without changing its legacy modules.

A mounted module stores its authoritative board-local pose and exact part/package revisions in its binding. World pose is derived. All pins must fit one rigid footprint simultaneously. Validation checks the board, contacts, revisions, complete pin map, occupancy per physical hole and plastic body overlap. Mechanical DIP orientation is relative to the board and independent of camera orientation. Invalid candidates show pin markers and a reason. Body placement remains free of lesson-answer constraints.

Move/rotate/unplug/delete operations update pose and bonds in one graph/history command. Moving a board carries its mounted parts. Deleting a board detaches its parts at their current world pose and removes connections to that board. Mounted pins inherit board support for visible jumper clearance. Existing board docking, navigation and wire editing remain covered by the web regression suite.

Mount bonds and declared switch/common-pin connections participate in both net builders. Resistors and LEDs keep separate terminal nodes. Breadboard strips are conductive only: no implicit rail source, global ground, hidden jumper or geometric electrical inference is introduced. The [shared TS/Python fixture](../contracts/design-models/fixtures/physical-mounting-parity.json) pins connectivity parity.

## Virtual execution

SN74HC08N requires explicit VCC and GND on one valid isolated source reference, within the declared 2–6 V model envelope. Missing supply removes valid gate outputs; reversed/invalid supplies report faults; unknown inputs remain unknown. Independent floating sources do not establish valid input levels by name or voltage alone. All four gates are exercised against their truth tables.

The bounded DC model covers an isolated source and a single series LED/resistor path, including a powered ideal HC08 output. It reports open/reversed branches, unknown drivers, excessive modeled current and unsupported branching. The fixed LED drop and ideal output levels are estimates within this subset; they do not model output impedance, thermal behavior, timing accuracy or arbitrary analog thresholds.

Switch support means explicit ideal contacts only. Transistors, standalone diodes/Zeners, capacitors, buzzer, segment arrays/multiplexing and the other physical ICs remain placeable/wireable with simulation explicitly unsupported. SN74LS266N declares open-collector outputs and the external pull-up requirement. Arithmetic and memory abstractions have no pretend physical package and cannot mount.

`POST /api/circuits/physical-preview` returns typed device states and pin values to the renderer. Rendering does not evaluate logic. The preview is static DC; the existing virtual compiler/capture path retains event execution. FPGA, transport and physical-station discovery contracts are unchanged.

Open [the powered HC08 and LED example](../contracts/circuit-schema/examples/physical-hc08-led.json) through the editor file toolbar. It contains a mounted HC08, 330 Ω resistor and two-pin LED, with actual jumper connections through free holes on each relevant strip. The API regression verifies a lit LED with valid power and no valid output/light after disabling the source.

## Changed source boundaries

- Canonical library and generation: `device-library/parts/`, `device-library/logic-ic/74hc08.json`, `scripts/sync_editor_catalog.py`; generated editor/physical web catalogs and `contracts/design-models/physical-parts.v1.json`.
- Web: `data/partCatalog.ts`, ribbon support labels, `three/PackageModel.ts`, `ComponentModel.ts`, `SceneManager.ts`, `electrical/mounting.ts`, endpoint/net/pose resolvers, placement rotation, circuit store, editor interactions, file/API guards, Inspector/Component Info, Run and canvas state delivery.
- Contract/API: circuit schemas, `contracts/physical_mounting.py`, shared validation, typed API models/validator, physical preview route and simulator dependency.
- Simulator: `engine.py`, `nets.py`, `analog.py`, with physical power/reference and bounded DC behavior.
- Regression files: physical catalog/mounting/package web tests; physical mounting/preview/simulation and generator Python tests. The two old palette assertions now select the isolated physical supply while legacy supply tests remain intact.
- Windows build: Vite preserves checkout paths on Windows because native realpath fails inside this linked worktree despite normal file reads succeeding.

## Verification record

Independent review found and corrected three issues with reproduced regressions: an inactive supply hiding an active shared-ground input, a mismatched drag plane in oblique views, and signed-zero lookup rejecting valid half-turn mounts. No confirmed P1/P2 findings remain.

Python verification: **326 passed**, with one existing Starlette/httpx deprecation warning. Command from the repository root, using `PYTHONPATH=.;simulator/circuit-simulator;services/api`:

```text
.audit-runtime/Scripts/python.exe -m pytest services/api/tests tests/contracts simulator/circuit-simulator/tests tests/frontend/test_editor_catalog.py tests/frontend/test_physical_catalog.py services/hardware-service/tests/test_virtual_execution.py services/hardware-service/tests/test_simulation_workers.py tests/integration/test_virtual_lab_execution.py --basetemp=.build/pytest-physical-final-root -q
```

Web verification from `apps/web`: **467 tests passed** with `npm test`; **`npm run build` passed** (183 modules, 5.22 s production bundle). Vite reports its large-chunk advisory for the main bundle; there are no build errors. `python scripts/sync_editor_catalog.py --check` and `git diff --check` pass.

Real browser screenshots at top, oblique and close-up angles are outstanding: opening the local app in the browser was rejected by the browser security policy with “The user declined permission for this action.” No alternate browser or screenshot workaround was attempted. Automated geometry and picking checks do not replace this visual verification.
