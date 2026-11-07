# Lab-First milestones

This record summarizes the R/H/W milestones of the integrated repository.
Use the [system architecture](../architecture/system.md) for current behavior
and the [migration ledger](lab-first-migration-ledger.md) for dated evidence.
[Original roadmap](https://github.com/cirnetlab/cirnet-remote/blob/ae51abaa8ebdfce5981f91c0c95eca1d522900ee/docs/en/history/lab-first-roadmap.md)

The frontend milestones included the Single Workspace, catalog, editing,
wiring, history, memory editor, scene projection, camera navigation, placement
preview and controls, overlay drawers and instrument presentation.

| Phase | Deliverable |
|---|---|
| R0 | Canonical Lab-First v3.1 and architecture/deployment guardrails |
| R1 | Assignment/observations/verification/capability/plan contracts |
| R2 | Versioned local safety RPC and deterministic codegen |
| R3 | HardwareStation safety lifecycle |
| R4 | Backend modules/persistence/FIFO/lease/slots |
| R5 | Real virtual discrete-event digital execution |
| R6 | Existing frontend lifecycle/results/instrument integration |
| R7 | Compile-safe FPGA/physical scaffold |
| H0 | Completed: pin/endpoints/resolution/rich-result contracts and physical evidence integrity |
| H1 | Completed: arbitrary-placement resolver and compiler using observed student nodes |
| H2 | Completed: CaptureMetadata/CaptureStore, owner data plane and on-demand browser cache |
| H3 | Completed: capability slot admission, configurable simulation workers and spawn cleanup |
| H4 | Completed: sole instrument capability authority and synchronized runtime control |
| H5 | Completed: structured independent learning feedback, measured observations and assessment |
| H6 | Architecture, provenance and verification record |
| Web/Contracts W0–W7 | Implemented and verified: canonical boundaries, auth, owned persistence, Web separation, recovery/publication, instruments/domains/captures |
| Web/Contracts W8 | Historical local Python, Web, browser, PostgreSQL, package and workload verification. |
| Web/Contracts WC20 | Credential, input, realtime, control, document persistence and operation-recovery hardening. [2026-10-20 closure report](https://github.com/cirnetlab/cirnet-remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-20-web-contracts-closure.md) |
| Subsequent editor work | Graph 1.2 flexible placement, pinned descriptors, automatic V2 geometry, sealed packages, versioned document and assignment boundaries, ribbon and camera navigation. [Current placement reference](../architecture/component-placement.md) |

The reported test counts apply to their dated inputs and environments.
R7 verified the RTL scaffold. Hardware targets and physical capabilities are
tracked separately in the [FPGA conformance reference](../architecture/fpga-contract-conformance.md).
