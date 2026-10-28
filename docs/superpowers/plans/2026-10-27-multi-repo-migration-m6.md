# Multi-Repo M6 Release Implementation Plan

> **For agentic workers:** Use subagent-driven-development and verification-before-completion. This ledger records execution of the explicitly authorized six-repository release, without changing historical M0–M5 reports.

**Goal:** Repair the M2 browser failure, complete artifact-only integration, and publish verified 0.1.1 products on all six master branches.

**Architecture:** Contracts owns shared schemas/catalogs/protocols and public SDK; Interface owns Web/editor/browser assertions; Simulator owns replaceable simulation backends; Hardware owns local RPC/stations/transports; FPGA owns RTL/scaffold/toolchain; Remote owns FastAPI, persistence, scheduler, deployment and integrated acceptance.

**Tech Stack:** Python, TypeScript/Vue/Three.js, Git, GitHub Releases/Actions, PostgreSQL, pinned RTL tools.

**Spec:** User attachment `Pasted text.txt`, received 2026-10-27, together with current `docs/ARCHITECTURE.md` and `docs/VERIFICATION.md`.

**Current execution scope, 2026-10-28:** the later instruction “Không cần commit và push và merge” stops further Git promotion/publication. Continue source repair, independent build/test and working-copy handoff; keep new changes uncommitted. Earlier authorized commits and refs are preserved. Master/tag/publication/branch-cleanup steps below describe the original target and are not executed under this revised scope. The Windows 4cbbee baseline passed; the later Linux run recorded 18 failures before cancellation, so hosted browser acceptance remains unresolved while working-copy fixes are tested.

## Global constraints

- All six product versions and release tags are exactly 0.1.1 / v0.1.1. DEV tooling remains 1.0.0a1; schema, graph, RPC, NCAP and FPGA protocol versions retain their meaning.
- Ordinary history merges only; no force-push, published history rewrite, reset/clean, license/visibility changes, production deployment or board programming.
- Preserve source assets, golden baselines, protected bytes, historical reports and frozen reference trees. Frozen sources cannot supply supported runtime/build/test/release dependencies.
- Immutable artifact URLs/digests; exact dependency versions; no sibling source or editable producer installs. API registrations remain OpenAPI operation authority.
- Shared allocator context includes all six repositories and Git families. Diagnostics and test state originate externally. Browser uses a complete physical owned runtime copy.
- Release gates must execute freshly; blocked/unrun gates cannot count as PASS. The original merge/push/publication/branch-cleanup authorization is superseded by the current scope override above.

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
- [ ] Publish durable 0.1.1 dependency artifacts; configure exact authenticated consumer downloads/CI.
- [ ] Build Interface source/static and FPGA scaffold from committed revisions; run mandatory native browser/RTL gates.
- [x] Run Remote contracts, python, web, postgres, browser and package groups from clean artifact-only Windows environment after inspecting the 18-command plan; subsequent Linux browser failure remains an open acceptance gate.
- [x] Rehearse exact artifact rollback with matching database/capture backup and safe lifecycle semantics.
- [x] Review source corrections and update canonical docs/onboarding/deployment and verification evidence; final documentation/cleanup handoff checks are recorded separately.
- [ ] Integrate verified revisions into all six master branches, publish v0.1.1 tags/releases and verify hosted master CI.
- [ ] Prove migration/filtered tips reachable from origin/master and verified backup; delete only those merged migration branches.
- [ ] Leave six clean master checkouts synchronized to origin/master; inspect and clean owned diagnostics; hand off exact release/CI/master identities.

## Initial state and rulings

All six checkouts were clean. Remote tip: `40ad3a62a046cf72f17e5be0d693ecd78e8c7fe4`; Contracts: `1f4388252a0711eae0a167b95964372453e811d2`; Interface: `24968de2803cf69c7c5159f649f21ec0c32f8b5e`; Simulator: `96a57e0f42a114c4f5b4675411c625415019f907`; Hardware: `2ddd0801e11207afa7fdfbe997392626dece0cd1`; FPGA: `2a263190ef622319a15e45ef261919107fcfd96f`.

Initial ruling, before the later scope override: execute the then-authorized release workflow without asking again for commit/merge/push permission; protection and acceptance gates still apply. The subsequent instruction stops further Git promotion and publication.

Ruling: Retain Remote's unrelated `Multi-Repo` and `refactor` worktrees/branches — deletion is not authorized for unrelated work — these do not supply the supported release path.

Ruling: Use the local Git credential identity for GitHub REST operations unsupported by the connector — connector repository lookup returns 404, while the existing Git identity has explicit access — credentials remain in memory only.

## Progress

History bundles/mappings and initial backups were restored and verified, all five producer histories were joined normally, and the six 0.1.1 products were built from recorded commits. Remote's independent 771f4c2/4cbbee Windows baseline passed all 18 release commands and registered rollback verification. The later hosted Linux browser run retains its 18 failures before cancellation. Confirmed text-loss defects now have uncommitted corrections in six forms, 13 regression tests, independent cross-reviews and fresh Windows/Linux validation: 1,461 type/unit tests plus nine bootstrap checks on each, AST/E2E types and all three production entrypoints PASS. The exact expanded 570-file candidate then passed the standard original-order Linux suite: 57 mandatory PASS, one optional historical NOT_RUN, zero failures, in 2,191.495 seconds on local 8 CPU / 8 GiB. Current code hashes match that candidate. Hosted execution of the unpushed correction and fresh committed release binding remain NOT_RUN. Further Git promotion/publication is stopped by the user's latest instruction; current verification scopes and limits are in the M6 report.
