# Verification and external artifacts

Status: IMPLEMENTED policy and tooling. Individual results are VERIFIED only in their dated verification report. This guide governs new verification output; retained legacy evidence is inventoried separately and has not been deleted.

## Output policy

Create screenshots, video, Playwright traces, HTML reports with images, raw JSON metrics, logs and other diagnostic output outside **every checkout/worktree and Git administration directory immediately**. Only Markdown verification evidence belongs in this repository. Never capture into the repository and move it out afterward, embed Base64/data URI evidence, or put temporary image links into permanent documentation.

Source logos/icons/textures, model assets, product/design references, contract fixtures and approved golden baselines remain source inputs. Compilation caches such as `.test-build/*.mjs` and distribution assets are not verification evidence. Do not regenerate a baseline to hide a regression.

Use `scripts/artifact-paths.mjs` from Node/TypeScript. Python tools use `scripts/artifact_paths.py`, which delegates to that same implementation. No independent path-validation algorithm is permitted in consumers.

Verification harnesses require Node (CI pins Node 22) and Git in `PATH`, including Python callers of the allocator. M1 packages the canonical allocator separately as DEV tooling. Current source builds use `cirnet-artifact-paths==1.0.0a1`; the immutable release lock still selects `netcircuit-artifact-paths==1.0.0a1`. Both namespaces are supported by the reviewed adapters. Bootstrap the reviewed artifact before running checks with `python scripts/install_contracts.py --with-dev --manifest ABSOLUTE_MANIFEST`. CI uses the same digest-verified bootstrap before allocation; production Contracts consumers do not need DEV tooling. Remote adapters delegate to this installed implementation and fail if it is absent or differs from `integration/contracts-version.json`.

For verification spanning repositories, supply `CIRNET_ARTIFACTS_CONTEXT` as JSON with an explicit owner and every participating absolute repository root before allocation (M5: Remote, FPGA, Contracts, Hardware and Simulator). Inherited children and cleanup must retain that context. The allocator expands each Git family and rejects discovered checkout/Git administration paths, including aliases. A session allocated under an earlier context must be cleaned with its original owner/root context.

M3 consumers install the reviewed Simulator artifact with `python scripts/install_simulator.py --manifest ABSOLUTE_SIMULATOR_MANIFEST` after Contracts bootstrap. `python scripts/check_simulator_consumer.py` checks exact version and installed provenance; it must reject editable, missing or shadowed source. Current Simulator units run in CIRNET-Simulator against its installed wheel; the former Remote copy is available in Git history. Remote still runs API preview, actual virtual execution/worker/RPC and installed-package integration against that same artifact. A fresh export of uncommitted reviewed files is recorded separately from a future committed clean checkout.

M4 consumers install `netcircuit-hardware-service==0.1.1` with `python scripts/install_hardware.py --manifest ABSOLUTE_HARDWARE_MANIFEST` after the exact Contracts/Simulator bootstrap. `python scripts/check_hardware_consumer.py` verifies selected archive/version/RECORD/import provenance. Hardware unit tests run in CIRNET-Hardware; the former Remote copy is available in Git history. Remote retains actual API/RPC/worker/capture/safety integration.

Current M6 selects FPGA source/scaffold 0.1.1 (historical M5 used 0.1.0) with `python scripts/install_fpga.py --manifest ABSOLUTE_FPGA_MANIFEST`; the manifest contains a selected source archive path and SHA256. The installed product is an immutable source export under a fresh allocator-owned child, selected through `CIRNET_FPGA_ROOT`/`CIRNET_FPGA_ARTIFACT_MANIFEST`, with complete inventory and fingerprint checks. `python scripts/check_fpga_consumer.py` validates this selected product and its compatibility with installed Contracts. The original `tests/fpga` copy is available in Git history. Remote keeps installed Hardware/FPGA compatibility assertions. Standalone FPGA acceptance requires exact pinned slang and Icarus/vvp, actual behavioral simulation with no RTL skips, externally owned outputs and recorded executable/archive identities. Use short external paths for Windows tool bundles. No FPGA Python runtime package, synthesis result or board image is implied.

The installed-package gate builds only API locally, then selects the reviewed Contracts, Simulator and Hardware wheels. Its fresh venv, application state and subprocess probes live under the canonical session. Optional `scripts/check_contract_package.py --temporary-root` (or the release runner's `--package-temporary-root`) must name a child of the current owned session; an unrelated external directory is insufficient. The gate removes only its own nested temporary child, while the caller inspects retained logs and cleans the owning session afterward.

`scripts/check_release.py` allocates fresh external default SQLite and capture paths for every invocation before launching child commands. It overrides inherited application defaults so a fixture that imports a default app cannot touch a developer's database or capture directory; the caller's environment stays unchanged. The real PostgreSQL gate still requires its separate `CIRNET_TEST_POSTGRES_URL`. For direct API pytest commands outside this runner, set both default database and capture paths to allocator-owned locations before importing application modules.

```js
import { getArtifactDirectory } from './scripts/artifact-paths.mjs'
const screenshots = getArtifactDirectory('screenshots')
```

The allocator defaults to a unique `netcircuit-*` session in the OS temporary directory on Windows/Linux. `CIRNET_ARTIFACTS_DIR` optionally selects an **absolute external parent**, under which a fresh session is created. `CIRNET_ARTIFACTS_SESSION` is internal inherited state used by child processes/workers to share that session. `getArtifactDirectory(subdir, { directory: externalParent })` allocates a separate session under an explicit external parent. Repository/Git paths and symlink escapes are rejected before output creation. Git enumeration failures fail closed. If external writing is denied, report BLOCKED/request the needed tool permission; never fall back to source directories.

Pytest's `--basetemp` controls fixture files, separately from `.pytest_cache`. Root, API, Simulator and Hardware Python projects disable `cacheprovider` through their pytest configuration. Preserve that setting for nested subprocesses; if explicitly enabling the plugin, select an allocator-owned external `cache_dir` before running it. The M1 report records the earlier cache containment deviation and the follow-up regression check.

For one shell session, allocate once, then export the returned root to child commands:

```powershell
$env:CIRNET_ARTIFACTS_SESSION = node scripts/artifact-paths.mjs
$verificationLog = Join-Path $env:CIRNET_ARTIFACTS_SESSION 'checks.log'
# Run checks and inspect evidence before cleanup.
```

```sh
export CIRNET_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)"
# Run checks and inspect evidence before cleanup.
```

From another working directory use the script's absolute path, or the appropriate relative path to it. Allocation itself is independent of the caller's working directory.

## M6 current release setup

Current repositories use `CIRNETLAB/CIRNET-*`; active source uses canonical CIRNET technical identifiers and compatibility aliases described in [the namespace guide](NAMESPACE.md). Select the exact numeric asset URLs
and digests in the current Git manifest. Historical immutable manifests/release
notes keep their recorded source/URLs and are not silently rewritten. Record
committed build inputs, archive SHA-256 and member-payload differences when
comparing a rename candidate with an existing release. A raw archive difference,
newline-only difference or metadata-only change must be stated explicitly.
Do not substitute an unpublished same-version candidate into a release selection.
Changing a published artifact/tag requires the user's separate release decision;
an immutable release cannot be overwritten. Revalidated original 0.1.1 bytes
retain their original build provenance.

Jobs that build the API from source build the Python dependencies from the
producer commits in [the source CI lock](../integration/ci-source-dependencies.json).
They verify each source archive SHA-256, install the producer's hash-locked
build tools, and pass each resulting wheel and its digest to the existing
installers. This tests the renamed `cirnet-contracts` distribution with the
corresponding Simulator and Hardware dependencies. Browser release, FPGA and
system artifact access continue to select the published release set.

If GitHub regenerates a source archive with different compression, verify its
extracted files against the pinned commit before updating the archive digest.
[GitHub source archive stability](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives#stability-of-source-code-archives)

On 2026-11-04, local Ubuntu 24.04 verification with Python 3.12 and Node 22
passed the source wheel installs, `pip check`, and the full Remote Contracts
gate (12 commands, 833 tests). Remote also passed 15 targeted workflow, API and
RPC tests and its clean installed-package probe. Simulator and Hardware passed
111 and 109 tests in their independent Ubuntu wheel gates. The clean Remote
installed-package probe also passed on Windows with Python 3.11.

The approved system/integration release is 0.1.3 with Interface 0.1.3, retaining API, Contracts, Simulator, Hardware and FPGA 0.1.1 and DEV tooling 1.0.0a1. The latest explicit M6 sequencing decision permits publication after actual full selected-artifact local Ubuntu browser acceptance without waiting for further Actions. Record prior CI-identity draft access and any new unrun identity checks separately; pending or failed Actions are not PASS. Use the exact system release manifest and [clean-machine runbook](../deployment/multi-repo-release.md). Installed Contracts resources and explicit Interface/FPGA artifacts replace frozen-reference fixtures. Standalone producer repositories own deterministic generation, unit/AST, backend, RPC and RTL gates; Remote owns the full integrated release groups. Historical M1–M5 measurements remain separately dated. Initial Python entrypoints must suppress source bytecode before importing helper modules, and all child temp/cache paths must belong to the canonical session. Applying a child bootstrap does not change the parent shell; import its recorded environment before continuing.

Local-only release verification uses an explicit `distribution: "local"` manifest with `scripts/install_release.py --local-artifacts`. Retain exact absolute artifact paths, SHA-256 and committed producer revisions outside Git, including the unchanged rollback inventory. Mixed URL/path transport and implicit local fallback are rejected. This verifies a local set without publishing it or changing the canonical GitHub release selection; identify uncommitted verification-tool overlays separately.

The current [M6 verification record](verification/2026-10-27-multi-repo-migration-m6.md)
records the native depth-observer equivalence proof and unchanged DPR 2 gate.
Those focused results do not replace complete browser and hosted-master acceptance.

Published assets from the six public repositories support anonymous downloads.
Current CI still uses the [selected-repository read credential](ci-artifact-access.md)
for bootstrap and authenticated asset checks; draft access must be verified separately.
Workflow `contents: read` does not narrow the scope of a separate Actions secret.
Record user provisioning attestations separately from the receipt's `NOT_VERIFIED`
credential scope. After rotation, verify actual selected asset downloads again.

## Checks and evidence

Install the pinned Python tools for local and CI verification with
`python -m pip install -r requirements-verification.txt`. This file includes
build, contract verification, benchmark monitoring and test tools.

The Windows launcher dispatches no-argument calls to its English interactive
menu. Explicit `start`, `stop`, `-Check` and `-NoBrowser` retain direct startup.
Clean and Doctor use PowerShell modules under `scripts/launcher/`. Clean accepts
`-Preview` (`-DryRun`/`-WhatIf`) and requires confirmation for deletion unless
`-Yes` is explicit. Its whitelist covers recognized cache files and Remote
metapackage build metadata. Unknown build trees and the allocator cache are
reported as skipped. Start and Clean share a maintenance mutex, and cleanup
also inspects the existing launcher lock and service ports.

Run `python -B -m pytest -q tests/launcher --basetemp ABSOLUTE_OWNED_SESSION/pytest`
on Windows PowerShell 5.1 to check menu dispatch, CLI compatibility, filesystem
protection and Doctor diagnostics. Use an allocator-owned external session for
all test state and captured output. Native tests skip on hosts without Windows
PowerShell. Keep launcher diagnostic logs and Markdown verification reports in
the external session. Doctor's normal report is console-only and creates no
setup or report files.

For real lifecycle verification, provision an owned external dev home containing
the selected installed wheels and a separate Interface product with its own
dependencies. Set `CIRNET_DEV_HOME` for the test process. Verify `-Check`, second
launcher exclusion, external `stop`, Enter and Ctrl+C, and confirm that ports
50051, 8000 and 5173 are released after every run. Preserve existing developer
databases, captures and runtime caches during these checks.

On Windows, run `.\run-cirnet.bat -Check` to start the local simulation stack,
check the Hardware listener, API health, and Vite proxy, then stop the services.
For launcher changes, also run `.\run-cirnet.bat -NoBrowser` in a terminal and
exercise Enter, Ctrl+C, and `.\run-cirnet.bat stop` from a second terminal on
separate runs. Check that ports 50051, 8000, and 5173 are available after each stop.

Choose gates from real package scripts and workflows. Run at root:

```text
python scripts/check_context.py
python scripts/check_markdown.py
node scripts/check-verification-artifacts.mjs
node --test scripts/artifact-paths.test.mjs scripts/check-verification-artifacts.test.mjs
python -m pytest -q tests/test_docs_baseline.py tests/test_post_r7_provenance.py tests/integration/test_context_integrity.py tests/test_markdown_links.py
git diff --check
```

For workflow changes, also validate every `.github/workflows/*.yml` with
`actionlint` **1.7.12**, using `-shellcheck= -pyflakes=` for the reproducible
workflow syntax/expression gate. Those flags omit optional external shell/Python
linters; they do not disable workflow schema or context checks. The Documentation
workflow downloads the official Linux release into its owned session and checks
a pinned SHA256 before execution. YAML parsing alone cannot validate GitHub
context availability: `${{ runner.temp }}` belongs in an execution step's `env`,
not job-level `env`. Start repository tests with `python -m pytest` so clean CI
has the checkout root on its import path. See the [Actions repair evidence](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-20-github-actions.md).

For changed Web test output plumbing after M2, bootstrap the exact reviewed artifacts and run `node --test scripts/*.test.mjs`, `npm test`, `npm run check:boundaries`, `npm run build` and `npx tsc --noEmit -p tsconfig.e2e.json` in the explicitly selected CIRNET-Interface product. Remote starts real integration with `node scripts/e2e-interface.mjs --interface-root ABSOLUTE_PRODUCT --forbid-only`; named release gates accept `--interface-root` or `CIRNET_INTERFACE_ROOT` to select the exact product. Before allocating a shared session, include all participating Git roots in `CIRNET_ARTIFACTS_CONTEXT`; an exported product inside the owned session inherits this context rather than becoming a Git root. Playwright output, explicit suite screenshots/reports, backend test state and reporter output use the shared allocator. A configured reporter/output directory inside a checkout is an error. Do not disable assertions to satisfy the policy. See [Contracts](../contracts/README.md) for release groups and external PostgreSQL/package prerequisites.

Record revision and dirty state, time/timezone, environment/browser/renderer, scenario, commands, PASS/FAIL/NOT_RUN/BLOCKED, observed results and limits in the affected Markdown report. Historical measurements are not freshly verified. State whether temporary screenshots were actually inspected; do not claim visual or hardware success from source review alone. No permanent temporary-path links are required.

### Browser executable and log containment

Actual Windows headless Chromium probes found that GPU diagnostics still append
to executable-adjacent `debug.log` even when `--log-file` and `CHROME_LOG_FILE`
direct other browser output externally. Those settings may remain useful for
auxiliary logs, but they do not establish output containment. Preserve existing
cache log history; never remove or truncate it as an automatic test cleanup.

Before a browser-test or programmatic profiling launch, make a complete physical
copy of the installed Playwright browser cache into a unique `br-<8hex>` child
of the same allocator-owned session. Before copying, verify that every copied
Windows `.exe` destination path is at most **259 UTF-16 characters**. A longer
path must fail with instructions to choose a shorter absolute external
`CIRNET_ARTIFACTS_DIR` parent and allocate a fresh session; do not fall back
to the installation cache. An existing copied executable and matching hash do
not establish that Windows can launch an overlong path. Preserve the browser binaries, resources,
installation markers and platform helpers, including FFmpeg and Windows loader
helpers. Dereference links while copying so the owned runtime cannot write
through an alias into the source cache. Exclude only old `debug.log`,
`chrome_debug.log` files and the `.links` directory. Do not replace a browser
binary, change its pinned revision/channel or trim its runtime resources.
Select this owned copy through Playwright's public `PLAYWRIGHT_BROWSERS_PATH`
environment variable before launching any browser/helper process. Diagnostics
beside its executable then remain inside the external session too.

`npm run test:e2e:install` continues to populate `.runtime/playwright` as the
installation cache. Test mode must prepare and use the owned copy; a missing or
unreadable cache, denied copy or invalid artifact directory fails closed, with
no fallback launch from the installation cache. The current complete Windows
cache costs approximately **718 MiB per test invocation**, plus captures and
reports; provide external disk space and account for copy I/O. Programmatic
profiling has the same requirement even when it does not use the E2E launcher.

Record the selected executable path, browser version and source/copy binary
identity when verifying this boundary. Inventory both the installation cache
and the owned copy before/after execution; a Git guard alone cannot detect
ignored executable-adjacent output. After inspecting diagnostics and ensuring
all owned browser/helper processes have exited, remove the copied runtime only
through its owning session's guarded cleanup. Keep the installation cache and
historical logs intact.

Runtime-copy boundary fixtures must derive padding from the complete executable
path under the actual allocator root; fixed padding can miss the boundary on
shorter CI paths. Exercise successful copying at 259 characters and rejection
at 260 with short and normal external parents. These synthetic file-copy tests
do not launch a browser or establish visual E2E success.

Before/after work, compare Git status and staged diff plus a physical inventory of generated output locations including ignored files. The artifact Git guard checks added/modified worktree and index paths and optional `--base <commit>` CI changes using one policy implementation. Approved asset/fixture paths are distinguished from known generated locations; unknown visual additions require explicit review of their source role. The guard does not remove old tracked outputs or replace the on-disk comparison.

`scripts/legacy-verification-evidence.json` preserves only the 16 exact paths/hashes already tracked at `0cc66f8` (seven PNGs and nine raw JSON records), pending the user's decision. This prevents a PR against an older branch, or a first-push CI comparison, from treating retained history as newly generated evidence. Any subsequent content change is rejected; only Git's JSON LF/CRLF checkout conversion is normalized. Do not add new captures to this manifest. Markdown embedded data-URI visuals and unapproved HTML report output are also rejected, including index-only content. Original artwork and reference images under `assets/` are source inputs. The selected Interface product owns its assets and two instrument-preview HTML entrypoints.

## Cleanup and CI

After inspecting results, run `node scripts/artifact-paths.mjs --cleanup <session-root>` (Python: `cleanup_artifact_session(root)`). Cleanup verifies the canonical external path, unique session name and ownership marker before deleting only that session. Do not pass an arbitrary temporary parent, pre-existing output directory, another user's files or another session. Interrupted sessions remain outside source; locate and inspect their ownership before a separate authorized cleanup.

CI allocates in `runner.temp`, uploads external evidence when needed, then cleans its own session. Upload retention is not a reason to commit artifacts. `.gitignore` is a narrow secondary defense for known generated directories, not a blanket image-extension ban.

The backend, hardware-service, frontend, repository integration, PostgreSQL migration and canonical Contracts jobs allocate a fresh session through `scripts/artifact-paths.mjs` before verification. They publish its ownership before allocating application defaults, set the default database and captures inside that session, pass its `pytest` child as `--basetemp` for direct pytest commands, and run the allocator's guarded cleanup with `always()` after failures as well as success. The migration job retains its PostgreSQL 18 service and explicit `CIRNET_TEST_POSTGRES_URL`; the isolated SQLite default applies only to incidental default-app imports and does not replace PostgreSQL validation. Local workflow policy tests check this configuration; hosted CI execution is separate evidence.

Root CI cleanup uses `scripts/cleanup-artifact-session.mjs`. Bootstrap can publish
an owned session before DEV pip installation succeeds, while the repository
adapter cache does not exist yet. The cleanup helper verifies the published
allocator CLI against the tracked DEV Node SHA-256 and delegates the explicit
session/context to that canonical implementation. A designated missing or altered
CLI fails closed; adapter fallback applies only when no external CLI was
published. This adds no second ownership/path algorithm. The complete artifact
access job in Integration invokes the real system installer and retains only its
sanitized receipt/log before cleanup; a successful download does not establish
that the separate secret has minimum permissions.

## Archive and missing evidence

Keep historical results, incomplete plans, ADRs, LICENSE/NOTICE and provenance. The R0–R7 archived prompt is byte-locked by `tests/test_post_r7_provenance.py`; required architecture/context/history markers are checked by existing tests. Add an external status note instead of editing locked bytes or weakening tests.

Deletion/relocation of Markdown and old generated visual outputs requires a separate user decision. Proposals must list exact relative paths, rationale, replacement, content to retain, references to update, risk and preconditions. Missing original handover images must be labelled as absent/not inspected, separately from new temporary screenshots intentionally not retained. The [audit report](https://github.com/CIRNETLAB/CIRNET-Remote/blob/8ad610d445fa3ad6eddfd56eaa6bc91e690b52ca/docs/verification/2026-10-19-documentation-artifact-audit.md) records the initial inventory and decisions.


## CIRNET namespace acceptance — 2026-11-04

Active source uses CIRNET names, with the explicit compatibility boundaries in
[NAMESPACE.md](NAMESPACE.md). Published release/rollback bytes, historical
provenance, protected documents, baselines and existing developer data were not
renamed. New source jobs build the Contracts wheel and public SDK from the same
pinned archive; the Interface release still verifies its own immutable SDK.

The upstream source pins are Contracts `3dea0a64c5f79d9c2cca0400d39643135d5bc9ab`,
Simulator `b2bfe2c0ff5ca05ede19122830de21f97a2cecd2`, and Hardware
`61f02a482d22bb005fc21c79272505095b8ead18`. Every codeload archive member was
verified against its corresponding Git blob before recording the SHA256.
All three source builders passed with isolated Python 3.12 and their reviewed
hash locks. Native Windows staging paths are shortened inside their owned
workspace before SDK tools run. Compared with the tested candidate wheels,
committed-source runtime payloads differ only in LF/CRLF where applicable;
metadata/archive hashes are recorded independently.

| Local verification | Result |
| --- | --- |
| Contracts producer | PASS: 516 tests, deterministic generation and public SDK |
| Simulator producer, final dependency triplet | PASS: 120 tests |
| Hardware producer, final dependency triplet | PASS: 113 tests including native RPC |
| Interface producer | PASS: build/types, unit/native regressions and namespace migration evidence in its own guide |
| FPGA producer | PASS: 22 parser/compiler/behavior tests; 2 additional allocator regressions |
| Remote API | PASS: all 492 tests |
| Remote launcher | PASS: 94 tests; 1 Windows symlink privilege skip |
| Remote script tests | PASS: 15 Node tests |
| Public SDK consumer | PASS: 88 retained baseline cases, 89 public shape/profile comparisons and TypeScript public/private boundary |
| API OpenAPI handoff | PASS: exact current registration comparison |
| Clean installed-package gate | PASS: fresh external venv/cwd, selected archives/RECORD, migrations/CLI, real spawned worker, NCAP1/2 and RPC |
| Repository boundaries | PASS: 11 tests with both valid release/source identities |
| Documentation/context/workflows | PASS: 34 Markdown documents, context guard, actionlint 1.7.12 |

The full Remote Contracts sweep initially reported 835 PASS, 17 FAIL, 4 fixture
ERROR and 2 Windows capability skips. Follow-up coverage passed 208 cases,
then 46 workflow/integration cases and the final 11 boundary cases after the
remaining failures were corrected. These were explicit alias/export expectations,
restored dependency fixtures and selecting the matching source SDK; integrity,
provenance, semantic, timeout and baseline assertions were retained. The real
orchestrator verifies fresh invocations, authenticated restart persistence,
explicit external output and EOF shutdown. Its fixed-directory reproduction
remains a failing design, as expected.

An early cleanup fixture cleared only the current session prefix and accidentally
reused/deleted the shared diagnostic session through its legacy alias. Source and
user data were unaffected. The fixture now clears/restores both namespaces,
checks its disposable parent before cleanup, and the test harness restores
namespace settings after each case. Four cleanup-isolation regressions pass;
all earlier failing cases were rerun with independent owned sessions.

Final diagnostics began outside all Git trees in the owned
`netcircuit-cKRGky` session; producer follow-ups used their separately owned
sessions. Only this Markdown evidence is retained in the repository. No new
screenshots or baselines were committed. Hosted Actions were not awaited.
Full browser, PostgreSQL, deployment-to-host and physical FPGA acceptance were
NOT_RUN for this naming task. The launcher's complete service smoke was NOT_RUN
because existing unrelated listeners owned its default ports; the copied legacy
cache's Doctor/provenance/import checks passed without changing the original
state or database.

## Remote Actions compatibility repair — 2026-11-04

The inspected push runs used Remote `685c365770b9831f3f0fd24cc7bae6496a79bae4`.
Two independent namespace boundaries caused the failures:

- [FPGA job](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/41799887751/job/126472788069):
  the unchanged published FPGA 0.1.1 installer exported only
  `NETCIRCUIT_FPGA_TOOLCHAIN_ROOT`. The renamed workflow passed the unset
  canonical variable as an empty argument. The older checker interpreted that
  as the checkout directory, which the output ownership guard correctly
  rejected. The workflow now uses the legacy value only when the canonical
  setting is unset, and rejects an empty result before invoking the checker.
  An explicitly empty canonical setting continues to mask its legacy alias.
- [Contracts job](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/41799887674/job/126472787374)
  and [Integration job](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/41799887559/job/126472788064):
  three negative tests removed only the canonical FPGA manifest/root or
  Interface root setting. CI had exported both aliases, so the valid legacy
  selection remained active. The original totals were 3 FAIL / 853 PASS and
  3 FAIL / 1506 PASS / 95 SKIP respectively. These fixtures now remove both
  aliases when testing missing input. They first prove a valid selection for
  canonical-only, legacy-only and dual-prefix environments; archive integrity,
  tamper detection and missing-input rejection assertions remain enforced.

The runtime compatibility resolver, published release bytes, dependency pins,
RTL assertions, browser baselines and other five repositories are unchanged.
The shell regression executes the actual YAML step with a recording consumer;
it covers both namespaces, canonical precedence, explicit empty values, absent
values and paths containing spaces.

Before the fixture correction, the expanded local regression reproduced
6 FAIL / 3 PASS; the corrected two-file suite passed all 49 cases. Before the
workflow correction, its executable regression reproduced 5 FAIL / 2 PASS;
afterwards all 7 cases passed. Six existing FPGA/release workflow policy tests
also passed. Independent reviews found no actionable issues.

Actual native acceptance also executed the current YAML block on Windows with
only the legacy toolchain-root export present. It used Python 3.14.4, Node
22.23.3, pyslang 12.0.0, the selected published Contracts wheel, and the selected
FPGA archive (`b82edb4167b821f55d98331304d0c49d2f37638d972fc9c167287bb6368908ca`).
The pinned OSS CAD Suite 2026-10-26 archive and its 372 execution files were
authenticated. The unmodified checker exited zero after parser/compiler checks
and both `LAB_FIRST_RTL_PASS` and `PERMIT_MATRIX_RTL_PASS` behavioral testbenches.
This is native RTL simulation evidence; physical FPGA hardware was NOT_RUN.

The Windows Node output/cleanup guard suites passed all 5 tests. Context,
Markdown, artifact worktree/index and whitespace guards passed. The verified
official actionlint 1.7.12 executable passed all 9 workflow files with
`-shellcheck= -pyflakes=`.

Ubuntu 24.04.5 / Python 3.12.3 / Node 22.23.4 reproduced the original three
selector failures with real selected products and both namespaces exported
(3 expected failures in 0.19 seconds). Source-locked Contracts, Simulator and
Hardware wheels, the API wheel, and the reviewed Interface/FPGA products were
installed in a fresh environment; `pip check` passed. The Contracts prechecks
also passed, including all 88 retained SDK baseline cases and 89 public
shape/profile comparisons.

An auxiliary Contracts run used seven protected Git roots, including read-only
Windows bootstrap checkouts. Repeated cross-filesystem Git discovery made it
much slower than hosted CI; Docker Desktop then stopped unexpectedly before a
complete exit result was captured. That run is NOT_COMPLETED, not PASS. Final
acceptance uses a fresh owned single-consumer context protecting the actual
disposable Remote Git checkout, matching the hosted job. Original repositories
remain read-only, and physical Git/path/symlink validation is unchanged.

The four documented Python documentation/provenance/link suites also passed
all 12 cases on Windows. No screenshots or baselines were generated or changed.

Final local record: 2026-11-04 17:14 UTC+07 (10:14 UTC), against the inspected
base revision plus the four code/test changes and this verification record.
The fresh Ubuntu runtime used the cached Playwright noble image
`sha256:152506b22d291accd022091243beac5096b030e397ad1707e5c6ffd8c1c22fe1`;
the image supplied the OS/runtime, not browser acceptance evidence.

| Final verification | Result |
| --- | --- |
| Ubuntu `python scripts/check_release.py --group contracts` | PASS: all 12 commands, 869 tests, exit 0; 90.8 seconds |
| Ubuntu `python scripts/check_release.py --group python` | NOT_COMPLETED: Docker Desktop stopped again during pytest; no complete exit result, so no PASS claim |
| Selected Interface `npm test` | NOT_RUN: its preceding container gate was interrupted |
| Windows selector files / YAML regression / existing workflow policy | PASS: 49 / 7 / 6 cases respectively |
| Windows selected FPGA native YAML step | PASS: parser/compiler validation and both safety testbenches, exit 0 |
| Actionlint / Node guards / documentation tests | PASS: 9 workflows / 5 tests / 12 tests respectively |
| Browser, PostgreSQL, deployment and physical FPGA acceptance | NOT_RUN for this focused workflow/test repair |

After the second Docker Desktop interruption, no further runtime restart was
attempted. The completed Contracts gate includes every changed testcase and the
actual shell-boundary regression; the separate native check executes the
published FPGA checker through the repaired YAML. The incomplete full Python
and unstarted Interface gates remain explicit limitations. New hosted Actions
are not awaited. Raw diagnostics began outside Git, were inspected, and only
this canonical Markdown record is retained after owned-session cleanup.

## Browser continuation and Interface patch 0.1.3 — 2026-11-04

The browser run that was still active during the preceding repair later ended
with 52 PASS, 5 FAIL and 1 SKIP at Remote `685c365`. Its
[chromium job](https://github.com/CIRNETLAB/CIRNET-Remote/actions/runs/41799887701/job/126472787919)
used the immutable Interface 0.1.2 artifact, not the later Remote `a46db65`.
Failure archive SHA256:
`e8cadc965011e6b70dbc1954dfb71ff09b16b708b1c7d22a4e5748b71bd50bab`.
The traces, screenshots and contexts were inspected outside Git. They prove
native rendering/backpressure failures, not a new namespace or geometry error.
Two held physical preflights exceed the unchanged 10 s client timeout while
Run-tab actions take multiple seconds. The placement/camera snapshots are
correct after their assertion budget expires. DPR 2 exhausts its original
360 s budget after 29 zero-leak poses.

Interface fixes DOM-only drawer redraws and accelerates the depth observer's
native triangle queries without replacing Three's intersection math. The full
analysis reference, GPU pixels, erosion and full framebuffer/material/scissor
restoration remain unchanged. Its native proof passes 78 cases, 11,850,288 exact
tested pixel positions and 194,249 exact native first-hit comparisons, including
positive controls and four restoration guards. The original four UI cases pass
on an explicitly unpublished native candidate; final Ubuntu/committed artifact
acceptance is recorded separately. See the current
[Interface verification guide](https://github.com/CIRNETLAB/CIRNET-Interface/blob/master/docs/VERIFICATION.md).

Remote now understands the explicit 0.1.3 system profile and canonical
`cirnet-interface-0.1.3-source.tar.gz` / `cirnet-interface-0.1.3-static.tar.gz`
filenames. All five other product versions, protocols and rollback data remain
unchanged. Historical 0.1.1/0.1.2 filenames and source/static identities remain
accepted. Unknown names/versions, mismatched versions, Contracts changes,
uncommitted provenance, paths and digests remain rejected. TDD observed
10 FAIL / 139 PASS before the new profile, and 2 FAIL / 2 PASS for the canonical
static-name boundary; the final focused suite passes 173 cases with no skips.
Independent review found no actionable issue. Preparing compatibility does not
silently replace the selected release or an immutable existing tag/asset.

The full current Interface 0.1.3 working-tree candidate passes all five original
failures on Ubuntu 24.04.5 / Python 3.12.3 / Node 22.23.4, pinned Chromium 1248
and a four-CPU limit. The same actual API/RPC/SQLite services and original test
settings are used. The run exits zero with five PASS and clean API shutdown
(2026-11-04 11:30:05–11:39:07 UTC; UTC+07 local time 18:30:05–18:39:07).
The unchanged native DPR 2 test separately passes all 30 poses in 209.772 s
within its original 360 s budget. These are functional-candidate results;
committed artifact packaging and the complete original browser suite remain
separate promotion checks.

The prepared Interface source commit is
`2fe7cba5252087af033202183ef242a4be5152cc` (version 0.1.3). Its final Node
22.23.3 verification passes all 1,488 runtime tests, 27 script checks, unit/E2E
types, 229-module boundaries and all three production entrypoints. Source and
static artifacts are built from that clean commit; no same-version published
asset is replaced.

The final functional Interface input is
`6c150f34193bb3b009046cbaa586fae0260560f4`, superseding the initial packaging
candidates above. The complete-suite attempt on intermediate `595d25f` exposed
one further compatibility assertion: successful login returns the immutable
API 0.1.1's `netcircuit_session`, while the renamed test expected only
`cirnet_session`. Trace and screenshot inspection confirmed successful login,
guest transfer and the original HttpOnly/Lax/root-path attributes. That attempt
was stopped normally: seven PASS, one auth FAIL, one interrupted, one original
historical skip and 48 not run; full-suite status is NOT_COMPLETED, never PASS.
Its JUnit SHA256 is
`d40185ddedd50260a5ac0fad41d7ecce6545161b9e386a396ebe21d791bcdcd4`.

The final test recognizes both exact session-cookie aliases and retains the
security, JavaScript-invisibility and storage-absence assertions for every
present cookie. Missing, duplicate, empty or conflicting credentials fail.
The canonical-only predicate was RED (one PASS/eight FAIL); all nine regressions
and two namespace cases pass after the repair, as do E2E types. Independent
review found no actionable issue. API/backend code and published wheels do not
change. The complete fresh Node 22.23.3 suite passes 1,497/1,497 runtime cases,
ten Contracts prechecks, unit types and 184 newly compiled bundles; all 517
compiler/source inputs remain unchanged. Final unit receipt SHA256:
`39ba8d0ba2b0ba7c3043b31063106e6f6de68085fc5ec61f25ee33e24419d531`.

Two separate official clean-export/bootstrap/locked-install/production builds
of this final commit produce identical archives:

| Interface 0.1.3 artifact | Bytes | SHA256 |
| --- | ---: | --- |
| `cirnet-interface-0.1.3-source.tar.gz` | 2,425,434 | `41273280dfc3934c33f7d6ae7fb5c0d4f76d92a9e8b31dd4b6c50c164449b2e3` |
| `cirnet-interface-0.1.3-static.tar.gz` | 2,193,267 | `5a4e53f118a9195fae27f55bb9a886fef229991cff835699aaf6e257c1341089` |

The exact Git payload comprises 581 files plus generated source metadata; all
582 source/35 static members are regular and root-safe. All three production
entrypoints and synchronized 0.1.3 product metadata are present. Source
fingerprint:
`b7d0c0e4485a4b8906377d920c6850b820aae063abbba07cb98c301bb2848a3a`.
Build receipt SHA256:
`333a1da7bbdb665e53cabf07a9ca183f793bb65bba6e183c19a9cd94037a609c`.
Complete browser acceptance of these exact committed bytes is recorded
separately from these unit/build results.

### Complete committed-artifact Ubuntu browser acceptance

The final source/static pair above passes the complete original browser group
on Ubuntu 24.04.5, Python 3.12.3, Node 22.23.4 and four CPUs, with the exact
published API/Contracts/Simulator/Hardware wheels and Playwright 1.64.1 / Chromium
1248. The unchanged `check_release.py --group browser` plan executes all three
commands: PASS, exit zero, 2,415.2 seconds. The full interval is 2026-11-04
12:14:55–12:55:10 UTC (19:14:55–19:55:10 UTC+07), within the original 90-minute
job envelope. One worker, zero retries, original per-test deadlines, DPR,
rendering assertions, tracing and baselines are preserved; the reviewed cookie
alias correction is described separately above.

JUnit records 58 tests: **57 PASS, 0 FAIL, 0 ERROR, 1 SKIP**. The sole skip is the
original optional retained pre-fix source capture; neither current DPR matrix
is skipped or filtered. Each covers all 30 poses: DPR 1 tests 2,349,652 pixels
and DPR 2 tests 9,399,115, with zero changes and visible interiors throughout.

| Original failed browser case | Final result | Seconds |
| --- | --- | ---: |
| Hidden-layer DPR 2, original 360-second budget | PASS | 202.094 |
| Flexible multiview, both viewports including 1920/View TOP | PASS | 130.932 |
| Unselected component closeups/camera settle | PASS | 110.195 |
| Pending physical preflight Cancel | PASS | 10.929 |
| Pending physical preflight release | PASS | 11.327 |

The real login/guest-transfer case also passes against the immutable legacy API.
Post-run checks retain all 582 source, 35 static, 406 Remote and 69 installed API
payload files, together with every selected archive digest. Browser execution
uses only a complete owned copy of the pinned Chromium. API shutdown exits zero;
no owned active services or listening test ports remain.

JUnit SHA256:
`38db5ac27ebdf66f5f526fda92c4fabc21026759deaaa4080f3e4b836c658909`.
Full log SHA256:
`7e0351b2005a081e4be0c7fbdd31e5eca552d671c0641b77eda5c9fdaf00dad5`.
This is completed local software acceptance; subsequent hosted Actions, physical
hardware and deployment are not inferred from it.

Six representative success visuals were inspected, including the repaired
multiview/closeup/preflight/depth cases. Final accepted receipt SHA256:
`ba6f5958951219c7c8fcfd85a7e790a6a9e71bd82fa6f8a97f4e267c31f90ba2`.
The new [Interface v0.1.3 release](https://github.com/CIRNETLAB/CIRNET-Interface/releases/tag/v0.1.3)
is published at the frozen functional commit. Its source/static asset IDs are
`709523575` / `709523651`. Anonymous public downloads pass their exact sizes and
SHA256 values and the existing strict source/static extraction/provenance checks.
The selection changes exactly 16 reviewed leaves; all five other product
records, compatibility and rollback remain unchanged. Integration tools are
recorded at `ea171dd950586ba104a8224220266c78861f1298`, separately from the
unchanged API wheel's original build provenance. Later documentation-only
commits do not replace the tested Interface source/tag or artifact bytes.

After pinning the published assets, the final release/system/local-artifact and
Interface installer regression suite passes **173/173**, no skips, in 44.57 s.
It uses the existing verification virtualenv; an initial attempt with the
runtime-only interpreter had no pytest and is recorded as NOT_RUN, not a code
test failure. No package was installed into or changed in that runtime.
Context, 34 Remote Markdown files, 17 Interface Markdown files, both artifact
worktree/index/committed-diff guards and whitespace checks pass. Follow-up
hosted Actions are NOT_WAITED at the user's instruction; deployment and physical
hardware checks are NOT_RUN.
