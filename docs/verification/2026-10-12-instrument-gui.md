# Instrument GUI redesign — 2026-10-12

> Audit status — 2026-10-19: this is historical evidence. The image files named below were already absent from the supplied repository at baseline `0cc66f8`; this audit did not inspect or recreate them. Recorded measurements and results are preserved. New verification outputs follow [the shared guide](../VERIFICATION.md) and stay outside the repository.

Baseline: `e5b7f6b`. Local verification only; no acquisition/hardware execution claim.

## Source analysis and boundaries

Before editing, inspected OscilloscopeWindow, SignalMonitorWindow, FloatingWindow/manager, window definitions, instrument/UI stores, scope model/artwork and shared CSS. Existing instrument state holds configuration only: scope time/scale/trigger, monitor channel names/time scale and generator configuration. There is no acquisition/sample/measurement contract. Scope artwork already defines seven knobs and eight keys in Horizontal/Trigger/Vertical sections; its preview waveform is decorative 3D artwork and must not become a GUI measurement.

FloatingWindow/manager own movement, focus, Escape, bounds and scrolling. UI computes drawer safe areas and preserves preferred window dimensions across viewport changes. These owners were retained. Global styles include shared Generator/Hex heading/status selectors; only obsolete Scope/Monitor selectors were removed.

## Result

- Scope: large empty waveform grid on the left; three front-panel groups and seven CSS dials on the right; Auto Set, Run/Stop, Single, Default, Mode, Source, Slope and Menu. CH1 remains yellow and CH2 cyan. Disabled controls have explicit accessible labels. Existing time/scale/trigger configuration is displayed; positions/level/source and measurements remain unknown.
- Monitor: real configured channel names on the left, division-based timeline/grid on the right, capture/trigger header, disabled Time Base/Trigger/Run-Pause controls and measurement/status footer. No channels are fabricated when configuration is empty. Samples, duration, edges and trigger time remain unknown.
- Shared presentation metadata supplies the same colors/labels to the GUI and existing scope model/artwork. No geometry, Circuit Graph, instrument store, acquisition adapter or FloatingWindow manager change. Scope760×530 and Monitor720×500 are default dimensions; scoped container queries and existing body scrolling adapt to smaller viewports.
- No extra canvas/WebGL, dependency, acquisition event listener, timer or animation loop. Dials are visual disabled controls until a supported acquisition contract exists. The two scope scale displays intentionally read the existing shared configuration field.

## Verification

| Check | Result |
| --- | --- |
| Red/green regression | Four new actual-SFC SSR tests first failed for missing controls/status/channel rendering and old Scope width; all pass after implementation. |
| `cd apps/web; npm test` | 185/185 pass, including test TypeScript, existing graph/model/window/drawer/API/lifecycle coverage and four new instrument tests. |
| `cd apps/web; npm run build` | Production TypeScript/build pass,142 modules. Existing large-chunk advisory remains. |
| `$env:PYTHONPATH='.audit-runtime'; python -m pytest -q` | 97/97 pass; three existing dependency deprecations remain. |
| Desktop native browser | Scope760×530: all seven dials/eight keys and footer visible, body client/scroll height493/493. Monitor720×500: entire empty capture layout/footer visible, body client/scroll height457/457. |
| Responsive native browser | Scope at390×600 and320×480 and Monitor at390×600 have no horizontal document/body overflow; narrow layouts wrap and retain existing vertical body scrolling. Eight-channel Monitor also checked at320×480: body client/scroll width254/254,100 px channel list beside132.4 px timeline. |
| Configured monitor fixture | Eight labels,36 px rows,288 px SVG/plot height; channel rows begin at the same Y as their grid. Zero trace paths/polylines. Labels are configuration-only test fixtures, never acquired data. |
| Other windows | Real components mounted in an ignored local harness: Generator retains OUTPUT UNAVAILABLE/disabled configuration; Inspector selects catalog Memory; Component Info shows correct contract notice; Hex Editor opens and Apply changes its local byte image to AA55 00 01. Harness adds no production opener/logic. |
| Capture truth/state | SSR asserts unchanged instrument/graph snapshots, escaped channel labels, disabled controls, empty measurements and no waveform renderer. Native browser has only the existing workspace canvas. |
| Existing drawers | Collapse/reopen both drawers with Monitor open keeps its66/148 px position, canvas1280×629 CSS box and1600×786 drawing buffer unchanged. |
| Independent review | Read-only review reports no critical or important source/test issue; scoped CSS removal is safe for other windows and shared model values remain equivalent. |
| Browser console | Warning/error logs empty in clean app and regression harness. |

Commands use approved external execution because this Windows sandbox restricts runtime/loopback access. Browser viewport override is reset and temporary probe is removed after QA.

## Files changed

Production:

- `apps/web/src/components/windows/OscilloscopeWindow.vue`
- `apps/web/src/components/windows/SignalMonitorWindow.vue`
- `apps/web/src/components/windows/InstrumentDial.vue` (new)
- `apps/web/src/data/instrumentVisuals.ts` (new)
- `apps/web/src/types/windows.ts`
- `apps/web/src/three/OscilloscopeArtwork.ts`
- `apps/web/src/three/OscilloscopeModel.ts`
- `apps/web/src/style.css`

Tests: `apps/web/tests/instrument-windows.test.ts` (new).

Documentation: `docs/CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/DEV_LOG.md`, `docs/CHANGELOG.md`, `apps/web/README.md`, this report and the two desktop screenshots below.

FloatingWindow.vue, FloatingWindowManager.vue, instrument.ts, ui.ts, CircuitWorkspace3D/SceneManager and other window components remain unchanged.

## Screenshots

Clean app Scope, default desktop:

Oscilloscope (historical image reference: `2026-10-12-oscilloscope-desktop.jpg`; absent at audit baseline).

Clean app Monitor with no configured channels/capture, default desktop:

Signal Monitor (historical image reference: `2026-10-12-signal-monitor-desktop.jpg`; absent at audit baseline).
