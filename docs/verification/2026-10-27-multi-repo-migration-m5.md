# M5 FPGA extraction verification

Date: 2026-10-27, Asia/Saigon. Scope: user-authorized M5 only. Authority: [M0](../superpowers/plans/2026-10-24-multi-repo-migration-m0.md), [architecture](../ARCHITECTURE.md), [M5 plan](../superpowers/plans/2026-10-27-multi-repo-migration-m5.md), [Contracts/FPGA mapping](../architecture/fpga-contract-conformance.md), [verification policy](../VERIFICATION.md). Local implementation, source review, native RTL, full release gates, preservation and cleanup are complete. Publication/hosted execution and connecting target ancestry remain separately authorized work.

## Source, ownership and Git

| Repository | Baseline | Branch / role |
| --- | --- | --- |
| Remote | `f43f92c7730d40040e717bf1bacd3a3773e2a131` | `codex/m5-fpga-consumer` |
| FPGA | `aebac04f31f9af874b6cdff0da47b51ecfa16994` | `codex/m5-fpga-extract` |
| Contracts | `1f4388252a0711eae0a167b95964372453e811d2` | Read-only |
| Hardware | `2ddd0801e11207afa7fdfbe997392626dece0cd1` | Read-only |
| Simulator | `96a57e0f42a114c4f5b4675411c625415019f907` | Read-only |
| Interface | `24968de2803cf69c7c5159f649f21ec0c32f8b5e` | Read-only |

All initially clean with empty indexes. FPGA remote master read access matches the recorded target baseline; this is not publication/consumer CI ACL evidence. The established migration workflow uses dedicated local branches. No stage, authored commit, merge, push, force-push, original-source deletion, license change, deployment, board programming or M6 is authorized.

FPGA owns the existing 11 `fpga/**` files, pure scaffold/RTL tests, a supplemental safety testbench, pinned verification/toolchain and source/scaffold archive `netcircuit-fpga-scaffold` 0.1.0. Target retains the `fpga/` layout. Both DUT modules remain byte-identical. The target testbench receives the verified startup correction below; original Remote files/tests remain frozen and excluded from active pure-test collection. Hardware keeps serial/USB-SPI implementation and unavailable behavior; Remote retains installed artifact/Contracts/Hardware compatibility. No FPGA Python runtime distribution or board image is created.

Working diff: 24 Remote paths cover explicit source selection/provenance,
version manifest, three workflows, release/collection/compatibility tests and
canonical guides. FPGA has 33 changed/untracked paths (34 source inputs including
the unchanged license). API/Hardware/Simulator/Interface implementation,
canonical Contracts data, retained FPGA files and all six licenses are not edited.

## History

[Full extraction and mapping](2026-10-27-fpga-history.md): git-filter-repo 2.47.0 on a fresh no-local clone, no force. Five retained commits from 127 mappings; 15 selected tip entries and every retained tree match Git mode/type/blob/path after filtering. Raw author/committer/time identity matches. All historical selected paths were followed.

Three durable bundles pass verification, fresh mirror restoration, exact named refs, every advertised object (including linked-worktree pseudo-HEADs/tree refs), expected HEAD and strict fsck. Filtered tip `e0432905b7414a63eee4179983e47fa03d19dc49`. The mixed historical test remains whole in history; its Hardware assertion is excluded from the active pure FPGA product. Initial target/extracted ancestry remain separate under no-commit/no-merge; a later snapshot alone does not connect them.

## Baseline defect and verified correction

Before tool installation: 15 tests PASS, two explicit skips (slang/Icarus unavailable). After acquiring the pinned real Icarus/vvp toolchain, unchanged source compiles but the original testbench fails `command 1 unexpected ack` at 56 ns. That actual baseline run is FAIL, not RTL acceptance.

An external diagnostic copy adds only a monitor. It shows DUT state stays X: testbench declaration initializes reset_n=0 and releases it at 2 ns, before the first clock at 5 ns, so the simulator has no active reset event/clock while reset is held. A temporary testbench-only change holds reset through a positive clock edge, checks safe outputs and releases on a negative edge. The complete original sequence then emits LAB_FIRST_RTL_PASS. The same minimal timing repair is applied only to the new target testbench; assertions and DUT code are not weakened or changed. This is a disclosed verification-fixture correction, not regenerated expected behavior or electrical evidence.

Supplemental simulation exercises all live permit losses, explicit SAFE_STATE, Stop/reset/fault/watchdog, failed scan, zero period, exact clock boundaries and instrument requests/reset. Immediate drive inhibition is checked separately from next-clock FAULT/routing cleanup; synchronous simulation does not establish an electrical deadline.

## Toolchain and Contracts

The verified [official OSS CAD Suite release 2026-10-26](https://github.com/YosysHQ/oss-cad-suite-build/releases/tag/2026-10-26) supplies pinned platform archives. Windows Icarus/vvp actually reports `14.0 (devel) (s20260301-713-gf9111a949-dirty)`; this is the bundled upstream build, not stable 13.0 or a locally modified source claim. Windows archive SHA256: `8d0467cbd6d2c8fb41e99d3cd8a727109b8a3f08a9161c33a11ae6e731b998e3`; Linux x64 pin: `c0271052f5688834930c0788b547d26ea2d247eaf1f5a79d79e714bdcc64d4b8`. Parser is pinned [pyslang 12.0.0](https://pypi.org/project/pyslang/12.0.0/) with its actual nanobind runtime dependency in the complete hashlocked closure.

Tool acquisition and all native outputs use a short canonical external session with owner `netcircuit-m5` and explicit Remote/FPGA/Contracts/Hardware/Simulator roots. The unused initial long session was cleaned through the allocator before output capture moved to the short session. No diagnostic was created in source. Missing/wrong tools fail mandatory acceptance; no optional RTL skips.

B12 ruling is tested against installed Contracts 1.0.1: registered FpgaControlScaffold and control schema require 1.0-scaffold; preserved unavailable target example 2.0-scaffold is illustrative and rejected as that logical-envelope version. Do not normalize its bytes or derive physical firmware from it. Register map remains 1.0-reserved; actual physical protocol UNAVAILABLE. Contracts Markdown/source files are not standalone build prerequisites.

| Version / consumer boundary | Accepted value and meaning |
| --- | --- |
| FPGA source release | 0.1.0, source/scaffold only |
| Canonical Contracts | Exact installed 1.0.1 wheel/resources |
| Logical control envelope | 1.0-scaffold, accepted by registered schema |
| Preserved target example | 2.0-scaffold, rejected as current logical envelope |
| Physical framing/firmware | 1.0-reserved design status / UNAVAILABLE runtime |
| Installed Hardware compatibility | 0.1.1, RPC 2.0, absent-driver physical slots/channels remain zero |
| Simulator compatibility | Existing installed 0.2.0; no core or model change |

## Observed verification

| Gate | Result |
| --- | --- |
| Baseline software | 15 PASS, two tool skips |
| Actual unchanged RTL baseline | Compile PASS, simulation FAIL; reset-fixture cause isolated |
| Temporary reset-only correction | LAB_FIRST_RTL_PASS; no DUT edit |
| History/tree/identity/restoration/fsck | PASS |
| Initial strict native pipeline | pyslang elaboration, both-top Icarus syntax, original corrected and supplemental testbenches PASS |
| Final standalone / fresh isolated export | 18 PASS, zero skips in each; final archive rebuild byte-identical, exact 34-source-file inventory |
| Consumer boundary/release policy | Initial 73 policy cases and expanded 31 archive/root boundary cases PASS |
| Selected candidate integration | 42 unit/proposal/installed Contracts/Hardware compatibility cases PASS, zero skips |
| Final selected artifact native acceptance | PASS, 33.72 seconds using the exact reviewed extracted source; pinned slang, both-top syntax and both actual behavioral markers; 372 execution files authenticated against archive, unique output and all four source hashes recorded |
| Final selected artifact consumer acceptance | 42 PASS, zero skips, 6.16 seconds; exact source/archive/B12/installed Contracts/Hardware compatibility |
| Artifact recovery | Modified product rejected, fresh extraction from the same reviewed archive validates again; 18.34 seconds. No prior published version exists; no board rollback claimed |
| Workflow/artifact policy | Ten workflows PASS actionlint 1.7.12; five allocator/guard cases PASS |
| Source review | Both P2 findings closed after source and RED/GREEN inspection; no remaining actionable findings |
| Full Python/Contracts release | 1,286 PASS, two Windows file-symlink skips and one existing Starlette/httpx warning in 1,150.66 seconds; all twelve release commands PASS in 1,175.2 seconds (outer runner 1,190.20 seconds), including installed producer provenance, generation, OpenAPI equality, public compatibility and Python/npm parity |
| Final docs/provenance/audit | PASS: twelve baseline/provenance/context/link tests, 192-file Markdown scan, context, both diff checks and artifact guard; selected source remains exact after native/full tests; final protected-source/license/cache/HEAD/index/ignored-output audit PASS |
| Owned session cleanup | PASS: zero owned processes before cleanup; canonical cleanup with the original five-root context removed only the M5 session and confirmed absence; durable source/history/toolchain archives retained |

Consumer defenses cover explicit selectors, version/Contracts/logical pins, complete file/directory inventory, fingerprint and archive digest; extra/missing/modified payload, duplicate/case/path/alias/special/oversize members, empty-directory injection and root/ancestor reparse points fail. No retained `fpga/` fallback exists. API runtime and existing producer wheel pins remain unchanged.

The two full-suite skips retain unavailable Windows file-symlink privileges;
directory-junction checks execute. Original pure FPGA tests are now owned by
the standalone product, where the final native gates have zero skips. The old
optional-tool skips are not relabelled as execution. No assertion or baseline
was weakened to obtain these passes.

Independent review found two P2 issues, both corrected and closed: native support closure now derives from the authenticated archive, covering entrypoints, helpers/config/VPI, libexec, Windows DLLs, Linux shared libraries and linked targets/resolved bytes. Missing entries cannot disappear from an inventory discovered only from existing files; loader/IVERILOG overrides are sanitized. Six small synthetic support cases first failed, then passed; actual Windows re-verification authenticates 372 execution files. Copied target/current docs now describe mandatory verification and correct authority paths. A transient `.gitattributes` builder allowlist gap was fixed and independently probed; source-output containment also has RED/GREEN coverage. Native runs use unique owned children and record source identities. Modeled Linux-layout tests are not actual Linux execution.

## Artifacts, rollback and limits

Reviewed source artifact: `C:/Users/trann/.codex/visualizations/2026/10/24/01a16c1e-02ba-7253-9226-6f4a43582df4/migration-release-artifacts/m5-fpga-0.1.0-reviewed-20261027-PYu7D2/artifacts.json`.

| Artifact / identity | SHA256 |
| --- | --- |
| Source/scaffold 0.1.0 tar.gz, 54,775 bytes | `bdbd5cc984c75429ba3f65031f4c2b7557becb50b9e7d4bd156e1b4051d71eda` |
| 34-file source fingerprint (sha256-path-lines-v1) | `e047cf738d2ce154d5cbd0963a7e0dc06360581e3153581900a9d4e0bcaf784b` |
| Unchanged controller DUT | `83906703a6c97bc8921f28f1be154dc85f78ce21da086ff61dac399aaa0b9df6` |
| Unchanged instrument DUT | `d22373f1a4ec50e8e57e519b7fd581dd6f55228f33dcca9d8cb54133a27da681` |
| Corrected target original testbench | `50d268266eea49bc76e11a68acbfaaae107e88f2710908fd9b6c2f05ead70514` |
| Supplemental permit-matrix testbench | `d02d2f820594aa4878b9aa5f8df5baf5164e9ad9928cd6d491e58a7c4bfde45c` |
| Executed Windows iverilog | `ce8ed01dd1afa51e531b8647ac3eb406395878a563d62ba9cdb51e1594909080` |
| Executed Windows vvp | `0bb848c9a47c9729b94cafd7bb1875404af4eed3a675f65b59683ea99f1937d3` |

The archive has 34 exact reviewed source inputs plus `fpga-artifact.json` (35 members); the full file set and every byte match the target. The identity contains the source/target repository revisions and uncommitted state; no fictitious authored commit is used. Both target and fresh external export builds produce identical tar.gz bytes with normalized gzip/tar metadata. `.gitattributes` preserves source bytes across future Git line-ending conversion. The retained source TB still has original SHA `577ff3468b1407007554d06b051899addae214e2c3239f55073e0e9a06993e0b`.

The durable handoff also retains all 18 actual Windows AMD64/Python 3.14 dependency wheels, their complete hash lock and the exact official Windows OSS CAD Suite archive. First-party Contracts/DEV wheels remain the reviewed M1 artifacts. Native provenance points to the durable matching archive; no build source points into a sibling implementation. Artifacts remain LOCAL_UNPUBLISHED; future committed clean checkouts are distinct from these exact fresh uncommitted exports/artifacts. Rebuild/reverify after a future commit before any separate publication.

Software rollback restores the prior selected source/protocol artifact and consumer pins. No database/document/capture conversion, Start replay or board rollback is involved. The original archived scaffold remains available; its pre-existing reset-testbench failure must not be reported as a successful prior behavioral gate.

Local runtime: Windows Python 3.14.4/Node 24.20.0. Hosted Linux/Python 3.12/Node 22, minimum Python 3.11, synthesis, board pin/timing/CDC, actual FPGA protection/driver, ADC/DAC/SDRAM, acquisition and deployment are separate unrun/open gates. OPEN-ABI, OPEN-FRESHNESS and OPEN-HARDWARE remain open. Prior M2 browser disposition is unchanged.

Protected inventory records 690 original source/data files, six licenses and nine pre-existing pytest cache files. Only `contracts/README.md`, the current Remote consumer guide, is intentionally updated within that inventory; the other 689 files, including all retained FPGA/test sources, are protected. The final post-regression audit confirms all hashes, cache mtimes, original branches/HEADs and empty indexes; Contracts/Hardware/Simulator/Interface remain clean. Of 218 ignored diagnostic/data/media candidates none changed since session allocation. The one new `.build/contracts-tools/allocator.json` is separately verified compilation metadata for the pinned canonical DEV Node hash `7c42c4fd171ed861b365f08501f3c765282d6bba2dcd6430c9677cddd1abe345`, not diagnostic evidence.

All raw diagnostic traces, failing baseline and RED/GREEN cases, JUnit/native/compiler reports, source/archive/dependency inventories, history/restoration logs and final results were inspected. No screenshot/video or visual/hardware evidence was created. The final process audit found zero owned Python/Node/Icarus/vvp/helper processes. Canonical cleanup with the original five-root context removed only the M5 session and confirmed absence. Durable source/history/toolchain artifacts are outside that deleted target and remain available. No M6 or Git publication operation was performed.
