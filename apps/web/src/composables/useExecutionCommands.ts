import { computed,inject,onBeforeUnmount,provide,ref,watch,type InjectionKey } from 'vue'
import { useCircuitStore } from '../stores/circuit'
import { useStationStore } from '../stores/station'
import { useExperimentStore } from '../stores/experiment'
import { useInstrumentStore } from '../stores/instrument'
import { useProjectStore } from '../stores/projects'
import { useAuthStore } from '../stores/auth'
import { useWorkspaceStore } from '../stores/workspace'
import type { PreRunConfiguration } from '../application/instruments/configuration'
import type { CircuitGraph } from '../types/circuit'

/** One instance belongs to the workspace shell. Ribbon visibility never owns
 * preflight, the preparation latch or an in-flight Create acknowledgement. */
function createExecutionCommands(){
  const circuit=useCircuitStore(),station=useStationStore(),experiment=useExperimentStore()
  const instrument=useInstrumentStore(),projects=useProjectStore(),auth=useAuthStore(),workspace=useWorkspaceStore()
  const preparing=ref(false),cancelRequested=ref(false),configurationVersion=ref(0)
  let disposed=false
  watch(()=>[instrument.requestedInputErrors,instrument.captureDurationNs,instrument.captureSignals,instrument.captureMaxEvents,instrument.clockDraft,instrument.triggerDraft,instrument.generator,instrument.generatorEnabled,instrument.generatorPlanChannels,instrument.testVectors],()=>{configurationVersion.value++},{deep:true,flush:'sync'})
  onBeforeUnmount(()=>{disposed=true})
  const canRun=computed(()=>!preparing.value&&!auth.pending&&station.canExecute&&!experiment.busy&&(station.mode==='simulation'?!!circuit.graph:!!experiment.assignmentId))
  const primaryLabel=computed(()=>preparing.value?'Cancel':experiment.canStop?'Stop':'Run')
  const primaryDisabled=computed(()=>preparing.value?cancelRequested.value:experiment.canStop?false:!canRun.value)
  const blockedReason=computed(()=>auth.pending?'Checking the current account.':experiment.error||station.error||'Select an available station and assignment when required.')
  async function run(){
    if(disposed||preparing.value||!canRun.value)return false
    const epoch=auth.connectionEpoch,principal=auth.principal?.principal_id,requestVersion=experiment.requestVersion
    const draft=circuit.activeId,revision=circuit.documentRevision,mode=station.mode,target=station.executionTarget,assignment=experiment.assignmentId
    const graph:CircuitGraph|null=circuit.graph?JSON.parse(JSON.stringify(circuit.graph)):null
    let configuration:PreRunConfiguration
    try{configuration=instrument.preRunConfiguration(target!.capabilities!)}
    catch(error){workspace.editError=error instanceof Error?error.message:'Instrument configuration is invalid.';return false}
    const capture=configuration.capture_config,configurationRevision=configurationVersion.value,reference=projects.controller().currentSavedReference()
    const current=()=>!disposed&&!auth.pending&&epoch===auth.connectionEpoch&&principal===auth.principal?.principal_id
      &&configurationRevision===configurationVersion.value&&requestVersion===experiment.requestVersion&&draft===circuit.activeId&&revision===circuit.documentRevision
      &&mode===station.mode&&target?.station_id===station.executionTarget?.station_id&&assignment===experiment.assignmentId
      &&capture.duration_ns===instrument.captureDurationNs&&capture.signals.length===instrument.captureSignals.length
      &&capture.signals.every((signal,index)=>signal===instrument.captureSignals[index])&&station.canExecute&&!experiment.busy
    preparing.value=true;cancelRequested.value=false
    try{
      if(mode==='simulation'&&graph?.schema_version==='1.1'){
        try{await circuit.evaluatePhysical()}
        catch(error){if(current())workspace.editError=error instanceof Error?error.message:'Physical simulation failed.';return false}
      }
      if(!current())return false
      preparing.value=false
      return await experiment.run(graph,target,capture,reference,configuration)
    }finally{preparing.value=false;cancelRequested.value=false}
  }
  async function stop(){
    if(disposed)return
    if(preparing.value){
      if(!cancelRequested.value){cancelRequested.value=true;experiment.cancelPending()}
      return
    }
    // Once Create is sent the existing lifecycle must receive/reconcile its
    // identity and stop that owned execution; never abort or replay Create.
    await experiment.stop()
  }
  async function primaryAction(){return primaryLabel.value==='Run'?run():stop()}
  return {preparing,canRun,primaryLabel,primaryDisabled,blockedReason,run,stop,primaryAction}
}
export type ExecutionCommands=ReturnType<typeof createExecutionCommands>
const commandsKey=Symbol.for('netcircuit:workspace-execution') as InjectionKey<ExecutionCommands>
export function provideExecutionCommands():ExecutionCommands {
  const commands=createExecutionCommands();provide(commandsKey,commands);return commands
}
export function useExecutionCommands():ExecutionCommands {
  const commands=inject(commandsKey)
  if(!commands)throw new Error('Run controls require the workspace shell execution owner.')
  return commands
}
