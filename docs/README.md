# Documentation index

Current authority is [Lab-First v3.1](ARCHITECTURE.md). Historical plans, measurements and prompts describe their recorded version, not automatically the current implementation.

| Purpose | Canonical entry |
| --- | --- |
| Onboarding and local commands | [Repository README](../README.md), [Web](../apps/web/README.md), [API](../services/api/README.md), [Hardware Service](../services/hardware-service/README.md) |
| Architecture and safety boundaries | [Architecture](ARCHITECTURE.md), [context](CONTEXT.md), [physical lab safety](PHYSICAL_LAB_SAFETY.md) |
| Control isolation and FPGA conformance | [Scheduler bounds](architecture/control-isolation-and-runtime-index.md), [current Contracts/proposal mapping](architecture/fpga-contract-conformance.md) |
| Contracts, generation and release commands | [Contracts](../contracts/README.md), [circuit specification](CIRCUIT_SPEC.md) |
| Auth, projects, assignments, captures, simulation | [Architecture decisions](architecture/auth-and-migrations.md), [projects](architecture/projects-and-revisions.md), [assignments](architecture/assignments-and-publication.md), [captures](architecture/capture-catalog.md), [signal domains](architecture/signal-domains-and-simulation.md) |
| Editor and component authoring | [Placement](COMPONENT_PLACEMENT.md), [component visuals](component-visuals-authoring-verification.md), [physical parts](physical-components-verification.md) |
| Verification, output paths and archive policy | [Shared verification guide](VERIFICATION.md) |
| Current WC20 hardening and release disposition | [Web/Contracts closure](verification/2026-10-20-web-contracts-closure.md) |
| Current navigation implementation evidence | [Camera](verification/2026-10-19-unified-camera-navigation.md), [depth/grid](verification/2026-10-19-adaptive-depth.md), [Ribbon](verification/2026-10-19-ribbon-shell.md) |
| Implementation history and remaining work | [Migration ledger](MIGRATION_LAB_FIRST.md), [dev log](DEV_LOG.md), [changelog](CHANGELOG.md), [roadmap](ROADMAP.md) |
| Full Markdown audit and legacy evidence inventory | [Documentation/artifact audit](verification/2026-10-19-documentation-artifact-audit.md) |

## Source map

- `apps/web/src/`: Vue UI, stores, workbench commands and Three.js rendering; `apps/web/tests/` and `apps/web/e2e/`: unit/integration and native browser scenarios.
- `contracts/`: versioned wire/design contracts, compatibility baselines, generated boundaries and fixtures. `device-library/`: component registries used by synchronization scripts.
- `services/api/`: FastAPI auth, persistence and execution orchestration; `services/hardware-service/`: isolated hardware RPC and virtual/physical station boundaries. `simulator/circuit-simulator/`: virtual simulation.
- `fpga/`: gateware scaffolding and simulation. A scaffold or proposed hardware design does not establish physical availability.
- `scripts/`, `.github/workflows/`, `tests/`: actual generation, verification, CI and repository conformance entrypoints. [Deployment](../deployment/README.md) contains deployment templates, not proof of a live deployment.

## Reading status

`IMPLEMENTED` means source exists; `PROPOSED` describes a design; `NOT_IMPLEMENTED` identifies an absent behavior. `VERIFIED` requires a dated command/scenario result for the recorded revision; `NOT_VERIFIED` is explicit when prerequisites or measurements are missing. Passing historical results are retained with their original scope.

`docs/SOURCE_ANALYSIS_*`, `docs/superpowers/`, `docs/verification/`, `docs/Web/`, `docs/Hardware/` and `docs/reviews/` retain feature analyses, plans and review history. Consult their dates/status and source references; do not execute an old prompt as a new instruction. Archive provenance and approval rules are in the shared guide.
