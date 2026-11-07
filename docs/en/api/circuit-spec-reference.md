# Circuit and Physical Lab Specification — Lab-First

Use the circuit and lab reference in [English](circuit-and-physical-lab.md)
or [Vietnamese](../../vi/api/circuit-and-physical-lab.md) for current graph versions,
observed topology, station capabilities and NCAP formats. The
[Lab-First architecture](../architecture/lab-first-v3-1.md) governs system behavior. See
[component placement](../architecture/component-placement.md) and the
[physical safety contract](../architecture/physical-lab-safety-contract.md) for their detailed rules.

CircuitGraph describes the design and DetectedTopologyGraph describes the
observed wiring. The Lab Execution Compiler emits InstrumentationExecutionPlan
for the lab infrastructure. The hardware roadmap starts with EP4CE6E22C8N
without SDRAM and reserves EP4CE10E22C8N with external SDRAM for a future target.

## Editor breadboard jumper authoring (2026-10-14)

CircuitGraph 1.0 keeps source/destination endpoint strings. Breadboard contact IDs (for example BB.contact:terminal:A:01) resolve through contracts/design-models/breadboards.json; intrinsic five-hole nodes and continuous rail rows are explicit. Bend points, colors and route mode live only in metadata.wireVisual, with world/module-local anchors. Geometry or component overlap never attaches a terminal. Virtual compilation unions intrinsic nodes, explicit jumpers and supported component terminals before lowering digital nets. Physical execution still uses detected evidence and station resources; no editor contact is an FPGA GPIO/routing resource. See SOURCE_ANALYSIS_CRUMB_WIRE_TOOL.md.
