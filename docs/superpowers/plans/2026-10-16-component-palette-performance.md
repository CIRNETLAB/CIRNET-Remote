# Component palette search and thumbnail performance

**Goal:** Improve scoped component search and remove eager thumbnail work from palette opening and typing without altering graph, placement or model factories.

**Design:** One catalog search index snapshots normalized metadata at module initialization; group indices reuse those records and only query normalization runs during typing. Palette cards use prepared metadata and lightweight placeholders. A shared visibility observer per scrolling palette controls cancellable leases on the single thumbnail cache; one prioritized capture runs per scheduled task. Component Info retains eager, high-priority property previews.

**Constraints:** No dependency, contract, backend, graph, simulation or model-factory changes. Logic remains 40 catalog parts and Arithmetic retains its existing two abstractions. Search results update without a debounce.

## Work and verification

- [x] Read search/catalog/ribbon/thumbnail factories and tests; measure the exact Git baseline.
- [x] Add and verify failing search tests, then implement the normalized shared index, ranking, code variants and constrained functional typos.
- [x] Add and verify failing scheduler/cache tests, then implement priority, yielding, cancellation, LRU reuse, lifecycle and stable failure fallback.
- [x] Add and verify failing visibility/UI tests, then integrate shared palette observation, lazy thumbnails and prepared rendering metadata.
- [x] Verify fast typing, scope, keyboard/focus/clear/Escape, drag/drop, placement invariance, scrolling, stale completion and eager property previews.
- [x] Benchmark search separately from thumbnail scheduling/model work on the current 40 items and expanded synthetic data; report actual measurement boundaries.
- [x] Review changes and run `cd apps/web && npm ci && npm test && npm run build`; record results and provide a concise commit message for the user.

## Measurement limits

The browser tool previously denied localhost access. Do not bypass that restriction with a different browser surface, CDP, Playwright or another indirect mechanism. Headless injected-renderer measurements must be labeled as CPU model/scheduler work rather than real GPU capture latency.
