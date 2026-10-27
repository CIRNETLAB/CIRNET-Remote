# M4 Hardware extraction verification

Date: 2026-10-27, Asia/Saigon. Scope: user-authorized M4 only, following [approved M0](../superpowers/plans/2026-10-24-multi-repo-migration-m0.md), [current architecture](../ARCHITECTURE.md), [execution plan](../superpowers/plans/2026-10-27-multi-repo-migration-m4.md) and [verification policy](../VERIFICATION.md). Local M4 implementation, integrated tests, preservation and cleanup are complete. Publication/hosted execution and connecting target ancestry remain separately authorized work.

## Revisions and ownership

| Repository | Baseline revision | Branch / role |
| --- | --- | --- |
| Remote | `0d038c7aed15798696223558b4e58f5ffe926aa9` | `codex/m4-hardware-consumer` |
| Hardware | `2b0005f40dc826bc7940cd0af28c57ebb063fcb7` | `codex/m4-hardware-extract` |
| Contracts | `1f4388252a0711eae0a167b95964372453e811d2` | Read-only |
| Simulator | `96a57e0f42a114c4f5b4675411c625415019f907` | Read-only |
| Interface | `24968de2803cf69c7c5159f649f21ec0c32f8b5e` | Read-only |
| FPGA | `aebac04f31f9af874b6cdff0da47b51ecfa16994` | Read-only |

All initially clean with empty indexes. Hardware remote `master` read access matches the baseline; publication/private consumer CI ACL is not established by that read. Dedicated local branches follow the previous migration workflow. No stage, authored commit, merge, push, force-push, source deletion, license change, deployment or M5 is performed.

Hardware owns the original 18 service files: nine runtime modules, seven test modules, README and pyproject. Eight runtime modules remain byte-identical; `hardware_service/__init__.py` changes only distribution version 0.1.0 -> 0.1.1. Independent package tooling, locked verification closure, CI and tests belong to Hardware. The pure transport-unavailable assertion is copied from the mixed FPGA test; no RTL/FPGA implementation moves. Remote retains all original service files as frozen references, excludes those units from current discovery, and owns actual API/compiler -> RPC -> worker/capture acceptance, orchestration, leases/quarantine and deployment.

API runtime remains free of Hardware implementation dependencies. Root integration pins `netcircuit-hardware-service==0.1.1`; Hardware pins Contracts 1.0.1, Simulator 0.2.0, grpcio 1.84.0, protobuf 7.36.2 and directly imported jsonschema 4.26.0. Standard supported paths use installed wheels/resources, with no sibling source or root test-time RPC generation.

Working diff: 39 Remote paths cover the three artifact scripts, integration pin,
six workflows, package/release/browser harness, source-free test fixtures and
consumer tests, and canonical documentation. Hardware has 41 changed/untracked
paths (42 source inputs including the unchanged license). API implementation,
Contracts schemas/catalogs, Simulator implementation, Interface and FPGA RTL
are not edited. The FPGA workflow change only installs the Hardware artifact
for its existing transport compatibility assertion; it does not execute M5.

## History

[Complete history evidence and mapping](2026-10-27-hardware-history.md): fresh no-local clone, git-filter-repo 2.47.0, no force. Twenty-two retained commits from 126 mappings, 21 selected tip entries, exact transformed tree parity at every retained commit and raw author/committer/time parity. Three bundles pass verification, actual mirror restoration of every advertised named ref/object and strict fsck. Custom tree-object refs are verified as objects, not assumed commit tips.

Filtered tip `74ef21600c8c829667fc62b0fbd1a1d4b030a167`. Mixed transport/FPGA source is retained only at a historical-only path in the filtered bundle, not copied into the active product. Initial target and extracted ancestry remain separate under the no-commit/no-merge instruction; a later snapshot commit alone does not connect them.

## Observed verification

| Gate | Result |
| --- | --- |
| Baseline service/RPC/virtual/capture/backend integration | 109 PASS, 18.18 seconds; existing Starlette/httpx deprecation warning |
| History tree/identity/bundles/restoration/fsck | PASS |
| Initial standalone installed units | 106 PASS, 19.67 seconds; actual spawn/deterministic capture/control shutdown, 100k NCAP, current physical/lifecycle and artifact-boundary assertions |
| Final standalone / fresh hashlocked offline sdist | 107 PASS in 55.91 seconds on final installed wheel; 107 PASS in 15.21 seconds from extracted final sdist/empty offline environment; exact selected archive, pip check and byte-identical rebuilt wheel PASS |
| Rollback package rehearsal | Isolated 0.1.1 -> reconstructed 0.1.0 -> 0.1.1 PASS: 86 original cases on baseline, 106 restored pre-final cases; version/origin/pip checks PASS. Final added inventory case passes in both final 107-case gates |
| Remote consumer focus and package selectors | 115 PASS, two optional RTL skips, existing Starlette warning in 192.46 seconds; after review fixes, 49 selector/installer/same-version/package-policy cases PASS in 198.91 seconds |
| Initial clean four-wheel runtime | PASS: candidate wheel b0fe...; final-artifact gate runs separately after README metadata and TMPDIR fix |
| Independent review | Two P2 findings reproduced, fixed and verified RED -> GREEN; closure review APPROVE, no remaining actionable findings |
| Final clean four-wheel RPC integration | PASS, 119.67 seconds against final 27338f... artifact; API is the only locally built wheel, all producers installed independently outside checkout; actual loopback RPC/worker/NCAP/unavailable physical/unsafe bind/shutdown plus existing resource/migration/CLI/domain/NCAP v1/v2 gates |
| Full Python/Contracts release | 1,256 PASS, four baseline environmental skips, one existing Starlette/httpx warning in 1,001.05 seconds; all eleven release commands PASS in 1,023.2 seconds (outer runner 1,036.07 seconds), including Hardware/Simulator/Contracts provenance, generation, OpenAPI equality, public compatibility and Python/npm parity |
| Workflows and artifact policy | Ten workflows PASS actionlint 1.7.12; five allocator/guard tests PASS; worktree/index artifact guard and 189-file Markdown scan PASS |
| Final protected inputs | Post-regression PASS: 687 retained source/data hashes, six licenses, nine cache hashes/mtimes, original HEADs/branches and empty indexes; four read-only products clean |
| Final documentation | 12 baseline/provenance/context/link tests PASS; context/189-file Markdown/artifact guards and both Git diff checks PASS |
| Owned session cleanup | PASS: final process audit found zero owned Python/Node processes; canonical cleanup with the original four-root context removed the owned M4 session and confirmed absence; durable release/history archives retained |

The original seven Hardware test modules retain their assertion/raises AST nodes. Test-only source injections/root codegen are removed; pytest prepends only the test directory so the existing helper imports and module-level spawn probe remain importable, while runtime provenance must resolve to installed wheels. Hardware's new unit coverage checks exact runtime inventory, source/editable/tampered/same-version archive rejection and installed NCAP/RPC behavior. Test drivers remain software fixtures, not electrical capability evidence.

Remote commands are `python scripts/check_release.py --group python --group contracts` and `python scripts/check_contract_package.py`, after exact manifest selection and canonical external allocation. Target uses locked `--no-index --require-hashes --only-binary=:all:` dependency installation, separate digest-verified first-party wheels, no-isolation build, force installation, `check_installed.py --wheel ABSOLUTE_WHEEL`, external-CWD `python -I -B -m pytest`, and a wheel rebuild from the extracted sdist. No package test depends on source in another repository.

Four root-suite skips retain the baseline prerequisites: two Windows file-symlink privileges and optional slang/Icarus FPGA tools. Directory-junction checks still execute. The 86 original Hardware cases now run in the standalone product rather than being double-collected from frozen Remote source; all original assertions remain. No baseline or assertion was weakened to satisfy extraction.

Independent review identified a strict-provenance gap where Remote allowed an extra correctly RECORD-owned module when no manifest was selected. The negative probe returned ten modules; a dedicated RED regression now requires exactly the nine approved runtime modules. Review also reproduced three failures for inherited checkout TMP/TEMP/TMPDIR paths: both installer pip calls now receive a copied environment forced to an allocator-owned child/cache, and package children override all three temp variables. Final 49-case GREEN and an independent before/after inventory probe close both P2 findings. Unexpected source/API dependencies or safety behavior changes were not found.

## Safety and capability boundary

This extraction preserves local-only bind validation, the separate service process, explicit spawn pool, four reserved RPC control threads, Stop generation invalidation and orderly worker shutdown. Per-experiment virtual sessions keep the registered backend snapshot. Legacy remains the default; ngspice remains unavailable without fallback.

Physical start still requires valid current driver/profile/capabilities, fresh scan/safety, matching station/experiment plan, observed endpoint/resource coverage, applied routing, guarded power/watchdog policy and armed capture. Malformed evidence and stale/revoked profiles fail closed. Missing driver/serial/USB-SPI reports unavailable, zero physical slots/instrument channels and hardware_applied=false. Remote retains acknowledged safe-release versus quarantine and persisted leases; no restart command replay, new driver or electrical protection claim is introduced.

## Artifact handoff and compatibility

Reviewed local set: Hardware 0.1.1, Contracts 1.0.1, Simulator 0.2.0. No version is published. The reconstructed 0.1.0 baseline wheel is an isolated rollback input, not a previous hosted release.

Durable manifest: `C:/Users/trann/.codex/visualizations/2026/10/24/01a16c1e-02ba-7253-9226-6f4a43582df4/migration-release-artifacts/m4-hardware-0.1.1-reviewed-20261027-JmKDlg/artifacts.json`.

| Artifact | SHA-256 |
| --- | --- |
| Hardware 0.1.1 wheel, 29,225 bytes | `27338f44251dafd3a35cbba2883b7fba2d85bfcf7dec73e6fdda3fcb74e8c48c` |
| Hardware 0.1.1 sdist, 71,991 bytes | `4888448ec20a38e2a60fe6903dbd43e9db383530a3895ab167edfe3ed89d3739` |
| Reconstructed 0.1.0 rollback wheel, 13,623 bytes | `7180a56192e0232aa75c115ebfdf22476996d45597ff65aac665d63591534bf6` |
| Contracts 1.0.1 wheel | `ab865f991950fb575d86d3b6bb23646864c706b64c3d0305ba4b9ca9d0237c79` |
| Simulator 0.2.0 wheel | `fc7930662e49c5751980154261e5c39448c63fde1cb5da9a8f509b82b1dd2e62` |

All 42 target source files match the selected sdist byte-for-byte. Source fingerprint `a5fbb69abbef75ccab6342d64a490791b6d745aa0d0e1181fb41323adb6aa16b` uses `sha256-path-lines-v1`: sorted UTF-8 `sha256  relative-path` lines with LF. The leaf's `86a0f5...` fingerprint uses compact sorted JSON over the same 42 path/hash pairs; it is a different encoding, not a content discrepancy. Build epoch `1793107095` comes from the recorded Remote commit. The durable handoff includes the exact 22 hashlocked third-party Windows AMD64/Python 3.14 wheels and their digests; other platforms require their allowed wheels. Wheel byte reproducibility is proved; gzip/tar timestamp determinism is not claimed.

Because commits are prohibited, evidence is for fresh exact source exports/sdists and installed artifacts, not a fabricated authored commit or future committed clean checkout. The shared API venv now uses the final Hardware wheel from its durable path; it does not depend on an expiring test-session path.

| Consumer | Required producer |
| --- | --- |
| Remote integration/browser/FPGA transport compatibility | Hardware exactly 0.1.1, Contracts exactly 1.0.1, Simulator exactly 0.2.0 |
| Hardware 0.1.1 | Contracts 1.0.1, Simulator 0.2.0, grpcio 1.84.0, protobuf 7.36.2, jsonschema 4.26.0 |
| API runtime | Contracts/Simulator and RPC client dependencies; no Hardware implementation dependency |

Windows Python 3.14.4 is the local runtime. Hosted Ubuntu/Python 3.12/Node 22 and minimum Python 3.11 execution are NOT_RUN here. Browser, PostgreSQL, target Mini PC deployment, real FPGA/driver and electrical promotion require separate evidence. Prior M2 browser disposition and OPEN-ABI/OPEN-FRESHNESS/OPEN-HARDWARE remain unchanged.

Offline closure evidence applies to the standalone Hardware runtime/build/test
environment. The Remote four-wheel gate retains its existing API dependency
resolution mechanism; it proves a fresh external installation and actual runtime,
not an offline hashlocked closure for every API transitive dependency. That
broader release-set requirement remains with Remote integration/M6. The retained
FPGA workflow still uses its existing Python 3.13/tool installation; local M4
does not claim hosted execution on that interpreter either.

## Rollback and preservation

Stop admission, drain/Stop through normal acknowledged safe cleanup or quarantine, then restore the prior matching Hardware/Contracts/Simulator set and consumer pins and restart the service. Preserve database, documents, captures, leases and quarantine. No schema conversion, automatic downgrade or Start replay is needed. An isolated package rollback will be reported separately from live deployment rollback.

The initial inventory records 688 retained source/data files, six licenses and nine pre-existing pytest cache files. One intentional update within that inventory is `contracts/README.md`, the current Remote consumer setup guide, removing obsolete editable Simulator/Hardware installation. All canonical schemas/catalogs, frozen Hardware files and the remaining 687 source/data files are protected. The final post-regression audit confirms their hashes, all six licenses, nine cache hashes/mtimes, original HEADs/branches and empty indexes; Contracts/Simulator/Interface/FPGA remain clean.

Ignored-output inspection found one newly materialized `.build/contracts-tools/allocator.json`. The initial generic JSON scan flagged it; content review establishes this is the documented compilation metadata for the canonical DEV allocator, not diagnostic output. Its name/version and actual Node hash match the pinned `7c42c4fd171ed861b365f08501f3c765282d6bba2dcd6430c9677cddd1abe345`. After recording that exact verified compilation entry separately, 214 diagnostic/data/media candidates have no modification since session creation. No broad JSON exemption or evidence deletion was introduced. Initial target test bytecode caches caused by Python `-I` ignoring PYTHONDONTWRITEBYTECODE were compilation output; standard commands now use explicit `-B`, and the leaf removed only its newly created cache files.

The final post-regression ignored-output audit again found no modified diagnostic candidates. Raw history/build/test/RED-GREEN/provenance/archive/rollback logs and inventories were inspected before cleanup; no screenshots or visual/physical verification were produced in M4. The final process audit found zero owned Python/Node processes. Canonical cleanup with the original owner and Remote/Hardware/Contracts/Simulator context removed only the owned M4 session and confirmed its absence. Durable release/history archives remain outside that deleted target. No subsequent milestone or Git publication action was performed.
