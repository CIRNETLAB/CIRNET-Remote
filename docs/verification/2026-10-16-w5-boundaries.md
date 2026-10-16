# W5 — document and presentation boundaries

Status: PASS. W5 was verified and reviewed before W6 started.

The pure editor document/history and graph commands operate on the existing caller-owned document state. They do not own a second mutable graph or copy it back into Pinia. Store actions remain the compatibility facade for the existing components and gestures. Snapshot history retains its combined 50-entry/20,000,000-byte budget and one immediate Undo/Redo exception. Document identity, content revisions, execution requests and measured presentation remain separate.

The browser adapter observes actual per-draft content changes, including legacy direct mutations. Normal commands batch those invalidations. Revision-based getters avoid serializing the graph on each render; history, import/export, remote I/O and explicit reconciliation still take immutable snapshots. The revision-aware ProjectSaveController port avoids hot-path graph fingerprints while generic ports retain their defensive compatibility check.

Experiment and instrument stores use per-instance ports joined by an explicit application controller. They no longer import each other or find peer stores during actions. The application lifetime binds and disposes adapters; stale adapter disposal cannot detach a replacement. Capture loading retains its cancellation/generation ownership. Runtime instrument capability and server authority checks remain intact.

Scene picking and pointer gesture ownership are extracted behind the existing interfaces. The main workspace retains procedural models, render-on-demand, current visuals and the same canvas. A shared bounded asset provider serves the two existing GLB preview pages, which are included in the production multipage build. Manifest SHA-256 revisions, bounded fetch/decode, deduplicated loads, independently owned clones, cancellation, release, late-result disposal and procedural fallback are tested. This resource cache does not replace PackageThumbnails. The delivered GLBs predate the current workspace coating rules, so replacing live procedural models automatically would change visuals; the actual preview path exercises imported assets safely.

`npm run check:boundaries` / `make web-boundaries` uses the TypeScript AST and transitive import graph, including SFC scripts, re-exports and type-only references. It rejects framework/renderer/transport dependencies in pure core, transport/store dependencies and direct network globals in renderer code, private hardware/RPC clients in browser sources, unresolved source imports, runtime store cycles and unauditable dynamic imports. Synthetic negative cases verify the gate itself. TypeScript lexical binding permits local document values without confusing them with DOM globals. Ordinary build/type checks remain separate requirements.

## Verification

- Full `npm test`, including test TypeScript checks: 836 PASS / 0 FAIL, 58.136 s.
- Application TypeScript checks and production multipage build: PASS, 272 modules, 9.33 s. Main entry JS 3,340.78 kB / gzip 413.01 kB plus shared/preview chunks; this is not a claim about total transferred size.
- Full real Chromium suite: 9 PASS / 0 FAIL, 43.3 s, clean harness exit 0. Actual GLB previews/fallback, auth, projects, rich graph persistence, new-PID API restart, two-tab CAS, IndexedDB and principal isolation all pass.
- Python frontend smoke guards: 23 PASS, 7.64 s. The old single-fetch text guard now names the API client and the separate bounded asset adapter; AST negative cases replace the stronger transitive boundary proof.
- AST gate: 13 negative/positive fixtures PASS; current 167-module source graph PASS.
- Store/application port focused suite: 43 PASS.
- Initial asset/picking/gesture + existing interaction/scene focused suite: 108 PASS.
- Real GLB browser previews and explicit failed-load fallback: 3 PASS; actual API/SQLite/Hardware Service harness, clean teardown.
- Independent document/core review: no remaining Important findings; 33 focused tests PASS.
- Independent review reproduced failed-load reference/listener budget leaks, inconsistent cache byte bounds and uncancelled unsuccessful HTTP response streams. Each has a RED→GREEN regression. Late parse results dispose GPU/image resources and cannot attach after release.
- Full-suite verification first found four render/state regressions: separately bundled store modules registered duplicate observers. A nonenumerable per-store symbol anchors the detached observer lifecycle across module copies; no mutable graph or transport singleton was added. Registration itself does not change content revision. All four failures are green in the final full suite; two-Pinia isolation, direct mutation, shared aliases, stale identities, saved draft selection and adapter replacement are covered.
- Context / whitespace checks: PASS. Existing Vite large-chunk advisory remains visible.

Git metadata remains read-only; the W5 checkpoint was attempted after these gates and cannot create index.lock. No W5 commit is claimed. No reset, push, merge or deployment has been performed.
