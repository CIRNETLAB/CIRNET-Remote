# M2 — Extract net-Circuit-Interface execution ledger

Authorization: user requested M2 only on 2026-10-24 (Asia/Saigon), preserving features/history, versioned package consumption, CI and fresh-install verification. No stage, authored commit, merge, push, deploy, M3 or deletion of retained source is authorized. [Approved M0](2026-10-24-multi-repo-migration-m0.md) and [Lab-First v3.1](../../ARCHITECTURE.md) govern.

Source base: `745077403f233790bdb6781c36d6502feca01642`, clean user-committed M1. Interface initial base: `0ac420fc4090fe27ebc497579c28d0852f3f3c62`, clean README/LICENSE only. Contracts source currently `1f4388252a0711eae0a167b95964372453e811d2`; reviewed artifacts remain immutable Contracts1.0.1 and DEV1.0.0-m1.0/1.0.0a1. Approved local execution branches: `codex/m2-interface-consumer` and `codex/m2-interface-extract`; original HEADs unchanged.

## Tasks

- [x] T1: fresh baseline, Git/ignored-output/source asset inventory and exact artifact input verification.
- [x] T2: preserve Interface path history on fresh clone; verified full/extracted bundles, blob/mode equality and author/committer mapping.
- [x] T3: lift the complete Web product to standalone Interface; replace generated runtime imports/data/fixtures with pinned package exports, retaining application semantics and historical descriptors.
- [x] T4: Node-only digest-verified package bootstrap and DEV adapter; exact Contracts test resources, no sibling source or canonical generator fallback.
- [x] T5: separate Interface browser/Vite launcher from Remote backend/RPC lifecycle; repair camera/depth containment and preserve exact browser origin/restart protocol.
- [x] T6: standalone and integrated CI, policy gates, asset/baseline provenance, model/documentation references and versioned product release metadata.
- [ ] T7: verification executed on fresh export/install with no build caches/sibling source; unit/type/boundary/multipage build, compatibility/API integration and independent review pass. Full browser acceptance remains open for the gallery timeout reproduced on original source.
- [x] T8: exact diffs/artifact hashes, rollback, verified source archives, guarded cleanup and short proposed commits; stop before M3.

## Rulings and shared interfaces

- Ruling: reuse the existing source/destination checkouts on two new local milestone branches, with candidate/history preparation isolated externally. The user wants to commit current source personally, as in M1. No main/master implementation, authored migration commit or additional worktree is created; cost if wrong is branch/directory rework, without history/data loss.
- Ruling: all scratch/diagnostics/briefs use the shared external allocator rather than skill-local `.superpowers` directories. This follows repository AGENTS policy and its explicit no-source-output rule. Source Markdown ledgers/reports remain permanent.
- Ruling: Python/npm Contracts1.0.1 stays immutable. Missing public test examples and canonical parity inputs are read from its digest-verified sdist through a strict Node-only allowlist; browser code only imports public npm exports. A changed contract/resource release is not invented during Interface extraction.
- Ruling: package manifest/lock point at ignored, versioned `.artifacts` tarball caches filled only by reviewed digest-verified artifact bootstrap. This permits a real fresh install before hosted publication/ACL exists and introduces no filesystem source dependency. Missing artifacts fail clearly; no latest/source fallback.
- Ruling: generated source/data may remain in original Remote as frozen M1 references. Interface uses packages; application validation, normalization, electrical/geometry semantics, historical part lookup and renderer behavior remain Interface-owned. No schema regeneration is added to Interface.
- Ruling: Remote owns API/RPC/backend startup/restart/shutdown. Interface owns Vite/browser lifecycle and receives an explicit API target, owned restart-data directory and inherited allocator context. Browser origin stays `http://127.0.0.1:14173`, preserving existing exact Origin/cookie/CSRF/WS behavior.
- Ruling: original root artwork and global docs stay Remote-owned. Interface may retain exact labelled provenance snapshots of supplied icon originals and historical measured implementations; assets/baselines in Remote are not moved/deleted or regenerated.
- Ruling: fresh verification uses an exact uncommitted source export/overlay in a new directory with no ignored outputs or sibling implementations. A Git checkout of the future migration commit cannot exist until the user commits; do not fabricate an authored snapshot commit or call the uncommitted export a clean committed revision.
- Ruling: filtered ancestry remains in a verified durable bundle until a connecting merge/commit is separately authorized. Do not reset target to filtered history or hide its initial commit.

Shared interface checks: runtime SDK entrypoints and JSON fixture delivery must match the test bundler; standalone allocator bootstrap must precede every output-producing tool; E2E resource helpers must share exact allowlisted names; remote orchestrator and Interface launcher must agree on explicit target/admin/restart protocol; byte-pinned artwork/benchmark source survives root path changes without changing measurements.

## Progress

Preflight confirms source124 commits, nonshallow; Web527 tracked files; seven frontend policy files. All22 supplied-icon hashes and both delivered instrument GLB hashes match their manifests. Extraction starts from all527 tracked Web files; reviewed final source contains554 files plus a late Markdown handoff companion. No passing result is inferred from M1 history.

Fresh source baseline: 1,435 Web tests PASS, 0failures in184.518s. No domain/source asset change was required for baseline. History preflight found pre-existing invalid `refs/remotes/origin/HEAD` in source and destination; original fsck is recorded FAIL for that ref, not silently repaired. Verified bundle restoration/reachable-object checks and exact selected blob/mapping checks govern extraction safety.

The actual destination now contains the standalone product and builds successfully. Candidate and fresh export each pass1,443 unit tests; fresh npmci installs92 packages offline. Remote Contracts/API release group passes9 commands with572 tests and2 Windows file-symlink privilege skips; migration/harness focused coverage passes56 tests. The first full browser invocation exposed external E2E runtime bundles retaining newly introduced SDK bare imports. The owned outer runner completed API/RPC shutdown after the controlled stop. A shared package-bundling helper now passes five actual outside-product subprocess regressions; final tooling coverage passes18 tests. Remote's reviewed custom-output session regression is fixed, with8 Node tests and2 actual default/custom lifecycle cases passing.

The completed full browser run records54 PASS,1 SKIP,1 FAIL in56.2minutes, followed by API shutdown exit0. An independent original-source product (90 original packages, original catalogs and build) reproduces the same10s gallery predicate timeout at the sixth expanded-graph ADD after five complete resource-release cycles. The skip is absent retained pre-fix native WebGL evidence. No gallery/recovery algorithm or browser assertion/timeout was changed. Browser acceptance remains open; history ancestry connection, future committed checkout, hosted CI/private publication and deployment require their separate actions. Final evidence, exact artifacts and rollback are recorded in the [M2 handoff](../../verification/2026-10-24-multi-repo-migration-m2.md).

Closure: both owned diagnostic sessions were guarded-cleaned and physically absent by2026-10-24T12:10:11Z, after evidence inspection and durable release/history digest verification. T7 native browser acceptance remains open for the reproduced pre-existing timeout. No commit/stage/merge/push/deploy or M3 action occurred.
