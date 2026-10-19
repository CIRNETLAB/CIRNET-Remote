# Overlay drawers verification — 2026-10-11

> Audit status — 2026-10-19: this is historical evidence. The image files named below were already absent from the supplied repository at baseline `0cc66f8`; this audit did not inspect or recreate them. Recorded measurements and results are preserved. New verification outputs follow [the shared guide](../VERIFICATION.md) and stay outside the repository.

## Scope and diagnosis

Analyzed ToolRail.vue, ComponentRibbon.vue, CircuitWorkspace3D.vue, frameTasks.ts, SceneManager.ts, ui.ts, style.css and related shell/editor/windows/tests before editing. The supplied recording is1916×908,19.866633 seconds; inspected samples at0,2,…18 seconds using the browser's native video decoder. It shows model display size changing with Ribbon visibility. A separate authored local frame probe reproduced the remaining CSS/drawing-buffer timing gap before the fix.

Before: closing Ribbon produced one canvas ResizeObserver delivery, editor cancellation, setViewport and buffer allocation. Its old1517×666 buffer became1517×786 after canvas1214×533 expanded to1214×629. Three of nine sampled frames had mismatched aspect. Moving allocation immediately before render had removed the cleared-buffer frame but had not stopped CSS scaling the previous buffer before that render.

Current stage permanently fills the workbench behind absolute overlay drawers. Only drawer/toggle translate3d transitions run,200 ms with soft easing. Closed content stays mounted and becomes inert/aria-hidden, then visibility-hidden after completion. Root boxes retain expanded dimensions but allocate no layout space. No workspace width/height animation, menu-driven canvas resize, camera fit/reset, scene reconstruction or graph operation occurs.

## Automated verification

- `cd apps/web; npm test`: **185/185 PASS**, including test TypeScript. Seven new regressions cover safe insets/viewport identity, window position and drawer lifecycle (retention, reversal, reduced motion, resize/disposal, same-frame/no-end-event and running-transition settlement).
- `cd apps/web; npm run build`: **PASS**, production TypeScript and136 modules. Existing >500 kB bundle advisory remains.
- `$env:PYTHONPATH='.audit-runtime'; python -m pytest -q`: **97/97 PASS**; three existing deprecations.
- `python scripts/check_context.py`: **PASS**; `git diff --check`: **PASS**. Full Python suite rerun after handoff documents:97/97.
- Initial two store tests failed before implementation. Independent review reproduced same-frame phantom occupancy; the async test failed183-pass/1-fail before its fix. Post-commit settlement and stable edge-toggle obstacle corridors fixed both findings; read-only re-review reports no additional actionable finding.

Runtime commands used approved external execution for the existing Windows sandbox restrictions. No new dependency was installed.

## Browser checks

The ignored local probe mounts the real App/stores and samples canvas CSS dimensions, drawing-buffer dimensions and both computed transforms via RAF. It counts canvas observer callbacks, canvas buffer allocations, viewport/workbench actions and editor cancellation. A local WebGL-context wrapper records shader view/projection matrices; the fixture contains an Oscilloscope, Clock, LED and one logical wire. Instrumentation is confined to the test page and does not ship in production.

Final rapid test reverses both drawers nine times,35 ms apart. **69 sampled frames** contain36 distinct Ribbon transforms and36 distinct Tools transforms, confirming intermediate motion. Throughout:

| Measurement | Result |
| --- | --- |
| Canvas CSS dimensions |1280×629, one unique size |
| Drawing buffer |1600×786, one unique size |
| Canvas ResizeObserver / buffer allocation / setViewport / setWorkbenchSize / editor cancellation |0 each |
| Aspect mismatch frames |0 (0.3% tolerance for DPR rounding) |
| Captured view/projection matrices changed |false |
| Circuit store state changed |false |

Individual collapse/expand checks for both panels likewise retain canvas/buffer dimensions. Bounded obstacle renders at target/completion are permitted; the animation does not request a WebGL draw per intermediate transform. Actual browser viewport changes continue through the existing deduplicated resize pipeline.

Real pointer drags set Tools150 px and Components180 px without any canvas resize. Keyboard separators reach the same sizes.320×480 and390×480 clamp dimensions without document horizontal overflow;1920×1080 and the restored default viewport recover180/150 preferences. Edge openers stay in view. Reduced motion is checked using a controlled MediaQueryList preference in the probe and the real production motion classes; no OS setting was changed. Same-frame reversal is also checked on the real mounted components.

Clean `/` imports the same fixture through the native Open/file chooser.3 components/1 wire/100% zoom, model appearance, graph counts and simulation shell retain their state through all four combinations. Scope opens outside the drawer; closing it with Escape after Tools collapses returns focus to Expand Tools. Clean warning/error console log is empty. Native keyboard Enter/Space support and captured resize lifecycle remain covered by existing tests. Viewport override is reset after QA.

Expanded/collapsed screenshots were inspected and show the same model/wire positions and dimensions: expanded (historical image reference: `2026-10-11-drawers-expanded.png`; absent at audit baseline)., collapsed (historical image reference: `2026-10-11-drawers-collapsed.png`; absent at audit baseline).. Sampling validates the tested browser/session and fixed geometry, rather than promising a universal frame rate on every GPU.

## Files changed

Product source:

- `apps/web/src/components/workbench/ToolRail.vue`
- `apps/web/src/components/workbench/ComponentRibbon.vue`
- `apps/web/src/components/workbench/SingleWorkspaceShell.vue`
- `apps/web/src/components/workbench/CircuitWorkspace3D.vue`
- `apps/web/src/components/windows/FloatingWindow.vue`
- `apps/web/src/composables/useDrawerMotion.ts` (new)
- `apps/web/src/stores/ui.ts`
- `apps/web/src/style.css`

Tests: `apps/web/tests/drawerMotion.test.ts` (new), `apps/web/tests/workbench.test.ts`. **frameTasks.ts and SceneManager.ts inspected and unchanged**: their existing scheduling/deduplication is reused for actual viewport changes.

Required handoff docs: CONTEXT, ARCHITECTURE, ROADMAP, CHANGELOG, DEV_LOG, SOURCE_ANALYSIS_COLLAPSIBLE_TOOLBARS; this report and two screenshots. Earlier collapse/performance reports remain historical. No Circuit Graph/contract/model factory/icon/simulation-control changes or unrelated refactoring.
