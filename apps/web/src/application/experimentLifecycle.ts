import type { ExperimentCreateV2 as ExperimentCreate,ExperimentRecord,OperationRecord } from '../contracts/generated/dto'

export const isReleasedExperiment=(record:ExperimentRecord|null)=>!record||(['COMPLETE','FAULT'].includes(record.state)&&record.lease_expires_at===null)
type Kind='create'|'run'|'stop'
interface Identity {kind:Kind;key:string;id?:string}
export interface ExperimentLifecycleState {
  pending:boolean
  requestStatus:'idle'|'creating'|'starting'|'stopping'|'reconciling'|'unknown'
  controlledExperimentId:string|null
  unresolved:boolean
  error:string|null
}
export interface ExperimentLifecyclePorts {
  create(body:ExperimentCreate,signal:AbortSignal,key:string):Promise<ExperimentRecord>
  run(id:string,signal:AbortSignal,key:string):Promise<ExperimentRecord>
  stop(id:string,signal:AbortSignal,key:string):Promise<ExperimentRecord>
  operation(key:string,query:{kind:Kind;experiment_id?:string},signal:AbortSignal):Promise<OperationRecord>
  get(id:string,signal:AbortSignal):Promise<ExperimentRecord>
  owned():ExperimentRecord|null
  receive(record:ExperimentRecord,select:boolean):void
  changed(state:ExperimentLifecycleState):void
  key():string
  wait?:(milliseconds:number,signal:AbortSignal)=>Promise<void>
}
const message=(error:unknown)=>error instanceof Error?error.message:'The experiment operation failed.'
function uncertain(error:unknown){
  const detail=error as {status?:unknown;code?:unknown}|null
  return error instanceof TypeError||!detail||detail.code==='INVALID_RESPONSE'||detail.status===0||typeof detail.status!=='number'||detail.status>=500
}
function pause(milliseconds:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(new Error('Request cancelled.'))}
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},milliseconds)
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
})}

/** Local request intent and server evidence are separate; only reads recover lost ACKs. */
export class ExperimentLifecycleController {
  private generation=0
  private controller=new AbortController()
  private workflow=false
  private stopTask:Promise<void>|null=null
  private stopRequested=false
  private stopped=new Set<string>()
  private unknown=new Map<string,Identity>()
  private disposed=false
  private reconciling=false
  private value:ExperimentLifecycleState={pending:false,requestStatus:'idle',controlledExperimentId:null,unresolved:false,error:null}
  constructor(private readonly ports:ExperimentLifecyclePorts){}
  state(){return {...this.value}}
  private emit(){this.value.pending=this.workflow||this.stopTask!==null;this.value.unresolved=this.unknown.size>0;this.ports.changed(this.state())}
  private current(generation:number){return !this.disposed&&generation===this.generation&&!this.controller.signal.aborted}
  private async recover(identity:Identity,signal:AbortSignal):Promise<ExperimentRecord|null>{
    for(let attempt=0;attempt<3&&!signal.aborted;attempt++){
      if(attempt)await (this.ports.wait??pause)(150*2**(attempt-1),signal)
      try{
        const operation=await this.ports.operation(identity.key,{kind:identity.kind,...(identity.id?{experiment_id:identity.id}:{})},signal)
        if(operation.status==='FAILED')throw Object.assign(new Error(operation.error_code??'The server rejected the operation.'),{status:409})
        if(operation.status==='ACCEPTED'||operation.status==='APPLIED'){
          if(operation.experiment)return operation.experiment
          if(operation.experiment_id)return await this.ports.get(operation.experiment_id,signal)
        }
      }catch(error){if(signal.aborted)throw error;if((error as {status?:number})?.status===409)throw error}
    }
    return null
  }
  private async invoke(identity:Identity,signal:AbortSignal,body?:ExperimentCreate):Promise<ExperimentRecord|null>{
    try{
      const record=identity.kind==='create'?await this.ports.create(body!,signal,identity.key):await this.ports[identity.kind](identity.id!,signal,identity.key)
      this.unknown.delete(identity.key);return record
    }catch(error){
      if(signal.aborted||!uncertain(error))throw error
      this.value.requestStatus='reconciling';this.emit()
      const record=await this.recover(identity,signal)
      if(record){this.unknown.delete(identity.key);return record}
      this.unknown.set(identity.key,identity);this.value.requestStatus='unknown'
      this.value.error='The server outcome is not yet known. Run is disabled while the operation is reconciled; no Run request will be replayed.'
      this.emit();return null
    }
  }
  async run(body:ExperimentCreate):Promise<boolean>{
    if(this.disposed||this.workflow||this.stopTask||this.unknown.size||!isReleasedExperiment(this.ports.owned()))return false
    const generation=++this.generation;this.controller.abort();this.controller=new AbortController()
    const signal=this.controller.signal;this.workflow=true;this.stopRequested=false;this.stopped.clear()
    this.value={pending:true,requestStatus:'creating',controlledExperimentId:null,unresolved:false,error:null};this.emit()
    try{
      const created=await this.invoke({kind:'create',key:this.ports.key()},signal,JSON.parse(JSON.stringify(body)) as ExperimentCreate)
      if(!this.current(generation)||!created)return false
      this.ports.receive(created,true)
      if(this.stopRequested){await this.stop();return false}
      this.value.requestStatus='starting';this.emit()
      const started=await this.invoke({kind:'run',key:this.ports.key(),id:created.experiment_id},signal)
      if(!this.current(generation)||!started)return false
      this.ports.receive(started,false)
      if(this.stopRequested){await this.stop();return false}
      this.value.controlledExperimentId=this.ports.owned()?.experiment_id===started.experiment_id&&!isReleasedExperiment(this.ports.owned())?started.experiment_id:null
      this.value.error=null;return true
    }catch(error){if(this.current(generation))this.value.error=message(error);return false}
    finally{if(this.current(generation)){this.workflow=false;if(!this.unknown.size&&!this.stopTask)this.value.requestStatus='idle';this.emit()}}
  }
  async stop():Promise<void>{
    if(this.disposed)return
    this.stopRequested=true;this.value.controlledExperimentId=null
    if(this.stopTask)return this.stopTask
    const record=this.ports.owned()
    if(!record||isReleasedExperiment(record)||this.stopped.has(record.experiment_id)){
      this.emit();if(!this.workflow&&this.unknown.size&&!this.reconciling)await this.reconcile();return
    }
    const generation=this.generation,signal=this.controller.signal
    this.value.requestStatus='stopping'
    const task=(async()=>{
      try{
        const stopped=await this.invoke({kind:'stop',key:this.ports.key(),id:record.experiment_id},signal)
        if(this.current(generation)&&stopped){this.stopped.add(record.experiment_id);this.ports.receive(stopped,false);this.value.error=null}
      }catch(error){if(this.current(generation))this.value.error=message(error)}
    })()
    this.stopTask=task;this.emit()
    try{await task}finally{if(this.current(generation)&&this.stopTask===task){this.stopTask=null;if(!this.unknown.size&&!this.workflow)this.value.requestStatus='idle';this.emit()}}
  }
  async reconcile(signal?:AbortSignal):Promise<void>{
    if(this.disposed||!this.unknown.size||this.workflow||this.stopTask||this.reconciling)return
    this.reconciling=true
    const generation=this.generation,currentSignal=signal??this.controller.signal
    try{
      for(const identity of [...this.unknown.values()]){
        try{
          const record=await this.recover(identity,currentSignal)
          if(!this.current(generation)||currentSignal.aborted)return
          if(!record)continue
          this.unknown.delete(identity.key);this.value.error=null;this.ports.receive(record,false)
          if(identity.kind==='run'&&!this.stopRequested&&this.ports.owned()?.experiment_id===record.experiment_id&&!isReleasedExperiment(this.ports.owned()))this.value.controlledExperimentId=record.experiment_id
          if(this.stopRequested)await this.stop()
        }catch(error){if(this.current(generation)&&!currentSignal.aborted){this.unknown.delete(identity.key);this.value.error=message(error)}}
      }
    }finally{if(this.current(generation)){this.reconciling=false;if(!this.unknown.size)this.value.requestStatus='idle';this.emit()}}
  }
  observe(record:ExperimentRecord){if(this.value.controlledExperimentId===record.experiment_id&&isReleasedExperiment(record)){this.value.controlledExperimentId=null;this.emit()}}
  cancel(){this.generation++;this.controller.abort();this.controller=new AbortController();this.workflow=false;this.stopTask=null;this.stopRequested=false;this.reconciling=false;this.unknown.clear();this.stopped.clear();this.value={pending:false,requestStatus:'idle',controlledExperimentId:null,unresolved:false,error:null};this.emit()}
  dispose(){this.cancel();this.disposed=true}
}
