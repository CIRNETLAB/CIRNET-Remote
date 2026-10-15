# Transform Gizmo, wire context menu and tool launchers

Date: 15 October 2026. Baseline: `86be2d4`. Source is left uncommitted; no merge/push performed.

## Implemented behavior

The Transform Gizmo uses Three.js geometry for separate beveled white X/Z triangles with gray borders, a rounded cyan XZ square, and an open yellow Y-rotation arc with rounded ends and a hollow endpoint knob. Its handle identities remain `x`, `z`, `xz`, `rotate-y` and `delete`. Interactive surfaces follow the visible geometry rather than the removed arrow-shaft/diamond hitboxes. Logical gesture markers remain on the XZ work plane to preserve rotation math. Placement acquisition was adjusted for the narrow hollow rim so the grip does not continue moving away while the pointer approaches. Camera-relative sizing, obstacle avoidance, placement following, snapping, capture, Delete and history retain their existing paths.

Right-clicking an existing rendered wire now opens a small Delete / Duplicate / Paste menu at the pointer. The press is consumed during canvas capture before OrbitControls can begin an orbit. A press starting on empty space remains available to Orbit even if the drag ends over a wire. Drawing-wire right clicks still add/remove bends; wire-edit cancellation, placement cancellation and zoom-area cancellation retain priority.

- Delete removes the clicked wire through the existing graph command and clears selection.
- Duplicate copies source/destination and a deep snapshot of the current WireVisual into temporary editor state. It creates no connection/history entry.
- Paste finds the next real contact one declared local-X pitch away at both endpoints and calls the existing `connectEndpoints()` validation/history path. Later successful pastes use successive cumulative pitch offsets. Failed pastes do not consume a step or mutate graph/history.
- Control points are translated through their declared world/module coordinate spaces, preserving shape, frame ownership, color, thickness, height and route mode. Rotated breadboards are supported when the endpoint translations agree.
- Clipboard state is scoped to the current draft and clears on circuit switches, including Undo across circuits. It is not exported or added to an electrical/persistence contract.

Paste explicitly rejects component-port endpoints without a declared contact successor, missing/end contacts, rail gaps, duplicate connections and incompatible board orientations/pitches. Two different local-X directions cannot share a rigid shape-preserving translation; this case reports an error instead of deforming the route or inventing an endpoint.

The menu clamps to the viewport, supports enabled-item arrow/Home/End navigation, Enter/native button activation and Escape, and closes on outside click, graph/tool/circuit changes or an action. Its outside listener is removed on unmount. Escape returns focus to the canvas; an outside click retains the outside target's focus.

Tools Sidebar has exactly four active editing tools: Select → Wire → Move → Rotate. Below are launchers Power Supply → Probe → Scope → Function Generator, opening `power-supply`, `monitor`, `oscilloscope`, `generator`. Launchers call only `ui.openWindow()`, have no selected/aria-pressed state and preserve a live wire draft, current tool, selection and graph history. Unused `scope`, `probe`, `delete` editing-tool branches were removed; Delete through Gizmo and keyboard remains.

## Verification

Final commands run in `apps/web`:

```text
npm test
PASS: 549 tests, 0 failures, 0 skipped; 37.45 seconds.

npm run build
PASS: vue-tsc --noEmit and Vite production build.
208 modules transformed; built in 5.16 seconds.

git diff --check
PASS; Git emits line-ending notices only.
```

Vite retains the non-fatal large-chunk warning: main JavaScript 1,413.14 kB (369.79 kB gzip).

The first full run exposed two failures among 549 tests: an actual rotation-marker raycast miss at yaw 270°, and an old scene test assuming a single material per mesh. The first traced to a ray exactly on a torus tessellation meridian being missed with FrontSide; only the knob material now uses DoubleSide, and its hollow center still rejects picking. The original dynamic-marker/rotation assertion remains intact. The hover/disposal test now inspects the face/bevel material array and release of every unique geometry/material. Scene and Gizmo tests pass 41/41 after correction, followed by the passing complete suite above.

Independent read-only review found no confirmed P1/P2 issue in the wire clipboard and editor/menu integration. Tests cover actual raycasting, shape gaps, hollow grip, rotated handles, placement capture/follow, snap/Delete/history, exact contact pitch, rotated coordinate conversion, repeated Paste, duplicate/invalid-contact rejection, menu priority/lifecycle/keyboard/viewport behavior, and launchers preserving genuine wire-drawing state.

No schema, electrical contracts, Backend, Simulator, Hardware Service, FPGA or dependency files were changed. CircuitGraph remains electrical truth; Three.js performs rendering/picking and Pinia/composable state owns transient interaction state.

## Files

- `apps/web/src/three/ComponentTransformGizmo.ts`: geometry, visible hit surfaces and placement capture.
- `apps/web/src/wires/wireClipboard.ts`, `composables/useWireRouting.ts`: temporary copy state, real-contact mapping and atomic menu operations.
- `apps/web/src/composables/useCircuitEditor.ts`: event priority and obsolete-tool removal.
- `apps/web/src/components/workbench/WireContextMenu.vue`, `CircuitWorkspace3D.vue`: accessible menu and workspace integration.
- `apps/web/src/components/workbench/ToolRail.vue`, `stores/workspace.ts`: four editing tools and four stateless launchers.
- Web regression tests for interaction, scene, Gizmo, clipboard/menu, launchers and workbench state.

## Limits

No new browser screenshots or native Orbit recording were captured under the previously established localhost browser restriction. The supplied style reference was inspected; geometry/material and real Three.js raycast tests validate implementation properties, while final rendered visual comparison and native browser input remain unverified.
