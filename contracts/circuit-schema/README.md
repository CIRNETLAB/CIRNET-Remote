# Circuit Graph Contract

`circuit.schema.json` is the canonical application-level circuit contract. Version `1.0` requires `schema_version`, `circuit_id`, `modules`, and `connections`.

The Circuit Graph describes logical intent only. It must never contain FPGA register addresses, Linux SPI paths, or raw switching-fabric addresses. Hardware translation belongs to the Hardware Service.

Breaking schema changes require a new schema version and consumer updates.

The same `circuit.schema.json` accepts 1.1 rigid physical mounting through `module.schema.json`; additive `circuit-v1.2.schema.json` supports flexible assemblies and pinned free physical descriptors. `AnySupportedCircuitGraph` selects these supported shapes; legacy 1.0/1.1 readers keep their frozen boundaries. See [component placement](../../docs/COMPONENT_PLACEMENT.md) and the [flexible contract](../design-models/flexible-placement.md) for versioned persistence/API behavior. The Phase 2 notes below describe retained legacy authoring rules.

## Phase 2 editor fields

Modules optionally carry `position: {x,y,z}` in Three world coordinates (Y elevation, XZ work surface) and `rotation` in degrees around world Y. These fields are presentation only. Rotation was already permitted by the extensible module schema; it now has an explicit numeric definition without changing graph version 1.0.

Connections remain `{source: "moduleID.portID", destination: "moduleID.portID"}`. Editor commands use named ports from `device-library/editor/components.json`, reject incompatible directions/widths, duplicate edges and additional input drivers. Fanout is allowed. Passive terminals use `inout`; electrical net analysis remains a backend/simulator task. Deleting a module removes incident edges. Motion/rotation changes no endpoint IDs.

Local import additionally rejects duplicate module IDs, dangling module references, nonfinite geometry and malformed local memory images. Unknown component types/port names survive imports; fallback visuals and Inspector expose them without inventing mappings. Schema/API structural approval alone does not confirm electrical correctness or execution support.
