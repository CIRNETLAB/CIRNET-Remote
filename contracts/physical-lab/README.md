# Physical Lab contracts 1.0

JSON Schema 2020-12 definitions in lab.schema.json. DetectedTopologyGraph preserves student mistakes and opaque/ambiguous observations. These frozen Lab 1.0 definitions remain independent of supported editor Graph 1.0/1.1 and additive 1.2; [versioned assignment boundaries](../design-models/flexible-placement.md) carry 1.2 reference graphs without rewriting Lab 1.0. Independent Safety/Topology/Functional results and ExecutionDecision. InstrumentationExecutionPlan routes lab endpoints only, never internal student wiring. Closed field shapes exclude raw transport controls. Semantic endpoint uniqueness/binding validation is in contracts.validation.

examples/v1-target-capabilities.json is a DESIGN TARGET, available=false, not runtime hardware evidence. Runtime channel/support/slot counts come from actual drivers/profiles. No electrical values are invented.

The current [FPGA proposal mapping](../../docs/architecture/fpga-contract-conformance.md)
distinguishes the implemented InstrumentationExecutionPlan from the historical
PhysicalExecutionPlan name, the proposed board image, and independent open
ABI/freshness/hardware gates. NCAP v1 runtime production and sampled-v2 helpers
remain distinct; this mapping does not enable a physical driver.
