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

## Physical Run

Physical Run → scheduler/lease → SAFE_STATE → Topology Scan.

Scan produces independent Safety Verify and Topology Verify (diagnostic only). ExecutionDecision consumes safety and executability; topology supports feedback.

BLOCK ends the request. RUN/GUARDED → Lab Execution Compiler → Infrastructure Routing → Guarded Power-Up → Real Student Circuit → Observed Signals → Functional Verification.

SafetyVerificationResult: SAFE / UNSAFE / INDETERMINATE. Unsafe and indeterminate block by default. Faults include power shorts, hazardous contention, polarity/voltage/current risks and protection failure.

TopologyVerificationResult: MATCH / MISMATCH / UNKNOWN / AMBIGUOUS. Diagnostics/grading/feedback only; cannot authorize or veto Run.

FunctionalVerificationResult: PASS / FAIL / PARTIAL / NO_RESPONSE / NOT_EVALUATED. Evaluates observed behavior after execution.

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

## Simulator, UI and results

CircuitGraph → structural/logical validation → VirtualExecutionPlan → Python discrete-event engine with deterministic event ordering, net dependencies and propagation delays. Initial models: 74HC08/AND, NOT, OR/XOR, switch/input, LED/probe, clock. AnalogSimulationEngine / SPICEAdapter / MixedSignalCoordinator are unavailable boundaries until implemented.

Unified results contain execution state/decision, independent safety/topology/function, digital samples, captures/timestamps, warnings/errors and raw observations. UI preserves the workbench and displays SAFETY, TOPOLOGY, FUNCTION separately. No fake waveform/acquisition. Large captures use versioned binary frames plus capture ID, instrument/channel, sample rate/count, timestamp and encoding; bounded diagnostic data may use JSON.

## Capabilities and FPGA

StationCapabilities: virtual_digital, virtual_analog, physical_digital, physical_analog_routing, physical_execution_slots, topology_scan_supported, safety_gate_supported, guarded_run_supported, component_resolution_modes, logic_analyzer_channels, oscilloscope_channels, generator_channels, routing/resources and independent hardware_rpc_version, fpga_protocol_version, firmware_version, hardware_profile_version.

Scope 2CH / Generator 2CH are target capacities; unavailable ADC/DAC support stays false. Breadboard count is profile-derived.

EP4CE6E22C8N prototype has no SDRAM. Compile-safe boundaries: reset/safe-state, protocol/control, topology scan, protected drive, routing, experiment clock, fault interlock. Mini PC uses FpgaTransport: serial/USB-SPI and future USB3/Ethernet; protocol is transport-independent.

Future EP4CE10E22C8N + external SDRAM: Logic Analyzer, Scope 2CH + ADC/AFE, Generator 2CH + DAC/output stage, shared SDRAM arbiter, trigger, timestamps and explicit CDC. Pinout, switching/protection schematic, part selections, timing and electrical values: TBD_BY_HARDWARE_DESIGN. Never fabricate hardware success or measurements.

## Execution discipline

R0–R7 run sequentially, TDD and acceptance gates, one main commit per phase. MIGRATION_LAB_FIRST.md records evidence/rulings/blockers. Preserve frontend/history; no unrelated rewrites, broker/cloud dependencies or bundle optimization. Unsupported features report UNAVAILABLE / NOT_IMPLEMENTED / capability=false.

After R7 leave branch refactor for user review. Do not merge or push to main.
