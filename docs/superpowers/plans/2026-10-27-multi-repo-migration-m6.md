# Multi-Repo M6 Release Implementation Plan

> **For agentic workers:** Use subagent-driven-development and verification-before-completion. This ledger records execution of the explicitly authorized six-repository release, without changing historical M0–M5 reports.

**Goal:** Complete M2/browser and artifact-only release acceptance under CIRNETLAB/CIRNET-*; integrate reviewed changes on all six masters while preserving existing immutable 0.1.1 release history and bytes.

**Architecture:** Contracts owns shared schemas/catalogs/protocols and public SDK; Interface owns Web/editor/browser assertions; Simulator owns replaceable simulation backends; Hardware owns local RPC/stations/transports; FPGA owns RTL/scaffold/toolchain; Remote owns FastAPI, persistence, scheduler, deployment and integrated acceptance.

**Tech Stack:** Python, TypeScript/Vue/Three.js, Git, GitHub Releases/Actions, PostgreSQL, pinned RTL tools.

**Spec:** User attachment `Pasted text.txt`, received 2026-10-27, together with current `docs/ARCHITECTURE.md` and `docs/VERIFICATION.md`.

**Current checkpoint:** six immutable 0.1.1 releases remain published; history backup and exactly 11 remote / 16 local merged migration branches are verified complete under a separate explicit user decision. Rename-source integration, final hosted/native acceptance and the final current-source handoff remain open. See [the current M6 disposition](../../verification/2026-10-27-multi-repo-migration-m6.md#current-cirnet-rename-and-release-disposition).

**Historical execution scope, 2026-10-28:** the later instruction “Không cần commit và push và merge” stops further Git promotion/publication. Continue source repair, independent build/test and working-copy handoff; keep new changes uncommitted. Earlier authorized commits and refs are preserved. Master/tag/publication/branch-cleanup steps below describe the original target and are not executed under this revised scope. The Windows 4cbbee baseline passed; the later Linux run recorded 18 failures before cancellation, so hosted browser acceptance remains unresolved while working-copy fixes are tested.

**Historical local continuation:** the user requested completion of the remaining local artifact rebuild and clean-install work using this original checklist. At this continuation's start, Remote was clean at user-provided commit `82ca15bec250894c39c2849ab4a3eaaeb7712b05`, Interface at `7a266d15b510d840ad3146515a3699760564ed32`; the other four recorded producer tips were clean. Six independent clean temporary clones supplied the new builds. New consumer-tool/documentation changes remain uncommitted and are recorded here and in the existing M6 verification report, without a separate task Markdown file. Git promotion remains stopped.

**Historical resumed publication scope, 2026-10-28:** the user explicitly requested continuing the four publication/master/branch-cleanup items, superseding the earlier stop for those operations. Commit reviewed release bindings/fixes, push ordinary fast-forward migration/master updates, publish exactly `v0.1.1` for all six private repositories, verify hosted master CI, preserve final recoverable history bundles, and delete only proven merged migration branches. The user also confirmed the selected-six-repository fine-grained Contents-read CI secret configuration; hosted authenticated downloads remain to be verified. The existing local verification and older stop records retain their historical scope. No deployment, board programming, force-push, license/visibility change or unrelated-worktree cleanup is authorized.

## Current rename scope, 2026-10-29 (Asia/Saigon)

The new user attachment authorizes source/tests/CI/current documentation and
manifest updates, canonical origins, commits and ordinary master pushes for all
six repositories. The user confirmed: “Đúng, dùng CIRNETLAB/CIRNET-* cho cả sáu repo”.
This supersedes the earlier local-only stop for the newly authorized work.
Local checkout directories, Python/npm/import/environment identifiers, schema
URIs, protocol versions, LICENSE, assets, baselines and historical records remain
preserved. No deployment, board programming, force-push, history rewrite,
visibility change or automatic version change is authorized.

All six repositories now have canonical `https://github.com/CIRNETLAB/CIRNET-<product>.git`
origins. The organization remains account ID 333715068; repository IDs are
unchanged. Final-name/31-asset audit SHA-256
`1cd3c5d388d727b70b33c773f8f8497a419449f3acba8c3437cd59c0c996d918`;
origin update receipt `5381dce919166a231176bbd049127e6d07e445850a1cba81b4b508faba9d2866`;
60 existing CI URL variables updated/read back, receipt
`5b320afedbf6feaf0c17fc85aa53bf738872c750522235a7e843a3e43fcc6c38`.
The current Git system manifest changes only 26 repository/asset URL fields,
retaining all 15 selected asset IDs, filenames, versions, original build sources
and SHA-256 values. Historical immutable notes/system-manifest bytes retain their
old namespace; coherent historical/current provenance is validated explicitly.

At the verified four-producer promotion checkpoint, Contracts `41dd34510bf39b9fe6093738965f81ac7d64f2b4`,
Simulator `dfa5fbe1ce5ff7fe4f3a5f033e419adcf656a488`, Hardware
`4d7e75389d3671476e2aabbf0359681f057e9704` and FPGA
`0ccca05baafc85289459ecfd20c8f4a163a8596f` are pushed master commits with actual
exact-head hosted CI PASS (runs 40742625944, 40742637237, 40742650852 and
40742663529 respectively, observed 2026-10-28 18:20 UTC). Four complete pre-push
bundles were restored/fsck-checked; promotion receipt
`a30b302afd0ddf5025bd337da25da793b1edd8af5c79e94c250265fb3e5b49d2`.
Interface's 14-file rename is also pushed and synchronized at
`631d41b36f0cdbaf1aafe6510baf2ddd514f306c`; hosted Standalone Interface
[40744519633 PASS](https://github.com/CIRNETLAB/CIRNET-Interface/actions/runs/40744519633)
is at this exact head. Its complete pre-push bundle was restored/fsck-checked,
with the original tag preserved; promotion receipt
`17335b36bb3027a49fa41ed5b005f10df4772bec4357a9c0ba658a9e36488da7`.
All five producer masters now have exact-head hosted CI PASS. The 1,461
unit/type tests, 22 script tests and build also pass locally. The external
performance memo experiment was not adopted: one PSU observation was 61s to 64s
with 0.87% hits and exact parity; it is not native acceptance. Remote's 132 focused manifest/release tests pass on the
working copy; final committed integrated/hosted release groups remain separate.

Contracts' clean committed export passes 500 primary tests, one CI test,
15 Node allocator tests and two Python bridge tests, deterministic generation,
public compatibility, wheel/sdist/public SDK, independent sdist-wheel rebuild and
isolated installed resources/RPC/OpenAPI probes. Its wheel comparison contains
92 CRLF-only members plus RECORD changes; npm changes only README/package metadata.
FPGA's clean committed export passes 19 tests, mandatory pinned RTL with both
PASS markers, and byte-identical repeated source builds; its candidate changes
five source paths plus identity while preserving LICENSE, all RTL and original
migration provenance. These candidates are **UNPUBLISHED** and cannot silently
replace immutable 0.1.1 bytes. The report records complete comparisons/digests.

Hosted Windows baseline run `40725519551` at `23ca0827` is **CANCELLED / NOT_PASS**
at the unchanged 90-minute job envelope. The inspected partial log records
eight failure headers and 55 of 58 cases started; no final JUnit exists, so it
is not a complete 58-case result or acceptance of current rename sources. Receipt
`2effc3c6124ffee4d77dfcec4fd82f478a21a083ff150dad7855e9e7d2dd22ee`.
Earlier Linux failures and separately scoped local 57-pass results remain
historical. Browser correctness, assertions, DPR, deadlines and retries remain
unchanged; native/performance acceptance is still open.

### Conditional completion checklist for the rename

- [x] Verify six final GitHub identities/public immutable releases and update six origins with recoverable config backups.
- [x] Rebind/read back 60 existing selected-artifact CI URL variables; preserve unrelated variables, secrets and all artifact IDs/digests.
- [x] Commit/push all five reviewed producer rename changes, verify their exact-master hosted CI and complete Contracts/FPGA committed-source gates/comparisons.
- [x] Preserve completed six-repository history backups and exact 11 remote / 16 local merged-branch cleanup, separately from native acceptance.
- [ ] Finish Remote source review and final committed clean-build/integration/browser evidence without weakening existing tests.
- [ ] Complete/review the six-product candidate comparison and selected-artifact-only clean installation using canonical URLs and exact pins.
- [ ] If new bytes/tag movement are required, obtain the user's release decision after concrete build/rollback comparison; never overwrite immutable releases or select 0.1.2 automatically.
- [ ] Finish the normal Remote master push, verify its exact live master identity and corresponding hosted CI, then complete the current recoverable handoff and owned-session cleanup.

The existing immutable 0.1.1 release may instead be revalidated unchanged, with
its original tag/source/bytes explicitly retained. A new master commit does not
make an old artifact a build from that commit. Full M6 completion remains open.

## Global constraints

- All six product versions and release tags are exactly 0.1.1 / v0.1.1. DEV tooling remains 1.0.0a1; schema, graph, RPC, NCAP and FPGA protocol versions retain their meaning.
- Ordinary history merges only; no force-push, published history rewrite, reset/clean, license/visibility changes, production deployment or board programming.
- Preserve source assets, golden baselines, protected bytes, historical reports and frozen reference trees. Frozen sources cannot supply supported runtime/build/test/release dependencies.
- Immutable artifact URLs/digests; exact dependency versions; no sibling source or editable producer installs. API registrations remain OpenAPI operation authority.
- Shared allocator context includes all six repositories and Git families. Diagnostics and test state originate externally. Browser uses a complete physical owned runtime copy.
- Release gates must execute freshly; blocked/unrun gates cannot count as PASS. The current rename scope above governs Git promotion; completed publication/history-only cleanup do not satisfy pending current-source/hosted/native acceptance.

## Review focus

- Repeated graph imports must complete the sixth gallery add/remove cycle without extending timeouts or reducing assertions.
- Downgrade normalization must install exact 0.1.1 payloads even when a higher version is cached/installed.
- Current artifact consumers use CIRNETLAB/CIRNET-* numeric URLs and their actual intended identity; historical namespace provenance remains preserved.
- Joining filtered histories must preserve the current product tree and make both prior tips reachable.
- Clean builds must fail if an artifact is missing rather than finding retained frozen/sibling sources.

## Execution checklist

- [x] Read user release scope; verify six initial checkout tips and clean indexes.
- [x] Verify external backups, filtered history bundles/mappings and isolated restoration.
- [x] Inspect protection, release/tag collisions, credentials and CI permissions for six repositories; minimum-scope credential acceptance remains unverified.
- [x] Reproduce and fix gallery failure in Interface; original ten-cycle assertions pass in complete Windows baseline and current Linux local full suite. Old hosted failures retain their separate scope.
- [x] Normalize producer and consumer product metadata/pins to 0.1.1; preserve protocol versions and historical evidence.
- [x] Replace frozen-source fixtures/assertions and directory-dependent tooling with installed artifact/resource coverage.
- [x] Connect extracted ancestry on each product migration branch without changing its product tree.
- [x] Before the scope override, commit producer changes and build independently from recorded clean revisions; preserve their hashes/provenance and standalone tests. New working-copy corrections remain uncommitted.
- [x] Publish durable immutable 0.1.1 artifacts under the user's explicit publication-now decision; authenticated clean-install receipt and 17 anonymous downloads PASS. Native CI is not counted PASS.
- [x] Build Interface source/static and FPGA scaffold independently from the recorded committed revisions; verify repeated artifact identities and mandatory pinned RTL execution.
- [x] Historical selected-artifact local native browser gate: 57 mandatory PASS, one optional historical NOT_RUN, zero failures, in 35.7 minutes. Standard order, one worker, zero Playwright retries and original assertions/deadlines were preserved. The earlier interrupted 43/58 run and failed gallery timeout remain separate evidence.
- [x] Rebuild the current six-product 0.1.1 local set, retain exact commits/digests and verify a new artifact-only clean install. Fifteen newly built artifacts and two actual clean installations passed; the old published/draft selection remains separate and unchanged.
- [x] Verify the current clean artifact-only Remote Contracts, Python, Web and real PostgreSQL groups after inspecting the 18-command plan: 1,410 Python PASS (two Windows symlink NOT_RUN), 1,461 Web tests plus nine bootstrap checks PASS, and 18 PostgreSQL tests PASS. Current browser/package acceptance is tracked separately above/below; the earlier complete Windows baseline remains historical evidence.
- [x] Rehearse exact artifact rollback with matching database/capture backup and safe lifecycle semantics.
- [x] Review source corrections and update canonical docs/onboarding/deployment and verification evidence; final documentation/cleanup handoff checks are recorded separately.
- [ ] PARTIAL: the original masters/tags/releases were integrated/published, but current rename-source pushes/hosted acceptance remain open. Historical Linux native failures and cancelled Windows baseline 40725519551 do not count as PASS.
- [x] Complete history-only tagged six-bundle backup/actual mirror restore/strict fsck and guarded deletion of exactly 11 remote / 16 local migration branches under the explicit user sequencing override; all 27 named tips remain reachable. Inventory a56a651c / cleanup wrapper 43585e58 do not establish native acceptance or the later rename-source final handoff.
- [ ] PENDING: complete current source/build selection, native acceptance, exact final hosted-master CI and synchronized documentation/recoverable bundle handoff; publication and earlier history cleanup alone do not complete M6.
- [x] Complete the current local installed-package gate, final documentation/source checks, inspected evidence cleanup and exact working-copy/artifact handoff without Git promotion. All mandatory local groups passed across the separately recorded invocations; five owned sessions were canonically cleaned, six HEADs/indexes preserved, and the retained manifest is bound to exact producer revisions/digests.

**Historical local-only outcome, 2026-10-28:** all currently authorized local checklist items are complete. The four publication/master/promotion/branch-cleanup rows remain explicitly NOT_RUN under the user's scope override. Final build/install/test/rollback identities, the earlier failed attempts and cleanup limits are recorded in the existing [M6 verification report](../../verification/2026-10-27-multi-repo-migration-m6.md). No new task Markdown or Git promotion was created.

## Initial state and rulings

All six checkouts were clean. Remote tip: `40ad3a62a046cf72f17e5be0d693ecd78e8c7fe4`; Contracts: `1f4388252a0711eae0a167b95964372453e811d2`; Interface: `24968de2803cf69c7c5159f649f21ec0c32f8b5e`; Simulator: `96a57e0f42a114c4f5b4675411c625415019f907`; Hardware: `2ddd0801e11207afa7fdfbe997392626dece0cd1`; FPGA: `2a263190ef622319a15e45ef261919107fcfd96f`.

Initial ruling, before the later scope override: execute the then-authorized release workflow without asking again for commit/merge/push permission; protection and acceptance gates still apply. The subsequent instruction stops further Git promotion and publication.

Ruling: Retain Remote's unrelated `Multi-Repo` and `refactor` worktrees/branches — deletion is not authorized for unrelated work — these do not supply the supported release path.

Ruling: Use the local Git credential identity for GitHub REST operations unsupported by the connector — connector repository lookup returns 404, while the existing Git identity has explicit access — credentials remain in memory only.

Local-continuation ruling: provide explicit local artifact transport with exact file names, absolute paths, SHA-256, committed producer revisions and unchanged compatibility/rollback checks. Published mode must continue requiring canonical numeric GitHub asset URLs and reject local/mixed transport. This enables the requested local install without publication or private-token provisioning. Runtime/deployment artifacts use clean committed inputs; any new integration-tool code is separately identified as uncommitted in verification exports.

## Historical progress before resumed promotion

History bundles/mappings and initial backups were restored and verified, all five producer histories were joined normally, and the six 0.1.1 products were built from recorded commits. Remote's independent 771f4c2/4cbbee Windows baseline passed all 18 release commands and registered rollback verification. The later hosted Linux browser run retains its 18 failures before cancellation. Confirmed text-loss defects now have uncommitted corrections in six forms, 13 regression tests, independent cross-reviews and fresh Windows/Linux validation: 1,461 type/unit tests plus nine bootstrap checks on each, AST/E2E types and all three production entrypoints PASS. The exact expanded 570-file candidate then passed the standard original-order Linux suite: 57 mandatory PASS, one optional historical NOT_RUN, zero failures, in 2,191.495 seconds on local 8 CPU / 8 GiB. Current code hashes match that candidate. Hosted execution of the unpushed correction and fresh committed release binding remain NOT_RUN. Further Git promotion/publication is stopped by the user's latest instruction; current verification scopes and limits are in the M6 report.
