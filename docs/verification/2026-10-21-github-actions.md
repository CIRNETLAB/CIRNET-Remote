# Latest refactor Actions: portable runtime path fixtures

Status: FIXED_AND_LOCALLY_VERIFIED for the shared Frontend/Contracts unit failure; a new hosted result requires the user's commit/push. Recorded 2026-10-21, Asia/Saigon. Source and remote `refactor` revision inspected: `0951a216edc143255ee4185d98c73ae7b0147e1d`. Initial worktree and index were clean. The user requested investigation and repair of the latest failed Actions. The earlier exclusion of product UI verification remains in effect; no browser is launched by this task. No staging, commit, push or workflow rerun is performed.

## Actual hosted results

The Actions API, per-job steps and decoded logs were inspected for this exact commit. The prior workflow-context and documentation import fixes are now confirmed on hosted runners. The current two failed workflows share the same single failed unit test.

| Workflow | Actual hosted result | Evidence |
| --- | --- | --- |
| Frontend | FAIL: 1,433 tests passed, one failed; typecheck/generation/AST checks passed | [Run 39504706053](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39504706053) |
| Contracts | FAIL in Web conformance: 1,433 tests passed, one failed; canonical Python and installed-package jobs passed | [Run 39504706123](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39504706123) |
| Documentation Context | PASS, including real actionlint, imports, artifact checks and cleanup | [Run 39504706159](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39504706159) |
| Backend | PASS | [Run 39504706110](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39504706110) |
| Hardware Service | PASS | [Run 39504706121](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39504706121) |
| Integration | PASS for both repository contracts and actual PostgreSQL migrations/races | [Run 39504706101](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39504706101) |
| Real browser release gate | CANCELLED during E2E; its production build/typecheck had passed. The log also contains a 90-second screenshot timeout in `contacts-wires-gallery.spec.ts` before cancellation | [Run 39504706060](https://github.com/net-Circuit-Remote/net-Circuit-Remote/actions/runs/39504706060) |

The browser cancellation and screenshot timeout are retained as separate incomplete UI evidence. This repair does not disable that gate, change its assertions/deadlines or claim its full PASS. No new Simulator run was triggered at this commit; its earlier run is not relabelled as fresh evidence.

## Root cause and failing reproduction

Both failing jobs identify `apps/web/tests/e2e-browser-runtime.test.ts`: the Windows overlong-path test fails at its own fixture assertion `join(tooLong, 'browser-1', 'browser.exe').length > 259`. The original fixture appended a fixed 140 characters to an allocator-derived directory. Windows development paths were long enough to make the assertion true; the shorter Linux runner temporary path was not. Execution failed before calling `copyBrowserRuntime`, so changing the production path limit would not repair the fixture.

The exact failure was reproduced before changing source using the real shared allocator under a shorter external Temp parent and Node **22.23.3**, matching the hosted major/minor release: **4 PASS, 1 FAIL, 0 SKIP**, 4.067 s. The assertion and error match the hosted logs. Synthetic resource copying and actual directory-junction dereferencing passed in the same run; no Chromium process was needed.

The official Windows Node executable was downloaded into the owned external session. Its SHA256 `9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e` matches the publisher's version-specific `SHASUMS256.txt`. The first sandbox download failed at DNS; the required escalated retry succeeded without changing tool versions or application networking.

## Minimal repair and verification

The test now computes its padding from the complete executable path under the actual allocator root. It creates exactly **259** and **260** UTF-16-character paths, including every directory and separator. The 259-character case verifies that the real copy succeeds and preserves executable bytes. The 260-character case verifies rejection before any runtime is published, retaining the existing shorter-parent diagnostic and empty-destination assertion. Production `copyBrowserRuntime`, the 259-character limit, allocator checks and E2E scenarios are unchanged.

The repaired focused suite under the short external parent passes **6 tests, 0 FAIL, 0 SKIP**, 5.887 s, including the actual junction case. Test TypeScript checking passes. The complete `npm test` invocation on the normal longer external parent passes **1,435 tests, 0 FAIL, 0 SKIP**, 201.258 s of test runtime, using Node 22.23.3. This includes both new exact boundary cases on the normal parent as well as all existing tests; it is not a stitched subset of passing cases. Vue test typechecking in that command also passes. AST boundary verification passes for **245 source modules**.

The required documentation/provenance/startup suite passes **13 tests** in 1.42 s. The allocator/artifact-guard self-tests pass **5 tests, 0 SKIP**, 6.827 s, with owned external temporary paths and the Windows permissions needed for actual junction/Git fixtures. Context checking, all **172 managed Markdown files** (zero local link/case/anchor errors), artifact guard against `0951a21` for worktree/index/committed diff and `git diff --check` pass.

Only `apps/web/tests/e2e-browser-runtime.test.ts` changes outside Markdown. Manual diff review confirms no change to application source, production runtime-copy logic, workflow commands, fixtures/baselines or launch limits. Production build/typechecking at the starting commit has actual hosted PASS evidence in the browser job; it is not relabelled as a new local build. No browser, screenshots or visual E2E scenario is run locally for this repair.

No local Ubuntu runtime is claimed: Docker's Linux engine is not running, and the optional WSL inventory was denied. The short-parent reproduction establishes the same assertion failure, while both exact boundary cases exercise the existing Windows-platform preflight through its explicit platform option. Raw fetched logs and diagnostics are external from creation. Historical outputs and compatibility baselines remain untouched.

## Final source and output inventory

HEAD remains `0951a216edc143255ee4185d98c73ae7b0147e1d`; the index is empty. The only changed non-Markdown path is the runtime-copy test. Its LF-normalized SHA256 is `2c6f919f051d2ffc7502513f7b54f0dca6ee919aa6e28e1f7db533234ef2adf7`, covering the same source used by the full passing Web invocation. The remaining changes are canonical documentation and this evidence. A final Actions API read still reports the same seven runs for `0951a21`; local verification is not presented as a new hosted result.

The physical inventory checked ignored runtime, historical evidence, build/test caches, Web report/test-results and distribution locations. It found no newly modified diagnostic files there. Compiled test bundles are permitted compilation cache; no screenshot, video, trace or raw report was created in source. The 1,858 historical captures remain. The root database and both source browser logs retain their before-run sizes and hashes: database `b05c496047d82151fc00742f00c79aa0dbba5fbf217b4558fc9627229320ff47`, 16,141-byte headless log `dca4a19e976c1baa6595c86f3f80f1fa558c7d7f6141bca5517404adb42eb152`, 294-byte full-Chrome log `4056baeaf4614720573f3e651c2f7b33a03544fea267b6ef51d79179b4c3cf2b`. Existing databases, source assets, baselines and the unrelated development server were not changed.

All verification commands and awaited child processes returned before cleanup. Hosted logs, the initial failing reproduction and all reported local results were inspected. The shared allocator successfully removed the owned external evidence session and short-parent fixture session, and their absence was checked. The initially allocated unused sandbox Temp session was already absent when guarded cleanup was attempted (`ENOENT`); a separate host-side check confirmed its absence. No substitute path was deleted and no claim is made about which process removed that unused session. Historical outputs and neighboring files were preserved. No Git publication or visual verification was performed.
