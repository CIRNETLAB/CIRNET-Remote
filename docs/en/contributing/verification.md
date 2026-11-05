# Verify CIRNET Remote

[Tiếng Việt](../../vi/contributing/verification.md) · [Documentation](../index.md)

## Own the output before running a check

Put screenshots, videos, traces, HTML reports, logs and raw metrics outside
every checkout, worktree and Git administration directory from the first write.
Use the shared DEV allocator from `scripts/artifact-paths.mjs` or the Python
adapter `scripts/artifact_paths.py`. Preserve approved source assets and test
baselines. Keep only Markdown verification evidence in the repository.

Install Git, normal-GIL CPython 3.14 and Node.js 26. The independent DEV input
is `cirnet-artifact-paths==1.0.0a1`. Bootstrap it by exact digest before allocation.
For checks across repositories, set `CIRNET_ARTIFACTS_CONTEXT` to JSON with
an explicit owner and all participating absolute Git roots. Keep this context
for child processes and cleanup. Use `CIRNET_ARTIFACTS_DIR` only as an absolute
external parent. Inspect the evidence, then clean only the owned session.

```powershell
$env:CIRNET_ARTIFACTS_SESSION = node scripts/artifact-paths.mjs
$verificationLog = Join-Path $env:CIRNET_ARTIFACTS_SESSION 'checks.log'
```

```sh
export CIRNET_ARTIFACTS_SESSION="$(node scripts/artifact-paths.mjs)"
```

Keep pytest `--basetemp` and any cache in the owned session. Preserve the
configured `cacheprovider` disablement for subprocesses. Use a fresh SQLite
database and capture directory when calling API pytest directly. The release
runner allocates fresh defaults for each invocation. Use a separate real
PostgreSQL database and matching backup tools for the PostgreSQL gate.

## Choose the exact inputs and gates

Follow [release preparation](../operations/release-and-rollback.md) for the
selected published artifacts or a separate local set. The API source jobs use
the [source dependency lock](../../../integration/ci-source-dependencies.json)
to build Contracts, Simulator and Hardware from exact revisions with locked
tools. The Browser candidate workflow uses the
[Interface source lock](../../../integration/browser-interface-source.json)
on PRs and pushes to `master`. Tag runs and manual `interface_source=published`
use the released Interface archive. Both use the exact selected API wheel.
The standalone FPGA gate owns parser, compiler, RTL and toolchain checks.

```text
python -B scripts/check_release.py --show-plan
python -B scripts/check_release.py --group contracts
python -B scripts/check_release.py --group python
python -B scripts/check_release.py --group web
python -B scripts/check_release.py --group postgres
python -B scripts/check_release.py --group browser
python -B scripts/check_release.py --group package
```

The default `all` covers these six groups. `load` is explicit. The integrated
browser needs the pinned Chromium runtime and real API, Hardware and Simulator.
Keep its one worker, zero retries and `--forbid-only`. Use the package gate's
explicit Python 3.11 lane where required. Do not accept an editable or sibling
checkout in place of a selected installed wheel. Record the exact input set
before comparing measurements. Local `PASS`, hosted `PASS`, real RTL and
physical HIL are separate claims. Record `FAIL`, `NOT_RUN`, `BLOCKED`, and
`NOT_APPLICABLE` separately. Use the [evidence index](../history/index.md).

The CI selector runs alongside the authoritative full Python gate. The
comparison binds the commit, lock hashes, installed wheels and dependency
versions, Interface SDK, FPGA source and case outcomes. A missed failure is
`FAIL` with full effective scope. Incomparable evidence is `NOT_VERIFIED`.
Set `CIRNET_CI_SELECTOR_FORCE_FULL=true` for subsequent observation jobs during
investigation. Unset it or use `false` after validating the rule. An invalid
nonempty value selects full. The setting affects only the advisory job.

## Check documentation changes

Run from the Remote root. `REVIEWED_BASE_SHA` is the commit preceding the change.

```powershell
python -B scripts/check_context.py
python -B scripts/check_markdown.py
node scripts/check-verification-artifacts.mjs --base REVIEWED_BASE_SHA
node --test scripts/artifact-paths.test.mjs scripts/check-verification-artifacts.test.mjs
python -B -m pytest -q tests/test_docs_baseline.py tests/test_post_r7_provenance.py tests/integration/test_context_integrity.py tests/test_markdown_links.py tests/test_docs_workflow.py --basetemp "$env:CIRNET_ARTIFACTS_SESSION/pytest"
```

CI also lints workflows with Actionlint 1.7.12. `check_markdown.py` checks local
links, case and anchors. Verify cross-repository and website links separately.
Follow [documentation conventions](writing-documentation.md) for the language
pair. The [original verification ledger and policy](../../VERIFICATION.md)
retains exact historical evidence and further gate-specific procedures.
