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
import {nextTick} from 'vue'
test('Signal Monitor Run submits the same typed immutable pre-run settings and never silently discards an unsupported trigger',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const instrument=useInstrumentStore(),station=useStationStore(),experiment=useExperimentStore(),circuit=useCircuitStore();station.setStations([stationFixture()]);station.setEventsConnected(true);circuit.importGraph({schema_version:'1.0',circuit_id:'monitor-run',modules:[],connections:[]});instrument.testVectors=[{time_ns:20,inputs:{x:1}}];instrument.captureMaxEvents=12;const calls:unknown[]=[],paths:string[]=[]
 configureApiClient({fetcher:async(url,options)=>{const path=String(url);paths.push(path);if(path==='/api/experiments')calls.push(JSON.parse(String(options?.body)));return Response.json({...runningExperiment(path.endsWith('/stop')?'COMPLETE':path.endsWith('/run')?'QUEUED':'CREATED'),revision:path.endsWith('/stop')?3:path.endsWith('/run')?2:1,lease_expires_at:null})}})
 const view=mountSfc(await loadSfc('components/windows/SignalMonitorWindow.vue'),pinia)
 try{const button=view.find('button','aria-label','Run');assert.ok(button);assert.doesNotMatch(view.text(),/Pause/);await (button.props.onClick as ()=>Promise<unknown>)();assert.deepEqual((calls[0] as {test_vectors:unknown}).test_vectors,[{time_ns:20,inputs:{x:1}}]);assert.equal((calls[0] as {capture_config:{max_events:number}}).capture_config.max_events,12)
 await nextTick();const stop=view.find('button','aria-label','Stop');assert.ok(stop,'Owned queued execution must expose Stop rather than Pause');assert.doesNotMatch(view.text(),/Pause/);await (stop.props.onClick as ()=>Promise<unknown>)();await nextTick();assert.deepEqual(paths,['/api/experiments','/api/experiments/e1/run','/api/experiments/e1/stop']);assert.equal(experiment.executionState,'idle');assert.ok(view.find('button','aria-label','Run'));assert.equal(paths.some(path=>/pause|resume|step/i.test(path)),false)
 experiment.cancelPending();experiment.$reset();instrument.triggerDraft={enabled:true,signal:'x',edge:'RISING'};await (button.props.onClick as ()=>Promise<unknown>)();assert.equal(calls.length,1);assert.match(instrument.configurationError??'',/trigger/i);instrument.triggerDraft.enabled=false;instrument.setRequestedInputError('capture.duration_ns','9007199254740993','Numeric precision would be lost.');await (button.props.onClick as ()=>Promise<unknown>)();assert.equal(calls.length,1);assert.match(instrument.configurationError??'',/invalid requested/i)
 }finally{view.app.unmount();experiment.cancelPending()}
})
test('Scope acquisition keys stay unavailable without a confirmed analog producer',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const station=useStationStore(),target=stationFixture();target.capabilities!.instrument_capabilities.oscilloscope.channels=3;station.setStations([target]);station.setEventsConnected(true);const view=mountSfc(await loadSfc('components/windows/OscilloscopeWindow.vue'),pinia)
 try{assert.match(view.text(),/3 declared channels/);const single=view.all().find(node=>node.tag==='button'&&node.text==='Single')!;assert.notEqual(single.props.disabled,undefined);assert.match(view.text(),/No confirmed analog acquisition producer/)}finally{view.app.unmount()}
})
