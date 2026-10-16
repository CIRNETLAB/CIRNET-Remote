import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {nextTick} from 'vue'
import {useInstrumentStore} from '../src/stores/instrument'
import {useStationStore} from '../src/stores/station'
import {useExperimentStore} from '../src/stores/experiment'
import {configureApiClient} from '../src/services/api/client'
import {parseLab} from '../src/contracts/validation'
import type {InstrumentCommandRecord,GeneratorConfiguration} from '../src/contracts/generated/dto'
import {stationFixture,runningExperiment} from './helpers/station'
import {bindLabApplication} from './helpers/labApplication'
import {mountSfc,loadSfc,dispatch} from './helpers/vueSfc'
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setTimeout(r,0));await nextTick()}
function setup(channels:number){const pinia=createPinia();setActivePinia(pinia);const station=useStationStore(),experiment=useExperimentStore(),instrument=useInstrumentStore(),target=stationFixture();target.capabilities!.instrument_capabilities.generator={channels,runtime_reconfiguration_supported:true};station.setStations([target]);station.setEventsConnected(true);experiment.receive({...runningExperiment(),lease_expires_at:1900000000});experiment.controlledExperimentId='e1';const application=bindLabApplication(pinia);return {pinia,station,experiment,instrument,application}}
const command=(configuration:GeneratorConfiguration,key:string,status:InstrumentCommandRecord['status']):InstrumentCommandRecord=>({schema_version:'1.0',experiment_id:'e1',operation_key:key,status,revision:status==='APPLIED'?2:1,accepted:status==='ACCEPTED'||status==='APPLIED',hardware_applied:status==='APPLIED',error_code:status==='REQUESTED'?'ACKNOWLEDGEMENT_UNKNOWN':null,configuration})
test('generator displays actual declared channels, explicitly disables unsupported channel3 and never invents zero-channel output',async()=>{
 const context=setup(3);configureApiClient({fetcher:async()=>Response.json({schema_version:'1.0',experiment_id:'e1',revision:1,can_configure_generator:true,generator_channels:[1,2],reason:'READY'})})
 const view=mountSfc(await loadSfc('components/windows/GeneratorWindow.vue'),context.pinia)
 try{await flush();assert.ok(view.text().includes('3 declared channels'));assert.equal(view.find('button','aria-label','Select CH3 configuration').props.disabled,true);assert.ok(view.text().includes('Duty cycle is local-only'))
 const target=stationFixture();context.station.setStations([target]);await nextTick();assert.ok(view.text().includes('0 declared channels'));assert.equal(view.find('button','aria-label','Apply generator configuration').props.disabled,true)
 }finally{view.app.unmount();context.application.dispose()}
})
test('generator shows requested edits separately from pending and accepted acknowledgement snapshots',async()=>{
 const context=setup(2);let acknowledge!:(value:Response)=>void;const pending=new Promise<Response>(resolve=>acknowledge=resolve);let key='',submitted!:GeneratorConfiguration
 configureApiClient({fetcher:async(_url,options)=>{if(options?.method==='POST'){key=new Headers(options.headers).get('Idempotency-Key')!;submitted=parseLab('InstrumentGeneratorCommand',JSON.parse(String(options.body))).configuration;return pending}return Response.json({schema_version:'1.0',experiment_id:'e1',revision:1,can_configure_generator:true,generator_channels:[1,2],reason:'READY'})}})
 const view=mountSfc(await loadSfc('components/windows/GeneratorWindow.vue'),context.pinia)
 try{await flush();dispatch(view.find('input','aria-label','Requested generator enabled'),'onChange',true);dispatch(view.find('button','aria-label','Apply generator configuration'),'onClick');await flush();assert.equal(context.instrument.generatorControl.channels[1].pending,true)
 dispatch(view.find('input','aria-label','Generator frequency (Hz)'),'onChange','2000');acknowledge(Response.json(command(submitted,key,'ACCEPTED')));await flush()
 assert.equal(context.instrument.generator.frequency,2000);assert.equal(context.instrument.generatorControl.channels[1].lastAcknowledged?.configuration.frequency_hz,1000);assert.ok(view.text().includes('Accepted; output not confirmed'));assert.ok(!view.text().includes('Applied by driver'))
 }finally{view.app.unmount();context.application.dispose()}
})
test('unknown generator acknowledgement blocks every channel and Refresh only reads the original command key',async()=>{
 const context=setup(2);let key='',configuration!:GeneratorConfiguration,posts=0,queries=0
 configureApiClient({fetcher:async(url,options)=>{if(options?.method==='POST'){posts++;key=new Headers(options.headers).get('Idempotency-Key')!;configuration=parseLab('InstrumentGeneratorCommand',JSON.parse(String(options.body))).configuration;return Response.json(command(configuration,key,'REQUESTED'))}if(String(url).includes('/commands/')){queries++;assert.ok(String(url).endsWith(key));return Response.json(command(configuration,key,'APPLIED'))}return Response.json({schema_version:'1.0',experiment_id:'e1',revision:1,can_configure_generator:true,generator_channels:[1,2],reason:'READY'})}})
 const view=mountSfc(await loadSfc('components/windows/GeneratorWindow.vue'),context.pinia)
 try{await flush();dispatch(view.find('button','aria-label','Apply generator configuration'),'onClick');await flush();assert.equal(context.instrument.generatorControl.channels[1].phase,'unknown');dispatch(view.find('button','aria-label','Select CH2 configuration'),'onClick');await nextTick();assert.equal(view.find('button','aria-label','Apply generator configuration').props.disabled,true)
 dispatch(view.find('button','aria-label','Select CH1 configuration'),'onClick');await nextTick();dispatch(view.find('button','aria-label','Refresh generator command status'),'onClick');await flush();assert.equal(posts,1);assert.equal(queries,1);assert.ok(view.text().includes('Applied by driver'))
 }finally{view.app.unmount();context.application.dispose()}
})

test('invalid numeric requested text blocks Apply rather than silently sending the previous valid setting',async()=>{
 const context=setup(2);let posts=0;configureApiClient({fetcher:async(_url,options)=>{if(options?.method==='POST')posts++;return Response.json({schema_version:'1.0',experiment_id:'e1',revision:1,can_configure_generator:true,generator_channels:[1,2],reason:'READY'})}})
 const view=mountSfc(await loadSfc('components/windows/GeneratorWindow.vue'),context.pinia)
 try{await flush();dispatch(view.find('input','aria-label','Generator frequency (Hz)'),'onChange','9007199254740993');await nextTick();assert.equal(context.instrument.generator.frequency,1000);assert.ok(view.text().includes('precision'));assert.equal(view.find('button','aria-label','Apply generator configuration').props.disabled,true);dispatch(view.find('button','aria-label','Apply generator configuration'),'onClick');await flush();assert.equal(posts,0)
 dispatch(view.find('input','aria-label','Generator frequency (Hz)'),'onChange','2000');await nextTick();assert.equal(view.find('button','aria-label','Apply generator configuration').props.disabled,false)
 }finally{view.app.unmount();context.application.dispose()}
})
