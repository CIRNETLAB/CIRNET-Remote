import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useWorkspaceStore } from '../src/stores/workspace'
import { useCircuitStore } from '../src/stores/circuit'
import { dispatch, loadSfc, mountSfc } from './helpers/vueSfc'

test('camera zoom readback cannot cancel Area, clamp measured zoom, or issue a zoom command', () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore()
  workspace.toggleZoomArea()
  const request = workspace.zoomRequest
  workspace.setReportedZoom(1432.125, 50, 2400)
  assert.equal(workspace.zoomAreaActive, true)
  assert.equal(workspace.zoom, 1432.125)
  assert.equal(workspace.maxZoom, 1000, 'camera readback cannot reopen the hard inspection range')
  assert.equal(workspace.zoomRequest, request)
  workspace.setReportedZoom(36.5, 50, 900)
  assert.equal(workspace.zoom, 36.5, 'temporary calibration outside limits is displayed without commanding the camera')
  assert.equal(workspace.zoomRequest, request)
  workspace.setReportedZoom(NaN, 50, 900)
  assert.equal(workspace.zoom, 36.5)
})

test('Fit publishes only an intent and never speculatively displays 100 percent', () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore()
  workspace.setReportedZoom(321.456, 50, 1500)
  workspace.toggleZoomArea()
  workspace.setZoom(800)
  workspace.fitEntireCircuit()
  assert.equal(workspace.zoom, 321.456)
  assert.equal(workspace.fitRequest, 1)
  assert.equal(workspace.zoomAreaActive, false)
  assert.equal(workspace.zoomAppliedRequest, workspace.zoomRequest, 'Fit retires an unapplied zoom intent')
  workspace.setReportedZoom(100, 50, 1500)
  assert.equal(workspace.zoom, 100)
})

test('pending zoom button intents accumulate without readback and retire without replay', () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore()
  workspace.setReportedZoom(132.125, 50, 2400)
  workspace.stepZoom(10); workspace.stepZoom(10)
  assert.equal(workspace.requestedZoom, 152.125)
  assert.equal(workspace.zoom, 132.125)
  const firstRequest = workspace.zoomRequest
  workspace.acknowledgeZoomRequest(firstRequest - 1)
  workspace.stepZoom(10)
  assert.equal(workspace.requestedZoom, 162.125, 'an earlier acknowledgement cannot consume a newer intent')
  workspace.cancelZoomRequest()
  workspace.setReportedZoom(287.375, 50, 2400)
  workspace.stepZoom(-10)
  assert.equal(workspace.requestedZoom, 277.375, 'after retirement, buttons use the latest camera measurement')
})

test('zoom button enabled-state tolerates floating point noise at dynamic limits without rounding readback', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore(), view = mountSfc(await loadSfc('components/workbench/SimulationStatusBar.vue'), pinia)
  try {
    const maximum = 900, minimumNoise = 50 + 1e-13, maximumNoise = maximum - 1e-13
    assert.notEqual(maximumNoise, maximum, 'the probe must retain a representable rounding difference')
    workspace.setReportedZoom(minimumNoise, 50, maximum)
    await nextTick()
    assert.equal(view.find('button', 'aria-label', 'Zoom Out').props.disabled, true)
    assert.equal(workspace.zoom, minimumNoise, 'button tolerance never clamps or rounds the camera measurement')
    workspace.setReportedZoom(maximumNoise, 50, maximum)
    await nextTick()
    assert.equal(view.find('button', 'aria-label', 'Zoom In').props.disabled, true)
    assert.equal(workspace.zoom, maximumNoise)
    workspace.setReportedZoom(50.001, 50, maximum)
    await nextTick()
    assert.equal(view.find('button', 'aria-label', 'Zoom Out').props.disabled, false)
    workspace.setReportedZoom(maximum - .001, 50, maximum)
    await nextTick()
    assert.equal(view.find('button', 'aria-label', 'Zoom In').props.disabled, false)
  } finally { view.app.unmount() }
})

test('status bar +/- stays within 50 to 1000, rounds only display and keeps circuit history untouched', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const workspace = useWorkspaceStore(), circuit = useCircuitStore()
  circuit.createDraft(); circuit.placeModule('BREADBOARD', { x: 0, y: 0, z: 0 }); circuit.past = []
  const graph = circuit.snapshot(), view = mountSfc(await loadSfc('components/workbench/SimulationStatusBar.vue'), pinia)
  try {
    // The production camera bridge acknowledges intents and publishes the actual pose.
    const stop = workspace.$onAction(({ name, after }) => {
      if (name === 'setZoom') after(() => {
        workspace.setReportedZoom(workspace.requestedZoom, workspace.minZoom, workspace.maxZoom)
        workspace.acknowledgeZoomRequest(workspace.zoomRequest)
      })
    })
    for (let i = 0; i < 90; i++) dispatch(view.find('button', 'aria-label', 'Zoom In'), 'onClick')
    await nextTick()
    assert.equal(workspace.zoom, 1000)
    assert.equal(view.find('button', 'aria-label', 'Zoom In').props.disabled, true)
    assert.equal(view.find('output', 'aria-label', 'Workspace magnification').text, '1000%')
    for (let i = 0; i < 95; i++) dispatch(view.find('button', 'aria-label', 'Zoom Out'), 'onClick')
    await nextTick()
    assert.equal(workspace.zoom, 50)
    assert.equal(view.find('button', 'aria-label', 'Zoom Out').props.disabled, true)
    dispatch(view.find('button', 'aria-label', 'Zoom To View Entire Circuit'), 'onClick')
    assert.equal(workspace.zoom, 50); assert.equal(workspace.fitRequest, 1)
    workspace.setReportedZoom(987.125, 50, 1442.125)
    await nextTick()
    assert.equal(view.find('output', 'aria-label', 'Workspace magnification').text, '987.13%')
    assert.equal(view.find('button', 'aria-label', 'Zoom In').props.disabled, false)
    dispatch(view.find('button', 'aria-label', 'Zoom In'), 'onClick')
    assert.equal(workspace.zoom, 997.125)
    dispatch(view.find('button', 'aria-label', 'Zoom In'), 'onClick')
    await nextTick()
    assert.equal(workspace.zoom, 1000)
    assert.equal(view.find('button', 'aria-label', 'Zoom In').props.disabled, true)
    workspace.setReportedZoom(1432.125, 50, 1442.125)
    await nextTick()
    assert.equal(view.find('output', 'aria-label', 'Workspace magnification').text, '1432.13%')
    assert.equal(workspace.zoom, 1432.125, 'temporary out-of-range calibration remains readback, not a camera command')
    assert.equal(view.find('button', 'aria-label', 'Zoom In').props.disabled, true)
    dispatch(view.find('button', 'aria-label', 'Zoom Out'), 'onClick')
    assert.equal(workspace.zoom, 1000, 'an explicit command returns to the hard range')
    stop()
    assert.equal(circuit.snapshot(), graph); assert.equal(circuit.past.length, 0)
  } finally { view.app.unmount() }
})
