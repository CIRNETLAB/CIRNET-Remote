# Documentation index

Current authority is [Lab-First v3.1](ARCHITECTURE.md). Historical plans, measurements and prompts describe their recorded version, not automatically the current implementation.

| Purpose | Canonical entry |
| --- | --- |
| Onboarding and local commands | [Repository README](../README.md), [Interface/M2](superpowers/plans/2026-10-24-multi-repo-migration-m2.md), [API](../services/api/README.md), [Hardware/M4](superpowers/plans/2026-10-27-multi-repo-migration-m4.md) |
| Architecture and safety boundaries | [Architecture](ARCHITECTURE.md), [context](CONTEXT.md), [physical lab safety](PHYSICAL_LAB_SAFETY.md) |
| Control isolation and FPGA conformance | [Scheduler bounds](architecture/control-isolation-and-runtime-index.md), [current Contracts/proposal mapping](architecture/fpga-contract-conformance.md) |
| Contracts, generation and release commands | [Contracts](../contracts/README.md), [circuit specification](CIRCUIT_SPEC.md) |
| Auth, projects, assignments, captures, simulation | [Architecture decisions](architecture/auth-and-migrations.md), [projects](architecture/projects-and-revisions.md), [assignments](architecture/assignments-and-publication.md), [captures](architecture/capture-catalog.md), [signal domains](architecture/signal-domains-and-simulation.md) |
| Editor and component authoring | [Placement](COMPONENT_PLACEMENT.md), [component visuals](component-visuals-authoring-verification.md), [physical parts](physical-components-verification.md) |
| Verification, output paths and archive policy | [Shared verification guide](VERIFICATION.md) |
| Current WC20 hardening and release disposition | [Web/Contracts closure](verification/2026-10-20-web-contracts-closure.md) |
| Refactor GitHub Actions failures and repair | [Latest runtime path fixture repair](verification/2026-10-21-github-actions.md), [workflow validation and clean Python startup](verification/2026-10-20-github-actions.md) |
| Current navigation implementation evidence | [Camera](verification/2026-10-19-unified-camera-navigation.md), [depth/grid](verification/2026-10-19-adaptive-depth.md), [Ribbon](verification/2026-10-19-ribbon-shell.md) |
| Implementation history and remaining work | [Migration ledger](MIGRATION_LAB_FIRST.md), [dev log](DEV_LOG.md), [changelog](CHANGELOG.md), [roadmap](ROADMAP.md) |
| Approved Multi-Repo M0 and migration roadmap | [M0 plan](superpowers/plans/2026-10-24-multi-repo-migration-m0.md), [approval and documentation verification](verification/2026-10-24-multi-repo-migration-m0.md); historical M0 status, see the M2 ledger for current execution |
| M1 Contracts implementation and review | [Execution ledger](superpowers/plans/2026-10-24-multi-repo-migration-m1.md), [verification and rollback](verification/2026-10-24-multi-repo-migration-m1.md), [history mapping](verification/2026-10-24-contracts-history.md); publication is separate |
| M2 Interface extraction | [Execution ledger](superpowers/plans/2026-10-24-multi-repo-migration-m2.md), [verification/rollback](verification/2026-10-24-multi-repo-migration-m2.md), [history mapping](verification/2026-10-24-interface-history.md); independent Web product and Remote-owned integration |
| M3 Simulator extraction | [Execution ledger](superpowers/plans/2026-10-27-multi-repo-migration-m3.md), [verification/rollback](verification/2026-10-27-multi-repo-migration-m3.md), [history mapping](verification/2026-10-27-simulator-history.md); standalone engine with versioned Contracts and installed-wheel consumers |
| M3B replaceable simulation backends | [ngspice analysis and backend design](superpowers/specs/2026-10-27-simulator-backends-design.md), [execution plan](superpowers/plans/2026-10-27-simulator-backends.md), [verification/rollback](verification/2026-10-27-simulator-backends.md); preparation for native cores, current legacy behavior retained |
| M4 Hardware extraction | [Execution plan](superpowers/plans/2026-10-27-multi-repo-migration-m4.md), [verification/rollback](verification/2026-10-27-multi-repo-migration-m4.md), [history mapping](verification/2026-10-27-hardware-history.md); independent service with versioned Contracts/Simulator and Remote-owned integrated acceptance |
| M5 FPGA extraction | [Execution plan](superpowers/plans/2026-10-27-multi-repo-migration-m5.md), [verification/rollback](verification/2026-10-27-multi-repo-migration-m5.md), [history mapping](verification/2026-10-27-fpga-history.md); versioned source scaffold, installed Contracts and mandatory pinned RTL verification |
| M6 integrated release | [Execution ledger](superpowers/plans/2026-10-27-multi-repo-migration-m6.md), [verification/release identities](verification/2026-10-27-multi-repo-migration-m6.md), [artifact installation and rollback](../deployment/multi-repo-release.md); all products 0.1.1 |
| Full Markdown audit and legacy evidence inventory | [Documentation/artifact audit](verification/2026-10-19-documentation-artifact-audit.md) |

## Source map

- `apps/web/`: retained frozen Web rollback/reference tree after M2. Current UI, stores, workbench commands, Three.js rendering and browser assertions belong to net-Circuit-Interface; current release gates consume its explicit product/artifact.
- `contracts/` and `device-library/`: retained frozen migration references. Runtime `contracts` imports/resources forward to the independent 0.1.1 wheel; canonical inputs/generation live in net-Circuit-Contracts. Root synchronization commands are installed-artifact consumer adapters.
- `services/api/`: FastAPI auth, persistence and execution orchestration; `services/hardware-service/`: frozen M4 rollback/reference, with current hardware RPC/virtual/physical station/transport ownership in net-Circuit-Hardware. `simulator/circuit-simulator/`: frozen M3 reference; current simulation belongs to net-Circuit-Simulator. Current integration consumes both as exact versioned wheels.
- `fpga/` and original `tests/fpga/`: frozen M5 references. Current RTL/scaffold/toolchain and pure tests belong to net-Circuit-FPGA, with explicit source-artifact compatibility acceptance in Remote. A scaffold or proposed hardware design does not establish physical availability.
- `scripts/`, `.github/workflows/`, `tests/`: actual generation, verification, CI and repository conformance entrypoints. [Deployment](../deployment/README.md) contains deployment templates, not proof of a live deployment.

## Reading status

`IMPLEMENTED` means source exists; `PROPOSED` describes a design; `NOT_IMPLEMENTED` identifies an absent behavior. `VERIFIED` requires a dated command/scenario result for the recorded revision; `NOT_VERIFIED` is explicit when prerequisites or measurements are missing. Passing historical results are retained with their original scope.

`docs/SOURCE_ANALYSIS_*`, `docs/superpowers/`, `docs/verification/`, `docs/Web/`, `docs/Hardware/` and `docs/reviews/` retain feature analyses, plans and review history. Consult their dates/status and source references; do not execute an old prompt as a new instruction. Archive provenance and approval rules are in the shared guide.
