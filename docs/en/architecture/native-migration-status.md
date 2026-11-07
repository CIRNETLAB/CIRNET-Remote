# Native migration status and evidence

[Tiếng Việt](../../vi/architecture/native-migration-status.md) · [Documentation](../index.md)

The [full native migration plan](native-migration.md) retains the original
stage sequence, policies, candidate measurements and dated results.
Use this index to find the recorded decision and the evidence for each stage.

## Source, candidates and release

- **Source.** The Rust Contracts, C++ Simulator, Rust Hardware and Rust Remote
  implementations are in their owning repositories. Remote recorded the
  Stage 3 integration at `3cc5063df984c73f05d50979a7b50dbc853323a9` and the
  Stage 4 implementation at `13a35145b6d15644c7be10d95a5410bf69e11867`.
  Use the [system architecture](system.md) for component ownership.
- **Accepted candidates.** Each result applies to the artifact set and
  platform cited in the evidence. The Stage 4 Windows executable has SHA-256
  `717402ba92e7a0f1864fe4f5f70dbc8f6a55c154e9880a35d470dd2e07f51203`.
  The [checkpoint](native-migration.md#stage-4-windows-compatibility-and-safety-checkpoint--717402ba)
  identifies the matching Interface, Contracts, Hardware and C++ worker.
- **Selected release and rollback.** [The release lock](../../../integration/release-set.json)
  selects system and Interface `0.1.4`, with API, Contracts, Simulator, Hardware
  and FPGA source `0.1.2`. [Release and rollback](../operations/release-and-rollback.md)
  covers installation and recovery using the exact selected bytes.

## Acceptance by stage

| Stage | Recorded decision | Evidence and scope |
| --- | --- | --- |
| 0. Reference | **PASS** on the selected `0.1.4` reference | [Archive, thresholds and provenance](native-migration.md#reference-archive-and-acceptance-thresholds) |
| 1. C++ Simulator | **PASS** for r7 on Windows x64 | [Decision, Stop and integration evidence](native-migration.md#gate-1-decision-for-windows-x64), [future SPICE proposal](native-migration.md#future-spice-core-based-on-ngspice) |
| 2. Rust Contracts | **PASS** for the r2 matrix | [Initial candidate FAIL, r2 parity and clean build receipts](native-migration.md#stage-2-candidate-verification) |
| 3. Rust Hardware | **PASS** for r8-R2 Windows functionality, compatibility and safety | [Host policy](native-migration.md#gate-3-acceptance-policy-by-host), [formal loaded Stop](native-migration.md#gate-3-formal-windows-loaded-stop) |
| 4. Rust Remote | **PASS** for `717402ba` Windows functionality, compatibility and safety | [Host policy](native-migration.md#gate-4-acceptance-policy-by-host), [artifact, HTTP, data, Interface and safety evidence](native-migration.md#stage-4-windows-compatibility-and-safety-checkpoint--717402ba) |
| 5. Exact release artifacts | **NOT RUN** | [Packaging, process smoke, release verification and rollback criteria](native-migration.md#5-accept-the-exact-release-artifacts) |

The Stage 3 and Stage 4 policies keep Windows/i5 safety bounds mandatory and
use ordinary performance comparisons for diagnosis. The Stage 3 production
performance gate and the Stage 4 Linux/Xeon performance and full loaded Stop
gates remain **NOT RUN**. For Stage 4, the full Stop plan retains three paired
windows of 100 qualified samples per side and a 403-attempt limit per side and window.
Approve the Linux method and performance thresholds on the target platform
before acceptance. Physical HIL and production/release acceptance remain
**NOT RUN**. A release that advertises physical control requires suitable HIL.

The [Rust Remote verification guide](../contributing/rust-verification.md)
describes the tests and their fixture inputs. The
[release history index](../history/index.md) links other dated records.
