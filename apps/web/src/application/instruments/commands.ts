import type {GeneratorConfiguration,InstrumentCommandRecord,InstrumentControlAccess} from '../../contracts/generated/dto'
import type {Experiment} from '../../types/experiment'
import type {StationDescriptor} from '../../types/station'
import {generatorConfigurationIssue,runtimeGeneratorIssue} from '../../types/station'
import {parseLab} from '../../contracts/validation'

export interface InstrumentCommandPorts {
 context():{experiment:Experiment|null;controlledExperimentId:string|null;target:StationDescriptor|null;connected:boolean}
 access(id:string,signal:AbortSignal):Promise<InstrumentControlAccess>
 send(id:string,configuration:GeneratorConfiguration,key:string,signal:AbortSignal):Promise<InstrumentCommandRecord>
 get(id:string,key:string,signal:AbortSignal):Promise<InstrumentCommandRecord>
 key():string
 changed?(state:InstrumentCommandState):void
}
export interface GeneratorCommandState {
 phase:'idle'|'pending'|'unknown'|'accepted'|'applied'|'failed'
 pending:boolean
 operationKey:string|null
 experimentId:string|null
 command:InstrumentCommandRecord|null
 lastAcknowledged:InstrumentCommandRecord|null
 requestedConfiguration:GeneratorConfiguration|null
 error:string|null
}
export interface InstrumentCommandState {access:InstrumentControlAccess|null;accessLoading:boolean;accessError:string|null;channels:Record<1|2,GeneratorCommandState>}
const channelState=():GeneratorCommandState=>({phase:'idle',pending:false,operationKey:null,experimentId:null,command:null,lastAcknowledged:null,requestedConfiguration:null,error:null})
export const initialInstrumentCommandState=():InstrumentCommandState=>({access:null,accessLoading:false,accessError:null,channels:{1:channelState(),2:channelState()}})
const message=(error:unknown)=>error instanceof Error?error.message:'Instrument command failed.'
function uncertain(error:unknown){const detail=error as {status?:unknown;code?:unknown}|null;return !detail||detail.code==='INVALID_RESPONSE'||typeof detail.status!=='number'||detail.status===0||detail.status>=500}
function snapshot<T>(value:T):T{const cloned=JSON.parse(JSON.stringify(value)) as T;const freeze=(node:unknown)=>{if(node&&typeof node==='object'){Object.values(node).forEach(freeze);Object.freeze(node)}};freeze(cloned);return cloned}
const configurationKey=(value:GeneratorConfiguration)=>JSON.stringify([value.channel,value.waveform,value.frequency_hz,value.amplitude_vpp,value.offset_v,value.phase_degrees??null,value.enabled])

/** Durable command identities survive lost responses. Recovery reads never resend output intent. */
export class InstrumentCommandController {
 private generation=0
 private controller=new AbortController()
 private accessVersion=0
 private value=initialInstrumentCommandState()
 constructor(private readonly ports:InstrumentCommandPorts){}
 state():InstrumentCommandState{return {...this.value,channels:{1:{...this.value.channels[1]},2:{...this.value.channels[2]}}}}
 private emit(){this.ports.changed?.(this.state())}
 private current(generation:number){return generation===this.generation&&!this.controller.signal.aborted}
 private assertLive(id:string,configuration:GeneratorConfiguration){
  const context=this.ports.context(),experiment=context.experiment
  if(!experiment||experiment.experiment_id!==id||context.controlledExperimentId!==id)throw new Error('Live control requires an acknowledged Run in this tab.')
  const issue=runtimeGeneratorIssue(context.target,experiment,configuration.channel,context.connected);if(issue)throw new Error(issue)
  if(experiment.lease_expires_at===null)throw new Error('The running experiment has no active lease.')
  const profileIssue=generatorConfigurationIssue(context.target!.capabilities!.instrument_capabilities.generator,configuration);if(profileIssue)throw new Error(profileIssue)
  return context
 }
 async refreshAccess(id:string):Promise<InstrumentControlAccess|null>{
  const generation=this.generation,version=++this.accessVersion,signal=this.controller.signal
  this.value.accessLoading=true;this.value.accessError=null;this.emit()
  try{
   const access=parseLab('InstrumentControlAccess',await this.ports.access(id,signal))
   if(!this.current(generation)||version!==this.accessVersion)return null
   if(access.experiment_id!==id)throw new Error('Instrument access identity does not match the requested experiment.')
   this.value.access=snapshot(access);return this.value.access
  }catch(error){if(this.current(generation)&&version===this.accessVersion){this.value.access=null;this.value.accessError=message(error)}return null}
  finally{if(this.current(generation)&&version===this.accessVersion){this.value.accessLoading=false;this.emit()}}
 }
 private accept(channel:1|2,record:InstrumentCommandRecord,key:string,id:string,configuration?:GeneratorConfiguration){
  parseLab('InstrumentCommandRecord',record)
  if(record.experiment_id!==id||record.operation_key!==key||record.configuration.channel!==channel
   ||configuration&&configurationKey(record.configuration)!==configurationKey(configuration))throw Object.assign(new Error('Instrument acknowledgement does not match the submitted command.'),{code:'INVALID_RESPONSE'})
  const state=this.value.channels[channel]
  if(state.command?.operation_key===key&&(state.command.revision>record.revision||state.command.status==='APPLIED'&&state.command.revision>=record.revision))return
  const command=snapshot(record);state.command=command;state.operationKey=key;state.experimentId=id
  if(command.status==='APPLIED'){state.phase='applied';state.lastAcknowledged=command;state.error=null}
  else if(command.status==='ACCEPTED'){state.phase='accepted';state.lastAcknowledged=command;state.error=null}
  else if(command.status==='FAILED'){state.phase='failed';state.error=command.error_code??'The driver rejected the command.'}
  else {state.phase='unknown';state.error='Acknowledgement is unknown. Output may have changed; refresh this command or Stop before another Apply.'}
 }
 async configure(id:string,draft:GeneratorConfiguration):Promise<InstrumentCommandRecord|null>{
  const validated=parseLab('GeneratorConfiguration',draft),configuration=snapshot(validated),channel=configuration.channel,state=this.value.channels[channel]
  if(Object.values(this.value.channels).some(value=>value.pending||value.phase==='unknown'))return null
  this.assertLive(id,configuration)
  const generation=this.generation,signal=this.controller.signal
  state.pending=true;state.phase='pending';state.error=null;this.emit()
  let key:string|null=null
  try{
   const access=await this.refreshAccess(id)
   if(!this.current(generation))return null
   const context=this.assertLive(id,configuration)
   if(!access)throw new Error(this.value.accessError??'Instrument access is unavailable.')
   if(!access.can_configure_generator||access.reason!=='READY'||!access.generator_channels.includes(channel))throw new Error(`Generator channel is not allocated for live control (${access.reason}).`)
   if(access.revision!==context.experiment!.revision)throw new Error('Execution changed while instrument access was checked. Refresh access before applying.')
   key=this.ports.key();state.operationKey=key;state.experimentId=id;state.command=null;state.requestedConfiguration=configuration
   const record=await this.ports.send(id,configuration,key,signal)
   if(!this.current(generation))return null
   this.accept(channel,record,key,id,configuration);return record
  }catch(error){
   if(!this.current(generation))return null
   if(key&&uncertain(error)){
    state.phase='unknown';state.error='Acknowledgement is unknown. Output may have changed; no command will be replayed.';this.emit()
    try{const record=await this.ports.get(id,key,signal);if(!this.current(generation))return null;this.accept(channel,record,key,id,configuration);return record}
    catch(readError){if(this.current(generation))state.error=`Acknowledgement is unknown: ${message(readError)}. No command was replayed.`;return null}
   }
   state.phase='failed';state.error=message(error);throw error
  }finally{if(this.current(generation)){state.pending=false;this.emit()}}
 }
 async reconcile(channel:1|2):Promise<InstrumentCommandRecord|null>{
  const state=this.value.channels[channel],key=state.operationKey,id=state.experimentId
  if(state.pending||!key||!id)return null
  const generation=this.generation,signal=this.controller.signal;state.pending=true;this.emit()
  try{const record=await this.ports.get(id,key,signal);if(!this.current(generation))return null;this.accept(channel,record,key,id,state.requestedConfiguration??undefined);return record}
  catch(error){if(this.current(generation))state.error=`Cannot refresh the command: ${message(error)}. No command was replayed.`;return null}
  finally{if(this.current(generation)){state.pending=false;this.emit()}}
 }
 cancel(){this.generation++;this.accessVersion++;this.controller.abort();this.controller=new AbortController();this.value=initialInstrumentCommandState();this.emit()}
}
