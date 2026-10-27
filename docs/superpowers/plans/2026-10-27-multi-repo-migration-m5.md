# Multi-Repo Migration M5 implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. User authorizes M5 only; no stage, authored commit, merge, push or M6.

**Goal:** Extract the existing FPGA scaffold into net-Circuit-FPGA with versioned Contracts, preserved RTL/history and actual pinned-tool RTL acceptance.

**Architecture:** FPGA owns RTL, testbenches, pure scaffold tests, build/verification tooling and a versioned source artifact. Hardware retains transport/physical drivers; Remote retains orchestration and installed artifact/Contracts/Hardware compatibility. No FPGA Python runtime package or board image is introduced.

**Tech Stack:** Source/scaffold version 0.1.0; Contracts 1.0.1; canonical DEV allocator 1.0.0a1; pinned pyslang 12.0.0 and OSS CAD Suite 2026-10-26 Icarus/vvp. Local verification uses Windows/Python 3.14.4; CI uses Linux/Python 3.12/Node 22.

**Spec:** [Approved M0/M5](2026-10-24-multi-repo-migration-m0.md), [architecture](../../ARCHITECTURE.md), [FPGA/Contracts conformance](../../architecture/fpga-contract-conformance.md), [verification policy](../../VERIFICATION.md).

## Baseline and rulings

- Remote: `f43f92c7730d40040e717bf1bacd3a3773e2a131`, clean committed M4; branch `codex/m5-fpga-consumer`.
- FPGA: `aebac04f31f9af874b6cdff0da47b51ecfa16994`, initially clean README/LICENSE; branch `codex/m5-fpga-extract`. Remote read access verified; publication/CI ACL remains separate.
- Read-only Contracts `1f4388252a0711eae0a167b95964372453e811d2`, Hardware `2ddd0801e11207afa7fdfbe997392626dece0cd1`, Simulator `96a57e0f42a114c4f5b4675411c625415019f907`, Interface `24968de2803cf69c7c5159f649f21ec0c32f8b5e`.
- Continue dedicated local branches in the existing checkouts. Short canonical external temporary paths support native Windows tools. Owner/context contains Remote, FPGA, Contracts, Hardware and Simulator; preserve the same context through child processes and cleanup.
- Baseline before installing tools: 15 tests PASS, two explicit skips (slang/Icarus absent). Protected inventory: 690 retained source/data files, six licenses and nine pytest cache files.
- Preserve the 11 tracked `fpga/**` files and two original Remote test files. Target retains `fpga/` layout; the two DUT RTL files remain byte-identical. The target testbench receives only the verified reset-startup correction below; preserve all original assertions. Add supplemental tests/testbench; no RTL redesign or board programming.
- `contracts/README.md` is the current Remote consumer guide and may receive the explicit FPGA artifact setup. This is the only intentional edit within the protected-tree inventory; canonical schemas/catalogs and the other 689 files remain unchanged.
- B12 ruling: installed manifest/schema require logical `1.0-scaffold`; installed unavailable target example's `2.0-scaffold` is an illustrative design-target label, incompatible with the executable logical envelope. Test rejection, preserve example bytes, retain physical protocol UNAVAILABLE and register map 1.0-reserved. No Contracts patch/release.
- Actual pre-extraction Icarus baseline: compile succeeds, simulation fails scan ACK at 56 ns. Diagnostic trace shows the testbench initializes reset_n=0 then releases at 2 ns, before the first clock at 5 ns; DUT state remains X. A temporary testbench-only correction holds reset through a positive clock edge and releases on a negative edge; the complete original LAB_FIRST_RTL_PASS succeeds. Apply that minimal startup correction only in target, keep every assertion and both DUT modules, and preserve the original failing testbench in Remote/history. This is a disclosed verification-fixture repair, not a baseline regeneration or electrical claim.

## Ownership and artifact interface

| Files | Owner / change |
| --- | --- |
| `fpga/**` | Copy to FPGA `fpga/**`; original source/docs retained in Remote as frozen reference |
| Pure `tests/fpga/**` assertions | FPGA tests, installed Contracts resources and mandatory RTL tools; Hardware adapter assertion remains integrated in Remote |
| New supplemental safety TB | FPGA: every live permit loss, SAFE_STATE/STOP/reset/fault/watchdog, failed scan/zero period, clock boundary and disabled instrument requests |
| Canonical schemas/catalogs/protocol | Contracts 1.0.1 installed wheel; no copied canonical schemas or sibling source |
| Artifact builder/toolchain/locks/CI | FPGA source/scaffold tar.gz; no Python runtime distribution or board image |
| Artifact selector/installer/provenance | Remote, explicit source archive/version/SHA and owned fresh extraction; no retained-source fallback |
| Current physical/RPC/synthetic producer checks | Remote + installed Hardware 0.1.1/Contracts 1.0.1/Simulator 0.2.0 |

The source archive contains `fpga-artifact.json` at its root. Schema 1 identity:
`name=netcircuit-fpga-scaffold`, `version=0.1.0`, `kind=source`,
`contractsVersion=1.0.1`, `logicalProtocolVersion=1.0-scaffold`,
`registerMapVersion=1.0-reserved`, `physicalAvailable=false`.
`files` maps every source-relative file (excluding the generated identity itself)
to SHA256; `sourceFingerprint` hashes sorted UTF-8 `sha256  path` LF lines.
The complete archive inventory must equal `files` plus the identity.
`source` uses exact keys `repository`, `revision`, `originalRepository`,
`originalRevision`, and `uncommittedMigration`: target repository/revision,
original Remote repository/revision, and explicit migration-state boolean.
Fresh exports without Git require
explicit provenance; no upward Git/source fallback. Builders exclude compilation
caches/diagnostics and the generated identity from source enumeration.

Remote uses `NETCIRCUIT_FPGA_ARTIFACT_MANIFEST` with a schemaVersion 1 `source`
entry containing absolute archive `path` and `sha256`; `NETCIRCUIT_FPGA_ROOT`
selects the verified extracted product. Explicit CLI selectors take priority;
missing/conflicting selectors, wrong pins/digests/inventory and unsafe tar paths
fail before publication. Extraction uses a fresh allocator-owned child; no
user-selected arbitrary output, symlink traversal or retained-tree fallback.

## Toolchain and review focus

OSS CAD Suite official release tag `2026-10-26` pins Windows/Linux asset URLs,
digests and sizes. Verified Windows bundle reports Icarus/vvp
`14.0 (devel) (s20260301-713-gf9111a949-dirty)`; this is the upstream bundled
development build, not a stable 13.0 claim. Verification records actual executable
hashes/version output and the selected archive identity. Missing/wrong parser,
compiler or runtime is a failure in acceptance, never an optional skip. Windows
and Linux pins are distinct; hosted Linux execution is separate evidence.

1. Immediate drive inhibition versus synchronous FAULT/route cleanup must match current RTL; do not claim electrical timing from synchronous simulation.
2. Version domains stay independent: source 0.1.0, Contracts 1.0.1, logical 1.0-scaffold, reserved register map and unavailable physical firmware.
3. Unavailable instrument outputs remain disabled under requests/reset; there is no ADC/DAC/SDRAM/CDC implementation or acquisition claim.
4. Artifacts must reject extra/missing/tampered members, unsafe archive aliases and wrong selected roots; toolchain output/logs/tempfiles stay outside all Git roots.
5. Remote compatibility must consume selected artifacts and installed Contracts/Hardware; pure RTL collection belongs to FPGA, without silently losing old assertions.

## Tasks

- [x] T1 — Inspect authority, source/refs/access/ownership, preserve input inventory and run pre-tool baseline.
- [x] T2 — Preserve source/target/history bundles on a fresh no-local clone, exact tree/identity/history mapping and actual restore/fsck; do not connect ancestry without separate Git authorization.
- [x] T3 — FPGA product: preserve original files/DUT RTL with the disclosed testbench startup correction, adapt pure tests to installed Contracts, implement B12 conformance, source artifact builder, complete dependency/toolchain pins, allocator/bootstrap and independent CI.
- [x] T4 — Actual RTL: mandatory slang parse/elaboration, Icarus compile and original/supplemental behavioral tests, meaningful negative tool/contract/provenance cases, clean external source-artifact verification and deterministic archive.
- [x] T5 — Remote: source artifact selection/extraction/verification, integration/version manifest, installed FPGA/Contracts/Hardware compatibility, release/workflow/collection updates and RED/GREEN boundary checks.
- [x] T6 — Final artifact handoff, independent review/fixes, full relevant Python/Contracts and RTL acceptance, workflow/docs/artifact checks, rollback rehearsal, protected-source/index/HEAD/ignored-output audit and canonical cleanup. Stop at M5 with commit suggestions.

FPGA implementer owns target product/tests/CI only. Consumer implementer owns Remote scripts/config/tests/workflows only. History implementer owns history Markdown and external bundles only. Root owns canonical docs, tool acquisition, shared environment coordination, integrated verification, durable artifacts and final cleanup. No concurrent API venv mutation.

## Acceptance and rollback

Keep all original assertions, plus real supplemental simulation; zero skipped RTL gates. Fresh exact source exports/artifacts are distinguished from a future committed clean checkout because authored commits are prohibited. Restore the previous source/protocol artifact and compatibility pins for software rollback; no board image, programming or electrical rollback is claimed. OPEN-ABI, OPEN-FRESHNESS and OPEN-HARDWARE remain open. No license change, source/old-document deletion, deployment or M6.

## Final local acceptance

Source/scaffold 0.1.0 is built and reproduced byte-identically from a fresh
isolated export. Both 18-case standalone suites and actual slang/Icarus safety
testbenches pass without skips; final Remote-selected artifact/native acceptance
passes with 372 authenticated execution files. Remote full release: 1,286 PASS,
two baseline Windows symlink skips, twelve commands PASS. Both review findings
closed; workflow, docs, protected inputs/indexes/HEADs and ignored-output checks
pass. Same-artifact corruption/re-extraction recovery passes; no prior published
version or board rollback is claimed. Inspected diagnostics were removed only
through canonical session cleanup, retaining durable source/history/toolchain
archives. See the [verification and rollback report](../../verification/2026-10-27-multi-repo-migration-m5.md).
