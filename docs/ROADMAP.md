# Lab-First Roadmap

Authority: ARCHITECTURE.md. Evidence/commits: MIGRATION_LAB_FIRST.md.

Completed frontend history: Single Workspace, catalog, editing/wiring/history, memory editor, scene projection, camera/zoom, placement ghost/gizmo, overlay drawers and instrument presentation. Preserve implementations and historical source analyses/verification.

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
| H6 | Architecture/provenance/final verification and user review; no automatic merge |
| Web/Contracts W0–W7 | Implemented and verified: canonical boundaries, auth, owned persistence, Web separation, recovery/publication, instruments/domains/captures |
| Web/Contracts W8 | Local software gates verified: full Python/Web/native browser/PostgreSQL/wheels/workload; individual acceptance, source inventory and handoff recorded. Git delivery blocked by metadata permissions; hosted CI/target deployment remain separate. |
| Subsequent editor work | IMPLEMENTED: Graph 1.2 flexible placement and pinned descriptors, automatic V2 geometry/sealed packages, versioned document/assignment boundaries, Component/Run ribbon and shared camera navigation. Source: `contracts/circuit-schema/circuit-v1.2.schema.json`, `contracts/design-models/flexible-placement.md`, `services/api/app/api/placement.py`, `apps/web/src/components/workbench/WorkbenchRibbon.vue`, `apps/web/src/three/ViewportNavigation.ts`. |

R0–R7, H0–H6 and W0–W8 are historical phase labels; their reported PASS/counts belong to the dated evidence, not a fresh run against this checkout. IMPLEMENTED describes present source; VERIFIED requires a recorded current command/environment/result under [VERIFICATION.md](VERIFICATION.md). Hardware targets below remain PROPOSED/NOT_IMPLEMENTED until independent implementation and measurements exist.

Milestone W1 requires virtual execution/results, lifecycle/ownership/queue and truthful frontend capabilities before actual FPGA integration. R7 validates scaffold only.

Post-R7 hardening preserves the existing editor and discrete-event engine. Required unresolved endpoints affect executability; topology/function/assessment do not become safety gates. Reference physical node != student physical node. Capture payload storage and actual capability capacity precede scaling; no analog acquisition or electrical rating is inferred from these software tests.

After user review (no automatic merge): Linux Mini PC/PostgreSQL deployment; selected EP4CE6 transport/switching/protection schematic, measured topology scan/infrastructure routing; EP4CE10 SDRAM/ADC/DAC/AFE selection/timing/CDC; measured Logic Analyzer/Scope 2CH/Generator 2CH. Physical analog routing is future work. A bounded local50-session software workload has executed; target capacity, sustained load and real physical slots/recovery still require target evidence. No fixed breadboard count.
