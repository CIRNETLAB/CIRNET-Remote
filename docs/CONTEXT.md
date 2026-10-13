# CONTEXT — net*CIRCUIT Remote

Read ARCHITECTURE.md first: canonical Lab-First v3.1. Historical evidence never overrides it.

- Web-first, Safety-gated, Lab-First: SAFETY != CORRECTNESS; UNKNOWN != UNSAFE.
- Linux Mini PC (Intel Xeon W-1370, 16 GB RAM, 256 GB SSD), Nginx/systemd, FastAPI modular monolith, isolated Hardware Service, PostgreSQL production.
- Preserve Vue/TypeScript/Pinia/Three.js Single Workspace.
- CircuitGraph schema 1.0 is logical design truth; Scene is projection; ghost/coordinates never create nets.
- DetectedTopologyGraph preserves mistakes/ambiguity, separate from editor authoring rules.
- AssignmentDefinition / LabEndpoint describe assignments/infrastructure.
- SafetyVerificationResult gates safety; TopologyVerificationResult diagnoses/grades; FunctionalVerificationResult evaluates observations.
- ExecutionDecision: BLOCK_SAFETY / BLOCK_UNEXECUTABLE / RUN_NORMAL / RUN_GUARDED. Safe unknown parts can run guarded; topology mismatch does not block.
- Lab Execution Compiler produces InstrumentationExecutionPlan for infrastructure only. Student IC/jumper wiring remains physical truth.
- HardwareStation separates virtual/physical; physical start cannot bypass safety lifecycle. Missing driver never succeeds.
- EP4CE6E22C8N without SDRAM → future EP4CE10E22C8N with external SDRAM. Part/timing/pin/electrical data: TBD_BY_HARDWARE_DESIGN.
- Scope 2CH / Generator 2CH targets. Physical analog routing V1=false. Analog virtual requires a real adapter.
- 30–50 sessions target, distinct from one shared physical slot with FIFO/lease/timeouts.
- Frontend must never contain raw FPGA registers, raw MUX addresses or Linux transport identifiers.
- Post-R7 flow: DetectedTopologyGraph → TopologyResolver → ResolvedLabBindings (`TopologyResolutionResult.endpoint_bindings`) → Lab Execution Compiler; reference physical node != student physical node. Required unresolved endpoints block executability, topology differences remain diagnostics.
- Experiment/event JSON contains CaptureMetadata only; CaptureStore payloads live in NETCIRCUIT_CAPTURE_DIR and use owner-scoped binary fetch/deletion. Signal Monitor fetches/cache on demand; Scope has no fake analog trace.
- Runtime instrument truth is instrument_capabilities; channels=0 is unavailable. Generator baseline belongs in the plan, live control needs RUNNING plus explicit runtime support, lifecycle ownership and real profile limits.
- Hardware admission uses current physical_execution_slots; simulation uses shared positive NETCIRCUIT_SIMULATION_WORKERS (default 4) and explicit spawn workers. Multi-slot tests are scheduler evidence only.
- Inspector reports structured evidence/confidence, expected/observed checkpoints and separate assessment; assessment_policy never grants or denies energization.

Read source/tests before changes. Preserve user changes/history/source-analysis/browser evidence. Phase gates/commits/rulings: MIGRATION_LAB_FIRST.md. Stop before merge/push.
