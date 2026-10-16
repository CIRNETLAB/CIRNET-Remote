import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {useInstrumentStore} from '../src/stores/instrument'
import {useStationStore} from '../src/stores/station'
import {useExperimentStore} from '../src/stores/experiment'
import {watchInstrumentControlScope} from '../src/composables/instrumentControlScope'
import {bindLabApplication} from './helpers/labApplication'
import {stationFixture,runningExperiment} from './helpers/station'
import {instrumentCommand,instrumentAccess} from './helpers/instruments'
import {configureApiClient} from '../src/services/api/client'
import {parseLab} from '../src/contracts/validation'
test('Stop or station scope loss clears live acknowledgement authority while keeping requested drafts',async()=>{
 setActivePinia(createPinia());const instrument=useInstrumentStore(),station=useStationStore(),experiment=useExperimentStore(),target=stationFixture();target.capabilities!.instrument_capabilities.generator={channels:2,runtime_reconfiguration_supported:true};station.setStations([target]);station.setEventsConnected(true);experiment.receive(runningExperiment());experiment.controlledExperimentId='e1'
 configureApiClient({fetcher:async(_url,options)=>options?.method==='POST'?Response.json(instrumentCommand(parseLab('InstrumentGeneratorCommand',JSON.parse(String(options.body))).configuration,new Headers(options.headers).get('Idempotency-Key')!,'REQUESTED')):Response.json(instrumentAccess())})
 const app=bindLabApplication(),stop=watchInstrumentControlScope(instrument,experiment,station)
 try{await instrument.configureGenerator('e1',1,true);assert.equal(instrument.generatorControl.channels[1].phase,'unknown');instrument.generator.frequency=2400;experiment.receive({...runningExperiment('STOPPING'),revision:2});assert.equal(instrument.generatorControl.channels[1].phase,'idle');assert.equal(instrument.generator.frequency,2400)
 }finally{stop();app.dispose()}
})

test('routine station and running execution snapshots preserve an unresolved command key and its Apply lock',async()=>{
 setActivePinia(createPinia());const instrument=useInstrumentStore(),station=useStationStore(),experiment=useExperimentStore(),target=stationFixture();target.capabilities!.instrument_capabilities.generator={channels:2,runtime_reconfiguration_supported:true};station.setStations([target]);station.setEventsConnected(true);experiment.receive(runningExperiment());experiment.controlledExperimentId='e1'
 configureApiClient({fetcher:async(_url,options)=>options?.method==='POST'?Response.json(instrumentCommand(parseLab('InstrumentGeneratorCommand',JSON.parse(String(options.body))).configuration,new Headers(options.headers).get('Idempotency-Key')!,'REQUESTED')):Response.json(instrumentAccess())})
 const app=bindLabApplication(),stop=watchInstrumentControlScope(instrument,experiment,station)
 try{await instrument.configureGenerator('e1',1,true);const key=instrument.generatorControl.channels[1].operationKey;station.setStations([structuredClone(target)]);experiment.receive({...runningExperiment(),revision:2});assert.equal(instrument.generatorControl.channels[1].phase,'unknown');assert.equal(instrument.generatorControl.channels[1].operationKey,key);station.setEventsConnected(false);assert.equal(instrument.generatorControl.channels[1].phase,'unknown');station.setEventsConnected(true);assert.equal(instrument.generatorControl.channels[1].phase,'unknown');await instrument.configureGenerator('e1',1,true);assert.equal(instrument.generatorControl.channels[1].operationKey,key)
 }finally{stop();app.dispose()}
})
