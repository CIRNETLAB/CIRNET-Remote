# M3 Simulator extraction verification

Date: 2026-10-27, Asia/Saigon. Scope: M3 only, user-authorized Simulator extraction. M3A extraction has reached verified local artifact acceptance; the user subsequently authorized M3B to prepare replaceable backends for future ngspice integration while retaining current features. Actual ngspice execution is outside that chosen scope. This record preserves M3A evidence separately from subsequent changes. Authority: [architecture](../ARCHITECTURE.md), [M0](../superpowers/plans/2026-10-24-multi-repo-migration-m0.md), [M3 ledger](../superpowers/plans/2026-10-27-multi-repo-migration-m3.md), [verification policy](../VERIFICATION.md).

## Source and ownership

| Repository | Baseline | Migration branch |
| --- | --- | --- |
| Remote | `25d2e6784035f6a8165142f8a8e03c4534512bcc` | `codex/m3-simulator-consumer` |
| Simulator | `b8765d9be221c9d1eb44bcc3827073f5e8ebdee3` | `codex/m3-simulator-extract` |
| Contracts, read-only | `1f4388252a0711eae0a167b95964372453e811d2` | unchanged |
| Interface, read-only | `24968de2803cf69c7c5159f649f21ec0c32f8b5e` | unchanged |

All were initially clean. The user had committed M2 after its prior handoff. Simulator remote read access succeeds and its `master` still identifies the recorded initial commit; publish/private consumer CI permissions are not established by that read.

Simulator owns the 16 original files under `simulator/circuit-simulator`: eight runtime modules, six unit test modules, README and packaging. New standalone tooling, CI, locks and documentation belong to Simulator. The original tree remains in Remote as a frozen rollback/reference; no original runtime file is removed. Remote owns artifact selection/provenance, API preview integration, package conformance and orchestration. Hardware retains virtual station/worker lifecycle; no M4 extraction occurs.

The M3A checkpoint uses `netcircuit-simulator==0.1.1`, namespace `netcircuit_sim`, with exact Contracts `1.0.1` and direct `jsonschema==4.26.0`. The subsequent [M3B backend report](2026-10-27-simulator-backends.md) records the current 0.2.0 artifact and consumers. Runtime algorithms remain unchanged. Graph 1.0/1.1/1.2, deterministic event ordering/propagation, nets, powered HC08, bounded DC and unavailable analog/mixed adapters retain their existing meaning.

## History preservation

[Detailed mapping and bundles](2026-10-27-simulator-history.md): fresh `git clone --no-local`, git-filter-repo 2.47.0, no `--force`. Eighteen selected tree entries match Git mode/type/blob after the prefix rename; 14 commits are retained from 125 mappings, with raw author/committer identities and timestamps verified. All three bundles were actually restored and strict `git fsck` passed on their restored repositories. Original repository history was not rewritten.

Filtered tip: `fe7fe7823258a26fa72a767e76871ecd8db13182`. Initial target and extracted histories remain separate pending a separately authorized connecting merge/commit. A normal snapshot commit by itself does not connect ancestry.

## M3A verification checkpoint

| Gate | Current result |
| --- | --- |
| Original Simulator + API physical preview + Hardware virtual execution/workers + virtual Lab integration | PASS: 102 tests, 20.25 seconds; one existing Starlette/httpx deprecation warning |
| History bundles/actual restoration/blob and identity parity | PASS |
| Baseline rollback wheel | PASS: fresh offline venv `0.1.1 -> 0.1.0 -> 0.1.1`; original 75 unit cases pass on rollback and restored versions; pip check/import provenance pass |
| Standalone build/installed unit/clean export/offline locks | PASS: final 80 tests on source export and 80 on fresh extracted sdist/empty venv; all 20 third-party wheels installed with locked hashes and no index; wheel rebuilt byte-identically |
| Remote full Python/Contracts release run | PASS: 1,284 tests, four skips, 798.25 seconds; ten release commands pass, including generation/OpenAPI/public compatibility and npm parity. Run used the pre-review wheel; final wheel differs only in METADATA/RECORD, with all 11 other entries identical |
| Final reviewed-wheel consumer checks | PASS: 102 API/Hardware/Contracts/installer/worker/integration tests, four explicit skips, 38.18 seconds; final four-wheel external installation/runtime/spawn/migrations/CLI gate passes in 100.05 seconds |
| Review corrections | R1 explicit Linux venv interpreter fixed. R2 same-version stale wheel reproduced and fixed with force reinstall plus selected archive digest/payload binding. R3 explicit manifest priority fixed; new selector tests RED 8 -> GREEN 23, existing policy 47 PASS |
| Workflow checks | All nine Remote workflows and standalone Simulator workflow pass actionlint 1.7.12; final M3B rerun also passes |
| Final preservation/cleanup | Completed after M3B; see its report for post-regression audits and canonical cleanup, with durable release/history archives preserved |

Four explicit skips are two unavailable Windows file-symlink privileges and optional slang/Icarus FPGA tools. Directory-junction tests still run. The existing Starlette/httpx deprecation warning remains. No test assertion was weakened to hide a migration failure.

### Preserved M3A artifacts

Reviewed local handoff: `C:/Users/trann/.codex/visualizations/2026/10/24/01a16c1e-02ba-7253-9226-6f4a43582df4/migration-release-artifacts/m3-simulator-0.1.1-reviewed-20261027-9w8IIV/artifacts.json`.

| Artifact | SHA-256 |
| --- | --- |
| Simulator 0.1.1 wheel, 29,265 bytes | `8245664fb4ffcb54ed157d8012e837f5c702a1d0d83ab63a6f3ce7b7b7133a40` |
| Simulator 0.1.1 sdist, 68,351 bytes | `2d2b309ab723088e248e596aa5059568ebbd8389ba65f9e99d16844e36bfd03c` |
| Reconstructed 0.1.0 rollback wheel | `c8c03a433651bc536b20190fc7d8631b437af2fdc888a1df571defd44e6c770c` |
| Contracts 1.0.1 wheel | `ab865f991950fb575d86d3b6bb23646864c706b64c3d0305ba4b9ca9d0237c79` |

The sdist contains all 34 target source files byte-for-byte. Source fingerprint `af8daa545c601f9695b89a858eaf0e4c2a0595c139b6d7095ae870268f31561c` uses sorted UTF-8 `sha256  relative-path` lines. Build epoch `1792844004` is tied to the recorded source revision. A 20-wheel Windows AMD64/Python 3.14 dependency closure and hash lock are retained beside the release. The earlier `3a05bd...` candidate is labelled superseded and is not the reviewed handoff. Artifacts are LOCAL_UNPUBLISHED; no authored snapshot commit is fabricated, and fresh exports/sdists are distinguished from future committed checkouts.

Review dispositions retain current model/capture/worker boundaries, explicit unavailable behavior, and separate hosted/ancestry/publication gates. Initial tool bootstrap and one reviewer pip dry-run created OS-temp bookkeeping outside the canonical session, while remaining outside every repository. This narrow containment deviation is recorded; no arbitrary temporary directories were deleted. All subsequent build/test runtime, logs and fixtures use the owned external session.

Local runtime is Windows, Python 3.14.4. CI targets Python 3.12 and Node 22; hosted CI is separate evidence. No browser UI or engine algorithm change is intended by M3; M2's native gallery failure and its pending hosted gate retain their recorded disposition.

## Rollback and outstanding acceptance

Before switching a running compatibility set, stop/drain its owned executions through the normal lifecycle. Restore the previously reviewed Simulator/Contracts artifacts and matching API/Hardware metadata; restart both service processes. Preserve databases, documents, captures, leases and quarantine. Do not replay Start or convert saved data. Local package rollback will be verified separately; no deployment is performed.

No staging, authored commit, merge, push, force-push, deployment, license change or M4 execution is authorized by this record. Publish/consumer ACL, hosted CI, target deployment and connected ancestry remain separate gates.
