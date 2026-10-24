# M1 — Extract net-Circuit-Contracts execution ledger

**Authorization:** User requested M1 implementation on 2026-10-24, Asia/Saigon, and separately approved local branches `codex/m1-contracts-consumer` (Remote) and `codex/m1-contracts-extract` (Contracts). No stage, authored commit, merge, push, force-push, deployment, M2 or deletion of retained source is authorized.

**Plan:** [Approved M0](2026-10-24-multi-repo-migration-m0.md). Authority: [Lab-First v3.1](../../ARCHITECTURE.md), [Contracts](../../../contracts/README.md), [external verification policy](../../VERIFICATION.md).

**Source:** `295797c581acc3935f5e128fd3d23674c728ca65`. **Destination initial HEAD:** `a5b17b1c17bce6a1d097c263110b82e8a4602024`. Three uncommitted M0 Markdown files are preserved. Neither original HEAD changes when the local branches are created.

## Tasks

- [x] T1 — Record fresh application baseline and preserve history on a fresh temporary clone.
- [x] T2 — Build Contracts-only Python 1.0.1 and public TypeScript SDK 1.0.1, with pure conformance/codegen tests.
- [x] T3 — Package the shared allocator separately; explicit context/owner supports installed tooling and multiple Git families.
- [x] T4 — Populate the Contracts branch with independent source, preserving target LICENSE and history archives; no source/API/Simulator implementation dependency.
- [x] T5 — Switch Remote to immutable artifact selection, installed-wheel imports and installed-tool checks; retain old files as frozen references.
- [x] T6 — Verify final installed artifacts, generation/parity/compatibility, API/simulation/RPC integration, Web regression and documentation; record exact results and limitations.
- [x] T7 — Provide artifact handoff, diffs, rollback and proposed commit messages; stop before M2/publish/history merge.

## Rulings and interface decisions

- **Ruling: work in the two explicitly approved local branches.** The user requested source/destination branches and wants to commit current source personally. Temporary clone/staging areas isolate filtering and preparation; no additional source worktree or automatic commit is created.
- **Ruling: retain `contracts` import namespace with a strict distribution-forwarding shim in Remote.** Root imports otherwise shadow an installed wheel. Replace the module/spec/resource loader with the exact noneditable distribution; reject missing/wrong/editable/old-root imports. Retained schema/code children never become fallback runtime authority.
- **Ruling: root packaging becomes `netcircuit-remote-dev`.** It must not build a second Contracts distribution containing the shim. The three Python consumers pin `netcircuit-contracts==1.0.1`.
- **Ruling: package/core versions 1.0.1 do not change wire/schema/protocol versions.** Python and npm bytes differ; both use the same frozen source inputs. No existing published version is overwritten and no hosted publication is implied.
- **Ruling B12: the canonical FPGA logical envelope remains `1.0-scaffold`.** The target example mentioning `2.0-scaffold` is not protocol authority and is not normalized during M1. Schema/manifest/`versions.md` agree on 1.0; review the example at M5. Physical capabilities remain unavailable without driver/hardware evidence.
- **Ruling: keep current OpenAPI snapshot as reviewed input.** Pure operation binding generation belongs Contracts; FastAPI route export remains Remote. Re-export against final installed artifact must equal the frozen snapshot.
- **Ruling: Device Library remains entirely Contracts-owned for initial extraction.** Interface presentations and rendering are not moved; historical descriptors remain unchanged.
- **Ruling: SDK consumer gate is distinct from M2.** Install and exercise the real npm tarball in an external consumer; keep the Web product on its existing frozen generated projections until M2. Existing app semantic validation remains covered and is not replaced by schema-only Ajv acceptance.
- **Ruling: retain old source without a second canonical writer.** Root writer commands become artifact delegates/checks, root packaging is renamed, runtime submodules/resources resolve installed bytes, and documentation marks the retained tree frozen. Removal is only proposed after verification, not performed.
- **Ruling: history extraction and ancestry integration are separate.** A fresh clone filters existing commit objects as authorized extraction. Combining target's unrelated initial history with extracted history requires a connecting merge/commit, which the user has not authorized. Preserve verified bundles and full mapping; do not move/reset target branch to conceal that gate.
- **Ruling: durable Git bundles are migration source archives, not temporary diagnostics.** Keep them outside repositories and outside the cleanup-owned evidence session. Only Markdown provenance/mapping is retained in source; temporary stdout/test reports are inspected and cleaned through the allocator.
- **Ruling: hosted artifact provisioning must fail clearly until configured.** Local builds are not hosted releases. Exact URL/digest/ACL publication inputs remain required; no source or `latest` fallback is added.

## Progress and evidence

- Source and destination branch creation succeeded; source index stayed empty.
- First sandbox Web baseline encountered loopback `EACCES`; the same suite was rerun with the required execution permission. Initial sandbox Python run was interrupted before results and retried with external defaults/TEMP and required permission.
- External candidate preparation keeps Remote application source unchanged while baseline runs. Meaningful staged tests observed RED before implementation for package independence, installed consumer selection and allocator context boundaries.
- History extraction completed with git-filter-repo **2.47.0** on a fresh `--no-local` clone: **197 selected blobs exactly equal**, **43/123 retained commit mappings**, matching author/committer identities/timestamps, `git fsck`, verified bundles and actual filtered-bundle restoration.
- Filtered tip: `0c8ddcb41194bec73473ca14a264447fd3d56b46`; original source/destination HEADs and indexes remain unchanged.
- Candidate Contracts pure suite initially passed **487 tests**; candidate artifacts and shared tooling remain subject to final consumer/matrix verification. This is not yet an M1 completion claim.

## Handoff and remaining authorization gates

[Final verification and handoff](../../verification/2026-10-24-multi-repo-migration-m1.md) records baselines, exact six artifact digests, 498 standalone tests, 1,313 consumer tests, 1,435 Web tests, two real browser cases, Python 3.11/3.12 clean installations, review fixes and rollback. The separately run three installer cases include one case added after full-suite collection. [History provenance](../../verification/2026-10-24-contracts-history.md) records the verified bundles and full commit mapping.

Local implementation is verified and ready for review. Connecting extracted ancestry requires the separately prohibited merge/commit; hosted publication and private cross-organization ACL verification require an approved release action. No M2, source deletion, stage, authored source/target commit, merge, push or deployment was performed. Software/browser gates do not establish physical capabilities, target deployment or all native browser scenarios.

Final inventory detected default pytest caches inside Remote. The verification report explicitly records that initial policy deviation; four project configs now disable cacheprovider, and four real subprocess cases prove no further writes. Existing caches are preserved for the user's decision.
