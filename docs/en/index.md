# CIRNET Remote documentation

[Tiếng Việt](../vi/index.md) · [Repository](../../README.md) · [Repository instructions](../../AGENTS.md)

## Guides

- [Run the lab locally and use the Windows launcher](guides/getting-started.md)

## API and architecture

- [Application API and development](api/application.md)
- [Installed Contracts consumer](api/contracts-consumer.md)
- [Circuit and physical lab specification](api/circuit-and-physical-lab.md)
- [System architecture](architecture/system.md)
- [Working context](architecture/context.md)
- [Physical lab safety](architecture/physical-lab-safety.md)
- [Assignments and publication](architecture/assignments-and-publication.md)
- [Authentication and migrations](architecture/auth-and-migrations.md)
- [Capture catalog](architecture/capture-catalog.md)
- [Control isolation and runtime index](architecture/control-isolation-and-runtime-index.md)
- [FPGA contract conformance](architecture/fpga-contract-conformance.md)
- [Pending observations](architecture/pending-observations.md)
- [Projects and revisions](architecture/projects-and-revisions.md)
- [Signal domains and simulation](architecture/signal-domains-and-simulation.md)
- [Native migration plan and gate status](architecture/native-migration.md)

## Contribute and operate

- [Verification and external artifacts](contributing/verification.md)
- [Documentation conventions](contributing/writing-documentation.md)
- [System release and rollback](operations/release-and-rollback.md)
- [CI artifact access](operations/ci-artifact-access.md)
- [Production deployment](operations/deployment.md)
- [Linux Mini PC review](operations/mini-pc.md)

## History

- [Release history, plans and evidence](history/index.md)

Remote owns system integration, API, persistence, scheduling and deployment.
The producers own the SDK and schemas, the browser workbench, the simulator,
the local Hardware RPC service and the FPGA RTL. Browse the
[repository map](architecture/system.md#system-boundary)
for their entry points and the exact published selection.
