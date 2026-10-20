# WC20 document persistence regressions

Date: 2026-10-20, Asia/Saigon. Scope: F09/F10 and AC20-17 through AC20-20.
Source base: `a09d53d6ef45b3731a91833d38d5588e7172bd86`, with current integration
changes unstaged. Host: Windows, Node 24.20.0 / npm 12.2.0. This scoped run does
not replace the release gate on repository-pinned Node 22.
This is scoped software evidence,
not a new full release or hardware result. No source assets or historical baselines
were changed for these fixes.

Baseline reproduction used `esbuild` on `contact-momentary-history.test.ts` and
`project-save-controller.test.ts`, then Node's test runner. Result: 24 PASS,
6 FAIL. Failures established that held input changed authored dirty state,
imported persistent `pressed=true` was cleared on release, A → B → A lost A's
binding, and inactive save ACK/conflict could not be associated with A.

After implementation, `npx vue-tsc --noEmit -p tsconfig.tests.json` passed.
The four focused suites (`contact-momentary-history`, `document-persistence`,
`project-save-controller`, `document-revisions`) were bundled with esbuild and
run using `node --test .test-build/<suite>.test.mjs`: **48 PASS, 0 FAIL**.
An additional explicit authored `pressed` edit during hold regression first
failed and then passed after authoring was made to supersede the captured input
scope. The latest official nine-suite combined run, including all document and
pending-observation suites, passed **86 tests, 0 failures**. Both
`npx vue-tsc --noEmit -p tsconfig.tests.json` and
`npx tsc --noEmit -p tsconfig.e2e.json` passed (exit 0).
The document persistence suite holds input across the ordinary 350 ms recovery
debounce, inspects repository data, exports, releases during a pending Save,
reloads owned recovery and checks the exact saved-document reference. Additional
coverage preserves imported persistent input, authored changes during hold,
clipboard duplication, live graph generations, Undo/Redo, inactive ACK/conflict,
per-draft recovery bindings, inactive deletion, principal fencing and binding quota.

An additional native-pointer browser scenario was added to
`labels-contact-interaction.spec.ts`: hold the rendered tactile actuator, read
its actual IndexedDB checkpoint, Save with Ctrl+S, Export by keyboard, release
and reload. Its execution and any visual inspection belong to the integration
browser gate; **NOT_RUN in this scoped record**. No screenshots or raw diagnostics
were created in the repository. Test compilation in `.test-build` is an allowed
compilation cache, not retained verification evidence.

Later pinned-toolchain integration uses Node **22.18.0**: the complete Web suite
passes **1,429 tests, 0 failures, 0 skips**, with production build/manifest,
AST boundaries and E2E TypeScript checks passing. See the
[Web integration review](2026-10-20-wc20-web-review.md) for those exact results.
The Node24 counts and scoped `NOT_RUN` statement above retain their original
meaning. Subsequent real-pointer executions, fresh IndexedDB checkpoint timing,
Save/Export/reload evidence and final native disposition are recorded in
[native browser verification](2026-10-20-wc20-browser.md) and the
[current release closure](2026-10-20-web-contracts-closure.md); this scoped report
does not substitute an earlier individual pass for the complete native gate.
