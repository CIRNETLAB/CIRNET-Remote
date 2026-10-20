# Refactor GitHub Actions repair

Status: FIXED_AND_LOCALLY_VERIFIED; new hosted execution pending the user's commit/push. Recorded 2026-10-20, Asia/Saigon. Starting source and remote `refactor` revision: `33b52f6adaf757ce0e273c53247b136c74505251`; initial worktree and index clean. The user requested investigation and repair of the actual failed Actions. The earlier instruction excluding product UI verification remains in effect. No staging, commit, push, workflow rerun or deployment is performed by this task.

## Observed hosted failures

GitHub's public Actions API was inspected for this exact revision, including job steps and the decoded Documentation job log. Seven of eight triggered workflows failed; Simulator passed. Six failed workflows had zero jobs and names falling back to their YAML paths, so their application tests never ran.

| Workflow | Hosted evidence at the starting commit | Failure |
| --- | --- | --- |
| Backend | [Run 39451659470](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451659470) | Rejected before creating jobs |
| Frontend | [Run 39451657775](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451657775) | Rejected before creating jobs |
| Contracts | [Run 39451656069](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451656069) | Rejected before creating jobs |
| Hardware Service | [Run 39451661161](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451661161) | Rejected before creating jobs |
| Integration | [Run 39451662929](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451662929) | Rejected before creating jobs |
| Real browser release gate | [Run 39451653732](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451653732) | Rejected before creating jobs; UI execution is outside this repair's local verification scope |
| Documentation Context | [Run 39451665051](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451665051) | `ModuleNotFoundError: No module named 'scripts'` collecting `tests/test_markdown_links.py` |
| Simulator | [Run 39451665095](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39451665095) | PASS at the starting commit |

## Root causes and reproduction

The six rejected files use `${{ runner.temp }}` in job-level `env`. GitHub does not make the `runner` context available there: it is available in step-level `env`. This is an expression-context validation failure before a runner is allocated, consistent with the zero-job API results. The [official context availability table](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability) distinguishes these two locations. Ordinary YAML parsing does not enforce that table. Earlier local policy tests incorrectly asserted the invalid job-level placement, so their PASS did not establish GitHub workflow validity. Actual workflow-language validation is required separately.

The official actionlint 1.7.12 Windows release reproduced **eight expression errors across six workflow files**, exit 1, before repair: Backend, Frontend, Hardware Service and browser each have one invalid job-level declaration; Contracts and Integration each have two. The downloaded release archive SHA256 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9` matches the upstream checksums. This independent parser reproduction confirms the cause rather than inferring it solely from missing jobs.

The Documentation job reached Ubuntu 24.04.5/Python 3.13.16/Node 22.23.3. Its context, Markdown, committed-artifact guard and five Node allocator/guard self-tests all passed. It installed pytest, then launched the bare `pytest` console entrypoint. That entrypoint does not establish the repository root on `sys.path`; the test importing `scripts.check_markdown` failed during collection. A developer environment with editable installs can conceal this difference. The regression therefore checks subprocess startup without editable `.pth` files, rather than relying on the existing verification venv's import path.

The new regression first failed with that same missing `scripts` import and subprocess exit 2. It starts Python with `-S`, supplies only pytest's site-package directory and disables unrelated auto-loaded plugins. Running the workflow's fixed module invocation collects the actual documentation tests successfully. [pytest's invocation documentation](https://docs.pytest.org/en/stable/how-to/usage.html#calling-pytest-through-python-m-pytest) describes the current-directory import-path difference.

## Repair and verification

The eight runner-dependent artifact declarations now belong to the allocation steps' `env`. PostgreSQL connection/tool configuration and the browser Python selector remain at their valid job scope. The allocated `NETCIRCUIT_ARTIFACTS_SESSION` is still published through `GITHUB_ENV`, so later steps and cleanup inherit the owned directory even after the allocation step's temporary parent variable goes out of scope. Test selection, migration requirements, browser assertions, dependency pins and compatibility baselines are unchanged.

Documentation now invokes `python -m pytest`, pins pytest 9.1.1 consistently with the verification toolchain, allocates external fallback database/captures/pytest output and always cleans its owned session after failures. It also checks every workflow with actionlint 1.7.12 before other verification. The official Linux archive is pinned to SHA256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8` and extracted only after checksum verification. `-shellcheck= -pyflakes=` omits optional external shell/Python lint tools; all workflow syntax, schema and expression-context validation remains active. No ignore rule or continue-on-error hides workflow failures.

| Fresh local command/check | Result |
| --- | --- |
| Official actionlint 1.7.12, `-shellcheck= -pyflakes=` over all nine workflow YAML files | PASS, exit 0; original source reproduced eight expression errors |
| `python -m pytest -q tests/contracts/test_release_workflows.py tests/contracts/test_installed_package_probe.py tests/frontend/test_browser_workflow.py tests/test_docs_baseline.py tests/test_post_r7_provenance.py tests/integration/test_context_integrity.py tests/test_markdown_links.py tests/test_docs_workflow.py --basetemp <owned external path>` | 50 PASS, 4.83 s, fresh integrated confirmation |
| `node --test scripts/artifact-paths.test.mjs scripts/check-verification-artifacts.test.mjs` with owned external temporary paths | 5 PASS; the first sandbox attempt hit Windows symlink/Git-config permissions, then the required elevated retry passed without changing assertions |

The focused workflow/package policy command first passed 37 cases after its RED reproductions; the focused documentation command passed 13. The integrated 50-case run above verifies both changes together. The new policy regression also rejects restoring runner-dependent artifact configuration to job scope. The real actionlint gate complements, rather than substitutes for, these repository-specific isolation and trigger checks.

This repair changes workflow configuration and regression coverage only; application, Contracts, migration and component source bytes are unchanged from `33b52f6`. The full application Python/Web/build suites are not rerun or relabelled as fresh evidence for this CI-only patch. No product browser or UI test is started. Docker's local Linux engine is absent, so no local Ubuntu container run is claimed. Actual hosted metadata/logs and the platform-independent expression/import regressions establish the causes; future Ubuntu runtime results remain separate.

Independent final source review found no actionable defect. It checked all context relocations, session propagation and cleanup, dependency/codegen ordering, PostgreSQL configuration, lint download/checksum/Bash invocation and the clean-startup regression. The Linux checksum was compared with the inspected upstream checksum list.

Final context check PASS; all **171 managed Markdown files** PASS with zero local path/case/anchor errors; artifact guard PASS for worktree, index and the comparison against `33b52f6`; whitespace check PASS. The documentation/provenance/startup command was reconfirmed after reporting changes: **13 PASS in 0.70 s**. The index remains empty and HEAD remains `33b52f6`. All 11 changed/untracked non-Markdown paths are limited to seven workflow files and four regression files; their sorted, compact, LF-normalized SHA256 manifest is `f3dd6e9dfe903d6fbd169495ee7ddee7ec33113ab81f02a39a5e6093e5bc5896`. No application source was changed.

The before/after physical inventory covered ignored runtime, old evidence, build/test caches, Web test-results/report directories and distribution output. It found **zero newly modified diagnostic files** in those locations. Historical capture count remains **1,858**. The root database retains SHA256 `b05c496047d82151fc00742f00c79aa0dbba5fbf217b4558fc9627229320ff47`; the 16,141-byte headless browser log retains `dca4a19e976c1baa6595c86f3f80f1fa558c7d7f6141bca5517404adb42eb152`, and the 294-byte full-Chrome log retains `4056baeaf4614720573f3e651c2f7b33a03544fea267b6ef51d79179b4c3cf2b`. The existing Web database and unrelated development server were not opened or altered by this task.

Fetched hosted logs, first failing regressions, actual lint errors and all reported passing local outputs were inspected before final reporting. All commands and child subprocesses have returned; no application/browser server was started by this repair. The shared allocator successfully removed only this task's marked external session, including raw diagnostics and the downloaded lint tool; its absence was verified. Historical reports, default databases, browser-cache logs, assets and compatibility baselines are preserved. No source was staged, committed or pushed.

Hosted runs listed above retain their original failures. A new hosted result requires the user to commit and push the repaired files; local verification must not be described as a green hosted run.
