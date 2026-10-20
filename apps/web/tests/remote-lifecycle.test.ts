import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { configureApiClient } from '../src/services/api/client'
import { useExperimentStore } from '../src/stores/experiment'
import { runningExperiment,stationFixture } from './helpers/station'
import { deferred } from './helpers/capture'

const graph={schema_version:'1.0' as const,circuit_id:'local',modules:[],connections:[]}
const record=(state='CREATED',revision=0)=>({...runningExperiment(),state,state_history:['CREATED',...(state==='CREATED'?[]:[state])],revision,lease_expires_at:state==='RUNNING'?100:null,capture:null})

test('selecting terminal history cannot enable Run or redirect Stop away from the owned execution',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),calls:string[]=[]
  configureApiClient({fetcher:async url=>{calls.push(String(url));return Response.json(record('COMPLETE',9))}})
  store.receive(record('RUNNING',4));store.receive({...record('COMPLETE',3),experiment_id:'history'})
  store.activeId='history'
  assert.equal(store.busy,true)
  assert.equal(await store.run(graph,stationFixture()),false)
  await store.stop();assert.deepEqual(calls,['/api/experiments/e1/stop'])
})

test('Stop during Create retains mutation identity and stops the acknowledged experiment without sending Run',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),created=deferred<Response>(),calls:{url:string;key:string|null;signal?:AbortSignal|null}[]=[]
  configureApiClient({fetcher:async(url,options)=>{
    calls.push({url:String(url),key:new Headers(options?.headers).get('Idempotency-Key'),signal:options?.signal})
    return String(url)==='/api/experiments'?created.promise:Response.json(record('COMPLETE',4))
  }})
  const pending=store.run(graph,stationFixture());await store.stop()
  assert.equal(calls[0]!.signal?.aborted,false)
  assert.ok(calls[0]!.key)
  created.resolve(Response.json(record(),{status:201}));await pending
  assert.deepEqual(calls.map(call=>call.url),['/api/experiments','/api/experiments/e1/stop'])
  assert.ok(calls[1]!.key);assert.equal(store.busy,false)
})

test('a lost Create acknowledgement is resolved by its operation key without replaying Create',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),calls:{url:string;key:string|null}[]=[]
  configureApiClient({fetcher:async(url,options)=>{
    calls.push({url:String(url),key:new Headers(options?.headers).get('Idempotency-Key')})
    if(String(url)==='/api/experiments')throw new TypeError('acknowledgement lost')
    if(String(url).startsWith('/api/operations/'))return Response.json({schema_version:'1.0',operation_key:calls[0]!.key,kind:'create',status:'APPLIED',experiment_id:'e1',error_code:null,revision:1,experiment:record()})
    return Response.json(record('RUNNING',4))
  }})
  assert.equal(await store.run(graph,stationFixture()),true)
  assert.equal(calls.filter(call=>call.url==='/api/experiments').length,1)
  assert.ok(calls.some(call=>call.url.startsWith('/api/operations/'+calls[0]!.key)))
  assert.equal(calls.filter(call=>call.url.endsWith('/run')).length,1)
})

test('a lost accepted Run acknowledgement is queried and never replays Start',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),calls:{url:string;key:string|null}[]=[]
  configureApiClient({fetcher:async(url,options)=>{
    calls.push({url:String(url),key:new Headers(options?.headers).get('Idempotency-Key')})
    if(String(url)==='/api/experiments')return Response.json(record(),{status:201})
    if(String(url).endsWith('/run'))throw new TypeError('Run acknowledgement lost')
    const run=calls.find(call=>call.url.endsWith('/run'))!
    return Response.json({schema_version:'1.0',operation_key:run.key,kind:'run',status:'ACCEPTED',experiment_id:'e1',error_code:null,revision:1,experiment:record('RUNNING',4)})
  }})
  assert.equal(await store.run(graph,stationFixture()),true)
  assert.equal(calls.filter(call=>call.url.endsWith('/run')).length,1)
  assert.equal(store.controlledExperimentId,'e1')
})

test('unknown Create remains blocked and a later Stop reconciles its identity before safe cleanup',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),calls:string[]=[]
  let visible=false,key:string|null=null
  configureApiClient({fetcher:async(url,options)=>{
    calls.push(String(url))
    if(String(url)==='/api/experiments'){key=new Headers(options?.headers).get('Idempotency-Key');throw new TypeError('lost')}
    if(String(url).startsWith('/api/operations/'))return visible?Response.json({schema_version:'1.0',operation_key:key,kind:'create',status:'APPLIED',experiment_id:'e1',error_code:null,revision:1,experiment:record()}):Response.json({code:'NOT_FOUND',message:'not committed'},{status:404})
    return Response.json(record('COMPLETE',6))
  }})
  assert.equal(await store.run(graph,stationFixture()),false)
  assert.equal(store.requestStatus,'unknown');assert.equal(store.pending,false);assert.equal(store.busy,true)
  assert.equal(await store.run(graph,stationFixture()),false)
  visible=true;await store.stop()
  assert.equal(calls.filter(url=>url==='/api/experiments').length,1)
  assert.equal(calls.filter(url=>url.endsWith('/run')).length,0)
  assert.equal(calls.filter(url=>url.endsWith('/stop')).length,1)
  assert.equal(store.busy,false)
})

test('an explicit history selection while Create is pending is not overwritten by its acknowledgement',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),created=deferred<Response>()
  configureApiClient({fetcher:async url=>String(url)==='/api/experiments'?created.promise:Response.json(record('RUNNING',4))})
  store.receive({...record('COMPLETE',9),experiment_id:'history'})
  const pending=store.run(graph,stationFixture());store.selectExperiment('history')
  created.resolve(Response.json(record(),{status:201}));assert.equal(await pending,true)
  assert.equal(store.activeId,'history');assert.equal(store.ownedActiveId,'e1');assert.equal(store.controlledExperimentId,'e1')
})

test('a reload snapshot restores owned evidence without inventing this tab live control or replacing history selection',()=>{
  setActivePinia(createPinia());const store=useExperimentStore()
  store.receive({...record('COMPLETE',9),experiment_id:'history'});store.selectExperiment('history')
  store.restoreOwned([record('RUNNING',5) as never],0)
  assert.equal(store.activeId,'history');assert.equal(store.currentExecution?.experiment_id,'e1')
  assert.equal(store.busy,true);assert.equal(store.canStop,true);assert.equal(store.controlledExperimentId,null)
  store.showCurrentExecution();assert.equal(store.activeId,'e1')
})

test('a stale Run acknowledgement cannot grant live control after a newer terminal lifecycle event',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),started=deferred<Response>()
  configureApiClient({fetcher:async url=>String(url).endsWith('/run')?started.promise:Response.json(record(),{status:201})})
  const pending=store.run(graph,stationFixture());for(let i=0;i<20&&!store.ownedActiveId;i++)await new Promise(resolve=>setTimeout(resolve,0))
  store.receive(record('COMPLETE',20));started.resolve(Response.json(record('RUNNING',4)));await pending
  assert.equal(store.active?.state,'COMPLETE');assert.equal(store.busy,false);assert.equal(store.controlledExperimentId,null)
})

test('authorized snapshot recovery restores recent history, active execution and queue without submitting mutations',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),calls:string[]=[]
  configureApiClient({fetcher:async(url,options)=>{
    assert.equal(options?.method,'GET');calls.push(String(url))
    if(String(url).includes('/history'))return Response.json({schema_version:'1.0',items:[{...record('COMPLETE',20),experiment_id:'history'}],next_cursor:null})
    if(String(url).includes('/active'))return Response.json({schema_version:'1.0',items:[record('RUNNING',4)],next_cursor:null})
    if(String(url)==='/api/experiments/e1')return Response.json(record('RUNNING',4))
    return Response.json({schema_version:'1.0',station_id:'v1',queued_count:2,busy:true,own_positions:[{experiment_id:'e1',position:1}]})
  }})
  assert.equal(typeof store.refreshHistory,'function')
  await store.refreshHistory();await store.refreshOwned();await store.refreshQueue('v1')
  assert.equal(store.history[0]?.experiment_id,'history');assert.equal(store.currentExecution?.experiment_id,'e1')
  assert.equal(store.activeId,'e1');assert.equal(store.controlledExperimentId,null);assert.equal(store.queues.v1?.own_positions[0]?.position,1)
  assert.deepEqual(calls,['/api/experiments/history?limit=50','/api/experiments/active','/api/experiments/e1','/api/stations/v1/queue'])
})

test('connection admission blocks Run until an authorized active snapshot confirms the restored owner state',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore()
  assert.equal(typeof store.requireReconciliation,'function')
  store.requireReconciliation();assert.equal(store.busy,true)
  configureApiClient({fetcher:async()=>Response.json({code:'OFFLINE',message:'offline'},{status:503})})
  await store.refreshOwned();assert.equal(store.busy,true)
  configureApiClient({fetcher:async()=>Response.json({schema_version:'1.0',items:[],next_cursor:null})})
  await store.refreshOwned();assert.equal(store.busy,false)
})

test('history arriving before the active snapshot cannot redirect Stop from an older operational run',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore(),active=deferred<Response>(),calls:string[]=[]
  configureApiClient({fetcher:async url=>{
    calls.push(String(url))
    if(String(url).includes('/history'))return Response.json({schema_version:'1.0',items:[{...record(),experiment_id:'unstarted'}],next_cursor:null})
    if(String(url).includes('/active'))return active.promise
    return Response.json(record(String(url).endsWith('/stop')?'COMPLETE':'RUNNING',10))
  }})
  const restoring=store.refreshOwned();await store.refreshHistory();store.selectExperiment('unstarted')
  const premature=store.ownedActiveId
  active.resolve(Response.json({schema_version:'1.0',items:[record('RUNNING',4),{...record(),experiment_id:'unstarted'}],next_cursor:null}));await restoring
  assert.equal(premature,null)
  store.selectExperiment('unstarted');assert.equal(store.ownedActiveId,'e1');await store.stop()
  assert.ok(calls.includes('/api/experiments/e1/stop'));assert.equal(calls.includes('/api/experiments/unstarted/stop'),false)
})

test('an unchanged CREATED record first read as history is still admitted by the owned snapshot',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore()
  configureApiClient({fetcher:async()=>Response.json({schema_version:'1.0',items:[record()],next_cursor:null})})
  await store.refreshHistory();assert.equal(store.ownedActiveId,null)
  store.restoreOwned([record() as never]);assert.equal(store.ownedActiveId,'e1');assert.equal(store.canStop,true)
})

test('refreshing selected historical evidence cannot admit that CREATED record as the owned control target',async()=>{
  setActivePinia(createPinia());const store=useExperimentStore()
  configureApiClient({fetcher:async url=>Response.json(String(url).includes('/history')?{schema_version:'1.0',items:[record()],next_cursor:null}:record('CREATED',1))})
  await store.refreshHistory();store.selectExperiment('e1');assert.equal(store.ownedActiveId,null)
  assert.equal(await store.refreshSelectedEvidence(),true)
  assert.equal(store.active?.revision,1);assert.equal(store.ownedActiveId,null);assert.equal(store.canStop,false)
})
