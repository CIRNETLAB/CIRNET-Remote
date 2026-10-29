# M6 verification and release ledger

## Approved 0.1.2 continuation — 2026-10-29

The user explicitly approved Interface **0.1.2** and Remote **integration release
0.1.2**, retaining API, Contracts, Simulator, Hardware and FPGA **0.1.1** and DEV
tooling **1.0.0a1**. Existing immutable v0.1.1 tags/assets remain unchanged.
The current continuation prepares strict mixed-version validation, a new clean
committed Interface build, exact selected-artifact installation and actual
hosted browser acceptance before new publication. This approval closes the
version-choice gate; it does not turn an unrun gate into PASS.

Remote's retained product entry denotes API/deployment 0.1.1 with original
source provenance. The new system lock records its integration revision
separately; Interface source/static must come from a fresh committed 0.1.2 build.
Previously inspected local 57/0/1 and cancelled old-artifact hosted evidence
remain historical results, separate from the new selection.

- [x] Obtain explicit approval for Interface/system 0.1.2 only.
- [x] Verify six clean synchronized masters and preserve fresh all-ref bundles;
  actual mirror restoration and strict fsck pass for all six.
- [ ] Build and verify the new exact artifact selection and clean installation.
- [ ] Pass the actual selected-artifact hosted browser gate and publish the
  approved releases without replacing immutable v0.1.1 assets.
- [ ] Complete final master CI, current documentation and owned-session handoff.

### Current renamed-directory execution

The fresh session uses owner `cirnet-m6-release-20261029` with all six actual
`CIRNET-*` roots. Python 3.12.13 and the verification virtualenv were newly
installed externally; cleaned old session paths/runtimes were not reused.
Initial state matched the handoff: Remote `181f84b` with 17 unstaged paths,
Interface `f6c8d273` clean. All other producer masters remain synchronized with
exact-head successful hosted CI and immutable 0.1.1 releases.

Both linked worktrees were repaired using Git, remain clean at `295797c` and
retain branches `Multi-Repo`/`refactor`. The initial sandbox temp backup failed
with access denied, and nonterminating PowerShell errors allowed repair before
backup. Pre-repair gitfile text is reconstructed from the inspected readback,
not byte-certified prebackup. Subsequent complete metadata/all-ref backups were
actually restored and passed strict fsck: 27 refs, eight worktree HEADs, 819
independently checked checksums. Receipt SHA-256
`8edab2c9b6a009ec042d7db7bc341002ac3d0d984ae0a087221cfbeda1c65dfe`.

Interface inventory SHA-256 `96c0e881…ce431b` rehashes exactly. Independent
comparison confirms all 571 source payloads equal committed `f6c8d273` and
fingerprint `52b29bc9004cb8abc1be054a0c404a5ebcdf37e5f22520129284d36a72709818`.
Two new clean builds with Python 3.12.13/zlib 1.3.1 reproduce source SHA-256
`ba0fd15607961204cdce5b50536cc62d7f06fc88251fb69d760cbb9ac5afcf3f` and static
`b06b8021509aa8ad5eeb063039179c9170f41f49a9ca2c5ed764955f8b00d4b7` exactly.
Build receipts: `666f8e622df08a6f9ed52881cd47df13d9540af365934e6f65371d6590f8368f`.
The unchanged 24 script tests and 229-module AST check pass; full unit/type
results are tracked separately from build identity and integrated browser.

Draft Interface release `427320878` holds exactly source `686766559` and static
`686766692`, with those same filenames, sizes and digests. It is not published.
All immutable v0.1.1 metadata/assets were compared before/after and unchanged.
The fresh 15-artifact plus rollback clean install passed in 216.853 seconds;
API remains 0.1.1 with selected immutable SHA-256 `50d3d261…` and isolated
installed-byte/import provenance. This installation used the reviewed working
tooling before its commit; final committed-source gates remain explicit.

Runtime/tooling is now committed at `3c3c36a96daf31b7b25bf797431e76e4534076bc`.
The dependency-selection hole reproduced as two failing regressions; six focused
tests then passed, and 57 selected compatibility tests passed. All 12 CI jobs
bind DEV/Contracts/Simulator/Hardware/FPGA from the validated system lock before
bootstrap; all six Interface downloads are manifest-bound. Independent review
found no remaining blocker. The new lock retains API build revision `82ca15b`,
all other 0.1.1 products/DEV/rollback and records the integration revision
separately. Actual CI-secret draft access, new selected browser and final master
CI are still pending; historical local 57/0/1 is not acceptance of this set.

The first bound commit `794ab06` passed selected-secret installation and real
PostgreSQL, but Frontend (76 PASS/one FAIL) and Integration (1,455 PASS/one FAIL)
both exposed the same Remote static branding expectation. Interface's approved
rename `631d41b` changed its accessible title to `CIRNET Remote`; Remote still
expected the historical title. The existing test reproduced RED (one FAIL/eight
PASS), then the exact accessible-title correction passed all 77 frontend tests.
Only that Python fixture changed at `64c9f85e2a854cfb2c8f625e51076a49bc829881`.
No native browser case/assertion/configuration/baseline changed.

The new normal push cancelled old browser `40793008672` through its existing
concurrency rule: cases 1–7 started, no final PASS count; **CANCELLED / NOT_PASS**.
Replacement [40793753335](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/40793753335)
is executing the actual selected-set suite, not reusing historical local results.
At `64c9f85`, Frontend `40793753351`, Contracts `40793753310`, Documentation
`40793753315` and Integration `40793753434` pass. Integration's actual named
CI-secret receipt verifies source asset `686766559`, static `686766692`, all
15 archives/rollback and isolated installed origins against manifest SHA-256
`1354dbe58cf77491ccfd8a5c771b23bf1ca310741bc9ba707bab08d77a214be1`.
Credential scope remains `NOT_VERIFIED`; no permissions/secrets were expanded.

New local PostgreSQL 18.6 passes all 18 cases in 24.90 seconds on the fresh
loopback-only 15432 cluster. Exact selected FPGA 0.1.1 source `24ade35`/archive
`b82edb4167b821f55d98331304d0c49d2f37638d972fc9c167287bb6368908ca` passes
19 tests with zero skips plus mandatory RTL in 47.175 seconds. Both behavioral
PASS markers and 372 authenticated support files were inspected; all 37 source
payloads remain unchanged. RTL receipt SHA-256
`e6a45f6462fe606c190e6ef41cd314ca6ed236cbaae48f058019df564b65652c`.
Initial sandbox native execution/loopback/junction restrictions and one external
test-helper missing toolroot are retained as failed attempts; the unchanged full
final gates pass with the authorized environment. Two Remote cleanup tests also
failed because sandbox Git Bash could not create its MSYS object; unchanged
authorized rerun passes both. These are distinct from code fixes and native PASS.

The separate exact committed-source acceptance has 1,231 payloads equal to Git
`64c9f85`; only the branding fixture differs from initial `794ab06` export.
Installer and manifest bytes are identical. Its new clean virtualenv installation
passes in 193.281 seconds; full registered groups/browser and software rollback
verification are running. Source/static preparation is separately complete:
24 script + 10 Contracts + 1,467 runtime tests, AST 229 modules and E2E types,
all PASS with zero skips. Preparation receipt SHA-256
`57a439840b192e3383b590e9fc33243493b1945d8344047ef520b2a8a94c6c81`.
The original sandbox test attempts remain separately recorded.

Remote Integration draft `427329840` holds exactly the Git manifest from
`794ab06` (identical at `64c9f85`), asset `686803664`, filename
`netcircuit-system-0.1.2-release-set.json`, SHA-256 `1354dbe5…214be1`.
Before publication its tag target will be bound to the final validated descendant;
runtime `3c3c36a` and retained API `82ca15b` provenance remain distinct.

### Approved Ubuntu continuation after Windows native results

The user explicitly chose: “Không bắt buộc Windows; có thể nghiệm thu toàn bộ
gate gốc trên Ubuntu”. The browser workflow changes only `runs-on` to
`ubuntu-latest`. Original case collection/order, assertions, DPR, individual
deadlines, 90-minute job envelope, retries 0, traces, baselines and browser
arguments remain unchanged. Artifact/source identities and manifest SHA-256
`1354dbe5…214be1` remain exact; a CI-only descendant does not relabel the
retained API build or rebuild Interface.

The actual Windows full local result is **56 PASS/one FAIL/one unchanged optional
historical skip**, 58 collected in original order. Receipt SHA-256
`1531aeb34cea20ed9151eae030b3201f0dad07b9b5f9bbc6392740252df2e3e8`.
The failure is sealed-package gallery: an LED graph had visibly imported and
rendered correctly, but File click took 10,534.5 ms, exceeding the existing
10-second poll before a graph comparison completed. Visibility/enabled/stability
checks were about 15 ms. An unchanged idle singleton reproduced 11,213.5 ms at
the same boundary; concurrent verification is therefore not a sufficient cause.
All 1,312 DOM snapshots collected in 1–7 ms. Source review found no evidence
that principal protection dropped this successful import or a late server route
overwrote it. A bounded profiler remains diagnostic, not acceptance or a source
fix. Two initial control launches were NOT_RUN (ownership admission and zero
matching cases); neither is a gallery result.

Hosted Windows [40793753335](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/40793753335)
is **CANCELLED / NOT_PASS**. The actual annotation says the job exceeded its
maximum 1h30m. Native ran 00:30:18–01:54:07 UTC; 54/58 cases started. Seven
failure headers cover gallery camera settle, DPR2 depth, responsive Ribbon DPR2,
two pending-preflight Cancel flows, sealed gallery and component closeups.
No final PASS total is inferred. Exact API wheel/source/Interface selection and
actual draft access passed before this native step. The artifact is inspected
separately; no credential blocker or permission expansion is claimed.

Fresh installed-product Web passes AST 229 modules, 10 Contracts and 1,467 runtime
tests with zero skips/failures plus production build. All 34 generated files
equal selected static payloads; all 572 source payloads remain exact. Registered
local PostgreSQL passes 18 cases; package isolation passes migrations, CLI,
domain/NCAP1+2/RPC/resources. The registered rollback first failed its nested
RPC worker's original 10-second bound, then its complete unchanged serialized
rerun passed all three subgates in 229.031 seconds. Retry receipt SHA-256
`a4f4967a29655801c49f34d18bfa9cca4dcb6f2003fd5b7b0ab89ae2c8b1329d`.
This remains software/restore/replay/package coverage, not a full prior-artifact
reinstall rehearsal. Initial failure is retained.

Local Contracts completes 809 PASS/one FAIL/two file-symlink capability skips.
The failed negative test assumed `ROOT` was a Git checkout, but its source export
is a safe allocator-owned non-Git directory. The unchanged test passes in the
actual Git checkout (one PASS/15.06s; log SHA-256 `28de3a8869…9e42e`). No
production/test source was altered for this result. Exact-source hosted
Contracts/full Python passes; the redundant local full-Python collection was
not started. Consolidated acceptance evidence SHA-256
`e6a0e68d82169af4b8a3eef095dcfcbc2d2523b454fe6c8569810128e8c03fe8`
retains these scopes and verifies all selected assets/API/source payloads.

All six source checkouts and both linked worktrees remain clean with unchanged
ignored inventories, LICENSE/assets/fixtures/baselines; all six v0.1.1 releases,
tag objects and 31 asset metadata records remain exact. Preservation receipt
SHA-256 `207b5bbafed6648ea0d04caa3e2020528409b90e6f8c0fbf8cd52c7698fa65c0`.
Master promotion/publication remains pending actual full Ubuntu native acceptance
and final exact-master CI; Windows failure/cancellation is not promoted to PASS.

Started: 2026-10-27; current update: 2026-10-29, Asia/Saigon. Status: M6_V012_UBUNTU_NATIVE_PENDING. The records below retain their historical scope. No production deployment or board programming is part of M6.

## Current CIRNET rename and release disposition

### Current six-master and artifact-selection checkpoint

Accepted runtime/integration source and hosted-CI baselines are: Remote
`28221a5ca19d04225e9399895764a12149188681`, Contracts
`41dd34510bf39b9fe6093738965f81ac7d64f2b4`, Interface
`461b0870dbe7975d6bfdf336c6d5ef87e72c8970`, Simulator
`dfa5fbe1ce5ff7fe4f3a5f033e419adcf656a488`, Hardware
`4d7e75389d3671476e2aabbf0359681f057e9704`, FPGA
`0ccca05baafc85289459ecfd20c8f4a163a8596f`. All five producer workflows pass at
those exact source heads; Interface runtime run 40749926343 passed at 461b087.
Interface master is now the pushed docs-only descendant
`a7de79a938a0df910641421e97607d71bcefcb8c`; its new Standalone run
[40760666418](https://github.com/CIRNETLAB/CIRNET-Interface/actions/runs/40760666418)
now passes at this exact docs-only head; artifact source remains 461b087.
Remote's nine observed
non-browser workflows pass at 28221a5 (eight release workflows plus a separate
dependency-graph update). Hosted evidence includes 1,421 Python tests, 18 real
PostgreSQL cases in 7.33s and authenticated verification/installation of all
15 published selections. The Contracts group passed 12 commands in 73.9s,
including 784 Python tests in 63.59s and installed SDK 88 baseline/89 public
conformance cases; its separate installed-packages job also passed. Artifact
installation receipt
`b8b14dfad9bdeec9cb834cf643c4a0e08de89a0ddbe6d1019122f7142c7ad330`.
The browser workflow 40748387829 used the original published Interface 7a266d15
and is now CANCELLED / NOT_PASS: 55 of 58 cases started, ten numbered failure
headers, no final JUnit and no known PASS total. Its result is resolved; hosted
acceptance is blocked, and non-browser/local-candidate PASS does not replace it.

Six published release titles/notes were updated only as metadata after fresh
body/title/tag/31-asset/policy guards. Original bodies remain exact prefixes,
all immutable assets/tags/states/latest IDs are unchanged, and the original
publication journal is untouched. Receipt
`7c044d3583ad89ec3157f08a01a6111d4141e343afa024be8439f9401b314208`.
The current Git manifest at 28221a5 has LF SHA-256
`7b6e0ee9ba09d6b13d5f73cd0bf783f3f001422a424a84477622cfdb08232a2e`;
its Windows CRLF serialization is `5e6c396e1fe1b7cac102ce59045b6a5be877d92ec3fab09f89c9db10e91952fe`.
The immutable system-manifest asset 684998628 still has old namespace/history
and unchanged SHA-256 `a2f9c5eb10ad8fc7ee41f26246d802bed782881e5b69b323b7a84e939a313e10`.
Current CI uses direct canonical URLs, preserving all 15 selected original build
sources/digests; API build 82ca15b, Remote tag 065179e and master 28221a5 are
different identities.

Thirteen candidate archives from all six new committed sources are durably
retained, rehashed and **UNPUBLISHED**; inventory receipt
`7098ad0ba242a20a878c8ed4975f2727208202adc6ad83bd3fba1696c22566f5`.
They were not installed as one all-new set. The compatible full-browser local
selection is new API 28221a5 plus new Interface 461b087, with the exact published
Contracts/SDK/Simulator/Hardware/FPGA/DEV and unchanged rollback pins. In
particular, new Contracts npm candidate `2cdcfae6…ca042b1` must not silently replace
Interface's published SDK pin `3bfc8b6f…dd2bc83` (and sdist `9e15850d…8b4e07`).
The explicit compatible API/Interface selection now passes the original full
native gate: **57 PASS, zero FAIL, 58 collected**, with only the original
`retained pre-fix native WebGL evidence` optional case NOT_RUN. Exact case IDs
and order match. The original three-command gate took 2,281.0s; browser JUnit
records 2,166.553819s. Local manifest SHA-256 is
`e9c753fb68bd2d4fde327f7f641184b0ac627ab4f6cf717d5cc143c680e8e7bf`;
durable browser verification receipt
`e304d9921863d6373c385f2a10c87316c5a97ffc1a9fa2a1e187ce7dbb9ba5ef`
binds the inspected native result. API artifact source remains 28221a5 and
Interface artifact source remains 461b087, including after docs-only descendants.
This is local compatible-candidate acceptance, without replacing immutable
0.1.1 bytes or claiming hosted four-CPU acceptance or a measured hover speedup.

Local clean 28221a5 verification independently reinstalled the original published
15 artifacts plus rollback anonymously in 216.469s and passed the registered
installed-package group in 124.7s. That package group builds API from committed
source and selects published Contracts/Simulator/Hardware; it does not establish
an all-candidate install or a browser/production result. Receipt
`c38507bca5409379eb5ab6f1567f2b9e9230d37341f2cb5db9591365e622c765`.

- [x] Commit/push the six reviewed source baselines; verify their five producer workflows and nine observed Remote non-browser workflows. Later docs-only master CI is tracked separately.
- [x] Revalidate the original published selection through canonical URLs and complete the separate clean-install/registered-package probes.
- [x] Preserve all published 0.1.1 bytes/tags and exact old-note history while updating only six release titles/notes.
- [x] Build/retain/rehash 13 unpublished candidates from six committed sources, with explicit compatibility differences and original rollback retained.
- [x] Complete/inspect the actual original full local native gate for the explicit compatible new API/Interface set: 57 PASS, zero FAIL and the sole historical optional NOT_RUN.
- [x] Collect/inspect the resolved original published-set hosted result: run40748387829 CANCELLED / NOT_PASS, without inventing a final PASS total.
- [ ] Resolve blocked hosted/release acceptance for the intended artifact selection; the separate local candidate PASS does not close that gate or authorize new immutable bytes.
- [ ] Resolve any required new artifact/tag/version decision with the user using the concrete comparison; no immutable overwrite, retag or automatic 0.1.2 selection.
- [ ] Finish the applicable current documentation/CI/recoverable-bundle and inspected owned-session handoff. M6 remains incomplete until its actual remaining gates are satisfied.


**M6 remains incomplete.** Published immutable 0.1.1 releases and the completed
history-only branch cleanup are preserved. The latest user attachment authorizes
current source/tests/CI/docs/manifests, origin updates, commits and ordinary
master pushes across all six renamed repositories. It does not authorize
overwriting immutable artifacts, moving v0.1.1 tags, choosing a new version,
changing licenses/visibility, force-pushing, production deployment or board
programming. A release replacement decision is conditional on the concrete
build comparison after independent work is complete.

The user confirmed “Đúng, dùng CIRNETLAB/CIRNET-* cho cả sáu repo”. Organization
account ID **333715068** and all six repository IDs are unchanged. Current
repository/release links are:

| Owner | Current repository | Existing immutable 0.1.1 release |
| --- | --- | --- |
| Remote | [CIRNET-Remote](https://github.com/CIRNETLAB/CIRNET-Remote) | [v0.1.1](https://github.com/CIRNETLAB/CIRNET-Remote/releases/tag/v0.1.1) |
| Contracts | [CIRNET-Contracts](https://github.com/CIRNETLAB/CIRNET-Contracts) | [v0.1.1](https://github.com/CIRNETLAB/CIRNET-Contracts/releases/tag/v0.1.1) |
| Interface | [CIRNET-Interface](https://github.com/CIRNETLAB/CIRNET-Interface) | [v0.1.1](https://github.com/CIRNETLAB/CIRNET-Interface/releases/tag/v0.1.1) |
| Simulator | [CIRNET-Simulator](https://github.com/CIRNETLAB/CIRNET-Simulator) | [v0.1.1](https://github.com/CIRNETLAB/CIRNET-Simulator/releases/tag/v0.1.1) |
| Hardware | [CIRNET-Hardware](https://github.com/CIRNETLAB/CIRNET-Hardware) | [v0.1.1](https://github.com/CIRNETLAB/CIRNET-Hardware/releases/tag/v0.1.1) |
| FPGA | [CIRNET-FPGA](https://github.com/CIRNETLAB/CIRNET-FPGA) | [v0.1.1](https://github.com/CIRNETLAB/CIRNET-FPGA/releases/tag/v0.1.1) |

Final-name audit SHA-256 `1cd3c5d388d727b70b33c773f8f8497a419449f3acba8c3437cd59c0c996d918`
verified final names, repository/organization IDs, six public/admin states,
unchanged masters/tags/policies/notes, all 31 immutable asset IDs/names/sizes/digests
and LICENSE. Origin receipt `5381dce919166a231176bbd049127e6d07e445850a1cba81b4b508faba9d2866`
binds six canonical origin updates and recoverable config backups under
`C:/Users/trann/.codex/migration-release-backups/m6-promotion-20261028-f79860e8/cirnet-rename-before-source-66099e0f/`.
Sixty existing selected-artifact CI URL variables were changed/read back; receipt
`5b320afedbf6feaf0c17fc85aa53bf738872c750522235a7e843a3e43fcc6c38`
preserves fingerprints of all other variable values. No secret, package version,
asset ID, filename, digest, release/tag or visibility changed in this rebind.
These readbacks do not constitute new exact-master hosted CI acceptance.

The current Git [system manifest](../../integration/release-set.json) changes
only 26 repository/asset URL fields to CIRNETLAB/CIRNET-*; all 15 selected asset
IDs, original build revisions, versions, filenames, digests and compatibility/
rollback pins stay unchanged. The historical immutable system-manifest asset
`684998628` remains byte-preserved; current release-note metadata appends preserve the original bodies as exact prefixes. Current source validators
accept coherent exact historical or current repository provenance while rejecting
mixed transport and unrelated identities. The earlier 132 focused working-copy tests preceded current committed-source non-browser/clean-install/package PASS evidence; full native acceptance remains separate.

### Completed history backup and merged-branch cleanup

The user explicitly instructed: “Trong lúc đợi phản hồi từ Github hãy hoàn tất
backup lịch sử và dọn các nhánh migration đã merge.” Decision SHA-256
`04b2d7d9e6dc333679df20bb1d6402a6dbbd5fd357788d368a78e1bd7e5922e2`
authorizes history backup/cleanup while native remains a separate gate. The
history-only authorization receipt is
`07f18d762af00b614ab93b403491dbc717773d61ee8853ddf81c479837424d25`,
using helper `68e25bc2bbad26759b54230565faee1a7c2738c3dd7ddc857fe5df17364777ff`
and bounded cleanup adapter
`e8856280fb817a83fb3a9a437de5b04df2e08ceecbd46194c5a21e4e0bb4efd6`.

All six complete bundles were actually restored into fresh mirrors, named
refs/HEAD/master/immutable tags/auxiliary worktree HEADs checked, and full strict
fsck passed. Durable inventory:
`C:/Users/trann/.codex/migration-release-backups/m6-promotion-20261028-f79860e8/m6-postpublication-browser-repair/BACKUP_INVENTORY.json`,
SHA-256 `a56a651cc837143cfc6a7db62ee0cc38dad687cde6a6fb279ca1b4fd90d53698`.
These backups capture Remote 23ca0827 and the five original publication targets,
before the later rename commits; a later final-source handoff is still required.

| Complete pre-cleanup bundle | SHA-256 |
| --- | --- |
| Remote | `fd2eebdc2b8bf192cf430881b75e22b01bd31712cf2582dedcad215a07db9c59` |
| Contracts | `0eb2369cc5d24e058a904c23bf8849c29581cba59eedaf174b7c1da5d9a25ff2` |
| Interface | `4181ad14791b5befec48454672087366362619b083dafe2f02ca09cd976e3cf7` |
| Simulator | `0276c22dde3db515ffba985e432051626a3a545f43cdce1ba7f0fbd785737e6d` |
| Hardware | `04c09ce45d15cb43869c6da6335220c5c455eaf244c6c13639f5d33e3d5b977e` |
| FPGA | `ed02b4cae7a17e9869413e93e031c206459ca16784fe4d188fe0a8aa5ec4d3a1` |

Actual deletion is **PASS: exactly 11 remote and 16 local migration branches**,
with all 27 named tips proven reachable. Terminal receipt
`4b6fc6dfe984653f665584c61a50cda04587763e1b67e9b60501a016dec4531a`,
wrapper `43585e58d1f3627de5057de1cda9982a5a866e6bca4e12e28d4d43bab02d2507`,
operations journal `895b2231a080839f3596dbd7db0b2bcb1f85c3d792f780a5e9a702853d6778e6`.
All six remote deletion guards validated before the first deletion; ordinary
push old-OID checks and normal local branch deletion were used, with no force,
reset or prune. Source/master/tag/LICENSE/hooks/config/ignored files and unrelated
refs/worktrees, including `Multi-Repo` and `refactor` at 295797c, were preserved.
The wrapper intentionally says `nativeCountedAsPass: false` and
`fullM6Acceptance: false`; the later browser result does not rewrite this history.

### Rename-source builds and unpublished candidates

Four reviewed producer commits are now pushed master commits with actual exact-head
hosted CI PASS, observed 2026-10-28 18:20 UTC. Their four complete pre-push bundles
were actually restored/fsck-checked, with original tags preserved; durable promotion
receipt `a30b302afd0ddf5025bd337da25da793b1edd8af5c79e94c250265fb3e5b49d2`
is under `C:/Users/trann/.codex/migration-release-backups/m6-promotion-20261028-f79860e8/cirnet-four-leaf-before-push-e8a55c5e/`.
The initial Interface rename at 631d41b passed hosted CI; current Interface `461b0870dbe7975d6bfdf336c6d5ef87e72c8970` adds the bounded hover invalidation correction and is pushed/synchronized with [40749926343 PASS](https://github.com/CIRNETLAB/CIRNET-Interface/actions/runs/40749926343). The initial 631d41b checkpoint's complete pre-push bundle was restored/fsck-checked,
with the original tag preserved; promotion receipt
`17335b36bb3027a49fa41ed5b005f10df4772bec4357a9c0ba658a9e36488da7`
is under `C:/Users/trann/.codex/migration-release-backups/m6-promotion-20261028-f79860e8/cirnet-interface-before-push-d53ca688/`.
The current 461b087 checkpoint has its own full pre-push bundle/actual mirror
restore/strict fsck proof, preserving the original tag:
`C:/Users/trann/.codex/migration-release-backups/m6-promotion-20261028-f79860e8/cirnet-interface-hover-before-push-85edce1b/PROMOTION_RECEIPT.json`,
SHA-256 `9029e8428a0b983d4256b8942eb17c4b6ff1f23e0d2e84b6d7db68ca8ca6aa08`.
All five accepted producer runtime/source baselines have exact-head hosted CI PASS; Interface docs-only master a7de79a also has exact-head CI PASS. Remote `28221a5ca19d04225e9399895764a12149188681` is also pushed/synchronized with nine observed non-browser workflows PASS; the published-7a browser job is resolved CANCELLED / NOT_PASS. Local source folders retain net-Circuit-*.

| Owner | Rename source checkpoint | Actual local evidence / remaining scope |
| --- | --- | --- |
| Contracts | `41dd34510bf39b9fe6093738965f81ac7d64f2b4` | Clean committed export; 500 primary + one CI + 15 Node + two Python allocator tests PASS; generation/compatibility, wheel/sdist/public SDK, independent sdist wheel and fresh isolated resources/RPC/OpenAPI probes PASS. Hosted [40742625944 PASS](https://github.com/CIRNETLAB/CIRNET-Contracts/actions/runs/40742625944) at this exact master |
| Simulator | `dfa5fbe1ce5ff7fe4f3a5f033e419adcf656a488` | Clean committed export; 110 tests and baseline/candidate comparison checks PASS; hosted [40742637237 PASS](https://github.com/CIRNETLAB/CIRNET-Simulator/actions/runs/40742637237) at this exact master |
| Hardware | `4d7e75389d3671476e2aabbf0359681f057e9704` | Clean committed export; 108 tests and baseline/candidate comparison checks PASS; hosted [40742650852 PASS](https://github.com/CIRNETLAB/CIRNET-Hardware/actions/runs/40742650852) at this exact master |
| FPGA | `0ccca05baafc85289459ecfd20c8f4a163a8596f` | Clean committed export; 19 tests PASS in 89.89s, pinned actual RTL with both PASS markers, repeated source artifact byte-identical. Hosted [40742663529 PASS](https://github.com/CIRNETLAB/CIRNET-FPGA/actions/runs/40742663529) at this exact master |
| Interface | Runtime/artifact source `461b0870dbe7975d6bfdf336c6d5ef87e72c8970`; docs-only pushed master `a7de79a938a0df910641421e97607d71bcefcb8c` | 1,467 unit/type tests, 22 scripts, 10 Contracts checks, types/boundaries/build and runtime hosted [40749926343 PASS](https://github.com/CIRNETLAB/CIRNET-Interface/actions/runs/40749926343). Compatible local full native 57 PASS / zero FAIL / one historical optional NOT_RUN. Docs-only [40760666418 PASS](https://github.com/CIRNETLAB/CIRNET-Interface/actions/runs/40760666418) is at this exact master |
| Remote | `28221a5ca19d04225e9399895764a12149188681` pushed/synchronized master | Nine observed non-browser workflows PASS, 1,421 Python tests, 18 PostgreSQL cases, authenticated 15-artifact installation; separate anonymous clean install and registered-package group PASS. Compatible local native passes as scoped below; old-set hosted result CANCELLED / NOT_PASS; hosted/release acceptance and full M6 remain open |

The bounded external PSU memo experiment retained exact parity but showed 61s to
64s with only 0.87% hits; it was not adopted. This single scoped measurement does
not establish a performance improvement or replace the complete native gate.
The box hypothesis was also rejected. A separate external six-case prototype reproduced five RED failures before six GREEN results. The bounded three-runtime-file hover invalidation correction and six regressions are now committed at 461b087; assertions, deadlines, retries, DPR and baselines remain unchanged. Seventeen focused native SceneManager RGBA checks pass. A representative full 2560x1440 gizmo-enter PNG was inspected (preview resizing affected display only); parity assertions used full raw RGBA. These focused results do not establish the full 58-case native gate.

Contracts retained all committed export inputs, package identities/versions,
schemas, protocols and source LICENSE bytes. Raw candidate-vs-published wheel
comparison finds 93 changed members: **92 CRLF-only differences, including the
packaged license formatting, plus verified RECORD hashes**. Sdist comparison
finds 148: 146 CRLF-only and README/package description. Public npm differs only
README/package.json; every `dist/` runtime/resource byte is identical. Both
wheel RECORD inventories/hashes were checked, and the independent sdist wheel
is byte-identical to the direct candidate wheel. Comparison normalization is
read-only; no source, license, baseline or artifact bytes were rewritten. The
initial external comparison stopped on an overly strict byte-equality assumption
after every command passed; receipt
`cf08df364e468430dd9beef5b37e0d173211e1d614cfe1b0e9c0473b2bede528`
is preserved. Final classification receipt:
`6babcfd320f74eede41e743f038298b9e845f79df84e023546e48cf0de836f5f`.

FPGA's exact repository allowlist rejects unrelated provenance before an archive
is written. Its new archive records the current canonical URL and committed
revision while preserving originalRepository/originalRevision and the historical
input file. The changed members are exactly five source files plus
`fpga-artifact.json`; LICENSE, all RTL and historical migration provenance remain
byte-identical to the published archive. Actual pyslang 12.0.0 and digest-pinned
OSS CAD Suite 2026-10-26 Icarus/vvp emitted `LAB_FIRST_RTL_PASS` and
`PERMIT_MATRIX_RTL_PASS`. Receipt
`13a4a4b62a3c50861f9cb2af8a864f8d12c155a9adb6e644a3077ce70ba44d32`
does not imply synthesis, pinout, timing closure, electrical safety or a board run.

| UNPUBLISHED candidate | Committed source | SHA-256 |
| --- | --- | --- |
| Contracts wheel | `41dd34510bf39b9fe6093738965f81ac7d64f2b4` | `a86e30faa6f3c0a0ee3b83c3d5061177928a67c71620918d20d8b000e07397e1` |
| Contracts sdist | `41dd34510bf39b9fe6093738965f81ac7d64f2b4` | `02d5492810dca67e3c9300d191d3529141d389e100790343f2d654b73c29bd1b` |
| Public SDK npm | `41dd34510bf39b9fe6093738965f81ac7d64f2b4` | `2cdcfae6f617746c95c94827868b6e7e5a077c467dcb48f639394b638ca042b1` |
| FPGA source | `0ccca05baafc85289459ecfd20c8f4a163a8596f` | `ba96307b148ca62a3fd6a73920f338e926246cb367273ae98d790bb3317bcc83` |

Four candidates and seven sanitized receipts were retained under
`C:/Users/trann/.codex/migration-release-artifacts/cirnet-rename-candidates-20261029-41dd345-0ccca05/`,
inventory SHA-256 `acf429ac3963ba22ea488db4e87883e7fdbfac45713bd2040bcf825b8d9c7caf`.
Raw logs/images/diagnostic archives were not copied into that durable product set.
Clean-export/original-source integrity receipt
`a47d1aee4de9bb3e1a2068e88dbf8bdc0ff5da548a0ba4585e14bc1ba71d72bd`
checks every committed input after build/tests and both original clean masters/
empty indexes. Six actual selected Contracts/DEV/FPGA downloads through final
canonical URLs matched existing digests; anonymous download receipt
`df224e1c41df577ec7e53a261adb7b3791371ce9b80de7e636dc9a12f01c0d08`.
None of these new candidates has been uploaded, selected as a released build,
used to move v0.1.1, or assigned a new product version.

### Existing published selection through current canonical URLs

These are the **15 reused published artifacts**, not the new candidates. Every
source revision below is the artifact's original build source. Current repository
master, immutable tag target and artifact build revision remain distinct.
The exact Git manifest is linked at commit
[`28221a5`](https://github.com/CIRNETLAB/CIRNET-Remote/blob/28221a5ca19d04225e9399895764a12149188681/integration/release-set.json),
LF SHA-256 `7b6e0ee9ba09d6b13d5f73cd0bf783f3f001422a424a84477622cfdb08232a2e`.

| Owner / role | Original artifact build source | Filename / canonical numeric asset | SHA-256 |
| --- | --- | --- | --- |
| Remote / python | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | [netcircuit_api-0.1.1-py3-none-any.whl](https://api.github.com/repos/CIRNETLAB/CIRNET-Remote/releases/assets/684944254) (ID 684944254) | `50d3d2610ceaa0d00d926c83e4d4a9b5039ecc2a67fa8d19d979d28f051a1906` |
| Remote / sdist | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | [netcircuit_api-0.1.1.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-Remote/releases/assets/684944433) (ID 684944433) | `badc2f9308d3f3e48ff79ec73ac20e2337b22a3c7cfbc779029444599d43feba` |
| Remote / deployment | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | [netcircuit-remote-0.1.1-deployment.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-Remote/releases/assets/684944615) (ID 684944615) | `0c4af2a06a9a03f0a662862aa934db7a026ffe4b4b01a30593f3518d9c2d179d` |
| Contracts / python | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [netcircuit_contracts-0.1.1-py3-none-any.whl](https://api.github.com/repos/CIRNETLAB/CIRNET-Contracts/releases/assets/682226130) (ID 682226130) | `5dd663c6bfe6b9dd39b5f4b86ffd24eeed8bed9b2898aaedb35f99debb0cbcc2` |
| Contracts / sdist | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [netcircuit_contracts-0.1.1.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-Contracts/releases/assets/682226235) (ID 682226235) | `9e15850d42ddc61311979cec2df95f5e55d07699e7cbfd83a8f24f0b988b4e07` |
| Contracts / npm | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [tinihi-labs-contracts-0.1.1.tgz](https://api.github.com/repos/CIRNETLAB/CIRNET-Contracts/releases/assets/682226359) (ID 682226359) | `3bfc8b6f84b645cd6b7864bd1391de1d5efdc6ee4ba653cb92e145a3ddd2bc83` |
| Contracts / dev | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [netcircuit_artifact_paths-1.0.0a1-py3-none-any.whl](https://api.github.com/repos/CIRNETLAB/CIRNET-Contracts/releases/assets/682226469) (ID 682226469) | `ff76532c69b2115338edb641660c966c5459dd40cb806f52a1e2e8c379c70a1f` |
| Contracts / dev_npm | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [tinihi-labs-artifact-paths-1.0.0-m1.0.tgz](https://api.github.com/repos/CIRNETLAB/CIRNET-Contracts/releases/assets/682226570) (ID 682226570) | `53190cceb3eee6bb92e91edf1eda0c01043e0ea095cbba1e745a0f7103e6f6df` |
| Interface / source | `7a266d15b510d840ad3146515a3699760564ed32` | [netcircuit-interface-0.1.1-source.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-Interface/releases/assets/684942791) (ID 684942791) | `bd3f529454dd129d90a27ce7ee76c84400481f1cc6452150d32233973c42c4b4` |
| Interface / static | `7a266d15b510d840ad3146515a3699760564ed32` | [netcircuit-interface-0.1.1-static.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-Interface/releases/assets/684942968) (ID 684942968) | `f7e87d32b314982503a7e9bd1f213812c6a927914276f98825983191ac924055` |
| Simulator / python | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | [netcircuit_simulator-0.1.1-py3-none-any.whl](https://api.github.com/repos/CIRNETLAB/CIRNET-Simulator/releases/assets/684943145) (ID 684943145) | `78b857369baec88800d08e37977afacca3321decd05b6cd50ea925c033ea7b89` |
| Simulator / sdist | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | [netcircuit_simulator-0.1.1.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-Simulator/releases/assets/684943330) (ID 684943330) | `6afd1b9a68768f527fd5ee1f864287c88d56b6a97c0a7fd7b2b7bd560bb0cfd2` |
| Hardware / python | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | [netcircuit_hardware_service-0.1.1-py3-none-any.whl](https://api.github.com/repos/CIRNETLAB/CIRNET-Hardware/releases/assets/684943575) (ID 684943575) | `f6fc643bc40130a0f8b4136db8db4f8abe1b0b366efaffa8c1866786429d9e9b` |
| Hardware / sdist | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | [netcircuit_hardware_service-0.1.1.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-Hardware/releases/assets/684943851) (ID 684943851) | `3754bfc3338cc6c17dd66b16788c502cdd414e2b4e01a1e2c0ffaed24b0060fb` |
| FPGA / source | `24ade35eade5382efd42f784008280c0fbb768c3` | [netcircuit-fpga-scaffold-0.1.1.tar.gz](https://api.github.com/repos/CIRNETLAB/CIRNET-FPGA/releases/assets/684944031) (ID 684944031) | `b82edb4167b821f55d98331304d0c49d2f37638d972fc9c167287bb6368908ca` |

Authenticated hosted installation at 28221a5 verified these 15 selected files,
versions, installed origins and package closure; receipt
`b8b14dfad9bdeec9cb834cf643c4a0e08de89a0ddbe6d1019122f7142c7ad330`.
Credential scope remains NOT_VERIFIED; successful downloads do not prove least
privilege. The separate anonymous clean install and registered package probes
are bound by `c38507bca5409379eb5ab6f1567f2b9e9230d37341f2cb5db9591365e622c765`,
published selection state `fc5a7be9ee963fd185d9a9d3e370d2217ec9e1275bc87fbebc4893ea6a778a47`
and verification `4b58ad71941f5b1b79ad1b46b33f4fdf83c45aebdb75726ed01c6774f6c64bf4`.
The installed published API is `50d3d261…a1906`, with all 69 owned application
files verified; the new candidate API is not implicitly selected by that install.

### All 13 UNPUBLISHED candidates from six committed sources

All rows below are independently built/retained candidates, not replacements of
the immutable artifacts above. Four durable inventories and the combined rehash
receipt `7098ad0ba242a20a878c8ed4975f2727208202adc6ad83bd3fba1696c22566f5`
bind exact source, filename, byte count and full digest. No all-new candidate set
has been installed together. Contracts SDK candidate metadata changes cannot
silently replace the old SDK/sdist pins still required by the new Interface.

| Owner / candidate filename | Committed build source | SHA-256 | Bytes / disposition |
| --- | --- | --- | --- |
| Contracts: `netcircuit_contracts-0.1.1-py3-none-any.whl` | `41dd34510bf39b9fe6093738965f81ac7d64f2b4` | `a86e30faa6f3c0a0ee3b83c3d5061177928a67c71620918d20d8b000e07397e1` | 1277120; UNPUBLISHED |
| Contracts: `netcircuit_contracts-0.1.1.tar.gz` | `41dd34510bf39b9fe6093738965f81ac7d64f2b4` | `02d5492810dca67e3c9300d191d3529141d389e100790343f2d654b73c29bd1b` | 1287191; UNPUBLISHED |
| Contracts: `tinihi-labs-contracts-0.1.1.tgz` | `41dd34510bf39b9fe6093738965f81ac7d64f2b4` | `2cdcfae6f617746c95c94827868b6e7e5a077c467dcb48f639394b638ca042b1` | 823983; UNPUBLISHED |
| FPGA: `netcircuit-fpga-scaffold-0.1.1.tar.gz` | `0ccca05baafc85289459ecfd20c8f4a163a8596f` | `ba96307b148ca62a3fd6a73920f338e926246cb367273ae98d790bb3317bcc83` | 56973; UNPUBLISHED |
| Hardware: `netcircuit_hardware_service-0.1.1-py3-none-any.whl` | `4d7e75389d3671476e2aabbf0359681f057e9704` | `3d88031382cdbe3b3648507a6c00c946d7473b6c9a60c1ebb461be24e66de5de` | 29587; UNPUBLISHED |
| Hardware: `netcircuit_hardware_service-0.1.1.tar.gz` | `4d7e75389d3671476e2aabbf0359681f057e9704` | `9c559177149d519352fe1783bf57d1284d90ce253d95f5cc9b67f6a0067f48c8` | 76203; UNPUBLISHED |
| Interface: `netcircuit-interface-0.1.1-source.tar.gz` | `461b0870dbe7975d6bfdf336c6d5ef87e72c8970` | `4d80590440cae2fe6fbab9e8f9a73e3c76c1cd0b40e494974f98d6e160ea790f` | 2400348; UNPUBLISHED |
| Interface: `netcircuit-interface-0.1.1-static.tar.gz` | `461b0870dbe7975d6bfdf336c6d5ef87e72c8970` | `a6e4d528e0eee5b34be9f4802d80cfb6552ceee89ad33f75d8ccbb5388e7e2eb` | 2192776; UNPUBLISHED |
| Remote: `netcircuit-remote-0.1.1-deployment.tar.gz` | `28221a5ca19d04225e9399895764a12149188681` | `3c47f719293a124b4061464ce4f6e7ae8c2d35b9672067be0951394e73ea12fa` | 22950; UNPUBLISHED |
| Remote: `netcircuit_api-0.1.1-py3-none-any.whl` | `28221a5ca19d04225e9399895764a12149188681` | `193f1ea85a959e649d6949240bef53b439d4100a71bd1c79c5a53c515538fc5c` | 100218; UNPUBLISHED |
| Remote: `netcircuit_api-0.1.1.tar.gz` | `28221a5ca19d04225e9399895764a12149188681` | `4cc3dd42e3629ddbbbd32780f04f40b3bac8cd539694c9b246feef666480e7b1` | 157348; UNPUBLISHED |
| Simulator: `netcircuit_simulator-0.1.1-py3-none-any.whl` | `dfa5fbe1ce5ff7fe4f3a5f033e419adcf656a488` | `546b1f3a738a45a0d4a01fdf52e427cd42a15e3e46268ba8fc370c28c6b234a9` | 33630; UNPUBLISHED |
| Simulator: `netcircuit_simulator-0.1.1.tar.gz` | `dfa5fbe1ce5ff7fe4f3a5f033e419adcf656a488` | `831456d5639bb637ac8afd2a3c21b779ebf7d41d1bbb9365903e49834315c713` | 81084; UNPUBLISHED |

Current compatible browser validation selects **new API 28221a5 + new Interface
461b087**, with the original published Contracts wheel, SDK `3bfc8b6f…dd2bc83`,
sdist `9e15850d…8b4e07`, Simulator ff63616, Hardware de65db8, FPGA 24ade35,
DEV wheel/npm and unchanged rollback. It is an explicit local artifact selection,
not sibling source, `latest`, or a mix of all 13 candidates. Its complete original 58-case native result is now adjudicated and inspected:
57 PASS / zero FAIL / the sole original historical optional NOT_RUN, bound to
local manifest `e9c753fb68bd2d4fde327f7f641184b0ac627ab4f6cf717d5cc143c680e8e7bf`
and durable browser verification
`e304d9921863d6373c385f2a10c87316c5a97ffc1a9fa2a1e187ce7dbb9ba5ef`. The registered runner uses the existing
58-case order/assertions/deadlines/retries/DPR/worker settings; only the owned
external output-directory adapter supplies its output location. No local
compatible-set or metadata proof grants
physical/native-solver/deployment capability or authorizes immutable replacement.

### Release-note metadata update and URL audit

GitHub explicitly permits editing immutable release titles/notes while assets and
associated tags stay locked: [immutable release policy](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).
Exactly six approved name/body-only PATCHes were performed. New titles/notes
retain each old body as an exact prefix and explicitly distinguish current Git
manifest LF bytes from the historical immutable system-manifest asset. Fresh
readback preserves all 31 assets/digests/tag objects, draft/prerelease/immutable
policy/latest IDs. Durable operation receipt
`7c044d3583ad89ec3157f08a01a6111d4141e343afa024be8439f9401b314208`;
original publication journal `1eb5efdd…9db20` remains untouched. This is a metadata
and URL/provenance revalidation, not a newly published 0.1.1 build or M6/native PASS.

The read-only six-tree URL audit at current masters reviewed 126 matches in
29 files. Remaining old URLs are pinned/history/model provenance, synthetic
negative/301 tests, explicit exact historical-artifact aliases or documented name
mappings; there are no unexplained active old URL defaults. Current workflow
selection and the 15 Git-manifest URLs are direct canonical CIRNET paths.
Audit receipt `f989e7396a521f7ecfcc4208297d9d7343224f0db9e9f22081bd3427bacf333c`.
No historical source/asset/baseline or technical package/import/environment/
protocol/local-folder identity was rewritten by that audit.
Independent final scope review receipt
`bd0a91137b6b3770f3593941bfd4f8455e3a3013a070d1ea9105757faa83f37f`
also verifies unchanged LICENSE/RTL/assets/baselines/browser harness and exact
published SDK/sdist/DEV pins across current source changes. Contracts candidate
raw wheel members include the recorded line-ending/RECORD changes; its payload
must not be described as raw byte-identical to the published wheel.

### Accepted local browser result and current handoff

The exact API282/Interface461 artifact selection completed the original
three-command native gate in **2,281.0s**, with all commands exiting zero.
JUnit records **57 PASS, zero FAIL, 58 collected**, with the sole optional
`depth-artifacts.spec.ts` / `retained pre-fix native WebGL evidence` NOT_RUN,
and 2,166.553819s. Exact original case IDs/order match SHA-256
`14e7610cddd366751da0ea9cd90028434b928c285bee600cdff31ef81c37358b`.
The unchanged DPR2 hidden-layer test completed all 30 poses with zero leaks
in 128.492s. This case directly drives the depth harness and does not exercise
the pointer-hover scheduling fix; these measurements do not establish a hover
wall-clock gain. The existing assertions, deadlines, retries, DPR, renderer
flags, worker, runtime locks and baselines stay unchanged.

The actual native runtime is the owned Playwright 1.64.1 Chromium copy,
executable SHA-256 `f77d8e27c8db1e4ac0399459a00e0c97bb9417adc393474cabaffebe2314ecb0`,
with local Node 24.20.0/Python 3.12.12, 16 logical CPUs and
34,049,417,216 bytes physical memory. This is not the hosted four-CPU runner
and does not turn earlier hosted failures/cancellation into a PASS. The old
published-set hosted browser run 40748387829 is resolved CANCELLED / NOT_PASS
as recorded below; it is separate from this accepted local compatible set.

Sanitized proofs are durably retained under
`C:/Users/trann/.codex/migration-release-artifacts/cirnet-compatible-current-browser-20261029-28221a5-461b0870-0cb4f345/`:

| Proof | SHA-256 |
| --- | --- |
| `BROWSER_VERIFICATION.json` | `e304d9921863d6373c385f2a10c87316c5a97ffc1a9fa2a1e187ce7dbb9ba5ef` |
| Full JUnit | `1787018335722eb9299a8cc1d9264771b75009f319bbb2fab321645e757918c0` |
| Full native adjudication | `a7ef9d245cadd3cae59ebc8c2693e74d668d47e08fc0597fd7147c0db35f41b3` |
| Post-run inspection/process closure | `943a0d9b2c7baa3cc2c47e739012c44be74570971dbc373a54f8c740411ee2f9` |
| Original Interface source preservation guard | `1422b38fbd5a734531a16ed8a6c2fb8e515e3dd438a6882cb5d1424c5aecfeb2` |
| Durable proof inventory | `b3dffae3d65bb92bdf2636698f079cbcf4ac367d0af51b72092159a187ed48e2` |

Actual full-workspace Label text and molded DIP/wire images were inspected.
All owned full-run processes exited and service ports 18181/15151/14173 closed;
all selected API 69 application files and Interface export inputs remain exact.
The source guard checks clean tracked source/index, tags, LICENSE, worktrees
and the original 7,569 ignored-path inventory. The old promotion baseline only
contains ignored path hashes, so historical ignored-content equality is not
claimed. This scoped process closure does not mean the entire session is cleaned.

Interface's later documentation-only master
`a7de79a938a0df910641421e97607d71bcefcb8c` is an ordinary descendant of 461b087;
it was pushed after a complete all-ref bundle/actual mirror restore/strict fsck,
with promotion receipt `899e2c8f881e56e79c13d43745486b52ec41e7020b14d4320c3a808204531bed`.
Its new hosted Standalone run 40760666418 now passes at this exact docs-only head. The accepted artifacts
are still built from 461b087/28221a5, never from this docs-only descendant.

Remote's GitHub About description alone was changed from net*CIRCUIT to CIRNET;
receipt `6a1d4538e593084390cfe867ac5665a61239563b2bce936c1434defe877f00f5`
preserves all other selected repository settings and records zero source/tag/
release-asset mutations. A separate minimal tail session was prepared with the
same owner/six-root context, receipt
`625c88a127a64b2118619d08d62ae0e08ba3287fdcc8d801d64534f81a054b2a`;
its interpreter is outside the original session. Canonical cleanup of the original six-root session is now **PASS**, bound by
`fcce9feef17bc4ea1a3d551eb52a934573941b9cc250978a643082a9220788c0`. Durable native proof retains the
actual JUnit/plain gate log plus sanitized metrics outside Git; screenshots,
traces, database files and browser caches were not copied into that proof set.
No claim is made that all historical/raw evidence elsewhere has been deleted.
Final current documentation CI, recoverable history bundles, applicable hosted
acceptance and any user release-selection decision must finish before closing M6.

### Resolved old published-set hosted cancellation

Hosted [run 40748387829](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/40748387829),
job 123028168080 at Root source28221a5, is **CANCELLED / NOT_PASS** after
5,441s (90m41s). Its explicitly logged selected Interface is the old published
source `7a266d15b510d840ad3146515a3699760564ed32`, archive SHA-256
`bd3f529454dd129d90a27ce7ee76c84400481f1cc6452150d32233973c42c4b4`.
The partial run started 55 of 58 case ordinals and contains ten explicit
numbered failure headers. No final JUnit exists; PASS total is unknown (`null`).
Started ordinals include the original optional case and do not imply completed
passes. The inspected terminal receipt is
`3b00b73ee201a48ab7453cc7aff208d63948009b0f5bf41dbf151e1d34da6285`.

Actual stdout measured Windows Server2025/Python3.12.10, four CPUs/affinity
[0,1,2,3] and 17,174,360,064 memory bytes. The 671,401,228-byte diagnostic ZIP
has SHA-256 `20523b89559b71e2bb42287157b9582a67bbe7c5bf56f3df1d0335864a1b00d5`;
231 members passed safe extraction checks. A genuine old-shell failure image
was inspected and showed an API timeout; that image does not represent the
accepted new Interface461 candidate. The collector exited with no owned
collector processes remaining. Raw ZIP/screenshots/traces were not copied into
the durable current-candidate proof directories.

This resolves observation of the old job, **without satisfying hosted release
acceptance**. Existing immutable0.1.1 artifacts remain their original old-source
builds and cannot be called fixed/rebuilt from current master. The separate
API282/Interface461 local result remains 57 PASS / zero FAIL / one original
historical optional NOT_RUN. Publishing the new Interface bytes requires the
user's explicit release/version choice after the remaining independent cleanup,
documentation commit/push and recoverable handoff work; no version is selected
automatically and no existing asset/tag is overwritten. Original shared-session cleanup has now completed canonically; final metadata
handoff/independent-tail cleanup is tracked separately below.

### Hosted Windows baseline and remaining gates

Run [40725519551](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/40725519551),
job 122947595339, remains **CANCELLED / HOSTED_WINDOWS_NATIVE_NOT_PASS** at
baseline source `23ca0827d94d54bff34ffd2d47286d414553bf26`, not the new rename
sources. It reached the unchanged 90-minute job envelope; the inspected partial log contains eight failure headers and shows 55 of 58 cases started. No final JUnit path was present,
so no complete 58-case or 57-mandatory-pass result is claimed. Receipt
`2effc3c6124ffee4d77dfcec4fd82f478a21a083ff150dad7855e9e7d2dd22ee`,
actual log `195a76b38c481dd5e273c92928526bed7557da11a234acf2e3faa891fb8654f9`,
downloaded partial artifact ZIP
`e7c3f06ecd0bcd96fb2ce89f3e8e1405cca27288dcbcb8ed14c84d31526501d1`.
Actual sanitized stdout measured Windows Server 2025/Python 3.12.10,
four CPUs/affinity [0,1,2,3], memory 17,174,360,064 bytes. These observations do
not prove the scheduling cause or establish target Mini PC/physical capacity.
Earlier Linux 50-pass/seven-failure runs and local complete 57-pass observations
retain their separate scopes; none substitutes for new hosted acceptance.

The external Linux profiling environments were canonically cleaned with receipt
`91897bf9bd8a0e0227344caf809931f33a6af667a741e0f74f602cb433e0002e`;
bounded profiling/renderer-double results are diagnoses, not full native passes.
The original current-session owner `m6-promotion-20261028-f79860e8` and six-root
context remain in force across the local date change. Cleanup of that whole
current session is still pending inspection/process exit/durable retention.

- [x] Six canonical names/origins, unchanged immutable identities, 60 CI URL variable readbacks and preserved selected artifact pins.
- [x] Actual six-bundle restores and exact 11 remote / 16 local merged-branch cleanup with all 27 tips reachable; no native acceptance inferred.
- [x] All six reviewed source baselines pushed/synchronized, five source producer workflows and nine observed Remote non-browser workflows PASS; committed comparisons/all 13 candidates retained. Interface docs-only descendant also has exact-head CI PASS.
- [x] Complete and inspect the original compatible local native gate: 57 PASS / zero FAIL / one original historical optional NOT_RUN. Hosted old-set acceptance and any release-selection decision remain separate.
- [ ] Resolve artifact selection truthfully: retain/revalidate the original immutable 0.1.1 sources/bytes, or obtain a concrete user release decision before any required replacement/tag movement; no automatic version bump.
- [ ] Complete remaining native CI, retain the final current documentation/recoverable bundle and close inspected owned-session cleanup; normal current master pushes are complete.

The earlier full95/final-docs-only helpers bind their recorded 23ca/65 source
scope and cannot be reused as acceptance of these broader rename-source changes.
Current physical/native solver capabilities, W0–W8, same-origin deployment,
versioned Contracts, quarantine and no Start replay remain unchanged. The task
continues; **publication, cleanup or local unit/build passes alone do not close M6**.

## Historical publication checkpoint, 2026-10-28

**Historical checkpoint:** releases were published, hosted native CI failed and migration-branch cleanup was then NOT_RUN. The user explicitly instructed “Đừng chờ nữa hãy thực hiện publication”. That decision authorized publication now without counting native CI as PASS; it did not waive the cleanup/acceptance gates. All six existing v0.1.1 releases are now published and immutable. All repositories became public by the user's action; the agent changed no visibility or license. No deployment, board programming, runtime fix, new product version or artifact rebuild was performed in this checkpoint.

Publication journal SHA-256 `1eb5efddc58171259aaf0cf1575055a839dfea757d3565a4bc205ddd71e9db20` binds `explicitUserPublicationDecision` (decision SHA-256 `089d2d7645b6c96b16d10f8fcd422ab33bc173967de2c513cf4b457e5262021e`), `nativeCountedAsPass: false`, and 13 other required master workflows. This publication-only binding and release notes deliberately differ from the original all-pass guard; they cannot satisfy its full-M6/branch-cleanup acceptance. The original guard was not weakened.

| Repository | Publication-time master / immutable v0.1.1 target | Exact artifact build source | Published release |
| --- | --- | --- | --- |
| Remote | `065179ead7c7cf4f44483b74edca99bb84f8f2a5` | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | [v0.1.1](https://github.com/TINIHI-Labs/net-Circuit-Remote/releases/tag/v0.1.1) |
| Contracts | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [v0.1.1](https://github.com/TINIHI-Labs/net-Circuit-Contracts/releases/tag/v0.1.1) |
| Interface | `7a266d15b510d840ad3146515a3699760564ed32` | `7a266d15b510d840ad3146515a3699760564ed32` | [v0.1.1](https://github.com/TINIHI-Labs/net-Circuit-Interface/releases/tag/v0.1.1) |
| Simulator | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | [v0.1.1](https://github.com/TINIHI-Labs/net-Circuit-Simulator/releases/tag/v0.1.1) |
| Hardware | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | [v0.1.1](https://github.com/TINIHI-Labs/net-Circuit-Hardware/releases/tag/v0.1.1) |
| FPGA | `24ade35eade5382efd42f784008280c0fbb768c3` | `24ade35eade5382efd42f784008280c0fbb768c3` | [v0.1.1](https://github.com/TINIHI-Labs/net-Circuit-FPGA/releases/tag/v0.1.1) |

System manifest SHA-256 `a2f9c5eb10ad8fc7ee41f26246d802bed782881e5b69b323b7a84e939a313e10` (asset `684998628`); verified 31-asset inventory SHA-256 `a55a06d7722e341ac5aa24765085a0ea34154ed232379340d13e8d1392970373`. Fifteen selected artifacts, ten archived old payloads, rollback and auxiliary assets remain preserved. Remote API/deployment artifacts retain build source `82ca15bec250894c39c2849ab4a3eaaeb7712b05`; the deployment archive includes its historical runbook. A later docs-only Remote master descendant does not move or relabel immutable v0.1.1.

### Publication-time hosted master results: 13 PASS, native FAIL

| Repository / workflow | Actual result |
| --- | --- |
| Remote / Integration | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833573) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Remote / Contracts | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833432) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Remote / Frontend | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833441) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Remote / FPGA source artifact acceptance | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833270) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Remote / Backend | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833448) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Remote / Documentation Context | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833252) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Remote / Simulator artifact consumer | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833579) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Remote / Hardware artifact consumer | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833318) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5` |
| Contracts / Standalone Contracts | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Contracts/actions/runs/40689553293) at `54ef9f6a11f4906c11ec9789de47cf06d5100734` |
| Interface / Standalone Interface | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Interface/actions/runs/40689573154) at `7a266d15b510d840ad3146515a3699760564ed32` |
| Simulator / Simulator | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Simulator/actions/runs/40689590781) at `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` |
| Hardware / Hardware Service | [PASS](https://github.com/TINIHI-Labs/net-Circuit-Hardware/actions/runs/40689610481) at `de65db8b89d0dfa6dd4c430a41397555bc77111d` |
| FPGA / FPGA source and RTL | [PASS](https://github.com/TINIHI-Labs/net-Circuit-FPGA/actions/runs/40689627688) at `24ade35eade5382efd42f784008280c0fbb768c3` |
| Remote / Real browser release gate | [FAIL](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40705352207) at `065179ead7c7cf4f44483b74edca99bb84f8f2a5`: 50 PASS / seven FAIL / one optional historical NOT_RUN |

At this historical checkpoint, public native run `40705352207` completed in `4791.228` seconds, with 50 PASS, seven FAIL and the sole optional `depth-artifacts.spec.ts` / `retained pre-fix native WebGL evidence` NOT_RUN. Original assertions, deadlines and retries were unchanged. Native receipt SHA-256 `f4ecde5d8181f2f9e88be7c4c18c51cd824548763e54c5745c8699673df27e6b`, ZIP `de5ec679a7224303159a4825de1d40d8fb9ed242535b69a3cd2654d8318cf93c`, log `4470c9f52c8e8914847be9b01f363669fa1be2269eaadf39712c6ec1e70c3245`, JUnit `c72bb7bc631511b9d47f7ccd7eeb00676456d1972b38355cabe2b3be575cc0be`. Actual runner CPU/memory were not logged; public repository visibility is not causal proof.

| Failed native case at that checkpoint | Seconds |
| --- | --- |
| `contacts-wires-gallery.spec.ts` / contact and continuous-wire gallery retains native closeups, cavity evidence and stable GPU resources across ten cycles | 461.432 |
| `depth-artifacts.spec.ts` / native WebGL hidden-layer regression DPR 2 | 365.011 |
| `flexible-placement.spec.ts` / generic property drafts and native drag-drop produce compact forms and actual multiview visual evidence at both viewport sizes | 294.994 |
| `labels-contact-interaction.spec.ts` / native Label placement, Unicode edit, transforms, duplicate/delete and cancelled previews retain history and persistence | 242.843 |
| `ribbon-shell.spec.ts` / native pending physical preflight keeps one owner across tab/collapse changes (Cancel) | 36.559 |
| `ribbon-shell.spec.ts` / native pending physical preflight keeps one owner across tab/collapse changes (release) | 41.222 |
| `sealed-package-models.spec.ts` / sealed package gallery retains actual native renders of every family and molded-lead closeups | 185.880 |

Earlier native run [40690833525](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833525) separately remains 50 PASS / seven FAIL / one optional NOT_RUN; its trace diagnosis SHA-256 is `5274772e570523326106aa4341883ccac07d2f9f6d54cb42caf4b88a3a9d2660`. Neither failure is replaced by earlier Windows/local Linux acceptance. Tag pushes may trigger 14 additional workflows; no blanket tag-CI success is claimed.

Hosted authenticated [Integration / system-artifact-access](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40690833573) passed actual selected private/draft downloads, digest checks, clean installation, pip checks and isolated origins; original receipt SHA-256 `c96f5739d8f88656ad6707397cbeb3ccd9802a5efe6c6dd72aea6f974a3ea7c7`. The selected-six Contents-read PAT configuration is user-attested, while receipt `credentialScopeVerification: NOT_VERIFIED` does not establish least privilege. Workflow `contents: read` and secret scope are separate; current authenticated bootstrap remains required.

After publication, all **17 anonymous downloads PASS**: 15 selected artifacts, rollback and the system manifest, with no Authorization header and exact digest verification. Receipt SHA-256 `7c475688fadbb6843d1f2591caf1d0cb4b21e5fa490051848bd5a6374259f7d3`. This proves public binary transport, separately from the authenticated clean-install receipt.

### Published selected artifacts

| Owner / role | Exact build source | Asset | Full SHA-256 |
| --- | --- | --- | --- |
| Remote / python | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | [netcircuit_api-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Remote/releases/assets/684944254) | `50d3d2610ceaa0d00d926c83e4d4a9b5039ecc2a67fa8d19d979d28f051a1906` |
| Remote / sdist | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | [netcircuit_api-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Remote/releases/assets/684944433) | `badc2f9308d3f3e48ff79ec73ac20e2337b22a3c7cfbc779029444599d43feba` |
| Remote / deployment | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | [netcircuit-remote-0.1.1-deployment.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Remote/releases/assets/684944615) | `0c4af2a06a9a03f0a662862aa934db7a026ffe4b4b01a30593f3518d9c2d179d` |
| Contracts / python | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [netcircuit_contracts-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226130) | `5dd663c6bfe6b9dd39b5f4b86ffd24eeed8bed9b2898aaedb35f99debb0cbcc2` |
| Contracts / sdist | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [netcircuit_contracts-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226235) | `9e15850d42ddc61311979cec2df95f5e55d07699e7cbfd83a8f24f0b988b4e07` |
| Contracts / npm | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [tinihi-labs-contracts-0.1.1.tgz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226359) | `3bfc8b6f84b645cd6b7864bd1391de1d5efdc6ee4ba653cb92e145a3ddd2bc83` |
| Contracts / dev | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [netcircuit_artifact_paths-1.0.0a1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226469) | `ff76532c69b2115338edb641660c966c5459dd40cb806f52a1e2e8c379c70a1f` |
| Contracts / dev_npm | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | [tinihi-labs-artifact-paths-1.0.0-m1.0.tgz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226570) | `53190cceb3eee6bb92e91edf1eda0c01043e0ea095cbba1e745a0f7103e6f6df` |
| Interface / source | `7a266d15b510d840ad3146515a3699760564ed32` | [netcircuit-interface-0.1.1-source.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Interface/releases/assets/684942791) | `bd3f529454dd129d90a27ce7ee76c84400481f1cc6452150d32233973c42c4b4` |
| Interface / static | `7a266d15b510d840ad3146515a3699760564ed32` | [netcircuit-interface-0.1.1-static.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Interface/releases/assets/684942968) | `f7e87d32b314982503a7e9bd1f213812c6a927914276f98825983191ac924055` |
| Simulator / python | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | [netcircuit_simulator-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Simulator/releases/assets/684943145) | `78b857369baec88800d08e37977afacca3321decd05b6cd50ea925c033ea7b89` |
| Simulator / sdist | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | [netcircuit_simulator-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Simulator/releases/assets/684943330) | `6afd1b9a68768f527fd5ee1f864287c88d56b6a97c0a7fd7b2b7bd560bb0cfd2` |
| Hardware / python | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | [netcircuit_hardware_service-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Hardware/releases/assets/684943575) | `f6fc643bc40130a0f8b4136db8db4f8abe1b0b366efaffa8c1866786429d9e9b` |
| Hardware / sdist | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | [netcircuit_hardware_service-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Hardware/releases/assets/684943851) | `3754bfc3338cc6c17dd66b16788c502cdd414e2b4e01a1e2c0ffaed24b0060fb` |
| FPGA / source | `24ade35eade5382efd42f784008280c0fbb768c3` | [netcircuit-fpga-scaffold-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-FPGA/releases/assets/684944031) | `b82edb4167b821f55d98331304d0c49d2f37638d972fc9c167287bb6368908ca` |

### Disposition after the historical publication checkpoint

The subsequent explicit history-only authorization and actual 11/16 cleanup are
recorded in the current section above. The old publication binding remains
unchanged and does not establish native acceptance. Earlier statements about
pending cleanup describe their historical observation, not the current state.
Current rename-source integration/hosted/native acceptance and a new final
recoverable handoff remain open. `Multi-Repo`, `refactor` and their worktrees
remain preserved. No production restore, deployment or board programming is
claimed.

## Historical browser CI environment candidate at 23ca0827

The user then requested continuing publication while fixing Browser. Six immutable releases and the 17 anonymous-download proof remain unchanged. No native result is promoted by this new instruction.

Both completed hosted Linux attempts retain 50 PASS / seven FAIL / one optional historical NOT_RUN. New trace decoding showed physical-preflight Cancel existed until the real 10-second API deadline expired during slow UI toggles; the flexible TOP preset completed after its assertion deadline. A renderer-double CPU probe took 17 ms for 20 drawer/frame operations and 8.78 ms for 20 camera/frame operations; this isolates the local CPU control logic and is not native performance acceptance. Actual native stage profiling found both GPU-draining readbacks and, in the PSU closeup, repeated foreground raycasts. Concurrent local Docker preparation limits absolute timing comparisons. These diagnoses do not prove a bad graph, incorrect pixel result or a lost execution owner.

The bounded CI candidate changes only the browser job to `windows-latest`, explicitly defaults its run steps to Bash and renames platform dependency installation. A sanitized resource stdout step records actual OS/Python/CPU affinity/memory so future runner claims have measured context. Existing Python/Node/Playwright pins, versioned Interface source artifact, 58 test bodies, DPR, deadlines, retries, single worker, full-list command, real loopback API/RPC services, safe restart/shutdown and owned browser/runtime evidence policy remain unchanged. The already recorded complete Windows baseline is a reason to test this environment, not a claim that the new hosted Windows gate passed. Production Linux service compatibility retains its independent Linux backend/Contracts/Web/integration coverage and separately recorded full local Linux browser result.

At the initial candidate checkpoint, hosted Windows native acceptance was NOT_RUN; its later actual cancelled result is recorded in the current section above. No published artifact/tag is overwritten, no new product version is introduced, no baseline/assertion is weakened and no migration branch is deleted. This workflow change does not rebuild the API/deployment packages or change the canonical system manifest. Fresh workflow syntax/policy checks and exact-master hosted results follow before any full M6 acceptance claim.

### Original shared-session cleanup and final metadata handoff

The original six-root session was canonically removed after native/collector
process closure and evidence inspection. Cleanup receipt SHA-256
`fcce9feef17bc4ea1a3d551eb52a934573941b9cc250978a643082a9220788c0`
records exit zero, the original session absent and all six HEADs, refs,
worktree/status snapshots, LICENSE bytes and ignored-path inventories unchanged.
The original owner/six-root context was retained. Durable Git bundles, selected
release artifacts, all 13 candidates and inspected native proof remain separate.
The independent tail session uses a global Python base and pinned DEV allocator;
its final metadata checks, normal documentation promotion/backup and cleanup
are recorded in the durable final handoff inventory outside Git. These later
metadata-only steps do not relabel API282/Interface461 artifact build sources.
Hosted old-set acceptance remains NOT_PASS, and a new artifact release requires
the user's explicit version/release choice; no immutable asset or tag is replaced.

## Historical execution chronology

Earlier stops, pending statements, inventories and measurements retain their recorded scope; this publication checkpoint supersedes only their publication disposition.

**Historical stopped scope, 2026-10-28:** the user subsequently instructed “Không cần commit và push và merge”. New source changes are retained uncommitted for build/test and review. Further commits, pushes, merges, tags/releases and branch cleanup are stopped; earlier authorized history/refs remain preserved. The successful Windows baseline below belongs to committed Interface 4cbbee16, while its later Linux failures and subsequent working-copy fixes have their own scope. No release completion is claimed.

## Historical resumed publication preparation

The user subsequently explicitly authorized continuing the four publication/master/branch-cleanup items. This supersedes the previous Git stop for this resumed phase; the local-only chronology below retains its original results and limits. All six checkouts/indexes were clean at resumption. Remote is now user-committed/pushed `1b567336d5b23de3bd827e0f992be791dd1bab2b`; Interface's verified `7a266d15` remains local ahead of its published migration branch. All six live masters still match the earlier recorded master tips, all current tips preserve the required extracted ancestry, and no live `v0.1.1` tag exists. Existing releases are drafts. Ordinary master fast-forward remains feasible; branch deletion requires new final bundles and fresh live reachability checks.

The user confirmed the six repository secrets use a TINIHI-Labs fine-grained token limited to those six repositories and Contents read-only. This is a user-provided permission attestation, not secret-value inspection or a permission conclusion from a successful download. The separate publication credential identifies `NguyenHien-8` and has admin/push access; its broader OAuth scopes are not attributed to the CI secret. Actual hosted consumer access is still pending.

Fresh hosted CI at `1b567336` found one failing fixture in Contracts (`776 PASS / 1 FAIL`): `test_actual_isolated_probe_ignores_checkout_shadowing_and_rejects_wrong_wheel_digest` reads the parent interpreter's source-shadowed API metadata and receives no `direct_url.json`. The isolated installed-origin probe itself is unchanged and strict. This new failure is not relabelled as PASS; its focused regression repair and hosted rerun are pending. Other observed Backend, Frontend, Hardware consumer and isolated installed-packages jobs succeeded at that revision.

Ten selected artifact payloads differ from the older draft selection; the five Contracts/DEV payloads match. Preserve the previously verified 15-artifact local set and its exact producer revisions. Draft asset metadata may be archived by renaming old filenames while retaining their IDs/numeric URLs/payloads/digests, then fresh selected bytes uploaded under canonical filenames/new IDs. Supported numeric-ID consumers do not inspect HTTP asset filenames. Human tag/filename download URLs are not claimed preserved. No old asset payload, source or historical evidence will be deleted. All binding changes, actual downloads, CI results, policy changes, final master/tag identities and guarded cleanup outcomes remain pending until executed.

Publication preparation now PASS: six new pre-promotion bundles were each restored into a fresh mirror, all refs/HEAD checked and strict fsck passed. Durable inventory `C:/Users/trann/.codex/migration-release-backups/m6-promotion-20261028-f79860e8/pre-promotion/BACKUP_INVENTORY.json`, SHA-256 `531e89d398f2ec43830cd840d4d49f3b074ccb913f7131401be82bffbe9c5797`. These snapshots intentionally exclude then-uncommitted fixture/documentation changes; final master bundles remain required before deletion.

All 15 selected draft artifacts were downloaded and SHA/size-verified after staging. Five byte-identical Contracts/DEV assets retain their existing IDs; ten earlier draft assets were metadata-renamed to `archived-<sha12>-<original-name>`, retaining IDs/bytes and recorded original labels, and ten fresh artifacts uploaded under canonical filenames/new IDs. The old numeric URLs were downloaded again and remained byte-identical. No assets were deleted. The reviewed reproduction-input ZIP was uploaded separately as asset `684944690`, with its existing path-remapping limitations. All 60 changed existing CI variables across the six repositories were read back exactly; no CI secret value was read or replaced by the publication credential. The committed system manifest now selects precisely the already tested local payloads, using numeric GitHub IDs, unchanged compatibility/rollback inventory and exact producer revisions. Older build recipes remain explicitly historical metadata, not reproducibility claims for the new API archive.

Five producer masters have been fast-forwarded/pushed without changing their trees or ignored-path inventories: Contracts `54ef9f6`, Interface `7a266d15`, Simulator `ff63616`, Hardware `de65db8`, FPGA `24ade35`. Hosted master CI is being checked before final acceptance; tags/releases and original migration-branch deletion have not yet run.

The hosted fixture defect was reproduced RED with actual temporary checkout egg-info and repaired by constraining expected hash discovery to the executing virtualenv's purelib/platlib metadata. The production isolated-origin probe, checkout-shadow rejection and wrong-wheel-digest assertions are unchanged. A subsequent unfiltered local file run recorded 26 PASS / one FAIL: the existing cleanup fixture failed to undo `npm_config_cache` when initially absent. A deterministic absent-cache regression reproduced that failure; registering/restoring absent environment keys repaired the fixture without changing bootstrap behavior or its complete environment-equality assertion. Focused metadata (two cases) and cleanup (four states) GREEN, then the complete unfiltered file PASS: 27 tests, zero skips, 510.81 seconds. The earlier failed attempts remain failed. Separate release/local-mode/workflow/documentation/provenance/link verification PASS: 106 tests in 155.09 seconds. Fresh static review found no actionable findings in the test/manifest changes. No API, Interface, Simulator, Hardware or RTL behavior changed in this resumed repair.

## Historical local continuation at clean producer tips

The user subsequently requested completing the remaining local checklist in the original M6 plan, without another task Markdown file. At this continuation's start all six original worktrees and indexes were clean. The following commits were already present; this continuation created no commits or branches. Independent temporary clones with canonical LF checkout bytes supplied the new builds. The approved LICENSE Git blob remains `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7` in all six repositories; original checkout assets, historical evidence and original ignored files are preserved.

| Owner | Clean committed build input | Fresh standalone result |
| --- | --- | --- |
| Remote | `82ca15bec250894c39c2849ab4a3eaaeb7712b05` | API wheel repeated byte-identically and rebuilt identically from selected sdist; deployment archive repeated identically from ten committed source files |
| Contracts | `54ef9f6a11f4906c11ec9789de47cf06d5100734` | 500 primary tests, one CI test, 15 Node allocator tests and two Python bridge tests PASS; generation/catalog/topology/public compatibility, actual SDK pack and isolated installed-resource probes PASS |
| Interface | `7a266d15b510d840ad3146515a3699760564ed32` | 21 tooling tests, 1,461 unit/type tests and nine bootstrap checks PASS; 229-module AST boundary, E2E types and all three production entrypoints PASS; two source/static builds byte-identical |
| Simulator | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | 110 tests PASS, zero skips; selected installed-wheel provenance/pip check and repeat/sdist-to-wheel equality PASS |
| Hardware | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | 108 tests PASS, zero skips; installed Contracts/Simulator/Hardware provenance/pip check and repeat/sdist-to-wheel equality PASS |
| FPGA | `24ade35eade5382efd42f784008280c0fbb768c3` | 19 tests PASS, zero skips; mandatory pinned slang/Icarus/vvp execution with `LAB_FIRST_RTL_PASS` and `PERMIT_MATRIX_RTL_PASS`; source archive repeated byte-identically |

Build tools: isolated Python 3.12.12 and complete Node 22.23.3/npm 10.9.9. Official Node Windows archive SHA-256: `2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`. Python was installed without user/global registration. Contracts/DEV reconstruction also uses the reviewed Python 3.14.4 archive-compression/newline profiles to reproduce the existing exact pins from freshly generated payloads, without copying old package payloads. DEV remains Python `1.0.0a1` / npm `1.0.0-m1.0`; all six products remain `0.1.1`.

Native Python sdist builds differed only in archive metadata. Fresh A/B file inventories and payload hashes were checked before metadata-only normalization to each current commit's `SOURCE_DATE_EPOCH`. The selected Remote/Simulator/Hardware normalized sdists are byte-reproducible, and each rebuilds to its exact selected wheel. Raw nondeterministic build attempts remain honestly recorded, separately from the normalized selected output. The first Simulator and Hardware standalone attempts each had one missing staged DEV-bootstrap fixture; their native bootstrap was prepared before the complete unfiltered passing reruns. No source assertion or product behavior was changed for those preparation failures.

The retained local set is `C:/Users/trann/.codex/migration-release-artifacts/m6-local-0.1.1-20261028-82ca15b/`, containing 15 freshly built selected artifacts, the unchanged reviewed rollback bundle and `release-set.local.json`. Manifest SHA-256: `f139fe942f0ca83c53290f074377b4d120335a0482fd2ae087afe9dff4b5c238`. It explicitly declares `distribution: local`, exact absolute file paths, full digests and the six committed producer revisions. The original selected GitHub manifest and old durable artifacts remain unchanged; this set is not a publication or tag.

Reviewed normalization/reproduction inputs are retained separately in `reproducibility/m6-reproducibility-inputs-0.1.1-82ca15b.zip`, SHA-256 `9dc5886ee214bc6e535ffe13965a44a2c9d504f67e4cd9fef5c6a9ee3cb974dc` (75,180 bytes; 28 inspected members). The allowlist contains scripts, archive/newline profiles, a README and inventory, with no package payload, log, database, capture, image, trace or dependency tree. Historical absolute input paths require remapping; this is retained reproducibility input, not a portable automated pipeline. Native Interface/FPGA builders remain authoritative in their recorded Git commits. Retention did not change the selected manifest or integration locks.

New uncommitted consumer tooling adds explicit `--local-artifacts` support to installation and rollback verification. Default GitHub mode remains strict, including canonical numeric asset URLs, and rejects local/mixed transport. Complete local file validation precedes bootstrap; copying rechecks digests. Version, compatibility, archive identity, selected-origin, matching-backup/quarantine/no-replay and canonical output-ownership checks remain required. The new consumer verification clone records its integration-tool overlay hashes separately from the clean committed runtime/deployment producers.

The first actual local CLI attempt failed before runtime installation because the native Interface builder's canonical HTTPS repository URL omitted `.git`, while Remote's extractor required it. A deterministic regression reproduced that mismatch (one failing case, 28 passing); the minimal adapter correction additionally admits only that exact canonical unsuffixed URL. All 29 extractor tests then passed, including rejection of HTTP, credential, query, fragment and similar-name aliases. Independent review approved the correction. Fresh installation and integrated acceptance are recorded below when complete; this initial failure is not counted as PASS.

Explicit local rollback support also followed RED/GREEN: nine new failures reproduced the missing keyword/CLI support before implementation; the existing release and local suites then passed 64 tests with zero skips. Independent review approved installation, Interface provenance and rollback changes with no actionable findings. The rollback checker never infers permission for local transport from a saved state; the explicit flag remains required.

The second attempt used another independent Remote clone and a newly empty Python 3.12 virtualenv. Actual `scripts/install_release.py --local-artifacts` PASS in 413.297 seconds: all 15 selected files and the rollback archive were verified, all 15 preserved rollback inventory entries checked, Interface source/static and FPGA extracted with committed provenance checks, four exact runtime wheels installed and API isolated-origin/69-file payload verification passed. `pip check` PASS. No artifact credential was supplied. The producer revisions remain clean; six new consumer Python tooling/test overlays have separately recorded SHA-256. Full release prerequisites and the 18-command integrated plan are in progress.

Actual local rollback CLI verification also PASS in 246.491 seconds with explicit `--local-artifacts`: 18 PostgreSQL backup/restore tests, ten replay/quarantine tests (zero skips), and the isolated installed-wheel migrations/CLI/domain/NCAP v1+v2/RPC/resource gate. The CLI correctly keeps its own full-prior-artifact field NOT_RUN because those three registered gates do not perform the separate complete prior-set scenario recorded next. The 18-command release plan was inspected before execution; Contracts/consumer provenance, generation, installed-API OpenAPI equality, public compatibility and npm SDK conformance have passed. The complete Python/Web/browser/package release invocation remains in progress.

The first complete Python invocation finished with 1,407 PASS, three FAIL and two Windows symlink NOT_RUN in 3,646.46 seconds. All three failures are real harness/orchestrator startup deadlines: the API was not ready within 30 seconds, and two repeat/output lifecycle orchestrations exceeded 110 seconds. The full runner stopped at Python; Web/browser/package were not executed by that invocation. It inherited a 14-Git-root build/diagnostic context containing eight dormant temporary producer/consumer clones. API startup validates the owned session and data path through canonical Git-family discovery before emitting a readiness log. This startup/context overhead is under investigation; the failed run remains FAIL. A new clean acceptance environment will declare its actual participating roots (the original six repositories and its own consumer clone). Canonical independent discovery still rejects outputs inside any unrelated Git destination. Product sources, assertions and deadlines remain unchanged.

Independent sequential timing observations measured real canonical Python bridge session/data admission at 26.171 seconds for 14 roots (17.375 get + 8.796 validate) and 12.125 seconds for seven roots (8.157 + 3.968), before API imports. These are single observations, not a general benchmark or proof of an exclusive cause. The two failed orchestrator logs include successful HTTP/auth/project activity and orderly shutdown before their cumulative deadline; they are not described as wholly unstarted backends. No failed-run API/orchestrator children remained.

A new independent consumer clone and initially empty virtualenv then installed the same retained manifest successfully in 255.232 seconds, with exact package/rollback verification and `pip check` PASS. Its context names the original six repositories and its actual consumer clone; dormant build clones supply no runtime inputs, while canonical unrelated-Git destination discovery remains active. All three unchanged failed tests PASS together in 375.24 seconds, zero skips, including the same 30/110-second deadlines, first real worker capture/EOF, repeated fresh state, authenticated in-run restart and explicit-output adoption. No product, source assertion or deadline was edited. The complete 18-command gate is being rerun in that environment; the earlier three-failure run remains separately failed.

The complete unfiltered Python retry PASS: 1,410 tests, zero failures, two Windows file-symlink NOT_RUN, one dependency deprecation warning, in 2,472.89 seconds. All three harness/orchestrator regressions passed again inside that full invocation. All 11 preceding Contracts/resource/generation/OpenAPI/public SDK commands also passed. The consumer-selected Web AST boundary gate passed 229 modules; Web unit/build, real PostgreSQL, native browser and final package gates remain in progress until their actual results below.

The same full runner then passed consumer-artifact Web verification: 1,461 unit/type tests, zero failures/skips, plus the nine bootstrap checks; all three production HTML entrypoints built successfully. The real PostgreSQL group passed all 18 tests in 21.80 seconds. The native browser group has started through the standard Remote lifecycle launcher, line/JUnit reporters and `--forbid-only`; native browser and the final installed-package gate remain pending until completion.

That browser invocation was interrupted after reaching case 43 of 58; it is incomplete and not accepted as a full-suite result. Case 38, the sealed-package family gallery, had already FAILED its unchanged 10-second native-graph export poll. Trace inspection found the File and Export clicks together took approximately 11 seconds; the actual downloaded graph subsequently matched the expected graph, after the outer deadline. This distinguishes a late correct export from a graph-equality failure, without establishing the scheduling root cause. The original ten-cycle gallery and preceding DPR checks passed in that invocation. No product source, assertion or timeout was changed. A fresh standard browser run and the final installed-package group are in progress; their actual outcomes must be recorded before local acceptance.

A new actual prior-artifact rollback rehearsal PASS used dedicated database `netcircuit_m6_rollback_eed02f576c7c49af` on the owned test cluster. A fresh isolated new runtime (API `50d3d261…a1906`) wrote a crash/quarantine fixture; actual `pg_dump` plus a matching capture backup was restored into fresh schemas, then read by a fresh isolated prior runtime: API `0.1.0`, Contracts `1.0.1`, Simulator `0.2.0`, Hardware `0.1.1`. Every prior package file and archive digest was checked, with no editable/source imports. Owner experiment/capture reads returned 200; authenticated foreign reads returned 403; the same Run retry returned the recovered FAULT state. Private data, quarantine and the RESTART_RECOVERY audit survived. The guarded control stub observed exactly one deliberately unacknowledged Stop and zero Start calls; it rejected other control calls. Source state stayed RUNNING; restored state became FAULT while retaining quarantine. The initial unauthenticated foreign fixture correctly returned 401 and was corrected by authenticating before the complete fresh restore/rerun; that attempt remains separately failed.

Rehearsal result SHA-256: `9ecce51546444575db7ccbc2ff1a4f63ce3a04d870ea57d10a28608dfdbfcabd`; actual dump `68535bf13052b29d48f9ffbe96987a6f6f775238dcb4c0971b8c9ca64b04bb06`; restored SQL `8ba3395098ab9859767fa054a353468452a663d917796b3ff2a043270d251cf8`; source/backup/restored capture all `18aee363a86cc34651f70dccc601befc047ac07f02d120dfde4a6641a67edeb2`. Only the dedicated rehearsal database was removed after inspection, without FORCE; the root test database and original PostgreSQL service remained unchanged. This proves the isolated package/database/capture recovery scenario, not an old-browser/RTL run, physical operation or production restore.

Local handoff prechecks PASS: canonical context, Markdown (196 files), worktree/index artifact guard, five Node allocator/guard tests, 12 documentation/provenance/context/link tests, and `git diff --check`. A fresh six-repository identity check confirmed the recorded HEADs/branches and LICENSE blob, six empty indexes, ten uncommitted Remote paths and five clean producer worktrees. Ignored-path inventories were inspected separately. These checks precede the final browser/package outcome and owned cleanup; they do not establish publication or clean master synchronization.

The independent standard native browser repeat PASS: all 58 cases were enumerated in their original order, 57 mandatory PASS, one optional retained pre-fix evidence case NOT_RUN, zero failures/errors, in 35.7 minutes. JUnit SHA-256: `120af9b0c3311f484f7c5c18568b068c270ff33080fe9b116b66711239292a08`. It used one worker, zero Playwright retries and `--forbid-only`; source assertions, timeouts, browser revision and renderer flags were unchanged. The failed gallery then passed all nine package configurations, including LED import/export and molded-lead closeups. Both DPR gates, recovery/privacy/authentication, preflight ownership, camera, native placement/input/history and server hydration cases passed. The earlier interrupted/failed invocation remains failed; its renderer-response stall was not reproduced and its exact cause remains unproven.

Actual new gallery/LED PNGs were inspected, together with the failed PNG/trace and current JSON resource evidence. All ten gallery add/remove cycles returned to 177 geometries and nine textures. This is scoped native software/browser evidence; no physical driver or board operation is implied. The final installed-package group follows this independent browser repeat. The interrupted `--group all` process is not relabelled as an exit-zero 18-command run; the unchanged completed Contracts/Python/Web/PostgreSQL groups and the independent browser/package invocation provide separately recorded gate results.

Fresh read-only local history checks also passed: six pre-M6 migration tips, six existing master tips and five filtered tips remain ancestors of the current six HEADs (17 checks). The six history joins, including both Hardware joins, preserve their first-parent trees. Local master and cached `origin/master` refs match the durable preflight; this is not a new remote-live or post-promotion reachability claim.

### Historical local acceptance and handoff

All mandatory local release groups now PASS across the explicitly separated invocations above. The independent browser/package runner exited zero: four commands in 2,393.9 seconds (outer preparation/wrapper elapsed 2,411.163 seconds). The standard installed-package gate builds API from the unchanged consumer API source and selects the reviewed Contracts/Simulator/Hardware wheels; its isolated probes passed migrations through `0007_auth_maintenance`, administrative/capture CLIs, domain invariants, NCAP v1/v2, actual spawned Simulator and loopback Hardware RPC, unsafe-bind rejection, shutdown and `pip check`. The selected producer API wheel was separately installed and checked by both actual system installations; the package gate's locally built API wheel is not relabelled as that selected archive.

| Current local gate | Result |
| --- | --- |
| Six independent committed producer builds / selected artifact set | PASS: 15 new selected artifacts; exact source commits, versions and digests retained |
| Actual artifact-only clean system installation | PASS twice; initially empty virtualenvs, selected API origin/payload check and `pip check` |
| Contracts / Python / Web / real PostgreSQL | PASS: generation/OpenAPI/public SDK checks; 1,410 Python, 1,461 Web plus nine bootstrap, 18 PostgreSQL tests |
| Native browser | PASS: 57 mandatory, one optional historical NOT_RUN, zero failures/errors; unchanged order/assertions/deadlines |
| Isolated installed-package group | PASS: migrations/CLI/domain/NCAP/RPC/resources with no editable producer imports |
| Rollback CLI and actual prior-artifact paired backup/restore | PASS with quarantine and no Start replay; separately scoped proofs above |
| Static review / canonical documentation and output checks | PASS with no actionable review findings, including post-cleanup canonical documentation/artifact/Git readback |
| Temporary evidence/process cleanup | PASS: inspected evidence, exited runtime processes and all five current owned sessions canonically removed |
| Publication, minimum-permission credential acceptance, hosted master CI, Git promotion and migration-branch cleanup | NOT_RUN under the user's stopped Git scope |

Final evidence inspection rechecked all 15 selected artifacts plus the unchanged rollback bundle against the retained manifest. The complete physical browser copy matched all 604 installation-cache files (excluding only documented link/old-log exclusions); the source cache contained no debug log, while the owned headless-shell copy contained its executable-adjacent `debug.log`. That log's generic ReadPixels performance warnings were inspected; they are not causal proof for the earlier stall. Inspection receipt SHA-256: `35680e851f2408a00316e047af456d2cedc91f6b0548468bcf4a104405b11e89`. Package log SHA-256: `3b7baa83b111938a7140f89fa8d8df625f77796dd24a7790ad4df74c0628517f`; independent browser/package log: `ef619723fbee3f536076b821302c93bde2305e9890c958421431639b56fd3158`; scoped aggregate receipt before cleanup: `5c7a7b0c7bef5c5f3aca9e71091c0af407dd63448f7417e98cc6baded7a7e71c`.

New changes remain confined to Remote's four integration scripts, two test files and four existing documentation files (ten paths). Five producer worktrees remain clean; all six indexes are empty. No new task Markdown, source/history deletion, branch/ref mutation, commit, push, merge, release/tag publication, deployment or license change was performed by this continuation. The existing canonical GitHub release manifest, older durable artifacts and all historical verification records remain preserved.

Local cleanup PASS used the unchanged pinned canonical allocator (`7c42c4fd171ed861b365f08501f3c765282d6bba2dcd6430c9677cddd1abe345`), global Node outside every deletion target and each session's original marker/context. The guarded first cleanup attempt stopped before deleting anything because the test cluster was already offline; readback confirmed `pg_ctl status` reported no server, the stale PID file named this owned data directory/port and port 15432 refused connections. No database server was restarted or killed. The original PostgreSQL service on port 5432 remained available before/after cleanup. All browser/API/package child processes had exited.

The five explicitly owned session roots were removed in dependency order: `netcircuit-p6JC9E` (acceptance3), `netcircuit-kBq3re` (acceptance2), `netcircuit-ptrZn2` (acceptance1), nested `netcircuit-wz0kCH` (build), then `netcircuit-x4txu8` (clone/orchestration parent). Canonical cleanup returned success for each. No arbitrary recursive-delete fallback was used. Original repositories/worktrees, source assets, old ignored outputs, historical evidence, durable backups, the old release set and the new 15-artifact set/rollback/reproduction inputs remain preserved. The final source-identity receipt before cleanup is `cbbfba17d6ea6d711fdf7e4c105b430f28ecb45ad811b5c4f1cc418a62917db8`; six ignored-path inventories matched their pre-cleanup observations. Final canonical context/Markdown/artifact checks and Git readback follow this documentation update.

Post-cleanup readback PASS: canonical context, Markdown (196 files), worktree/index artifact guard and `git diff --check`. Reconstructing the source-identity receipt with its actual Windows CRLF serialization matched the exact pre-cleanup SHA-256 `cbbfba17d6ea6d711fdf7e4c105b430f28ecb45ad811b5c4f1cc418a62917db8`: all six HEADs, branches, empty indexes, statuses, LICENSE blobs and ignored-path inventories were unchanged. The six tested integration code/test overlay hashes also matched. All five owned session roots were absent, the retained local manifest still matched `f139fe94…c238`, port 15432 was offline and original port 5432 remained available.

All currently authorized local M6 work is complete. Remaining publication, hosted-master acceptance, credential-scope acceptance and master/branch promotion items are NOT_RUN by scope, not successful release claims. New Remote changes remain unstaged/uncommitted for the user's review; no further phase is started.

## Execution identity

The initial authorization covered six repositories, commits, ordinary history joins, master integration/push, v0.1.1 releases and deletion of verified merged migration branches. The later scope override above stops further Git promotion and publication. All six initial worktrees/indexes were clean. Pre-M6 recoverable bundles and all historical bundles were independently restored and checked; full results are preserved outside diagnostic cleanup under `C:/Users/trann/.codex/migration-release-backups/m6-20261027-861fea6d/`.

GitHub resolves the legacy `net-Circuit-Remote/net-Circuit-Remote` repository URL to `TINIHI-Labs/net-Circuit-Remote` (repository ID 1410135215). New download URLs use the canonical API namespace to avoid credential loss across legacy redirects. Initial API and Git checks found no v0.1.1 collision. The existing Git identity has admin/push access to all six private repositories. Workflow defaults remain read; an existing credential was configured as an Actions artifact-download secret without recording its value.

## Gates

Historical snapshot before the local continuation: the table below preserves the earlier baseline, working-copy and hosted observations. Current committed producer tips, new local artifacts and fresh acceptance outcomes are recorded in “Local continuation at clean producer tips” above; the earlier PASS entries do not substitute for those current gates.

| Gate | Current execution disposition |
| --- | --- |
| Six initial backups / fifteen historical bundles / complete mappings | PASS: hashes, actual restores, refs/objects, strict fsck, projected trees and identities |
| History joins | Contracts, Simulator, Hardware and FPGA joined normally; current product trees preserved; Interface joined after committed product normalization, preserving its tree |
| M2 unchanged original gallery | Windows 4cbbee baseline and current dirty-candidate Linux full ordering PASS: ten cycles. Earlier hosted Linux failure remains recorded separately |
| Recovery responsiveness regression | RED reproduced payload inspection of impossible count; minimal early-bound fix unit GREEN; final committed artifact full browser PASS |
| Contracts source generation / pure suite | PASS 500 tests on c39c95c; API application-info normalization is the only OpenAPI document delta |
| Simulator / Hardware / FPGA candidate standalone | PASS final clean 110 / 108 / 19, with exact final Contracts and actual behavioral RTL, no skips |
| Remote manifest/installer/workflow focused tests | PASS: 41 focused workflow/plan tests, actionlint 1.7.12, actual fresh all-15 installer and complete 18-command release execution |
| Remote contracts/web/postgres/package | PASS on independent canonical-LF clean clone 771f4c2: exact installed resources/generation/public SDK parity, 1,448 Web units + 229-module AST/type/three-entrypoint build, 18 real PostgreSQL tests, clean four-wheel RPC/worker/NCAP package probes |
| Remote Python/browser | 771f4c2/4cbbee baseline: Linux Python 1,357 PASS / 0 SKIP; Windows Python 1,355 PASS / 2 file-symlink NOT_RUN and browser 57 PASS / 1 optional historical NOT_RUN. Later Linux browser: 18 failures, 52/58 started, cancelled at 90 minutes; no full acceptance |
| Initial working-copy input correction | Two-component snapshot: 1,452 unit/type PASS, eight focused tests PASS, three unchanged real browser cases PASS; clean export/install, 229-module AST/E2E type/three-entrypoint build PASS |
| Expanded working-copy input correction | Six forms: clean Windows/Linux install, 1,461 type/unit tests plus nine bootstrap checks on each, 229-module AST/E2E types/three-entrypoint builds PASS; standard full Linux browser 57 mandatory PASS + one optional NOT_RUN, zero failures. Current Git source hashes match the tested candidate |
| Working-copy artifact-access CI and failure cleanup | 53 focused checks PASS, actionlint 1.7.12 PASS; actual all-input installer job and shared pinned cleanup are implemented. Hosted execution of these uncommitted changes is NOT_RUN |
| Exact rollback artifact set and matching database/capture restore | PASS scoped software rehearsal: old exact artifact install/RPC/worker/NCAP; current-to-old PostgreSQL/capture restore, ownership, quarantine and no Start replay; old native browser/RTL not rerun |
| Durable publication / authenticated final downloads | All six draft releases prepared; all 15 product inputs plus rollback bundle downloaded by actual fresh installer with digest/provenance/version checks and pip check PASS; official v0.1.1 promotion pending |
| Least-privilege CI download identity | NOT_VERIFIED: current secret uses GCM OAuth gist/repo/workflow. No token rotation or explicit exception was supplied; the user instead stopped Git promotion |
| GitHub immutable publication | NOT_RUN: all six policies read disabled; enable-only guards are prepared and unused |
| Hosted master CI / master promotion / tag / branch cleanup | NOT_RUN; not requested under the revised scope |

The initial pre-info-version Contracts candidate is preserved separately; it is not the selected final release artifact. The API export review changed only `info.version` from 0.2.0 to 0.1.1. Historical schema/protocol/wire baselines retain their original bytes; compatibility assertions separately require the new application-info version and every other old anchor.

### Working-copy Git disposition

Historical snapshot before the local continuation: these working HEADs and change counts describe the earlier execution. The current continuation started from the six clean committed tips recorded above; its final working-copy handoff is verified separately.

Read-only live `ls-remote` checks on 2026-10-28 Asia/Saigon found each local master equal to its remote master below, with no official `v0.1.1` tag. All six indexes are empty. New changes remain on the existing migration branches; no master integration, publication or branch deletion follows the scope override. Product metadata on these migration lines is 0.1.1; the old master trees are not presented as the migrated product.

| Repository | Working HEAD / branch | Local master = live remote master | Working changes |
| --- | --- | --- | --- |
| Remote | `771f4c27d3afb9fc765934e65e5ea04fd0b9a351`, `codex/m6-remote-integration` | `295797c581acc3935f5e128fd3d23674c728ca65` | 16 unstaged/untracked paths: CI, cleanup helper/tests and current documentation |
| Contracts | `54ef9f6a11f4906c11ec9789de47cf06d5100734`, `codex/m1-contracts-extract` | `a5b17b1c17bce6a1d097c263110b82e8a4602024` | Tracked tree clean |
| Interface | `4cbbee16a158a16c432b0571f19b42bfd940ea9e`, `codex/m2-interface-extract` | `0ac420fc4090fe27ebc497579c28d0852f3f3c62` | Eleven unstaged/untracked paths after expanded fixes: six components, three regression test files and two verification documents |
| Simulator | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7`, `codex/m3-simulator-extract` | `b8765d9be221c9d1eb44bcc3827073f5e8ebdee3` | Tracked tree clean |
| Hardware | `de65db8b89d0dfa6dd4c430a41397555bc77111d`, `codex/m4-hardware-extract` | `2b0005f40dc826bc7940cd0af28c57ebb063fcb7` | Tracked tree clean |
| FPGA | `24ade35eade5382efd42f784008280c0fbb768c3`, `codex/m5-fpga-extract` | `aebac04f31f9af874b6cdff0da47b51ecfa16994` | Tracked tree clean |

Remote's unrelated `Multi-Repo` and `refactor` worktrees remain preserved. Source assets, licenses, golden baselines and protected historical documents have no new working-copy changes.

## Evidence ownership

The accepted clean-run logs, profiles, traces, screenshots, test databases, caches and isolated verification environments originated in canonical allocator-owned external sessions. Native browser runtimes were complete owned physical copies. Evidence was inspected before final guarded cleanup; the completed cleanup disposition is recorded below. Durable source/history/release archives remain separate and were not diagnostic cleanup targets.

One local Linux preparation was invalid and quarantined before any browser ran. An empty allocator result was not rejected before setup: four setup logs were created at the owned container root and a venv at `/work/remote/venv` in its copied Git tree, outside the required canonical session. Inspection corrected the initial assumption that the logs themselves were in Git. Owned container `netcircuit-m6-profile-bbb3c849` was initially stopped and preserved; no result from it counts as verification. Its four logs, venv configuration and read-only mount proof were inspected/hashed before disposal of the task-owned container during final cleanup. The original six repositories were not mounted writable (only external evidence was RW), and no original source was changed by this setup. The successor required a nonempty absolute allocator result, matching marker and canonical directory admission before any log/venv output; bootstrap output was first captured by the host's already owned session. This deviation remains explicitly excluded from passing evidence.

Later local preparation rejected an incomplete SDK manifest before browser launch. Two diagnostic driver attempts also provided no accepted measurement: the first selected system Python without the installed DEV bridge and failed before launch; the next missed Playwright 1.64.1's actual worker entry, so its gallery was interrupted after about 60 seconds when telemetry admission failed. Their original records remain INVALID/NOT_RUN. Independent review then checked the prepared venv/Node 22 environment, actual CLI and `workerProcessEntry.js` hook activation, canonical archive admission, empty per-arm caches, exact three-case identities, owned binary/arguments and measured CPU/quota/memory guards before the controlled matrix began. These prerequisite repairs change no product source or browser assertions.

Final read-only physical inventory also observed five ignored Root source `.pyc` files and 29 files in the original `services/api/.venv` with modification times during the earlier M6 execution window. The retained initial Root inventory lacks individual file hashes, so their original byte identity and the writer cannot be established from that comparison. They are preserved; this report makes no claim that every ignored cache remained untouched. The accepted clean-machine run and subsequent working-copy native probe used the fresh external venv, not that original environment. No new source `.log`, SQLite/database, trace or video output was found by this inventory.

## Fresh clean-machine verification

The independent Remote clone has no sibling source dependency, original virtualenv or original Node outputs. A fresh external virtualenv ran the actual `scripts/install_release.py` against private numeric API asset URLs with pinned digests and the existing consumer identity. All six inputs, wheel/sdist/npm identities, Interface source/static linkage, FPGA source identity and rollback inventory passed. The selected Python distributions are all exactly 0.1.1, with archive/RECORD/import/resource checks. A real PowerShell preparation executed both recorded environment sections, installed verification tools offline from the hash-inventoried third-party wheelhouse, bootstrapped the complete five-entry Contracts handoff, ran locked npm installation and pip/provenance checks. It printed `FRESH_POWERSHELL_RECIPE_AND_VERSIONED_INPUTS_PASS`.

An earlier independent dbd44eb checkout passed 727 Contracts tests with two Windows file-symlink skips, 1,444 Web units, PostgreSQL and package probes. Those measurements apply to the earlier Interface candidate and remain historical evidence.

The final independent LF checkout is exactly `771f4c27d3afb9fc765934e65e5ea04fd0b9a351`. It installed all 15 private numeric asset URLs and the unchanged rollback bundle into a new virtualenv, checked every SHA-256, ran `pip check`, and proved isolated `-I` imports/direct-URL provenance for all four product distributions 0.1.1 plus DEV 1.0.0a1. The selected Interface is 4cbbee16, source/static hashes f88b727b / d324eb77. The committed release manifest's SHA-256 is `170858f8b2ccddf4dd9b2ae2cbd409e3a93955e0744596e44affe51ea582cbd6`.

The actual `--group all --show-plan` contained 18 commands, followed by an unfiltered `--group all`: exit 0, 4,439.4 seconds reported by the runner. Its complete Python collection passed 1,355 tests with two explicit Windows file-symlink privilege skips and one warning in 1,772.07 seconds. The same feature source's actual [full Linux Python gate](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40582867188) passed 1,357 tests with no failures/skips in 276.90 seconds. SDK conformance retained 88 baseline and 89 public shape/profile checks. Web passed 1,448 units, type/229-module AST checks and all three production entrypoints; PostgreSQL passed 18 cases on the owned PostgreSQL 18.6 cluster; the final isolated package gate passed migrations, CLI/domain, real RPC/worker, resources and NCAP v1/v2 probes.

The standard full native browser run passed 57 mandatory cases in 36.8 minutes; the absent optional retained pre-fix baseline was NOT_RUN. JUnit reported 58 tests, no failures/errors and one skip; every file/title matched the independently collected final artifact suite. The unchanged original gallery completed ten cycles with stable removed-state geometry/texture/draw counts. Both the original held-tactile checkpoint/Export/Save/reload case and the delayed-real-GET hydration regression passed. The saved tactile document retained `pressed=false`; transient held input was not persisted. DPR 1/2 each measured 30 samples with `changed=0`; glyph, LED-orbit, inspection-pose, CLOCK and grid probes also retained their assertions. Original test deadlines, worker count, zero retries, DPR, assets and baselines were unchanged.

The Windows runtime was a fresh owned `br-<8hex>` physical copy: all 604 payload hashes matched the installed cache, and the active executable/log/profile paths stayed under its external owner. Native gallery, tactile, display and restored depth images, metrics, JUnit and raw logs were inspected. The browser API shut down with exit 0; final process/cache inventory and registered rollback verification are recorded separately.

## Reproducibility and source identity

Interface source/static archives reproduce byte for byte across two fresh exports, locked installations and builds. Simulator/Hardware wheels reproduce byte for byte from independent extracted sdists; FPGA source archives repeat exactly with actual pinned parser/compiler/runtime checks. API wheel reproduces directly with SOURCE_DATE_EPOCH=1793121716. Contracts/API sdist and Contracts wheel payloads reproduce exactly; saved reviewed archive-metadata profiles normalize timestamp-only differences to the exact selected SHA-256. DEV tooling independently reproduces both existing pinned wheel/npm hashes without a version or source/license change. Published recipe auxiliaries are listed in the system lock.

Interface's two local builds used the same recorded Python 3.14.4/zlib-ng 2.2.4 compression profile. The independent Linux CI build used Python 3.12.15/Node 22: all 566 committed source files and all 34 production static files were byte-identical. Only sidecar repository URI spelling (`.git` suffix) and gzip compression output differed. Re-archiving the Linux payload with the selected URI/profile reconstructed both selected hashes exactly. This proves cross-platform payload equivalence, rather than claiming identical archive bytes across different compression profiles.

`sourceRevision` means the actual committed artifact build revision. Later CI/manifest/verification commits are separately tracked; no artifact is relabelled as built from them. Contracts c39c95c artifacts remain unchanged after the CI-only allocator-fixture fix at 54ef9f6. API/deployment artifacts are built from dbd44eb; subsequent Remote changes are CI/test isolation and release metadata. The committed-baseline comparison rehashed all 15 archives and compared selected Git bytes against API 69, Contracts 151, Interface 566, Simulator 9, Hardware 9, FPGA 36 and deployment 10 tracked payloads, with no mismatch. This comparison predates the two working-copy Interface component corrections and does not claim their bytes match the selected old artifact. The three generated RPC files retain their separate deterministic-generation evidence. Reachability and live references would require fresh checks before any later authorized master integration and deletion.

## CI fixture repairs

The initial Remote feature CI at 1673fd7 exposed harness assumptions, not an accepted release. Integration had changed to the complete Python release launcher while an import test still searched only a raw pytest command; browser workflow assertions still expected editable API source despite wheel installation. Three fake same-version wheel tests inherited real npm selectors and GITHUB_ENV and could overwrite the job's selected manifest. The repair preserves actual venv/pip/RECORD/import and same-version replacement assertions, isolates fake artifact sessions, forbids network and proves the real manifest/GITHUB_ENV remain byte-identical. Focused RED: 5 FAIL / 2 PASS; GREEN: 7 PASS, followed by 2 PASS after explicit API temp defaults. Root Hardware/Simulator consumer jobs now select the independent Interface required by their real complete-collection probe.

Contracts feature CI first failed because DEV allocator tests lacked source/scratch declarations. The corrected step exports its current session before allocating scratch, so upload/cleanup owns the test output. Local DEV Node tests: 15 PASS; Python bridge: 2 PASS. Corrected hosted Contracts Python 3.11/3.12 and all other producer feature commits pass. Hosted master results remain a separate mandatory gate.

The second CI repair at efae943 isolates the synthetic Hardware manifest and job environment, retains same-version replacement/RECORD rejection, and replaces a false Python-package directory heuristic with exact Interface-owned TypeScript adapter and public SDK checks. CI-like regression RED: 3 FAIL / 4 PASS; GREEN: 24 PASS with private network blocked and both actual/copy job manifests and GITHUB_ENV byte-identical. The Frontend/browser setup-python home-cache post-action was removed because pip deliberately uses the canonical owned cache. Actionlint 1.7.12 and 31 focused workflow tests passed.

The exact final API wheel 6e2d581daa3c1c55b38bc0841e175a4803aa139e06c4556022562d2cc8b23c6f repeated the paired PostgreSQL/capture rollback successfully in cohort f07ab469307645b6868bba71. Its installed direct URL and all 69 application payloads matched the archive. Actual pg_dump18 backup SHA-256 bebcb2bbaeba0443063b2b2a4156beab53439d263fc8a58608979f13ddd1c27f; renamed restore SQL 6731e85c0d679c329c4d333404fd45758d4aafdee6ed2110ae26b15f51c459f1. Unchanged old API0.1.0 returned owner/capture200 and foreign403; capture digest matched, quarantine/audit remained, same Run retry stayed FAULT, only Stop was observed and Start count was zero. Exactly the two new owned schemas were removed, all other schemas and earlier cohorts preserved. The immutable old bundle was unchanged.

### Uncommitted artifact-access and cleanup correction

Integration now includes a manual artifact-access job using the real system installer, all 15 selected product inputs and rollback digest, fresh venv, `pip check`, and isolated installed-origin/version probes. It uses only the dedicated artifact secret and keeps workflow permissions at `contents: read`. Its sanitized download receipt does not assert that the separate credential has minimum scope. This new job has not run on GitHub because its source remains uncommitted.

A real failure-path reproduction allocated a session and published the canonical CLI, then made DEV pip installation exit 42 before the Root adapter cache existed. The old cleanup failed on missing metadata. The shared `scripts/cleanup-artifact-session.mjs` now verifies the published CLI against the tracked DEV Node digest and delegates session/context to that canonical implementation. A designated missing or altered CLI fails closed; fallback to the existing adapter applies only when no CLI was published. Twelve cleanup commands across nine Root workflows use the helper; a parsed comparison confirms no other workflow semantics changed during that extraction. Read-only inspection of the five producer cleanup paths found no equivalent bootstrap dependency.

Final focused verification: 53 PASS, zero failures/skips, in 38.89 seconds; actionlint 1.7.12, Node syntax and diff checks passed. Real canonical failure/cleanup cases preserve the entire inherited environment and are inspected before guarded deletion of their own sessions. Independent review approved the pin, delegation and workflow boundaries. This is local working-copy evidence, separate from the earlier full release run and the failing hosted browser job.

## Selected artifact inventory

All six product versions are exactly 0.1.1. The DEV wheel/npm versions remain independently pinned at 1.0.0a1 / 1.0.0-m1.0. The complete machine-readable selection, compatibility and rollback inventories are in [the system release lock](../../integration/release-set.json). Private asset API links require the same authorized consumer identity used by the installer and CI.

This inventory still selects the committed 4cbbee Interface candidate. Subsequent uncommitted input corrections are working-copy changes and have not been relabelled as these source/static artifacts or published as a replacement release.

| Owner / kind | Actual committed build revision | Artifact / authenticated download | SHA-256 |
| --- | --- | --- | --- |
| Remote / python | `dbd44eb53fda3efcd77577816e63cec41cf26df1` | [netcircuit_api-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Remote/releases/assets/682388199) | `6e2d581daa3c1c55b38bc0841e175a4803aa139e06c4556022562d2cc8b23c6f` |
| Remote / sdist | `dbd44eb53fda3efcd77577816e63cec41cf26df1` | [netcircuit_api-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Remote/releases/assets/682388290) | `2aa61caead5c57e8d27908554e2949a7641af6373115b089375101183e07c717` |
| Remote / deployment | `dbd44eb53fda3efcd77577816e63cec41cf26df1` | [netcircuit-remote-0.1.1-deployment.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Remote/releases/assets/682388377) | `14ae1ffd885b6fc3275daf7b60b7287b77a49904af71833f2849eccbf6acc016` |
| Contracts / python | `c39c95cbea2228bd9f5f04e3c8e78b40e4761b22` | [netcircuit_contracts-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226130) | `5dd663c6bfe6b9dd39b5f4b86ffd24eeed8bed9b2898aaedb35f99debb0cbcc2` |
| Contracts / sdist | `c39c95cbea2228bd9f5f04e3c8e78b40e4761b22` | [netcircuit_contracts-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226235) | `9e15850d42ddc61311979cec2df95f5e55d07699e7cbfd83a8f24f0b988b4e07` |
| Contracts / npm | `c39c95cbea2228bd9f5f04e3c8e78b40e4761b22` | [tinihi-labs-contracts-0.1.1.tgz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226359) | `3bfc8b6f84b645cd6b7864bd1391de1d5efdc6ee4ba653cb92e145a3ddd2bc83` |
| Contracts / dev | `c39c95cbea2228bd9f5f04e3c8e78b40e4761b22` | [netcircuit_artifact_paths-1.0.0a1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226469) | `ff76532c69b2115338edb641660c966c5459dd40cb806f52a1e2e8c379c70a1f` |
| Contracts / dev_npm | `c39c95cbea2228bd9f5f04e3c8e78b40e4761b22` | [tinihi-labs-artifact-paths-1.0.0-m1.0.tgz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Contracts/releases/assets/682226570) | `53190cceb3eee6bb92e91edf1eda0c01043e0ea095cbba1e745a0f7103e6f6df` |
| Interface / source | `4cbbee16a158a16c432b0571f19b42bfd940ea9e` | [netcircuit-interface-0.1.1-source.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Interface/releases/assets/682835101) | `f88b727b15d3f847f4096dddc3062e0113fbdbed1a9de66c2ae69f31e393b796` |
| Interface / static | `4cbbee16a158a16c432b0571f19b42bfd940ea9e` | [netcircuit-interface-0.1.1-static.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Interface/releases/assets/682835223) | `d324eb77f71ff1fe9804965ea91231ea2c163651c88fa58a8b90567cf4c5b3a2` |
| Simulator / python | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | [netcircuit_simulator-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Simulator/releases/assets/682243875) | `2d70d1c4a92ff5814f6c90c122cff4d11ad78757ad307f0ba3c384f721443de0` |
| Simulator / sdist | `ff63616a7a8c5d3f65e60cdb85db2b4b4ab42fa7` | [netcircuit_simulator-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Simulator/releases/assets/682243978) | `9ae34f5be6c25eda46eea7ca2642a20ef8da5ac81ef8c03ca1521ce5ba4cc956` |
| Hardware / python | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | [netcircuit_hardware_service-0.1.1-py3-none-any.whl](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Hardware/releases/assets/682262875) | `0c6fa8530c1adf551b2971e501542fd2b8d18661792909ad5c1db1c7542d1e3d` |
| Hardware / sdist | `de65db8b89d0dfa6dd4c430a41397555bc77111d` | [netcircuit_hardware_service-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Hardware/releases/assets/682262956) | `ba94fb08c5f82d0c2f3785ffc9426c165a79da5c1a2fe6ffe70410e44eda773e` |
| FPGA / source | `24ade35eade5382efd42f784008280c0fbb768c3` | [netcircuit-fpga-scaffold-0.1.1.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-FPGA/releases/assets/682282018) | `4a275a924700bf8f395ecd84e92e2bef545a8bd0e2ee2a1f84733c4c9b8bf7b1` |

Rollback bundle: [netcircuit-system-rollback-pre-m6.tar.gz](https://api.github.com/repos/TINIHI-Labs/net-Circuit-Remote/releases/assets/682421591), SHA-256 `64242f673d3e750cbf3b18db36314ce86d23347ab3130ff2308afe63ac7d9e34`.

## Ownership, compatibility and safety

The dependency graph is Contracts → Interface / Simulator / FPGA, Simulator → Hardware, and all five versioned producer products → Remote integration. Contracts imports no Web/API implementation; reviewed OpenAPI is exported by the API owner. Supported consumers use installed wheel resources, the public npm SDK and verified Interface/FPGA products. [Ownership metadata](../../integration/ownership.json) assigns each retained frozen tree a reference/rollback role; it supplies no supported build, runtime or release dependency.

W0–W8 coverage remains in the actual full Python, native browser and PostgreSQL suites: auth/CSRF, project CAS/ownership, assignments, editor/component library, captures, reconnect/reload recovery, controls and unavailable capabilities. Historical phase counts remain unchanged. The release does not change CircuitGraph/schema, RPC, NCAP or FPGA logical/register protocols. Safety gates, UNKNOWN versus UNSAFE, topology mismatch semantics, one API scheduler, loopback Hardware RPC and same-origin routes remain in force. Ngspice, native physical transport and ADC/DAC/SDRAM/physical Scope/Generator remain unavailable.

Installation, parent environment preparation, the actual show-plan/release commands and paired database/capture rollback steps are in [the runbook](../../deployment/multi-repo-release.md). Durable verified history snapshots and immutable releases are distinct from session-owned diagnostics.

## Integration and publication gates

If integration is authorized again, ordinary source integration uses a separate readiness receipt: complete clean 18-command acceptance, exact source/artifact identities, rollback, review, documentation checks, clean heads and freshly restored backups. The current instruction stops those merges/pushes. The source integration receipt does not assert credential acceptance or publication readiness. Feature CI records retain their actual results; successful full Windows browser acceptance never relabels an incomplete Linux feature job as PASS.

Official v0.1.1 tags, publication and migration-branch deletion would additionally require separate release readiness: all mandatory workflows on the exact six master commits, actual final private-asset access with the accepted credential disposition, verified backups and live reachability. The existing broad OAuth secret has not been described as read-only. Credential provisioning and the current stop on Git promotion are distinct constraints; neither has been treated as satisfied.

Read-only GitHub policy inspection found immutable releases disabled in all six repositories. The reviewed publication guard is enable-only, persists intent before changing the exact repository policy, and requires `immutable=true` on all six published releases. Every artifact and auxiliary asset must be uploaded and SHA/size/identity-bound before publication. GitHub prevents later asset appends/replacements and tag movement for [immutable releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository). Pre-publication receipts state publication as pending; subsequent publication/download/cleanup results belong to the final handoff. No future result is written as an already completed action.

Independent operational review repaired a deletion race: ordinary remote branch deletion now validates the expected ref/SHA from the same push advertisement, preserves the existing pre-push hook and relies on receive-pack compare-and-swap for subsequent changes. Four actual isolated bare-Git race tests passed. Evidence validation rejects metadata-only individual receipts and checks the complete all-group plan/log; 19 evidence and 10 journal checks passed. Nine enable-only immutable-policy/inventory checks passed. These operational helpers do not alter product assertions or source history.

## W0–W8 coverage after extraction

This map follows the approved M0 invariants. Execution status belongs to the final acceptance results, rather than to the presence of a test file. Remote's complete Python gate includes installed-artifact consumer checks; Interface owns the real browser assertions.

| Phase | Preserved behavior | Current verification owners and entrypoints |
| --- | --- | --- |
| W0–W1 | Provenance, offline references, deterministic schemas/catalogs, precision and Python/TypeScript parity | Contracts standalone generation/resources/public closure; Remote `contracts` commands, public SDK parity and [public compatibility](../../tests/contracts/test_public_compatibility.py) |
| W2 | API operation/security/error/media anchors, public projections, bounded realtime resync | API-owned OpenAPI export against installed Contracts; [realtime limits](../../services/api/tests/test_wc20_auth_realtime_limits.py); Interface lab workflows |
| W3 | Auth/CSRF/session ownership, forward migrations and restart recovery | [Auth security](../../services/api/tests/test_auth_security.py), [auth migrations](../../services/api/tests/test_auth_migrations.py), [lab lifecycle](../../services/api/tests/test_lab_lifecycle.py); Interface auth and cookie-rotation browser cases |
| W4 | Projects, immutable revisions, CAS, Save As identity and stale acknowledgements | [Project repository](../../services/api/tests/test_project_repository.py), [project API](../../services/api/tests/test_project_api.py); Interface projects browser cases, delayed authoritative hydration, and exclusion of held tactile input from checkpoint/Export/Save across reload |
| W5 | Component Library/Editor, command history, persistent canvas, assets and resource ownership | Interface 1,448 unit tests, 229-module AST boundary check, three production entrypoints and original contacts/wires gallery, asset, camera, depth and graphics-recovery browser cases |
| W6 | Assignment publication/disclosure, durable recovery, reload/reconnect without command replay | [Assignment documents](../../services/api/tests/test_assignment_documents_api.py), [saved execution](../../tests/integration/test_saved_document_execution.py), [browser harness worker/EOF](../../tests/integration/test_browser_harness_execution.py); Interface lab workflows/flexible assignments/pending observations |
| W7 | Signal domains, NCAP v1/v2, capture ownership/raw evidence, truthful unavailable instruments | [Virtual domains](../../tests/integration/test_virtual_domains_execution.py), [capture RPC data plane](../../tests/integration/test_capture_rpc_data_plane.py), [capture isolation](../../services/api/tests/test_capture_control_isolation.py), [instrument lifecycle](../../services/api/tests/test_instrument_lifecycle.py); Simulator/Hardware standalone spawned-worker/RPC/NCAP tests |
| W8 | Installed artifacts outside Git, PostgreSQL backup/races, native browser and integrated release | Actual clean `--group all --show-plan` and `--group all` (18 commands); PostgreSQL 18 cases, isolated four-wheel package gate, all 58 collected browser cases, actual paired old-artifact database/capture rollback, and separate exact-master hosted CI |

Interface browser source is pinned to [4cbbee16a158a16c432b0571f19b42bfd940ea9e](https://github.com/TINIHI-Labs/net-Circuit-Interface/tree/4cbbee16a158a16c432b0571f19b42bfd940ea9e/e2e). The original depth spec and ten-cycle gallery assertions retain their existing budgets. The optional absent historical depth comparison is NOT_RUN; Windows file-symlink tests denied by OS permissions are reported separately and covered by the complete Linux Python gate. Ngspice, physical drivers and board/electrical validation remain unavailable or NOT_RUN as recorded in the compatibility manifest.

## First full browser failures and repair boundary

### Later full Linux failure and working-copy input correction

Feature run [40582867161](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40582867161) was cancelled at the 90-minute job limit after 52/58 cases had started, with 18 individual failures already recorded. There was no final JUnit or valid full-suite summary. Gallery predicates, DPR 2/glyph deadlines and several UI state assertions failed; the held-tactile and new delayed-hydration cases were not reached. The other eight workflows on 771f4c2 passed. Increasing only the job envelope would not resolve this outcome.

Trace evidence confirmed two actual typing failures: `Capture signals` contained `y` after fill but became empty before Tab, and the POST sent an empty signals array; the conflicting-project name changed from the newly typed value to `Original` before the PUT. Both fields used a controlled `:value` with commit only on `change`, so an unrelated Vue render could restore the old canonical value before blur committed the edit. Three deterministic tests mounted the real compiled SFCs, forced an unrelated render between typing and change, and reproduced all three losses (signals, numeric text, circuit name).

The uncommitted Interface correction buffers text reactively during input, retains the existing change-time validation/commit, preserves CSV separators while typing and one authored Undo entry for rename, and resets pending values on principal/document changes. Seven initial focused tests passed after RED; a principal-scope regression and actual rename Undo/Redo assertions were also added. Full working-copy type/unit verification passed 1,452 tests; final focused verification passed eight. Three unchanged native browser cases passed on that working copy: student vectors/capture, Save As/reload/API restart, and two-tab conflict/Save As. AST (229 modules), E2E types and all three production entrypoints passed. Linux validation remains separately pending; neither these focused results nor the earlier 4cbbee artifact's results count as a complete run on the new working copy.

A separate 568-file working-copy export, excluding ignored dependencies/runtime/caches and Git metadata, then passed exact Contracts bootstrap, locked clean npm install, all 1,452 type/unit tests, AST/E2E types and all three production entrypoints in 184.26 seconds. Source snapshot SHA-256 is `6b43fc67bb729f35de18bc1055eabc5a786c3d8b16f7614fd9d2fe206512778a`; inventory SHA-256 is `9377a4634a27e7cb7dd481c2b0c9e97152eb373124f9431479bbee6ce632e2f0`. Both SFCs and the regression test match the native probe's source hashes. This Windows export used Node 24.20.0/npm 12.2.0/Python 3.14.4, has explicit dirty-source provenance and is not relabelled as an immutable release.

The same hosted trace mechanism also affected Inspector Component X: fill completed with `4`, but the live value reverted to `3` during Tab and stayed `3` on reopening. Undo then removed the component instead of undoing a move. A real compiled-SFC RED reproduced the missing move; field-local coordinate/rotation/property/name buffers now preserve change-time graph commands, canonical validation/readback and one history entry. Three Inspector cases plus nine bootstrap checks passed, including actual Undo/Redo and principal/document/selection resets. One intermediate test fixture used schema 1.0 for a physical resistor; only that fixture was corrected to required schema 1.2, preserving the validator.

Three further real compiled-SFC REDs showed Generator's five numeric drafts, the local supply's two setpoints and the Assignment ID reverting during unrelated status/property renders. Their local strings now survive rerender; canonical values still commit only through existing change handlers. Per-field canonical updates preserve other unfinished text, while principal/document/channel/selection/station or assignment-binding changes clear the relevant pending strings. Supply typing and range drags add no graph history until change; invalid values read back canonical state. Assignment ID commits once, retaining the existing one-time private-field reset. Generator typing sends no command, and live Apply/UNKNOWN/access/capability gates remain unchanged. Final control verification passed 29 focused tests plus nine bootstrap checks, including six new cases. An intermediate handler typo was caught by tests, corrected and rerun under a separate passing log; its failed log remains preserved. At that focused-test checkpoint, full clean type/unit/build and native validation of the expanded source were still pending.

The expanded six-form source was frozen as an explicitly uncommitted 570-file candidate, SHA-256 `48cf7159f2cfc2dda91e87dc3607cc7837190cd3419da5b12ce1f895062110cb`, inventory SHA-256 `3b32ae6ef65490d62d048df55a5b8499efa0f11109c8b8097f9cd06c2e479260`. All six SFCs and three regression test files have recorded code hashes. A new Windows export with no inherited dependencies/build outputs passed exact Contracts bootstrap, clean npm install, 1,461 type/unit tests plus nine bootstrap checks, 229-module AST, E2E types and three production entrypoints in 216.61 seconds. Node 24.20.0/npm 12.2.0/Python 3.14.4 were recorded. Independent cross-reviews approved both scopes. Earlier 568-file/native measurements retain their separate source identity.

Expanded Linux verification then passed exact SDK bootstrap, fresh npm install, 1,461 unit tests plus nine bootstrap checks and types, 229-module AST, E2E types and all three production entrypoints under Node 22.23.3/Python 3.12.3. The unit/type command took 119.253 seconds; E2E types 5.037 seconds and production build 20.916 seconds. All 570 source files and nine code hashes still matched after these gates. Integration reuses the previously isolated, version/provenance-checked four-wheel Linux venv; this is a fresh Interface install/export, not a claim of a second complete fresh-machine API installation.

### Complete expanded-candidate native acceptance

The standard launcher then ran the original unfiltered 58 cases, with original ordering/assertions/budgets, one worker and zero retries, on local Linux with 8 CPU / 8 GiB. Exact command: `node scripts/e2e-interface.mjs --output ABSOLUTE_OWNED_OUTPUT --reporter=line,junit --forbid-only`. No diagnostic preload, filter, added automation flag or additional CDP warmup was used. Actual OS inspection found only the selected owned browser runtime/executable, SHA-256 `4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6`, with the existing SwiftShader/compositing flags.

Result: exit 0, 2,191.495 seconds, **57 mandatory PASS / one optional historical NOT_RUN / zero failures/errors**. Root independently checked actual JUnit against the raw `--list` collection using the existing complete identity validator. JUnit SHA-256: `0b1a27c199eeb7301eb7eb95b4d5829d5ec1c1ba9c552e9e808786aba3f6fe06`; collection SHA-256: `2c8b6a1b3274a0d056ab3708781f6bf3d7bef67e1a11b600a75bede933b6e59d`. All 570 tested inputs, all nine code hashes, the source installation cache and all 691 copied runtime payloads remained unchanged. Current original Interface code was independently rehashed and matches those same nine tested inputs.

The gallery passed ten cycles after the same six initial cases. Typed vectors/capture, Save As/reload/actual API restart, two-tab conflict, Inspector Move/Undo, physical-preflight ownership, property/placement, model/resource and navigation assertions all passed. Both original held-tactile checkpoint/Export/Save/reload and delayed-real-GET hydration cases passed. The saved graph retained the exact tactile module with `pressed=false`. Representative gallery, tactile-detail, Ribbon and restored-depth images and native JSON were inspected. The case-57 screenshot establishes saved name/revision; its Project Manager occludes the tactile mesh, so mesh visibility is not inferred from that screenshot. Case 58 intentionally emits no image/metrics artifact; its evidence is the unchanged real held-GET assertions and passing JUnit.

API shutdown exited 0 and owned browser/backend process inspection was empty afterward. The raw log retains expected proxy connection failures during the intentional API restart followed by successful recovery; no clean-log claim is made. This proves the current uncommitted code on the recorded local Linux environment. The older 18-failure hosted 2-CPU run remains failed, and hosted execution of the unpushed correction is NOT_RUN. The system lock still selects the old committed 4cbbee source/static artifacts; a future authorized committed build and fresh manifest binding are required before immutable release promotion.

### Local Linux resource and automation controls

Three valid focused arms used committed Interface 4cbbee16 on the same local i5-12500H Docker VM, pinned official Ubuntu image, Node 22.23.3/Python 3.12.3 and Chromium executable SHA-256 `4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6`. Each used fresh compiler/profile caches, a complete 691-file physical browser copy with matching payload hashes, one worker, zero retries and no pre-page CDP/GPU warmup. CPU quota/affinity and 8 GiB memory cap were admitted before launch. Assertions and original case budgets were unchanged: gallery 900 seconds, display 240 seconds, DPR 2 360 seconds. Earlier incorrect diagnostic estimates of the gallery budget are superseded by the inspected source value, not by a timeout edit.

| Arm | Gallery seconds | Display seconds | DPR 2 seconds | Actual disposition |
| --- | --- | --- | --- | --- |
| 2 CPU, standard flags | 407.641 | 78.367 | 306.680 | Three PASS, zero retries/skips |
| 8 CPU, automation flag | 206.789 | 41.098 | 147.192 | Three PASS, zero retries/skips |
| 8 CPU, standard flags | 207.079 | 40.167 | 144.439 | Three PASS, zero retries/skips |

Each DPR 2 run completed all 30 measurements with `changed=0`. Readback medians were 878.3 / 379.0 / 375.6 ms; screenshot maxima 303.376 / 254.031 / 266.399 ms. The two 8-CPU observations give no basis for adding the automation flag. The fourth proposed 2-CPU automation arm was deliberately NOT_RUN after reassessment; its decision guard returned 77 (outer driver 1), independently of the nine passing test results. This is not a complete four-arm experiment.

CPU pressure and near-cap memory were observed. In the 2-CPU arm, the memory-limit event counter increased by 3,774 during the browser phase with no OOM/kill; `memory.stat` anon/file and continuous memory-pressure data were not captured. No unconstrained-memory claim or exact hosted-CPU speed ratio is made. Future-arm driver hashes were captured at launch; the first arm's later orchestration-only decision guards are disclosed separately rather than relabelled as identical driver bytes.

These gallery-first diagnostic runs differ from hosted case ordering and CPU model. They do not establish the cause of the 18 full hosted failures. Raw JUnit, resource/native metrics and fresh gallery/closeup/cutaway/restored-depth images were inspected; source assets and baselines were preserved. Complete current-candidate acceptance uses the standard launcher, original full ordering and no diagnostic preload.

The reload trace returned HTTP 200 with the correct saved graph/name. Its last logged name poll occurred before that response, followed by a 9.7-second polling gap. The trace does not establish when adoption happened; it is not evidence of corrupted server data. Gallery traces likewise showed locator/evaluation starvation while screenshots contained the added models. Screenshot time was about 173 ms, so the earlier compositor screenshot stall was mitigated. The exact served ROI observer was reconstructed byte-for-byte from the recorded Vite ETag. Remaining scheduling/GPU failures require measured diagnosis; they have not been relabelled as passing or addressed by weakening assertions.

The first full Windows run exited 1 after 3,035.96 seconds: 55 passed, one optional historical pre-fix comparison skipped, and the last held-tactile persistence case failed after reload. The prior checkpoint, server PUT/GET and held-state Export assertions passed. Trace timing proved the final Export captured `Untitled_circuit_1.json` before the asynchronous server-route GET completed; the saved tactile graph remained intact. Renderer-first-frame readiness did not establish server-document readiness. The repair adds explicit pending route navigation and gates current-document Export/Save actions, including secondary Project Manager saves, until authoritative hydration completes. Original case assertions and budgets remain unchanged. Deterministic delayed-real-GET RED reproduced enabled Export during navigation; focused GREEN and independent review are tracked before a new committed Interface artifact is selected.

Hosted Linux run [40560770899](https://github.com/TINIHI-Labs/net-Circuit-Remote/actions/runs/40560770899) reached only 14/57 cases. Four earlier tests failed under severe rendering/readback delays: gallery's first canvas read consumed its whole polling budget, display screenshot timed out, and DPR1/DPR2 measurement sequences exceeded their case budgets. Completed depth measurements retained `changed=0`; no bad graph or pixel result was demonstrated. HTTP inventories showed no failed responses, and no page crash/context-loss was observed. The independent whole-job annotation then reported a maximum execution time of 30 minutes. This cancellation and its incomplete cases are not PASS.

The scene manager already coalesces rendering on demand; no busy RAF loop or repeated runtime-copy cause was found. Actual runner CPU/RSS utilization was not measured in that run. A controlled diagnostic compares the existing SwiftShader driver configuration with isolated compositor/WebGL modes while preserving geometry, DPR, pixel assertions and individual budgets. This is a diagnostic, not an acceptance substitute. Chromium documents its [SwiftShader driver versus WebGL-only modes](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md); ANGLE documents [isolating WebGL from GPU compositing](https://github.com/google/angle/blob/main/doc/DebuggingTips.md#usage). No master, official tag or published release was changed after either failed gate.

The completed three-arm diagnostic used the same pinned Linux Chromium binary, SHA-256 `4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6`, on two-vCPU runners. Every actual singleton/launch/executable guard passed. A retained global SwiftShader compositing failed all four cases. B added only `--disable-gpu-compositing`: the original gallery, display closeups and DPR1 passed; DPR2 still timed out. All 34 B screenshots succeeded, median 90 ms / maximum 292 ms, compared with A's successful maximum 84.448 seconds and a 90.023-second screenshot failure. C's WebGL-only fallback failed all four cases and is not selected. CPU models differed across arms, so exact CPU speed ratios are not inferred.

B completed 22/30 DPR2 measurements with zero leaks before its remaining timeout. Native readbacks accounted for 92.11% of time inside completed leak tasks; comparison/raycast work was a small residual except one PSU closeup. The observer optimization limits only its two analysis draws to the unchanged integer bounds of the tested pixels, retaining full-size reads, the complete pixel/raycast loop and the full restored frame. An explicit native reference comparison passed 78 cases: 60 current/historical poses across both DPRs, 16 glyph representatives and two positive leak controls. Every tested original/colored RGBA byte and the entire restored frame matched exactly; positive controls detected 11 / 328 leaks in both paths. Four latest exception/nondefault-scissor guards passed using direct framebuffer reads, followed by the unchanged original DPR2 test: all 30 poses passed in 127.975 seconds under its existing 360-second limit. These focused native results do not substitute for full committed-candidate and hosted-master browser acceptance.

The one-shot diagnostic workflow/preloader was retired after all three artifacts, raw logs and phase metrics were inspected. Its source remains in commit `01df4d6abe69e07c176f5250f4a2111c0cc725e7`; the normal browser run on that diagnostic-only feature commit was deliberately cancelled and never counted as PASS. The supported hosted browser step now runs the actual `check_release.py --group browser` plan, retaining line/JUnit output, one worker, zero retries and forbid-only. Its whole-job envelope is 90 minutes because the complete first Windows suite measured 49 minutes; individual case budgets are unchanged. The compositing and equivalent observer repairs remain independently required.

The selected committed Interface candidate is revision `4cbbee16a158a16c432b0571f19b42bfd940ea9e`. Its source and three-entrypoint static archives were rebuilt independently twice from Git exports and are byte-identical. The system lock selects their numeric asset IDs. Earlier candidate `bac9b0b` and its assets remain in a separate unpublished draft; its successful and failed measurements retain their original scope. The clean Windows 58-case execution above completed for 4cbbee16; the later Linux run failed. A subsequent corrected candidate still needs complete browser acceptance with its own source identity; the one optional absent historical baseline remains explicitly NOT_RUN. No original assertion, individual timeout, asset or golden baseline was changed.

The read-only credential audit found the existing encrypted Actions secret is the push-capable GCM OAuth credential (`gist, repo, workflow`). This has not been represented as least-privilege read access. The user was asked asynchronously to provision the [selected-repository Contents-read credential](../ci-artifact-access.md), and responded by stopping commit/push/merge. No replacement or credential exception was inferred. Token values were not retained in diagnostics or source. Actual replacement downloads and any private-draft visibility constraint must be tested before minimum-scope access is claimed in a future release.

## Historical working-copy handoff

Final Root documentation/context/protected-baseline/Markdown/system-release checks passed: 54 tests, zero failures, with actionlint 1.7.12 and worktree/index artifact guard. The combined command sequence exited 0 in 74.04 seconds. Interface's 16 managed Markdown documents passed the same shared path/anchor policy; the shared artifact guard against its worktree/index and its diff whitespace check also passed. The initial attempt to invoke an Interface-local guard entrypoint failed because that script is Remote-owned; the successful check used its supported `--root` interface, without adding a duplicate policy.

Live read-only final Git inspection confirmed the six branch/HEAD pairs and local/remote master values in the table, with every index empty and no official v0.1.1 tag. New source remains 16 unstaged/untracked Remote paths and 11 Interface paths; the other four tracked trees remain clean. Current code matches the tested nine-file freeze. Durable initial/history/release backups remain outside diagnostic cleanup. A separate allowlisted source-only backup verified all 27 changed files and three frozen-candidate inputs, with matching before/after source/HEAD/ref/index/status checks: `C:/Users/trann/.codex/migration-release-backups/m6-working-copy-20261028-6601325300d04cb1af4af861cd20f9b8/`. Its `BACKUP_RECEIPT.json` records PASS; it contains no raw diagnostic/image/cache outputs and created no Git commits. This final retention note was appended after the backup; all tested code and CI payloads are retained there.

Suggested commit subjects, not executed:

- Interface: `fix(web): preserve form drafts and single-step history`
- Remote: `ci: verify release artifacts and harden bootstrap cleanup`

Official release completion remains pending: a committed corrected Interface build/new source-static binding, verified minimum-scope artifact access, exact-master hosted CI, master integration/tags/publication and branch cleanup were not executed under the revised scope. The working-copy validation above does not promote the old selected release artifacts or assert that the previous hosted failures passed.

### Final cleanup disposition

After JUnit, source/payload identities, native JSON, representative images and shutdown evidence were inspected, five Linux sessions were removed by the pinned canonical allocator with their original contexts. The bind-mounted preparation session was cleaned through its exact Linux path in a temporary cleanup-only container; no host filesystem fallback was used. All three task-owned containers were removed, Docker was restored to its initial stopped state and unrelated `beautiful_khayyam` remained exited and unchanged. The official Playwright image remains an installation input; no image/container prune occurred. An initial evidence archive was safely rejected for an intentional unit-fixture symlink; a minimal export passed strict path/alias checks before inspection, without changing test results or loosening extraction.

The six known Windows sessions, including four nested acceptance/native sessions, the final clean environment and the main session, were then removed in dependency order through canonical CLI SHA-256 `7c42c4fd171ed861b365f08501f3c765282d6bba2dcd6430c9677cddd1abe345`. Each command exited 0 and each exact target was confirmed absent; the final clean environment was removed before its source clone's parent. The global Node/Python executables and allocator pin remained outside those targets. Durable source/history/release backups, all six working repositories, unrelated worktrees, source assets, old evidence and original ignored files were preserved. No owned test listeners remained; the task PostgreSQL cluster on 15432 was stopped, while the original 5432 service remained running. No source branch was deleted or Git promotion performed.
