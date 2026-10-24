# M2 — Interface extraction verification and handoff

Date: 2026-10-24, Asia/Saigon. Authority: [Lab-First v3.1](../ARCHITECTURE.md), [approved M0](../superpowers/plans/2026-10-24-multi-repo-migration-m0.md), [M2 execution ledger](../superpowers/plans/2026-10-24-multi-repo-migration-m2.md).

M2 implements the independent Interface product and explicit Remote integration. Independent build/package gates pass. The full browser gate remains FAIL: its sole gallery timeout also reproduces on the original Web source. This report does not grant unconditional release acceptance. No staging, authored commit, ancestry merge, push, publication, deployment or M3 was performed. Final browser/cleanup disposition is recorded below.

## Identities and ownership

| Checkout | Original HEAD, retained throughout | Execution branch |
| --- | --- | --- |
| Remote | `745077403f233790bdb6781c36d6502feca01642` | `codex/m2-interface-consumer` |
| Interface | `0ac420fc4090fe27ebc497579c28d0852f3f3c62` | `codex/m2-interface-extract` |
| Contracts | `1f4388252a0711eae0a167b95964372453e811d2` | existing `codex/m1-contracts-extract`, unchanged |

Source was clean after the user's M1 commit; destination was clean README/LICENSE only. New branches were created locally with approval. All final indexes are checked separately from unstaged and ignored outputs.

- Interface owns the complete Vue/TypeScript/Pinia/Three.js workbench, Editor, Component Library, document/application adapters, electrical/geometry/wires, rendering, delivered assets, tests, Vite and Playwright.
- Runtime DTOs, validators, operation bindings and eight catalog/mechanics projections import exact public Contracts package entrypoints. Interface has no canonical schemas/generator or sibling source dependency. Device metadata remains a presentation snapshot checked against released canonical resources.
- Exact test-only resources missing from npm come from a digest-verified Contracts sdist through a seven-name allowlist outside browser source. OpenAPI remains Remote API owned.
- Shared output containment delegates to the independently versioned DEV allocator. Bootstrap verifies DEV before allocating diagnostics, publishes ownership before subsequent downloads, and supports guarded cleanup even if npm installation fails.
- Remote owns API/RPC/Simulator startup, persistent isolated test state, restart commands and bounded shutdown. Interface owns Vite/browser and receives explicit API/admin/restart settings. Same origin, cookie/CSRF/WS and `/models` paths are preserved.
- Retained Remote `apps/web` remains unchanged as the rollback/reference tree. Current Web/browser release gates and Makefile boundary gate require an explicit Interface product. Existing frozen-reference compatibility tests remain labelled and preserved.

| Retained source area | Current owner/output |
| --- | --- |
| `apps/web/src`, `public`, TypeScript unit tests and `e2e` | Interface root equivalents; application/domain/rendering behavior and delivered assets preserved |
| Web package/lock, Vite/TypeScript/Playwright configuration and authoring/test scripts | Interface, with local package resources/allocator and independent Node build/CI |
| Generic generated DTOs/validators, bindings and canonical catalog projections | Contracts1.0.1 public package entrypoints; Interface keeps its application adapters and presentation parity checks |
| 22 root icon originals and two historical benchmark implementations | Exact labelled provenance snapshots in Interface; original Remote artwork/history retained |
| API/RPC/Simulator lifecycle and Python frontend/workflow/integration policy tests | Remote; explicit Interface product/artifact input and network/process boundaries |
| Global architecture, OpenAPI/API generation and deployment integration templates | Remote; Interface uses revision-pinned authority links and a reviewed static artifact |

## Preserved history

[Full path/commit mapping and bundle digests](2026-10-24-interface-history.md) records temporary-clone extraction with git-filter-repo 2.47.0, no `--force` and no rewrite of original repositories. Filtered tip is `4784ff913db83915104406e92019b3bde574ecc1`: 124 mappings, 102 retained commits, 569 selected current Git entries with exact mode/type/blob equality. Raw author/committer identities and timestamps match.

Source, destination and filtered bundles were verified and actually restored, with original HEAD equality and strict fsck on restores. Original source and destination fsck each report their pre-existing all-zero `refs/remotes/origin/HEAD`; neither ref was repaired. The filtered bundle and original initial target history remain separate until an ancestry-connecting merge/commit is separately authorized. An ordinary single-parent source commit alone does not connect the preserved history.

## Versions and artifacts

- Interface: `@net-circuit/web@0.1.0-m2.0`, private; original app identity and third-party lock entries preserved.
- Contracts Python/npm: `1.0.1`; npm SHA256 `17cac7b7ec725581b2ff02078900d5a08ac0f5504df2e1fc3c3703a594c86579`.
- Test resource sdist SHA256: `d527113fcd9d41d192576b49b69bf7a7af2f329b61a696c96220b1cf10af1473`.
- DEV npm: `1.0.0-m1.0`, SHA256 `53190cceb3eee6bb92e91edf1eda0c01043e0ea095cbba1e745a0f7103e6f6df`; canonical module SHA256 `7c42c4fd171ed861b365f08501f3c765282d6bba2dcd6430c9677cddd1abe345`.
- No Contracts release was rebuilt or changed. `integration/compatibility.json` in Interface records exact Contracts/API revision, OpenAPI fingerprint, RPC2.0, Graph1.0/1.1/1.2 and same-origin paths. Desktop/Mobile remain proposed.

| Artifact | SHA256 | Bytes |
| --- | --- | --- |
| `netcircuit-interface-0.1.0-m2.0-source.tar.gz` | `56d85ec4c6bea9b69e8c8dac801a5ecaf86d9c9dbe678721e2b6eaa670f0c30e` | 2365885 |
| `netcircuit-interface-0.1.0-m2.0-static.tar.gz` | `8ca2e539767235cc38c3b298016db9f62ddd5086e50d07fc5abb367c42f318b5` | 2200771 |

Source fingerprint (`sha256-path-lines-v1`): `0cc7226388831e448864349651a7e9462114d66809801bab0e903ca1c54559b1`. Archive contains 554 source files plus metadata; all 554 match the actual target and freshly extracted handoff product. Static archive contains 34 exact final build files plus metadata. Late `migration/verification.md` is a checkout companion, excluded from this local archive/fingerprint to avoid a self-referential artifact digest. Future committed CI includes the companion but excludes it from the fingerprint. Handoff manifest: `C:\Users\trann\.codex\visualizations\2026\10\24\01a16c1e-02ba-7253-9226-6f4a43582df4\migration-release-artifacts\m2-interface-0.1.0-m2.0-20261024-gKwWRT\artifacts.json`.

Versioned local source/static archives and manifest are durable handoff artifacts outside the temporary cleanup session. Source metadata honestly identifies Remote's base plus an uncommitted M2 overlay. The future migration commit cannot be checked out before the user commits; no temporary authored snapshot commit was fabricated. Fresh source export and actual tar extraction are distinguished from a committed clean checkout.

CI installs exact URL/digest artifacts with scoped authentication, preserved allocator context and no latest/source fallback. Standalone CI performs unit/tool/boundary/type/build gates and exports versioned source/static archives. Remote requires reviewed `NETCIRCUIT_INTERFACE_ARTIFACT_URL`/`NETCIRCUIT_INTERFACE_ARTIFACT_SHA256`; Contracts/DEV artifact URLs and the scoped `NETCIRCUIT_ARTIFACTS_READ_TOKEN` remain repository configuration prerequisites. Actions uploads are review artifacts, not a published GitHub Release. Hosted CI/publication and cross-private-repository ACL/token access remain NOT RUN. Linux Node22 CI is configured; this local execution uses Node24.20.0/npm12.2.0 and Python3.14.4.

## Fresh verification

| Gate | Observed result |
| --- | --- |
| Original Web baseline | 1,435 PASS, 0 failures |
| Independent candidate unit suite | 1,443 PASS, 0 failures/skips |
| Fresh source export unit suite | 1,443 PASS, 0 failures/skips, 149.684s |
| Clean install | 92 packages, npm ci offline; no pre-existing node_modules or sibling source |
| Tooling/AST | 18 final tooling tests PASS, 0 failures/skips; 18 AST regression cases; 229 product modules |
| E2E TypeScript and three-entrypoint build | PASS; fresh Vite build12.45s, existing chunk-size warning retained |
| Actual target checkout build | PASS, actual target Vite10.73s; final extracted artifact rebuild13.50s |
| Remote Contracts/API integration | 9 release commands PASS; 572 Python tests PASS, 2 Windows file-symlink privilege skips; installed npm 88 retained cases +89 public shape/profile checks |
| Remote migration/harness policies | 56 PASS, including actual virtual capture and pipe-owned API/RPC/worker shutdown |
| Final output/lifecycle regressions | 8 Node tests PASS, 44.92s; both actual lifecycle cases 2 PASS, 133.69s (default same-session repetition and explicit separate-output repetition); separate fresh state per invocation, authenticated project/session retained across each in-run restart, generation2/no replay, owned backend shutdown |
| Workflow syntax | actionlint1.7.12 PASS; official archive SHA256 6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9 |
| Context/local Markdown/diff | PASS: context; 180 Markdown files/0 errors (external URLs not fetched); root worktree+index artifact guard; git diff --check (only existing LF/CRLF conversion notices) |
| Real browser, full suite | 54 PASS, 1 SKIP, 1 FAIL; 3369.015s (56.2m), one worker, zero retries, forbid-only; exit1; orderly API shutdown exit0 |

Regression evidence includes exact SDK AST allowances, private-schema exclusion, fixed bundled resource/allocator CLI side effects, bootstrap failure before npm installation with independent cleanup, archive traversal/alias/collision/size rejection and source fingerprint verification. A Windows Path sorting mismatch in local archive preparation was rejected before extraction; POSIX lexical sorting was corrected and actual extraction verified every source byte.

The first full browser invocation reproduced missing SDK resolution in two contacts/wires cases: external Node runtime bundles retained bare package imports. The owned Playwright CLI was stopped; parent finally handlers completed API/RPC shutdown with exit0 and all owned processes exited. Four actual E2E runtime builders and the historical/current benchmark now use a shared package-bundling helper; installed Three ESM identity is preserved. Five real outside-product subprocess regressions pass, including catalog/mechanics and cold/warm thumbnail counts. Three original Unicode selector values were restored; complete corresponding src/tests/e2e/scripts Unicode comparison has zero differences. Browser assertions/timeouts and production source semantics remain unchanged. The later final artifact passes all18 tooling tests; its production src/public, unit tests and unit runner remain byte-identical to the1,443-PASS fresh export.

Read-only gallery investigation confirms all six installed SDK validator files and eight catalog projections are byte-identical to the original Web inputs; 161 public names/order match. Ten relevant import/recovery/engine paths match after approved import substitutions and line-ending normalization. Existing recovery repeatedly validates retained drafts before enforcing its count limit. This identifies existing synchronous work, but does not establish the cause of the observed browser timeout; browser comparison remains separately reported.

The completed full suite's only failure is `contacts-wires-gallery.spec.ts:259`, during the sixth add/remove cycle (cycle index5). Geometry, wire/contact assertions, the initial native gallery capture and five full resource-release cycles passed. The next graph upload completed, but the attached-workspace selector did not answer within the original 10s poll. The retained trace does not show an incorrect ID result or uncaught page error. A visible bounded-recovery warning is not proof of the cause. The one skip is `retained pre-fix native WebGL evidence`, whose historical evidence input is absent. An independently prepared original-source run also FAILS the same open() line74 predicate at caller line299 with the unchanged 10s timeout: test140.374s, Playwright161.184s, outer orchestrator210.77s, exit1 and orderly API shutdown exit0. Its failure screenshot was inspected and shows the same native gallery and bounded-recovery warning. This reproduces the failure on pre-extraction production source; its precise root cause remains unproven. No gallery/recovery production fix or assertion/timeout relaxation is included in M2. Both traces reach the same twelfth upload: the initial graph, five complete add/remove pairs, then the sixth ADD (cycle index5). The original trace retains passing GPU-memory/draw-call checks through cycle5; the failed expected graph has17 IDs including CYCLE_5_* and LABEL_CYCLE_5. No serialized actual-ID array is retained, so no observed mismatched IDs are claimed; no console-error/uncaught-page-error event was found.

The independent comparison preparation starts from all 527 original Web files. Only three existing harness/configuration files change, with four helper additions: all 524 other original files stay byte-identical, and the entire gallery source matches after normalization of harness plumbing. Original package/lock/catalogs remain intact; offline npmci installs 90 original packages and the original three-entrypoint build passes. Both builds emit 34 files, of which 29 are byte-identical. Main CSS differs only in Vue-generated scope IDs, without declaration/order/content changes; main JS/index reflect package import bundling, and two model READMEs contain ownership-link updates. This is not a claim that old/new static archives have identical overall bytes.

Exact comparison overlays: replace only `scripts/e2e.mjs`, `playwright.config.ts`, `e2e/contacts-wires-gallery.spec.ts` for allocator/browser/runtime-loading plumbing; add only `scripts/artifact-paths.mjs`, `scripts/artifact-paths.d.mts`, `scripts/build-node-runtime.mjs`, `scripts/build-node-runtime.d.mts`. The Node runtime export roots compile old local catalogs/profile/geometry, not the new SDK. All 531 effective files remain unchanged after install/build/browser. All nine actual Interface Markdown source documents also pass local path/anchor checks; external URLs were not fetched.

Representative final screenshots were actually inspected: contacts/wires before cycles, 1280x720 component placement with correct units, DIP14 native detail, and restored wide camera context with both delivered instrument models. This is a sample, not inspection of every frame. Observed rendering is Three r171, WebGL2, ANGLE/Vulkan SwiftShader, depth24; DPR1/2 tests passed. Playwright1.64.1 pins Chromium/headless-shell revision1248, manifest version156.0.8078.4. The actual copied headless executable SHA256 is `f77d8e27c8db1e4ac0399459a00e0c97bb9417adc393474cabaffebe2314ecb0`.

After the full run only README operational instructions changed in Interface: parent-shell environment adoption, real Git-root context before allocation, explicit Remote working directory/interpreter and current CI ownership. All 553 other reviewed source files are unchanged. The final archive was extracted again through the actual Remote installer; all 554 payload hashes match and all 34 static build payloads remain byte-identical. This documentation correction does not rerun or relabel the failed full browser result.

Final review also reproduced an integrated `--output`/`-o` regression: Interface allocated a second session after Remote had created restart state. Remote now consumes all four argument forms, validates the inherited input session before selecting output, then assigns one new session and external TMP/TEMP/TMPDIR/npm-cache before backend startup. Child Interface receives no output flag. Tests cover an exported product in the old input session, invalid input ownership, missing/unsafe output and actual fresh-auth/DB plus real API restart. A fixture-only missing import was corrected before the confirmed final 8-PASS run. Ten earlier fixture sessions outside the main test session were inventoried and canonically cleaned, followed by removal of only their verified empty parents. Corrected fixtures allocate every output parent beneath their owning session. Browser assertions/timeouts and Interface product code were not changed for this correction.

## Preservation and output inventory

- Original Remote Web: all527 tracked files unchanged in raw bytes/size. All22 original icon hashes and both delivered instrument GLBs match manifests in source and target. Historical benchmark implementations are exact source-revision snapshots with checked blob/hash provenance; custom unavailable baselines fail clearly.
- Developer database:245,760 bytes, SHA256 `908ac5d51719c5430e10f499687f2afe2a26351478c56ef80fbd68e2ec38c835`, unchanged. LICENSE SHA256 `230184f60bae2feaf244f10a8bac053c8ff33a183bcc365b4d8b876d2b7f4809` unchanged.
- All9 existing root/API pytest cache files retain bytes/size/mtime; Simulator/Hardware cache trees remain absent. Existing ignored source build/dependency files were inventoried and preserved. Where no before-snapshot exists, no blanket unchanged claim is made.
- Post-full-run physical audit: all 605 installed source browser-cache files retain bytes/size/mtime, without additions/removals. Browsers launched only from allocator-owned physical runtime copies; the actual full-run path was `br-b8f0e2cf/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe` under the external session. All session-owned processes had exited at the post-run audit. Final post-baseline audit again confirms all605 files/752,827,476 bytes retain SHA256/size/mtime. The baseline owned runtime br-51f1a096 uses the same executable digest; maximum copied executable path197 UTF-16 characters. Final process/TCP audit at2026-10-24T12:00:59Z finds no owned process identities or listeners on14173/15151/18181; two reused numeric PID values belong to unrelated infrastructure and were left untouched. Final root rechecks also confirm all527 Web files, nine pytest cache files and the developer database unchanged.
- Only Markdown evidence is retained in repositories. Full diagnostics were allocated from the start in the shared external session protecting all three participating Git/worktree families. Frozen assets and historical evidence were preserved.
- After inspecting the representative screenshots, failure traces, JSON/JUnit summaries and preservation inventories, both owned sessions (netcircuit-Megq3Q and netcircuit-gKwWRT) were removed through the canonical guarded allocator cleanup with their exact owner/three-root context; exit0 and physical absence verified by2026-10-24T12:10:11Z. Temporary clones, runtime copies, raw diagnostics and superseded local drafts were removed only inside these owned sessions. Original caches/assets/history and the separate durable M1/M2 release/history directories remain.

## Rollback and review gates

| Acceptance gate | Disposition |
| --- | --- |
| Independent Interface build, exact Contracts/DEV packages, no sibling source imports | PASS, installed/exported source and reviewed AST allowlist |
| Unit, type, boundary, public compatibility and API integration | PASS within the command scopes above |
| History recoverability and original-source/data preservation | PASS, exact mappings and restored bundles; original repositories untouched |
| Full native browser gate | FAIL, pre-existing gallery predicate timeout reproduced on original source; no assertion/timeout relaxation |
| Reachable filtered ancestry in target | PENDING separately authorized connecting merge/commit; preserved bundle is not a connected target history |
| Clean checkout of future authored migration commit | NOT RUN before user commit; exact fresh uncommitted export/extraction was verified instead |
| Hosted CI, private artifact ACL, publication/deployment | NOT RUN; separate configured/authorized actions |

1. Keep the full source/target/history bundles and exact M1/M2 release archives/manifest. Verify SHA256 before use; keep prior deployed static artifacts and compatibility sets.
2. No server schema, saved graph format, asset semantics or origin changed. Before any later rollout, select the reviewed Interface static artifact and run API/RPC/browser gates against its pinned compatibility set.
3. For a later deployed regression, restore the previously approved static artifact and same-origin mapping; no document/database conversion is required by M2. No rollout occurred here.
4. For local review, compare unstaged changes on the two M2 branches. Do not reset/delete user work. Retained Remote Web permits explicit historical investigation, while current release gates deliberately fail without a selected Interface product.
5. History connection and hosted release/ACL validation require separate approval/actions. M3 extraction has not started.

Final diff scope: Remote has 27 unstaged paths (15 tracked modifications and 12 untracked additions: three Markdown records, seven orchestration/artifact scripts/tests and two Python regression files). Interface has its modified README plus the independently extracted product and late Markdown companion; 555 source files total (554 payload files plus the late companion), with554 Git-status paths: README modified and553 untracked additions. Contracts is clean. Both migration indexes are empty; all three HEADs remain the original values above. Standard `git diff --stat` omits the untracked extraction, so these counts include full `git status --untracked-files=all`. No original Web source file is removed or modified.

Proposed commits (not executed):

- Interface: `refactor: extract Interface with Contracts 1.0.1 and standalone CI`
- Remote: `refactor: integrate versioned Interface artifacts and browser lifecycle`
