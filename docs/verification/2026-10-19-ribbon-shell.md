# File / Component / Run Ribbon verification

Date: 2026-10-19. Branch: `refactor`. Base: `71433e2`.

Specification: `Prompt_Codex_Ribbon_File_Component_Run.md`, supplied by the user. Implementation stays in the current worktree; no dependency, lockfile, Contracts, backend, FPGA, camera engine or model geometry changes.

## Implementation and command mapping

Header order is Logo → Undo → Redo → File → Component → Run → circuit/save state → Account → Inspector. File is a teleported menu; Component/Run are manual-activation tabs. Arrow keys move tab focus; Enter/Space selects. File opening preserves tab/collapse state and transfers focus to opened tool windows.

| Previous command | New location | Preserved operation |
|---|---|---|
| New | File → New | Existing draft creation and pending-import invalidation |
| Projects | File → Open Project | Project Manager |
| Save | File → Save | Bound server save, or Project Manager when unbound |
| Save As | File → Save As | Existing Project Manager Save As flow |
| Import JSON | File → Import | Existing JSON picker, size/schema validation and latest-read guards |
| Export JSON | File → Export | Current graph, Blob/download and URL cleanup |
| History | File → History | Existing History & Queue |
| Assignments | File → Assignment | Existing assignments window |
| Footer execution | Run tab | Run → Cancel during preflight → Stop after Create/while owned execution exists |
| Footer diagnostics | Inspector / History | Existing target, connection, verification, inventory and lifecycle details |

`AppTitleBar.vue` retains the file input, read generation, principal invalidation and shortcuts after File closes. Menu and shortcuts share command guards. Export success cannot clear an unrelated failed Import.

`SingleWorkspaceShell.vue` creates one `useExecutionCommands` owner, one message bridge and the existing connections. `RunRibbonPanel.vue` only consumes commands. Tab/collapse changes never reset the preparation latch. Immutable graph/configuration/saved-reference snapshots, auth/epoch/request/draft/revision/configuration/target/assignment guards and post-Create acknowledgement/reconciliation remain covered. Signal Monitor's old misleading Run/Pause label now accurately displays Run/Stop.

Pause and Step are **unsupported by the current API**. Both remain disabled; a focusable description exposes the reason. Neither issues a pretend request or reuses Stop as Pause.

`WorkbenchRibbon.vue` owns the single 96 CSS px overlay and collapse transition. Existing `.component-panel`, `.component-drawer`, occupied-state and UI insets remain shared by both panels. Hidden Component content suspends its listeners/palette work. The canvas, renderer and connection owners remain mounted.

## Message policy

`workspaceMessages.ts` separates timestamped events from current context hints. Errors outrank warnings and information; newest ID breaks equal-severity ties. Active duplicates retain identity; event history is bounded to 60. Hints resolve with their actual source. Dismiss changes presentation only and cannot change safety/admission state. Session messages survive draft changes; draft messages retire with their draft; principal/epoch changes remove private messages. Local scene graphics/tool state refreshes in a replacement presentation scope without replaying old events.

The bridge reads real editor/project/recovery/experiment/connection/console sources in one direction. Scene messages cover graphics failure/recovery, placement, zoom area, marquee, selection previews and wire hints. Retired remote polling cannot publish late errors. Global Header/canvas text overlays are removed; rectangles, ghosts, WireOptions, field validation and accessibility help remain.

Footer text is opaque white. Persistent polite/assertive live regions announce changes without moving focus. Long messages truncate in the row and are fully readable using the details button, keyboard focus and Escape. Related windows remain reachable. Header/footer stay single rows; viewport controls retain their real workspace commands/readback.

## Main files changed

Paths below are relative to `apps/web/src`:

| Responsibility | Files |
|---|---|
| Header/file lifecycle/menu | `components/workbench/{AppTitleBar.vue, FileMenu.vue, fileCommands.ts}` |
| Shared Ribbon/panels/icons | `components/workbench/{WorkbenchRibbon.vue, ComponentRibbon.vue, RunRibbonPanel.vue, WorkbenchIcon.vue}` |
| Stable workspace execution | `components/workbench/SingleWorkspaceShell.vue`, `composables/useExecutionCommands.ts` |
| Message state/presentation/bridges | `stores/workspaceMessages.ts`, `composables/{useWorkspaceMessages.ts, useWorkspaceSceneMessages.ts}`, `components/workbench/SystemMessage.vue` |
| Existing source adapters | `composables/useLabConnection.ts`, `stores/instrument.ts` |
| Scene/footer/layout integration | `components/workbench/{CircuitWorkspace3D.vue, SimulationStatusBar.vue}`, `stores/ui.ts`, `style.css` |
| Accurate monitor command label | `components/windows/SignalMonitorWindow.vue` |

Regression tests add message/store/bridge/scene/header/tab coverage, move existing Run tests to the actual command owner, retain file/configuration/stale-intent assertions and move diagnostics assertions to Inspector. E2E selectors use a shared real File/Run/Inspector helper; native scene observation remains passive and calls the real Three/WebGL methods.

## Verification record

Earlier RED observations: missing tabs in the native baseline; Ctrl+S bypassed a pending-save guard; misleading Signal Monitor Pause label. Independent review also identified Import error masking, graphics-scope loss and execution transition messaging, addressed with regressions. Final review found no remaining important issue.

| Command | Final result |
|---|---|
| `npm run check:boundaries` | PASS, 236 source modules, exit 0 |
| `npm test` (outside sandbox) | 1,384 passed, 0 failed/skipped; strict source/test TypeScript included; exit 0 |
| `npm run build` | Source TypeScript and Vite PASS, 354 modules, exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.e2e.json` | PASS after final listener observer/helper changes, exit 0 |
| `npm run test:e2e -- ribbon-shell.spec.ts` | **8/8 passed**, 4.7 minutes, exit 0; API cleanup exit 0 |
| Related workflow/browser campaign | 11 workflow cases passed; the single auth helper failure was corrected and its case passed in the combined campaign below |
| Combined auth/camera/depth command below | **15 passed, 1 existing optional baseline skipped**, exit 0; API cleanup exit 0 |
| `git diff --check` | PASS |

The build retains the existing large-chunk advisory; it is not a build error. No dependency or lockfile change was needed.

The initial full unit run reached 1,384 tests: 1,378 passed and 6 localhost/proxy tests failed with sandbox `connect EACCES 127.0.0.1`. The same 12 HTTP/proxy tests passed outside the sandbox without code changes. The complete outside-sandbox `npm test` then passed **1,384/1,384, zero skipped**, exit 0, including the strict test TypeScript check. Log: `apps/web/.test-build/ribbon-shell-unit-final.log`.

Native Ribbon checks have verified menu/focus, palette search/drag, graph/selection/undo/zoom preservation, one canvas/scene/camera/resource identity, no navigation execution POSTs or extra WebSockets, and live messages. Responsive checks cover 1440/1280/900/480 at DPR 1/2 with reduced motion. Header/footer remain 52/39 CSS px; at 480 px the white message has 116.44 px and viewport controls have 287 px with 318 px scrollable content, without document overflow. Held real preflight responses verify Cancel sends no Create/Run and release sends exactly one of each. Native renderer and backend responses remain real.

`npm run test:e2e -- projects.spec.ts auth.spec.ts auth-rotation.spec.ts lab-workflows.spec.ts graphics-recovery.spec.ts flexible-assignment.spec.ts` passed 11 cases and exposed one E2E helper issue: Account's modal correctly blocked an Inspector click while checking the connection. The helper now temporarily closes/restores Account through real UI actions. Its corrected auth-rotation case passed in the following combined native campaign. No business assertion was removed.

`npm run test:e2e -- auth-rotation.spec.ts unified-camera-framing.spec.ts workspace-depth-navigation.spec.ts depth-artifacts.spec.ts` completed **15 passed, 1 optional baseline capture skipped**, exit 0, with owned API shutdown exit 0 (15.9 minutes). All current-source cases ran, including separated-instrument Fit/Area/Home, off-center wheel/+/- anchoring, thin-wire framing/picking, Zoom/Orbit/Pan/Fit/ViewCube, drawing/bend editing and empty-workspace placement/history.

The final whole-eight Ribbon run includes repeatable document/window listener registration counts and both real held preflight outcomes. Across the final campaigns, **34 distinct browser cases passed**; the optional retained pre-fix source capture is the only skipped case. Interim selector/timing failures were resolved before the final Ribbon gate. No current-source failure remains.

Native rendering uses Chromium's ANGLE Vulkan SwiftShader backend with 24-bit depth, DPR 1/2. Results cover this tested backend and the documented scenarios; Pause/Step and the optional pre-fix capture remain the explicit capability/evidence limitations. A fingerprint of the verified sources is retained in [source hashes](ribbon-shell/source-hashes.json).

## Native browser images

These are unedited captures of the real workspace, inspected after generation. Models, Grid and editor helpers are rendered by the existing Three.js implementation.

| Capture | Artifact |
|---|---|
| Baseline | [Before](ribbon-shell/before.png) |
| Header and open File menu | [File](ribbon-shell/after-file.png) |
| Component panel | [Component](ribbon-shell/after-component.png) |
| Run panel and preserved selection | [Run](ribbon-shell/after-run.png) |
| Real failed Import | [Error](ribbon-shell/after-error-message.png) |
| Long file notification | [Long message](ribbon-shell/after-long-message.png) |
| Narrow 480 px workspace | [Narrow](ribbon-shell/after-480-dpr1.png) |

Measured browser rectangles, DPR/depth-buffer data and renderer memory: [layout evidence](ribbon-shell/layout-evidence.json).

The native navigation case also retained identical nonempty repeatable global listener maps (25 event keys / 31 registrations, including the test observer), with zero additional WebSockets or execution mutations: [navigation evidence](ribbon-shell/navigation-evidence.json). Scene/camera identity, pose, canvas rectangle and renderer memory remained equal. One-shot listeners are excluded from this explicit-registration counter because the browser removes them internally.

Native hidden-layer tests completed 60 model/Zoom/DPR samples at 50%/100%/1000%, DPR 1/2, with `changed = 0` in every tested region: [depth evidence](ribbon-shell/depth-evidence-summary.json). This covers current and supported historical display model revisions. The separate optional retained **pre-fix source** capture is skipped by the existing `NETCIRCUIT_DEPTH_BASELINE` guard because that variable is unset; the guard and current-source coverage were preserved.
