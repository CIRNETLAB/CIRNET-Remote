import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ExperimentLifecycleController,type ExperimentLifecyclePorts } from '../src/application/experimentLifecycle'
import type { ExperimentRecord,OperationRecord } from '../src/contracts/generated/dto'

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
