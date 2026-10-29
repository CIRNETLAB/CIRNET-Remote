# Verification and external artifacts

Status: IMPLEMENTED policy and tooling. Individual results are VERIFIED only in their dated verification report. This guide governs new verification output; retained legacy evidence is inventoried separately and has not been deleted.

## Output policy

Create screenshots, video, Playwright traces, HTML reports with images, raw JSON metrics, logs and other diagnostic output outside **every checkout/worktree and Git administration directory immediately**. Only Markdown verification evidence belongs in this repository. Never capture into the repository and move it out afterward, embed Base64/data URI evidence, or put temporary image links into permanent documentation.

Source logos/icons/textures, model assets, product/design references, contract fixtures and approved golden baselines remain source inputs. Compilation caches such as `.test-build/*.mjs` and distribution assets are not verification evidence. Do not regenerate a baseline to hide a regression.

Use `scripts/artifact-paths.mjs` from Node/TypeScript. Python tools use `scripts/artifact_paths.py`, which delegates to that same implementation. No independent path-validation algorithm is permitted in consumers.

Verification harnesses require Node (CI pins Node 22) and Git in `PATH`, including Python callers of the allocator. M1 packages the canonical allocator separately as DEV tooling: `netcircuit-artifact-paths==1.0.0a1`. Bootstrap the reviewed artifact before running checks with `python scripts/install_contracts.py --with-dev --manifest ABSOLUTE_MANIFEST`. CI uses the same digest-verified bootstrap before allocation; production Contracts consumers do not need DEV tooling. Remote adapters delegate to this installed implementation and fail if it is absent or differs from `integration/contracts-version.json`.

For verification spanning repositories, supply `NETCIRCUIT_ARTIFACTS_CONTEXT` as JSON with an explicit owner and every participating absolute repository root before allocation (M5: Remote, FPGA, Contracts, Hardware and Simulator). Inherited children and cleanup must retain that context. The allocator expands each Git family and rejects discovered checkout/Git administration paths, including aliases. A session allocated under an earlier context must be cleaned with its original owner/root context.

M3 consumers install the reviewed Simulator artifact with `python scripts/install_simulator.py --manifest ABSOLUTE_SIMULATOR_MANIFEST` after Contracts bootstrap. `python scripts/check_simulator_consumer.py` checks exact version and installed provenance; it must reject editable, missing or shadowed source. Current Simulator units run in CIRNET-Simulator against its installed wheel; retained `simulator/circuit-simulator/tests` is excluded from default Remote collection. Remote still runs API preview, actual virtual execution/worker/RPC and installed-package integration against that same artifact. A fresh export of uncommitted reviewed files is recorded separately from a future committed clean checkout.

M4 consumers install `netcircuit-hardware-service==0.1.1` with `python scripts/install_hardware.py --manifest ABSOLUTE_HARDWARE_MANIFEST` after the exact Contracts/Simulator bootstrap. `python scripts/check_hardware_consumer.py` verifies selected archive/version/RECORD/import provenance. Hardware unit tests run in CIRNET-Hardware; retained `services/hardware-service` is excluded from default Remote discovery. Remote retains actual API/RPC/worker/capture/safety integration.

Current M6 selects FPGA source/scaffold 0.1.1 (historical M5 used 0.1.0) with `python scripts/install_fpga.py --manifest ABSOLUTE_FPGA_MANIFEST`; the manifest contains a selected source archive path and SHA256. The installed product is an immutable source export under a fresh allocator-owned child, selected through `NETCIRCUIT_FPGA_ROOT`/`NETCIRCUIT_FPGA_ARTIFACT_MANIFEST`, with complete inventory and fingerprint checks. `python scripts/check_fpga_consumer.py` validates this product and installed Contracts compatibility; it never falls back to retained `fpga/`. Original `tests/fpga` is excluded from default collection; Remote keeps installed Hardware/FPGA compatibility assertions. Standalone FPGA acceptance requires exact pinned slang and Icarus/vvp, actual behavioral simulation with no RTL skips, externally owned outputs and recorded executable/archive identities. Use short external paths for Windows tool bundles. No FPGA Python runtime package, synthesis result or board image is implied.

The installed-package gate builds only API locally, then selects the reviewed Contracts, Simulator and Hardware wheels. Its fresh venv, application state and subprocess probes live under the canonical session. Optional `scripts/check_contract_package.py --temporary-root` (or the release runner's `--package-temporary-root`) must name a child of the current owned session; an unrelated external directory is insufficient. The gate removes only its own nested temporary child, while the caller inspects retained logs and cleans the owning session afterward.

`scripts/check_release.py` allocates fresh external default SQLite and capture paths for every invocation before launching child commands. It overrides inherited application defaults so a fixture that imports a default app cannot touch a developer's database or capture directory; the caller's environment stays unchanged. The real PostgreSQL gate still requires its separate `NETCIRCUIT_TEST_POSTGRES_URL`. For direct API pytest commands outside this runner, set both default database and capture paths to allocator-owned locations before importing application modules.

```js
import { getArtifactDirectory } from './scripts/artifact-paths.mjs'
const screenshots = getArtifactDirectory('screenshots')
```

The allocator defaults to a unique `netcircuit-*` session in the OS temporary directory on Windows/Linux. `NETCIRCUIT_ARTIFACTS_DIR` optionally selects an **absolute external parent**, under which a fresh session is created. `NETCIRCUIT_ARTIFACTS_SESSION` is internal inherited state used by child processes/workers to share that session. `getArtifactDirectory(subdir, { directory: externalParent })` allocates a separate session under an explicit external parent. Repository/Git paths and symlink escapes are rejected before output creation. Git enumeration failures fail closed. If external writing is denied, report BLOCKED/request the needed tool permission; never fall back to source directories.

Pytest's `--basetemp` controls fixture files, separately from `.pytest_cache`. Root, API, Simulator and Hardware Python projects disable `cacheprovider` through their pytest configuration. Preserve that setting for nested subprocesses; if explicitly enabling the plugin, select an allocator-owned external `cache_dir` before running it. The M1 report records the earlier cache containment deviation and the follow-up regression check.

For one shell session, allocate once, then export the returned root to child commands:

```powershell
$env:NETCIRCUIT_ARTIFACTS_SESSION = node scripts/artifact-paths.mjs
$verificationLog = Join-Path $env:NETCIRCUIT_ARTIFACTS_SESSION 'checks.log'
# Run checks and inspect evidence before cleanup.
```

```sh
export NETCIRCUIT_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)"
# Run checks and inspect evidence before cleanup.
```

From another working directory use the script's absolute path, or the appropriate relative path to it. Allocation itself is independent of the caller's working directory.

## M6 current release setup

Current repositories use `CIRNETLAB/CIRNET-*`; local checkout paths and technical
identifiers retain their existing names. Select the exact numeric asset URLs
and digests in the current Git manifest. Historical immutable manifests/release
notes keep their recorded source/URLs and are not silently rewritten. Record
committed build inputs, archive SHA-256 and member-payload differences when
comparing a rename candidate with an existing release. A raw archive difference,
newline-only difference or metadata-only change must be stated explicitly.
Do not substitute an unpublished same-version candidate into a release selection.
Changing a published artifact/tag requires the user's separate release decision;
an immutable release cannot be overwritten. Revalidated original 0.1.1 bytes
retain their original build provenance.

The approved system/integration release is 0.1.2 with Interface 0.1.2, retaining API, Contracts, Simulator, Hardware and FPGA 0.1.1 and DEV tooling 1.0.0a1. The latest explicit M6 sequencing decision permits publication after actual full selected-artifact local Ubuntu browser acceptance without waiting for further Actions. Record prior CI-identity draft access and any new unrun identity checks separately; pending or failed Actions are not PASS. Use the exact system release manifest and [clean-machine runbook](../deployment/multi-repo-release.md). Installed Contracts resources and explicit Interface/FPGA artifacts replace frozen-reference fixtures. Standalone producer repositories own deterministic generation, unit/AST, backend, RPC and RTL gates; Remote owns the full integrated release groups. Historical M1–M5 measurements remain separately dated. Initial Python entrypoints must suppress source bytecode before importing helper modules, and all child temp/cache paths must belong to the canonical session. Applying a child bootstrap does not change the parent shell; import its recorded environment before continuing.

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
has the checkout root on its import path. See the [Actions repair evidence](verification/2026-10-20-github-actions.md).

For changed Web test output plumbing after M2, bootstrap the exact reviewed artifacts and run `node --test scripts/*.test.mjs`, `npm test`, `npm run check:boundaries`, `npm run build` and `npx tsc --noEmit -p tsconfig.e2e.json` in the explicitly selected CIRNET-Interface product. Remote starts real integration with `node scripts/e2e-interface.mjs --interface-root ABSOLUTE_PRODUCT --forbid-only`; named release gates accept `--interface-root` or `NETCIRCUIT_INTERFACE_ROOT` and never fall back to retained `apps/web`. Before allocating a shared session, include all participating Git roots in `NETCIRCUIT_ARTIFACTS_CONTEXT`; an exported product inside the owned session inherits this context rather than becoming a Git root. Playwright output, explicit suite screenshots/reports, backend test state and reporter output use the shared allocator. A configured reporter/output directory inside a checkout is an error. Do not disable assertions to satisfy the policy. See [Contracts](../contracts/README.md) for release groups and external PostgreSQL/package prerequisites.

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
`NETCIRCUIT_ARTIFACTS_DIR` parent and allocate a fresh session; do not fall back
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

`scripts/legacy-verification-evidence.json` preserves only the 16 exact paths/hashes already tracked at `0cc66f8` (seven PNGs and nine raw JSON records), pending the user's decision. This prevents a PR against an older branch, or a first-push CI comparison, from treating retained history as newly generated evidence. Any subsequent content change is rejected; only Git's JSON LF/CRLF checkout conversion is normalized. Do not add new captures to this manifest. Markdown embedded data-URI visuals and unapproved HTML report output are also rejected, including index-only content. Original artwork/reference images under `assets/`, product assets and the two source instrument-preview HTML entrypoints are source inputs.

## Cleanup and CI

After inspecting results, run `node scripts/artifact-paths.mjs --cleanup <session-root>` (Python: `cleanup_artifact_session(root)`). Cleanup verifies the canonical external path, unique session name and ownership marker before deleting only that session. Do not pass an arbitrary temporary parent, pre-existing output directory, another user's files or another session. Interrupted sessions remain outside source; locate and inspect their ownership before a separate authorized cleanup.

CI allocates in `runner.temp`, uploads external evidence when needed, then cleans its own session. Upload retention is not a reason to commit artifacts. `.gitignore` is a narrow secondary defense for known generated directories, not a blanket image-extension ban.

The backend, hardware-service, frontend, repository integration, PostgreSQL migration and canonical Contracts jobs allocate a fresh session through `scripts/artifact-paths.mjs` before verification. They publish its ownership before allocating application defaults, set the default database and captures inside that session, pass its `pytest` child as `--basetemp` for direct pytest commands, and run the allocator's guarded cleanup with `always()` after failures as well as success. The migration job retains its PostgreSQL 18 service and explicit `NETCIRCUIT_TEST_POSTGRES_URL`; the isolated SQLite default applies only to incidental default-app imports and does not replace PostgreSQL validation. Local workflow policy tests check this configuration; hosted CI execution is separate evidence.

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

Deletion/relocation of Markdown and old generated visual outputs requires a separate user decision. Proposals must list exact relative paths, rationale, replacement, content to retain, references to update, risk and preconditions. Missing original handover images must be labelled as absent/not inspected, separately from new temporary screenshots intentionally not retained. The [audit report](verification/2026-10-19-documentation-artifact-audit.md) records the initial inventory and decisions.
