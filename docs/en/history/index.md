# Release history and evidence

[Tiếng Việt](../../vi/history/index.md) · [Documentation](../index.md)

These records describe specific revisions, inputs and environments. Use the
[current release lock](../../../integration/release-set.json) and
[verification guide](../contributing/verification.md) when preparing a new run.

For native migration, use the [stage status and evidence index](../architecture/native-migration-status.md).

| Record | Language | Scope |
| --- | --- | --- |
| [Changelog](changelog.md) | English | Chronological changes |
| [Lab-First roadmap](lab-first-roadmap.md) | English | R/H/W milestones and planned hardware |
| [Lab-First R0–R7 ledger](lab-first-migration-ledger.md) | English | Migration and evidence |
| [FPGA proposal mapping](fpga-contract-conformance-original.md) | English | Detailed mapping and M5 compatibility ruling |
| [M6 release ledger](verification/2026-10-27-multi-repo-migration-m6.md) | English | Versioned release history and validation |
| [CI artifact access record](ci-artifact-access-record.md) | English | Post-rename receipts and historical access checks |
| [0.1.4 local release](verification/2026-11-05-cirnet-release-0.1.4.md) | English | Local release checks and unrun gates |
| [CI test infrastructure audit](../../vi/history/verification/2026-11-05-test-infrastructure-audit.md) | Vietnamese | P0–P3 changes, measurements and limits |
| [Original native migration plan](https://github.com/cirnetlab/cirnet-remote/blob/f91eeeb42d7528d4e7fa9b1526195847932faf9d/docs/superpowers/plans/2026-11-05-cirnet-native-migration.md) | Vietnamese | Staged C++ and Rust plan, separate from current runtime |
| [Native migration Stage 0](https://github.com/cirnetlab/cirnet-remote/blob/81d919d63ac6b8a7b0b7846a887d0156c694f0e5/docs/verification/2026-11-05-native-migration-stage-0.md) | Vietnamese | Partial reference measurements and open thresholds |
| [Original 3D power supply controls](../../vi/history/power-supply-controls.md) | Vietnamese | Legacy model interaction and dated results |

## Archives

- [Development handoff](development-log.md) records past work and handoff markers.
- The [English archive](archive/) and [Vietnamese archive](../../vi/history/archive/) hold original prompts and superseded specifications.
- The [verification ledger](verification-ledger.md) and dated evidence in [English](verification/) and [Vietnamese](../../vi/history/verification/) record test inputs and results.
- [Remote before the repository split](https://github.com/cirnetlab/cirnet-remote/tree/989954f95c1c6b1d224e31a53fb33f125f0a81a9) contains the earlier integrated implementations.
- [Pre-cleanup documentation](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs) contains earlier designs, component and physical visuals, and verification reports. Its [browser suite entry](https://github.com/cirnetlab/cirnet-remote/tree/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/tests/end-to-end) points to the migrated suite.
