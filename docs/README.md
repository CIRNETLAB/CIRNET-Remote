# CIRNET documentation index

| Task | Start here |
| --- | --- |
| Run or integrate Remote | [Repository setup](../README.md), [API](../services/api/README.md), [Contracts](../contracts/README.md) |
| Understand the system | [Architecture](ARCHITECTURE.md), [context](CONTEXT.md), [circuit specification](CIRCUIT_SPEC.md), [FPGA conformance](architecture/fpga-contract-conformance.md) |
| Verify or deploy | [Verification](VERIFICATION.md), [deployment](../deployment/README.md), [release and rollback](../deployment/multi-repo-release.md), [CI artifact access](ci-artifact-access.md) |
| Track work and release results | [Roadmap](ROADMAP.md), [dev log](DEV_LOG.md), [changelog](CHANGELOG.md), [M6 release ledger](verification/2026-10-27-multi-repo-migration-m6.md) |

## Current repositories and release selection

| Product | Current repository | Version / ownership |
| --- | --- | --- |
| Remote | [CIRNETLAB/CIRNET-Remote](https://github.com/CIRNETLAB/CIRNET-Remote) | API/deployment 0.1.1; published system/integration 0.1.2 |
| Contracts | [CIRNETLAB/CIRNET-Contracts](https://github.com/CIRNETLAB/CIRNET-Contracts) | 0.1.1; schemas, catalog, protocols, Python resources and public SDK |
| Interface | [CIRNETLAB/CIRNET-Interface](https://github.com/CIRNETLAB/CIRNET-Interface) | published 0.1.2; Web/editor/assets and browser assertions |
| Simulator | [CIRNETLAB/CIRNET-Simulator](https://github.com/CIRNETLAB/CIRNET-Simulator) | 0.1.1; existing engine and replaceable backend boundary |
| Hardware | [CIRNETLAB/CIRNET-Hardware](https://github.com/CIRNETLAB/CIRNET-Hardware) | 0.1.1; local RPC, station lifecycle and private transport |
| FPGA | [CIRNETLAB/CIRNET-FPGA](https://github.com/CIRNETLAB/CIRNET-FPGA) | 0.1.1 source scaffold; pinned RTL verification |

The repository/organization rename preserves GitHub repository IDs and history.
Use the current [release selection](../integration/release-set.json) and
[release runbook](../deployment/multi-repo-release.md). The reused immutable
0.1.1 artifacts retain their original build revisions/digests; rename candidates
and new master commits are tracked separately in the M6 report. Old extraction
versions and URLs in dated reports retain their historical meaning. Technical
package/import/environment/protocol names and local checkout directories remain
unchanged.

## Source map

- `services/api/` owns FastAPI auth, persistence and execution orchestration. Remote owns deployment and integration tests.
- `contracts/__init__.py` forwards imports and resources to the exact installed Contracts wheel. CIRNET-Contracts owns canonical schemas, catalogs and generation. Remote retains compatibility baselines and fixtures.
- CIRNET-Interface owns the Web implementation and browser assertions. Remote consumes its selected source and static artifacts. The duplicated Web artwork is available in the selected Interface source.
- CIRNET-Hardware and CIRNET-Simulator own their implementations. Remote integration uses their exact versioned wheels. CIRNET-FPGA owns RTL, tooling and standalone tests. Remote checks compatibility against its selected source artifact.
- The pre-cleanup implementations are available at the [historical Remote revision](https://github.com/CIRNETLAB/CIRNET-Remote/tree/989954f95c1c6b1d224e31a53fb33f125f0a81a9).
- `scripts/`, `.github/workflows/`, `tests/`: actual generation, verification, CI and repository conformance entrypoints. [Deployment](../deployment/README.md) contains deployment templates, not proof of a live deployment.

## Reading status

Historical results apply to their recorded inputs and versions. The pre-pruning
snapshot at `8ad610d` contains the original
[plans and designs](https://github.com/CIRNETLAB/CIRNET-Remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/superpowers),
[verification reports](https://github.com/CIRNETLAB/CIRNET-Remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification),
[component visuals](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/component-visuals-authoring-verification.md),
[physical components](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/physical-components-verification.md),
[feature analyses](https://github.com/CIRNETLAB/CIRNET-Remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs) and
[archive documents](https://github.com/CIRNETLAB/CIRNET-Remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/archive).
The current tree retains the documents and evidence checked by the repository
guards. The historical [Remote browser test entry](https://github.com/CIRNETLAB/CIRNET-Remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/tests/end-to-end)
points to the migrated suite. Run the current browser tests through the
[verification guide](VERIFICATION.md) with the selected Interface artifact.
