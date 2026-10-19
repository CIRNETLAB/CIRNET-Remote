# Device Library

Declarative metadata for virtual and physical devices.

This folder separates legacy logical editor tools from selected physical parts. Physical pin numbers, package dimensions, lead profiles, internal contacts and model support are recorded for exact variants with source documents.

## Phase 2 functional editor catalog

`editor/components.json` retains the legacy functional/visual definitions and adds the `LABEL` authoring type. Its named logical ports and arbitrary visual dimensions retain their existing meaning. The legacy `74HC08` has twelve A1/B1/Y1… ports, `LED` has `IN`, switches are ideal sources, and `POWER_SUPPLY` remains the original visual instrument. Adder/Multiplier have no part number and cannot mount; Memory retains its separate local `memory-image/1.0` contract.

Breadboards retain no logical ports but reference the canonical editor topology in `contracts/design-models/breadboards.json`: explicit five-hole terminal nodes and continuous rail rows. The 100 model is a dual bus strip. These virtual contacts are separate from station routing resources. Rails have no intrinsic voltage. Run `python scripts/sync_breadboard_topologies.py --check` to verify the web topology snapshot.

`parts/physical-parts.json` is the canonical versioned registry for exact and generic physical descriptors; see [physical part support and sources](parts/README.md). It separates current `parts` from immutable `historicalParts`, defining physical pins independently of logical ports and meshes. The separate `SN74HC08N`, `LED_LTL307EE` and `DC_SUPPLY` editor types require explicit power/return wiring; opening a legacy file does not silently convert it. Use the generator's reported counts instead of a historical catalog total.

Run `python scripts/sync_editor_catalog.py` after changing either source. It validates the registry, appends physical editor entries to the retained functional/visual definitions, and writes `apps/web/src/data/editorCatalog.json`, lean `apps/web/src/data/editorParts.json`, full `apps/web/src/data/physicalParts.json`, `contracts/design-models/physical-parts.v1.json` and signal-domain projections. Run the same command with `--check` in verification. Do not edit generated snapshots independently. Catalog placement support is separate from each part's declared simulation support. [Flexible placement](../contracts/design-models/flexible-placement.md) records Graph 1.2, automatic geometry, exact revision lookup and explicit rebuild semantics.
