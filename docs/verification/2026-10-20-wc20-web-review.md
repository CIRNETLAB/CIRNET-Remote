# WC20 Web integration review and production bootstrap

Date: 2026-10-20, Asia/Saigon; runtime samples completed 13:31 UTC.
Current source is base `a09d53d6ef45b3731a91833d38d5588e7172bd86` plus
unstaged WC20 integration changes. No staging, commit or push was performed.
This report covers the Web integration review of F06/F07/F08/F12 and the final
F11 storage-lock safety regressions. Native editor acceptance and full release
dispositions remain in the [release closure](2026-10-20-web-contracts-closure.md).

## Reviewed corrections

- Prepared core API operations preserve their existing immediate dispatch path;
  an already available validator does not introduce an unconditional preload
  await. Missing profiles still load explicitly and validation remains required.
- Cold local workflows have the generated configuration, station and pre-run
  DTO validators they need. Component and Label property modules consume the
  generated structural core entry. A regression builds the actual production
  main import graph with Vite and rejects eager complete registries, including
  indirect property-module imports. A separately bundled cold child process
  validates configuration, pre-run construction and assignment reference graphs
  without the unit runner's full-profile preparation; invented contract names
  still reject with `UNKNOWN_CONTRACT`.
- Runtime operation validation accepts equivalent quoted JSON charset and
  binary version media parameters while retaining exact documented status,
  media and body validation. Ordinary success/error fixtures now use their
  declared HTTP 201 and required ErrorEnvelope request identity. Malformed-body
  negative tests were retained.
- Pure application/domain external imports use a narrow `lossless-json`
  allowance; an unlisted I/O dependency such as `cross-fetch` is rejected.
  The architecture gate still examines all application controllers and imports.
- The unit workflow bootstrap applies to the actual product and fails closed if
  its preparation helper is missing. Generic isolated runner fixtures without
  product Contracts retain their original batching behavior. Both Python runner
  regressions pass; product validation is not bypassed to satisfy the harness.
- Every browser pending-observation mutation holds the shared origin Web Lock
  before reading storage. Create/Run/Apply wait for committed identities.
  Explicit Stop uses immediate try-acquire tracking for begin and cleanup.
  Cancellation and Stop intent are rechecked after queued identity writes;
  superseded Create/Run cannot dispatch when the lock is later released.
  Unsupported/contested tracking is explicit, with no unlocked fallback.

The cross-tab pre-lock-read regression, held-lock Stop regression and queued-Run
after failed/lost Stop regression all failed before correction. The final six
focused suites pass **46 tests**, and an independent controlled-port probe keeps
Run at zero and Stop at one before and after releasing the queued Run identity.
See [pending observations](2026-10-20-wc20-pending-observations.md) for scope.

## Final Web gates

Project tools use pinned Node **22.18.0** on Windows; npm is 12.2.0.

| Command in `apps/web` | Observed result |
| --- | --- |
| `npm test` | **1,429 PASS, 0 FAIL, 0 SKIP**, 164.362 s test runtime; all 174 entries compiled and executed in one complete run, exit 0. |
| `npm run check:boundaries` | **PASS**, 245 source modules. |
| `npm run build -- --manifest` | **PASS**, Vue typecheck and Vite production build; Vite 21.43 s, exit 0. |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.e2e.json` | **PASS**, after the held-input/lock native driver updates, exit 0. |

After the external browser-runtime isolation helper and four harness regressions
were added, the complete confirmation on the final 113-file source identity
passed **1,433 tests, 0 failures, 0 skips**, 166.436 s. The AST gate again passed
245 modules, production build/typecheck passed (Vite 23.05 s), and the E2E
TypeScript check passed. Application and Contracts bytes are unchanged from
the production measurements below. The complete copied-runtime native gate
and final artifact cleanup are recorded in the
[release closure](2026-10-20-web-contracts-closure.md).

The subsequent Windows executable-path preflight adds a fifth harness
regression. The final complete confirmation is **1,434 PASS, 0 FAIL, 0 SKIP**,
223.584 s, on the 113-file source identity `9311e131…` recorded in the closure.
AST again passes 245 modules; build/typecheck passes (Vite 1 min 32 s while
smoke/unit work shared the host). Application chunk names/hashes and sizes
remain unchanged; these build durations are gate observations, not isolated
performance measurements.

`git diff --check` passes and the staged diff is empty. These checks do not
replace the native browser execution recorded in the release closure.

An earlier complete Web run had 1,428 PASS and one fixture failure: the
AssignmentWindow test still dispatched `change` after the native title fix
correctly changed the component to `input`. The fixture dispatch was updated;
all title/body/reference assertions remain. Its focused four tests passed before
the fresh complete 1,429-test run above. Older interrupted runs were stopped
before source changes or shared compilation-cache rebuilding and are not counted
as release passes. Vite's warning about chunks over 500 kB is retained.

## Production comparison method

The original dirty-worktree byte observation, **6,507,633 raw / 792,607 gzip**,
remains historical; its built assets were not retained and it has no measured
latency. For a reproducible real browser comparison, clean commit `a09d53` was
extracted with `git archive` into an allocator-owned external directory. The
existing dependencies were consumed through a junction, with no install or
generation into baseline source. `vite build --manifest --configLoader runner`
used the unchanged archived production config and passed in 25.87 s. No fake Git
directory, allocator exception or modified baseline was used. This reconstructed
baseline is explicitly distinct from the original dirty-worktree observation.

Both actual production distributions were served on separate loopback origins
with identical precompressed gzip and `Cache-Control: no-store`. One real current
FastAPI process served both through transparent HTTP proxies, with
`allow_guest=false`, external SQLite/capture defaults set before application
imports, and explicit trusted static origins. Six fresh Chromium contexts used
cache disabled and blocked service workers, three per version, in alternating
before/after order. Every context remained signed out (`principal=null`) and
performed only a real GET session bootstrap; no station request, mutation,
command replay or page error was observed.

Browser: **Chromium 156.0.8078.4**, Playwright 1.64.1, 1440 × 1000, DPR 1.
The actual canvas reported WebGL 2.0 and
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
The probe supplied `--log-file` with an allocator-owned external path before
launch. Raw CDP traces, observation JSON, explicitly captured API output/data and
the screenshot were written to their allocated external paths. Subsequent
Windows headless GPU probes proved that child diagnostics can ignore both
`--log-file` and `CHROME_LOG_FILE` and still write beside the executable. The
flag therefore does not establish from-start containment of every browser log.
This report does not attribute any executable-adjacent source log append to the
six production contexts without corresponding timestamp evidence. The
[release closure](2026-10-20-web-contracts-closure.md) records the known incidents,
inventory and attribution limits. Subsequent browser verification must use the
exact full runtime copied into an allocator-owned external directory so adjacent
GPU diagnostics remain external too; see the
[corrected containment policy](../VERIFICATION.md#browser-executable-and-log-containment).
The recorded measurements and explicit artifact inspection are unchanged.

The final current screenshot was actually inspected:
the signed-out Ribbon, empty 3D workspace/grid and navigation controls rendered
without an error overlay. This boot screenshot is not a component-model or
physical-device acceptance result.

## Observed production results

Values are medians of three fresh contexts unless stated otherwise.

| Quantity | Reconstructed `a09d53` | Current integration |
| --- | ---: | ---: |
| Eager JS raw bytes, production manifest | 6,445,369 | 2,898,491 |
| Eager JS gzip body bytes | 790,380 | 566,912 |
| Browser-loaded JS decoded body bytes | 6,445,369 | 2,898,491 |
| Browser CDP JS wire bytes, including HTTP overhead | 790,870 | 567,402 |
| Browser CDP total wire bytes | 846,644 | 623,181 |
| DOMContentLoaded (ms) | 574.400 | 475.500 |
| CDP ScriptDuration at DOMContentLoaded (ms) | 407.548 | 306.483 |
| CDP ScriptDuration at settled sample (ms) | 446.793 | 337.379 |
| Observed signed-out canvas-ready sample (ms) | 2,257.800 | 1,957.700 |
| CDP JSHeapUsedSize at settled sample (bytes) | 10,156,152 | 9,839,104 |
| Trace `V8.ParseProgram` event durations (ms) | 90.724 | 61.430 |
| Trace `v8.parseOnBackground` event durations (ms) | 113.926 | 96.167 |
| Trace `V8.CompileCode` event durations (ms) | 109.248 | 100.385 |

The current browser loaded only `main-DXXRrIHg.js` and the unchanged shared
`OscilloscopeModel-DT_CKm2u.js`; none of the three complete lazy validator chunks
was requested during trivial boot/auth. Its decoded transfer exactly matches the
manifest eager graph. The baseline main was `main-o84L99ui.js`.

ScriptDuration is execution time, not an isolated parse estimate. Named V8 trace
durations are separate observations; nested events and background threads overlap
and the rows must not be summed into elapsed parsing or bootstrap time.
`V8.CompileScript` and other detailed events are retained externally by name;
the tiny wrapper/probe compilation events do not describe full module parsing.
Canvas readiness was sampled after session verification, visible canvas,
500 ms network-idle settling and two animation frames, including probe overhead.
JS heap was sampled without forced garbage collection; GPU/native memory and
whole-process RSS are outside this metric. Heap changed only modestly.

These are short measurements on one Windows development host with concurrent
release workload, with only three samples per version and tracing overhead. The
comparison includes all integrated changes relative to clean base source; it is
not an isolated causal estimate for a single patch, a soak, or a Mini PC target
capacity claim. The first baseline settled ScriptDuration was an outlier
(1,062.536 ms); the complete observations were retained and medians were not
replaced with selected favorable samples. Historical byte observations are not
used as freshly measured latency.
