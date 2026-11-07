# CIRNET Remote changelog for major version 0

[Changelog index](README.md) · [English history](../en/history/index.md) ·
[Lịch sử tiếng Việt](../vi/history/index.md)

## Contents

- [Unreleased](#unreleased)
- [v0.1.4](#v014)
- [v0.1.3](#v013)
- [v0.1.2](#v012)
- [v0.1.1](#v011)

## Unreleased

### Added

- Added an opt-in C++ Simulator worker and Rust implementations of Contracts,
  Hardware and Remote. The recorded native gates apply to the tested candidates.
  Exact native release packaging and acceptance remain pending under Gate 5.
  The selected published system is 0.1.4. [Native migration status and evidence](../en/architecture/native-migration-status.md)

### Fixed

- Pinned tested browser source and consolidated consumer verification. Added a
  fallback to the full Python gate when test selection cannot safely narrow the
  run and kept live gRPC NCAP coverage. [Browser and consumer verification](https://github.com/cirnetlab/cirnet-remote/commit/feebc8dafc7c5a8621c979d1d8aeb6f615fba85f) · [Selector fallback](https://github.com/cirnetlab/cirnet-remote/commit/37cb350b8492799fa1f8ad2ec85b11fbdd2d5bda)

### Changed

- Organized tagged system changes by major version and separated the release
  changelog from historical verification records. [Changelog index](README.md) · [Documentation conventions](../en/contributing/writing-documentation.md)

## v0.1.4

Published **2026-11-05** at `16:10:35 +07:00`. Lightweight tag target `38aea61` at `16:10:09 +07:00`.
[Release](https://github.com/cirnetlab/cirnet-remote/releases/tag/v0.1.4) · [Tagged manifest](https://github.com/cirnetlab/cirnet-remote/blob/38aea6120920f48cea817827ac2277cce4bef25e/integration/release-set.json)

### Changed

- Selected Interface 0.1.4 and the 0.1.2 API, Contracts, Simulator, Hardware and
  FPGA scaffold artifacts. The API and deployment archives came from Remote
  source `ce84ec4`. The manifest pins fifteen artifacts by source revision, asset
  ID and digest. [Release profile source](https://github.com/cirnetlab/cirnet-remote/commit/ce84ec4cf3602ef6fd001f91877e864c8955f9c7) · [Local release verification](../en/history/verification/2026-11-05-cirnet-release-0.1.4.md)
- Adopted the `cirnet-api` distribution and the `@cirnet/contracts` and
  `@cirnet/artifact-paths` npm scopes. The Remote API keeps the `app` import, and
  the migration retains compatibility readers for older configuration and user
  data. [Canonical profile](https://github.com/cirnetlab/cirnet-remote/blob/ce84ec4cf3602ef6fd001f91877e864c8955f9c7/docs/NAMESPACE.md)
- The development and verification toolchain moved to Node.js 26.
  [Node.js toolchain change](https://github.com/cirnetlab/cirnet-remote/commit/426f2c5abe281ed245f3c9f0d9194f294e2faf6d)

### Breaking Changes

- The installer accepts only the 0.1.4 release profile. To install an earlier
  selection, use its tagged tools. The Windows launcher requires Python 3.14
  or later and uses a dedicated 0.1.4 virtual environment.
  [Installer profile validation](https://github.com/cirnetlab/cirnet-remote/blob/38aea6120920f48cea817827ac2277cce4bef25e/scripts/system_release_manifest.py) · [Python baseline change](https://github.com/cirnetlab/cirnet-remote/commit/0a6523640b8d7781bf2411482e7a60d172ae5c48)

## v0.1.3

Published **2026-11-04** at `20:10:32 +07:00`. Lightweight tag target `8c8cdcd` at `20:07:13 +07:00`.
[Release](https://github.com/cirnetlab/cirnet-remote/releases/tag/v0.1.3) · [Tagged manifest](https://github.com/cirnetlab/cirnet-remote/blob/8c8cdcdc4ffa5ac537033f4ffafc74f4148cac1e/integration/release-set.json)

### Added

- Added a Windows launcher to start and stop the selected stack, with an
  interactive menu, Doctor dependency checks and Clean for owned launcher
  artifacts. [Launcher source](https://github.com/cirnetlab/cirnet-remote/commit/f5552c3898c9dcc4403c338ab9f1e9bb49057ae7) · [Menu, Clean and Doctor](https://github.com/cirnetlab/cirnet-remote/commit/b8c9b3691f944b440d97184c3454555996e63ef0)

### Changed

- Selected Interface 0.1.3 at `6c150f3` and retained 0.1.1 API, Contracts,
  Simulator, Hardware and FPGA artifacts. Remote began using canonical CIRNET
  source names and compatibility aliases and removed superseded implementation
  copies maintained in the producer repositories. [Naming change](https://github.com/cirnetlab/cirnet-remote/commit/685c365770b9831f3f0fd24cc7bae6496a79bae4) · [Source cleanup](https://github.com/cirnetlab/cirnet-remote/commit/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca)

- Updated Interface browser assertions to verify the security attributes of
  canonical and legacy session cookies against their respective API builds.
  The complete local Ubuntu browser run recorded 57 passes and one optional
  historical skip. [Interface cookie verification](https://github.com/cirnetlab/cirnet-interface/commit/6c150f34193bb3b009046cbaa586fae0260560f4) · [Ubuntu acceptance record](../en/history/verification-ledger.md#browser-continuation-and-interface-patch-013--2026-11-04)

## v0.1.2

Published **2026-11-03** at `21:42:37 +07:00`. Lightweight tag target `17ac273` at `21:37:49 +07:00`.
[Release](https://github.com/cirnetlab/cirnet-remote/releases/tag/v0.1.2) · [Tagged manifest](https://github.com/cirnetlab/cirnet-remote/blob/17ac27398c66bd57c888a8edc051574f624b7e18/integration/release-set.json)

### Changed

- Introduced a mixed-version system selection. Interface moved to 0.1.2 at
  `a14d095`. API, Contracts, Simulator, Hardware and FPGA retained their 0.1.1
  artifacts and original build provenance. Remote recorded the successful local
  Ubuntu native browser gate before publication. [Mixed-version selection](https://github.com/cirnetlab/cirnet-remote/commit/3c3c36a96daf31b7b25bf797431e76e4534076bc) · [Publication and acceptance record](../en/history/verification/2026-10-27-multi-repo-migration-m6.md#publication-and-branch-closeout-on-november-3-2026)

### Fixed

- Avoided redraws when the wire-edit hover target was unchanged. The selected
  source and static Interface archives were built from the corrected source.
  [Interface hover fix](https://github.com/cirnetlab/cirnet-interface/commit/a14d0950e71a997e2219a32f7268fd0e9d6502b3) · [Corrected artifact selection](https://github.com/cirnetlab/cirnet-remote/commit/d49c8046f14cce0ff0ea6ffa3b722e9742ab0eb7)

## v0.1.1

Published **2026-10-28** at `22:51:51 +07:00`. Annotated tag `6d3dbdf` at `22:50:32 +07:00`, targeting
commit `065179e` from `19:47:02 +07:00` the same day.
[Release](https://github.com/cirnetlab/cirnet-remote/releases/tag/v0.1.1) · [Tagged manifest](https://github.com/cirnetlab/cirnet-remote/blob/065179ead7c7cf4f44483b74edca99bb84f8f2a5/integration/release-set.json)

### Added

- Published the first immutable six-repository set. Remote API, Contracts,
  Interface, Simulator, Hardware and the FPGA scaffold were selected at 0.1.1.
  The API and deployment archives used Remote build source `82ca15b`. The lock
  pins the selected packages and static Interface by asset ID and digest.
  [Artifact integration](https://github.com/cirnetlab/cirnet-remote/commit/dbd44eb53fda3efcd77577816e63cec41cf26df1) · [Publication record](../en/history/verification/2026-10-27-multi-repo-migration-m6.md#historical-publication-checkpoint-2026-10-28)
- Established the virtual lab and workbench baseline, with authenticated
  projects and circuit revisions, assignment publication, experiment lifecycle,
  typed realtime events and capture retention. The published set uses Hardware
  RPC `2.0` and the FPGA logical protocol `1.0-scaffold`. [Lab-First migration ledger](../en/history/lab-first-migration-ledger.md) · [Web and Contracts implementation](https://github.com/cirnetlab/cirnet-remote/commit/44cff6a9870b67266637b1fb94aa220960f864a0)

### Fixed

- Bounded API request and realtime work, indexed maintenance and experiment
  queries, and isolated Stop from delayed control RPC. The changes preserved
  ownership and stored evidence through forward migration 0007.
  [Runtime hardening](https://github.com/cirnetlab/cirnet-remote/commit/33b52f6adaf757ce0e273c53247b136c74505251)
