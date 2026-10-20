# WC20 pending observation regression evidence

Date: 2026-10-20, Asia/Saigon. Scope: F11 / AC20-21 and AC20-22 in the
current dirty integration worktree. This record does not establish full release
or hardware availability.

Source base: `a09d53d6ef45b3731a91833d38d5588e7172bd86`, with unstaged
integration changes. Host: Windows, Node 24.20.0 / npm 12.2.0. The scoped
commands do not replace release verification on the repository-pinned Node 22.

After adding the bounded ledger with unit coverage, the first controller
integration run reported **12 PASS, 3 FAIL**: lifecycle reload did not restore
unknown observation, storage failure still allowed untracked dispatch, and
generator reload did not restore an unknown key. These establish the controller
gaps separately from the absence of a storage file.

`node scripts/test.mjs pending-observations.test.ts experiment-lifecycle-core.test.ts instrument-commands.test.ts remote-lifecycle.test.ts instrument-control-scope.test.ts contact-momentary-history.test.ts document-persistence.test.ts project-save-controller.test.ts document-revisions.test.ts`
then passed **86 tests, 0 failures** using the official isolated profile-prepared
test runner. This includes the document regressions and the operation ledger
quota/expiry, principal privacy, pre-dispatch storage, temporary NOT_FOUND,
read-only reload, no replay, no restored control, explicit Stop under storage
failure, late logout ACK fence, multiple generator keys and local forgetting.
Four older Create-success fixtures in `remote-lifecycle.test.ts` were corrected
to the declared HTTP 201 status after runtime status validation was enabled;
production validation was retained.

`npx vue-tsc --noEmit -p tsconfig.tests.json` and
`npx tsc --noEmit -p tsconfig.e2e.json` also passed (exit 0).

An actual HTTP/native browser regression was added to `lab-workflows.spec.ts`:
commit Create through the real backend, hold its response, reload with its key
already persisted, query the real operation record, verify zero Run replay and
then explicitly Stop. Its execution is **NOT_RUN in this scoped record** and
belongs to the integration browser gate. No raw diagnostics, credentials,
screenshots or reports were written inside the repository.

Integration review on pinned Node **22.18.0** reproduced a separate cross-tab
read/modify/write race: the controlled transaction regression failed with two
reads before lock acquisition (expected zero). Browser storage now holds an
origin-wide exclusive Web Lock throughout every mutation and controllers await
durable identities before Create/Run/Apply. Cancellation after a queued write is
fenced; unsupported Web Locks reject new intent explicitly while authenticated
Stop remains available. The subsequent six-suite scoped run passed **43 tests,
0 failures**, including queued cross-tab writes, terminal non-resurrection,
adapter lock ownership, asynchronous tracking failure, awaited Create/Apply and
cancellation. The explicit awaited-Run case and two-tab native Web Locks scenario
were then added; their final outcomes are recorded by the release integration
report. Earlier Node24 scoped runs above remain historical evidence.

Two subsequent safety regressions also failed before correction: a held lock
prevented explicit Stop dispatch (zero requests rather than one), and Run could
resume after a failed or lost Stop while waiting for its identity transaction
(one Run rather than zero). Stop tracking now uses immediate `ifAvailable` lock
acquisition for begin and acknowledgement cleanup, and new Create/Run intent
rechecks cancellation and `stopRequested` after its commit. Never-dispatched
identities are removed through best-effort immediate local cleanup. The latest
six-suite run on Node 22.18.0 passes **46 tests, 0 failures**; E2E TypeScript
checking also passes. An independent controlled-port probe confirms Run remains
zero and Stop remains one after the held Run transaction is released. Full
integration and native two-tab results belong to the
[release closure](2026-10-20-web-contracts-closure.md).
