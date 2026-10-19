# Source algorithms and stability audit — 2026-10-10

> Historical source snapshot — 2026-10-19 audit: implementation and results below belong to the dated change, including statements labelled “current” or “latest”. Current boundaries are maintained in [ARCHITECTURE.md](ARCHITECTURE.md); use [VERIFICATION.md](VERIFICATION.md) for new checks and external artifact output. This audit does not rerun or re-certify historical results.

The audit addresses the user's request to inspect the entire project for correctness, crashes, unreleased memory, avoidable algorithm costs and poor Pan/Rotate/Zoom behavior. It preserves the approved architecture, Circuit Graph contracts, instrument chassis pitch and control pivots. Findings below describe inspected implementations, rather than assuming planned systems already exist.

## Source inventory and execution flow

The current production tree contains 63 TypeScript/Vue source files and 24 API/hardware/simulator Python files. The review covered those application subtrees, stylesheet/canvas sizing, catalogs and contracts, exporter recipes, four repository helper scripts, deployment templates and the sole RTL scaffold. Tests and the approved context/design documents were supporting evidence. Third-party dependencies were inspected where their actual behavior mattered, especially Three's OrbitControls, TextureLoader and buffer disposal.

| Area | Actual algorithm and ownership |
| --- | --- |
| Entry point/router | Vue installs Pinia and the compatibility router. App renders one SingleWorkspaceShell; legacy/unknown URLs normalize to the workspace. |
| Circuit store/file boundaries | Parsed JSON is validated before import. Commands copy the graph and record a session snapshot before mutation. Undo/Redo restore snapshots; validation is tied to a graph snapshot and request version. Memory images use their own bounded byte contract. |
| Workspace/UI stores | One tool, selection, pending port, snap and zoom state. Shared window state owns ordering, focus and bounded placement; component information follows selection. Instrument/experiment windows remain shells where execution contracts are absent. |
| SceneManager | Disposable projection of graph module IDs and named logical ports. Owns scene, camera, models, grid, gizmo, outlines, picking and on-demand RAF. ResizeObserver/context/visibility are bridged by CircuitWorkspace3D. |
| ComponentModel/factories | Procedural housing/control geometry, authored CanvasTexture/SVG recipes, logical port anchors and local root poses. Breadboard openings and instanced cavities share socket coordinates. Instrument visual chassis pitch is separate from the root's move/yaw transform. |
| Editor gestures | Capture one pointer; preview only the visual pose/control values; commit one graph/history command on release. Cancellation restores the graph projection. Empty surface grabs pan camera and target on XZ. Knobs preserve local pivots, detents and Shift precision. |
| Gizmo/selection | Project housing bounds and candidate positions; avoid selected/neighbouring models and UI obstacles. Gizmo scales uniformly to CSS-pixel size. Selection uses the actual nested mesh transforms and camera-dependent silhouettes/creases, with a 2 CSS px stroke. |
| Technical grid | Derivative-filtered world XZ lattice, minor/major spacing, projected-pixel minor suppression and distance/focus fade. Updates only in the coalesced render callback. |
| API/WebSocket clients | Centralized fetch/structured errors/timeouts/cancellation. WebSocket connection identity guards late callbacks; capped exponential backoff, reset after open and explicit disconnect cleanup. Station discovery reconciles descriptors with newer per-station events. |
| FastAPI | Structural Circuit Graph validation, simulation/hardware descriptors, health and sequential per-connection text WebSocket echo. No graph evaluator, experiment scheduler, storage lifecycle or acquisition engine is implemented. |
| Hardware service | Virtual/physical station protocol implementations. Physical unavailable paths stay unavailable. gRPC is a handler-free server scaffold awaiting generated bindings; station operations are separately testable. |
| Simulator | Strict logic levels, constant-time AND primitive, starter 74HC08 gate metadata and ordered O(n) waveform construction. A complete circuit/timing/event evaluator is not present. |
| FPGA/deployment/helpers | RTL only assigns reset/clock to status_led. Nginx proxies REST/WebSocket and serves the SPA; systemd templates start the services. Helpers synchronize catalogs, check context and derive icon assets. No synthesis or deployment was performed. |

## Navigation and uniform scale

No navigation path scales model roots. Regression tests retain every root scale at `[1,1,1]`, preserve complete model world matrices and serialized graph poses, and confirm uniform gizmo scale. A camera-facing square has equal horizontal/vertical CSS-pixel dimensions across portrait/wide viewports, Pan, Orbit and Zoom. Label Sprites deliberately have rectangular geometry/scale; this is independent of navigation.

Previously, toolbar zoom changed `PerspectiveCamera.zoom` while wheel input dollied camera distance through OrbitControls. Their magnification and limits diverged, and wheel changes were invisible to the toolbar. Both now use target-relative dolly with fixed FOV and camera.zoom=1:

```text
zoomPercent = referenceDistance / camera-to-target distance × 100
camera-to-target distance = referenceDistance × 100 / requestedPercent
```

Wheel and toolbar share the existing 50–200% UI range. This also replaces the previous independent wheel distance limits of 3–45 units with limits relative to the current reference. Fit calculates model/wire bounds, preserves heading, resets the reference to its fitted distance and reports 100%; Reset restores the original reference and far plane. Pan moves camera and target together. Zoom does not modify graph/model transforms, textures or pivots. Ordinary perspective foreshortening and depth-dependent size remain intentional.

Other verified camera defects:

- NaN/Infinity in zoom/resize/move/pointer inputs could poison camera or model matrices. Relevant public paths now reject them.
- Almost-horizontal plane rays intersected arbitrarily far away, producing huge grab-pan jumps. Plane interaction now rejects intersections outside the camera's clipping range.
- A captured native orbit continued when the canvas height became zero, dividing movement by zero. A shared controls-availability rule includes viewport visibility, suspension, pointer lock and disposal. Unlock/resume cannot reactivate a zero-size viewport; positive resize restores navigation.
- Finite imported rotations such as Number.MAX_VALUE overflowed during degree-to-radian conversion. Pose, preview, orbit, docking footprint and gesture initialization normalize yaw before conversion/addition. The graph's original imported value remains available to Undo.
- A partially initialized workspace could retain a scene if synchronization threw after renderer creation. Its failure path now disposes the manager and clears the reference.

## Reconciliation and CPU costs

Old wire refresh disposed and rebuilt every tube, pick line and material for every model preview, even for unrelated connections. Endpoint resolution also repeatedly scanned graph.modules. `WireLayer` now keys records by endpoint pair, indexes incident connections, retains materials/selected-wire colors and only replaces geometry when endpoint positions change. Module lookup is a Map built during graph sync.

Full connection reconciliation is O(E), excluding constant catalog/port lookup and curve sampling. A move/rotation preview processes the selected module's incident degree rather than all E wires, and no unchanged wire buffers are allocated. Geometry replaced by an endpoint change is disposed immediately; removed wires and scene teardown release their records and indexes.

Supply property commits previously rebuilt the entire case, textures, outline and controls even though the existing applyPose/applyPowerSupplyControls path already updates every setting-dependent visual. Same-type supply commits now retain their assembly and update the controls/display in place; type changes and other factory signatures retain the existing rebuild behavior. Undo updates the same supply correctly. Tests assert zero enclosure disposal during settings commits.

Breadboard docking previously checked collisions for all four sites of every board before rejecting sites too far from the pointer, and repeatedly recomputed footprints/catalog lookups. Footprints are cached per operation and distance rejection happens before collision checks. Conservative actual-yaw AABB docking and the existing three-pass overlap relaxation are preserved.

A local micro-benchmark of ten snapPosition calls with 400 distant boards measured approximately **105.5 ms before / 8.6 ms after**. This is one controlled workload on this machine, not a browser FPS guarantee. Near many eligible overlapping sites, collision checking can still be quadratic; overlap relaxation remains a heuristic rather than a global packing solver.

Placement ID allocation previously repeatedly scanned the graph for each occupied suffix: 81,800 existing-ID visits for 400 modules. A Set now gives O(M) construction plus suffix lookup while preserving lowest-gap reuse.

## Resource lifetime and retained memory

Three concrete ownership defects were reproduced and fixed:

1. Shared within-model geometries/materials/textures were disposed repeatedly, and only `.map` was released. disposeObject now collects unique resources and releases all direct Texture material slots, including PBR maps and InstancedMesh-owned buffers.
2. Deleting one Sprite label disposed Three's globally shared Sprite geometry. Each factory label now owns its small cloned geometry; removing a label leaves surviving labels intact.
3. Pending TextureLoader callbacks retained removed instrument roots and their scene callback. A shared logo loader releases its nullable owner on texture disposal, clears decoded image data and suppresses late visual callbacks. disposeObject also removes onVisualChange references.

Scene teardown clears model/module indexes, wire records, ghost and obstacle references; disposed methods cannot recreate ghosts/outlines/handles. Existing factory temporary merge geometry is already disposed correctly. Supply canvas display updates reuse their texture. Generator/scope chassis geometry and export assets did not change in this audit; existing factory/GLB/glTF/grounding/pivot tests remain passing.

History previously retained up to 50 full-session JSON strings without a byte limit, duplicating every inactive draft. A 0.9 MB imported graph followed by 30 renames retained 54,014,388 estimated UTF-16 bytes. Combined Undo/Redo string storage now has a named **20,000,000-byte** budget and at most 50 entries. One immediate oversized snapshot is retained when it alone exceeds the budget. Small projects still retain 50 steps. Saved fingerprints are pruned only when unreachable from live drafts and both retained history directions.

The history budget estimates string storage, not total JS/GPU heap; live drafts and saved fingerprints are separate. Commands still serialize the session, so very large collections of drafts remain a cost. A replaced memory-module revision conservatively invalidates a pending file load, including immutable Move/Rotate replacements; a new Load targets the current revision.

## Asynchronous correctness

| Reproduced failure | Corrected behavior |
| --- | --- |
| Older REST discovery overwrites a newer station fault/busy event | Reconcile per-station event revisions after discovery starts; preserve event-only stations and still accept unrelated descriptors. |
| Cancellation during/after JSON body completion still updates state | Recheck the combined abort signal after body parsing; aborted discovery applies nothing. |
| Changed graph leaves obsolete validation transport active | A controller outside serializable state is aborted when validation is cleared; snapshot/version checks remain. |
| Older circuit/memory file wins after a newer selection | Request versions reject obsolete results. |
| Unmounted toolbar/closed editor applies pending file | Lifecycle invalidation rejects completion. |
| Pending memory file overwrites Apply/Initialize, replacement, in-place edits, deletion/recreation or Undo | Capture selected module/image identity and bounded byte contents; explicit Apply invalidates the read even when bytes are unchanged. |
| Canceled New/Apply retains file input, preventing same-file reselection | Clear the input synchronously when superseding a read; guarded completion cannot clear a newer choice. |

Native File.text() cannot be canceled; stale reads finish but their results are discarded. WebSocket reconnect/lifecycle tests remained passing. No new execution or hardware capability was introduced.

## Backend correctness

- Pydantic validation previously ignored canonical position/rotation/properties types and accepted explicitly null metadata. It now validates optional-field structure strictly, rejects explicit null, preserves allowed extensible module fields and JSON integers, and matches the canonical schema in the exercised parity cases.
- Non-object/missing graph bodies now produce the documented structured validation response. FastAPI's syntax/content-type parsing remains its own boundary.
- Binary WebSocket frames previously raised KeyError('text'); they now close with code 1003.
- Unsupported hardware_mode configuration is rejected at startup, avoiding contradictory health/station descriptors.
- Physical safe_state preserves a driver's explicit hardware_applied=False result.
- gRPC serve stops and waits for termination in finally after interruption/failure.
- Float logic levels such as 1.0 previously passed membership checks and crashed bitwise AND. Simulator, station input and waveform boundaries now require integer logic levels, retaining prior boolean compatibility.
- Windows context-integrity tests now read project documentation explicitly as UTF-8 instead of relying on cp1252.

## Verification and limits

| Check | Final observed result |
| --- | --- |
| Frontend complete suite, including real compiled Vue setup/lifecycle regressions | **153/153 PASS**, TypeScript test configuration included. |
| Production build | **PASS**, 133 modules; existing advisory for the approximately 872 kB Three.js/application chunk. |
| Whole Python suite | **96 PASS / 1 FAIL**, three dependency deprecation warnings. Sole failure is concurrent icon provenance, described below. |
| Backend/hardware/simulator scoped suite | **53/53 PASS**. |
| API canonical schema parity experiment | 26 valid/invalid cases agreed with Draft202012Validator. |
| Native gRPC shutdown experiment | 20 ephemeral servers terminated after simulated interruption. |
| Three actual buffer-management paths with controlled GPU boundary | 21 model create/dispose cycles, including instance matrices/colors, returned buffer/geometry counts to zero. |
| Pending-image forced-GC experiment | All three disposed instrument roots collected while fake image requests remained pending; late completions were safe. |
| Browser | Actual breadboard, generator and scope placement; toolbar/wheel zoom synchronization, Fit, Orbit, grab Pan, portrait/landscape viewport changes; collected warning/error logs empty. |
| Independent review | Rotation overflow, stale memory completion, canceled file input and zero-height orbit reproduced, fixed and independently rechecked. No outstanding material code finding in the reviewed audit diff. |

The user explicitly stated they are editing icons and requested keeping the icon files unchanged. The manifest currently has 22 supplied-artwork entries while the original directory has 19 files; `test_supplied_icons_have_small_committed_derivatives_with_verified_provenance` fails. No artwork was restored, regenerated or rewritten by this audit, and the failing check was not disabled or weakened. This prevents claiming that the whole Python suite passes.

Python verification uses a workspace-local ignored `.audit-runtime` dependency target, without modifying system Python. Browser verification uses the local Vite server; API discovery was not running in that browser session, so its reconnecting state is expected. API/WebSocket integration was separately exercised by Python/frontend tests. Windows sandbox restrictions required approved outside-sandbox test/build execution.

These checks do not establish absence of every crash or leak. Long-duration real browser GPU heap profiling, constrained Raspberry Pi performance, physical drivers/hardware and FPGA synthesis/timing were not tested. The supply still has a comparatively high mesh/buffer count (677 attribute/index buffers in the controlled resource experiment); settings commits now reuse it, but broad factory batching was not introduced. Picking and large-session serialization remain potential future profiling targets. Missing simulator/event/capture/RPC features remain Phase 3+ work.

Browser details and screenshot: `verification/2026-10-10-stability-audit-browser.md`. No commit, push or deployment was performed.
