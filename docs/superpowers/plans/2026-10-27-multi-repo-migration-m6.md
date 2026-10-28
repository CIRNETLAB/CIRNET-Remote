# Multi-Repo M6 Release Implementation Plan

> **For agentic workers:** Use subagent-driven-development and verification-before-completion. This ledger records execution of the explicitly authorized six-repository release, without changing historical M0–M5 reports.

**Goal:** Repair the M2 browser failure, complete artifact-only integration, and publish verified 0.1.1 products on all six master branches.

**Architecture:** Contracts owns shared schemas/catalogs/protocols and public SDK; Interface owns Web/editor/browser assertions; Simulator owns replaceable simulation backends; Hardware owns local RPC/stations/transports; FPGA owns RTL/scaffold/toolchain; Remote owns FastAPI, persistence, scheduler, deployment and integrated acceptance.

**Tech Stack:** Python, TypeScript/Vue/Three.js, Git, GitHub Releases/Actions, PostgreSQL, pinned RTL tools.

**Spec:** User attachment `Pasted text.txt`, received 2026-10-27, together with current `docs/ARCHITECTURE.md` and `docs/VERIFICATION.md`.

**Current publication checkpoint:** the user directed “Đừng chờ nữa hãy thực hiện publication”. All six immutable v0.1.1 releases are published and 17 anonymous downloads pass. Native master run 40705352207 remains FAIL (50 PASS / seven FAIL / one optional NOT_RUN); the other 13 required master workflows pass. Only the publication row is closed. Full M6 acceptance, final tagged backup/branch-cleanup gates and final handoff remain open. See [current release identities and limitations](../../verification/2026-10-27-multi-repo-migration-m6.md#current-publication-checkpoint). The user made all six repositories public; the agent changed no visibility or license.

**Browser CI repair in progress:** preserve the published Interface 0.1.1 source/static bytes, all 58 test bodies, original DPR/assertions/deadlines, one worker, zero retries and forbid-only. The native workflow now selects `windows-latest` and a job-wide Bash default; existing Bash environment expressions must not become PowerShell on Windows. A resource-only stdout step records actual CPU affinity, memory, OS and Python. The Chromium version, launch flags, complete owned runtime-copy guard, API/RPC lifecycle, output policy and whole-job envelope are unchanged. Same-source complete Windows/local Linux acceptance is prior evidence; the new hosted Windows job remains NOT_RUN until actual execution. Earlier hosted Linux failures remain FAIL; no Linux-native PASS is inferred. No product artifact or version changes for this CI-only candidate.

**Historical execution scope, 2026-10-28:** the later instruction “Không cần commit và push và merge” stops further Git promotion/publication. Continue source repair, independent build/test and working-copy handoff; keep new changes uncommitted. Earlier authorized commits and refs are preserved. Master/tag/publication/branch-cleanup steps below describe the original target and are not executed under this revised scope. The Windows 4cbbee baseline passed; the later Linux run recorded 18 failures before cancellation, so hosted browser acceptance remains unresolved while working-copy fixes are tested.

**Historical local continuation:** the user requested completion of the remaining local artifact rebuild and clean-install work using this original checklist. At this continuation's start, Remote was clean at user-provided commit `82ca15bec250894c39c2849ab4a3eaaeb7712b05`, Interface at `7a266d15b510d840ad3146515a3699760564ed32`; the other four recorded producer tips were clean. Six independent clean temporary clones supplied the new builds. New consumer-tool/documentation changes remain uncommitted and are recorded here and in the existing M6 verification report, without a separate task Markdown file. Git promotion remains stopped.

**Historical resumed publication scope, 2026-10-28:** the user explicitly requested continuing the four publication/master/branch-cleanup items, superseding the earlier stop for those operations. Commit reviewed release bindings/fixes, push ordinary fast-forward migration/master updates, publish exactly `v0.1.1` for all six private repositories, verify hosted master CI, preserve final recoverable history bundles, and delete only proven merged migration branches. The user also confirmed the selected-six-repository fine-grained Contents-read CI secret configuration; hosted authenticated downloads remain to be verified. The existing local verification and older stop records retain their historical scope. No deployment, board programming, force-push, license/visibility change or unrelated-worktree cleanup is authorized.

## Global constraints

- All six product versions and release tags are exactly 0.1.1 / v0.1.1. DEV tooling remains 1.0.0a1; schema, graph, RPC, NCAP and FPGA protocol versions retain their meaning.
- Ordinary history merges only; no force-push, published history rewrite, reset/clean, license/visibility changes, production deployment or board programming.
- Preserve source assets, golden baselines, protected bytes, historical reports and frozen reference trees. Frozen sources cannot supply supported runtime/build/test/release dependencies.
- Immutable artifact URLs/digests; exact dependency versions; no sibling source or editable producer installs. API registrations remain OpenAPI operation authority.
- Shared allocator context includes all six repositories and Git families. Diagnostics and test state originate externally. Browser uses a complete physical owned runtime copy.
- Release gates must execute freshly; blocked/unrun gates cannot count as PASS. The latest resumed scope above governs Git promotion; every remaining publication/CI/history-cleanup gate must pass before completion.

## Review focus

- Repeated graph imports must complete the sixth gallery add/remove cycle without extending timeouts or reducing assertions.
- Downgrade normalization must install exact 0.1.1 payloads even when a higher version is cached/installed.
- Private artifact consumers in both GitHub namespaces must authenticate with their actual consumer identity.
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
- [x] Complete the current selected-artifact native browser gate: 57 mandatory PASS, one optional historical NOT_RUN, zero failures, in 35.7 minutes. Standard order, one worker, zero Playwright retries and original assertions/deadlines were preserved. The earlier interrupted 43/58 run and failed gallery timeout remain separate evidence.
- [x] Rebuild the current six-product 0.1.1 local set, retain exact commits/digests and verify a new artifact-only clean install. Fifteen newly built artifacts and two actual clean installations passed; the old published/draft selection remains separate and unchanged.
- [x] Verify the current clean artifact-only Remote Contracts, Python, Web and real PostgreSQL groups after inspecting the 18-command plan: 1,410 Python PASS (two Windows symlink NOT_RUN), 1,461 Web tests plus nine bootstrap checks PASS, and 18 PostgreSQL tests PASS. Current browser/package acceptance is tracked separately above/below; the earlier complete Windows baseline remains historical evidence.
- [x] Rehearse exact artifact rollback with matching database/capture backup and safe lifecycle semantics.
- [x] Review source corrections and update canonical docs/onboarding/deployment and verification evidence; final documentation/cleanup handoff checks are recorded separately.
- [ ] PARTIAL: six masters and immutable v0.1.1 tags/releases are integrated/published; 13 other master workflows PASS, but native run 40705352207 FAIL (50 PASS / seven FAIL / one optional NOT_RUN), so full hosted acceptance remains open.
- [ ] NOT_RUN: final tagged backup/restore acceptance and guarded migration-branch cleanup await their unchanged gates; no migration branches deleted.
- [ ] PENDING: complete failed-native acceptance and final clean synchronized master/documentation/bundle handoff; publication alone does not complete M6.
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
