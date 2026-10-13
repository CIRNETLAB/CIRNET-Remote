# net*CIRCUIT Remote — Lab-First v3.1

This is the single canonical architecture authority. The original v3 proposal/audit are provenance; archived specs/prompts, source analyses and verification reports are history. This document governs conflicts.

**Safety-gated, Lab-First, Contract-Driven Virtual-to-Physical Laboratory Architecture.**

Computer checks SAFETY → safe circuit runs → real physics produces behavior → software observes, compares and teaches.

SAFETY != CORRECTNESS. UNKNOWN != UNSAFE. TOPOLOGY MISMATCH != RUN BLOCK.

## System boundary

Browser Vue 3 / TypeScript / Pinia / Three.js → REST/WebSocket → Nginx → FastAPI modular monolith → local-only gRPC Hardware Service → HardwareStation. Application depends on the abstraction: VirtualHardwareStation (simulator) or PhysicalHardwareStation (driver/protected lab infrastructure). Hardware Service is isolated in its own process and owns FPGA transport/control.

Production host: Linux Mini PC Intel Xeon W-1370, 16 GB RAM, 256 GB SSD, Nginx, systemd, FastAPI, Hardware Service, PostgreSQL. SQLite is optional for development/tests. Store capture metadata in the database and large payloads in capture storage.

Configured capabilities reflect implemented support. Analog virtual execution requires a real SPICE-compatible adapter; otherwise virtual_analog=false. Physical digital requires validated driver/profile/protection; physical analog routing is outside V1.

## Design and physical truth

CircuitGraph schema 1.0 is the logical DesignGraph source of truth; Three.js Scene is its projection. Coordinates never imply electrical nets. Preserve commands/history, explicit connections, placement ghost/gizmo, camera and resource ownership. Ghosts enter the graph only at commit.

Duplicate-edge/direction/width/extra-driver restrictions are editor authoring rules. DetectedTopologyGraph is separate and preserves wrong/missing/unexpected connections, wrong/opaque components and ambiguity. Never sanitize observations into the expected answer.

In manual breadboard V1, **student wiring is physical truth**: real ICs and jumpers form the internal circuit. Instructor placement is not a grading reference.

AssignmentDefinition contains optional reference design/topology, expected components, instructor pin profiles, expected behavior, assessment policy and LabEndpoint bindings. Roles: INPUT_SOURCE, OUTPUT_SENSE, CLOCK, VCC, GND, GENERATOR, SCOPE, LOGIC_ANALYZER. Resolution modes: AUTO_DISCOVERY, INSTRUCTOR_PROFILE, HYBRID (recommended V1). OPAQUE_PHYSICAL_COMPONENT means unknown observed identity, not unsafe.

ObservedPinBinding records physical `pin_id` → `node_id`, with optional measured confidence, inferred role and observations; absence remains unknown. Opaque identity is UNKNOWN. Both Python and browser reject duplicate pin/connection identities and references to nonexistent detected nodes. Reference DesignGraph uses the existing CircuitGraph validator.

Each LabEndpoint selects `fixed_node_id`, `reference_node_id` or virtual `design_port`; deprecated `node_id` means fixed placement only. TopologyResolutionResult independently records RESOLVED/PARTIAL/AMBIGUOUS/UNRESOLVED, component matches and ResolvedEndpointBinding to actual observed student nodes. Reference physical IDs never become routes without resolution. User-facing Scope, Generator and Logic Analyzer channels are 1-based.

```text
DetectedTopologyGraph + AssignmentDefinition / instructor profiles
        ↓
TopologyResolver
        ↓
ResolvedLabBindings (TopologyResolutionResult.endpoint_bindings)
        ↓
LabExecutionCompiler
```

**reference physical node != student physical node**. Required unresolved bindings yield BLOCK_UNEXECUTABLE, independently of topology grading. Invalid physical node/pin/connection evidence yields DRIVER_ERROR and safe fallback, never an inferred route.

## Physical Run

Physical Run → scheduler/lease → SAFE_STATE → Topology Scan.

DetectedTopologyGraph → Safety Verify → Topology Resolver with assignment/profiles → TopologyResolutionResult / ResolvedEndpointBindings → Topology Verify (diagnostic only) → ExecutionDecision → Lab Execution Compiler and infrastructure application. Compilation validates executability before permission is committed; it performs no hardware operations. ExecutionDecision consumes safety and executability; topology supports feedback.

Resolver unions observed electrical connections and compares component-pin/net incidence independent of node labels. Supported identities or explicit instructor profiles use AUTO_DISCOVERY/INSTRUCTOR_PROFILE/HYBRID evidence; missing pins/opaque devices never acquire guessed identity or pin roles. Counter preserves repeated component quantities. Matching is bounded (32 components, 64 candidate mappings, 4096 search steps), with AMBIGUOUS on exhausted/multiple candidates. Unique component anchors can resolve execution endpoints in an incorrectly wired circuit; routing never restores reference nets. Fixed required endpoints remain usable despite unrelated component ambiguity.

Routable terminal aliases on the same proven observed net are selected jointly with complete resource matching, rather than greedily collapsing each net before allocation. Unscoped scan/reference ambiguity or zero-confidence continuity withholds reference inference; zero-confidence pins withhold the affected component match. Fixed observed terminals remain usable. Supplied positive confidence is propagated conservatively (minimum supplied evidence); absence never becomes fabricated confidence or a numerical electrical safety threshold.

BLOCK ends the request. RUN/GUARDED → Lab Execution Compiler → Infrastructure Routing → Guarded Power-Up → Real Student Circuit → Observed Signals → Functional Verification.

SafetyVerificationResult: SAFE / UNSAFE / INDETERMINATE. Unsafe and indeterminate block by default. Faults include power shorts, hazardous contention, polarity/voltage/current risks and protection failure.

TopologyVerificationResult: MATCH / MISMATCH / UNKNOWN / AMBIGUOUS. Diagnostics/grading/feedback only; cannot authorize or veto Run.

FunctionalVerificationResult: PASS / FAIL / PARTIAL / NO_RESPONSE / NOT_EVALUATED. Evaluates observed behavior after execution.

Verification contracts carry structured safety faults/notes, missing/unexpected/unknown components and nets, pin mapping issues, expected/observed signals and truth-table cases. These are observations and teaching evidence, never invented measurements or extra execution gates.

| Evidence | ExecutionDecision |
|---|---|
| Unsafe/indeterminate safety | BLOCK_SAFETY |
| Required endpoint/resource/capability unavailable | BLOCK_UNEXECUTABLE |
| Safe wrong IC/wiring or topology mismatch | RUN_NORMAL / RUN_GUARDED |
| Safe unknown identity with executable endpoints/protection | RUN_GUARDED |

Software verification never substitutes for electrical protection. See PHYSICAL_LAB_SAFETY.md.

## Compiler and routing

Lab Execution Compiler emits InstrumentationExecutionPlan for infrastructure only: VCC/GND and safe power policy, input sources, clock, generator, output sense, Scope/Logic Analyzer allocation, trigger/capture, test vectors and runtime protection. The infrastructure routing solver resolves endpoints against actual available resources. It never reconstructs internal logical nets to repair student wiring. Domain plans contain no raw FPGA registers, MUX addresses or Linux transport identifiers.

## Lifecycle and concurrency

HardwareStation operations: get_capabilities, enter_safe_state, scan_topology, read_runtime_safety, prepare_execution, apply_routing, guarded_power_up, configure_clock/generator/trigger, arm_capture, start_execution, stop_execution, read_capture, reset. Physical start requires fresh scan/safety decision, matching executable station/experiment plan, applied routing, guarded power-up and capture readiness. Direct run cannot bypass the lifecycle.

Hardware states: OFFLINE, IDLE, RESERVED, SAFE_STATE, TOPOLOGY_SCAN, SAFETY_CHECK, ROUTE_PREPARE, GUARDED_POWER_UP, READY, ARMED, RUNNING, CAPTURING, VERIFYING, STOPPING, RELEASE, FAULT. Virtual transitions may omit electrical scan, without pretending it happened.

Application lifecycle: QUEUED → RESERVED → SAFE_STATE → TOPOLOGY_SCAN → SAFETY_CHECK → EXECUTION_DECISION → ROUTE_PREPARE → GUARDED_POWER_UP → RUNNING → CAPTURING → FUNCTIONAL_VERIFY → COMPLETE → SAFE_STATE → RELEASE. Error/disconnect/lease expiry/max run time triggers stop, safe cleanup and release or quarantine. FIFO and per-user admission limits serialize shared hardware without a broker.

30–50 connected users does not imply 30–50 physical executions. V1 target: one slot per shared fabric; actual capacity comes from driver/profile. Virtual sessions are independent and bounded by workers. CPU-bound simulation leaves FastAPI's event loop.

Scheduler hardware capacity uses current validated `physical_execution_slots`: zero/offline means no admission, FIFO fills available slots and release dispatches the next request. Quarantine blocks the shared station. Slots=2 tests verify scheduler admission only; a real profile needs electrically independent partitions. `NETCIRCUIT_SIMULATION_WORKERS` is a positive integer (default 4), shared by API and Hardware Service; the process pool uses explicit `spawn`, serializes submission/teardown and waits for owned workers on close. Both orchestration thread pools reserve four additional control threads so Stop can interrupt admitted work. V1 remains one API scheduler process.

## Simulator, UI and results

CircuitGraph → structural/logical validation → VirtualExecutionPlan → Python discrete-event engine with deterministic event ordering, net dependencies and propagation delays. Initial models: 74HC08/AND, NOT, OR/XOR, switch/input, LED/probe, clock. AnalogSimulationEngine / SPICEAdapter / MixedSignalCoordinator are unavailable boundaries until implemented.

Unified results contain execution state/decision, independent safety/topology/function, digital samples, captures/timestamps, warnings/errors and raw observations. UI preserves the workbench and displays SAFETY, TOPOLOGY, FUNCTION separately. No fake waveform/acquisition. Large captures use versioned binary frames plus capture ID, instrument/channel, sample rate/count, timestamp and encoding; bounded diagnostic data may use JSON.

Experiment SQL JSON and `experiment.updated` carry `CaptureMetadata` only; samples live behind `CaptureStore`. V1 `FilesystemCaptureStore` uses atomic payload files in `NETCIRCUIT_CAPTURE_DIR` (default `.runtime/captures`). Owner-scoped GET/DELETE `/api/captures/{capture_id}/payload` provides the data plane. NCAP v1 losslessly carries digital events with bounded lengths, exact timestamps and checksum/integrity checks; analog INT16/UINT16/FLOAT32 envelopes validate metadata only, with no fabricated payload. Functional verification loads the stored capture through CaptureService, returning only requested checkpoints/cases. Signal Monitor fetches on demand, shares/caches the active request and cancels obsolete loads. Explicit terminal-owner deletion keeps historical metadata and marks payload unavailable; V1 has no automatic expiry. Restart safe cleanup precedes legacy inline-payload migration.

Hardware RPC ReadCapture also uses bounded NCAP in OperationReply.capture_payload, separate from metadata result_json. This keeps a 100k-event response below the default 4 MiB receive limit even for long signal names; the API rejects malformed binary or inconsistent descriptors instead of accepting truncated/no-response evidence.

Inspector exposes driver safety evidence, component quantities, pin/net differences, resolution/confidence and expected/observed signal or truth-table comparisons. `X` differs from absent response; unexercised cases receive no invented timestamp/output. Uncertain physical locations are not highlighted or guessed. Scope stays `NO WAVEFORM DATA` until real analog acquisition exists.

`assessment_policy` controls reporting/grading only. STRICT_TOPOLOGY grades topology while the independent function result remains visible; FUNCTIONAL_ONLY grades observed behavior and retains topology diagnostics; TOPOLOGY_AND_FUNCTION evaluates both. AssessmentService never feeds ExecutionPolicy or power permission.

## Capabilities and FPGA

StationCapabilities: virtual_digital, virtual_analog, physical_digital, physical_analog_routing, physical_execution_slots, topology_scan_supported, safety_gate_supported, guarded_run_supported, component_resolution_modes, instrument_capabilities, routing/resources and independent hardware_rpc_version, fpga_protocol_version, firmware_version, hardware_profile_version.

`instrument_capabilities` is the sole runtime instrument authority: Logic Analyzer, Scope and Generator each declare channels and runtime_reconfiguration_supported; channels=0 means unavailable. Old top-level channel counts and independently editable `instruments` were removed from unpublished Lab schema 1.0/RPC bindings; old protobuf tags are reserved. Virtual Logic Analyzer=4, Scope=0, Generator=0; physical defaults all zero. Optional waveform/frequency/amplitude/offset limits come only from profiles and are enforced by compiler/driver/UI when supplied. No limits are invented.

Baseline GeneratorConfiguration belongs to the validated execution plan before guarded power-up. Live generator changes require RUNNING, capability runtime_reconfiguration_supported=true, the owner/active unquarantined lease, an allocated channel, fresh safety and profile limits. API delegates to ExperimentManager under lifecycle synchronization; the physical station rechecks state/safety. Stop/release serialize with bounded configuration acknowledgement. Current unavailable generator has runtime support=false; live clock/trigger control remains NOT_IMPLEMENTED.

Scope 2CH / Generator 2CH are target capacities; unavailable ADC/DAC support stays false. Breadboard count is profile-derived.

EP4CE6E22C8N prototype has no SDRAM. Compile-safe boundaries: reset/safe-state, protocol/control, topology scan, protected drive, routing, experiment clock, fault interlock. Mini PC uses FpgaTransport: serial/USB-SPI and future USB3/Ethernet; protocol is transport-independent.

R7 implements an abstract control FSM and unavailable transport/instrument interfaces only. Logical FPGA envelope 1.0-scaffold is not a physical binary ABI; runtime physical capabilities remain unavailable. Compiler checks do not prove electrical safety, RTL behavioral simulation, target synthesis or timing closure.

Future EP4CE10E22C8N + external SDRAM: Logic Analyzer, Scope 2CH + ADC/AFE, Generator 2CH + DAC/output stage, shared SDRAM arbiter, trigger, timestamps and explicit CDC. Pinout, switching/protection schematic, part selections, timing and electrical values: TBD_BY_HARDWARE_DESIGN. Never fabricate hardware success or measurements.

## Execution discipline

R0–R7 run sequentially, TDD and acceptance gates, one main commit per phase. MIGRATION_LAB_FIRST.md records evidence/rulings/blockers. Preserve frontend/history; no unrelated rewrites, broker/cloud dependencies or bundle optimization. Unsupported features report UNAVAILABLE / NOT_IMPLEMENTED / capability=false.

Post-R7 H0–H6 hardening completes contracts/resolution, capture storage, capacity/workers, instruments, feedback and documentation. Preserve existing phase commits and subsequent user changes. Leave branch refactor for user review. Do not merge or push to main.
