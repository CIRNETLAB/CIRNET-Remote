# CIRNET Remote — Lab-First v3.1

[Tiếng Việt](../../vi/architecture/lab-first-v3-1.md) · [System architecture](system.md)

This specification governs Lab-First system and safety requirements. The
[system architecture](system.md) describes the selected release topology, and
the [migration status](native-migration-status.md) records the verified native
combinations. Dated reports and archived proposals record their own scope.
See [namespace compatibility](../operations/namespace-compatibility.md) for
source names and legacy aliases.

**Safety-gated, Lab-First, Contract-Driven Virtual-to-Physical Laboratory Architecture.**

Computer checks SAFETY → safe circuit runs → real physics produces behavior → software observes, compares and teaches.

SAFETY != CORRECTNESS. UNKNOWN != UNSAFE. TOPOLOGY MISMATCH != RUN BLOCK.

## System boundary

The selected browser workbench uses Vue 3, TypeScript, Pinia and Three.js.
Nginx forwards same-origin REST and WebSocket traffic to FastAPI. The API
calls Hardware Service over local-only gRPC. Both virtual and physical
stations use the same `HardwareStation` boundary. Hardware Service runs
in its own process and owns FPGA transport and control.

The production target is a Linux Mini PC with Intel Xeon W-1370, 16 GB RAM and a 256 GB SSD. The selected deployment uses Nginx, systemd, FastAPI, Hardware Service and PostgreSQL. SQLite is optional for development/tests. Store capture metadata in the database and large payloads in capture storage.

Configured capabilities reflect implemented support. Analog virtual execution requires a real SPICE-compatible adapter; otherwise virtual_analog=false. Physical digital requires validated driver/profile/protection; physical analog routing is outside V1.

## Design and physical truth

CircuitGraph schemas 1.0, 1.1 and additive 1.2 are the logical DesignGraph source of truth; Three.js Scene is its projection. Version 1.1 preserves board-local rigid mount pose, part/package revisions and validated pin-contact bonds. Version 1.2 adds flexible assemblies and pinned free physical descriptors. New flexible authoring uses automatic `FlexibleMountV2` geometry; saved V1 manual geometry and historical descriptor revisions retain their meaning. Versioned document and assignment `/api/v2` operations carry these graphs without changing frozen legacy public shapes. See the [component placement guide](component-placement.md) and [flexible contract](https://github.com/cirnetlab/cirnet-contracts/blob/54ef9f6a11f4906c11ec9789de47cf06d5100734/contracts/design-models/flexible-placement.md). Coordinates never imply electrical nets. Preserve commands/history, explicit connections, placement ghost/gizmo, camera and resource ownership. Ghosts enter the graph only at commit.

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

The resolver unions observed electrical connections and compares component-pin/net incidence independent of node labels. Supported identities or explicit instructor profiles use AUTO_DISCOVERY/INSTRUCTOR_PROFILE/HYBRID evidence; missing pins/opaque devices never acquire guessed identity or pin roles. Counter preserves repeated component quantities. Matching is bounded (32 components, 64 candidate mappings, 4096 search steps), with AMBIGUOUS on exhausted/multiple candidates. Unique component anchors can resolve execution endpoints in an incorrectly wired circuit; routing never restores reference nets. Fixed required endpoints remain usable despite unrelated component ambiguity. [Selected Python resolver](../../../services/api/app/services/topology_resolver.py) · [Rust candidate resolver](../../../native/src/compiler/topology.rs)

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

Electrical protection requires its own evidence. See the [physical safety contract](physical-lab-safety-contract.md).

## Compiler and routing

Lab Execution Compiler emits InstrumentationExecutionPlan for infrastructure only: VCC/GND and safe power policy, input sources, clock, generator, output sense, Scope/Logic Analyzer allocation, trigger/capture, test vectors and runtime protection. The infrastructure routing solver resolves endpoints against actual available resources. It never reconstructs internal logical nets to repair student wiring. Domain plans contain no raw FPGA registers, MUX addresses or Linux transport identifiers.

## Lifecycle and concurrency

HardwareStation operations: get_capabilities, enter_safe_state, scan_topology, read_runtime_safety, prepare_execution, apply_routing, guarded_power_up, configure_clock/generator/trigger, arm_capture, start_execution, stop_execution, read_capture, reset. Physical start requires fresh scan/safety decision, matching executable station/experiment plan, applied routing, guarded power-up and capture readiness. Direct run cannot bypass the lifecycle.

Hardware states: OFFLINE, IDLE, RESERVED, SAFE_STATE, TOPOLOGY_SCAN, SAFETY_CHECK, ROUTE_PREPARE, GUARDED_POWER_UP, READY, ARMED, RUNNING, CAPTURING, VERIFYING, STOPPING, RELEASE, FAULT. Virtual transitions may omit electrical scan, without pretending it happened.

Application lifecycle: QUEUED → RESERVED → SAFE_STATE → TOPOLOGY_SCAN → SAFETY_CHECK → EXECUTION_DECISION → ROUTE_PREPARE → GUARDED_POWER_UP → RUNNING → CAPTURING → FUNCTIONAL_VERIFY → COMPLETE → SAFE_STATE → RELEASE. Error/disconnect/lease expiry/max run time triggers stop, safe cleanup and release or quarantine. FIFO and per-user admission limits serialize shared hardware without a broker.

30–50 connected users does not imply 30–50 physical executions. V1 target: one slot per shared fabric; actual capacity comes from driver/profile. Virtual sessions are independent and bounded by workers. CPU-bound simulation leaves FastAPI's event loop.

Scheduler hardware capacity uses current validated `physical_execution_slots`: zero/offline means no admission, FIFO fills available slots and release dispatches the next request. Quarantine blocks the shared station. Slots=2 tests verify scheduler admission only; a real profile needs electrically independent partitions. `CIRNET_SIMULATION_WORKERS` is a positive integer (default 4), shared by API and Hardware Service; the process pool uses explicit `spawn`, serializes submission/teardown and waits for owned workers on close. Both orchestration thread pools reserve four additional control threads so Stop can interrupt admitted work. V1 remains one API scheduler process.

## Web identity and public boundaries

Durable principal IDs own data independently of opaque server-side authentication sessions. Passwords use Argon2id; only cookie digests are stored. Login/logout/claim and privilege changes revoke old sessions. Every unsafe HTTP operation requires an exact configured Origin and session CSRF token, including login/logout. Production disables guest access and requires explicit HTTPS origins and PostgreSQL. Development guest access is explicit/configurable and has Student permissions. Role does not grant another user's private experiment or capture. Bootstrap has no default password. Alembic migrations preserve legacy data/leases/quarantine; guest ownership transfers only with proven session possession and explicit confirmation. Only explicit session bootstrap and auth mutations install credentials; ordinary stale reads cannot replace a newer login cookie. The Web retires old remote connections during rotation and reconciles unknown/failed outcomes through a bounded session read without replaying commands. See [authentication and migrations](auth-and-migrations.md) for setup and recovery.

Control lifetime is separate from read access. A volatile non-secret per-tab client ID travels in `X-Control-Client` and realtime negotiation; Run binds it to the current server session. A viewer tab cannot maintain or cancel another tab's control lifetime by connecting/disconnecting. Revocation, expiry and controller disconnect stop the affected execution, with safe release or quarantine unchanged. Workers recheck the session before hardware commands; browser activity cannot renew the fixed lease. Stop remains owner-authorized and bypasses generic mutation admission. These software bounds do not promise hard real-time browser Stop latency.

Public station DTOs omit private routing resources and execution plans. Typed routes generate OpenAPI and browser operation bindings without starting runtime services. Versioned bounded event streams carry sequence/stream identity and explicit resync; reconnect never replays commands. Create/Run/Stop mutation identity is durable and principal-scoped. Run acknowledgement is distinct from later measurement completion; Stop acknowledgement requires actual safe lease release.

Browser pending-observation identities survive reload in a bounded principal-scoped ledger. Reload restores observation only: backend operation/command reads reconcile unknown outcomes without resending Create/Run/Apply or recovering tab control authority. See [pending observations](pending-observations.md) for bounds, storage failure and local forgetting semantics.

Students receive published assignment views without teacher reference designs, node maps, profiles or answers. Default `observed_only` feedback exposes verification/assessment status and observed measurements, while detailed reference diagnostics remain in stored evidence. The same projection applies to HTTP lists/detail/results, operation recovery and every realtime snapshot. Assignment authors/Admin may inspect their authorized detailed evidence; an instructor may explicitly publish `detailed` feedback. Disclosure policy never changes verification algorithms or safety decisions.

## Simulator, UI and results

In the selected release, supported CircuitGraph 1.0/1.1/1.2 → structural/domain validation → typed SimulationDispatcher → existing VirtualExecutionPlan → Python discrete-event engine with deterministic event ordering, net dependencies and propagation delays. Models include the existing logical digital set and bounded DC/physical-package subset. Explicit component-port domains and opt-in versioned `signal_domains` annotations never infer an unknown part as DIGITAL or turn MIXED into a wildcard. Future namespace versions remain storable but require an execution adapter. AnalogSimulationEngine / SPICEAdapter / MixedSignalCoordinator return typed unavailable results until real solvers exist; no virtual_analog capability is enabled. See [signal domains and simulation](signal-domains-and-simulation.md) for the selected provider and opt-in C++ worker.

Unified results contain execution state/decision, independent safety/topology/function, digital samples, captures/timestamps, warnings/errors and raw observations. UI preserves the workbench and displays SAFETY, TOPOLOGY, FUNCTION separately. No fake waveform/acquisition. Large captures use versioned binary frames plus capture ID, instrument/channel, sample rate/count, timestamp and encoding; bounded diagnostic data may use JSON.

Experiment SQL JSON and `experiment.updated` carry `CaptureMetadata` only; samples live behind `CaptureStore`. Runtime `FilesystemCaptureStore` uses immutable, atomic NCAP v1 payload files in `CIRNET_CAPTURE_DIR` (default `.runtime/captures`). Owner-scoped GET/DELETE `/api/captures/{capture_id}/payload` provides the data plane. NCAP v1 losslessly preserves event order, exact timestamps and `0`/`1`/`X`. Separate versioned NCAP v2 codecs/descriptors support INT16/UINT16/FLOAT32, ordered channels, exact clock-referenced rational time, calibration, clipping, generation, gaps/invalid ranges and termination. Shared synthetic fixtures prove decoding/presentation only; runtime still has no sampled producer or default v2 network source. Display min/max envelopes retain raw evidence and cannot grade timing. See the [capture format](https://github.com/cirnetlab/cirnet-contracts/blob/524cc7a5e2e65f39077feefe70c7fb2ae3a773d6/contracts/capture/README.md).

Migration 0005 indexes sealed captures independently of the current experiment generation; ownership is derived from the parent experiment. Reading/hashing/deleting bytes never holds the global control lock or a database transaction, and reads recheck authorization/availability before disclosure. Retirement atomically marks metadata unavailable and records an audit before filesystem cleanup; failed cleanup remains pending. Active/quarantined captures are not expired. Default directory limits are 256MiB/4,096 files for one API writer; explicit bounded maintenance applies a 30-day policy. Zero disables expiration but retries pending cleanup. Stop/release never deletes historical evidence. Functional verification loads raw payloads; Signal Monitor shares/cancels owner-scoped loads. Restart safe cleanup precedes legacy inline migration. See the [capture catalog](capture-catalog.md) and deployment maintenance templates.

Hardware RPC ReadCapture also uses bounded NCAP in OperationReply.capture_payload, separate from metadata result_json. This keeps a 100k-event response below the default 4 MiB receive limit even for long signal names; the API rejects malformed binary or inconsistent descriptors instead of accepting truncated/no-response evidence.

Inspector exposes driver safety evidence, component quantities, pin and net
differences, resolution confidence, signal comparisons and truth-table cases
as permitted by the assignment policy. `X` differs from absent response.
Only exercised cases receive an observed timestamp or output. Uncertain
physical locations stay unresolved. Scope shows `NO WAVEFORM DATA` when no
capture is available. Its analog viewer can render supplied NCAP v2 evidence,
while the selected runtime produces digital NCAP v1. [Workbench instruments](https://github.com/cirnetlab/cirnet-interface/blob/master/docs/en/guides/workbench.md)

`assessment_policy` controls reporting/grading only. STRICT_TOPOLOGY grades topology while the independent function result remains visible; FUNCTIONAL_ONLY grades observed behavior and retains topology diagnostics; TOPOLOGY_AND_FUNCTION evaluates both. AssessmentService never feeds ExecutionPolicy or power permission.

## Capabilities and FPGA

StationCapabilities: virtual_digital, virtual_analog, physical_digital, physical_analog_routing, physical_execution_slots, topology_scan_supported, safety_gate_supported, guarded_run_supported, component_resolution_modes, instrument_capabilities, routing/resources and independent hardware_rpc_version, fpga_protocol_version, firmware_version, hardware_profile_version.

`instrument_capabilities` is the sole runtime instrument authority: Logic Analyzer, Scope and Generator each declare channels and runtime_reconfiguration_supported; channels=0 means unavailable. Old top-level channel counts and independently editable `instruments` were removed from unpublished Lab schema 1.0/RPC bindings; old protobuf tags are reserved. Virtual Logic Analyzer=4, Scope=0, Generator=0; physical defaults all zero. Optional waveform/frequency/amplitude/offset limits come only from profiles and are enforced by compiler/driver/UI when supplied. No limits are invented.

Baseline GeneratorConfiguration belongs to the validated execution plan before guarded power-up. Live generator changes require RUNNING, capability runtime_reconfiguration_supported=true, the owner/active unquarantined lease, an allocated channel, fresh safety and profile limits. API snapshots and revalidates lifecycle revision/reservation generation around remote work; the physical station rechecks state/safety. Stop records cancellation before waiting for that execution's configuration acknowledgement; remote capabilities/configuration/Stop never hold the global state lock. Cleanup retains the slot until acknowledged safe or quarantined. See [control isolation and runtime indexing](control-isolation-and-runtime-index.md). Current unavailable generator has runtime support=false; live clock/trigger control remains NOT_IMPLEMENTED.

Web validates and freezes requested capture/clock/generator/test-vector configuration before Create. Invalid visible input blocks submission until corrected and stays scoped to the durable principal. Unsupported trigger/hardware-clock settings fail explicitly; duty-cycle preview remains local-only. InstrumentControlAccess describes current allocation/session/tab/lease eligibility without duplicating channel counts. Durable generator commands distinguish REQUESTED, ACCEPTED and explicit driver APPLIED. Unknown acknowledgement retains its original key across refresh/disconnection and permits read-only reconciliation or Stop, never automatic output replay. Last acknowledgement is immutable evidence, independent of the current draft and output telemetry.

## Persistent Web workbench

Projects and circuit documents have owner-scoped CRUD, bounded keyset pages, immutable saved revisions and compare-and-swap writes. A server document ID is distinct from its embedded CircuitGraph ID; Save As does not retag the design. Storage preserves supported graph 1.0/1.1/1.2 metadata, memory, wires and mounting; browser numeric representability is a separate explicit boundary. Legacy routes reject a selected 1.2 document with `UNSUPPORTED_DOCUMENT_VERSION`; versioned operations reuse ownership, CAS and immutable revisions. Create pins the exact saved graph, published assignment revision and configuration. Session-row authorization fences linearize writes with revoke/guest claim. Assignment authors save drafts and publish stable revisions; student views redact reference answers. See [projects and revisions](projects-and-revisions.md) and [assignment publication](assignments-and-publication.md).

Document/history/serialization and application controllers are framework/network independent. Composition ports remove the experiment/instrument store cycle. Scene picking, gesture sessions and resource ownership are separated without remounting the canvas; actual GLB previews use a shared, bounded, integrity-checked asset provider. Local recovery partitions every draft by durable principal. Stale save ACKs cannot clear later edits; export is independent of server Save.

One application connection reconciles authorized history, active snapshots and queue after hello/gap/reset/reconnect. Polling is completion-based, single-flight, abortable and backed off. Historical selection cannot acquire Run authority or redirect Stop. Lost Create/Run responses resolve the original durable operation; reload and reconnection never replay Start. Logout/principal changes synchronously clear private runtime/capture state and cancel stale reads while preserving the workspace lifetime.

Scope 2CH / Generator 2CH are target capacities; unavailable ADC/DAC support stays false. Breadboard count is profile-derived.

EP4CE6E22C8N prototype has no SDRAM. Compile-safe boundaries: reset/safe-state, protocol/control, topology scan, protected drive, routing, experiment clock, fault interlock. Mini PC uses FpgaTransport: serial/USB-SPI and future USB3/Ethernet; protocol is transport-independent.

The selected FPGA artifact contains an abstract control state machine and scaffold interfaces. Physical transport, acquisition and execution remain unavailable. The logical `1.0-scaffold` envelope and `1.0-reserved` register map describe scaffold contracts. Target synthesis, timing closure and electrical safety require their own evidence. [FPGA conformance](fpga-contract-conformance.md)

Future EP4CE10E22C8N + external SDRAM: Logic Analyzer, Scope 2CH + ADC/AFE, Generator 2CH + DAC/output stage, shared SDRAM arbiter, trigger, timestamps and explicit CDC. Pinout, switching/protection schematic, part selections, timing and electrical values: TBD_BY_HARDWARE_DESIGN. Never fabricate hardware success or measurements.

## Current multi-repo release boundary

The [repository map](system.md#system-boundary) identifies source ownership.
The [release lock](../../../integration/release-set.json) selects system and
Interface `0.1.4` and API, Contracts, Simulator, Hardware and FPGA scaffold
`0.1.2`. It records the exact artifacts and independently pinned DEV tools.
CircuitGraph, Hardware RPC, NCAP and FPGA protocol have independent versions.

Contracts owns schema, catalog, wire format and SDK generation. The selected
Python API's FastAPI registrations provide the OpenAPI handoff. Integration
uses installed producer artifacts and checks their actual wire behavior.
Rust Remote, Rust Contracts, Rust Hardware and the C++ worker have separate
candidate evidence. The [native migration status](native-migration-status.md)
records accepted combinations and open deployment and release gates.
[Contracts consumer guide](../api/contracts-consumer.md) · [Release and rollback](../operations/release-and-rollback.md)

<a id="historical-extraction-stage-ownership"></a>

## Migration execution history

See the [Lab-First ledger](../history/lab-first-migration-ledger.md), the
[M6 release record](../history/verification/2026-10-27-multi-repo-migration-m6.md)
and the [original extraction-stage record](https://github.com/cirnetlab/cirnet-remote/blob/13a35145b6d15644c7be10d95a5410bf69e11867/docs/ARCHITECTURE.md#historical-extraction-stage-ownership)
for decisions, stage-specific package versions and results.

## Execution discipline

Follow [AGENTS.md](../../../AGENTS.md) and the [verification guide](../contributing/verification.md).
Create temporary screenshots, video, traces and raw diagnostics outside all
repositories and worktrees. The [history index](../history/index.md) links
the dated verification records and their scope.
