# CRUMB Wire Tool verification — 2026-10-14

Design and Native implementation plan were approved by the user. Changes remain in the `refactor` worktree; no merge/push or commit was performed because Git metadata is read-only in this sandbox.

## Automated evidence

- Frontend `npm.cmd test`: 309 passing tests after the final review fixes, zero failures. New cases cover exact instance lookup/raycast, three board variants, occlusion, intrinsic nets, port/contact wiring, multiple bends, FREE/ORTHOGONAL routes, color/mode, captured bend/segment edits, add/remove, cancellation/stale pointers, Move/Rotate, mixed/support board owners, Undo/Redo and Save/Open. The review regressions also cover oblique segment picking, world-owned bends outside a board and socket priority beside selected wires.
- Rendering/resource cases exercise 300 wire records, unchanged buffer reuse, color-only updates, deferred preview bursts and disposal. DOM/GPU boundaries are replaced in automated tests; scene geometry, raycasts, camera math, store commands and Vue event handlers are production implementations.
- Full Python suite: 367 passed, 1 skipped (Icarus/vvp unavailable), one pre-existing dependency deprecation warning. Includes simulator captures across strips/continuous rails, floating X/conflicting drivers, unchanged electrical plans after pose/visual changes, schema/API acceptance and physical route/RPC rejection of editor contacts.
- `sync_breadboard_topologies.py --check`, `sync_lab_contracts.py --check` and `check_context.py`: pass. Canonical catalog provenance tests pass. Contracts wheel contains the canonical JSON; its loader was tested in an isolated interpreter importing the wheel.
- Production Vite build passes through the standard config plus invocation-only `resolve.preserveSymlinks=true`. The existing large-chunk warning remains.

## Environment-specific verification

The direct `npm.cmd run build` reached Vue type-check successfully but Vite failed with EPERM from `fs.realpathSync.native` on readable source. ReadFile and ordinary realpath succeed. Vite API build uses preserveSymlinks only for this invocation; repository Vite config/dependencies were not changed to accommodate the sandbox.

The first unmodified full pytest invocation reported 365 pass/1 skip/1 PermissionError at the unchanged optional RTL compilation test: pyslang's native fromFile could not open the readable RTL. The final harness uses fromText with the exact source and original path only when fromFile raises PermissionError; the same RTL assertions run and pass. It supplies an isolated database/capture/temp directory, root/service PYTHONPATH and a __main__ guard for Windows spawn. An initial scratch harness lacked that guard/root path; it was corrected before the final 367/1 run. No FPGA source/tests or assertion was weakened.

Full logs and per-task RED/GREEN results remain under `.superpowers/sdd/2026-10-14-crumb-wire-tool/`; final frontend log: `review-green-frontend.log`; Python: `review-green-python.log`; build: `review-final-build.log`. The ledger records implementation rulings and review status.

## Browser limitation

Opening the local app at `http://127.0.0.1:5176/` was denied by the browser permission policy. No alternate browser, raw CDP, native-window workaround or fabricated screenshots were used. Browser visual smoke testing is unverified; automated tests are not presented as browser screenshots or proof of actual GPU appearance.

## Review status

One fresh whole-change reviewer inspected the modified and untracked source against the approved spec/plan, including normalization reversal, mixed anchor frames, stale captured edits, future metadata and small/occluded contact picking. Three Important findings were reproduced by failing tests and fixed in the single final fix pass:

1. Screen-to-world segment interpolation used the wrong depth weighting under perspective. The corrected point now projects back to the exact clicked CSS position.
2. Empty space outside the source board incorrectly inherited that board's local anchor and pitch. Actual surface support is now picked independently from the drawing plane; outside bends use world coordinates and the workspace grid, and remain fixed when the board moves/rotates.
3. A selected wire's edit margin intercepted holes in Wire mode. Exact socket/port hits now take priority for both hover and click; Select mode retains route editing.

Each regression passed individually after its fix; the final full frontend suite passed 309/309, Python passed 367 with the same single tool skip, and production build/provenance/context checks passed. No second review was dispatched. No Critical or deferred Minor findings were reported. The first RED run also had a transient unchanged generator UI text assertion; the isolated unchanged test and final full suite passed without changes to generator code/tests.

The reviewer declined to certify actual GPU appearance/depth/DPR readability, native pointer/touch/focus behavior, responsive/accessibility experience, OS file picker/download behavior, measured FPS/GPU memory, sandbox-blocked native build/parser paths or physical hardware behavior. Those remain unverified: production scene/controller/store tests substantiate the code contracts, and the 300-wire resource test substantiates caching/disposal, but they are not a browser/performance/hardware certification.
