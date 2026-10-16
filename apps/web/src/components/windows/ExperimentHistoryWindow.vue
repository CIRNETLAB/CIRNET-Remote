<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue'
import {useExperimentStore} from '../../stores/experiment'
import {useStationStore} from '../../stores/station'
import {useAuthStore} from '../../stores/auth'
import {useUiStore} from '../../stores/ui'
import type {ExperimentDocumentReference} from '../../contracts/generated/dto'
import {apiClient,errorMessage} from '../../services/api/client'
import {callOperation} from '../../services/api/operations'
import LabFeedback from './LabFeedback.vue'
const experiment=useExperimentStore(),station=useStationStore(),auth=useAuthStore(),ui=useUiStore()
const selected=computed(()=>experiment.active),current=computed(()=>experiment.currentExecution)
const selectedIsCurrent=computed(()=>!!selected.value&&selected.value.experiment_id===experiment.ownedActiveId)
const source=ref<ExperimentDocumentReference|null>(null),sourceError=ref('')
let referenceRequest:AbortController|undefined
async function refresh(){await Promise.all([experiment.refreshHistory(),experiment.refreshOwned()]);const id=station.executionTarget?.station_id;if(id)await experiment.refreshQueue(id)}
watch(()=>[experiment.activeId,auth.principal?.principal_id] as const,async([id])=>{
 referenceRequest?.abort();source.value=null;sourceError.value='';if(!id)return
 const controller=new AbortController(),principalId=auth.principal?.principal_id;referenceRequest=controller
 const currentScope=()=>!controller.signal.aborted&&principalId===auth.principal?.principal_id&&id===experiment.activeId
 try{const value=await callOperation(apiClient,'getExperimentDocumentReference',{path:{experiment_id:id},signal:controller.signal});if(currentScope())source.value=value}
 catch(error){if(currentScope())sourceError.value=errorMessage(error)}
},{immediate:true})
watch(()=>station.executionTarget?.station_id,id=>{if(id)void experiment.refreshQueue(id)},{immediate:true})
void experiment.refreshHistory()
onBeforeUnmount(()=>referenceRequest?.abort())
</script>
<template>
 <section class="history-manager" aria-label="Experiment history and queue">
  <section aria-label="Current owned execution"><h3>Current owned execution</h3>
   <p role="status" aria-label="Owned execution status">{{experiment.pending?experiment.requestStatus:experiment.executionState}}</p><p v-if="current"><code>{{current.experiment_id}}</code> · {{current.station_id}}<span v-if="current.queue_position!==null"> · queue position {{current.queue_position}}</span></p>
   <p v-if="current?.lease_expires_at!==null&&current?.lease_expires_at!==undefined">Lease expires {{new Date(current.lease_expires_at*1000).toLocaleString()}} (server authority).</p>
   <p v-if="experiment.unresolvedOperation">The request outcome is unknown. Reconcile the operation before starting another Run.</p><p v-if="experiment.activeSnapshotIncomplete">Some owned execution state is unavailable. Run stays disabled until it is confirmed.</p>
   <div class="actions"><button aria-label="Stop current owned execution" :disabled="!experiment.canStop" @click="experiment.stop()">Stop current execution</button><button aria-label="Show current execution" :disabled="!experiment.ownedActiveId" @click="experiment.showCurrentExecution()">Show current execution</button><button aria-label="Reconcile pending operation" :disabled="!experiment.unresolvedOperation" @click="experiment.reconcileOperations()">Reconcile request</button><button aria-label="Refresh execution history" :disabled="experiment.historyLoading" @click="refresh">Refresh snapshots</button></div>
   <p v-if="experiment.error" role="alert">{{experiment.error}}</p>
   <div v-for="queue in experiment.queues" :key="queue.station_id" class="queue-summary" :aria-label="`Queue ${queue.station_id}`"><strong>{{queue.station_id}}</strong> · {{queue.busy?'busy':'available'}} · {{queue.queued_count}} queued<ul><li v-for="position in queue.own_positions" :key="position.experiment_id">Your {{position.experiment_id}} · position {{position.position}}</li></ul></div>
  </section>
  <section aria-label="Owned experiment history"><h3>History</h3><p>Opening a record selects its feedback and capture. It keeps the current circuit and does not start an execution.</p>
   <p v-if="experiment.historyLoading">Loading history…</p><p v-if="experiment.historyError" role="alert">{{experiment.historyError}}</p>
   <ul><li v-for="record in experiment.history" :key="record.experiment_id"><button :aria-label="`Read experiment ${record.experiment_id}`" :aria-pressed="experiment.activeId===record.experiment_id" @click="experiment.selectExperiment(record.experiment_id)">{{record.experiment_id}} · {{record.state}} · {{record.station_id}}</button></li></ul>
   <button v-if="experiment.nextHistoryCursor" aria-label="More experiment history" :disabled="experiment.historyLoading" @click="experiment.refreshHistory(true)">More history</button>
  </section>
  <section v-if="selected" aria-label="Selected experiment evidence"><h3>Selected evidence</h3><p aria-label="Evidence access">{{selectedIsCurrent?'Current owned execution evidence':'Read-only history'}}. Live control is granted only by an acknowledged Run in this tab.</p>
   <p><code>{{selected.experiment_id}}</code> · {{selected.mode}} · {{selected.state}} · revision {{selected.revision}}</p><p v-if="selected.assignment_id">Assignment {{selected.assignment_id}}</p>
   <button aria-label="Refresh selected experiment evidence" @click="experiment.refreshSelectedEvidence()">Refresh selected evidence</button>
   <p>Lifecycle: {{selected.state_history.join(' → ')}}</p><p v-if="selected.error_code" role="alert">{{selected.error_code}}</p>
   <details v-if="source" open><summary>Immutable execution source</summary><p>{{source.source}} · circuit {{source.circuit_id}} · schema {{source.graph_schema_version||'not supplied'}}</p><p v-if="source.document_id">Saved document {{source.document_id}} · revision {{source.revision}}</p><p>Snapshot {{source.snapshot_id}}</p></details><p v-if="sourceError" class="source-error">Source metadata: {{sourceError}}</p>
   <LabFeedback />
   <section aria-label="Selected capture"><h4>Capture</h4><template v-if="selected.capture"><p>{{selected.capture.source}} · {{selected.capture.instrument}} · {{selected.capture.available?'available':'unavailable'}} · {{selected.capture.sample_count}} samples · {{selected.capture.duration_ns}} ns</p><p>{{selected.capture.signals?.join(', ')}}</p><button aria-label="Open selected capture" :disabled="!selected.capture.available" @click="ui.openWindow('monitor')">Open capture in Signal Monitor</button></template><p v-else>No capture was recorded.</p></section>
  </section>
 </section>
</template>
<style scoped>
.history-manager{height:100%;overflow:auto;padding:14px;color:#dbe6f0;font-size:13px}.history-manager section+section{border-top:1px solid #516273;margin-top:16px;padding-top:8px}.history-manager h3{font-size:15px;margin:8px 0}.history-manager ul{padding-left:18px}.history-manager li{margin:5px 0}.history-manager button{background:#263b50;color:inherit;border:1px solid #526a80;border-radius:3px;padding:5px 9px;cursor:pointer;overflow-wrap:anywhere}.history-manager button:disabled{opacity:.45;cursor:default}.history-manager button[aria-pressed=true]{background:#315d7c}.history-manager code{overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.queue-summary{padding:7px;background:#172d3b;margin:6px 0}[role=alert],.source-error{color:#ffc5b9}
</style>
