# CIRNET Remote working context

[Tiếng Việt](../../vi/architecture/context.md) · [Canonical context and markers](context-invariants.md) · [System architecture](system.md)

## Invariants to carry across changes

- Keep the Web-first, Safety-gated, Lab-First single workspace. The scene projects `CircuitGraph`. Preserve saved graph versions 1.0, 1.1 and 1.2, explicit electrical connections, versioned placement, and pending user edits. Keep the frontend clear of raw FPGA registers, raw MUX addresses and Linux transport identifiers.
- In manual breadboard V1, student wiring is physical truth. `DetectedTopologyGraph` preserves mistakes and ambiguity. The resolver maps `AssignmentDefinition`/`LabEndpoint` references to observed student nodes. The Lab Execution Compiler emits `InstrumentationExecutionPlan` for infrastructure. [Physical lab safety](physical-lab-safety.md)
- Keep `SafetyVerificationResult`, `TopologyVerificationResult` and `FunctionalVerificationResult` independent. `ExecutionDecision` can block unsafe or unexecutable work, or allow normal or guarded execution. `assessment_policy` grades and reports observed outcomes. Its result has no authority over energization.
- A `HardwareStation` can be virtual or physical. Physical Run requires the safe-state, scan, check, route, power and arm lifecycle. Missing driver or protection yields unavailable. The prototype target is EP4CE6E22C8N without SDRAM. The future instrument target is EP4CE10E22C8N with external SDRAM. Unvalidated electrical parameters remain `TBD_BY_HARDWARE_DESIGN`.
- Runtime capacity comes from `physical_execution_slots` and `instrument_capabilities`. Zero channels means an instrument is unavailable. Visible channel numbers start at 1. The target of 30–50 connected sessions is distinct from the V1 shared physical slot. Simulation worker capacity is bounded. Tests of multi-slot admission exercise scheduler logic. [Control isolation and runtime indexing](control-isolation-and-runtime-index.md)

## Identity, persistence and recovery

- Durable principals own projects, circuits, experiments and captures. Exact origins, CSRF and role/object authorization protect mutations and data access. PostgreSQL is the production store. Development guest access is explicit. Only a proved, confirmed claim transfers guest ownership.
- Save owned Project/Circuit revisions with compare-and-swap. Create pins the selected revision and published assignment snapshot. Editing drafts leaves existing publications stable. The default `observed_only` view keeps reference answers private across HTTP, events and recovery. [Projects and revisions](projects-and-revisions.md) · [Assignment publication](assignments-and-publication.md)
- Controller-tab identity and authenticated session determine execution control. Read-only recovery may restore owned history, active state and queue state. Reload retains durable pending observation keys and reconciles by reads. It neither resends Create/Run/Apply nor takes over control. [Pending observations](pending-observations.md)
- Requested instruments are immutable Create input. A live Generator update needs an active controlled lease, supported allocation, fresh safety and profile limits. Command acceptance and hardware application are distinct outcomes. [Application API](../api/application.md)
- Event and experiment JSON carry `CaptureMetadata`. `CIRNET_CAPTURE_DIR` stores payloads, with owner-scoped binary access. Captures outlive Stop and are retired through audited bounded maintenance. Active and quarantined leases protect their captures. NCAP v2 codecs support sampled formats. The current runtime has no analog acquisition producer. [Capture catalog](capture-catalog.md) · [Signal domains and simulation](signal-domains-and-simulation.md)

## Evidence and change review

Read the relevant implementation and tests alongside [the release lock](../../../integration/release-set.json). Current first-line verification uses Python 3.14 and Node 26. Run `python -B scripts/check_context.py` and choose the applicable `scripts/check_release.py` groups from the [verification guide](../history/verification-ledger.md). Allocate an owned external session before running checks that generate temporary files. Record tested inputs, failures, skips and unrun gates separately. [Repository instructions](../../../AGENTS.md)

The [W0–W8 verification ledger](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-16-web-contracts.md) preserves the original schema, generation and staged acceptance evidence. The [Lab-First migration ledger](../history/lab-first-migration-ledger.md) records R0–R7 decisions. The [0.1.4 local release report](../history/verification/2026-11-05-cirnet-release-0.1.4.md) and [test infrastructure audit](../../vi/history/verification/2026-11-05-test-infrastructure-audit.md) each apply to their recorded runs.
