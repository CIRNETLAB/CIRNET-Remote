# Camera framing and anchored zoom — 2026-10-19

> Historical evidence status — 2026-10-19 audit: command outputs, Git state and local artifact locations below describe the original session. They do not report this audit’s results or authorize new output under `.build`, `.superpowers`, `.test-build` or `docs/verification`. For reruns use [VERIFICATION.md](../VERIFICATION.md); generated visual and raw diagnostic artifacts must start outside the repository. Existing outputs await separate owner review and have not been deleted or moved.

## Final contract

The user's latest correction supersedes the earlier prompt's automatic return
to overview at 50% and its extended inspection range. **Wheel and +/- always
retain the active target**, including at 50% and 100%. Fit, Home and Area change
the focal point only when explicitly invoked; manual Pan retains its intended
view translation. Ordinary zoom has a real **50–1000%** range;
collision clearance can lower its reachable maximum.

Fit and Home establish a tight full-circuit 100% reference. Area retains that
reference and applies a bounded inspection distance. Orbit and Pan do not rebase
magnification. Resize, committed bounds updates and previews never silently
rebase magnification or move the camera. Returning to a complete circuit view
is an explicit Fit/Home operation.

## Confirmed causes

The original immutable render/UI source and native evidence are in ignored
`apps/web/.test-build/unified-camera/baseline-source` and `before/`. On the same
1680×620 canvas, the old sphere Fit used only **29.013% of canvas width**, at
distance/reference **61.0393**. Area then replaced its reference with **5.0562**
and displayed 100%. Home on the layout translated by X/Z `(80,40)` returned to
the origin and missed the circuit. The final usable-viewport tightness assertion
also fails that old implementation: **30.199% usable coverage**, expected ≥89%.

The intermediate unified controller introduced the two later reported problems:
its zoom-out path interpolated/copy-reset the active target to overview, and its
inspection budget permitted **1,000,000%**. Automatic projection recalibration
also changed the reference on orientation/viewport/bounds changes. New tests
observed target drift at ordinary 50/100% and physical distances producing zoom
above 1000 before the anchored-zoom correction.

These are camera/state defects. Model scale, physical layout and material
appearance are not used to conceal them.

## Source changes

- `CameraFraming.ts`: committed per-mesh/per-instance bounds, four independent
  perspective edge constraints, asymmetric usable viewport, TOP/roll and
  translation invariance. Geometry attributes and instance transforms are cached
  by revision. Current billboard orientation is resolved from immutable data.
  Helpers, pin annotations, hidden proxies and transient previews are excluded;
  valid visible `ignorePick` artwork remains included.
- `ViewportNavigation.ts`: separate cached overview projection from the stable
  magnification reference. Only `commitOverview` from Fit/Home changes the latter.
  Ordinary `zoomPose` copies the current target and changes only dolly distance.
  Actual minimum distance is `max(1e-4, reference / 10, collision clearance)`;
  maximum distance is `reference * 2`. The finite geometric floor also protects
  degenerate data. No million-percent range or target interpolation remains.
- `SceneManager.ts`: atomic camera transactions, actual camera/controls distance
  limits applied before update, one custom wheel path shared with toolbar zoom,
  and exact orientation preservation. Fit/Home use the tight solver. Area clips
  the selected geometry cone and anchors its visible center from an actual mesh
  hit, while retaining the circuit reference. Tiny/invalid/full-canvas selections
  have explicit no-op behavior. Empty regions use a finite focal plane.
- Area sweeps its actual camera displacement against committed rendered meshes.
  A blocked move is an atomic no-op. This prevents an unselected obstacle outside
  the old selection cone from containing the new eye, without letting unrelated
  geometry behind the old eye pull an empty-space view across the scene.
- Unchanged `syncGraph` reuses committed framing bounds/revision and collision
  limits. Wire geometry is flushed before collecting a consistent snapshot;
  drag/placement/wire previews affect clipping without changing the committed
  framing snapshot.
- `stores/workspace.ts`, `CircuitWorkspace3D.vue` and
  `SimulationStatusBar.vue`: request identity is separate from reported zoom.
  Readback cannot issue another camera command, cancel Area or widen the range
  beyond 50–1000. Fit never publishes a speculative 100%. Requests are retired on
  document change/unmount. Only display is rounded; limit enabled-state uses a
  small numerical tolerance. The output width is fixed in `style.css`.
- The usable viewport reserves persistent ribbon/tool-rail occupancy from the
  existing layout. Transient selection panels/tooltips/floating windows do not
  alter framing.

## Depth, Grid and interaction protection

Adaptive clipping and owned thin-surface depth biases remain intact. Grid keeps
its physical fragment depth, original XZ lattice/colors/widths and broad fade.
Its navigation focus derives from the camera's finite ground projection, rather
than model bounds or the Area focal target. No depth clear, additional pass, model
scale or FOV change is introduced.

CircuitGraph/history, physical matrices/scale, mounting, contacts, topology,
Contracts, simulation, FPGA, serialization and dependencies remain unchanged.

Tests retain actual wire-surface picking/editing and dolly collision protection.
Review found and reproduced a thin-wire Area center drift, a negative-Y numeric
residual and the out-of-cone obstacle case; each received a failing regression
before correction. The final ordinary-zoom tests require an unchanged anchor,
orientation, reference and physically bounded distance throughout repeated
wheel/toolbar cycles.

## Verification evidence

Evidence stays in ignored `apps/web/.test-build/unified-camera/`. Final anchored
browser evidence is separated in `anchored-after/`; earlier `after/` captures
exercise superseded auto-recenter/extended-range semantics and are not final
acceptance evidence.

The original full-suite run exposed nine docking fixtures that assumed the old
sphere-fit height/distance and one shared SFC test-host geometry regression.
The fixtures now establish an explicit positive-height placement view; all
mechanical pose, ground inverse mapping, overlap and history assertions remain.
The DOM test geometry override is local to the bridge test. No production
placement/domain behavior was changed to silence these failures.

Final anchored-source checks:

- `npm test`: **1344 passed, 0 failed, 0 skipped**, exit 0. Log:
  `unit-anchored-verified.log`.
- `npm run build`: exit 0, including the application's TypeScript check.
  Log: `build-anchored-verified.log`. Vite retains its existing large-chunk
  advisory; no build error occurred.
- `npm run check:boundaries`: **227 source modules**, exit 0.
- E2E TypeScript (`tsc --noEmit -p tsconfig.e2e.json`): exit 0.
- Exact requested default command,
  `npm run test:e2e -- --grep "camera|zoom|framing"`: **6 passed** in
  6.6 minutes, exit 0. Log: `default-grep-verified.log`. This includes the
  three new camera cases, empty Grid invariance, native component placement and
  existing depth navigation. Camera commands preserve CircuitGraph and model
  resources throughout the full native toolbar/Orbit/Pan/ViewCube sequence.
- Camera browser matrix (`playwright.camera.config.ts`): **12 passed** in
  10.2 minutes, wide/portrait at DPR 1/2. Log:
  `matrix-anchored-verified.log`; final screenshots and camera/graph metadata:
  `anchored-after/`. Tests cover off-center native wheel and toolbar cycles,
  exact target/reference preservation, actual distance bounds, explicit
  Fit/Home/Area transitions, partial and empty Area, resize/context restoration,
  thin-wire centering and actual wire picking.
- `anchored-summary.json` audits **80 captured states** against the final source
  fingerprints (`anchored-verified-source.json`): all six production file hashes
  match. Fit occupies **90% of usable width** in all four projects. The wide
  reference is **21.4022386**, compared with the old sphere Fit's 61.0393.
  Ordinary zoom target drift is **exactly 0**; every captured physical distance
  is at least `reference / 10`, and reachable magnification never exceeds 1000%.
  Translating the circuit changes Home reference by at most `3.56e-15`.
  Area retains the reference (382.97% wide / 544.1% portrait), returns to an
  anchored 50%, and actual foreground-wire picking remains successful.
- Focused real-WebGL depth/Grid suite: **4 passed**, exit 0; log
  `depth-grid-anchored.log`, images/JSON in `depth-grid-anchored/`.
  Tight-vs-broad clipping retained 34,047 grid pixels with **0 differences**;
  421 opaque foreground samples had **0 changes**. Adding, moving, deleting
  models and emptying the scene each produced **0 grid differences** at the
  same camera pose. Empty Grid remained visible at 50/100/1000%.
  The previously failing inspect pose had **0 detected underlayer leaks** over
  23,034 LED, 1,180,765 oscilloscope and 285,219 generator samples. The offscreen
  CLOCK case also retained its near plane and had 0 leaks in 421 samples.
- Final independent source review found no actionable issues. A separate
  real-factory audit checked 56 rays through segment/dot geometry at 1000%
  without crossing an ignored physical surface. Instrument `ignorePick` nodes
  are decals over guardable surfaces; breadboard solids remain guardable.

The source-hash/80-state audit was rerun successfully after the default browser
suite (`anchored-audit.log`). Final E2E TypeScript and `git diff --check` also
returned exit 0. Both browser wrapper runs logged owned API shutdown exit 0 and
completed their Vite cleanup. No source changes followed the final tests/build.

## Reproduction

From `apps/web`, using the repository's existing dependencies/services:

```powershell
npm run check:boundaries
npm test
npm run build
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.e2e.json
npm run test:e2e -- --grep "camera|zoom|framing"
npm run test:e2e -- --config playwright.camera.config.ts
```

The tracked camera configuration runs wide/portrait at DPR 1/2. Renderer evidence
uses Three r171, WebGL2 / ANGLE SwiftShader and a 24-bit depth buffer; this records
the tested backend rather than claiming every GPU driver was exercised.
