# Circuit and physical lab specification

[Tiếng Việt](../../vi/api/circuit-and-physical-lab.md) · [Specification entry point](circuit-spec-reference.md) · [Canonical Lab-First v3.1 architecture](../architecture/lab-first-v3-1.md) · [Application API](application.md)

## CircuitGraph and placement

`CircuitGraph` is the logical `DesignGraph`. The selected Contracts `0.1.2` carries separate schemas for `schema_version` 1.0, 1.1 and additive 1.2. Legacy circuit validation accepts 1.0 and 1.1. `POST /api/v2/circuits/validate` and `POST /api/v2/circuits/physical-preview` accept 1.0, 1.1 and 1.2. Physical preview is simulation with `provenance: simulation_preview`. It covers educational DC and digital models within their execution envelope. [Circuit schemas](https://github.com/cirnetlab/cirnet-contracts/tree/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/circuit-schema) · [Versioned route registrations](../../../services/api/app/api/placement.py)

| Graph version | Placement and persistence |
| --- | --- |
| 1.0 | Logical source and destination endpoint strings with their original interpretation |
| 1.1 | Board-local rigid mount pose, versioned parts/packages and validated pin-contact bonds. Earlier documents keep their original interpretation. |
| 1.2 | `FlexibleMountV1` adds one authoritative board-local 3D body pose, versioned mechanical profiles, two stable pin/contact bindings and bounded lead controls. Mounted modules store a single pose and persist only design data. |

New automatic placement uses `FlexibleMountV2` with `version: 2`, `geometryRevision: 2` and an explicit routing template. Saved V1 poses and manual bend controls remain authoritative for those mounts. A free physical module may pin a `physicalDescriptor`. Readers resolve exact historical part and package revisions. Ordinary read/save preserves geometry, while explicit rebuild or migration can adopt another validated representation. These are implemented authoring and persistence behaviors. [Component placement](../architecture/component-placement.md) · [Selected flexible mounting specification](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/design-models/flexible-placement.md)

Named source/destination ports and declared contact bonds define connectivity. Keep the canonical direction, width, duplicate and extra-driver checks for authoring. The memory schema remains `1.0` in its own domain. Visual supply and instrument controls require a separate electrical source or measurement path. [Dated power supply verification](../../vi/history/power-supply-controls.md)

## Observations, assignments and execution

`DetectedTopologyGraph` is a separate versioned observation contract. It preserves wrong, missing, unexpected, opaque and ambiguous student wiring. Physical contact, electrical node, routing resource and FPGA channel are separate identities. `AssignmentDefinition` holds `LabEndpoint` bindings, optional reference topology and design, profiles, expected behavior and assessment policy. Assessment uses topology and functional evidence under the stated policy, independently of instructor placement coordinates.

Observed components may provide `pins: ObservedPinBinding[]`, with pin/node identity and optional confidence, inferred role and observations. Missing evidence remains unknown, and opaque identity remains `UNKNOWN`. Python and browser validation reject duplicate pins and connections and references to absent nodes. The existing `CircuitGraph` validator checks the reference `DesignGraph`.

| `LabEndpoint` form | Interpretation |
| --- | --- |
| `fixed_node_id` | Required fixed station position |
| `reference_node_id` | Placement-independent reference that requires resolution |
| `design_port` | Virtual execution port |
| Legacy `node_id` | Deprecated fixed-position spelling |

User-facing instrument channels, including Logic Analyzer, start at **1**. Drivers translate their internal indexing. `TopologyResolutionResult` records `RESOLVED`, `PARTIAL`, `AMBIGUOUS` or `UNRESOLVED` and actual observed endpoint nodes independently of grading. Structured evidence preserves safety faults, component/net/pin diagnostics and expected/observed functional checkpoints. Existing Lab 1.0 contracts are frozen. `AssignmentDefinitionV2` carries Graph 1.2 references through versioned authoring and student/instructor views. Hardware RPC and the remaining Lab versions have their own domains.

```text
DetectedTopologyGraph -> TopologyResolver
-> ResolvedLabBindings (TopologyResolutionResult.endpoint_bindings)
-> LabExecutionCompiler
```

The resolver matches supported identities or explicit profiles and compares component-pin/net incidence. It counts repeated devices as a multiset and records ambiguity when multiple mappings remain or search bounds are exhausted. A reference node requires mapping to a real observed node. An anchored instrument endpoint may resolve even when the internal wiring is wrong. Routing uses the observed wiring. Malformed physical evidence yields `DRIVER_ERROR` and safe fallback. [Resolver implementation](../../../services/api/app/services/topology_resolver.py)

`SafetyVerificationResult`, `TopologyVerificationResult` and `FunctionalVerificationResult` remain independent. `ExecutionDecision` blocks unsafe or indeterminate safety and unexecutable infrastructure. The Lab Execution Compiler emits `InstrumentationExecutionPlan` for power, sources, clock, instruments, sense routes, capture, test vectors and runtime protection. Internal student wiring remains physical truth. Functional results contain declared expected/observed checkpoints and exercised truth-table cases. Unknown logic `X` and absent response remain distinguishable. Assessment policy controls grading separately from safety and executability. Browser and Python responses use shared schemas and generated types. Check projections with `python -B scripts/sync_lab_contracts.py --check` after contract changes. [Execution policy](../../../services/api/app/services/execution_policy.py)

## Station capabilities and hardware targets

`StationCapabilities` reports availability and mode, virtual/physical digital or analog support, scan/safety/guarded-run support, resolution modes, `instrument_capabilities`, routing/resources and `hardware_rpc_version`, `fpga_protocol_version`, `firmware_version` and `hardware_profile_version`. The version domains are independent of CircuitGraph, transport and product release. `instrument_capabilities` is the runtime instrument authority. Zero channels means unavailable. Profiles supply optional limits and runtime reconfiguration flags. `InstrumentationExecutionPlan` includes baseline Generator settings. A live update needs declared support, `RUNNING`, ownership, an active lease and current safety within profile limits. Current capabilities supply physical slot counts. Both services share positive integer `CIRNET_SIMULATION_WORKERS`, default 4, for spawned simulation workers.

The target deployment host is a Linux Mini PC with Intel Xeon W-1370, 16 GB RAM and 256 GB SSD. The hardware plan calls for an EP4CE6E22C8N prototype without SDRAM and a future EP4CE10E22C8N with external SDRAM, two Scope channels, two Generator channels, Logic Analyzer and shared arbitration. Physical analog routing is false in V1. The target is one shared physical slot. The actual profile supplies available boards, resources and channel counts. Driver and hardware evidence are prerequisites for physical support. The selected FPGA 0.1.2 product is a source scaffold. [FPGA conformance](../architecture/fpga-contract-conformance.md) · [Selected release lock](../../../integration/release-set.json)

Protection requires current limiting and sensing, fast cutoff, tri-state drive, default-open routes, protected digital outputs, guarded power-up, watchdog and runtime protection, and bounded safe-state transitions. Pinout/bank voltages, switching and protection schematics, ADC/DAC/AFE selection, SDRAM part and timing, transport IC, and current, voltage, sample and frequency limits and measurements remain `TBD_BY_HARDWARE_DESIGN`. Software tests establish control behavior. Electrical verification requires its own schematic, parts and measurements. [Physical lab safety](../architecture/physical-lab-safety.md) · [Dated local release evidence](../history/verification/2026-11-05-cirnet-release-0.1.4.md)

## Captures and evidence

`CaptureMetadata` stays in lifecycle and SQL records. `CaptureStore` keeps payloads separately. NCAP `digital_events` v1 starts with the `NCAP` magic, a `uint8` version, a little-endian `uint32` UTF-8 JSON header length and the header. The body is a sequence of 11-byte little-endian events with a `uint16` channel index, `uint64 time_ns` and `uint8` value (`0`, `1` or `2` for `X`). The format caps payloads at 100,000 events, 4,096 channels and a 64 KiB header. Digital times and durations are JavaScript-safe integers. Epoch `timestamp_ns` is a decimal string.

NCAP v2 provides `INT16`, `UINT16` and `FLOAT32` codecs, descriptors and synthetic interoperability fixtures. Runtime sampled production and a default v2 network endpoint are `NOT_IMPLEMENTED`. Scope remains unavailable. Owners fetch or delete payloads separately through `/api/captures/{capture_id}/payload`. Retirement preserves metadata and history and sets `available=false`. [Selected capture format](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/capture/README.md) · [Capture catalog](../architecture/capture-catalog.md)

## Breadboard jumper authoring recorded on 2026-10-14

CircuitGraph 1.0 keeps source/destination endpoint strings. For example, `BB.contact:terminal:A:01` resolves through the Contracts breadboard catalog. Intrinsic five-hole nodes and continuous rail rows are explicit. Bend points, colors and route mode live only in `metadata.wireVisual`, using world or module-local anchors. Attaching a terminal requires declared connectivity. The virtual compiler unions intrinsic nodes, explicit jumpers and supported component terminals before lowering digital nets. Physical execution uses observed topology and station resources. Editor contacts are design-level identities. [Selected breadboard catalog](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/design-models/breadboards.json) · [Original wire-tool analysis](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/SOURCE_ANALYSIS_CRUMB_WIRE_TOOL.md)
