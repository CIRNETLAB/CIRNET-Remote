# Circuit and Physical Lab Specification — Lab-First

[Tiếng Việt](../../vi/api/circuit-spec-reference.md) · [Circuit and physical lab reference](circuit-and-physical-lab.md)

The reference covers current graph versions, observed topology, station
capabilities and NCAP formats. The [Lab-First architecture](../architecture/lab-first-v3-1.md)
governs system behavior. See
[component placement](../architecture/component-placement.md) and the
[physical safety contract](../architecture/physical-lab-safety-contract.md) for their detailed rules.

`CircuitGraph` describes the design and `DetectedTopologyGraph` describes the
observed wiring. The Lab Execution Compiler emits `InstrumentationExecutionPlan`
for the lab infrastructure. The hardware plan starts with EP4CE6E22C8N
without SDRAM and reserves EP4CE10E22C8N with external SDRAM for a future target.

<a id="editor-breadboard-jumper-authoring-2026-10-14"></a>

## Breadboard connectivity

Breadboard contact IDs such as `BB.contact:terminal:A:01` resolve through the
Contracts catalog. Five-hole nodes and continuous power rails have declared
connectivity. Bend points, colors and route mode are stored in
`metadata.wireVisual` and affect display. Virtual compilation joins intrinsic
nodes, declared jumpers and supported component terminals before lowering
digital nets. Physical execution uses the observed wiring and the station's
validated resources. [Breadboard details and original evidence](circuit-and-physical-lab.md#breadboard-jumper-authoring-recorded-on-2026-10-14)
