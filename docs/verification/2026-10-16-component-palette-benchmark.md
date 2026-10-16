# Component palette benchmark — 2026-10-16

Baseline: `40a4cad80be76a5b08943fab51ee2218cb7d7012`. Runtime: v24.20.0, Windows_NT 10.0.26300 x64, 12th Gen Intel(R) Core(TM) i5-12500H.

Reproduce from the repository root with `node apps/web/scripts/benchmark-component-palette.mjs`. The command rewrites the accompanying JSON and this report. No new dependency is required. Historical search/cache source is loaded with `git show` through esbuild; both versions use the same current catalog, Three.js, and ComponentModel dependencies.

This saved report reused unchanged historical search timings from `docs/verification/2026-10-16-component-palette-benchmark-baseline.json`, captured at 2026-10-16T01:40:14.449Z, and freshly measured the final indexed search and all thumbnail phases. Baseline/current search timings therefore come from separate processes on the same CPU/OS/Node runtime. Ref, source hashes, queries, warmups, sample count and shared dependency hashes are validated before reuse. Reproduce this exact mode by adding `--reuse-baseline-search docs/verification/2026-10-16-component-palette-benchmark-baseline.json`; omit the flag to rerun both search implementations in one process.

Search uses 3 full-query warmup passes and 30 measured batches per fixture, with 16 fixed queries rotated in order. Each batch runs every query once. Nearest-rank p50/p95/max are wall-clock milliseconds from performance.now(); there are no timing assertions. Synthetic entries repeat the real Logic parts, preserving real part lookups while adding unique name and description suffixes. Index construction is measured separately; steady query timings reuse a constructed index.

| Items | Old batch p50 / p95 / max (ms) | Indexed batch p50 / p95 / max (ms) | Index build p50 / p95 (ms) | Median batch speedup |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 2.4485 / 2.9218 / 3.0941 | 0.2175 / 0.4279 / 0.5521 | 1.0928 / 1.948 | 11.257471× |
| 4000 | 960.042 / 1107.9029 / 1225.8555 | 11.2448 / 18.5337 / 18.8281 | 122.8997 / 419.2955 | 85.37653× |
| 10000 | 2172.9689 / 2450.3802 / 2483.0126 | 45.761 / 57.4169 / 68.3764 | 986.3153 / 1098.4974 | 47.485171× |

Individual-query timings pool 480 invocations across the fixed query set:

| Items | Old query p50 / p95 / max (ms) | Indexed query p50 / p95 / max (ms) |
| ---: | ---: | ---: |
| 40 | 0.1501 / 0.2679 / 0.5404 | 0.0123 / 0.0394 / 0.3916 |
| 4000 | 62.1828 / 87.1233 / 127.339 | 0.6096 / 1.9214 / 3.4765 |
| 10000 | 143.1377 / 181.3139 / 312.585 | 2.4526 / 6.9553 / 10.241 |

The JSON includes per-query latency/match counts and membership/order comparisons. Added metadata and ranking intentionally change some results; these comparisons are observations, not assertions of identical behavior.

Thumbnail fixtures use all 40 real Logic types. A controlled compact viewport requests 10 visible + 5 preload = 15 models. A desktop-sized controlled viewport requests 20 visible + 5 preload = 25 models. The preload margin is 72px. These are explicit viewport-specific demand fixtures, not measured physical browser layouts. Each row has 3 warmups and 8 cold cache runs. The current cache uses its default scheduler under Node (timer fallback) and idleDelayMs:0 so its renderer is cleaned up before the run ends. The baseline microtask/timer scheduling is unmodified.

The opening comparison uses baseline eager demand for all 40 cards and current visibility-scoped demand for each viewport. Additional baseline scoped and current eager rows are controls that isolate demand count from queue scheduling.

| Cache / demand | Models per open | First capture boundary p50 / p95 (ms) | All ready p50 / p95 (ms) | Cached revisit p50 (ms) |
| --- | ---: | ---: | ---: | ---: |
| baseline, eager all cards | 40 | 10.2573 / 18.6037 | 671.8842 / 752.3311 | 0.4338 |
| baseline, compact viewport | 15 | 10.429 / 22.9238 | 233.5709 / 323.4807 | 0.1972 |
| baseline, desktop-sized viewport | 25 | 10.8384 / 15.495 | 415.5102 / 529.174 | 0.2152 |
| current, eager all cards | 40 | 14.1899 / 21.1456 | 716.2351 / 762.3452 | 0.4774 |
| current, compact viewport | 15 | 17.1748 / 32.5852 | 265.799 / 285.1647 | 0.273 |
| current, desktop-sized viewport | 25 | 17.6727 / 29.6021 | 410.6321 / 479.1279 | 0.2574 |

The injected renderer receives real production models, runs the production camera-fitting function, and observes their actual disposal. It returns a marker string. It does not create a WebGL context, render pixels, or encode PNG. “Renderer attempts” in the JSON count the injected factory boundary; they are not successful GPU contexts. No document/canvas is present, so browser 2D label/texture work is also absent. These are CPU/model/scheduling measurements, not real GPU capture latency.

Direct model construction p50/p95: 9.5854/16.2698 ms; camera framing: 0.097/0.2041 ms; disposal: 0.0575/0.16 ms. The JSON includes geometry/material/texture creation and disposal counts, cached revisits, cancellation before work, cancellation after the first capture, injected renderer failure/unavailability, and a short-close/reopen probe using default renderer retention.

Actual browser WebGL first-image latency, PNG encoding latency, screenshot quality, GPU memory, and successful physical GPU context counts were not measured. Browser localhost access was denied in this session; this harness does not bypass that denial. The controlled Vue/IntersectionObserver integration checks are separate evidence for how many of the 40 cards request models when the menu opens.

Machine and process load are uncontrolled. Short operations, timer granularity, JIT, garbage collection, and shared machine activity can vary these results. The benchmark is reproducible evidence from this environment, not a browser frame-time or cross-machine performance guarantee.
