# M1 Contracts extraction — local verification and handoff

Date: 2026-10-24, Asia/Saigon. Authority: [Lab-First v3.1](../ARCHITECTURE.md), [approved M0](../superpowers/plans/2026-10-24-multi-repo-migration-m0.md), [M1 ledger](../superpowers/plans/2026-10-24-multi-repo-migration-m1.md). Status: **LOCAL_IMPLEMENTATION_VERIFIED / READY_FOR_REVIEW**. Hosted publication/ACL and connecting extracted history remain pending separate authorization; no completed publication/history integration is claimed.

## Git and ownership

Remote remains at `295797c581acc3935f5e128fd3d23674c728ca65` on approved local branch `codex/m1-contracts-consumer`. Contracts starts at `a5b17b1c17bce6a1d097c263110b82e8a4602024` on approved local branch `codex/m1-contracts-extract`. The three existing M0 Markdown changes are retained. No staging, authored commit, merge, push, force-push, deployment or M2 was performed.

| Owner | Current implementation |
| --- | --- |
| Contracts | Canonical `contracts/` schemas, manifest/profiles/registry, Python validators/codecs/models, Protobuf and packaged generated RPC, compatibility/conformance fixtures, pure codegen, frozen reviewed OpenAPI input, browser projections, `device-library/`, public SDK build and pure tests |
| Contracts DEV tools | `tools/artifact-paths/` separate Python/npm distributions; one canonical Node allocator, Python bridge and cross-process/context tests; no core runtime dependency |
| Remote | Web/Editor/Component Library rendering and semantic adapters, FastAPI routes/OpenAPI export, API integration tests, Simulator/Hardware implementations, deployment and orchestration |
| Remote retained references | Old `contracts/` children, schemas/protos/registries and `device-library/` remain on disk; package forwarding, retired writers, renamed root distribution and documentation prevent runtime/canonical fallback |

Python consumers pin `netcircuit-contracts==1.0.1`. Root packaging is the empty `netcircuit-remote-dev` metapackage, not another Contracts build. Runtime imports and `importlib.resources` resolve wheel-owned files through a strict namespace forwarding shim. Source/editable/missing/wrong-version artifacts fail explicitly. No cross-repository relative import is introduced.

OpenAPI remains FastAPI-owned in Remote. Contracts generates operation bindings from the reviewed frozen document without importing API source; final consumer export must equal that document. Web keeps its existing frozen generated projections in M1; the actual public tarball is independently installed/tested, and Interface extraction remains M2.

## Baseline and verification

Environment: Windows x64, Python 3.14.4 for whole application tests, Node 24.20.0 / npm 12.2.0 locally (CI pins Node 22); independent Python 3.11.9 and 3.12.10 portable official interpreters for minimum/supported clean installs. Browser details and final assembled gate results are appended below. Explicit test logs, databases, captures, browser runtime/diagnostics and reports were allocated outside all Git families. Final inventory found the pytest-cache exception recorded below; do not interpret this as complete output-policy compliance from the start.

| Gate | Result and scope |
| --- | --- |
| Pre-change Web | PASS: 1,435 tests, 0 failures; typecheck and 245-module AST boundary check |
| Pre-change Python | 1,284 PASS, 2 SKIP, 1 FAIL in 377.54 s. The existing snapshot failure is checkout CRLF versus Git LF for `contracts/boundary/capture_layout.py`: 1,446 working bytes / 1,414 Git bytes, identical after newline normalization. No baseline content was regenerated to hide it. |
| Initial sandbox attempts | Web loopback EACCES; Python socket restriction/interruption. Retried with required execution permission; these attempts are not product failures or passing evidence. |
| Standalone candidate | PASS: 498 tests in 143.38 s; 4 focused source-versus-installed catalog authority tests; deterministic generation/catalog/breadboard/public compatibility checks |
| Python 3.11 clean installs | PASS: two fresh hash-locked offline installs of final wheel plus DEV; isolated external-CWD imports/resources, catalog installed mode, all 28 projection hashes, numeric/omission cases, registry, RPC and pip check |
| Python 3.12 clean installs | PASS: final wheel and independently rebuilt final sdist wheel installed into separate fresh offline environments; all 159 Contracts wheel payloads identical; installed probes and pip check |
| SDK public closure | PASS: real packed npm artifact, offline external consumer, no generator runtime dependency/private implementation leakage; 88 baseline cases and 89 public profile/shape checks including implicit public history |
| Initial assembled consumer | 1,305 PASS, 2 SKIP, 1 stale test assertion in 313.59 s. Exporter correctly rejected removed `--models` injection; assertion corrected to require rejection and no output. Final rerun required below. |
| Review repairs | Meaningful failing-before/fixed-after cases cover missing browser wheel resources, canonical catalog versus packaged mirror authority, allocator Git families/aliases, CI Node bootstrap, same-version wheel selection and export aliases. Final counts below. |

The two existing skips do not establish FPGA electrical/timing behavior. Software checks do not establish physical hardware safety, analog availability or target deployment. W0–W8 application and safety behavior stays owned by Remote and is exercised by the assembled regression gates.

## Local release artifacts

Artifacts are **LOCAL_UNPUBLISHED**, built from reviewed uncommitted migration changes based on the recorded source revision. Package version 1.0.1 changes distribution ownership; wire/schema/protocol versions and existing public baselines are retained.

| Artifact | Version | SHA-256 |
| --- | --- | --- |
| `netcircuit_contracts-1.0.1-py3-none-any.whl` | Python 1.0.1 | `ab865f991950fb575d86d3b6bb23646864c706b64c3d0305ba4b9ca9d0237c79` |
| `netcircuit_contracts-1.0.1.tar.gz` | Python sdist 1.0.1 | `d527113fcd9d41d192576b49b69bf7a7af2f329b61a696c96220b1cf10af1473` |
| `tinihi-labs-contracts-1.0.1.tgz` | npm 1.0.1 | `17cac7b7ec725581b2ff02078900d5a08ac0f5504df2e1fc3c3703a594c86579` |
| `netcircuit_artifact_paths-1.0.0a1-py3-none-any.whl` | DEV Python 1.0.0a1 | `ff76532c69b2115338edb641660c966c5459dd40cb806f52a1e2e8c379c70a1f` |
| `netcircuit_artifact_paths-1.0.0a1.tar.gz` | DEV sdist 1.0.0a1 | `e437f0719d2756f1e15f04d28246089ee66f517ba14a8771297bedb5ba4afaf0` |
| `tinihi-labs-artifact-paths-1.0.0-m1.0.tgz` | DEV npm 1.0.0-m1.0 | `53190cceb3eee6bb92e91edf1eda0c01043e0ea095cbba1e745a0f7103e6f6df` |

Canonical DEV Node resource SHA-256: `7c42c4fd171ed861b365f08501f3c765282d6bba2dcd6430c9677cddd1abe345`. Selected manifest and all six durable artifacts live at `C:\Users\trann\.codex\visualizations\2026\10\24\01a16c1e-02ba-7253-9226-6f4a43582df4\migration-release-artifacts\m1-contracts-1.0.1-20261024-LiyD0Y\artifacts.json`. This directory is a local release handoff, separate from temporary diagnostics and retained during cleanup.

Bootstrap from Remote root with an environment's Python: `python scripts/install_contracts.py --with-dev --manifest ABSOLUTE_MANIFEST`. Install the three consumer packages afterward, then run `python -m scripts.check_contract_consumer`, generation `--check`, `python scripts/export_openapi.py --check`, compatibility/SDK/package gates and regression tests. Final installed bytes must match the selected archive, including a different candidate with the same version.

## Git history and remaining external gates

[History provenance](2026-10-24-contracts-history.md) records 197 exact selected Git blobs, 43 retained commits from 123 mapped entries, author/committer identities and timestamps, filter-repo 2.47.0, verified bundles, fsck and real bundle restoration. Filtering occurred only on a fresh temporary clone. Original source history and target initial history were not rewritten.

Extracted ancestry is retained as a verified durable bundle, not yet connected to the target branch. A connecting merge/commit requires the separate authorization explicitly withheld by the user. Committing only the current target snapshot does not itself import that ancestry; preserve the bundle and connect both histories in the approved integration step.

Hosted release publication and private consumer ACL/token proof are NOT RUN: the user prohibited push/merge/publication, and no release URLs are invented. CI requires exact artifact URLs/SHA-256 and a narrowly scoped `NETCIRCUIT_ARTIFACTS_READ_TOKEN` secret. Private GitHub asset downloads support numeric API asset IDs, HTTPS/digest validation and stripping credentials on redirects. Missing hosted configuration fails clearly without source/latest fallback.

## Rollback

Stop any newly started verification processes, preserve the reviewed working diffs and durable artifacts/bundles, then restore only M1-owned paths to their recorded bases using an explicitly reviewed path list. Keep all three pre-existing M0 Markdown changes. No destructive reset/clean command is required or performed. Source remains present, so pre-M1 runtime restoration uses the original root package in a separate/recreated development environment; do not leave the strict 1.0.1 forwarding shim paired with 1.0.0. Restore consumer manifests, root namespace and tooling together. Do not touch the developer database, historical evidence or LICENSE.

For a later versioned release, roll consumers back to the previously accepted artifact version/manifest and rerun provenance, public compatibility and integration gates. Published versions must remain immutable. No physical/deployment action occurred in M1.

## Final verification record

- Actual destination source: **498 PASS** in 138.56 s; CI allocator bootstrap test **1 PASS**. No sibling implementation checkout is needed by these tests.
- Final Web: **1,435 PASS**, 0 failures in 162.999 s; `npm run build` PASS (existing large-chunk advisory), 245-module AST boundaries PASS, E2E TypeScript PASS.
- Real browser: **2 PASS** in 33.8 s, using `npm run test:e2e -- auth.spec.ts lab-workflows.spec.ts --grep 'real login|a student submits typed' --reporter=line`. Real login/guest-claim/logout preserved the canvas; student typed pre-run vectors executed the real virtual AND path and restored captured history without replaying Run. API shutdown exited 0. A Vite WebSocket ECONNRESET appeared during teardown; assertions and process shutdown passed.
- Playwright **1.64.1**, Chromium headless shell revision **1248**, executable version **156.0.8078.4** observed directly. The launched executable was under this session's `br-c0bf4485/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe`, SHA-256 `f77d8e27c8db1e4ac0399459a00e0c97bb9417adc393474cabaffebe2314ecb0`. Physical copy had 604 byte-identical source files; longest executable path was 197 UTF-16 units. Installation cache retained exactly 605 files / 752,827,476 bytes with identical hashes before/after. No screenshot/video/trace was produced by these passing cases; no visual screenshot inspection is claimed.
- Final assembled package gate: PASS, three rebuilt consumer wheels plus the selected Contracts wheel installed into an external isolated venv/CWD. Covers schema/catalog/RPC, digital simulation, migrations through 0007, NCAP 1+2, auth/project/capture persistence, retirement/retention, four installed CLI checks and clean `pip check`.
- Developer API environment: final selected digest `ab865f...`, exact 154 installed files and `pip check` PASS after refreshing the three editable consumer metadata records. The first upgrade exposed stale 1.0.0 metadata; a real regression now verifies that global `pip check` belongs after consumer migration, while selected artifact verification remains immediate. No developer daemon was restarted automatically.
- Independent review: all four actionable findings resolved (CI allocator import, same-version wheel replacement, export alias containment/repeat writes/Python generator, complete locked dependency closure). Three real offline installer regressions PASS. Export regressions: 5 PASS / 2 Windows file-symlink privilege SKIP; real directory-junction cases executed. Cross-platform source cases remain enabled for capable runners.
- Closure: runtime 12 packages, build/codegen/test 40 packages, 65 reviewed wheel hashes. Actual fresh Windows Python 3.11/3.12 installs and `pip check` PASS. Four platform/Python tag closures PASS offline; Linux execution/hosted Actions are NOT RUN. A valid altered wheel was accepted by the prior unhashed path and rejected before installation with hash enforcement. Runtime/build lock hashes: `575826f2f9a57488cfd9c7de3441a831ee8db99db205ddb294eaf5b15d0b4d90` / `df424b594d38fb00b71fb3d93add01f2f509e5a14305a730c0624fc13d72a8d0`.
- Root Node allocator/artifact-policy regression: 5 PASS; artifact guard PASS for worktree and index. Canonical DEV suite separately passed 15 Node cases and 2 Python bridge cases, including real junctions, inherited cleanup, Git environment overrides, denied discovery and unlisted Git destinations.
- Final sdist includes both closure locks and current standalone README. Its external build copy uses exact Git LICENSE LF bytes; destination working LICENSE CRLF bytes are preserved. Offline rebuild produced all 159 package payloads identical to selected wheel, then passed a fresh minimal-runtime 3.12 isolated probe and `pip check`.
- Retained source/projection inventory: 146 tracked blobs unchanged against source revision after Git newline normalization, excluding the intentionally changed forwarding shim and two owner README files. Developer `netcircuit.db` remains 245,760 bytes, SHA-256 `908ac5d51719c5430e10f499687f2afe2a26351478c56ef80fbd68e2ec38c835`. Destination LICENSE remains byte-identical to its initial working file, SHA-256 `230184f60bae2feaf244f10a8bac053c8ff33a183bcc365b4d8b876d2b7f4809`.

- Whole consumer suite on final selected wheel: **1,313 PASS / 4 SKIP**, 1,317 collected, existing Starlette/httpx deprecation warning, 471.71 s, exit 0. Skips are two unavailable Windows file-symlink privileges and two pre-existing optional FPGA tools (pyslang and Icarus/vvp). The separately executed **3 PASS** installer group includes the transition test added after whole-suite collection; counts are not combined.
- Documentation/context checks PASS; source Markdown **177 files / 0 errors** and standalone target Markdown **24 files / 0 errors** after its handoff record. Source and target `git diff --check`, artifact guard and actionlint **1.7.12** (`-shellcheck= -pyflakes=`) PASS. External URLs were not fetched by the local Markdown checker.

## Acceptance disposition

- [x] Canonical Contracts source/build/generation resides in the independent repository; no Web/API/Simulator/Hardware implementation is needed by its build.
- [x] Versioned Python and public npm artifacts built, content inspected and installed independently; runtime/build dependency closures locked.
- [x] Remote consumes exact installed 1.0.1 wheel bytes, retains frozen references and has no retained-source runtime or writer fallback. API owns OpenAPI; Web product extraction remains M2.
- [x] Deterministic generation, public compatibility, Python/TypeScript parity, clean installations, API/simulation/RPC integration, Web regression and relevant real browser cases PASS.
- [x] History extracted and restored from verified durable bundles; source/target initial history and license/data preserved.
- [ ] Connect extracted ancestry to target with an approved merge/commit. Not performed because the user expressly withheld that authorization.
- [ ] Publish immutable artifacts and prove authenticated cross-organization consumer access/hosted CI. Not performed because publication/push is outside current authorization.
- [x] Stop before M2; retain old source. Its later removal requires an exact reviewed path list and separate decision.

Final physical/Git inventory and guarded cleanup are recorded below. The preserved pytest cache exception is an initial output-policy deviation, not a passing containment claim.


### Physical inventory and pytest cache exception

Final Git inventory before cache-policy repair: Remote46 modified tracked files +19 new source/Markdown files (includes pre-existing M0 changes); Contracts1 modified tracked README +253 new source/Markdown files. Both indexes empty, no deleted tracked files, both HEADs unchanged. Six durable artifact digests were recomputed;154 wheel payloads match current canonical source or three freshly regenerated RPC files. Generated RPC stays build-owned rather than being added as canonical source.

Ignored outputs were inspected explicitly: source build/DEV cache, Web dist/test builds/dependencies, approved browser installation cache, environments/egg metadata, Python caches, retained RPC and database; target `.build`, SDKdist/node_modules. Build caches and environments remain. Passing browser cases created no captures or traces, and the browser installation cache remained byte-identical. No diagnostic is knowingly moved from source into evidence to disguise its origin.

**Policy deviation discovered during final inventory:** root `.pytest_cache/v/cache/{nodeids,lastfailed}` and `services/api/.pytest_cache/v/cache/nodeids` were written inside Remote by default pytest caching. Explicit `--basetemp` did not disable that separate plugin. These are ignored on-disk diagnostics, so a clean tracked-artifact guard did not detect them. Functional results above remain valid; initial output containment for those invocations was not compliant. Existing cache trees, including their README files, are preserved for the user's decision rather than deleted or relocated. Follow-up disables the cache provider in every participating Python project and verifies no further cache writes with real subprocess tests; its exact result is appended below.


Cache repair: root/API/Simulator/Hardware pytest configurations now set `addopts = "-p no:cacheprovider"`. Four real child pytest processes each use the actual project config/CWD, require the plugin to be absent, and compare SHA-256/size/mtime of all four potential source cache trees before/after. **4 RED → 4 GREEN**, 5.07s. The failing reproduction used an owned external safety cache override, so it introduced no additional source write. The passing normal launcher needed no command-line plugin override; source snapshots remained unchanged, and no external safety cache was created. Existing root/API caches remain; Simulator/Hardware caches remain absent. This fix affects verification configuration only; the previous functional suite is not presented as rerun after it.

Updated final diff inventory: Remote46 tracked modifications +20 new files, including the pre-existing M0 Markdown changes and new cache regression. Contracts1 tracked README change +253 new files. Both indexes empty; no tracked deletion; original HEADs unchanged. No source assets, protected Markdown/baselines or LICENSE were removed. All requested local functional gates and the cache follow-up are complete; initial cache containment remains a disclosed deviation.


### Inspection, cleanup and final handoff

All owned test/build/browser processes exited before cleanup (final process inventory empty). Raw successful/failing evidence was inspected by the implementers and parent; only passing-case browser functional results are claimed, with no generated screenshots to inspect. The shared allocator successfully cleaned exactly sessions `netcircuit-LiyD0Y` (original sole-root legacy owner) and `netcircuit-iUF6uQ` (explicit Remote+Contracts context), using their verified ownership marker IDs. No direct recursive filesystem deletion was used outside that allocator. Both session directories are absent. Durable six-artifact handoff/manifest and three verified Git bundles remain, outside those diagnostic sessions.

Final documentation/provenance regression:12PASS; context/Markdown/artifact guards PASS; source177 and target24 Markdown documents have zero local-link errors. Both Git indexes remain empty and both original HEADs unchanged. Existing source pytest caches, source/build assets, protected history, developer database and LICENSE remain; this cleanup did not delete/relocate them. No M2 or publication followed.

Interpreter provenance retained in this Markdown: official Python3.11.9 embeddable archive SHA256 `009d6bf7e3b2ddca3d784fa09f90fe54336d5b60f0e0f305c37f400bf83cfd3b`, executable SHA256 `5f7b89a612c9b8af1d6456cdfcd1dbe5ca630849e79aebced9bee9a6694952ec`; Python3.12.10 embeddable archive SHA256 `4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3`. Download MD5 values matched official release pages. No system interpreter installation or PATH change was performed.
