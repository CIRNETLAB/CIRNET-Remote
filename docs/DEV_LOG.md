---
project: net-Circuit-Remote
current_phase: interactive-workspace-supply-generator-launchers
status: supply-generator-launchers-verified
last_updated: 2026-10-12
next_task: phase-3-simulator-event-clock-model-integration
blocking_issue: none
hardware_mode: simulation
fpga_development_started: false
---

# Development Log

## Current Goal

Phase 2 **Interactive Circuit Workspace** is implemented, preserving Phase 1 shell and transport boundaries. Next: Phase 3 simulator/event/clock/model adapters and real output/capture data.

## Supply and Generator launchers / GUI — 2026-10-12

Read requested rail/workspace/window/instrument/icon/model/artwork/GUI/CSS files and existing editor/property/history/interaction tests before changes. Removed only the Delete button from ToolRail. Delete/Backspace, gizmo/Component Info deletion and legacy delete logic remain. New Power Supply and Function Generator buttons have distinct compact icons and call only ui.openWindow; they do not change tool, selection, pending port, placement or area mode. Existing mounted overlay drawers and scrolling stay intact.

PowerSupplyWindow600×510 binds only the selected POWER_SUPPLY. Voltage/current knobs with native range/number controls and POWER switch update voltage_v/current_limit_a/power_on through CircuitStore validation/history; one change per completed slider drag, no shadow setpoint state. It follows selection/deletion/Undo/Redo. V/A show local settings only when powered on; W remains unknown; no selection is explicit and controls disabled. Supply colors are shared with the unchanged 3D model.

Generator760×530 uses two configuration panels, static schematic SVG previews, shared Artwork colors/labels/key/output metadata, function keypad, disabled encoder/soft keys/output/power and local CH1/CH2 focus selection. Existing flat generator fields remain CH1; nested channel2 contains independent local defaults. Phase stays unknown. No DDS/output API, additional canvas, acquisition/render loop, hardware contract or graph change is introduced. Removed obsolete Generator global CSS; Scope/Monitor source and window/viewport architecture remain intact.

Five feature regressions failed correctly before implementation; six new tests include actual compiled SFC events, state/selection/validation/history/no-telemetry/defaults/shared icons/disabled output plus Delete/Backspace. Final frontend191/191, Python97/97 and production build147 modules pass; existing bundle advisory and three Python deprecations remain. Browser verifies Move retained by launchers, canonical5 V/1.2 A and unknown W, native keyboard edits/Undo/Redo, deletion clearing binding, both complete default layouts, responsive320 px without horizontal overflow and unchanged Scope/Monitor. Narrow keypad label overflow was corrected to two columns; final buttons fit. Read-only review finds no critical/important issue; runtime warn/error logs empty. Evidence and exact file list: `verification/2026-10-12-supply-generator-launchers.md`. Phase3 integration remains next.

## Instrument GUI redesign — 2026-10-12

Read OscilloscopeWindow, SignalMonitorWindow, FloatingWindow/manager, window definitions, instrument/UI stores, scope model/artwork and CSS before editing. Scope now uses a large empty display and Horizontal/Trigger/Vertical faceplate with seven static disabled dials and the eight existing front-panel keys. Signal Monitor uses configured channel names, a division-based empty timeline, capture/trigger header, disabled controls and unknown measurements. Default sizes are760×530 and720×500, respectively; scoped container queries adapt within existing floating-window bounds/scrolling. No capture source, samples, graph ports or execution state are fabricated.

Shared presentation-only instrumentVisuals supplies unchanged scope colors/control labels to GUI and model/artwork. Acquisition and all six stores, FloatingWindow/manager, Circuit Graph and other window logic remain unchanged. No dependency, animation loop or additional canvas/WebGL is added. Removed only obsolete scope/monitor global selectors.

Four actual-SFC SSR regressions failed before implementation and pass after it; they cover controls, unavailable capture, escaped real channel labels, shared visual metadata, unchanged instrument/graph state and responsive window bounds/default restoration. Full frontend185/185, Python97/97 and production build142 modules pass. Native browser verifies both full default layouts, small-window wrapping/scrolling, eight configured channel rows matching36 px grid guides, and existing Function Generator, Inspector, Component Info and Hex Editor (including Apply). Runtime warning/error logs are empty; read-only review found no critical/important issue. Existing Vite bundle advisory and three Python deprecations remain. Details/file list/screenshots: `verification/2026-10-12-instrument-gui.md`. Phase3 capture/simulator integration remains next.

## Fixed drawer dimensions — 2026-10-11

Read the drawer components, motion/resize composables, UI store, shell/obstacles, CSS and related tests/docs before removing manual sizing. Components remains96 px; Tools66 px or54 px at workbench width560 px or less. Removed separators, pointer/keyboard sizing, helper and its five tests, dimension preferences/max getters/setters, resizing motion branch and CSS handles/is-resizing/always-on has-size. The family-button computed height remains auto; gizmo toggle clearance uses the fixed ribbon height. Existing overlay transform200 ms, palette/icons, inert/focus behavior, floating-window safe areas and actual viewport/Three.js resize pipeline remain intact.

Updated obsolete size tests; added responsive boundary/window safe-area and initial reduced-motion repeated-toggle coverage. The simplified motion API test first failed TypeScript because the old implementation required a resizing callback, then passed after removal. Final frontend181/181, production build135 modules and full Python97/97 pass; existing bundle advisory and three Python deprecations remain. Read-only independent review against262ba84 finds no actionable source/test issue.

Native browser probe with3 models/1 wire sampled80 frames during9 reversals: one1280×629 CSS size and1600×786 buffer, zero aspect mismatches/canvas RO/buffer allocations/viewport or editor-cancel calls, unchanged view/projection matrices and graph. Same-frame reversal settles hidden obstacles; reduced-motion has only endpoint transforms and retains the same canvas/camera/graph. Scope retains66/96 position when drawers close; responsive checks560/561/320 px produce54/66/54 px Tools,96 px Ribbon, bounded window headers and no horizontal overflow. Drawer separators are absent; runtime warn/error logs empty. Current analysis and changed-file/evidence record: `SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md`, `verification/2026-10-11-fixed-drawers.md`. Prior resize reports below are historical; Phase3 remains next.

## Smooth overlay drawers — 2026-10-11 (historical manual sizing)

Read the seven requested files, related shell/editor/windows/resize code and approved architecture/spec. Inspected the19.87-second supplied recording at two-second intervals; reproduced the remaining flex/CSS-buffer mismatch in a native-browser frame probe: closing Ribbon caused one canvas observer/cancel/viewport/buffer update and three mismatched-aspect frames. The prior optimization removed resize storms but still changed the canvas box before its buffer caught up.

The stage now fills one fixed workbench region behind absolute mounted drawer overlays. Drawer/toggle transforms animate200 ms with soft easing; widths/heights do not animate. Inner panels become inert/aria-hidden on close and visibility-hidden only after motion; buttons stay outside. `ui` derives default/responsive overlay sizes and safe insets, retaining preferences and avoiding viewport mutation. Window bounds change once when expansion/size makes it necessary; collapse retains positions. Component Info/inventory use safe-area CSS. Gizmo cache reserves swept panel/toggle regions, with one owned attribute observer for completed close. Existing frameTasks/SceneManager resize/draw architecture is unchanged.

Seven new tests cover safe-area/viewport identity, window position, motion retention/reversal, reduced motion, resize/disposal and same-frame/no-event settlement. Initial two store regressions failed before implementation. Independent review reproduced a phantom obstacle after same-frame reversal and stale moving-toggle rectangles; the async regression failed before correction. Post-commit getAnimations settlement and stable toggle corridors fixed both; re-review finds no further actionable issue. No per-frame product timer/listener/DOM measurement was added.

Final frontend185/185 and production build pass (136 modules, existing large-bundle advisory); full Python97/97 passes with three existing deprecations. Native UI checks cover all states, rapid reversals, real drags150/180 px, keyboard sizing,320×480/390×480/1920×1080 and preference restoration, Scope Escape focus with an inert opener, and clean Open/import. Clean console warnings/errors empty; screenshots show identical model/wire positions and size in expanded/collapsed views. Detailed frame metrics and changed-file list: `verification/2026-10-11-overlay-drawers.md`. Browser instrumentation remains in ignored test-build fixtures; no dependency/graph/schema/icon/simulation-control change or commit/push/deployment. After handoff docs, Python97/97 rerun, context-check and git diff --check pass. Viewport override reset, functional test tabs closed and this session's Vite server stopped.

## Panel resize performance — 2026-10-11 (historical)

Read the shell, ribbon, rail, workspace observer, UI store, SceneManager, editor cancellation/window lifecycle and CSS before editing. A temporary native-browser probe with44 components/20 wires and Scope reproduced11–15 canvas observer callbacks, buffer allocations, cancellations and viewport/window updates per toggle. Root cause:160 ms width/height transitions plus unconditional resize and per-render DOM scanning; obstacle updates after rendering could request another draw.

Panel geometry now commits once; only inner content opacity animates. Shared frameTasks consumes ResizeObserver contentRect, keeps the latest dimensions per RAF, deduplicates applied dimensions and releases queued frames on disconnect. Shell size and canvas size remain separate. Inactive palettes skip DOM reads; active palette anchoring coalesces and only changes styles when necessary. UI actions reject invalid/repeated dimensions before reactive writes/window clamping. SceneManager skips unchanged projections/buffers and allocates a changed drawing buffer immediately before its redraw in the same frame, avoiding an intermediate cleared frame. Zero/hidden/suspended scenes retain the last drawn buffer; resume draws the latest size.

Gizmo obstacles are measured only after layout/window/selected-component-type changes, before the existing render. Orientation axes skip unchanged reactive assignments. Review found Component Info can change height when selection changes without any window-state mutation; the single post-flush watcher now covers that content source as well. Native Clock→Breadboard selection confirms height311.4→346.6 px and one fresh obstacle scan/draw without a viewport allocation. Independent final review reports no remaining actionable finding.

Three new SceneManager tests, three frame-task/observer tests and one store test cover duplicate sizes, burst coalescing, zero/restore, disconnect, buffer/draw ordering, suspension, window identity and pre-render obstacle updates. Duplicate buffer/store tests and the cleared-frame ordering test were observed FAIL before their fixes. Final **frontend178/178 PASS**, including test/production TypeScript; **production build PASS**,135 modules. Full repository **Python97/97 PASS**, three existing deprecation warnings. Npm/Python use approved external execution because the Windows sandbox blocks runtime/loopback access; the sandbox Python launch was terminated after hanging on path resolution.

Final native-browser measurements: all four individual collapse/expand actions have **one** canvas observer callback, cancellation, viewport update, buffer allocation and draw. Twenty rapid toggles have20 actual viewport/buffer updates; pointer hover/leave causes5 additional legitimate draws, which reuse cached obstacles. Five orbit actions have5 draws and zero buffer/viewport/obstacle DOM work. Clean app UI Open loads the same44/20 fixture; 110% zoom, axes, graph counts, simulation/Undo-Redo status and Scope's local32/36 position stay unchanged through collapse/reopen. Canvas1214×533 becomes1280×629 and restores exactly. Native drag remembers180/150 px; responsive checks390×480,320×480 and1920×1080 have no document overflow and restore preferences.

No graph/contract/model/icon/simulation-control changes, dependency additions, commit/push/deployment or physical execution claims. Existing large-bundle advisory remains. Analysis and exact file list/evidence: `SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md`, `verification/2026-10-11-panel-resize-performance.md`. Phase3 remains the existing next task.

Final clean app QA also checks Scope keyboard movement and Escape focus return with hidden opener, Input palette anchoring and Clock placement/Escape cancellation. Runtime warning/error logs and graphics/editor/file notices empty. Browser tabs closed and viewport override reset. Full Python97/97 rerun after docs updates passes context integrity; `git diff --check` PASS.

## Fully collapsible and resizable panels — 2026-10-11

Inspected shell/flex constraints, toolbar DOM, state, canvas ResizeObserver, SceneManager resize and window focus before editing. Replaced the previous36 px ribbon strip/38 px rail with zero-height/zero-width wrappers and wholly hidden inner sections. Native buttons float at top/left workspace edges with exact Collapse/Expand Components/Tools labels. Icons, canvas, simulation controls, contracts and architecture stay intact.

Expanded dimensions initialize from the current rendered layout and remain in `ui`. A shell observer measures available workbench space separately from the canvas; responsive maxima reserve canvas space without overwriting saved preferences. Shared `usePanelResize` supplies local captured-pointer dragging, limits, final-release position, foreign-pointer guards, keyboard resizing and cancel rollback. Collapse/capture loss/disposal release gestures. Toggles cannot initiate resizing. No dependencies or global listeners added. Transitions honor reduced motion and disable while dragging.

Eight new regressions cover size memory/limits, real composable pointer/keyboard lifecycle and SceneManager camera/model/connection preservation. Missing sizing APIs initially failed; foreign-pointer cancellation also failed before its ownership guard. Final **frontend171/171 PASS**, including TypeScript checks. **Production build PASS**,134 modules; existing >500 kB advisory remains. Native drags reach min/max96–260 px /54–180 px, restore sizes through Enter/Space and measure exact zero collapsed height/width. At1280×720, saved180/150 expanded canvas1130×449 becomes1280×629 fully collapsed. Clock–LED stays2 components/1 wire/110% zoom. Responsive checks cover1280×720,1366×768,1920×1080,390×844,390×480 and320×480. Small-screen clamping restores180/150 when space returns; no horizontal document overflow. Scope Escape returns focus to Expand Tools with its opener hidden.

Independent review found equal stacking contexts let the180 px rail cover Structure's first item. Browser hit testing reproduced the blocked Breadboard click; lowering Tools below Components restored the actual click. No other material finding remains. An initial stale-store HMR error disappeared after reload; no new warnings/errors occurred during subsequent native checks. Source algorithms: `SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md`. Screenshots, exact file list and checks: `verification/2026-10-11-resizable-panels-browser.md`. The preceding partial-collapse entry below is historical.

Final frontend boundary/docs/context **17/17 PASS**; `scripts/check_context.py` and `git diff --check` PASS. Full backend/hardware suites were not rerun for this UI-only feature. Tests/build use approved external execution for existing sandbox runtime restrictions. No commit/push/deployment; Phase 3 remains the existing next task.

## Initial partial-collapse implementation — 2026-10-11 (superseded)

Added independent session-only UI flags and permanent native chevron buttons for the horizontal component ribbon and vertical tools rail. Both start expanded; Enter/Space, aria-expanded/controls and dynamic labels work. `v-show` retains toolbar DOM/scroll while removing hidden controls from layout/focus/accessibility. Ribbon collapse closes its palette and prevents hidden families opening one. Editing mode, selection, armed placement, graph, saved/history state and logical endpoints remain separate from layout.

Existing canvas ResizeObserver updates renderer/camera aspect and floating-window bounds; transient pointer previews/Zoom To Area cancel safely on resize without an edit command. Hidden instrument openers now return focus to the visible toolbar toggle. Browser found Probe overlapping the status bar at height560 after adding the fixed toggle; scoped list scrolling with min-height0/nonshrinking buttons corrected it. Toggle remains outside the scroller. Independent review found no outstanding material issue, including this fix.

Verification: two new real-store cases observed FAIL before implementation, then **frontend163/163 PASS** with production/test TypeScript checks. Final **production build PASS**, 133 modules; existing >500 kB bundle advisory. **Frontend boundary/docs/context17/17 PASS**. Browser tested four layout combinations at 1280×720, 1366×768, 1920×1080 and 390×844, plus the default compact viewport and height560. Both toggles remain in view, no horizontal document overflow; Enter/Space restore tool state, placement works while collapsed, instrument Escape returns focus correctly and resize cancels Area. Default canvas grows 632.4×442 → 660.4×511.4. Viewport overrides reset; screenshots saved. Initial stale Pinia hot reload caused one missing-action error; reload initialized new actions and no new warnings/errors appeared during subsequent verification.

Context/whitespace checks pass. npm tests/build use the previously approved external execution for sandbox realpath/loopback restrictions; no dependency changes. Backend/hardware full suites were not rerun for this UI-only task (the preceding Zoom task's97/97 result stays historical). No contract/artwork changes, commit/push/deployment.

Detailed ownership/algorithms: `SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS.md`. Evidence: `verification/2026-10-11-collapsible-toolbars-browser.md` and expanded/collapsed PNGs. Phase 3 remains the existing next task.

## Zoom To Area and concise zoom tooltips — 2026-10-11

Added the requested status-bar button immediately right of Zoom To View Entire Circuit. A temporary view mode retains the prior tool/selection, focuses the canvas and captures a rectangle before editing/picking actions. The overlay has no Three.js resources. Release frames the actual center surface, fits sampled boundary depths with retained heading/FOV/aspect, and rebases wheel/toolbar magnification to 100% like Fit. Whole-viewport selection preserves the existing pose. Graph, model root scale, endpoint identities and Undo/Redo remain untouched.

Escape/right-click/toggle, tool/placement/graph changes, viewport resize, hidden/context-lost scene and unexpected capture loss cancel. Right-button chords also cancel through contextmenu; normal capture release after a tiny drag allows retry. Tab remains available; release after invalid/zero viewport is guarded. Zoom In, Zoom Out and Zoom To View Entire Circuit titles now contain only their exact names.

Regression sequence: missing framing/state failed before implementation. Independent review reproduced a foreground center crossing the camera and right-button chord cancellation. Both were fixed; the follow-up near-horizontal edge-depth clipping was reproduced and fixed by sample-based perspective fitting. Camera tests cover default/low views, elevated models, horizon fallback, clamping/inactive/non-finite cases and wheel/toolbar reversibility. Editor tests cover priority over Move/Rotate/Delete/Wire, unchanged graph/history, reverse drag, foreign pointers, cancellation/retry and keyboard focus.

Final frontend **161/161 PASS**, production **build PASS** (133 modules; existing large-chunk advisory), whole Python repository **97/97 PASS** with three existing dependency deprecation warnings. The previously recorded artwork provenance failure no longer reproduces; this task did not edit or regenerate artwork. Sandbox loopback/realpath restrictions required approved external execution for full suites/build/server; no production dependency changes. Browser verifies final native reverse drag over Breadboard 630, retained component count, 100% reference, Escape, exact tooltips/order and layout at 1280×720, 1366×768, 1920×1080 plus the default compact viewport. Final warning/error logs are empty.

Detailed source/algorithms: `SOURCE_ANALYSIS_ZOOM_TO_AREA.md`. Evidence: `verification/2026-10-11-zoom-to-area-browser.md` and PNG. No commit/push/deployment; simulator/hardware contracts unchanged. The next Phase 3 work remains the existing event/clock/model integration.

## Whole-project stability audit — 2026-10-10

Reviewed 63 TypeScript/Vue production files, 24 API/hardware/simulator Python files, procedural factories/artwork/export contracts, stylesheet/canvas sizing, repository scripts, deployment templates and the explicit RTL scaffold. Navigation does not change model root scale or graph poses. Toolbar/wheel zoom now share target-relative dolly, the existing 50–200% UI range and reported magnification; Fit resets the reference while preserving heading. Non-finite inputs, near-horizon pan jumps, finite extreme rotation overflow and captured orbit during zero-height resize are guarded. Partial scene initialization cleans up its manager.

Added keyed WireLayer reconciliation and incident-edge preview updates; unrelated wire buffers/materials and selected-wire colors survive. Supply setting commits reuse its assembly/display/outline. Docking caches footprints and rejects distant sites before collision checks (one local 400-board/10-call probe: 105.5→8.6 ms). Placement IDs use linear Set lookup. Geometry/material/all direct texture slots dispose once per owned subtree; labels own Sprite geometry; pending logo loads release removed roots and suppress callbacks. Controlled Three buffer paths returned counts to zero across 21 model cycles, and disposed roots were collected while image requests remained pending.

Combined Undo/Redo string storage is bounded at 20 MB/50 entries, retaining one immediate oversized snapshot; unreachable saved fingerprints release. Newer station events survive older discovery; cancellation is rechecked after JSON; obsolete validation aborts. Circuit/memory file reads respect request/lifecycle/module/image revisions, so newer selections/Apply/Initialize/Undo cannot be overwritten; canceled pickers support same-file reselection. Backend now follows canonical optional-field types, handles binary WS frames cleanly, rejects unsupported modes, preserves explicit driver failure flags, closes gRPC on interruption and rejects float logic levels before bitwise operations. Windows documentation tests use explicit UTF-8.

Final frontend **153/153 PASS**, production **build PASS**, Python **96 PASS / 1 FAIL**. The sole failure is supplied-icon provenance: manifest22 versus source19 while the user edits artwork. The user explicitly asked to keep their icon files; no icon regeneration/restoration or test suppression occurred. Scoped backend/hardware/simulator **53/53 PASS**, schema parity26 cases, native gRPC termination20 servers. Browser verifies real models, toolbar/wheel zoom, Fit/Orbit/grab-Pan and portrait/landscape proportions; final warning/error logs empty. Independent reviewer reproduced and rechecked four findings, with no outstanding material code finding. Existing large-bundle/dependency deprecation advisories remain. Python dependencies reside only in ignored `.audit-runtime`; no system Python changes.

Generator/scope's shared -10° visual chassis, grounded supports, root Y-up/yaw and control pivots remain verified, including existing GLB/glTF round trips; visual exports were unchanged by this lifecycle audit. Real hardware, complete simulator execution, generated RPC handlers, FPGA synthesis and long-duration browser GPU heap measurements remain untested/unimplemented boundaries. No commit/push/deployment. Detailed algorithms/findings: `SOURCE_ANALYSIS_STABILITY_AUDIT.md`; browser evidence: `verification/2026-10-10-stability-audit-browser.md`.

## Ribbon, rotating grip and upright Power Supply — 2026-10-09

Removed the per-entry Info rows and entry-count jargon from ribbon menus. Palettes anchor under the triggering family, clamp within the ribbon and update on scroll/resize; keyboard focus and dismissal remain. Embedded/Controller uses intrinsic button width and stays on one line.

Gizmo has thicker coral X/blue Z arrows, an ivory framed free-move diamond and a gold arc/grip with dark backing. Its Y subgroup follows live model yaw and picking uses the real grip position; world X/Z constraints remain fixed. Unposed visual bounds prevent overly inflated projections after yaw; selected-model clearance and stronger viewport margins keep tall-model controls and small-canvas handles usable. Body drag remains Move-only, preview stays separate from graph and a gesture commits one Undo.

Replaced the squat four-knob/three-terminal supply with an upright metal case, portrait V/A/W unknown/OFF screen, two Voltage/Ampe knobs, two Vcc/Gnd binding posts, I/O switch, vents, screws and feet, without USB. Canonical/generated visual dimensions are now [2.4, 2.8, 3.2]; zero electrical ports remain. Added an original matching SVG preview and updated Component Info. Independent review found capped socket bores; a front-ray regression failed, then passed after replacing the closed base with an open cylinder/annular flange. Two user-added PNG references are untouched.

Final frontend tests **82/82 PASS**, UTF-8 frontend/docs/context **17/17 PASS**, context and diff whitespace PASS. Native browser verifies Y 0→120° with one Undo/Redo, X 0→1 with unchanged Y/Z, and free X/Z (0,0)→(0.5,0.5), all in Select via explicit handles. Five viewport measurements confirm anchored menus, single-line label and no page overflow; fresh warning/error logs are empty. Final production TypeScript PASS; Vite sandbox realpath EPERM prevents bundling and the prior elevation decline is respected. Full evidence: `verification/2026-10-09-ribbon-gizmo-supply-browser.md`; algorithms: `SOURCE_ANALYSIS_RIBBON_GIZMO_SUPPLY.md`. No commit/push/deployment or hosted CI run. Earlier sections below record previous refinements.

## Component Transform Gizmo and status view tools — 2026-10-09

Removed Perspective viewport box and generic Select/Wire/Move/Rotate title/hint. Defined Zoom In/Out, Zoom To View Entire Circuit and Workspace Object Snap at Status Bar right, with responsive wrapping. Fit uses full model/wire bounds, retains heading and resets magnification. Selected objects have adjacent X/Z/free movement and Y rotation handles, hover/active color, live pose/endpoints/wires, stable screen scale including active movement, neighboring-model/window avoidance and one Undo on release. Body dragging remains Move-only; capture/Escape/tool/selection/graph/context cancellation restores committed geometry.

Added original bench supply enclosure/front controls/vents/terminals/feet/screws, unknown/OFF readouts and concise introduction; zero-port visual-only contract retained. Updated breadboard snap to conservative actual-angle footprints. Fresh independent review exposed single-use neighbor iteration and missing active scale updates; both reproduced RED and fixed GREEN.

Final npm **79/79 PASS**, UTF-8 Python frontend/docs/context **17/17 PASS**, context check and diff whitespace PASS. Browser verified native supply X drag 6→8.5 with unchanged Y/Z and one Undo/Redo; Y arc 0→75° with Undo; breadboard diamond (0,0)→(2,1.5) with Undo; fit/zoom/orbit, real supply geometry and four responsive sizes. Fresh-load warning/error logs empty; earlier stale-store HMR errors are recorded in the report. Final build passes TypeScript but sandbox Vite realpath EPERM prevents bundling; prior elevation decline respected. No dependency/contract/hardware changes, commit/push/deployment or hosted CI run. See `SOURCE_ANALYSIS_COMPONENT_TRANSFORM_GIZMO.md` and `verification/2026-10-09-component-transform-gizmo-browser.md`.

## Technical grid, socket depth and 2px selection — 2026-10-09

Replaced native one-pixel contours with LineSegments2 screen strokes (2 CSS px, Medium Gold #d4af37) while retaining housing silhouettes and safe disposal. Replaced capped/painted socket squares with perforated deck/decal plus one instanced cavity geometry per 830/630/100 board: tapered entrance, walls and dark recessed floor. Shared contact coordinates keep openings aligned. Enlarged female-key clearances; an independent review found the remaining outward bevel overlap at straight docking edges, reproduced with a failing raycast and corrected with inward bevelOffset -0.008.

Component Info is selection-only, closes when selection disappears/placement starts/model is deleted, and contains artwork without CSS rotation. Ribbon Info respects selection. Removed WORKSPACE/project caption. TechnicalGrid replaces GridHelper with quiet minor lines, majors every five cells, projected-pixel detail suppression, distance/focus fade and light X/Z axes in the existing coalesced RAF.

Final npm **68/68 PASS** (six new RED-to-GREEN regressions); documentation/frontend/context checks **17/17 PASS**, context integrity and diff whitespace PASS. Browser verified real WebGL cavities/seams, 2px border, Add/selection clearing, artwork for all three boards, orbit/zoom and four desktop sizes; final warning/error logs empty. Production build passed TypeScript but Vite realpath is blocked by sandbox EPERM; previous build elevation decline is respected, so no final bundle claim. See `SOURCE_ANALYSIS_TECHNICAL_WORKBENCH.md` and `verification/2026-10-09-technical-workbench-browser.md`. The following sections record earlier implementations.

## Selection contours and Component Info — 2026-10-09

Latest request uses the last two reference images as design inspiration: subtle yellow contours around selected/moving models and an upper-right introduction/Add panel. Removed the twelve emissive box bars and body selection tint. `SelectionOutline` uses the actual breadboard profile; generic housing triangles are welded into adjacency edges and select camera silhouette/visible creases. One LineSegments object follows each selected model; updates run in the existing coalesced render callback. Outline resources are detached/disposed before rebuilding a model. `BreadboardHousing` now extrudes integrated joints and actual recessed channels with matched surface UVs; original dimensions and 830/630/100 contact instances remain. Scene lighting is reduced for readable cavities and edges.

Removed the old selection action card. `ComponentInfoWindow` is one anchored panel shared by scene selection and ribbon preview, with original supplied artwork, name, introduction and Add +. Selection opens without incrementing activation, preserving canvas focus and Move capture. Add arms the same known type without committing history until surface click; unknown/future entries remain disabled. Close returns canvas focus. Inspector and the tools retain editing capabilities; direct dragging still requires Move.

Regression tests reproduced the mesh cage, missing recessed geometry, reuse of disposed outlines, passive Info absence, static curved contours and occluded resistor contours before correction. Final npm suite: **62/62 PASS**; documentation/frontend/context checks **17/17 PASS**, context integrity PASS. Independent review found no Critical/Important issues; corrected its minor Board fallback and resistor-band findings (44 hidden contour samples became zero). Native browser verified Add before/after surface click, Move while Info is open, one Undo, Select refusing drag, LED information/silhouette after orbit, a single panel containing only Close/Add buttons, no legacy action card and no warning/error logs. Desktop 1920×1080, 1440×900, 1366×768 and 1280×720: panel inside workspace, above navigator, full introduction visible and no horizontal overflow. An earlier production build passed (117 modules); the final build passed TypeScript but Vite was blocked by sandbox realpath EPERM after the user rejected build elevation. Final bundling remains unverified; no new elevation was requested. Source analysis: `SOURCE_ANALYSIS_SELECTION_AND_COMPONENT_INFO.md`; exact evidence: `verification/2026-10-09-component-information-browser.md` and screenshot. Earlier sections below describe historical implementations.

## Breadboard Magnetic Docking & Anti-Overlap Snapping — 2026-10-09

Resolved physical gap and overlapping issues when joining multiple breadboards (`BREADBOARD`, `BREADBOARD_630`, `BREADBOARD_100`). Implemented `snapPosition` in `useCircuitEditor.ts` featuring:
1. **Mathematical Edge-to-Edge Magnetic Docking**: Calculates exact physical docking offsets along Z (North/South: $(D_1 + D_2) / 2$) and X (West/East: $(W_1 + W_2) / 2$) with magnetic capture zones ($dZ \le 0.65, dX \le 1.5$ for Z-joints, $dX \le 0.65, dZ \le 1.2$ for X-joints). Automatically filters out already-occupied docking slots.
2. **Anti-Overlap Collision Resolution**: 3-pass AABB collision relaxation actively repels overlapping breadboards to the nearest flush boundary, preventing models from penetrating or superimposing on each other.
3. **Component Non-Interference**: Standard grid snapping remains intact for electrical components (resistors, ICs, LEDs, etc.) to allow natural placement onto breadboard surfaces.
4. **Verification**: 56/56 web unit tests passed, including dedicated test cases for BB630-to-BB630 ($Z=1.86$), BB100-to-BB630 ($Z=1.19$), BB100-to-BB100 ($Z=0.52$), side-by-side ($X=9.0$), penetration repulsion, and component transparency. Production build passed in 3.19s.

## Breadboard 630 and Power Breadboard 100 3D Models — 2026-10-09

Implemented photorealistic 3D models and high-resolution procedural textures (Anisotropy 16) for `BREADBOARD_630` (630-tie-point terminal strip: 63 cols x 10 rows A..E & F..J, center IC divider groove, dovetail joints, no power rails) and `BREADBOARD_100` (100-tie-point power bus strip: 50 cols x 2 rows in 5-hole clusters, continuous red (+) and blue (-) power lines, bold polarity indicators, modular dovetail interlocking tabs/notches). Both visual structures are registered in canonical `device-library/editor/components.json` and synchronized 1:1 with `apps/web/src/data/editorCatalog.json`. Each model utilizes exactly 1 GPU `InstancedMesh` with automated buffer disposal upon removal. Verified with pytest (11/11 PASS), npm test (55/55 PASS), and production build (PASS).

## Move-only model dragging — 2026-10-09

Latest user rule: direct mouse dragging of breadboard and every other model requires the Move button. `useCircuitEditor` now creates a model gesture only for `workspace.tool === 'move'`; Select still picks/highlights without capture or preview. Empty-surface pan, right orbit, camera-oriented XYZ and nearby navigation buttons remain. Workspace help/hints and grab cursor match the active tool. Inspector coordinate edits and keyboard movement retain their existing behavior.

TDD evidence: the new Select regression failed before the guard change because a breadboard preview moved to X=1.5/Z=1. After correction, **npm 54/54 PASS**, including Select breadboard/LED geometry/camera/history invariants, Move preview/commit/Undo/Redo, low-angle dragging and Move-to-Select cancellation. **Production build PASS** (113 modules; existing Vite chunk advisory). Native browser: the same breadboard drag leaves X=1.5/Y=0/Z=1.5 in Select, moves to X=3/Y=0/Z=2.5 in Move, and one Undo restores the original pose; three components/one named wire remain. Browser warning/error logs are empty. See `verification/2026-10-09-move-tool-browser.md` and screenshot.

Current README/architecture/context/roadmap/spec/analysis/changelog/manifest reflect Move-only. Earlier navigation results below are historical and describe the superseded Select drag behavior.

## Historical workspace navigation correction — 2026-10-09

User requested direct left-drag pan/model movement and camera-oriented XYZ with adjacent navigation controls. Root causes: OrbitControls LEFT disabled without editor pan handler, model gesture gated on Move tool, and static SVG independent of camera. Source/algorithm analysis across frontend graph/render/transport and backend/simulator/hardware boundaries is in `SOURCE_ANALYSIS_WORKSPACE_NAVIGATION.md`.

Default Select and Move now left-drag any model, including Breadboard/Board; empty-surface left-drag grabs/pans the XZ plane. A 4 px threshold distinguishes click/jitter from drag. Model previews preserve elevation/rotation/endpoints and commit one history command on release. Pan translates camera/target only, retains selection/pending wire and records no graph history. Capture identity/release/cancel and camera input lock respect hidden/context loss. Wire/Rotate/Delete/instrument click meanings remain intact.

`WorkspaceNavigator` replaces View controls and the static axis. It projects fixed world bases through inverse camera quaternion, sorts depth and updates in the existing render callback. Six accessible local SVG buttons sit beside XYZ; pan buttons follow camera XZ heading. Passive gizmo regions pass events to the canvas.

Fresh read-only review found one Important low-camera case and one Minor overlay issue. A visible model could be picked while its ray missed Y=0; moves now intersect a horizontal plane through the actual hit, preserving module Y. A regression was RED with the old ground gate and GREEN after correction. Navigator root ignores pointer events; actual buttons receive them, with browser hit-test confirmation.

Verification: **npm 53/53 PASS**, **production build PASS** (113 modules); **full Python 56/56 PASS** with three existing dependency deprecations; `check_context.py` and `git diff --check` PASS. Existing Vite chunk-size advisory remains. Native browser verified Select breadboard/switch dragging, diagonal pan before/after orbit, connected wires, single Undo/Redo, XYZ update, six buttons and four desktop sizes (1920×1080, 1440×900, 1366×768, 1280×720), with no overflow/hint overlap and no warning/error logs. Right-button rotation is verified with genuine OrbitControls pointer-sequence/render integration; CUA native right-drag is unavailable and is not claimed. Exact evidence: `verification/2026-10-09-workspace-navigation-browser.md` and screenshot.

Updated current README/architecture/context/roadmap/spec/analysis/changelog/manifest; historical browser reports retained. No dependency/contract/driver changes, commit/push/deployment or hosted CI run. Phase 3 remains next.

## Phase 2 source and behavior — 2026-10-09

Deep source analysis: `SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE.md`. Added canonical functional catalog and verified browser snapshot for 17 placeable types. 74HC08 uses logical gate port metadata; generic Adder/Multiplier have no part number. Breadboard/Board/Power supply visuals have no ports. Local memory image v1.0 is a separate 8-bit byte contract (1–256 bytes, explicit 32-zero-byte initialization), not physical RAM/capture.

SceneManager now owns lights/models/labels/port anchors/wire projection/picking and OrbitControls. Visual world XZ placement/Y elevation and yaw rotation stay separate from endpoints. Requests coalesce via RAF, pause for zero size/hidden/context loss, and dispose all frame/listener/control/GPU resources on unmount. Ghosts are reused while moving and release instance buffers when canceled.

Ribbon supports native drag/drop and click-to-place. Commands implement select/move/rotate/delete/wire/unwire/snap/undo/redo. Move previews geometry then records one history step on release; cancellation restores graph geometry. Delete cascades incident edges; Undo restores both. Failed/no-op edits do not change history or validation. Connections use explicit named ports and reject duplicate edges, wrong direction/width and additional input drivers, while allowing fanout. Unknown imported metadata is retained; guards reject duplicate IDs, dangling module references, malformed geometry/memory before mutation.

Inspector supports selected-module coordinates/rotation/metadata configuration, keyboard placement/selection/connect/disconnect, existing project/station/validation/console. Hex Editor Apply/Load/Save and Undo/Redo operate on local graph images; asynchronous load verifies draft/selection again before mutation. Run/Stop/Step and instrument acquisition/output remain unavailable until execution contracts exist.

## Phase 2 verification and review

- Baseline: npm 31/31 outside sandbox. New graph/catalog/memory/scene interfaces were RED before implementation, then GREEN.
- Final-review regressions: InstancedMesh disposal and ghost identity reproduced RED; corrected. Palette/DOM-port Escape reproduced RED in browser; shared capture handler corrected both focus paths while preserving floating-window closure.
- Final frontend suite: **43/43 PASS**; production build **PASS**. Full Python regression: **56/56 PASS**, including canonical editor provenance and memory schema; three existing dependency warnings. `check_context.py` PASS. Exact final evidence: `verification/2026-10-09-interactive-workspace-browser.md`.
- Browser verified native breadboard drag/drop, switch/LED placement and wiring, Move with exactly one Undo, rotation, unwire/delete cascade/restore, JSON Save/New/Open preserving rotation/edges/memory, valid/invalid Hex Apply and Undo/Redo.
- All 17 model families rendered/configured; functional 74HC08 and 8-bit memory/display connections succeed, width mismatch fails without adding a wire. Graph structural validation and WebSocket remain connected.
- Browser pointer precision prompted a wire picking-margin regression (RED → fix). Invisible line targets use a camera-scaled margin while displayed wire geometry and graph endpoints remain unchanged.
- Responsive: 1920×1080, 1440×900, 1366×768, 1280×720 PASS; no horizontal body overflow and both open floating windows stay inside workspace. No browser warning/error logs in the tested session.
- Build and final repository/context checks are recorded in the Phase 2 browser report. CI workflow paths include memory/catalog changes; no hosted CI run or push is claimed.

Ruling: keep one demand-driven RAF rendering path without damping/animation because Phase 2 has no simulation engine; Phase 3 may extend scheduling for real signals. Use functional catalog defaults as local configuration, not physical ratings. Keep graph schema 1.0: optional rotation was already accepted by the extensible module schema and is now explicitly typed. Retain unknown imports with fallback visuals instead of inventing mappings.

One fresh read-only final reviewer found two Important issues, both reproduced and fixed as described above; no Critical/Minor findings were reported. No commit/push/deployment was requested or performed.

## Historical Phase 1 record

The following migration evidence describes the earlier shell-only state, before the Phase 2 implementation above.

## Source analysis and migration

The actual source/contracts/tests/CI and supplied icon directory were analyzed in this session. Detailed findings: `docs/SOURCE_ANALYSIS_SINGLE_WORKSPACE.md`. The earlier docs-only redesign identified the six-page routed UI; that diagnosis is now historical.

`App.vue` renders only SingleWorkspaceShell. Legacy and unknown URLs normalize to `/`; router state never selects a lab workflow. Removed seven page components and five old permanent-library/workspace/inspector/dock/analyzer components. New composition:

```text
App/File Bar: New / Open / Save / Undo / Redo
Component Ribbon: twelve specified families
Tool Rail: Select / Wire / Move / Rotate / Delete / Scope / Probe
Dominant Three.js grid + contextual zoom/reset
Status Bar: execution/state/mode/timing/counts/connection
Shared FloatingWindowManager: six contextual window shells
```

Local JSON files obey schema v1 and a shared 2 MB UTF-8 limit. Export falls back to compact serialization before rejecting oversized content; failed export does not mark saved. History retains 50 independent project snapshots. Stale validation guards remain. Session drafts are not server persistence.

`ui` centralizes ribbon/window placement, focus activation and z-order; `workspace` owns exactly one tool; `instrument` keeps configuration shells and bounded event console. Station selection, refresh and structural validation are in Inspector. Existing typed REST and resilient WebSocket implementations remain unchanged.

SceneManager owns graphics, not logical state. ResizeObserver bridges host size and window bounds. Coalesced rendering, pending-frame cancellation, grid geometry/material disposal, renderer disposal and context-recovery listeners establish the Three.js lifecycle foundation.

## Icon and metadata audit

Seventeen supplied SVG files embed PNGs (101,749,162 bytes total). `scripts/prepare_workbench_icons.py` creates committed SVG/WebP thumbnails (43,482 bytes), records original SHA-256 and byte counts, and snapshots canonical starter device metadata. Originals are unchanged. All visible ribbon images loaded in browser verification. Pinouts and electrical parameters are never inferred from images.

## Verification — 2026-10-09

| Check | Evidence |
|---|---|
| Baseline frontend | 20/20 PASS before source changes, outside Windows sandbox. |
| New state/scene/file/router tests | RED missing interfaces/lifecycle → GREEN 28/28. |
| Final review regressions | Focus activation and near-limit file round trip reproduced RED; fixes → npm test 31/31 PASS. |
| Production build | `npm run build` PASS. Vite advisory: large Three.js/application chunk; no build error. |
| Frontend boundaries | `python -m pytest -q tests/frontend`: 9/9 PASS. |
| Whole repository regression | `python -m pytest -q tests services/api/tests services/hardware-service/tests simulator/circuit-simulator/tests`: 44/44 PASS. Existing 3 dependency deprecation warnings. |
| Browser | PASS at 1920×1080, 1440×900, 1366×768, 1280×720. No body horizontal overflow; workspace remains dominant; open windows stay within bounds. |
| Live integration | FastAPI simulation discovery, WebSocket connection/reconnect and Inspector graph validation verified in browser. |
| Commands/windows | New/Open/Save/Undo/Redo, malformed file rejection, supplied icons, tools/zoom, all six window shells, pointer drag/clamp, keyboard movement/Escape, repeated activation and stable focus restoration verified. |
| CI | Frontend workflow triggers updated for artwork/device metadata/script changes. Local workflow checks PASS; no hosted run is claimed before push. |

Browser details: `docs/verification/2026-10-09-single-workspace-browser.md`. Windows sandbox prevents loopback HTTP tests and Vite realpath; the actual verification commands were rerun with approved execution outside it.

## Independent final review

One read-only reviewer found two material issues: ribbon opener focus loss/reselection and pretty exports exceeding the import size limit. Both were reproduced and fixed with regression evidence; final npm suite has 31 passing tests. No additional material defect was identified in import-before-mutation, stale validation, bounds, scene disposal or original-asset exclusion. No minor findings were deferred by the reviewer.

Scope retained: editing/execution/capture are explicit Phase 2+ features; the router's no-op record serves address compatibility only; permissive module properties follow the canonical schema. Costs of these choices are later editor/model/API work, a small temporary compatibility dependency, and leaving logical/electrical validation to the backend. No contract changes or physical driver work occurred.

## Architectural decisions still locked

- Raspberry Pi 5 is the V1 main controller; Web-first / simulation-first.
- Single Workspace is the frontend UX architecture.
- EP4CE6E22C8N without SDRAM is the Experiment Controller prototype.
- EP4CE10E22C8N + 64 MB 16-bit SDR SDRAM is the V1 final direction.
- One FPGA; at least two physical breadboards.
- Physical holes/visual coordinates do not imply independent routing channels or electrical nodes.
- Frontend never imports hardware drivers or accesses device registers directly.

## Historical Phase 1 limitations

Phase 1 provides the shell/grid; it does not place, pick, render or wire logical modules. Tools select an editor mode, not a completed graph-edit action. Run/Stop/Step, acquisition/output, waveform measurements and supported memory editing are unavailable until real contracts/models exist. Projects remain local to the session unless downloaded. Window resizing/minimizing is future work. Vite's large-chunk advisory remains non-blocking.

Device-library coverage is small. gRPC generated bindings/handlers, exact SDRAM/timing, routing architecture/channel count, ADC/DAC/AFE and physical execution remain unimplemented/unselected.

## AI Handoff

### What changed

Latest task removes only sidebar Delete and adds Power Supply/Generator launchers preserving editing state. Supply GUI binds selected canonical graph properties/history, never telemetry; Generator has two local previews with legacy CH1 fields retained and independent nested channel2. Output controls remain disabled. Shared artwork/themes preserve 3D colors/geometry; existing window manager, drawers, Scope/Monitor and graph contracts remain. Frontend191/191, Python97/97 and production build pass; evidence/files: verification/2026-10-12-supply-generator-launchers. Phase3 capture/DDS/simulator integration remains next.

Phase 2 canonical catalog, separate memory contract, graph command/history layer, scene/models/picking/wires/camera controls, pointer/drag/keyboard interactions, selected Inspector/Hex Editor, lifecycle fixes, tests and Markdown. Preserve historical specs/verification and supplied artwork/axis gizmo.

### Next recommended task

Phase 3: define event-driven simulation and clock, functional catalog/evaluator adapters, output/measurement delivery and memory runtime semantics. Do not treat structural API approval, geometry, local initial bytes or visual sources as execution/electrical truth.

### Required context

Read CONTEXT, ARCHITECTURE, ROADMAP, this log, SOURCE_ANALYSIS_INTERACTIVE_WORKSPACE, Phase 2 spec/plan/browser report, canonical editor/memory contracts and related source/tests. Current limitations: simulation/acquisition/generator output and persistence remain unimplemented; active/controller/notation and dual/quad segment contracts remain pending; physical datasheets/topology/ratings remain unconfirmed. Vite's existing large-chunk advisory is nonblocking.
