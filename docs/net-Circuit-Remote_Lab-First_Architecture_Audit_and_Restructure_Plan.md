# net*CIRCUIT Remote — Architecture Audit & Lab-First Restructure Plan

## 1. Scope of this audit

Audited inputs:

- `net-Circuit-Remote(1).zip` — latest project source provided for this review.
- `net-Circuit-Remote_Architecture_v3_Lab-First.md` — approved Lab-First architecture baseline.

This audit distinguishes:

1. **Implemented source code**
2. **Scaffold / reserved contracts**
3. **Documentation claims**
4. **Approved target architecture**

No unimplemented feature is treated as if it already exists.

---

# 2. Executive conclusion

The current repository is **not yet implemented according to Lab-First v3**.

However, it is also **not a failed architecture that should be thrown away**.

The repository is currently best described as:

> **A strong Web/3D editor foundation + an early pre-Lab-First backend/hardware scaffold.**

The following parts are already structurally aligned and should be preserved:

- Vue 3 + TypeScript + Vite + Pinia frontend.
- Three.js rendering boundary.
- Circuit Graph as the logical source of truth for the Web editor.
- Explicit logical connections; 3D coordinates do not create electrical nets.
- FastAPI application boundary.
- Separate Hardware Service.
- `HardwareStation` abstraction.
- `VirtualHardwareStation` / `PhysicalHardwareStation` separation.
- gRPC/Protobuf boundary concept.
- EP4CE6 prototype → EP4CE10 + SDRAM progression.
- Oscilloscope/Generator rendered as separate instruments.
- Browser never writes FPGA registers/MUX addresses directly.
- Current physical implementation is still only a placeholder, which makes this a good time to restructure.

The largest problems are:

1. **The repository still declares Raspberry Pi 5 as the approved controller**, while the approved architecture uses the Mini PC.
2. **The repository documentation still treats the 2026-10-08 architecture spec as authoritative.**
3. **The approved Lab-First architecture file is not present inside the ZIP repository.**
4. **The old documentation/tests actively enforce obsolete architecture markers.**
5. **The source has no Lab-First Physical Lab Domain yet: Assignment, LabEndpoint, Safety/Topology/Functional verification, ExecutionDecision, DetectedTopologyGraph, guarded execution, scheduler.**
6. **The Hardware Service interface still exposes a generic `run()` without an enforced Lab-First safety/execution lifecycle.**
7. **Current Physical Compiler language still carries an older “compile the whole logical circuit to physical routing” idea. For the approved manual-breadboard Lab-First workflow, internal student wiring must remain physical; the system should route/control only lab infrastructure endpoints and instruments.**
8. **The current simulator is only a tiny functional primitive scaffold, not a discrete-event engine.**
9. **The current FPGA RTL is intentionally only a placeholder.**

Therefore the correct strategy is:

> **Do not ask an AI to rebuild the entire project from the v3 file in one pass.  
> First make the repository documentation/contracts authoritative and consistent, then refactor subsystem-by-subsystem with tests.**

---

# 3. What the current source actually does

## 3.1 Frontend

Current source:

```text
apps/web/
```

The frontend is by far the most developed part of the repository.

Observed architecture:

```text
CircuitStore / CircuitGraph
        ↓
useCircuitEditor
        ↓
SceneManager
        ↓
Three.js projection
```

Important source facts:

- `apps/web/src/types/circuit.ts`
  - Defines Circuit Graph 1.0.
  - Modules contain logical identity plus presentation pose.
  - Connections are explicit `source` → `destination` edges.

- `apps/web/src/stores/circuit.ts`
  - Owns Circuit Graph drafts.
  - Owns graph edit operations.
  - Owns snapshot Undo/Redo.
  - Owns file import/export.
  - Calls API structural validation.
  - History is bounded.
  - Explicit port connection logic prevents invalid editor connections.

- `apps/web/src/three/SceneManager.ts`
  - Contains an explicit comment that geometry is a projection of graph IDs/ports and is not a net source.
  - `syncGraph()` reconciles Three.js objects from Circuit Graph.
  - A placement ghost is render-only and never becomes Circuit Graph until commit.

- `apps/web/src/composables/useCircuitEditor.ts`
  - Commits final UI actions back into Circuit Store.
  - Temporary placement pose is intentionally outside graph/history.
  - Watches Circuit Graph and re-synchronizes SceneManager.

This part is **architecturally healthy**.

### Important future rule

The logical editor's `connectPorts()` restrictions must remain a **DesignGraph authoring rule only**.

Do **not** reuse this function/model to represent scanned physical student wiring.

A Lab-First physical student circuit may be wrong, ambiguous or contain unknown parts. It therefore requires a separate:

```text
DetectedTopologyGraph
```

with no editor correctness gate.

---

## 3.2 Frontend execution state

Current execution layer is only a placeholder.

Examples:

```text
apps/web/src/components/workbench/SimulationStatusBar.vue
```

Run / Stop / Step are disabled.

```text
apps/web/src/stores/experiment.ts
```

contains only a minimal state model.

```text
apps/web/src/services/api/experiments.ts
```

reserves experiment endpoints that the backend does not implement.

This is a **missing implementation**, not a wrong implementation.

---

## 3.3 Application Backend

Current source:

```text
services/api/
```

Actual functionality is small:

```text
GET  /api/health
GET  /api/stations
POST /api/circuits/validate
WS   /ws/events
```

`POST /api/circuits/validate` performs structural Pydantic validation only.

That behavior is compatible with Lab-First because structural DesignGraph validation is not the same thing as Physical Lab correctness checking.

Missing target modules include:

```text
Assignment Service
Experiment Manager implementation
Station Manager implementation
Scheduler / Queue
Persistence
Safety Verification
Topology Verification
Functional Verification
Execution Policy
Hardware Service gRPC client
PostgreSQL production persistence
```

---

## 3.4 Database

Current configuration:

```text
services/api/app/config.py
```

defaults to:

```text
sqlite:///./netcircuit.db
```

No substantial SQLAlchemy persistence layer is implemented yet.

Therefore this is inexpensive to change.

Recommended target:

```text
Development/tests:
    SQLite may remain optional if useful.

Production / multi-user:
    PostgreSQL is authoritative.
```

The repository must stop describing SQLite as the official V1 production baseline.

---

## 3.5 Hardware Service

Current source:

```text
services/hardware-service/
```

Good existing boundary:

```text
HardwareStation
├── VirtualHardwareStation
└── PhysicalHardwareStation
```

This should be preserved.

Current problem:

```python
run()
```

is a generic direct operation.

A future physical driver could therefore theoretically be called without enforcing:

```text
SAFE_STATE
TOPOLOGY_SCAN
SAFETY_CHECK
EXECUTION_DECISION
GUARDED_POWER_UP
```

Before a real physical driver is added, the interface should be changed.

Recommended conceptual Physical Station operations:

```text
get_capabilities
enter_safe_state
scan_topology
read_runtime_safety
prepare_execution
apply_routing
guarded_power_up
configure_clock
configure_generator
configure_trigger
arm_capture
start_execution
stop_execution
read_capture
reset
```

The application-level `Run` operation belongs in the Experiment Manager / lifecycle, not as an unguarded primitive exposed to arbitrary callers.

---

## 3.6 Station capabilities

Current:

```text
hardware_service/models.py
```

contains only:

```text
station_id
mode
available
breadboards
instruments
protocol_versions
```

Physical and virtual stations hard-code two breadboards.

Lab-First target capabilities need to be driver/profile-derived and include at least:

```text
virtualDigital
virtualAnalog
physicalDigital
physicalAnalogRouting
physicalExecutionSlots

topologyScanSupported
safetyGateSupported
guardedRunSupported
componentResolutionModes

logicAnalyzerChannels
oscilloscopeChannels
generatorChannels

routingResources
firmwareVersion
hardwareProfileVersion
```

Do not hard-code two breadboards unless the final hardware profile actually has two.

---

# 4. Physical Lab architecture correction required before implementation

This is the most important architecture refinement discovered during the source audit.

The approved Lab-First philosophy says:

```text
student physically builds circuit
→ system checks safety
→ safe circuit runs
→ physics produces result
```

Therefore the system must **not compile the reference circuit into routes that repair/recreate the student's internal wiring**.

For a manually wired breadboard experiment:

```text
Student jumper wires + inserted ICs
```

are the actual internal circuit.

The FPGA/routing fabric should normally route:

```text
Power
Input source
Clock
Function Generator
Output sense
Oscilloscope
Logic Analyzer
Safety scan
```

to/from physical breadboard nodes.

## Correct target model

```text
AssignmentDefinition
      +
DetectedTopologyGraph
      +
LabEndpoints
      +
StationCapabilities
      ↓
Safety Verification
      ↓
ExecutionDecision
      ↓
Lab Execution Compiler
      ↓
InstrumentationExecutionPlan
      ↓
Infrastructure Routing Solver
      ↓
FPGA / switching fabric
```

`InstrumentationExecutionPlan` should contain things such as:

```text
power rail route
safe current/voltage limits
input source route
clock route
generator route
output sense route
scope channel routes
logic analyzer routes
trigger/capture configuration
test vector sequence
runtime protection policy
```

It should **not** require every student IC to be logically resolved.

This is what allows:

```text
wrong IC       → safe → run → wrong output
unknown IC     → safe → guarded run → observed output/no response
wrong safe wire→ safe → run → observed wrong behavior
```

---

# 5. Current Lab-First v3 document also needs one cleanup pass

The approved v3 document contains the correct top-level philosophy and later Lab-First flow, but still contains several residual blocks from the previous architecture.

Before making it canonical in the repository, create a v3.1 cleanup.

Required corrections:

## 5.1 Remove old topology-equality run gate

An older section still effectively describes:

```text
Topology Scan
→ Compare with Reference
→ ERC
→ compile/run if topology equivalent
```

Replace with:

```text
Topology Scan
├→ Safety Verification
└→ Topology Verification (diagnostic)
        ↓
ExecutionDecision
```

## 5.2 Remove obsolete generic ERC language

Use:

```text
SafetyVerification
TopologyVerification
FunctionalVerification
ExecutionDecision
```

Do not use a single ERC that mixes:

```text
safety
correctness
unsupported components
```

## 5.3 Update HardwareStation interface

The architecture's early HardwareStation interface still lists the older generic methods.

Add topology scan, safety lifecycle and guarded execution boundaries.

## 5.4 Update the Physical Compiler description

Replace whole-circuit logical-to-physical compilation with:

```text
Lab Execution Compiler
```

for manual-breadboard mode.

Keep a separate future mode if net*CIRCUIT later supports automatic internal routing.

## 5.5 Update Routing Solver terminology

For Lab-First V1 it should solve:

```text
instrument/source/sense routing
```

not silently reconstruct the student's expected circuit.

---

# 6. Architecture compliance matrix

| Area | Current repository | Lab-First target | Assessment |
|---|---|---|---|
| Vue 3 / TypeScript / Vite | Implemented | Same | KEEP |
| Pinia UI/session stores | Implemented | Same | KEEP |
| Three.js scene projection | Implemented well | Same | KEEP |
| Circuit Graph explicit nets | Implemented | Same | KEEP |
| Scene ≠ electrical truth | Implemented | Same | KEEP |
| FastAPI boundary | Implemented scaffold | Same | KEEP / EXTEND |
| Hardware Service process | Implemented scaffold | Same | KEEP / EXTEND |
| HardwareStation abstraction | Implemented | Same idea | KEEP / REFACTOR INTERFACE |
| Virtual/Physical station split | Implemented | Same | KEEP |
| gRPC concept | Scaffold only | Required | EXTEND |
| Mini PC controller | Docs still Pi | Xeon Mini PC | WRONG DOCS |
| PostgreSQL | Not implemented | Production target | MISSING |
| AssignmentDefinition | None | Required | MISSING |
| LabEndpoint | None | Required | MISSING |
| DetectedTopologyGraph | None | Required | MISSING |
| Auto topology discovery | None | Required | MISSING |
| SafetyVerificationResult | None | Required | MISSING |
| TopologyVerificationResult | None | Required | MISSING |
| FunctionalVerificationResult | None | Required | MISSING |
| ExecutionDecision | None | Required | MISSING |
| Guarded power-up | None | Required | MISSING |
| Hardware safety envelope | Docs only generic FSM | Required | MISSING |
| Multi-user scheduler | None | Required | MISSING |
| Physical execution slots | None | Required | MISSING |
| Digital event simulator | AND primitive only | Discrete event | MISSING |
| Analog simulation | None | SPICE adapter | MISSING |
| Oscilloscope 2CH 3D/UI | Presentation implemented | 2CH physical later | PARTIAL |
| Generator 2CH 3D/UI | Presentation implemented | 2CH physical later | PARTIAL |
| FPGA RTL | Placeholder `top.v` | Large future subsystem | MISSING |
| SDRAM | Not implemented | EP4CE10 target | MISSING |
| Logic Analyzer | Not implemented | Required | MISSING |

---

# 7. Markdown documentation audit

## 7.1 Files that must be rewritten before AI implementation

### `README.md`

Wrong/outdated:
- Raspberry Pi 5 is still the controller.
- SQLite is still shown as V1 baseline.
- Old architecture spec is called approved.
- Project is described primarily as remote digital electronics rather than the new Lab-First/mixed-signal-ready direction.

Action:

```text
REWRITE
```

Keep README short and point to canonical docs instead of duplicating the whole architecture.

---

### `docs/ARCHITECTURE.md`

Wrong/outdated:
- Raspberry Pi appears in top-level architecture.
- Does not contain Lab-First verification/execution model.
- Does not contain AssignmentDefinition / LabEndpoint / three verification results.
- Still represents older physical compilation ideas.

Action:

```text
REPLACE WITH CLEANED LAB-FIRST v3.1
```

This should become the single canonical architecture source.

---

### `docs/CONTEXT.md`

Wrong/outdated:
- Locks Raspberry Pi 5.
- Locks SQLite.
- Preserves old immutable decisions.

Action:

```text
REWRITE
```

Keep this file concise. It should summarize immutable decisions from `ARCHITECTURE.md`, not become a second full architecture document.

---

### `docs/ROADMAP.md`

Wrong/outdated:
- Contains Raspberry Pi Deployment phase.
- Contains Raspberry Pi ↔ FPGA Integration phase.
- Does not sequence Lab-First Safety/Assignment/Verification contracts first.

Action:

```text
REWRITE PHYSICAL-LAB / DEPLOYMENT PHASES
```

Keep completed frontend history, but replace future phases.

---

### `docs/CIRCUIT_SPEC.md`

Wrong/outdated:
- Main controller = Raspberry Pi 5.
- Breadboards >= 2 is still treated as a confirmed baseline.
- Safety section is too small for Lab-First.
- Capability model is too old.
- Does not distinguish DesignGraph and DetectedTopologyGraph.
- Does not define Assignment/LabEndpoint/Safety/Topology/Functional models.

Action:

```text
MAJOR REWRITE
```

---

### `deployment/README.md`

Wrong/outdated:
- Refers to Raspberry Pi deployment checklist.

Action:

```text
UPDATE FOR GENERIC LINUX MINI PC
```

---

### `deployment/raspberry-pi/README.md`

Entire target is obsolete.

Action:

```text
DELETE OR ARCHIVE
REPLACE WITH deployment/mini-pc/README.md
```

---

### `fpga/experiment-controller/README.md`

Wrong/outdated:
- Calls the host interface a Raspberry Pi communication interface.

Action:

```text
UPDATE TO TRANSPORT-ABSTRACT MINI PC HOST INTERFACE
```

---

### `fpga/README.md`

Mostly still useful, but should be updated with:
- Lab-First safety responsibilities.
- topology scan coordination.
- Scope 2CH / Generator 2CH.
- runtime safety monitor / guarded power-up.
- host transport abstraction.

Action:

```text
UPDATE
```

---

### FPGA protocol docs

```text
contracts/fpga-protocol/packet-format.md
contracts/fpga-protocol/commands.md
contracts/fpga-protocol/register-map.md
contracts/fpga-protocol/versions.md
```

These are placeholders from the old transport assumptions.

Action:

```text
REWRITE BEFORE FPGA IMPLEMENTATION
```

Protocol must be transport-abstract and versioned.

---

### Hardware contract docs / Protobuf

```text
contracts/hardware/station.proto
contracts/hardware/experiment.proto
contracts/hardware/instrument.proto
services/hardware-service/README.md
```

Current contracts are too small for Lab-First.

Action:

```text
VERSION / REWRITE NOW, BEFORE GENERATED BINDINGS EXIST
```

This is the cheapest moment to make a breaking contract change.

---

# 8. Files that should be archived, not treated as active architecture

These files are useful as history but dangerous if an AI reads them as current instructions:

```text
SINGLE_WORKSPACE_DOCS_MANIFEST.md
docs/LO_TRINH_VA_MASTER_PROMPT_AI_netCIRCUIT_REMOTE_V1.md
docs/PROMPT_SINGLE_WORKSPACE_UI_AI.md

docs/superpowers/specs/2026-10-08-net-circuit-remote-architecture-design.md
docs/superpowers/plans/2026-10-08-initial-repository-scaffold.md
docs/superpowers/specs/2026-10-08-web-foundation-design.md
docs/superpowers/plans/2026-10-08-web-foundation.md
```

Recommended destination:

```text
docs/archive/legacy-v1/
```

Every archived architecture/prompt should start with:

```text
SUPERSEDED
Do not use as current implementation authority.
Current authority: docs/ARCHITECTURE.md
```

Do not keep an obsolete document in an active location while still calling it “approved architecture”.

---

# 9. Files that should normally be preserved as historical evidence

Do not delete these simply because architecture changed:

```text
docs/CHANGELOG.md
docs/DEV_LOG.md

docs/SOURCE_ANALYSIS_*.md
docs/verification/*.md

docs/superpowers/plans/* UI implementation history
docs/superpowers/specs/* UI design history
```

They document what was actually built and verified.

They may be moved under:

```text
docs/history/
```

if you want a cleaner active `docs/` root.

They must not override canonical architecture.

---

# 10. Files that are mostly safe to keep

Examples:

```text
apps/web/public/models/*/README.md
contracts/memory/README.md
docs/POWER_SUPPLY_CONTROLS.md
```

These describe local visual/data behavior and do not define the obsolete controller architecture.

`apps/web/README.md` is largely useful, but should receive a small update describing the new execution roadmap and canonical architecture link.

---

# 11. Missing documentation to add

Recommended minimal set:

```text
docs/ARCHITECTURE.md
    canonical cleaned Lab-First v3.1

docs/CONTEXT.md
    short AI/human immutable decisions

docs/ROADMAP.md
    current migration + implementation phases

docs/CIRCUIT_SPEC.md
    design graph, physical topology, capabilities, safety

docs/MIGRATION_LAB_FIRST.md
    one-time refactor plan and acceptance gates

docs/PHYSICAL_LAB_SAFETY.md
    safety envelope, fault model, guarded power-up

deployment/mini-pc/README.md
    Xeon/Linux deployment
```

Optional:

```text
docs/adr/
```

for future architecture decisions.

---

# 12. Tests/scripts that currently lock the old architecture

This must be fixed before deleting old docs.

## `scripts/check_context.py`

Currently checks old markers such as:

```text
EP4CE6
EP4CE10
64 MB
Web-first
```

It should additionally enforce current architecture identity and reject stale active architecture.

Suggested required markers:

```text
Mini PC
Safety-gated
Lab-first
AssignmentDefinition
LabEndpoint
SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult
ExecutionDecision
HardwareStation
PostgreSQL
```

Suggested forbidden active-doc markers:

```text
Raspberry Pi 5 is the V1 main controller
SQLite is the V1 database baseline
approved architecture specification is ...2026-10-08...
```

---

## `tests/test_docs_baseline.py`

Currently locks older architecture markers.

Update it to test the Lab-First baseline.

---

## `tests/integration/test_context_integrity.py`

Currently explicitly requires the 2026-10-08 architecture spec and initial scaffold plan to remain present.

This test should be changed.

Historical preservation may be tested under an archive path if desired, but old specs must not be current architecture authority.

---

## `tests/deployment/test_deployment_templates.py`

Currently requires:

```text
deployment/raspberry-pi/README.md
```

Change to:

```text
deployment/mini-pc/README.md
```

---

# 13. Source refactor sequence

Do not start with FPGA.

## R0 — Architecture authority cleanup

Goal:

```text
one current architecture
zero contradictory active architecture docs
```

Actions:

- Clean v3 into v3.1.
- Replace `docs/ARCHITECTURE.md`.
- Rewrite CONTEXT/ROADMAP/CIRCUIT_SPEC/README.
- Archive old master prompts/specs.
- Update architecture integrity tests.
- Replace Pi deployment docs.

Acceptance:

```text
python scripts/check_context.py
pytest -q
```

must pass with new architecture markers.

---

## R1 — Contract-first Lab Domain

Add contracts/types for:

```text
AssignmentDefinition
LabEndpoint

DetectedTopologyGraph
ObservedPhysicalComponent
OPAQUE_PHYSICAL_COMPONENT

SafetyVerificationResult
TopologyVerificationResult
FunctionalVerificationResult

ExecutionDecision
StationCapabilities
InstrumentationExecutionPlan
```

Do this before service implementation.

---

## R2 — Hardware RPC vNext

Version the Protobuf contract.

Add RPC concepts such as:

```text
GetCapabilities
EnterSafeState
ScanTopology
PrepareExecution
ApplyRouting
GuardedPowerUp
ConfigureInstrument
ArmCapture
StartExecution
StopExecution
ReadCapture
Reset
```

Avoid sending raw Circuit Graph JSON as the sole physical execution contract.

---

## R3 — Hardware Service state machine

Implement:

```text
OFFLINE
IDLE
RESERVED
SAFE_STATE
TOPOLOGY_SCAN
SAFETY_CHECK
ROUTE_PREPARE
GUARDED_POWER_UP
READY
ARMED
RUNNING
CAPTURING
VERIFYING
STOPPING
RELEASE
FAULT
```

A physical start operation must not be possible before safety/plan prerequisites.

---

## R4 — Application Backend modular-monolith expansion

Add modules:

```text
assignments
experiments
stations
verification
execution_policy
captures
persistence
```

Implement scheduler / lease / queue.

Use PostgreSQL for production.

---

## R5 — Simulator

Build a real discrete-event digital simulator.

Then:

```text
VirtualHardwareStation
```

must call this engine rather than merely store a graph and return `"running"`.

Analog SPICE adapter can follow the digital engine.

---

## R6 — Frontend integration

Preserve the existing 3D workbench.

Do not rewrite it.

Add:

```text
Assignment state
Run lifecycle
Queue state
Safety result
Topology result
Functional result
Station capabilities
waveform/capture integration
```

Display the three statuses independently:

```text
SAFETY
TOPOLOGY
FUNCTION
```

---

## R7 — FPGA / physical hardware

Only after contracts and hardware-service state machine are stable:

```text
EP4CE6 bring-up
transport
safe state
topology scan
protected drive
routing control
clock
```

Then migrate to:

```text
EP4CE10 + SDRAM
Logic Analyzer
Generator 2CH
Oscilloscope 2CH
```

---

# 14. Recommended target repository structure

```text
net-Circuit-Remote/
│
├── apps/
│   └── web/
│
├── services/
│   ├── api/
│   └── hardware-service/
│
├── simulator/
│   └── circuit-simulator/
│
├── contracts/
│   ├── circuit-schema/
│   ├── assignment/
│   ├── physical-lab/
│   ├── hardware/
│   ├── fpga-protocol/
│   └── memory/
│
├── device-library/
│   ├── editor/
│   ├── logic-ic/
│   ├── breadboards/
│   ├── instruments/
│   └── instructor-profiles/
│
├── fpga/
│   ├── common/
│   ├── safety/
│   ├── topology-scan/
│   ├── routing/
│   ├── experiment-controller/
│   ├── instrument/
│   ├── memory/
│   ├── constraints/
│   ├── quartus/
│   └── simulation/
│
├── deployment/
│   ├── nginx/
│   ├── systemd/
│   └── mini-pc/
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── CONTEXT.md
│   ├── CIRCUIT_SPEC.md
│   ├── ROADMAP.md
│   ├── MIGRATION_LAB_FIRST.md
│   ├── PHYSICAL_LAB_SAFETY.md
│   ├── CHANGELOG.md
│   ├── DEV_LOG.md
│   ├── history/
│   └── archive/
│
└── tests/
```

Do not create every empty directory immediately unless a contract/module is actually being introduced.

---

# 15. Should you delete files and tell AI to build from the new architecture?

The recommended answer is:

> **Yes to cleanup, but no to a one-shot “build the whole architecture” prompt.**

Correct workflow:

```text
1. Backup / branch current working source.
2. Make Lab-First v3.1 canonical.
3. Remove/archive contradictory active documentation.
4. Update tests that enforce architecture.
5. Commit documentation-only architecture migration.
6. Refactor contracts.
7. Commit.
8. Refactor Hardware Service.
9. Commit.
10. Refactor API/lifecycle.
11. Commit.
12. Implement simulator.
13. Integrate frontend without rewriting current 3D workbench.
14. Only then begin physical FPGA implementation.
```

Each phase should have:

```text
scope
files allowed to change
acceptance criteria
tests
explicit non-goals
```

This prevents an AI from rewriting working frontend code while trying to satisfy a 3,000-line architecture document in one pass.

---

# 16. Verification performed during this audit

The extracted Python/static repository test suite was executed:

```text
python3 scripts/check_context.py
pytest -q
```

Result:

```text
context-check: PASS
97 passed
```

This confirms the current repository is internally consistent with its **old enforced baseline**.

It does **not** mean the repository conforms to Lab-First v3.

In fact, several tests are specifically enforcing the old baseline and must be changed during R0.

Frontend `npm` verification was not used as architectural evidence in this audit; the review is based on direct source inspection. Existing repository documentation contains prior frontend verification records, which are historical evidence rather than a substitute for the architecture comparison above.

---

# 17. Final recommendation

Do **not** delete the current project and restart.

Preserve the developed Web/Three.js workbench.

Perform a controlled architecture migration now, while:

- API is still small,
- gRPC handlers are not implemented,
- Physical Hardware driver does not exist,
- simulator is still minimal,
- FPGA RTL is still a placeholder.

That makes this the lowest-cost point in the project to adopt Lab-First correctly.
