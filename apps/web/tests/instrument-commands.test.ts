import {test} from 'node:test'
import assert from 'node:assert/strict'
import {InstrumentCommandController,type InstrumentCommandPorts} from '../src/application/instruments/commands'
import type {InstrumentCommandRecord,InstrumentControlAccess,GeneratorConfiguration} from '../src/contracts/generated/dto'
import {runningExperiment,stationFixture} from './helpers/station'
import {PendingObservationLedger} from '../src/application/operations/pendingObservations'
const configuration=():GeneratorConfiguration=>({channel:1,waveform:'SINE',frequency_hz:1000,amplitude_vpp:1,offset_v:0,enabled:true})
const ready:InstrumentControlAccess={schema_version:'1.0',experiment_id:'e1',revision:1,can_configure_generator:true,generator_channels:[1,2],reason:'READY'}
function record(config:GeneratorConfiguration,status:InstrumentCommandRecord['status']='ACCEPTED',key='key-1'):InstrumentCommandRecord{return {schema_version:'1.0',experiment_id:'e1',operation_key:key,status,revision:1,accepted:status==='ACCEPTED'||status==='APPLIED',hardware_applied:status==='APPLIED',error_code:status==='REQUESTED'?'ACKNOWLEDGEMENT_UNKNOWN':status==='FAILED'?'DRIVER_REJECTED':null,configuration:config}}
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve}}
function setup(overrides:Partial<InstrumentCommandPorts>={}){
 const target=stationFixture();target.capabilities!.instrument_capabilities.generator={channels:2,runtime_reconfiguration_supported:true}
 const context={experiment:runningExperiment(),controlledExperimentId:'e1' as string|null,target,connected:true},calls:{kind:string;key?:string}[]=[],counter={value:0}
 const controller=new InstrumentCommandController({context:()=>context,access:async()=>({...ready}),send:async(_id,config,key)=>{calls.push({kind:'send',key});return record(config,'ACCEPTED',key)},get:async(_id,key)=>{calls.push({kind:'get',key});return record(configuration(),'APPLIED',key)},key:()=>`key-${++counter.value}`,...overrides})
 return {controller,context,calls}
}
test('accepted command keeps a detached acknowledged snapshot without claiming hardware output changed',async()=>{
 const pending=deferred<InstrumentCommandRecord>();let submitted!:GeneratorConfiguration
 const {controller}=setup({send:async(_id,config)=>{submitted=config;return pending.promise}}),draft=configuration(),request=controller.configure('e1',draft)
 for(let i=0;i<10&&!submitted;i++)await Promise.resolve();draft.frequency_hz=2000
 assert.equal(controller.state().channels[1].pending,true);assert.equal(submitted.frequency_hz,1000)
 pending.resolve(record(submitted));await request
 const state=controller.state().channels[1];assert.equal(state.phase,'accepted');assert.equal(state.lastAcknowledged?.hardware_applied,false);assert.equal(state.lastAcknowledged?.configuration.frequency_hz,1000)
})
test('lost acknowledgement is queried by its original key and blocks another Apply until reconciled',async()=>{
 const queries:string[]=[];let sends=0,applied=false
 const {controller}=setup({send:async()=>{sends++;throw new TypeError('lost ACK')},get:async(_id,key)=>{queries.push(key);return record(configuration(),applied?'APPLIED':'REQUESTED',key)}})
 await controller.configure('e1',configuration());const unknown=controller.state().channels[1];assert.equal(unknown.phase,'unknown');assert.equal(unknown.operationKey,'key-1');assert.equal(unknown.lastAcknowledged,null)
 await controller.configure('e1',configuration());await controller.configure('e1',{...configuration(),channel:2});assert.equal(sends,1)
 applied=true;await controller.reconcile(1);assert.equal(controller.state().channels[1].phase,'applied');assert.equal(sends,1);assert.ok(queries.every(key=>key==='key-1'))
})
test('server REQUESTED response remains unknown and never replaces an earlier last acknowledgement',async()=>{
 let next:InstrumentCommandRecord['status']='APPLIED'
 const {controller}=setup({send:async(_id,config,key)=>record(config,next,key)})
 await controller.configure('e1',configuration());next='REQUESTED';await controller.configure('e1',{...configuration(),frequency_hz:2000})
 const state=controller.state().channels[1];assert.equal(state.phase,'unknown');assert.equal(state.lastAcknowledged?.configuration.frequency_hz,1000);assert.equal(state.command?.configuration.frequency_hz,2000)
})
test('live dispatch requires own acknowledged context, RUNNING lease and server allocated channel',async()=>{
 const {controller,context,calls}=setup();context.controlledExperimentId=null;await assert.rejects(controller.configure('e1',configuration()),/acknowledged|control/i)
 context.controlledExperimentId='e1';context.experiment.lease_expires_at=null;await assert.rejects(controller.configure('e1',configuration()),/lease/i)
 context.experiment.lease_expires_at=100;context.experiment.state='COMPLETE';await assert.rejects(controller.configure('e1',configuration()),/running/i);assert.equal(calls.length,0)
 const limited=setup({access:async()=>({...ready,generator_channels:[1]})});await assert.rejects(limited.controller.configure('e1',{...configuration(),channel:2}),/allocated|channel/i);assert.equal(limited.calls.length,0)
})
test('cancelled scope ignores old command replies even when a new scope uses the same experiment ID',async()=>{
 const old=deferred<InstrumentCommandRecord>(),fresh=deferred<InstrumentCommandRecord>();let sends=0
 const {controller}=setup({send:async()=>++sends===1?old.promise:fresh.promise})
 const before=controller.configure('e1',configuration());for(let i=0;i<10&&sends===0;i++)await Promise.resolve();controller.cancel()
 const after=controller.configure('e1',{...configuration(),frequency_hz:2000});for(let i=0;i<10&&sends<2;i++)await Promise.resolve()
 old.resolve(record(configuration()));await before;assert.equal(controller.state().channels[1].pending,true);assert.equal(controller.state().channels[1].lastAcknowledged,null)
 fresh.resolve(record({...configuration(),frequency_hz:2000},'APPLIED','key-2'));await after;assert.equal(controller.state().channels[1].lastAcknowledged?.configuration.frequency_hz,2000)
})

test('refresh reconciles a new lost command independently of the previous applied configuration',async()=>{
 let requests=0,reads=0
 const {controller}=setup({send:async(_id,config,key)=>{if(++requests===1)return record(config,'APPLIED',key);throw new TypeError('lost new ACK')},get:async(_id,key)=>{if(++reads===1)throw new TypeError('offline query');return record({...configuration(),frequency_hz:2000},'APPLIED',key)}})
 await controller.configure('e1',configuration());await controller.configure('e1',{...configuration(),frequency_hz:2000});assert.equal(controller.state().channels[1].phase,'unknown')
 await controller.reconcile(1);const refreshed=controller.state().channels[1];assert.equal(refreshed.phase,'applied');assert.equal(refreshed.lastAcknowledged?.configuration.frequency_hz,2000);assert.equal(requests,2);assert.equal(reads,2)
})
test('returned command evidence cannot mutate internal acknowledgement configuration',async()=>{
 const {controller}=setup();await controller.configure('e1',configuration());const evidence=controller.state().channels[1].lastAcknowledged!
 try{evidence.configuration.frequency_hz=9000}catch{}
 assert.equal(controller.state().channels[1].lastAcknowledged?.configuration.frequency_hz,1000)
 const access=controller.state().access!;try{access.generator_channels.length=0}catch{}
 assert.equal(controller.state().access?.generator_channels.length,2)
})

test('reload reads a pending generator key without resending configuration or granting control',async()=>{
 let raw:string|null=null,sends=0,reads=0
 const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value}}).scope('alice')
 observations.begin({kind:'generator',key:'old-generator',experimentId:'e1',channel:1});observations.unknown('old-generator')
 const {controller,context}=setup({observations,send:async()=>{sends++;return record(configuration())},get:async(_id,key)=>{reads++;return record(configuration(),'APPLIED',key)}})
 context.controlledExperimentId=null
 assert.equal(controller.state().channels[1].phase,'unknown')
 await controller.reconcile(1);assert.equal(reads,1);assert.equal(sends,0)
 assert.equal(context.controlledExperimentId,null);assert.equal(controller.state().channels[1].phase,'applied')
 assert.deepEqual(observations.list(),[])
})

test('generator identity is persisted before Apply and temporary NOT_FOUND never proves output unchanged',async()=>{
 let raw:string|null=null,sends=0
 const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value}}).scope('alice')
 const {controller}=setup({observations,send:async()=>{sends++;assert.equal(observations.list()[0]?.key,'key-1');throw new TypeError('lost')},get:async()=>{throw Object.assign(Error('not visible'),{status:404})}})
 await controller.configure('e1',configuration());assert.equal(sends,1)
 assert.equal(controller.state().channels[1].phase,'unknown');assert.equal(observations.list()[0]?.status,'unknown')
 await controller.reconcile(1);assert.equal(controller.state().channels[1].phase,'unknown')
 await controller.forget(1);assert.equal(sends,1);assert.deepEqual(observations.list(),[])
})

test('multiple restored generator records on the same channel remain observable without replay',async()=>{
 let raw:string|null=null
 const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value}}).scope('alice')
 for(const key of ['first','second'])observations.begin({kind:'generator',key,experimentId:'e1',channel:1})
 const {controller,calls}=setup({observations})
 assert.equal(controller.state().channels[1].operationKey,'first')
 await controller.reconcile(1);assert.equal(controller.state().channels[1].operationKey,'second')
 await controller.reconcile(1);assert.equal(controller.state().channels[1].phase,'applied')
 assert.deepEqual(calls.map(call=>call.kind),['get','get']);assert.deepEqual(observations.list(),[])
})

test('browser storage failure prevents an untracked generator Apply before any send',async()=>{
 let sends=0
 const observations=new PendingObservationLedger({read:()=>null,write:()=>{throw Error('quota')}}).scope('alice')
 const {controller}=setup({observations,send:async()=>{sends++;return record(configuration())}})
 await assert.rejects(controller.configure('e1',configuration()),/tracking|storage/i)
 assert.equal(sends,0);assert.equal(controller.state().channels[1].phase,'failed')
})

test('Apply waits for the exclusive storage transaction and cancellation during its wait sends nothing',async()=>{
 for(const cancelled of [false,true]){
  let raw:string|null=null,sends=0,queued=false
  const gate=deferred<void>()
  const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value},transaction:async action=>{queued=true;await gate.promise;action()}}).scope('alice')
  const {controller}=setup({observations,send:async(_id,config,key)=>{sends++;assert.equal(observations.list()[0]?.key,key);return record(config,'APPLIED',key)}})
  const request=controller.configure('e1',configuration())
  for(let step=0;step<20&&!queued;step++)await Promise.resolve()
  assert.equal(queued,true);assert.equal(sends,0);assert.equal(raw,null)
  if(cancelled)controller.cancel()
  gate.resolve();await request;assert.equal(sends,cancelled?0:1)
 }
})
