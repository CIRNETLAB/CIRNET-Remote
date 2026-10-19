# Unified editor commands verification

Date: 2026-10-15 (Asia/Saigon). Workspace: existing linked `refactor` worktree.

## Architecture and behavior

- CircuitGraph remains authoritative. Contracts, backend and dependencies are unchanged.
- `editor/selection.ts` normalizes explicit module/wire selections. Workspace exposes one normalized selection view while retaining the existing single-object Inspector compatibility fields.
- `editor/selectionClipboard.ts` captures immutable deep snapshots, including reference context without implicitly copying referenced modules. `editor/batchCommands.ts` constructs and validates whole paste/delete candidates. The circuit store commits each batch exactly once; legacy remove/disconnect methods delegate to that path.
- `useSelectionCommands.ts` is the sole clipboard, menu and duplicate-preview controller. Existing Wire APIs delegate to it. A successful paste advances its snapshot cursor exactly once; failed/cancelled previews do not advance it. Context-menu Paste commits directly.
- `SelectionPreview.ts` and `SelectionGhostRoutes.ts` render transient candidates only. Valid group routing uses the complete candidate wire set, with unselected context hidden. Invalid ghosts use the same rigid transform as the candidate builder and do not invent electrical endpoints.
- Shared contact, footprint/occupancy, connection, electrical-net and file validators reject the entire candidate before history changes. Endpoint IDs, mounts, routing frames and module/world control points are remapped through one complete group ownership map.
- The gizmo is a screen-facing overlay at the object pivot. Its open yellow ring and hollow left knob have a fixed screen-relative layout. Rotation gestures use screen angle; translation uses the world plane with a conditioned projection fallback at the camera horizon.
- Instruments start in the canonical world frame. Existing instrument factories and `ComponentModel` already use Y-up/front +Z and preserve stored transforms; these were audited and regression-tested without rewriting their geometry.
- Marquee selects committed component/instrument/wire geometry, excluding Breadboard support backgrounds. Direct Breadboard picking remains available. Ctrl/Meta toggles mixed selection. Selection changes do not write graph history, and ordinary edits retain surviving selected IDs.
- Right presses remain available to OrbitControls. Only a release within the 4-pixel movement threshold opens the shared context menu; cancellation, drawing, placement and active gestures retain priority.

## Regression coverage

Coverage includes camera/yaw/zoom-stable gizmo layout and picking; placement follow/handle acquisition; screen rotation and snapping; horizon translation; world-oriented instrument creation and camera navigation; mixed marquee and Ctrl/Meta selection; deep group copying; contact/endpoint/mount/frame remapping; physical occupancy and electrical rejection; preview cancellation and invalid visual feedback; source deletion; direct incremental Paste; atomic Undo/Redo; pointer duplication; graph watcher reconciliation; context menu keyboard behavior and right-drag priority; preview resource reuse and disposal.

Independent review reproduced and verified fixes for stale selection after edits, invalid ghosts returning to their source, clipboard shortcuts overlapping gizmo gestures, and routing ownership across multiple Breadboards.

## Practical limits

- Browser UI verification was attempted through the provided browser tool. Access to localhost was explicitly denied by its permission policy; no alternative browser or indirect workaround was used. Visual geometry/material/picking behavior is covered by automated Three.js and Vue tests, but this run has no browser screenshot sign-off.
- During placement, the centered XZ handle is acquired after approaching a separated handle. This keeps the pivot-following cursor free to place the component with an ordinary left click.
- Copying a wire between unchanged component ports cannot invent new electrical destinations. Such a duplicate is rejected; copy its connected modules or use declared Breadboard contacts. Invalid next contacts, occupied footprints and rail gaps are rejected instead of being silently skipped.
- The production bundle retains Vite's warning about a minified chunk larger than 500 kB.

## Changed files

### Source

- [apps/web/src/components/windows/InspectorWindow.vue](../../apps/web/src/components/windows/InspectorWindow.vue)
- [apps/web/src/components/workbench/CircuitWorkspace3D.vue](../../apps/web/src/components/workbench/CircuitWorkspace3D.vue)
- [apps/web/src/components/workbench/WireContextMenu.vue](../../apps/web/src/components/workbench/WireContextMenu.vue)
- [apps/web/src/composables/useCircuitEditor.ts](../../apps/web/src/composables/useCircuitEditor.ts)
- [apps/web/src/composables/useSelectionCommands.ts](../../apps/web/src/composables/useSelectionCommands.ts)
- [apps/web/src/composables/useWireRouting.ts](../../apps/web/src/composables/useWireRouting.ts)
- [apps/web/src/editor/batchCommands.ts](../../apps/web/src/editor/batchCommands.ts)
- [apps/web/src/editor/selection.ts](../../apps/web/src/editor/selection.ts)
- [apps/web/src/editor/selectionClipboard.ts](../../apps/web/src/editor/selectionClipboard.ts)
- [apps/web/src/editor/selectionContacts.ts](../../apps/web/src/editor/selectionContacts.ts)
- [apps/web/src/electrical/nets.ts](../../apps/web/src/electrical/nets.ts)
- [apps/web/src/geometry/placementRotation.ts](../../apps/web/src/geometry/placementRotation.ts)
- [apps/web/src/geometry/transformDrag.ts](../../apps/web/src/geometry/transformDrag.ts)
- [apps/web/src/stores/circuit.ts](../../apps/web/src/stores/circuit.ts)
- [apps/web/src/stores/workspace.ts](../../apps/web/src/stores/workspace.ts)
- [apps/web/src/three/ComponentTransformGizmo.ts](../../apps/web/src/three/ComponentTransformGizmo.ts)
- [apps/web/src/three/SceneManager.ts](../../apps/web/src/three/SceneManager.ts)
- [apps/web/src/three/SelectionGhostRoutes.ts](../../apps/web/src/three/SelectionGhostRoutes.ts)
- [apps/web/src/three/SelectionPreview.ts](../../apps/web/src/three/SelectionPreview.ts)
- [apps/web/src/wires/wireClipboard.ts](../../apps/web/src/wires/wireClipboard.ts)

### Tests

- [apps/web/tests/contextual-panels.test.ts](../../apps/web/tests/contextual-panels.test.ts)
- [apps/web/tests/instrument-orientation.test.ts](../../apps/web/tests/instrument-orientation.test.ts)
- [apps/web/tests/interaction.test.ts](../../apps/web/tests/interaction.test.ts)
- [apps/web/tests/placement-rotation.test.ts](../../apps/web/tests/placement-rotation.test.ts)
- [apps/web/tests/scene.test.ts](../../apps/web/tests/scene.test.ts)
- [apps/web/tests/selection-clipboard.test.ts](../../apps/web/tests/selection-clipboard.test.ts)
- [apps/web/tests/selection-invalid-preview.test.ts](../../apps/web/tests/selection-invalid-preview.test.ts)
- [apps/web/tests/selection-preview.test.ts](../../apps/web/tests/selection-preview.test.ts)
- [apps/web/tests/transform-drag.test.ts](../../apps/web/tests/transform-drag.test.ts)
- [apps/web/tests/transform-gizmo.test.ts](../../apps/web/tests/transform-gizmo.test.ts)
- [apps/web/tests/unified-commands-interaction.test.ts](../../apps/web/tests/unified-commands-interaction.test.ts)
- [apps/web/tests/unified-selection.test.ts](../../apps/web/tests/unified-selection.test.ts)
- [apps/web/tests/wire-clipboard.test.ts](../../apps/web/tests/wire-clipboard.test.ts)
- [apps/web/tests/wire-context-interaction.test.ts](../../apps/web/tests/wire-context-interaction.test.ts)
- [apps/web/tests/wire-context-menu.test.ts](../../apps/web/tests/wire-context-menu.test.ts)

## Final verification

- `cd apps/web && npm test`: PASS, 619 tests, 619 passed, zero failed/cancelled/skipped (about 63 seconds). This includes the test TypeScript check.
- `cd apps/web && npm run build`: PASS, including `vue-tsc --noEmit` and Vite production compilation; 218 modules transformed. Vite reports the existing large-chunk warning described above.
- `git diff --check`: PASS. Git emits line-ending notices for files using the repository CRLF policy; no whitespace errors.
- Final independent review: no remaining actionable findings after rerunning the four concrete regressions described above.
- 20 source files and 15 test files were added or modified. No contract, backend, package manifest or lockfile changed.