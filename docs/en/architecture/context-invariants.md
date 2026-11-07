# CIRNET Remote context invariants

<a id="context--cirnet-remote"></a>

[Tiếng Việt](../../vi/architecture/context-invariants.md) · [Working context](context.md)

The [Lab-First v3.1 specification](lab-first-v3-1.md) governs the system.

- Preserve the Web-first, Safety-gated single workspace. The selected release topology
  targets a Linux Mini PC with PostgreSQL. See [system topology](system.md)
  and [target readiness](../operations/mini-pc.md).
- Keep CircuitGraph and DetectedTopologyGraph distinct. Resolve physical reference
  LabEndpoint bindings in AssignmentDefinition against observed wiring. InstrumentationExecutionPlan controls
  infrastructure. ExecutionDecision applies SafetyVerificationResult and
  executability. TopologyVerificationResult and FunctionalVerificationResult
  provide separate evidence for assessment.
- The HardwareStation boundary requires the physical safety lifecycle. EP4CE6E22C8N without
  SDRAM is the prototype target and EP4CE10E22C8N with external SDRAM is a future
  target. Frontend must never contain raw FPGA registers, raw MUX addresses or
  Linux transport identifiers. See [station and protection requirements](physical-lab-safety-contract.md).
- Opaque hashed sessions authenticate requests. Require authenticated users in
  production. Migrations preserve ownership, operation identity, captures and
  quarantined leases. Fence recovery and stale responses by durable principal.
  Polling uses one in-flight operation with cancellation and backoff. An unknown
  acknowledgement retains the operation key across refresh and disconnect.
  See [auth and migration](auth-and-migrations.md) and
  [pending observations](pending-observations.md).
- Keep capture byte I/O outside control locks. Apply directory quotas and
  exclude active and quarantined leases from bounded capture retirement.
  See [capture persistence and retirement](capture-catalog.md).

Use [AGENTS.md](../../../AGENTS.md) and the [verification guide](../contributing/verification.md)
for source changes and external evidence. The [history index](../history/index.md)
links the dated migration and acceptance records.
