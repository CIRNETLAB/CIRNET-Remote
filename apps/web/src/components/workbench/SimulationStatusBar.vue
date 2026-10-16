<script setup lang="ts">
import { useCircuitStore } from '../../stores/circuit'
import { useStationStore } from '../../stores/station'
import { useExperimentStore } from '../../stores/experiment'
import { useUiStore } from '../../stores/ui'
import { useWorkspaceStore } from '../../stores/workspace'
import HardwareStatus from '../HardwareStatus.vue'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { nextTick, computed,onBeforeUnmount,ref,watch } from 'vue'
import { useInstrumentStore } from '../../stores/instrument'
import { useProjectStore } from '../../stores/projects'
import { useAuthStore } from '../../stores/auth'
import type {PreRunConfiguration} from '../../application/instruments/configuration'
import type { CircuitGraph } from '../../types/circuit'
import { ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } from '../../config/workbenchViewport'
const circuit = useCircuitStore(), station = useStationStore(), experiment = useExperimentStore(), ui = useUiStore()
const workspace = useWorkspaceStore()
const instrument=useInstrumentStore()
const projects=useProjectStore()
const auth=useAuthStore(),preparing=ref(false),configurationVersion=ref(0)
watch(()=>[instrument.requestedInputErrors,instrument.captureDurationNs,instrument.captureSignals,instrument.captureMaxEvents,instrument.clockDraft,instrument.triggerDraft,instrument.generator,instrument.generatorEnabled,instrument.generatorPlanChannels,instrument.testVectors],()=>{configurationVersion.value++},{deep:true,flush:'sync'})
let disposed=false
onBeforeUnmount(()=>{disposed=true})
const canRun=computed(()=>!preparing.value&&!auth.pending&&station.canExecute&&!experiment.busy&&(station.mode==='simulation'?!!circuit.graph:!!experiment.assignmentId))
async function run() {
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
  preparing.value=true
  try{
    if(mode==='simulation'&&graph?.schema_version==='1.1'){
      try{await circuit.evaluatePhysical()}
      catch(error){if(current())workspace.editError=error instanceof Error?error.message:'Physical simulation failed.';return false}
    }
    if(!current())return false
    preparing.value=false
    return await experiment.run(graph,target,capture,reference,configuration)
  }finally{
    preparing.value=false
  }
}
async function stop(){if(preparing.value)experiment.cancelPending();await experiment.stop()}
function zoomToArea() {
  workspace.toggleZoomArea()
  if (workspace.zoomAreaActive) void nextTick(() => document.querySelector<HTMLCanvasElement>('canvas[aria-label="Three-dimensional circuit workspace"]')?.focus())
}
function marqueeSelect() {
  workspace.toggleMarquee()
  if (workspace.marqueeActive) void nextTick(() => document.querySelector<HTMLCanvasElement>('canvas[aria-label="Three-dimensional circuit workspace"]')?.focus())
}
</script>
<template>
  <footer class="simulation-statusbar" aria-label="Simulation status">
    <div class="execution-buttons" role="toolbar" aria-label="Simulation controls"><button :disabled="!canRun" aria-label="Run" :title="canRun ? 'Run through the laboratory lifecycle' : experiment.error || 'Select an available station and assignment when required'" @click="run"><WorkbenchIcon name="play" />Run</button><button :disabled="!preparing&&!experiment.canStop" title="Cancel a pending Run or stop the active or queued experiment" aria-label="Stop" @click="stop"><WorkbenchIcon name="stop" /></button><button disabled title="Step is not supported by the current execution contract"><WorkbenchIcon name="step" />Step</button></div>
    <span class="simulation-state" :title="experiment.error || experiment.currentExecution?.error_code || 'Owned experiment lifecycle'">{{ experiment.pending ? 'Submitting' : experiment.executionState === 'idle' ? 'Stopped' : experiment.executionState }}<small>{{ experiment.currentExecution?.queue_position ? 'Queue ' + experiment.currentExecution.queue_position : experiment.currentExecution?.execution_decision?.decision || 'Ready when connected' }}</small></span>
    <button class="mode-control" @click="ui.openWindow('inspector')" title="Change execution target in Inspector">Mode: {{ station.mode === 'simulation' ? 'Simulation' : 'Hardware' }}</button>
    <div class="verification-status" aria-label="Independent laboratory verification"><span>SAFETY <b>{{ experiment.active?.safety_verification?.status ?? '—' }}</b></span><span>TOPOLOGY <b>{{ experiment.active?.topology_verification?.status ?? '—' }}</b></span><span>FUNCTION <b>{{ experiment.active?.functional_verification?.status ?? '—' }}</b></span></div>
    <span class="count-status">Components <b>{{ circuit.graph?.modules.length ?? 0 }}</b><span>Wires <b>{{ circuit.graph?.connections.length ?? 0 }}</b></span></span>
    <div class="connection-status"><HardwareStatus /><button @click="ui.openWindow('inspector')" :class="{ connected: ui.connectionState === 'connected' }" :title="station.error || 'Backend event connection'"><i />{{ ui.connectionState }}</button></div>
    <div class="status-viewport-tools" role="toolbar" aria-label="Workspace view controls">
      <label class="snap-toggle" title="Workspace Object Snap: align placement and movement to 0.5-unit spacing, dock modular breadboards and snap gizmo rotation to 15 degrees."><input v-model="workspace.snap" type="checkbox" aria-label="Workspace Object Snap" aria-describedby="workspace-snap-help" />Object Snap</label>
      <button aria-label="Zoom Out" title="Zoom Out" :disabled="workspace.zoom <= ZOOM_MIN" @click="workspace.setZoom(workspace.zoom - ZOOM_STEP)"><WorkbenchIcon name="minus" /></button>
      <output aria-label="Workspace magnification">{{ workspace.zoom }}%</output>
      <button aria-label="Zoom In" title="Zoom In" :disabled="workspace.zoom >= ZOOM_MAX" @click="workspace.setZoom(workspace.zoom + ZOOM_STEP)"><WorkbenchIcon name="plus" /></button>
      <button aria-label="Marquee Select" title="Marquee Select" :aria-pressed="workspace.marqueeActive" @click="marqueeSelect"><WorkbenchIcon name="marquee-select" /></button>
      <button aria-label="Zoom To View Entire Circuit" title="Zoom To View Entire Circuit" :disabled="!circuit.graph?.modules.length" @click="workspace.fitEntireCircuit()"><WorkbenchIcon name="reset" /></button>
      <button aria-label="Zoom To Area" title="Zoom To Area" :aria-pressed="workspace.zoomAreaActive" @click="zoomToArea"><WorkbenchIcon name="zoom-area" /></button>
    </div>
    <span id="workspace-snap-help" class="visually-hidden">Workspace Object Snap aligns placement and movement to 0.5-unit spacing, docks modular breadboards during free movement and snaps gizmo rotation to 15 degrees. Turn off for fine positioning and continuous rotation.</span>
  </footer>
</template>
