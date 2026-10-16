import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { useExperimentStore } from '../src/stores/experiment'
import { useInstrumentStore } from '../src/stores/instrument'
import { useStationStore } from '../src/stores/station'
import { configureApiClient } from '../src/services/api/client'
import { captureFixture, captureResponse, deferred } from './helpers/capture'
import { runningExperiment, stationFixture } from './helpers/station'
import { createLabApplication } from '../src/application/labApplication'
import {instrumentAccess,instrumentCommand} from './helpers/instruments'
import type { GeneratorTransport } from '../src/application/ports/lab'

beforeEach(() => setActivePinia(createPinia()))

function application(pinia:Pinia,configureGenerator:GeneratorTransport) {
  const experiment=useExperimentStore(pinia),instrument=useInstrumentStore(pinia),station=useStationStore(pinia)
  const target=stationFixture()
  target.capabilities!.instrument_capabilities.generator={channels:2,runtime_reconfiguration_supported:true}
  station.setStations([target]);station.setEventsConnected(true)
  experiment.activeId='e1';experiment.receive(runningExperiment());experiment.controlledExperimentId='e1'
  return {experiment,instrument,station,controller:createLabApplication({experiment,instrument,station,configureGenerator,getInstrumentAccess:async()=>instrumentAccess(experiment.currentExecution!.revision),getInstrumentCommand:async()=>{throw new Error('No command read expected')}})}
}

test('experiment request state does not mutate capture presentation without an attached application port', () => {
  const experiment=useExperimentStore(), instrument=useInstrumentStore()
  experiment.activeId='e1'
  experiment.receive({...runningExperiment(),capture:captureFixture().metadata})
  assert.equal(instrument.captureMetadata,null)
  assert.equal(experiment.active?.capture?.capture_id,'c1')
})

test('a standalone instrument store cannot dispatch live control without application authority', async () => {
  let requests=0
  configureApiClient({fetcher:async()=>{requests++;return Response.json({accepted:true,code:'OK',status:'ACCEPTED'})}})
  const station=useStationStore(), experiment=useExperimentStore(), instrument=useInstrumentStore()
  const target=stationFixture()
  target.capabilities!.instrument_capabilities.generator={channels:2,runtime_reconfiguration_supported:true}
  station.setStations([target]);station.setEventsConnected(true)
  experiment.activeId='e1';experiment.receive(runningExperiment());experiment.controlledExperimentId='e1'
  await assert.rejects(instrument.configureGenerator('e1',1,true),/not connected/i)
  assert.equal(requests,0)
})

test('application ports remain scoped to their own stores and route only active capture evidence', async () => {
  const calls:string[]=[]
  const left=application(createPinia(),async(id,configuration,key)=>{
    calls.push(`left:${id}:${configuration.channel}`);return instrumentCommand(configuration,key)
  })
  const right=application(createPinia(),async(id,configuration,key)=>{
    calls.push(`right:${id}:${configuration.channel}`);return instrumentCommand(configuration,key)
  })
  const metadata=captureFixture('observed','observed-capture').metadata
  left.experiment.receive({...runningExperiment(),revision:2,capture:metadata})
  assert.deepEqual(left.instrument.captureMetadata,metadata)
  assert.equal(right.instrument.captureMetadata,null)
  left.experiment.receive({...runningExperiment(),experiment_id:'other',revision:3,capture:null})
  left.experiment.receive({...runningExperiment(),revision:1,capture:null})
  assert.deepEqual(left.instrument.captureMetadata,metadata)
  await left.instrument.configureGenerator('e1',2,true)
  await right.instrument.configureGenerator('e1',1,true)
  assert.deepEqual(calls,['left:e1:2','right:e1:1'])
  left.controller.dispose();left.controller.dispose()
  left.experiment.receive({...runningExperiment(),revision:4,capture:null})
  assert.deepEqual(left.instrument.captureMetadata,metadata)
  await assert.rejects(left.instrument.configureGenerator('e1',1,true),/not connected/i)
  await right.instrument.configureGenerator('e1',2,true)
  assert.equal(calls.at(-1),'right:e1:2')
  right.controller.dispose()
})

test('disposing an older binding cannot cancel a replacement binding or its real capture load', async () => {
  const pinia=createPinia(),reply=deferred<Response>(),fixture=captureFixture()
  let signal:AbortSignal|undefined
  configureApiClient({fetcher:async(_url,options)=>{signal=options?.signal??undefined;return reply.promise}})
  const first=application(pinia,async(_id,configuration,key)=>instrumentCommand(configuration,key,'ACCEPTED'))
  const second=application(pinia,async(_id,configuration,key)=>instrumentCommand(configuration,key,'APPLIED'))
  second.instrument.useCapture(fixture.metadata)
  const pending=second.instrument.ensureCaptureLoaded()
  first.controller.dispose()
  const aborted=signal?.aborted
  reply.resolve(captureResponse(fixture.binary));await pending
  assert.equal(aborted,false)
  assert.equal(second.instrument.capture?.samples[0]?.value,'X')
  assert.equal((await second.instrument.configureGenerator('e1',1,true))?.status,'APPLIED')
  second.controller.dispose()
})
