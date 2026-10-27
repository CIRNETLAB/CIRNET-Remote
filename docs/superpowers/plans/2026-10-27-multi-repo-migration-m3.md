# Multi-Repo Migration M3 execution ledger

Date: 2026-10-27, Asia/Saigon. Scope: user-authorized M3 Simulator extraction only, following [approved M0](2026-10-24-multi-repo-migration-m0.md), [architecture authority](../../ARCHITECTURE.md) and [verification policy](../../VERIFICATION.md).

## Baseline and decisions

- Remote: `25d2e6784035f6a8165142f8a8e03c4534512bcc`, initially clean; branch `codex/m3-simulator-consumer` created from committed M2.
- Simulator: `b8765d9be221c9d1eb44bcc3827073f5e8ebdee3`, initially clean; branch `codex/m3-simulator-extract`.
- Contracts: `1f4388252a0711eae0a167b95964372453e811d2`, clean, read-only; released local artifacts `1.0.1`.
- Interface: `24968de2803cf69c7c5159f649f21ec0c32f8b5e`, clean, read-only. Its recorded M2 gallery failure and hosted CI gate remain open; M3 does not relabel them.
- No staging, authored commits, merging, pushing, deployment, license changes, retained-source deletion or M4 execution.
- Ruling: use existing checkout locations on dedicated branches, matching the previous migration workflow; temporary exports/history filtering and diagnostics remain external.
- Ruling: retain all eight Simulator runtime modules byte-for-byte. New distribution version `0.1.1` identifies standalone packaging; namespace `netcircuit_sim`, Contracts `1.0.1` and supported model behavior stay unchanged. Artifacts remain LOCAL_UNPUBLISHED.
- Ruling: original Simulator source/tests remain frozen rollback references. Remote must exclude those tests from default collection because their legacy path injection would shadow the installed wheel; equivalent tests run in the standalone product against installed artifacts.
- Ruling: preserve history in verified bundles and mappings without rewriting original repositories. Connecting target ancestry requires a separately authorized commit/merge, as in M1/M2.

## Interfaces and ownership

| Producer | Consumer | Contract |
| --- | --- | --- |
| Standalone Simulator | Remote API preview and Hardware virtual execution | Current M3B `netcircuit-simulator==0.2.0`; M3A 0.1.1 retained as rollback baseline; verified wheel identity/digest |
| Contracts | Simulator | `netcircuit-contracts==1.0.1`, installed catalog/schema/fixture resources, no sibling source |
| Contracts DEV tooling | Both verification harnesses | Existing pinned allocator, explicit owner and all participating Git roots, externally owned diagnostics |
| Simulator build | Remote package/CI gates | Immutable wheel/sdist manifest; exact version, hashes and clean installed provenance |

Root agent owns history, integration verification, final documentation and review. Independent delegated tasks own target-only packaging and Remote-only consumers; no shared writable implementation files.

## Tasks and acceptance

- [x] T1: verify baseline tests, original revisions and preserved-file inventory.
- [x] T2: extract history on a fresh temporary clone; verify bundles, mappings and restored objects.
- [x] T3: standalone Simulator package, installed-resource tests, dependency locks, build/CI and clean installation.
- [x] T4: Remote/Hardware version pins, verified installer, installed-import checks, workflows and package gate; remove Simulator source injections.
- [x] T5: API preview, Hardware virtual worker/lifecycle, Contracts compatibility and full relevant Python regression gates.
- [x] T6: fresh-source export and offline locked install, wheel/sdist resource inspection and rollback verification.
- [x] T7: independent review, documentation/context/workflow checks, external diagnostics inspection/cleanup, final diff/report and suggested commits.

Preserve deterministic ordering, propagation delays, nets, power-aware/bounded DC support, Graph versions and descriptor history. Analog/SPICE/mixed adapters remain unavailable. Do not change worker ownership, safety gating, control lifecycle, saved documents or captures.

## Progress

Preflight: source/target clean and branches created; read-only assessments confirm runtime separation and test/CI source coupling. Verification results will be recorded as commands finish, without promoting prior evidence to a fresh PASS.

Baseline: 102 tests PASS in 20.25 seconds. History: 18 selected Git entries match after rename, 14 commits retained from 125 mappings; all three bundles actually restored with strict fsck PASS. All eight runtime modules independently compared byte-for-byte.

Independent M3A review found three P2 setup/verification defects, all fixed and verified. R1: Linux setup used bare Python for one install; restored the explicit venv interpreter. R2: standalone same-version build could leave an older wheel installed; added forced installation and selected-archive binding with a real regression. R3: inherited URL settings overrode explicit manifest selection; explicit selection now wins or conflicting CLI selectors fail before side effects. No runtime algorithm changed in this pass.

Ruling: integration package gate still resolves its pre-existing third-party dependency mechanism, whereas the standalone Simulator gate proves the complete 20-wheel hashlocked offline closure. Record those scopes separately. Hosted Python 3.12/Node 22 and minimum Python 3.11 execution remain unverified locally. Initial target history remains preserved but unconnected until separate authorization. Existing compilation caches are not diagnostic evidence; do not delete historical outputs to make an inventory appear clean.

Ruling: the reviewer performed one pip dry-run without session TMP/TEMP overrides; initial git-filter-repo bootstrap also used default pip bookkeeping. Both remained outside all repositories, but their OS-temp bookkeeping was outside the allocator session. Record this narrow policy deviation; subsequent builds/tests use explicit owned TMP/TEMP/TMPDIR and no arbitrary temporary-directory cleanup is attempted.

## User-authorized M3B extension

After the verified 0.1.1 handoff candidate, the user requested preparation for ngspice or another simulation core and explicitly selected replaceable-backend preparation with current functionality retained, rather than implementing actual ngspice execution now. The [backend design/research](../specs/2026-10-27-simulator-backends-design.md) and [B1–B4 implementation plan](2026-10-27-simulator-backends.md) are now implemented and locally verified. The 0.1.1 baseline artifacts remain immutable; the additive facade and updated consumers use 0.2.0. All original eight runtime modules remain legacy compatibility. Final cleanup completed; [M3B evidence](../../verification/2026-10-27-simulator-backends.md) records 1,307 full Python tests, clean package checks and retained publication/ancestry gates. No M4 work occurred.
