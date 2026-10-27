# M6 verification and release ledger

Started: 2026-10-27; execution continues 2026-10-28, Asia/Saigon. Status: IN_PROGRESS. This record does not replace historical M0–M5 observations. No production deployment or board programming is part of M6.

## Execution identity

User authorization covers six repositories, commits, ordinary history joins, master integration/push, v0.1.1 releases and deletion of verified merged migration branches. All six initial worktrees/indexes were clean. Pre-M6 recoverable bundles and all historical bundles were independently restored and checked; full results are preserved outside diagnostic cleanup under `C:/Users/trann/.codex/migration-release-backups/m6-20261027-861fea6d/`.

GitHub resolves the legacy `net-Circuit-Remote/net-Circuit-Remote` repository URL to `TINIHI-Labs/net-Circuit-Remote` (repository ID 1410135215). New download URLs use the canonical API namespace to avoid credential loss across legacy redirects. Initial API and Git checks found no v0.1.1 collision. The existing Git identity has admin/push access to all six private repositories. Workflow defaults remain read; an existing credential was configured as an Actions artifact-download secret without recording its value.

## Gates

| Gate | Current execution disposition |
| --- | --- |
| Six initial backups / fifteen historical bundles / complete mappings | PASS: hashes, actual restores, refs/objects, strict fsck, projected trees and identities |
| History joins | Contracts, Simulator, Hardware and FPGA joined normally; current product trees preserved; Interface joined after committed product normalization, preserving its tree |
| M2 unchanged original gallery | PASS focused fresh run: ten cycles and detailed native assertions; historical failure remains preserved |
| Recovery responsiveness regression | RED reproduced payload inspection of impossible count; minimal early-bound fix unit GREEN; final artifact browser GREEN pending |
| Contracts source generation / pure suite | PASS 500 tests on c39c95c; API application-info normalization is the only OpenAPI document delta |
| Simulator / Hardware / FPGA candidate standalone | PASS final clean 110 / 108 / 19, with exact final Contracts and actual behavioral RTL, no skips |
| Remote manifest/installer/workflow focused tests | In progress; final full clean acceptance pending |
| Remote contracts/python/web/postgres/browser/package | NOT_RUN on final release set |
| Exact rollback artifact set and matching database/capture restore | PASS scoped software rehearsal: old exact artifact install/RPC/worker/NCAP; current-to-old PostgreSQL/capture restore, ownership, quarantine and no Start replay; old native browser/RTL not rerun |
| Durable publication / authenticated final downloads | Draft Contracts/Simulator/Hardware/FPGA assets prepared; Contracts authenticated downloads/digests PASS; official v0.1.1 promotion pending |
| Hosted master CI / master promotion / tag / branch cleanup | NOT_RUN |

The initial pre-info-version Contracts candidate is preserved separately; it is not the selected final release artifact. The API export review changed only `info.version` from 0.2.0 to 0.1.1. Historical schema/protocol/wire baselines retain their original bytes; compatibility assertions separately require the new application-info version and every other old anchor.

## Evidence ownership

All new raw logs, profiles, traces, screenshots, test databases, caches and isolated build environments originate in the canonical allocator-owned external session with all six participating roots. Native browser runtimes are complete owned physical copies. Evidence inspection and final guarded cleanup remain pending until all running gates finish. Durable source/history/release archives are kept separately and are not diagnostic cleanup targets.
