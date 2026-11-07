# CIRNET Remote documentation

[Tiếng Việt](../vi/index.md) · [Repository](../../README.md) · [Repository instructions](../../AGENTS.md) · [Changelogs](../changelogs/README.md)

Start with the English pages for current repository guidance. The Vietnamese index follows the same structure.

## Guides

- [Run the lab locally and use the Windows launcher](guides/getting-started.md)

<a id="api-and-architecture"></a>

## API reference

- [Application API and development](api/application.md)
- [Installed Contracts consumer](api/contracts-consumer.md)
- [Circuit and physical lab specification](api/circuit-and-physical-lab.md)
- [Circuit and execution contract reference](api/circuit-spec-reference.md)

## Architecture and status

- [System architecture](architecture/system.md)
- [Lab-First design and invariants](architecture/lab-first-v3-1.md)
- [Working context](architecture/context.md)
- [Implementation boundaries](architecture/context-invariants.md)
- [Component placement](architecture/component-placement.md)
- [Physical lab safety](architecture/physical-lab-safety.md)
- [Physical lab safety requirements](architecture/physical-lab-safety-contract.md)
- [Assignments and publication](architecture/assignments-and-publication.md)
- [Authentication and migrations](architecture/auth-and-migrations.md)
- [Capture catalog](architecture/capture-catalog.md)
- [Control isolation and runtime index](architecture/control-isolation-and-runtime-index.md)
- [FPGA contract conformance](architecture/fpga-contract-conformance.md)
- [Pending observations](architecture/pending-observations.md)
- [Projects and revisions](architecture/projects-and-revisions.md)
- [Signal domains and simulation](architecture/signal-domains-and-simulation.md)
- [Native migration status and evidence by stage](architecture/native-migration-status.md)

<a id="contribute-and-operate"></a>

## Contributing

- [Verification and external artifacts](contributing/verification.md)
- [Rust Remote build, tests and fixtures](contributing/rust-verification.md)
- [Documentation conventions](contributing/writing-documentation.md)

## Operations

- [System release and rollback](operations/release-and-rollback.md)
- [Namespace compatibility](operations/namespace-compatibility.md)
- [CI artifact access](operations/ci-artifact-access.md)
- [Production deployment](operations/deployment.md)
- [Linux Mini PC review](operations/mini-pc.md)

## History

- [Historical records and verification evidence](history/index.md)

Remote owns system integration, API, persistence, scheduling and deployment.
The producers own the SDK and schemas, the browser workbench, the simulator,
the local Hardware RPC service and the FPGA RTL. Browse the
[repository map](architecture/system.md#system-boundary)
for their entry points and the exact published selection.
