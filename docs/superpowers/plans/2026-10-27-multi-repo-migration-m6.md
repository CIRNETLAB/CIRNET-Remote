# Multi-Repo M6 Release Implementation Plan

> **For agentic workers:** Use subagent-driven-development and verification-before-completion. This ledger records execution of the explicitly authorized six-repository release, without changing historical M0–M5 reports.

**Goal:** Repair the M2 browser failure, complete artifact-only integration, and publish verified 0.1.1 products on all six master branches.

**Architecture:** Contracts owns shared schemas/catalogs/protocols and public SDK; Interface owns Web/editor/browser assertions; Simulator owns replaceable simulation backends; Hardware owns local RPC/stations/transports; FPGA owns RTL/scaffold/toolchain; Remote owns FastAPI, persistence, scheduler, deployment and integrated acceptance.

**Tech Stack:** Python, TypeScript/Vue/Three.js, Git, GitHub Releases/Actions, PostgreSQL, pinned RTL tools.

**Spec:** User attachment `Pasted text.txt`, received 2026-10-27, together with current `docs/ARCHITECTURE.md` and `docs/VERIFICATION.md`.

## Global constraints

- All six product versions and release tags are exactly 0.1.1 / v0.1.1. DEV tooling remains 1.0.0a1; schema, graph, RPC, NCAP and FPGA protocol versions retain their meaning.
- Ordinary history merges only; no force-push, published history rewrite, reset/clean, license/visibility changes, production deployment or board programming.
- Preserve source assets, golden baselines, protected bytes, historical reports and frozen reference trees. Frozen sources cannot supply supported runtime/build/test/release dependencies.
- Immutable artifact URLs/digests; exact dependency versions; no sibling source or editable producer installs. API registrations remain OpenAPI operation authority.
- Shared allocator context includes all six repositories and Git families. Diagnostics and test state originate externally. Browser uses a complete physical owned runtime copy.
- Release gates must execute freshly; blocked/unrun gates cannot count as PASS. Merge/push, release publication and merged migration branch deletion are explicitly authorized by the user.

## Review focus

- Repeated graph imports must complete the sixth gallery add/remove cycle without extending timeouts or reducing assertions.
- Downgrade normalization must install exact 0.1.1 payloads even when a higher version is cached/installed.
- Private artifact consumers in both GitHub namespaces must authenticate with their actual consumer identity.
- Joining filtered histories must preserve the current product tree and make both prior tips reachable.
- Clean builds must fail if an artifact is missing rather than finding retained frozen/sibling sources.

## Execution checklist

- [x] Read user release scope; verify six initial checkout tips and clean indexes.
- [ ] Verify external backups, filtered history bundles/mappings and isolated restoration.
- [ ] Inspect protection, release/tag collisions, credentials and CI permissions for six repositories.
- [ ] Reproduce and fix gallery failure in Interface; run original assertions with a real browser.
- [ ] Normalize producer and consumer product metadata/pins to 0.1.1; preserve protocol versions and historical evidence.
- [ ] Replace frozen-source fixtures/assertions and directory-dependent tooling with installed artifact/resource coverage.
- [ ] Connect extracted ancestry on each product migration branch without changing its product tree.
- [ ] Commit producer changes, build independently from committed clean checkouts, record hashes/provenance and standalone tests.
- [ ] Publish durable 0.1.1 dependency artifacts; configure exact authenticated consumer downloads/CI.
- [ ] Build Interface source/static and FPGA scaffold from committed revisions; run mandatory native browser/RTL gates.
- [ ] Run Remote contracts, python, web, postgres, browser and package groups from clean artifact-only environment; inspect show-plan first.
- [ ] Rehearse exact artifact rollback with matching database/capture backup and safe lifecycle semantics.
- [ ] Review final changes, update canonical docs/onboarding/deployment and verification evidence.
- [ ] Integrate verified revisions into all six master branches, publish v0.1.1 tags/releases and verify hosted master CI.
- [ ] Prove migration/filtered tips reachable from origin/master and verified backup; delete only those merged migration branches.
- [ ] Leave six clean master checkouts synchronized to origin/master; inspect and clean owned diagnostics; hand off exact release/CI/master identities.

## Initial state and rulings

All six checkouts were clean. Remote tip: `40ad3a62a046cf72f17e5be0d693ecd78e8c7fe4`; Contracts: `1f4388252a0711eae0a167b95964372453e811d2`; Interface: `24968de2803cf69c7c5159f649f21ec0c32f8b5e`; Simulator: `96a57e0f42a114c4f5b4675411c625415019f907`; Hardware: `2ddd0801e11207afa7fdfbe997392626dece0cd1`; FPGA: `2a263190ef622319a15e45ef261919107fcfd96f`.

Ruling: Execute the newly authorized release workflow without asking again for commit/merge/push permission — the current user instruction expressly supersedes historical no-push handoffs — protection and acceptance gates still apply.

Ruling: Retain Remote's unrelated `Multi-Repo` and `refactor` worktrees/branches — deletion is not authorized for unrelated work — these do not supply the supported release path.

Ruling: Use the local Git credential identity for GitHub REST operations unsupported by the connector — connector repository lookup returns 404, while the existing Git identity has explicit access — credentials remain in memory only.

## Progress

Preflight in progress. Native browser repair, producer version normalization, and history restoration assessment delegated with separate file ownership. Root coordinates Remote integration, release artifacts, CI and Git promotion. Fresh results will be recorded in the M6 verification report.
