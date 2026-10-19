# Verification and external artifacts

Status: IMPLEMENTED policy and tooling. Individual results are VERIFIED only in their dated verification report. This guide governs new verification output; retained legacy evidence is inventoried separately and has not been deleted.

## Output policy

Create screenshots, video, Playwright traces, HTML reports with images, raw JSON metrics, logs and other diagnostic output outside **every checkout/worktree and Git administration directory immediately**. Only Markdown verification evidence belongs in this repository. Never capture into the repository and move it out afterward, embed Base64/data URI evidence, or put temporary image links into permanent documentation.

Source logos/icons/textures, model assets, product/design references, contract fixtures and approved golden baselines remain source inputs. Compilation caches such as `.test-build/*.mjs` and distribution assets are not verification evidence. Do not regenerate a baseline to hide a regression.

Use `scripts/artifact-paths.mjs` from Node/TypeScript. Python tools use `scripts/artifact_paths.py`, which delegates to that same implementation. No independent path-validation algorithm is permitted in consumers.

Verification harnesses require Node (CI pins Node 22) and Git in `PATH`, including Python callers of the allocator. These are existing repository toolchain prerequisites; no new package dependency is introduced.

```js
import { getArtifactDirectory } from './scripts/artifact-paths.mjs'
const screenshots = getArtifactDirectory('screenshots')
```

The allocator defaults to a unique `netcircuit-*` session in the OS temporary directory on Windows/Linux. `NETCIRCUIT_ARTIFACTS_DIR` optionally selects an **absolute external parent**, under which a fresh session is created. `NETCIRCUIT_ARTIFACTS_SESSION` is internal inherited state used by child processes/workers to share that session. `getArtifactDirectory(subdir, { directory: externalParent })` allocates a separate session under an explicit external parent. Repository/Git paths and symlink escapes are rejected before output creation. Git enumeration failures fail closed. If external writing is denied, report BLOCKED/request the needed tool permission; never fall back to source directories.

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

For changed Web test output plumbing, run `npm test`, `npm run check:boundaries`, `npm run build` and `npx tsc --noEmit -p tsconfig.e2e.json` in `apps/web`, plus a real relevant `npm run test:e2e -- ...` browser scenario. Playwright output, explicit suite screenshots/reports, backend test state and reporter output use the shared allocator. A configured reporter/output directory inside a checkout is an error. Do not disable assertions to satisfy the policy. See [Contracts](../contracts/README.md) for release groups and external PostgreSQL/package prerequisites.

Record revision and dirty state, time/timezone, environment/browser/renderer, scenario, commands, PASS/FAIL/NOT_RUN/BLOCKED, observed results and limits in the affected Markdown report. Historical measurements are not freshly verified. State whether temporary screenshots were actually inspected; do not claim visual or hardware success from source review alone. No permanent temporary-path links are required.

Before/after work, compare Git status and staged diff plus a physical inventory of generated output locations including ignored files. The artifact Git guard checks added/modified worktree and index paths and optional `--base <commit>` CI changes using one policy implementation. Approved asset/fixture paths are distinguished from known generated locations; unknown visual additions require explicit review of their source role. The guard does not remove old tracked outputs or replace the on-disk comparison.

`scripts/legacy-verification-evidence.json` preserves only the 16 exact paths/hashes already tracked at `0cc66f8` (seven PNGs and nine raw JSON records), pending the user's decision. This prevents a PR against an older branch, or a first-push CI comparison, from treating retained history as newly generated evidence. Any subsequent content change is rejected; only Git's JSON LF/CRLF checkout conversion is normalized. Do not add new captures to this manifest. Markdown embedded data-URI visuals and unapproved HTML report output are also rejected, including index-only content. Original artwork/reference images under `assets/`, product assets and the two source instrument-preview HTML entrypoints are source inputs.

## Cleanup and CI

After inspecting results, run `node scripts/artifact-paths.mjs --cleanup <session-root>` (Python: `cleanup_artifact_session(root)`). Cleanup verifies the canonical external path, unique session name and ownership marker before deleting only that session. Do not pass an arbitrary temporary parent, pre-existing output directory, another user's files or another session. Interrupted sessions remain outside source; locate and inspect their ownership before a separate authorized cleanup.

CI allocates in `runner.temp`, uploads external evidence when needed, then cleans its own session. Upload retention is not a reason to commit artifacts. `.gitignore` is a narrow secondary defense for known generated directories, not a blanket image-extension ban.

## Archive and missing evidence

Keep historical results, incomplete plans, ADRs, LICENSE/NOTICE and provenance. The R0–R7 archived prompt is byte-locked by `tests/test_post_r7_provenance.py`; required architecture/context/history markers are checked by existing tests. Add an external status note instead of editing locked bytes or weakening tests.

Deletion/relocation of Markdown and old generated visual outputs requires a separate user decision. Proposals must list exact relative paths, rationale, replacement, content to retain, references to update, risk and preconditions. Missing original handover images must be labelled as absent/not inspected, separately from new temporary screenshots intentionally not retained. The [audit report](verification/2026-10-19-documentation-artifact-audit.md) records the initial inventory and decisions.
