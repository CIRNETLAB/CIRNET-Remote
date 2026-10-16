# Component palette refactor — 2026-10-16

## Architecture and changed files

- `apps/web/src/data/componentSearch.ts`: one shared normalized catalog index, prepared scoped indices, compact vocabulary postings, numeric multi-token AND/rank combination, stable ties, exact gate words, IC separator/alias support and bounded functional typo correction. Query execution never re-reads or normalizes candidate metadata. Logic remains 40 items; Arithmetic remains its two existing abstractions.
- `apps/web/src/data/paletteCatalog.ts`: prepare card, icon, support and placement metadata once, using the same indexed catalog records.
- `apps/web/src/components/workbench/ComponentRibbon.vue`: immediate scoped filtering and result counts, lightweight cards, palette-root lazy thumbnails and post-filter visibility refresh. Existing keyboard, focus, drag/drop, Place and Wire paths are retained.
- `apps/web/src/composables/thumbnailVisibility.ts`: one shared IntersectionObserver per `.palette-items`, 72px preload margin, visible/preload priorities, scroll/resize updates, geometry fallback and full unsubscribe cleanup. Separate IO candidacy and measured demand preserve images after fast out-and-back scrolling.
- `apps/web/src/components/workbench/ComponentThumbnail.vue`: cancellable visibility leases, generation guards against stale completions and stable icon placeholders. The default remains eager.
- `apps/web/src/components/windows/ComponentInfoWindow.vue`: explicitly eager, high-priority thumbnails retain live effective-property previews.
- `apps/web/src/three/PackageThumbnails.ts`: one shared renderer and LRU image cache; revision/effective visual-property keys; one deferred capture per idle/frame task; priority promotion, pending cancellation, transient resource disposal, 30-second renderer retention and terminal WebGL failure fallback. Warm images remain usable after a later context failure.

No dependency, model factory, catalog definition, CircuitGraph, Contract, Backend or simulation changes were required. No virtualization was added for 40 cards. Search and visibility state do not create graph/history commands.

## Regression coverage

New tests:

- `apps/web/tests/component-search-index.test.ts`: exact/alias/prefix/partial ranking, stable order, Unicode/diacritics, package/IC separators, multi-keyword AND, functional typos, no numeric-code fuzzy matching, distinct AND/NAND/OR/NOR/XOR/XNOR, scope and index snapshots/postings.
- `apps/web/tests/package-thumbnail-queue.test.ts`: idle/frame deferral, one capture per task, live priorities, cancellation, renderer reuse, LRU, effective visual keys/revisions, terminal failures, cached images after failure and asynchronous resource ownership/disposal.
- `apps/web/tests/thumbnail-visibility.test.ts`: shared observers, scrolling, fast re-entry, stale callbacks, no-IO fallback, result reflow and root resizing.
- `apps/web/tests/palette-thumbnails.test.ts`: real compiled Vue components, immediate typing/counts, Clear/Escape/Enter/grid keyboard focus, placement/history invariance, lazy demand, cancellation and actual production-model capture/cache reuse through an injected renderer.

Existing `apps/web/tests/package-thumbnails.test.ts` was updated for deferred scheduling and explicit disposal. Existing search, drag/drop, Component Info, lead/property preview and editor regression tests remain part of the full suite.

## Performance evidence

See [reproducible benchmark and measurement boundaries](2026-10-16-component-palette-benchmark.md), its accompanying JSON, and `apps/web/scripts/benchmark-component-palette.mjs`. The exact historical search/cache sources are loaded from Git baseline `40a4cad80be76a5b08943fab51ee2218cb7d7012`; no rewritten baseline formula is used.

Desktop: Windows 10.0.26300 x64, Intel i5-12500H, Node 24.20.0. Each fixture uses 3 warmup passes and 30 measured batches of 16 fixed queries; p95 below pools 480 individual query calls. Index construction is excluded from steady query timings and measured separately. Historical search samples were reused from the validated baseline run on the same machine/runtime; final search and all thumbnail phases were freshly measured.

| Items | Previous search p95 | Indexed search p95 |
| ---: | ---: | ---: |
| 40 actual Logic ICs | 0.2679 ms | 0.0394 ms |
| 4,000 synthetic entries | 87.1233 ms | 1.9214 ms |
| 10,000 synthetic entries | 181.3139 ms | 6.9553 ms |

All three search fixtures meet the 16ms p95 goal in this environment. There are no timing assertions in unit tests. A separate 669-query differential check confirmed the optimized postings implementation preserves the previous indexed scanner's membership and order.

The controlled compiled-Vue desktop fixture uses five columns, a 420px viewport and 120px rows. Opening the 40-item menu creates zero models before visibility demand; then it actually captures **25 distinct production models**: 20 visible and 5 in the preload row, using one injected renderer factory. Reopening creates **zero additional models/renderers**. A compact 240px fixture requests 15 models. Counts vary with the actual viewport/card geometry; these are explicit test fixtures, not a physical-browser observation.

CPU model/framing/scheduling benchmark, 8 cold runs after 3 warmups:

| Opening demand | Models | All-ready p50 | All-ready p95 |
| --- | ---: | ---: | ---: |
| Previous eager menu | 40 | 671.8842 ms | 752.3311 ms |
| Current controlled desktop | 25 | 410.6321 ms | 479.1279 ms |
| Current controlled compact | 15 | 265.7990 ms | 285.1647 ms |

The improvement comes from fewer requested captures and keeping work outside the input/Vue microtask turn. It does not make model factories faster. Deferral increases first-capture-boundary p50 from 10.2573ms to 17.6727ms in the desktop CPU fixture. At equal eager demand, the current 40-capture p50 is 716.2351ms. Cached revisits build no models; cancel-before-work builds none; injected renderer failure is attempted once and then remains in fallback.

## Limits

- Browser localhost access was denied earlier in the session. No alternate browser/CDP/Playwright path was used. Browser WebGL pixels, PNG encoding, physical GPU context counts/memory and screenshot quality remain unmeasured. The injected benchmark uses real model construction, camera fitting and disposal, but returns a marker string; browser 2D texture/label work is absent.
- Each individual model build/capture is synchronous once started and cannot be interrupted. The queue yields between captures and cancels unstarted work; this is not a guarantee that every capture fits a 16ms browser frame.
- Cold synthetic 10,000-item index construction has p50 986.3153ms, versus 1.0928ms for the actual 40-item menu. The index is constructed once; further growth would merit worker-based construction or a more compact index after profiling.
- The production bundle still exceeds Vite's 500kB chunk warning threshold: 1,455.86kB minified / 383.26kB gzip. Bundle splitting was outside this palette refactor.

## Final verification

Executed in `apps/web`, in order:

1. `npm ci`: **PASS**, 69 packages installed, zero reported vulnerabilities.
2. `npm test`: **PASS**, including test-project TypeScript validation; **659 passed, 0 failed, 0 cancelled, 0 skipped**. Node test duration: 76,300.2558ms.
3. `npm run build`: **PASS**, including application TypeScript validation and Vite production build; 220 modules transformed, Vite build 15.38s. Only the large-chunk warning above remains.

Independent final code review found no blocking issues. Benchmark assertions, source-hash checks and `git diff --check` passed. No commit was created.

The initial locked `node_modules` directory was moved into ignored `.test-build/npm-ci-locked-20261016` before a clean install; no running process was terminated. npm's configured allowScripts policy blocked esbuild/vue-demi postinstall scripts; the installed platform binary worked through the successful test/build commands. No package manifest or lockfile changes were needed.

Suggested commit:

```text
perf(web): index component search and lazy-load palette thumbnails

- Add scoped ranked search with IC aliases and bounded typo correction
- Queue visible thumbnails through a shared cancellable LRU cache
- Preserve palette controls and add regressions and benchmarks
```
