import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {useInstrumentStore} from '../src/stores/instrument'
import {useStationStore} from '../src/stores/station'
import {useExperimentStore} from '../src/stores/experiment'
import {useCircuitStore} from '../src/stores/circuit'
import {configureApiClient} from '../src/services/api/client'
import {mountSfc,loadSfc} from './helpers/vueSfc'
import {stationFixture,runningExperiment} from './helpers/station'
test('Signal Monitor Run submits the same typed immutable pre-run settings and never silently discards an unsupported trigger',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const instrument=useInstrumentStore(),station=useStationStore(),experiment=useExperimentStore(),circuit=useCircuitStore();station.setStations([stationFixture()]);station.setEventsConnected(true);circuit.importGraph({schema_version:'1.0',circuit_id:'monitor-run',modules:[],connections:[]});instrument.testVectors=[{time_ns:20,inputs:{x:1}}];instrument.captureMaxEvents=12;const calls:unknown[]=[]
 configureApiClient({fetcher:async(url,options)=>{if(String(url)==='/api/experiments')calls.push(JSON.parse(String(options?.body)));return Response.json({...runningExperiment(String(url).endsWith('/run')?'QUEUED':'CREATED'),revision:1,lease_expires_at:null})}})
 const view=mountSfc(await loadSfc('components/windows/SignalMonitorWindow.vue'),pinia)
 try{const button=view.all().find(node=>node.tag==='button'&&node.children.some(child=>child.text.includes('Run / Pause')))!;await (button.props.onClick as ()=>Promise<unknown>)();assert.deepEqual((calls[0] as {test_vectors:unknown}).test_vectors,[{time_ns:20,inputs:{x:1}}]);assert.equal((calls[0] as {capture_config:{max_events:number}}).capture_config.max_events,12)
 experiment.cancelPending();experiment.$reset();instrument.triggerDraft={enabled:true,signal:'x',edge:'RISING'};await (button.props.onClick as ()=>Promise<unknown>)();assert.equal(calls.length,1);assert.match(instrument.configurationError??'',/trigger/i);instrument.triggerDraft.enabled=false;instrument.setRequestedInputError('capture.duration_ns','9007199254740993','Numeric precision would be lost.');await (button.props.onClick as ()=>Promise<unknown>)();assert.equal(calls.length,1);assert.match(instrument.configurationError??'',/invalid requested/i)
 }finally{view.app.unmount();experiment.cancelPending()}
})
test('Scope acquisition keys stay unavailable without a confirmed analog producer',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const station=useStationStore(),target=stationFixture();target.capabilities!.instrument_capabilities.oscilloscope.channels=3;station.setStations([target]);station.setEventsConnected(true);const view=mountSfc(await loadSfc('components/windows/OscilloscopeWindow.vue'),pinia)
 try{assert.match(view.text(),/3 declared channels/);const single=view.all().find(node=>node.tag==='button'&&node.text==='Single')!;assert.notEqual(single.props.disabled,undefined);assert.match(view.text(),/No confirmed analog acquisition producer/)}finally{view.app.unmount()}
})
