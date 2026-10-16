import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { configureApiClient } from '../src/services/api/client'
import { useStationStore } from '../src/stores/station'
import { useExperimentStore } from '../src/stores/experiment'
import { useInstrumentStore } from '../src/stores/instrument'
import { useCircuitStore } from '../src/stores/circuit'
import { isStationDescriptor } from '../src/types/station'
import { parseLab } from '../src/types/labValidation'
import { loadSfc, mountSfc, dispatch } from './helpers/vueSfc'
import { stationFixture, runningExperiment } from './helpers/station'
import {instrumentAccess,instrumentFetcher} from './helpers/instruments'
import { bindLabApplication } from './helpers/labApplication'

beforeEach(() => setActivePinia(createPinia()))

function setup(channels = 2, runtime = true, state: Parameters<typeof runningExperiment>[0] = 'RUNNING') {
  const station = useStationStore(), experiment = useExperimentStore(), instrument = useInstrumentStore(), target = stationFixture()
  bindLabApplication()
  const capabilities = target.capabilities!
  capabilities.instrument_capabilities.generator = { channels, runtime_reconfiguration_supported: runtime }
  station.setStations([target]); station.setEventsConnected(true)
  experiment.activeId = 'e1'; experiment.receive({ ...runningExperiment(state), revision: (experiment.active?.revision ?? 0) + 1 });experiment.controlledExperimentId='e1'
  return { station, experiment, instrument, target, capabilities }
}

test('station accepts required structured instrument capabilities and rejects contradictory duplicate truth', () => {
  const target = stationFixture()
  assert.equal(isStationDescriptor(target), true)
  const caps = target.capabilities as unknown as Record<string, unknown>
  for (const change of [ { generator_channels: 2 }, { instruments: { generator: { available: true, channels: 2 } } },
    { instrument_capabilities: { logic_analyzer: { channels: 4, runtime_reconfiguration_supported: false }, oscilloscope: { channels: 0, runtime_reconfiguration_supported: false }, generator: { channels: 0, available: true, runtime_reconfiguration_supported: false } } } ]) {
    assert.equal(isStationDescriptor({ ...target, capabilities: { ...caps, ...change } }), false)
  }
})

test('generator capability limits and unique waveforms validate recursively inside station metadata', () => {
  for (const change of [{ frequency_min_hz: 2000, frequency_max_hz: 1000 }, { offset_min_v: 1, offset_max_v: -1 }, { supported_waveforms: ['SINE', 'SINE'] }]) {
    const target = stationFixture(), capabilities = target.capabilities!
    const generator = { channels: 2, runtime_reconfiguration_supported: true, ...change }
    const instruments = { ...capabilities.instrument_capabilities, generator }
    assert.equal(isStationDescriptor({ ...target, capabilities: { ...capabilities, instrument_capabilities: instruments } }), false)
    assert.throws(() => parseLab('InstrumentCapabilities', instruments), /generator|limits|waveform/i)
    assert.throws(() => parseLab('GeneratorCapability', generator), /generator|limits|waveform/i)
  }
})

test('live generator Apply requires runtime support, RUNNING, connection and an available selected channel',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const {station,experiment,capabilities}=setup()
 configureApiClient({fetcher:async()=>Response.json(instrumentAccess(experiment.currentExecution!.revision))})
 const view=mountSfc(await loadSfc('components/windows/GeneratorWindow.vue'),pinia)
 const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));await nextTick()}
 const disabled=()=>Boolean(view.find('button','aria-label','Apply generator configuration').props.disabled)
 try{
  await settle();assert.equal(disabled(),false)
  capabilities.instrument_capabilities.generator.runtime_reconfiguration_supported=false;station.setStations([{...stationFixture(),capabilities:structuredClone(capabilities)}]);await settle();assert.equal(disabled(),true)
  capabilities.instrument_capabilities.generator.runtime_reconfiguration_supported=true;station.setStations([{...stationFixture(),capabilities:structuredClone(capabilities)}]);await settle()
  experiment.receive({...runningExperiment('GUARDED_POWER_UP'),revision:2});await settle();assert.equal(disabled(),true)
  experiment.receive({...runningExperiment(),revision:3});await settle();assert.equal(disabled(),false)
  capabilities.instrument_capabilities.generator.channels=1;station.setStations([{...stationFixture(),capabilities:structuredClone(capabilities)}]);await settle();assert.equal(!!view.find('button','aria-label','Select CH2 configuration'),false)
  station.setEventsConnected(false);await nextTick();assert.equal(disabled(),true)
 }finally{view.app.unmount()}
})

test('generator advertises supported channels without claiming generated output or invented sync support', async () => {
  const pinia = createPinia(); setActivePinia(pinia); setup(1, false)
  const view = mountSfc(await loadSfc('components/windows/GeneratorWindow.vue'), pinia)
  try {
    const outputs = view.all().filter(node => node.props.class === 'generator-output')
    assert.deepEqual(outputs.map(node => node.children.find(child => child.tag === 'small')!.text), ['AVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE'])
    assert.match(view.text(), /PLAN CONFIGURATION ONLY/)
    assert.match(view.text(), /NO OUTPUT TELEMETRY/)
    assert.doesNotMatch(view.text(), /GENERATED|CAPTURED OUTPUT/)
  } finally { view.app.unmount() }
})

test('generator runtime action refuses unavailable controls before dispatch even without the window', async () => {
  let requests = 0
  configureApiClient({ fetcher: async () => { requests++; return Response.json({ accepted: true, code: 'OK', status: 'ACCEPTED' }) } })
  const { station, experiment, instrument } = setup(0, false)
  await assert.rejects(instrument.configureGenerator('e1', 1, true), /unavailable/i)
  setup(2, false); await assert.rejects(instrument.configureGenerator('e1', 1, true), /runtime|plan/i)
  setup(2, true, 'GUARDED_POWER_UP'); await assert.rejects(instrument.configureGenerator('e1', 1, true), /running/i)
  setup(1, true); await assert.rejects(instrument.configureGenerator('e1', 2, true), /channel/i)
  setup(2, true); station.setEventsConnected(false); await assert.rejects(instrument.configureGenerator('e1', 1, true), /connection|station/i)
  station.setEventsConnected(true); experiment.ownedActiveId = null; await assert.rejects(instrument.configureGenerator('e1', 1, true), /running|acknowledged/i)
  assert.equal(requests, 0)
})

test('runtime controls use the active experiment station rather than a newly selected station', async () => {
  let requests = 0
  configureApiClient({ fetcher: async () => { requests++; return Response.json({ accepted: true, code: 'OK', status: 'ACCEPTED' }) } })
  const { station, instrument, target } = setup()
  station.setStations([target, { ...target, station_id: 'other', capabilities: { ...target.capabilities!, station_id: 'other' } }]); station.selectStation('other')
  await assert.rejects(instrument.configureGenerator('e1', 1, true), /station/i)
  assert.equal(requests, 0)
})

test('optional generator profile limits reject invalid configuration before dispatch and valid limits preserve preview/history', async () => {
  const { station, instrument, capabilities } = setup()
  capabilities.instrument_capabilities.generator = { channels: 2, runtime_reconfiguration_supported: true, supported_waveforms: ['SINE', 'SQUARE'],
    frequency_min_hz: 100, frequency_max_hz: 2000, amplitude_max_vpp: 2, offset_min_v: -1, offset_max_v: 1 }
  station.setStations([{ ...stationFixture(), capabilities: structuredClone(capabilities) }])
  const circuit = useCircuitStore(); circuit.createDraft(); const before = circuit.snapshot(), history = circuit.past.length
  const bodies: unknown[] = []
  configureApiClient({fetcher:instrumentFetcher(bodies)})
  for (const [field, value] of [['frequency', 99], ['frequency', 2001], ['amplitude', 2.1], ['offset', -1.1], ['offset', 1.1], ['waveform', 'Triangle']] as const) {
    const previous = instrument.generator[field]; Object.assign(instrument.generator, { [field]: value })
    await assert.rejects(instrument.configureGenerator('e1', 1, true), /frequency|amplitude|offset|waveform/i)
    Object.assign(instrument.generator, { [field]: previous })
  }
  assert.equal(bodies.length, 0)
  await instrument.configureGenerator('e1', 2, true)
  assert.deepEqual(bodies, [{configuration: {channel: 2,waveform:'SQUARE',frequency_hz:1000,amplitude_vpp:1,offset_v:0,phase_degrees:0,enabled:true}}])
  assert.equal(circuit.snapshot(), before); assert.equal(circuit.past.length, history)
})

test('absent profile limits do not invent ratings and invalid numeric configuration still fails', async () => {
  const { instrument } = setup()
  const bodies: unknown[] = []
  configureApiClient({fetcher:instrumentFetcher(bodies)})
  instrument.generator.frequency = 1e9; instrument.generator.amplitude = 999; instrument.generator.offset = -999
  await instrument.configureGenerator('e1', 1, true); assert.equal(bodies.length, 1)
  for (const [field, value] of [['frequency', NaN], ['amplitude', -1], ['offset', Infinity]] as const) {
    const previous = instrument.generator[field]; Object.assign(instrument.generator, { [field]: value })
    await assert.rejects(instrument.configureGenerator('e1', 1, true))
    Object.assign(instrument.generator, { [field]: previous })
  }
  assert.equal(bodies.length, 1)
})

test('scope uses channel availability but retains honest empty analog data', async () => {
  const pinia = createPinia(); setActivePinia(pinia)
  const { station, capabilities } = setup()
  capabilities.instrument_capabilities.oscilloscope.channels = 2
  station.setStations([{ ...stationFixture(), capabilities: structuredClone(capabilities) }])
  const view = mountSfc(await loadSfc('components/windows/OscilloscopeWindow.vue'), pinia)
  try {
    assert.equal(Boolean(view.find('fieldset', 'aria-label', 'Oscilloscope controls').props.disabled), false)
    assert.match(view.text(), /NO WAVEFORM DATA/)
    assert.equal(view.all().some(node => node.tag === 'polyline' || node.tag === 'canvas'), false)
    station.updateStation({ ...stationFixture(), capabilities: { ...station.executionTarget!.capabilities!,
      instrument_capabilities: { ...station.instrumentCapabilities!, oscilloscope: { channels: 0, runtime_reconfiguration_supported: false } } } }); await nextTick()
    assert.equal(Boolean(view.find('fieldset', 'aria-label', 'Oscilloscope controls').props.disabled), true)
  } finally { view.app.unmount() }
})
