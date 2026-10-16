# GitHub Actions repair on refactor — 2026-10-16

## Remote evidence

Read the actual completed GitHub Actions jobs for branch `refactor`, commit
`bcfc6dc1b5af07eb18405d5ee4745386e6b0084b`, after the user made the repository public.
That commit matches the local starting HEAD. The initial 404 was access-related;
no failure diagnosis was inferred from it. The browser access attempt was denied;
the subsequently available GitHub connector supplied the evidence below.

| Workflow / job | Observed result | First actionable failure |
| --- | --- | --- |
| [Backend / test](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/38880289887/job/116905114921) | 425 passed, 1 failed | `test_public_api_contracts.py:127` cannot import `scripts.export_openapi`. |
| [Integration / repository-contracts](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/38880289807/job/116905115024) | Collection interrupted | `test_session_benchmark.py:3` cannot import `scripts.benchmark_web_sessions`. |
| [Contracts / installed-packages](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/38880289818/job/116905114820) | Wheel build exits 1 | Python 3.11 retains setuptools 79.0.1; the no-isolation build requires exactly 84.0.0. The previous checker hides the child output in an unuploaded `.build` log. |
| [Browser / chromium](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/38880289817/job/116905115091) | 13 passed, 1 failed | `lab-workflows.spec.ts:59` reads a page response body after navigation; Chromium reports that the response body is no longer available. |

Frontend, Documentation Context, canonical Contracts and the actual PostgreSQL
migration job succeeded on `bcfc6dc`. Hardware Service and Simulator most recently
succeeded on `44cff6a`; their path filters did not schedule another run for the
documentation-only follow-up. The existing Node action-runtime deprecation and
Vite WebSocket reset messages were not the failing assertions.

Full retrieved job logs are retained locally under `.build/ci-2026-10-16/` as
`backend.log`, `integration.log`, `installed-packages.log` and `browser.log`.
These are ignored diagnostic artifacts, not new application data.

## Import-path repair

The workflows invoked the `pytest` console script, while the release runner and
prior full-suite verification used `python -m pytest`. The console script does
not add the checkout working directory to Python's module search path. The
`scripts` namespace deliberately belongs to the source checkout, not the
installed production Contracts wheel. Editable installation of the Contracts
package does not install all repository tools.

Changed the Backend and repository Integration commands to `python -m pytest`,
keeping their complete existing test selections. No `PYTHONPATH` override,
`sys.path` mutation, production package expansion or test skip was added.

Evidence: the exact Backend console command reproduced the remote
`ModuleNotFoundError` locally. Two subprocess regression cases then reproduced
both workflow failures before the fix. Each reads the actual configured workflow
launcher, removes ambient `PYTHONPATH` and executes an existing import-dependent
case. Explicit node IDs keep the nested probes from recursively running their
parent suite. Both regressions and the existing workflow checks passed after the
two command changes: 14 PASS.

## Build-toolchain repair

The remote Python 3.11 installation log explicitly retained setuptools 79.0.1,
which satisfies `grpcio-tools`' lower bound but not the root package's exact
`build-system.requires` declaration. An editable build's isolated environment
does not update the invoking interpreter's setuptools. The subsequent
`python -m build --wheel --no-isolation` requires its build tools in that invoking
interpreter.

An isolated Python 3.12 control reproduced the actual build failure first with
setuptools 83 and then with the exact remote version 79.0.1:
`Missing dependencies: setuptools==84.0.0`. Added the already-required
`setuptools==84.0.0` to the shared verification/code-generation requirements.
Installing those requirements now upgrades the retained 79.0.1, and the same
staged no-isolation wheel build succeeds. No project build requirement was
relaxed and no application runtime dependency version was changed.

The package checker now reports a failed command's exit code, arguments, working
directory and at most the last 16,000 bytes of its combined stdout/stderr. The
complete output remains in its `.build/package-check-*.log`. The Contracts
workflow uploads those logs even on failure, including the hidden `.build` path.
Regression tests cover all four projects' declared build requirements and actual
child failures with short and long output, retaining stderr and the complete log.
The package/workflow focused suite passes: 22 tests in 12.89 seconds.

## Browser response-lifetime repair

The test kept a Playwright page `Response` and read its body after the Run flow
could navigate. The actual remote API had already created the experiment, run the
digital simulation, sealed its capture and reached COMPLETE. The failed assertion
was the test's delayed Chromium response-body read.

The corrected test fetches the actual Create response through Playwright routing,
validates its status, exact submitted typed configuration and returned
ExperimentRecord before fulfilling the unchanged real response to the page.
Automatic network retries remain disabled and a single Create is asserted. The
real API, database, RPC/simulator, capture trace and subsequent history/reload
checks remain in use. No synthetic response, product fallback or Run replay was
introduced.

## Final local verification

| Gate | Result and evidence |
| --- | --- |
| Exact workflow import probes and existing workflow checks | 14 PASS after two observed regression failures. |
| Package build, diagnostics and workflow focused tests | 22 PASS; stale setuptools 79.0.1 build control is RED before the shared pin and GREEN afterward. |
| Installed Contracts, API, simulator and Hardware Service wheels | PASS, process exit 0. Real isolated interpreter, venv and cwd physically outside the checkout; offline resources, RPC, migrations, CLI, domains and NCAP1/2 are exercised. Full log: `.build/package-check-33368.log`. |
| E2E typecheck and architecture boundaries | PASS; 190 source modules checked. |
| Focused real student AND flow | PASS, 30.2 seconds; actual API/simulator/capture/history/reload assertions retained. |
| Full Chromium suite | 14 PASS, 0 failures/errors/skips, 147.945531 seconds, runner exit 0; two verified API shutdowns with exit 0 (restart and final cleanup). JUnit: `apps/web/.test-build/playwright/junit.xml`; log: `apps/web/.test-build/e2e.log`. |
| Production Web build | PASS: vue-tsc and Vite, 301 modules, Vite stage 18.63 seconds. Existing bundle-size advisory remains. Log: `apps/web/.test-build/ci-production-build.log`. |
| Full Python suite | 1,021 PASS, 1 Icarus/vvp SKIP, 1 existing Starlette/httpx TestClient warning; process exit 0, 290.58 seconds. Includes all six newly added regression cases. Log: `.build/ci-2026-10-16/python-final.log`. |

The wheel check used the existing allowed external writable directory
`C:/Users/trann/.codex/visualizations/2026/10/16/01a14299-e9d9-7262-a3d9-23b1fb7960b5`,
with its own uniquely named temporary child. The verification environment is
Windows/Python 3.12; no local Python 3.11 interpreter or Linux runtime was
available. Actual remote logs establish the corresponding Python 3.11 stale-tool
condition. WSL access is denied in this tool environment and Docker has no running
Linux daemon. The hosted Ubuntu/Python 3.11/Node 22 jobs must still run against a
new commit before remote success can be asserted.

Full Python command from the repository root:

```powershell
.\.audit-runtime\Scripts\python.exe -m pytest -q -rs --basetemp .build/pytest-ci-refactor-final
```

Context integrity and `git diff --check` also pass. Independent review of the
workflow subprocess probes, packaging diagnostics and actual-response E2E change
found no remaining actionable issue. The complete Python and browser runs were
not filtered and retained their existing assertions. The six regressions comprise
two actual workflow launcher probes, four-project build-tool coverage, two real
failing-child output cases and the CI diagnostic artifact check.

Hosted Actions have not been rerun with the local changes. No source commit,
push, merge, deployment, GitHub rerun or remote repository mutation is performed
as part of this repair. Source scope is the three workflow files, shared build
requirements, package checker, E2E specification, three regression test files and
this report. Application behavior, public contracts and safety boundaries are
unchanged.
