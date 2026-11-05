# CIRNET documentation index

[Current English documentation](en/index.md) · [Tiếng Việt](vi/index.md)

This index retains existing deep links and the historical source map.
Use the language indexes for current instructions.

| Task | Start here |
| --- | --- |
| Run or integrate Remote | [Repository setup](../README.md), [API](../services/api/README.md), [Contracts](../contracts/README.md) |
| Understand the system | [Architecture](ARCHITECTURE.md), [context](CONTEXT.md), [circuit specification](CIRCUIT_SPEC.md), [FPGA conformance](architecture/fpga-contract-conformance.md) |
| Verify or deploy | [Verification](VERIFICATION.md), [deployment](../deployment/README.md), [release and rollback](../deployment/multi-repo-release.md), [CI artifact access](ci-artifact-access.md) |
| Track work and release results | [Roadmap](ROADMAP.md), [dev log](DEV_LOG.md), [changelog](CHANGELOG.md), [M6 release ledger](verification/2026-10-27-multi-repo-migration-m6.md) |

## Current repositories and release selection

| Product | Current repository | Version / ownership |
| --- | --- | --- |
| Remote | [cirnetlab/cirnet-remote](https://github.com/cirnetlab/cirnet-remote) | API/deployment 0.1.2; selected system/integration 0.1.4 |
| Contracts | [cirnetlab/cirnet-contracts](https://github.com/cirnetlab/cirnet-contracts) | 0.1.2; schemas, catalog, protocols, Python resources and public SDK |
| Interface | [cirnetlab/cirnet-interface](https://github.com/cirnetlab/cirnet-interface) | 0.1.4; Web/editor/assets and browser assertions |
| Simulator | [cirnetlab/cirnet-simulator](https://github.com/cirnetlab/cirnet-simulator) | 0.1.2; existing engine and replaceable backend boundary |
| Hardware | [cirnetlab/cirnet-hardware](https://github.com/cirnetlab/cirnet-hardware) | 0.1.2; local RPC, station lifecycle and private transport |
| FPGA | [cirnetlab/cirnet-fpga](https://github.com/cirnetlab/cirnet-fpga) | 0.1.2 source scaffold; pinned RTL verification |

The repository/organization rename preserves GitHub repository IDs and history.
Use the current [release selection](../integration/release-set.json) and
[release runbook](../deployment/multi-repo-release.md). The 0.1.4
selection uses the six canonical repositories and exact asset digests.
Dated reports record earlier inputs and verification outcomes.

Current source identities and migration/legacy boundaries are recorded in
[namespace compatibility](NAMESPACE.md). New operator examples use `CIRNET_*`;
recorded historical names and published artifact bytes remain unchanged.

## Source map

- `services/api/` owns FastAPI auth, persistence and execution orchestration. Remote owns deployment and integration tests.
- `contracts/__init__.py` forwards imports and resources to the exact installed Contracts wheel. CIRNET-Contracts owns canonical schemas, catalogs and generation. Remote verifies compatibility using the fixtures and baselines in the installed wheel.
- CIRNET-Interface owns the Web implementation, product icons and browser assertions. Remote consumes its selected source and static artifacts and keeps its own design references in `assets/`.
- CIRNET-Hardware and CIRNET-Simulator own their implementations. Remote integration uses their exact versioned wheels. CIRNET-FPGA owns RTL, tooling and standalone tests. Remote checks compatibility against its selected source artifact.
- The pre-cleanup implementations are available at the [historical Remote revision](https://github.com/cirnetlab/cirnet-remote/tree/989954f95c1c6b1d224e31a53fb33f125f0a81a9).
- `scripts/`, `.github/workflows/`, `tests/`: actual generation, verification, CI and repository conformance entrypoints. [Deployment](../deployment/README.md) contains deployment templates, not proof of a live deployment.

## Reading status

Historical results apply to their recorded inputs and versions. The pre-pruning
snapshot at `8ad610d` contains the original
[plans and designs](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers),
[verification reports](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification),
[component visuals](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/component-visuals-authoring-verification.md),
[physical components](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/physical-components-verification.md),
[feature analyses](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs) and
[archive documents](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/archive).
The current tree retains the documents and evidence checked by the repository
guards. The historical [Remote browser test entry](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/tests/end-to-end)
points to the migrated suite. Run the current browser tests through the
[verification guide](VERIFICATION.md) with the selected Interface artifact.
