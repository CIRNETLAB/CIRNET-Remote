# PROMPT FOR CODEX
## net*CIRCUIT Remote — Post-R7 Architecture Hardening Before Merge

> **Context**
>
> The `refactor` branch has completed R0 → R7 and has **not been merged**.
> This prompt is a **post-R7 correction/hardening pass**, not a rewrite and not a new architecture.
>
> The canonical authority remains:
>
> ```text
> docs/ARCHITECTURE.md
> ```
>
> and the governing philosophy is:
>
> ```text
> Computer checks SAFETY
>         ↓
> Safe circuit is allowed to run
>         ↓
> Real hardware / physics produces behavior
>         ↓
> Software observes, compares and teaches
> ```
>
> Therefore:
>
> ```text
> SAFETY != CORRECTNESS
> UNKNOWN != UNSAFE
> TOPOLOGY MISMATCH != RUN BLOCK
> ```
>
> Do not merge or push to main/master at the end. Stop after verification and report to the user.

---

# 1. Role

Act as:

> **Senior Software Architect + Senior Full-Stack/Embedded Engineer**

Your task is to correct the remaining architecture gaps discovered after R7 while preserving the parts of the refactor that are already good.

Do **not** redo R0 → R7 from scratch.

Do **not** rewrite the working Three.js/Web-CAD editor.

Do **not** invent hardware implementation that has not been electrically designed.

---

# 2. Mandatory pre-flight

Confirm:

```bash
git branch --show-current
git status
git log --oneline --decorate -15
```

Required branch:

```text
refactor
```

If the worktree is dirty:
- preserve user changes;
- do not reset;
- report the dirty files before editing;
- do not overwrite unrelated work.

Read:

```text
docs/ARCHITECTURE.md
docs/CONTEXT.md
docs/CIRCUIT_SPEC.md
docs/ROADMAP.md
docs/MIGRATION_LAB_FIRST.md
docs/PHYSICAL_LAB_SAFETY.md
```

Then inspect the current implementation before modifying it:

```text
contracts/physical-lab/lab.schema.json
contracts/assignment/*
contracts/hardware/v2/*
contracts/validation.py

services/api/app/services/experiments.py
services/api/app/services/lab_compiler.py
services/api/app/services/verification.py
services/api/app/services/captures.py
services/api/app/services/execution_policy.py
services/api/app/services/persistence.py

services/hardware-service/hardware_service/station/*
services/hardware-service/hardware_service/models.py
services/hardware-service/hardware_service/rpc.py

simulator/circuit-simulator/netcircuit_sim/*

apps/web/src/types/labValidation.ts
apps/web/src/stores/experiment.ts
apps/web/src/stores/instrument.ts
apps/web/src/stores/station.ts
apps/web/src/services/api/*
apps/web/src/components/windows/SignalMonitorWindow.vue
apps/web/src/components/windows/OscilloscopeWindow.vue
apps/web/src/components/windows/GeneratorWindow.vue

fpga/*
tests/*
```

---

# 3. Baseline verification

Use the project-supported environment.

The repository RPC tests require:

```text
grpcio-tools
```

through:

```text
services/hardware-service[dev]
```

Therefore a local failure such as:

```text
ModuleNotFoundError: grpc_tools
```

must first be classified as an **environment/dependency problem**, not automatically as a source regression.

The CI integration workflow already installs:

```text
-e './services/hardware-service[dev]'
```

Run the full supported install/test flow available in the environment.

Minimum verification:

```bash
python scripts/check_context.py
pytest -q
```

Frontend:

```bash
cd apps/web
npm test
npm run build
cd ../..
```

If the environment does not have `grpcio-tools`, either use the existing project venv that does, or install the documented dev extras if network/package cache allows it. Do not weaken/delete RPC tests merely because the audit shell lacks a dependency.

Record the baseline in:

```text
docs/MIGRATION_LAB_FIRST.md
```

under a new **Post-R7 Hardening** section.

---

# 4. Findings that must be corrected before merge

The following findings are based on the current R7 source and are not hypothetical.

## 4.1 P0 — Physical arbitrary-placement flow is incomplete

Current behavior:

```text
scan_topology()
    ↓
DetectedTopologyGraph
    ↓
TopologyVerificationService
```

but then:

```text
LabExecutionCompiler.compile(experiment, assignment, capabilities)
```

does **not consume the detected topology or a resolved topology binding**.

For hardware mode the compiler currently takes:

```text
assignment.lab_endpoints[*].node_id
```

directly and routes that node against station routing resources.

This means the system still assumes fixed physical endpoint node IDs from the assignment.

That is incompatible with the core requirement:

> Instructor and students may place ICs/wiring at different arbitrary breadboard positions.

A physical scan must be able to resolve the student's **actual observed nodes** to the assignment's semantic/reference endpoints before compilation.

### Required correction

Insert an explicit resolution stage:

```text
DetectedTopologyGraph
        +
AssignmentDefinition
        +
InstructorPinProfiles / ComponentResolutionMode
        ↓
Topology Resolver
        ↓
TopologyResolutionResult / ResolvedLabBindings
        ↓
Lab Execution Compiler
        ↓
InstrumentationExecutionPlan
```

The compiler must consume resolved physical endpoint bindings.

It must not use teacher/reference physical node IDs as if they were student physical node IDs.

---

## 4.2 P0 — Observed components have no pin-to-node mapping

Current `ObservedPhysicalComponent` only has:

```text
component_id
kind
node_ids[]
identity
package?
observations[]
```

This is insufficient to determine:

```text
IC pin 1 → observed breadboard node N42
IC pin 2 → observed breadboard node N43
...
```

Without per-pin bindings, the system cannot robustly:
- resolve orientation;
- apply instructor pin profiles;
- compare reference pin wiring;
- map a reference endpoint to the student's actual node;
- identify VCC/GND/signal pin semantics for supported devices.

### Required correction

Add a contract such as:

```text
ObservedPinBinding
├── pin_id
├── node_id
├── confidence?
├── inferred_role?
└── observations?
```

and include:

```text
pins[]
```

inside `ObservedPhysicalComponent`.

Do not invent actual pin roles automatically when scan evidence does not support them.

---

## 4.3 P0 — TopologyVerificationService is still a placeholder

Current implementation primarily:
- uses a **set** of component identities;
- checks connection count;
- returns `UNKNOWN` / `AMBIGUOUS`;
- does not semantically compare actual electrical topology.

Problems:

1. `set()` loses component multiplicity:
   - two `74HC08` vs one `74HC08` can be misrepresented.
2. Two circuits with the same number of connections but different wiring are not meaningfully compared.
3. No pin-level net comparison.
4. No real topology mapping independent of node labels/teacher placement.
5. `assessment_policy` is not meaningfully used.

### Required correction

Implement a deterministic topology resolver/matcher for **supported components only**.

Do not add AI/ML.

Recommended model:

```text
DetectedNode IDs
    ↓
union detected electrical connections
    ↓
electrical net groups
    ↓
component pin → net incidence graph
```

Reference topology is normalized the same way.

Candidate component matches may use:

```text
identity
package
pin signature
InstructorPinProfile
AUTO_DISCOVERY evidence
HYBRID evidence
```

Rules:

- Use a `Counter`/multiset for component quantities, not a set.
- Node IDs/coordinates are not equality criteria.
- Match component-pin-net incidence.
- If exactly one valid mapping exists → resolved.
- If multiple equally valid mappings exist → `AMBIGUOUS`.
- If a device is opaque/unknown → do not guess identity.
- Topology result remains diagnostic only and never directly blocks Run.

Do not attempt a general unconstrained graph-isomorphism research project. Implement only what the supported contract/test cases require.

---

## 4.4 P0 — Need explicit TopologyResolutionResult / ResolvedLabBindings

Add a contract such as:

```text
TopologyResolutionResult
├── schema_version
├── status
│   ├── RESOLVED
│   ├── PARTIAL
│   ├── AMBIGUOUS
│   └── UNRESOLVED
├── component_matches[]
├── endpoint_bindings[]
├── issues[]
└── confidence?
```

Example endpoint binding:

```text
ResolvedEndpointBinding
├── endpoint_id
├── observed_node_id
├── source
│   ├── FIXED_NODE
│   ├── REFERENCE_TOPOLOGY
│   ├── COMPONENT_PIN
│   └── DESIGN_PORT
└── confidence?
```

For physical execution:

```text
required endpoint unresolved
    → BLOCK_UNEXECUTABLE
```

This is an executability failure, **not a correctness failure**.

For a safe opaque IC:

```text
unknown IC + required endpoints resolved
    → RUN_GUARDED
```

---

# 5. LabEndpoint semantics must distinguish reference from actual physical node

Current `LabEndpoint` has:

```text
node_id
design_port
```

This is ambiguous for arbitrary placement.

Correct the contract so an assignment can express one of these concepts without pretending a teacher's node ID is the student's node ID.

Preferred minimum semantics:

```text
LabEndpoint
├── endpoint_id
├── role
├── required
├── channel?
├── design_port?          # virtual design
├── fixed_node_id?        # true station-fixed terminal/node
└── reference_node_id?    # node in reference topology requiring resolution
```

If backwards compatibility inside this unmerged branch is not needed, replace ambiguous `node_id` cleanly.

If preserving it temporarily:
- define it explicitly as deprecated/fixed physical node only;
- never use it as a reference/student-equivalence shortcut.

Semantic validation must ensure an endpoint does not contain mutually contradictory binding forms.

---

# 6. Verification result contracts drifted from approved Lab-First v3

The approved architecture called for useful structured teaching diagnostics.

Current contracts reduce most results to:

```text
status
issues[]
observed_signals?
```

Restore structured result detail.

## 6.1 SafetyVerificationResult

Keep `issues[]`, but add structured optional evidence such as:

```text
power_shorts[]
hazardous_drive_conflicts[]
over_current_risks[]
invalid_voltage_risks[]
polarity_errors[]
protection_faults[]
notes[]
```

Do not fabricate these values if the hardware driver cannot provide them.

## 6.2 TopologyVerificationResult

Support structured diagnostics:

```text
matched_components[]
missing_components[]
unexpected_components[]
unknown_components[]

matched_nets[]
missing_nets[]
unexpected_nets[]
shorted_nets[]

orientation_differences[]
pin_mapping_differences[]
confidence?
```

This enables meaningful student feedback.

## 6.3 FunctionalVerificationResult

Support:

```text
expected_signals[]
observed_signals[]
mismatched_signals[]

expected_truth_table?
observed_truth_table?

timing_results?
waveform_comparisons?
```

Only populate fields supported by real simulation/hardware observations.

### Important

Because branch `refactor` is not merged/released, prefer correcting schema `1.0` in-place rather than introducing unnecessary version proliferation, unless repository evidence shows external persisted consumers already depend on the current R7 schema.

Document the ruling in `MIGRATION_LAB_FIRST.md`.

---

# 7. Contract invariants need tightening

## 7.1 OpaquePhysicalComponent invariant

Current graph items reference broad `ObservedPhysicalComponent`, which allows:

```text
kind = OPAQUE_PHYSICAL_COMPONENT
identity = anything non-empty
```

while the separate opaque definition says:

```text
identity = UNKNOWN
```

Enforce:

```text
OPAQUE_PHYSICAL_COMPONENT → identity == UNKNOWN
```

Use either:
- a JSON Schema union supported by both Python and frontend validators, or
- explicit semantic validation.

If adding `oneOf`, update the frontend schema validator to support it correctly. Do not silently make browser validation weaker.

## 7.2 DetectedTopologyGraph integrity

Semantic validation must reject or flag:

- connection references to non-existent node IDs;
- duplicate node IDs inside one connection;
- pin binding references to non-existent nodes;
- duplicate pin IDs within one component;
- duplicate logically identical detected connections if invalid for the model.

Scan data is physical evidence. Invalid driver evidence must not silently enter the execution compiler.

Treat impossible/malformed scan evidence as:

```text
DRIVER_ERROR
```

or:

```text
SAFETY_INDETERMINATE
```

depending on context.

## 7.3 reference_design_graph

Current assignment schema accepts it as an arbitrary object.

When present, validate it as CircuitGraph 1.0 via the existing circuit schema validator.

Do not duplicate the entire CircuitGraph schema inside the Lab schema if cross-schema semantic validation is simpler/cleaner.

---

# 8. Instrument channel indexing is inconsistent

Current contract allows:

```text
LabEndpoint.channel >= 0
InstrumentationExecutionPlan.instrument_allocations.channel >= 0
```

while:

```text
GeneratorConfiguration.channel = 1 or 2
LabExecutionCompiler expects 1 <= channel <= limit
```

Standardize user-facing instrument channels as **1-based**:

```text
Scope CH1 / CH2
Generator CH1 / CH2
Logic Analyzer channel policy documented separately
```

At minimum:
- endpoint instrument channel min = 1;
- allocation channel min = 1;
- tests reject channel 0;
- frontend types/forms follow the same convention.

Do not use channel 0 in one layer and channel 1 in another.

---

# 9. StationCapabilities currently has duplicate instrument truth

Current capabilities contain both:

```text
logic_analyzer_channels
oscilloscope_channels
generator_channels
```

and:

```text
instruments: {
  generator: {available, channels, status},
  ...
}
```

Compiler and frontend use different sources.

This can contradict itself.

### Required correction

Choose one authoritative runtime representation.

Recommended:

```text
structured instrument_capabilities
```

or, to minimize change:

```text
channel count == 0 → unavailable
channel count > 0 → available
```

with optional detailed limits.

Whichever you choose:
- compiler;
- API;
- HardwareStation;
- frontend;
- tests

must derive from one source.

No duplicated independent availability/channels state.

Target capacity docs may still say “Scope 2CH / Generator 2CH”, but runtime capabilities must reflect actual implementation. If ADC/DAC are not implemented:

```text
oscilloscope_channels = 0
generator_channels = 0
```

for that actual station.

---

# 10. Instrument safety limits belong in capabilities/profile

Current `GeneratorConfiguration` permits arbitrary positive frequency/amplitude and any offset.

Do not invent electrical limits.

Add optional profile-derived runtime limits, for example:

```text
GeneratorCapability
├── channels
├── supported_waveforms[]
├── frequency_min_hz?
├── frequency_max_hz?
├── amplitude_max_vpp?
├── offset_min_v?
├── offset_max_v?
└── runtime_reconfiguration_supported
```

Similarly future Scope capability may expose measured/specified:
- channel count;
- sample-rate ranges;
- input ranges;
- trigger features.

Until hardware design gives real values, leave fields absent/unavailable or `TBD_BY_HARDWARE_DESIGN` in docs.

The compiler/driver must reject out-of-capability configuration when limits exist.

---

# 11. Generator runtime state/lifecycle is inconsistent

Current layers disagree:

- API allows instrument configuration in `ROUTE_PREPARE`, `GUARDED_POWER_UP`, `RUNNING`.
- Physical station `configure_generator()` only accepts `ROUTE_PREPARE`, `READY`.
- Frontend enables generator Apply in `GUARDED_POWER_UP` / `RUNNING`.

This will become a real bug when a physical generator is available.

### Required correction

Choose explicit semantics:

## Baseline configuration

Normal generator configuration belongs in:

```text
InstrumentationExecutionPlan
```

before guarded power-up.

## Runtime reconfiguration

Only permit if:

```text
runtime_reconfiguration_supported == true
```

and the HardwareStation state machine explicitly allows it safely.

For V1/current unavailable generator:

```text
runtime_reconfiguration_supported = false
```

Frontend must not expose an action that the backend/physical station would reject by design.

Also route instrument configuration through `ExperimentManager`/orchestration under the same ownership/state locking rather than calling the hardware gateway directly from the API route.

Avoid bypassing lifecycle synchronization.

---

# 12. Physical scheduler must consume actual capacity

Current scheduler has:

```python
capacity = 4 if simulation else 1
```

For physical V1, `1` matches the target, but architecture says capacity comes from:

```text
StationCapabilities.physical_execution_slots
```

Fix:

```text
hardware capacity = validated capabilities.physical_execution_slots
```

Tests:

```text
slots=1 → serial physical executions
slots=2 → at most two concurrent leases
slots=0 → BLOCK_UNEXECUTABLE / unavailable
```

Do not claim real parallel electrical safety just because a unit test uses `slots=2`; this only verifies scheduler behavior for future partitioned hardware profiles.

For simulation, replace magic `4` with a server configuration such as:

```text
NETCIRCUIT_SIMULATION_WORKERS
```

defaulting conservatively to 4.

---

# 13. Linux Mini PC multiprocessing stability

Current VirtualHardwareStation uses:

```python
ProcessPoolExecutor(max_workers=4)
```

The audit on Python 3.13 Linux produced a warning:

```text
This process is multi-threaded, use of fork() may lead to deadlocks in the child.
```

The Hardware Service itself uses threaded gRPC, so implicit `fork` after threads is undesirable.

Use an explicit safe multiprocessing context, preferably:

```python
multiprocessing.get_context("spawn")
```

for cross-platform deterministic behavior.

Make worker count configurable.

Tests must prove:
- pool still executes virtual simulations;
- pool closes cleanly;
- Windows-compatible spawn path works;
- no test relies on fork-only global state.

---

# 14. Capture architecture is not yet scalable or aligned with canonical docs

Current `CaptureResult` embeds:

```text
samples[]
```

up to 100,000 entries.

`ExperimentRecord.capture` persists that structure in database JSON.

`experiment.updated` emits the complete experiment record, therefore lifecycle updates after capture may retransmit the entire capture payload.

This conflicts with:

```text
capture metadata in DB
large payload in capture storage
versioned binary data for large captures
```

and will not scale cleanly to:
- 30–50 sessions;
- Logic Analyzer deep capture;
- future Oscilloscope 2CH.

### Required correction

Split capture metadata from payload.

Introduce concepts such as:

```text
CaptureMetadata
├── capture_id
├── source
├── instrument
├── encoding
├── channel_count
├── sample_count
├── sample_rate?
├── duration
├── timestamp?
├── available
└── payload_ref / storage_key
```

`ExperimentRecord` and lifecycle WebSocket events carry metadata/reference only.

Create a capture storage abstraction:

```text
CaptureStore
```

V1 implementation:

```text
filesystem
```

with configurable:

```text
NETCIRCUIT_CAPTURE_DIR
```

Do not store large payloads in PostgreSQL JSON.

Expose a dedicated capture data endpoint or binary streaming path.

Minimum rule:

```text
WebSocket lifecycle JSON != full large sample payload
```

A small bounded preview may be included only if explicitly configured.

---

# 15. Capture model must be future mixed-signal-ready

Current capture contract is hardcoded:

```text
instrument = logic_analyzer
encoding = digital_events
value = 0 / 1 / X
```

Keep the current digital path, but make the **capture envelope** extensible for future Scope.

Example concepts:

```text
instrument:
  LOGIC_ANALYZER
  OSCILLOSCOPE

encoding:
  DIGITAL_EVENTS
  INT16
  UINT16
  FLOAT32
  ...
```

For R7 hardening:
- implement real digital payload handling;
- define analog metadata/envelope only;
- do not generate fake analog samples;
- physical Scope remains unavailable until ADC/AFE exists.

---

# 16. Frontend capture flow must not receive repeated giant payloads

After the capture storage split:

```text
experiment.updated
```

must carry:

```text
CaptureMetadata
```

not all samples.

Signal Monitor should:
1. receive metadata/capture ID;
2. fetch the payload exactly when needed;
3. cache it locally in instrument state;
4. render digital events.

Oscilloscope:
- may use the same capture envelope later;
- must remain truthful (`NO WAVEFORM DATA`) until real Scope capture exists.

Do not fake physical scope waveforms.

---

# 17. FunctionalVerificationService must use richer observations

Current implementation primarily compares expected signal values against sample lookup and returns only a status/issues result.

Refactor it to return structured:

```text
expected_signals
observed_signals
mismatched_signals
```

For truth-table assignments:
- derive expected cases deterministically;
- report the observed value per requested output/case;
- preserve `X`/no-response semantics.

Do not turn FunctionalVerification into a pre-run gate.

---

# 18. Assignment policy semantics

Current contract has:

```text
STRICT_TOPOLOGY
FUNCTIONAL_ONLY
TOPOLOGY_AND_FUNCTION
```

Execution policy must remain independent of these grading modes.

Define explicitly:

```text
assessment_policy controls evaluation/reporting
NOT energization permission
```

Examples:

```text
STRICT_TOPOLOGY:
  report topology grade/result + function
  but SAFE mismatch may still run

FUNCTIONAL_ONLY:
  topology may still be diagnostic
  grade based on observed behavior

TOPOLOGY_AND_FUNCTION:
  both reported/evaluated
  neither overrides Safety Gate
```

Add tests.

---

# 19. Frontend validator compatibility

Current browser-side schema validator supports a limited subset of JSON Schema.

If contract changes add:

```text
oneOf
allOf
if/then
```

either:
- extend `apps/web/src/types/labValidation.ts` correctly; or
- prefer semantic validation that keeps the browser validator simple.

Do not update Python schema semantics without keeping frontend response validation equivalent where that contract reaches the browser.

Regenerate:

```text
apps/web/src/data/labContracts.json
apps/web/src/types/lab.ts
```

through the repository's existing generation/check mechanism.

Never hand-edit generated snapshots unless the project currently defines them as hand-maintained.

---

# 20. Migration ledger provenance

Current:

```text
docs/MIGRATION_LAB_FIRST.md
```

references:

```text
docs/PROMPT_CODEX_net-Circuit-Remote_Lab-First_Refactor_R0-R7.md
```

but that prompt is not present in the repository snapshot.

Repair provenance:

Preferred:
- archive the executed R0→R7 prompt under a clearly historical path if available;
- otherwise update ledger wording to reference the canonical architecture + audit plan rather than a missing file.

Do not fabricate a prompt file whose contents cannot be proven to be the executed prompt.

---

# 21. What is already correct — do not rewrite it

Preserve unless tests prove a defect:

```text
Vue 3 + TypeScript + Vite + Pinia
Three.js SceneManager boundary
CircuitGraph as DesignGraph truth
explicit logical connections
placement ghost behavior
editor Undo/Redo
HardwareStation abstraction
VirtualHardwareStation / PhysicalHardwareStation separation
local-only Hardware Service boundary
RPC v2 safety-oriented shape
Mini PC deployment
PostgreSQL production target
discrete-event simulator core
R7 fail-closed FPGA scaffold
Scope/Generator unavailable honesty
```

Do not optimize the Vite ~906 kB bundle during this correction unless your changes introduce a clear regression.

---

# 22. Corrective implementation phases

Use the existing `refactor` branch.

Do not create a second long-lived refactor branch.

Use one commit per corrective phase.

---

## H0 — Contract and canonical architecture hardening

### Goal

Fix the domain contracts before changing services.

### Implement

- `ObservedPinBinding`.
- per-component `pins[]`.
- `TopologyResolutionResult`.
- `ResolvedEndpointBinding`.
- LabEndpoint reference/fixed binding semantics.
- rich Safety/Topology/Functional results.
- opaque component invariant.
- DetectedTopologyGraph semantic integrity.
- reference CircuitGraph validation.
- 1-based instrument channel semantics.
- canonical architecture/docs update.

### Tests

Write RED tests first for:

1. Opaque component with identity other than `UNKNOWN` rejected.
2. Component pin references missing detected node rejected.
3. Connection references missing node rejected.
4. Duplicate pin IDs rejected.
5. Channel 0 rejected where instrument channels are user-facing.
6. Reference topology/student topology may use different node IDs.
7. Required resolution contract serializes/validates.
8. `reference_design_graph` invalid CircuitGraph rejected semantically.
9. structured verification result fields validate.
10. frontend generated schema check remains green.

### Commit

```text
fix(post-r7-h0): harden Lab-First physical contracts
```

---

## H1 — Topology resolver and arbitrary-placement execution

### Goal

Make the project's core arbitrary-placement requirement actually work end-to-end.

### Implement

Add a service/module such as:

```text
TopologyResolver
```

Input:

```text
AssignmentDefinition
DetectedTopologyGraph
StationCapabilities / profiles if needed
```

Output:

```text
TopologyResolutionResult
```

Then change orchestration:

```text
scan
 ↓
safety verify
 ↓
resolve topology
 ↓
topology verify
 ↓
execution policy
 ↓
compiler(resolved bindings)
```

Change `LabExecutionCompiler` so physical mode consumes actual resolved student nodes.

Do not compile teacher physical node IDs directly.

Do not rebuild/repair internal student wiring.

### Required tests

#### A. Arbitrary placement

Reference:

```text
reference node = REF_N1
```

Student observed:

```text
node = STUDENT_N42
```

Equivalent component-pin/net incidence must resolve:

```text
endpoint → STUDENT_N42
```

and the plan routes `STUDENT_N42`, not `REF_N1`.

#### B. Same connection count but wrong wiring

Must return:

```text
Topology = MISMATCH
```

not UNKNOWN solely because counts match.

If safety is SAFE and required execution endpoints resolve:

```text
ExecutionDecision = RUN_NORMAL or RUN_GUARDED
```

not BLOCK.

#### C. Wrong IC

Safe wrong known IC:
- topology mismatch;
- Run allowed if executable;
- function may later fail.

#### D. Unknown/opaque IC

Safe opaque IC + required endpoints resolved:

```text
RUN_GUARDED
```

#### E. Ambiguous mapping

Multiple valid component mappings:

```text
TopologyResolutionResult = AMBIGUOUS
```

Do not guess.

If ambiguity prevents a required endpoint binding:

```text
BLOCK_UNEXECUTABLE
```

If required endpoints are fixed/resolved despite unrelated ambiguity:
- ambiguity alone does not block.

#### F. Duplicate component types

Two identical 74HCxx parts must be counted/matched as two components.

Use a multiset/Counter and deterministic mapping.

### Commit

```text
fix(post-r7-h1): resolve arbitrary physical placement before execution
```

---

## H2 — Capture data plane and storage

### Goal

Stop embedding potentially huge sample arrays in experiment records/WebSocket lifecycle events.

### Implement

- `CaptureMetadata`.
- `CaptureStore` abstraction.
- filesystem V1 implementation.
- configured capture directory.
- dedicated payload fetch/binary path.
- digital capture encoder/decoder.
- future analog-compatible envelope.
- experiment record stores metadata/reference only.
- lifecycle event contains metadata only.
- FunctionalVerification loads payload through CaptureStore/service.
- frontend SignalMonitor fetches payload by capture ID.

### Tests

1. Experiment DB record contains no large `samples[]`.
2. `experiment.updated` contains no full sample payload.
3. Digital payload stored and fetched losslessly.
4. Malformed/corrupt payload fails explicitly.
5. Unauthorized owner cannot fetch another owner's capture.
6. Capture deletion/cleanup behavior documented/tested.
7. 100k digital events do not serialize into lifecycle JSON.
8. Scope analog envelope can validate metadata while data remains unavailable.
9. Existing virtual AND capture/function integration still passes.

### Commit

```text
fix(post-r7-h2): separate capture metadata from payload storage
```

---

## H3 — Scheduler and worker stability

### Goal

Use real capabilities/configuration instead of magic concurrency values.

### Implement

Physical:

```text
capacity = capabilities.physical_execution_slots
```

Simulation:
- configurable worker count;
- default 4;
- explicit spawn multiprocessing context.

Add configuration such as:

```text
NETCIRCUIT_SIMULATION_WORKERS
```

Do not infer 30–50 physical concurrency from connected-user count.

### Tests

1. physical slots=0 → no execution.
2. slots=1 → serial.
3. slots=2 → max two leases.
4. third waits.
5. release dispatches next.
6. worker count config honored.
7. simulation process pool works with spawn.
8. close cleans worker processes.
9. virtual capture still deterministic.

### Commit

```text
fix(post-r7-h3): align execution capacity and process workers
```

---

## H4 — Instrument capability and lifecycle consistency

### Goal

Remove contradictory instrument availability/channel truth and dormant runtime configuration bugs.

### Implement

Choose one authoritative capability representation.

Recommended minimal direction:

```text
instrument_capabilities
```

with:
- availability;
- channels;
- optional limits;
- runtime reconfiguration flag.

If a smaller migration is safer, retain top-level channel counts but derive every other representation from them.

Never keep independently editable duplicated truth.

Refactor:
- LabExecutionCompiler.
- HardwareStation.
- API.
- frontend station store.
- GeneratorWindow.

Baseline generator configuration belongs to the execution plan.

Runtime reconfiguration only if capability says it is supported.

Route reconfiguration through `ExperimentManager`, under lifecycle ownership/state synchronization.

### Tests

1. station cannot claim generator unavailable and channels=2 simultaneously unless semantics explicitly distinguish target-vs-runtime.
2. unavailable generator → UI disabled + backend `UNEXECUTABLE/NOT_IMPLEMENTED`.
3. runtime reconfiguration false → no live Apply during RUNNING.
4. runtime reconfiguration true test double → allowed only legal states.
5. channel > capabilities rejected.
6. hardware-profile limits enforced when present.
7. no fabricated voltage/frequency limits.

### Commit

```text
fix(post-r7-h4): unify instrument capabilities and runtime control
```

---

## H5 — Rich learning feedback and frontend integration

### Goal

Expose the Lab-First teaching information without turning it into a correctness gate.

### Implement frontend/API mapping for:

```text
SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult
TopologyResolutionResult
```

UI must retain independent:

```text
SAFETY
TOPOLOGY
FUNCTION
```

Add useful diagnostics such as:
- missing component;
- unexpected component;
- unknown component;
- missing net;
- unexpected net;
- pin mapping difference;
- expected/observed signal mismatch.

Do not redesign the entire workbench.

Do not highlight unproven physical positions as certain when confidence is ambiguous.

### Tests

1. SAFE + MISMATCH + FAIL renders exactly as three independent states.
2. SAFE + UNKNOWN + NO_RESPONSE allowed.
3. UNSAFE renders blocked.
4. ambiguity shown as ambiguity, not guessed location.
5. capture payload fetched once and cached.
6. scope remains truthful with no analog capture.
7. existing 3D editor tests remain unchanged/green.

### Commit

```text
fix(post-r7-h5): expose resolved Lab-First diagnostics in the workbench
```

---

## H6 — Documentation, provenance and final architecture review

### Goal

Make source, docs and tests agree before merge.

### Update

```text
docs/ARCHITECTURE.md
docs/CIRCUIT_SPEC.md
docs/CONTEXT.md
docs/ROADMAP.md
docs/MIGRATION_LAB_FIRST.md
docs/PHYSICAL_LAB_SAFETY.md
README.md
services/api/README.md
services/hardware-service/README.md
```

Document explicitly:

```text
DetectedTopologyGraph
        ↓
TopologyResolver
        ↓
ResolvedLabBindings
        ↓
LabExecutionCompiler
```

and:

```text
reference physical node != student physical node
```

Document CaptureStore/data-plane split.

Repair missing migration prompt provenance without inventing history.

Clean deprecation warnings only if the fix is bounded and safe; do not expand scope merely to remove a warning.

### Commit

```text
docs(post-r7-h6): align architecture and migration evidence
```

---

# 23. Hardware/FPGA scope for this hardening pass

Do **not** turn this prompt into FPGA feature development.

R7 FPGA scaffold is intentionally abstract and truthful.

Do not implement fake:

```text
ADC
DAC
SDRAM timing
USB3
real topology scanner
crosspoint driver
electrical limits
```

without schematics/part numbers/pinout/datasheet evidence.

Only change FPGA/protocol files if required by a corrected software contract and the change remains an abstract compile-safe boundary.

No invented pin assignments.

No invented sampling rate.

No invented generator voltage.

No claim of electrical safety from RTL tests.

---

# 24. Testing discipline

For every H phase:

1. Write failing tests first.
2. Run them and confirm failure for the intended reason.
3. Implement the smallest correct change.
4. Run targeted tests.
5. Run affected subsystem tests.
6. Run repository regression tests.
7. Commit only when green.

Never delete a failing test just to reach green.

Never weaken a Lab-First rule to preserve old behavior.

---

# 25. Full verification before reporting completion

Use the project-supported Python environment with dev extras, including `grpcio-tools`.

Run:

```bash
python scripts/check_context.py

pytest -q

pytest -q tests/contracts
pytest -q tests/integration
pytest -q tests/frontend
pytest -q tests/deployment
pytest -q tests/fpga

pytest -q services/api/tests
pytest -q services/hardware-service/tests
pytest -q simulator/circuit-simulator/tests
```

Frontend:

```bash
cd apps/web
npm test
npm run build
cd ../..
```

FPGA if tool exists:

```bash
iverilog ...
```

or use the repository's existing FPGA test command/workflow.

A local test failure caused solely by missing `grpc_tools` is an environment issue; install/use documented dev extras and re-run. Do not mark the source green until the supported environment actually passes.

---

# 26. Required architecture regression tests before merge

There must be explicit automated coverage for all of the following:

```text
1. Teacher and student use different physical node IDs but equivalent topology.
2. Compiler routes resolved student node, not teacher/reference node.
3. Wrong safe wiring can Run and then function FAIL.
4. Wrong safe IC can Run.
5. Unknown safe IC can RUN_GUARDED.
6. VCC–GND short cannot Run.
7. Required endpoint unresolved → BLOCK_UNEXECUTABLE.
8. Topology ambiguity never gets guessed silently.
9. Duplicate same-type IC quantities are respected.
10. Opaque component identity invariant.
11. Detected pin/node references are valid.
12. Instrument channel 0 is rejected.
13. Physical scheduler uses capability slots.
14. Simulation worker uses safe spawn context.
15. Large capture payload is not embedded in lifecycle WebSocket/DB JSON.
16. Capture ownership is enforced.
17. Generator lifecycle/capabilities cannot contradict each other.
18. SAFETY / TOPOLOGY / FUNCTION remain independent in UI.
19. CircuitGraph/Three.js behavior has no regression.
20. Physical FPGA unavailable state remains truthful.
```

---

# 27. Merge-readiness criteria

Do not recommend merge unless all are true:

## Architecture

```text
Detected topology actually participates in physical endpoint resolution.
Arbitrary placement works in tests.
Teacher node IDs are not reused as student node IDs.
Internal student wiring is never reconstructed by FPGA/compiler.
Safety remains the only hard electrical gate.
```

## Contracts

```text
Pin-to-node observations exist.
Resolution result exists.
Structured teaching diagnostics exist.
Unknown/opaque semantics are consistent.
Capture envelope is extensible.
```

## Backend

```text
Resolver → verification → policy → compiler order is explicit.
Compiler consumes resolved physical bindings.
Scheduler uses station capacity.
Large capture payloads are externalized.
Instrument control uses lifecycle orchestration.
```

## Hardware Service

```text
Safety lifecycle remains fail-closed.
No direct physical Run bypass.
Virtual simulation remains real.
Worker multiprocessing is Linux-safe.
No fake hardware availability.
```

## Frontend

```text
Existing Web-CAD remains stable.
SAFETY / TOPOLOGY / FUNCTION remain independent.
Large capture fetched separately.
No fake oscilloscope waveform.
```

## Tests

```text
context-check PASS
full Python suite PASS in supported environment
frontend tests PASS
frontend production build PASS
FPGA tests PASS or only explicitly documented tool-unavailable skips
working tree clean
```

---

# 28. Final report format

When H0 → H6 are complete, report:

```text
Branch:
HEAD:

Baseline:
- context
- Python
- frontend
- FPGA/tool availability

H0 commit:
H1 commit:
H2 commit:
H3 commit:
H4 commit:
H5 commit:
H6 commit:

Architecture corrections:
- arbitrary placement resolution
- pin mapping
- topology matching
- structured verification
- capture data plane
- scheduler/workers
- instrument capabilities

Full test matrix:
Frontend build:
Remaining warnings/skips:

Hardware features still intentionally unavailable:
- physical topology scanner electronics
- analog physical routing
- physical Scope ADC/AFE
- physical Generator DAC/output stage
- SDRAM implementation
- actual transport implementation
- target pinout/timing closure

Merge recommendation:
READY / NOT READY

Reason:
```

Finally:

```text
DO NOT MERGE.
DO NOT PUSH TO MAIN.
Stop and let the user review the refactor branch.
```

---

# 29. Key principle for every correction

If there is a conflict between “make tests green quickly” and the laboratory philosophy, preserve the laboratory philosophy:

```text
Safety asks:
"Can this student circuit be energized/executed safely?"

Topology asks:
"How does what the student built differ from the reference?"

Function asks:
"What did the real circuit actually do?"

Execution asks:
"Can the station safely and technically perform the experiment?"
```

These are four different questions.

Never collapse them into one validator again.
