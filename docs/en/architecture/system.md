# CIRNET Remote system architecture

[Tiếng Việt](../../vi/architecture/system.md) · [Canonical Lab-First v3.1 architecture](lab-first-v3-1.md)

## Authority and scope

Use the [Lab-First v3.1 specification](lab-first-v3-1.md) for approved
system and safety rules and the [physical safety contract](physical-lab-safety-contract.md)
for electrical requirements. This page explains those boundaries and maps the
current selected topology. The [working context](context.md) gives maintainers
the invariants to check when changing the implementation.

Use [Contracts](../api/contracts-consumer.md) for the exact schemas and wire
formats. Use the [release lock](../../../integration/release-set.json) for
selected artifact identities and the [migration status](native-migration-status.md)
for the verified native combinations. The [history index](../history/index.md)
lists dated designs and reports with their scope.

## System boundary

The browser uses Vue 3, TypeScript, Pinia and Three.js in a single workspace. In the selected release topology, Nginx serves the Interface and forwards same-origin REST and WebSocket traffic to one FastAPI scheduler on `127.0.0.1:8000`. The API talks to the separate Hardware Service over local-only gRPC on `127.0.0.1:50051`. Hardware Service owns station lifecycle and private FPGA transport. PostgreSQL stores durable state in production. SQLite is supported for development and tests. Capture metadata lives in the database and large payloads live in capture storage.

| Repository | Responsibility |
| --- | --- |
| [cirnet-remote](https://github.com/cirnetlab/cirnet-remote) | API, auth, persistence, scheduler, deployment and integrated verification |
| [cirnet-contracts](https://github.com/cirnetlab/cirnet-contracts) | Schemas, device catalog, RPC/FPGA protocol contracts, generated resources and public SDK |
| [cirnet-interface](https://github.com/cirnetlab/cirnet-interface) | Web editor, browser operation adapters, product assets and browser assertions |
| [cirnet-simulator](https://github.com/cirnetlab/cirnet-simulator) | Simulation engine and replaceable backend boundary |
| [cirnet-hardware](https://github.com/cirnetlab/cirnet-hardware) | Local RPC, virtual and physical station adapters, and private transport |
| [cirnet-fpga](https://github.com/cirnetlab/cirnet-fpga) | RTL scaffold, testbenches and pinned verification toolchain |

The [release lock](../../../integration/release-set.json) selects system and Interface `0.1.4` and API, Contracts, Simulator, Hardware and FPGA scaffold `0.1.2`. It pins exact artifacts, RPC `2.0`, FPGA logical `1.0-scaffold` and register map `1.0-reserved`. The scaffold is a source artifact. [Application API](../api/application.md) · [FPGA conformance](fpga-contract-conformance.md)

The current source also contains a Rust Remote API and scheduler, Rust Contracts,
Rust Hardware and a C++ simulation worker. The verified Windows combinations
have their own artifact identities and acceptance scopes. The selected
installation and rollback continue to use the release lock above.
[Rust Remote](../../../native/README.md) · [Native migration status](native-migration-status.md)

## Design and observed topology

`CircuitGraph` 1.0, 1.1 and 1.2 are logical design truth. Version 1.1 adds rigid placement and validated contact bonds. Version 1.2 adds flexible assemblies and pinned free-component descriptors. New flexible authoring uses automatic `FlexibleMountV2`. Saved V1 geometry and historical descriptor revisions remain readable. Three.js projects the graph. Coordinates alone create no nets, and a placement ghost enters the graph only at commit. Versioned `/api/v2` operations carry the new shapes alongside existing operations. [Circuit specification](../api/circuit-spec-reference.md) · [Component placement](component-placement.md)

`DetectedTopologyGraph` records what was observed, including missing or unexpected parts and nets, ambiguous continuity and opaque identities. `AssignmentDefinition` carries optional reference design/topology, expected behavior, grading policy and `LabEndpoint` bindings. Endpoints target a fixed observed node, a reference node that requires resolution, or a virtual design port. The resolver binds eligible reference endpoints to actual student nodes. Unknown observations remain unknown. Required unresolved endpoints block execution.

## Run, observe and assess

```text
FIFO admission and lease -> SAFE_STATE -> scan -> safety verification
-> topology resolution and diagnostics -> compile and decide executability
-> route and guard power-up -> run and capture -> functional verification
-> safe cleanup -> release or quarantine
```

The Lab Execution Compiler checks executability before power permission and emits `InstrumentationExecutionPlan`. The plan covers infrastructure such as VCC/GND, drive/sense, clock, instrument allocation, trigger and protection. It preserves student IC and jumper wiring and carries no raw FPGA registers, MUX addresses or Linux transport identifiers. [Physical lab safety](physical-lab-safety.md)

| Evidence | Effect |
| --- | --- |
| `UNSAFE` or `INDETERMINATE` safety | `BLOCK_SAFETY` |
| Required resource, binding or capability unavailable | `BLOCK_UNEXECUTABLE` |
| Safe, executable circuit with topology mismatch | `RUN_NORMAL` or `RUN_GUARDED`, with separate topology diagnostics |
| Safe unknown identity with executable endpoints and protection | `RUN_GUARDED` |

Safety, topology and function are independent results. Functional verification uses captured behavior. Assessment policy controls grading and disclosure. For example, a safe circuit with the wrong wiring can run through its observed wiring and fail its functional check. The topology result remains available as a separate diagnostic.

## Runtime boundaries

These defaults describe the selected release.

- Virtual stations run the existing digital engine and bounded DC subset. The reserved `ngspice` selector reports unavailable. Full analog or mixed execution requires a real supported backend. [Signal domains and simulation](signal-domains-and-simulation.md)
- `instrument_capabilities` supplies available channels, with `0` meaning unavailable. UI channels are 1-based. The virtual Logic Analyzer exposes four channels. Scope and Generator have zero channels in the baseline. [Control isolation](control-isolation-and-runtime-index.md)
- The scheduler admits physical work against current `physical_execution_slots`. Disconnect, lease expiry or failure triggers Stop and safe cleanup. Failed cleanup quarantines the station. The shared `CIRNET_SIMULATION_WORKERS` defaults to four in the API and Hardware Service and uses spawned workers for CPU-bound simulation.
- Durable principals own projects and captures. Server sessions authenticate requests. The controller tab's identity binds execution lifetime to its authenticated session. Viewer tabs can read authorized state. Reconnection reconciles durable command outcomes and does not replay commands. [Projects and revisions](projects-and-revisions.md) · [Pending observations](pending-observations.md)
- HTTP and realtime views redact reference answers under the default `observed_only` assignment policy. Experiment JSON and events carry `CaptureMetadata`. Owner-scoped capture endpoints provide binary NCAP payloads. NCAP v2 codecs support sampled data formats, while the current runtime capture producer remains NCAP v1. [Assignment publication](assignments-and-publication.md) · [Capture catalog](capture-catalog.md)

The [0.1.4 local release report](../history/verification/2026-11-05-cirnet-release-0.1.4.md)
records Windows and software checks. The [CI test audit](../../vi/history/verification/2026-11-05-test-infrastructure-audit.md)
separates hosted release results from post-fix local results. Electrical and
target deployment claims require evidence from their own environments.
