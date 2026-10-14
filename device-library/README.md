# Device Library

Declarative metadata for virtual and physical devices.

This folder deliberately separates logical identity from unverified electrical values. Datasheet-derived voltage, timing, package and pin information should only be added for exact selected components and should include source/revision notes in future hardware phases.

## Phase 2 functional editor catalog

`editor/components.json` is the canonical metadata for 21 placeable editor types: structural visuals, passives, digital inputs/outputs, 74HC08 gates, generic arithmetic and memory. Render styles/dimensions are arbitrary presentation units. Named functional ports define editor connections; they do not establish package pins, voltage/timing ratings or hardware capabilities. The 74HC08 entry references existing starter device metadata; its A1/B1/Y1…A4/B4/Y4 ports are logical gates. Adder/Multiplier deliberately have no part number. Memory references the separate local `memory-image/1.0` contract.

Breadboards retain no logical ports but reference the canonical editor topology in contracts/design-models/breadboards.json: explicit five-hole terminal nodes and continuous rail rows. The 100 model is a dual bus strip. These virtual contacts are separate from unconfirmed physical node maps and station routing resources. Board and power supply visuals remain without electrical terminals/sources. Run python scripts/sync_breadboard_topologies.py --check to verify the web topology snapshot.

Run `python scripts/sync_editor_catalog.py` after changing canonical editor definitions, and commit the generated `apps/web/src/data/editorCatalog.json`. Frontend tests verify exact provenance. Catalog availability means placement/configuration is supported; execution support is a later contract.
