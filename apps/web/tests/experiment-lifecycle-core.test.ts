import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ExperimentLifecycleController,type ExperimentLifecyclePorts } from '../src/application/experimentLifecycle'
import type { ExperimentRecord,OperationRecord } from '../src/contracts/generated/dto'
import {PendingObservationLedger} from '../src/application/operations/pendingObservations'

const body={station_id:'v1',circuit_graph:{schema_version:'1.0' as const,circuit_id:'local',modules:[],connections:[]}}
const record=(state:ExperimentRecord['state']='CREATED',revision=0):ExperimentRecord=>({schema_version:'1.0',experiment_id:'e1',circuit_id:'local',station_id:'v1',assignment_id:null,mode:'simulation',state,state_history:['CREATED',...(state==='CREATED'?[]:[state])],revision,execution_decision:null,safety_verification:null,topology_verification:null,functional_verification:{schema_version:'1.0',status:'NOT_EVALUATED',issues:[]},capture:null,error_code:null,queue_position:null,lease_expires_at:state==='RUNNING'?100:null})
const applied=(key:string,kind:OperationRecord['kind']='create',experiment=record()):OperationRecord=>({schema_version:'1.0',operation_key:key,kind,status:'APPLIED',experiment_id:'e1',error_code:null,revision:1,experiment})
function fixture(overrides:Partial<ExperimentLifecyclePorts>={}){
  let owned:ExperimentRecord|null=null,serial=0
  const received:ExperimentRecord[]=[]
  const ports:ExperimentLifecyclePorts={create:async()=>record(),run:async()=>record('RUNNING',4),stop:async()=>record('COMPLETE',8),get:async()=>record(),operation:async key=>applied(key),owned:()=>owned,receive:value=>{owned=value;received.push(value)},changed:()=>{},key:()=>`key-${++serial}`,wait:async()=>{},...overrides}
  return {controller:new ExperimentLifecycleController(ports),received}
}

test('aborted reconciliation releases single-flight ownership and a later read resolves the same unknown identity without replay',async()=>{
  let queries=0,creates=0,runs=0,finish!:(operation:OperationRecord)=>void
  const pending=new Promise<OperationRecord>(resolve=>{finish=resolve})
  const {controller,received}=fixture({create:async()=>{creates++;throw new TypeError('lost')},run:async()=>{runs++;return record('RUNNING',4)},operation:async key=>{queries++;if(queries<=3)throw Object.assign(new Error('not committed'),{status:404});return queries===4?pending:applied(key)}})
  assert.equal(await controller.run(body),false);assert.equal(queries,3);assert.equal(controller.state().unresolved,true)
  const request=new AbortController(),first=controller.reconcile(request.signal)
  await controller.reconcile();assert.equal(queries,4,'concurrent reconciliation must not duplicate the operation read')
  request.abort();finish(applied('key-1'));await first;assert.equal(received.length,0)
  await controller.reconcile();assert.equal(queries,5);assert.equal(received[0]?.experiment_id,'e1')
  assert.equal(controller.state().unresolved,false);assert.equal(creates,1);assert.equal(runs,0)
})

test('an unreadable successful mutation reply still recovers its durable acknowledgement',async()=>{
  let creates=0,queries=0,runs=0
  const {controller}=fixture({create:async()=>{creates++;throw Object.assign(new Error('invalid JSON'),{status:200,code:'INVALID_RESPONSE'})},operation:async key=>{queries++;return applied(key)},run:async()=>{runs++;return record('RUNNING',4)}})
  assert.equal(await controller.run(body),true);assert.equal(creates,1);assert.equal(queries,1);assert.equal(runs,1)
  assert.equal(controller.state().controlledExperimentId,'e1')
})

test('reload reconciles persisted unknown Run by reads without replay or restoring control authority',async()=>{
  let raw:string|null=null,creates=0,runs=0,queries=0
  const ledger=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value}}),observations=ledger.scope('alice')
  observations.begin({kind:'run',key:'old-run',experimentId:'e1'});observations.unknown('old-run')
  const {controller,received}=fixture({observations,create:async()=>{creates++;return record()},run:async()=>{runs++;return record('RUNNING',4)},
    operation:async key=>{queries++;return applied(key,'run',record('RUNNING',4))}})
  assert.equal(controller.state().unresolved,true);assert.equal(await controller.run(body),false)
  await controller.reconcile();assert.equal(queries,1);assert.equal(received[0]?.state,'RUNNING')
  assert.equal(controller.state().controlledExperimentId,null);assert.equal(controller.state().unresolved,false)
  assert.equal(creates,0);assert.equal(runs,0);assert.deepEqual(observations.list(),[])
})

test('tracking is written before mutation and storage failure prevents untracked dispatch',async()=>{
  const calls:string[]=[],ledger=new PendingObservationLedger({read:()=>null,write:()=>{calls.push('write');throw Error('quota')}})
  const {controller}=fixture({observations:ledger.scope('alice'),create:async()=>{calls.push('create');return record()}})
  assert.equal(await controller.run(body),false);assert.deepEqual(calls,['write'])
  assert.match(controller.state().error??'',/tracking|storage/i)
})

test('unknown ledger identities survive NOT_FOUND, and forgetting only removes browser tracking',async()=>{
  let raw:string|null=null,queries=0,mutations=0
  const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value}}).scope('alice')
  observations.begin({kind:'create',key:'old-create'})
  const {controller}=fixture({observations,operation:async()=>{queries++;throw Object.assign(Error('not visible'),{status:404})},
    create:async()=>{mutations++;return record()},run:async()=>{mutations++;return record('RUNNING')}})
  await controller.reconcile();assert.equal(queries,3);assert.equal(controller.state().unresolved,true)
  assert.equal(observations.list()[0]?.key,'old-create')
  await controller.forgetPending();assert.deepEqual(observations.list(),[]);assert.equal(controller.state().unresolved,false);assert.equal(mutations,0)
})

test('explicit Stop remains available when browser tracking cannot be written',async()=>{
  let stops=0
  const observations=new PendingObservationLedger({read:()=>null,write:()=>{throw Error('quota')}}).scope('alice')
  const {controller}=fixture({observations,owned:()=>record('RUNNING',4),stop:async()=>{stops++;return record('COMPLETE',8)}})
  await controller.stop();assert.equal(stops,1);assert.equal(controller.state().controlledExperimentId,null)
  assert.match(controller.state().error??'',/tracking|storage/i)
})

test('logout cancellation fences a late mutation ACK and preserves its identity only in the old principal ledger',async()=>{
  let raw:string|null=null,finish!:(record:ExperimentRecord)=>void
  const ledger=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value}}),observations=ledger.scope('alice')
  const {controller,received}=fixture({observations,create:async()=>new Promise(resolve=>{finish=resolve})})
  const request=controller.run(body);assert.equal(observations.list()[0]?.key,'key-1')
  controller.cancel();finish(record());assert.equal(await request,false);assert.deepEqual(received,[])
  assert.deepEqual(ledger.scope('bob').list(),[]);assert.equal(observations.list()[0]?.key,'key-1')
})

test('Create waits for the storage transaction and cancellation while queued never dispatches intent',async()=>{
  let raw:string|null=null,release!:()=>void,creates=0
  const locked=new Promise<void>(resolve=>{release=resolve})
  const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value},transaction:async action=>{await locked;action()}}).scope('alice')
  const {controller,received}=fixture({observations,create:async()=>{creates++;assert.equal(observations.list()[0]?.kind,'create');return record()}})
  const request=controller.run(body)
  assert.equal(creates,0);assert.equal(raw,null)
  controller.cancel();release();assert.equal(await request,false)
  assert.equal(creates,0);assert.deepEqual(received,[])
})

test('async tracking failures are observed and explicit Stop remains available',async()=>{
  let stops=0
  const observations=new PendingObservationLedger({read:()=>null,write:()=>{},transaction:async()=>{throw Error('Web Locks unavailable for operation tracking')}}).scope('alice')
  const blocked=fixture({observations,create:async()=>{throw Error('must not dispatch')}}).controller
  assert.equal(await blocked.run(body),false);assert.match(blocked.state().error??'',/Web Locks/)
  const {controller}=fixture({observations,owned:()=>record('RUNNING',4),stop:async()=>{stops++;return record('COMPLETE',8)}})
  await controller.stop();assert.equal(stops,1);assert.match(controller.state().error??'',/Web Locks/)
})

test('Run waits for its own committed identity after Create acknowledgement',async()=>{
 let raw:string|null=null,creates=0,runs=0
 const queue:Array<()=>void>=[]
 const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value},transaction:action=>new Promise<void>((resolve,reject)=>queue.push(()=>{try{action();resolve()}catch(error){reject(error)}}))}).scope('alice')
 const {controller}=fixture({observations,create:async()=>{creates++;return record()},run:async()=>{runs++;assert.equal(observations.list()[0]?.kind,'run');return record('RUNNING',4)}})
 const request=controller.run(body)
 const grant=async()=>{for(let turn=0;turn<30&&!queue.length;turn++)await Promise.resolve();assert.equal(queue.length,1);queue.shift()!()}
 assert.equal(creates,0);await grant()
 await grant();assert.equal(creates,1);assert.equal(runs,0)
 for(let turn=0;turn<30&&!queue.length;turn++)await Promise.resolve()
 assert.equal(runs,0);assert.deepEqual(observations.list(),[])
 await grant();await grant();assert.equal(await request,true);assert.equal(runs,1)
})

test('a lock held by another tab cannot delay explicit Stop or its acknowledged completion',async()=>{
 let stops=0,queued=0,tries=0
 const observations=new PendingObservationLedger({read:()=>null,write:()=>{},transaction:(_action,options)=>{
  if(options?.ifAvailable){tries++;return Promise.reject(Error('Operation tracking lock is unavailable'))}
  queued++;return new Promise<void>(()=>{})
 }}).scope('alice')
 const {controller}=fixture({observations,owned:()=>record('RUNNING',4),stop:async()=>{stops++;return record('COMPLETE',8)}})
 const stop=controller.stop()
 for(let turn=0;turn<30;turn++)await Promise.resolve()
 assert.equal(stops,1,'the Stop HTTP call cannot wait for a different tab to release its storage lock')
 assert.equal(controller.state().pending,false,'acknowledged Stop cannot remain pending behind tracking cleanup')
 await stop;assert.equal(queued,0);assert.equal(tries,2);assert.match(controller.state().error??'',/tracking lock/)
})

test('Stop intent fences a queued Run even when Stop fails or its acknowledgement remains unknown',async()=>{
 for(const failure of [Object.assign(Error('denied'),{status:403}),new TypeError('lost Stop response')]){
  let raw:string|null=null,writes=0,queued=false,runs=0,release!:()=>void
  const held=new Promise<void>(resolve=>{release=resolve})
  const observations=new PendingObservationLedger({read:()=>raw,write:value=>{raw=value},transaction:async(action,options)=>{
   if(options?.ifAvailable)throw Error('Tracking lock unavailable')
   if(++writes===3){queued=true;await held}action()
  }}).scope('alice')
  const {controller}=fixture({observations,run:async()=>{runs++;return record('RUNNING',4)},stop:async()=>{throw failure},operation:async()=>{throw Object.assign(Error('not observed'),{status:404})}})
  const request=controller.run(body)
  for(let turn=0;turn<50&&!queued;turn++)await Promise.resolve()
  assert.equal(queued,true);assert.equal(runs,0)
  await controller.stop();release();assert.equal(await request,false)
  assert.equal(runs,0,'a failed or unknown Stop must never allow older queued Run intent to dispatch')
 }
})
