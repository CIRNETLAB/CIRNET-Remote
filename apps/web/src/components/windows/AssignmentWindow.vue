<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {useAssignmentStore} from '../../stores/assignments'
import {useExperimentStore} from '../../stores/experiment'
import {useCircuitStore} from '../../stores/circuit'
import type {LabEndpoint} from '../../contracts/generated/dto'
import type {AssignmentDefinition} from '../../types/assignment'
import {copyReferenceDesign,parseBitAssignments} from '../../application/assignments/authoring'
import {parseDocumentJson} from '../../domain/document/json'
const author=useAssignmentStore(),experiment=useExperimentStore(),circuit=useCircuitStore()
const formError=ref(''),feedback=ref<'observed_only'|'detailed'>('observed_only')
const definitionJson=computed({get:()=>author.definitionText,set:text=>{author.setDefinitionText(text)}}),jsonDirty=computed(()=>author.unappliedDefinition)
const endpointId=ref(''),endpointRole=ref<LabEndpoint['role']>('INPUT_SOURCE'),endpointBinding=ref<'design_port'|'reference_node_id'|'fixed_node_id'|'none'>('design_port'),endpointTarget=ref(''),endpointChannel=ref(''),endpointRequired=ref(true)
const truthInputs=ref(''),truthOutputs=ref(''),signalName=ref(''),signalTime=ref('0'),signalValue=ref<'0'|'1'>('0')
const confirmation=ref<'new'|'reload'|null>(null)
const publicSelection=computed(()=>experiment.assignments.find(value=>value.assignment_id===experiment.assignmentId))
const roles:LabEndpoint['role'][]=['INPUT_SOURCE','OUTPUT_SENSE','CLOCK','VCC','GND','GENERATOR','SCOPE','LOGIC_ANALYZER']
function resetPrivateFields(){endpointId.value='';endpointRole.value='INPUT_SOURCE';endpointBinding.value='design_port';endpointTarget.value='';endpointChannel.value='';endpointRequired.value=true;truthInputs.value='';truthOutputs.value='';signalName.value='';signalTime.value='0';signalValue.value='0'}
function attempt(action:()=>unknown){try{action();formError.value=''}catch(error){formError.value=error instanceof Error?error.message:'The assignment is invalid.'}}
function update(value:AssignmentDefinition){author.editDefinition(value)}
function field<K extends keyof AssignmentDefinition>(key:K,value:AssignmentDefinition[K]){if(author.draft)attempt(()=>update({...author.draft!,[key]:value}))}
function integer(text:string){const value=parseDocumentJson(text);if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('Enter a nonnegative integer without rounding.');return value}
function addEndpoint(){if(!author.draft)return;attempt(()=>{
 const endpoint:LabEndpoint={endpoint_id:endpointId.value.trim(),role:endpointRole.value,required:endpointRequired.value,...(endpointChannel.value.trim()?{channel:integer(endpointChannel.value)}:{}),...(endpointBinding.value==='none'?{}:{[endpointBinding.value]:endpointTarget.value.trim()})}
 update({...author.draft!,lab_endpoints:[...author.draft!.lab_endpoints,endpoint]});endpointId.value='';endpointTarget.value='';endpointChannel.value=''
})}
function addTruth(){if(!author.draft)return;attempt(()=>{const row={inputs:parseBitAssignments(truthInputs.value),outputs:parseBitAssignments(truthOutputs.value)};update({...author.draft!,expected_behavior:{...author.draft!.expected_behavior,truth_table:[...(author.draft!.expected_behavior?.truth_table??[]),row]}});truthInputs.value='';truthOutputs.value=''})}
function addSignal(){if(!author.draft)return;attempt(()=>{const signal={signal:signalName.value.trim(),time_ns:integer(signalTime.value),value:signalValue.value==='1'?1 as const:0 as const};update({...author.draft!,expected_behavior:{...author.draft!.expected_behavior,expected_signals:[...(author.draft!.expected_behavior?.expected_signals??[]),signal]}});signalName.value=''})}
function removeTruth(index:number){if(author.draft)field('expected_behavior',{...author.draft.expected_behavior,truth_table:author.draft.expected_behavior?.truth_table?.filter((_,n)=>n!==index)})}
function removeSignal(index:number){if(author.draft)field('expected_behavior',{...author.draft.expected_behavior,expected_signals:author.draft.expected_behavior?.expected_signals?.filter((_,n)=>n!==index)})}
function applyJson(){attempt(()=>author.applyDefinitionText())}
function openDraft(id:string){void author.openDocument(id)}
async function replaceRequested(){const id=author.requestedAssignmentId;if(id&&await author.openDocument(id,true))feedback.value=author.binding?.feedback_policy??'observed_only'}
function newDraft(){if(author.dirty||jsonDirty.value){confirmation.value='new';return}author.newDraft(crypto.randomUUID())}
function forkDraft(){author.forkDraft(crypto.randomUUID())}
async function confirm(){const intent=confirmation.value;confirmation.value=null;if(intent==='new')author.newDraft(crypto.randomUUID(),true);else if(intent==='reload'&&author.binding&&await author.openDocument(author.binding.assignment_id,true))feedback.value=author.binding?.feedback_policy??'observed_only'}
async function publish(published:boolean){if(await author.publish(published,feedback.value))await experiment.loadAssignments()}
watch(()=>[author.principalId,author.role] as const,()=>{resetPrivateFields();feedback.value='observed_only';formError.value='';confirmation.value=null;if(author.canAuthor)void author.loadDocuments();void experiment.loadAssignments()},{immediate:true})
watch(()=>author.draft?.assignment_id,()=>{resetPrivateFields();feedback.value=author.binding?.feedback_policy??'observed_only'},{immediate:true})
</script>
<template>
 <section class="assignment-manager" aria-label="Assignments">
  <section aria-label="Published exercises"><h3>Published exercises</h3><p>Choose an assignment for the next Run. Your open circuit stays in the editor.</p>
   <button aria-label="Refresh published assignments" @click="experiment.loadAssignments()">Refresh exercises</button>
   <ul><li v-for="item in experiment.assignments" :key="item.assignment_id"><button :aria-label="`Use assignment ${item.title}`" :aria-pressed="experiment.assignmentId===item.assignment_id" @click="experiment.assignmentId=item.assignment_id">{{item.title}}</button></li></ul>
   <template v-if="publicSelection"><h4>{{publicSelection.title}}</h4><p>{{publicSelection.assessment_policy}}</p><ul><li v-for="endpoint in publicSelection.lab_endpoints" :key="endpoint.endpoint_id">{{endpoint.endpoint_id}} · {{endpoint.role}}<span v-if="endpoint.channel!==undefined"> · channel {{endpoint.channel}}</span><span v-if="endpoint.required"> · required</span></li></ul></template>
  </section>
  <p v-if="!author.canAuthor&&author.error" role="alert">{{author.error}}</p>
  <section v-if="author.canAuthor" aria-label="Instructor assignment authoring">
   <h3>Assignment authoring</h3><p>Drafts and reference answers are private. Publishing selects a saved revision for students.</p>
   <div class="actions"><button aria-label="New assignment draft" :disabled="author.pending" @click="newDraft">New draft</button><button aria-label="Refresh assignment drafts" :disabled="author.loading" @click="author.loadDocuments()">Refresh drafts</button></div>
   <p v-if="author.loading">Loading drafts…</p><ul><li v-for="document in author.documents" :key="document.assignment_id"><button :aria-label="`Edit assignment ${document.title}`" @click="openDraft(document.assignment_id)">{{document.title}} · r{{document.revision}} · {{document.published?'published r'+document.published_revision:'unpublished'}}</button></li></ul><button v-if="author.nextCursor" :disabled="author.loading" @click="author.loadDocuments(true)">More drafts</button>
   <p v-if="author.error||formError" role="alert">{{formError||author.error}}</p>
   <div v-if="author.requestedAssignmentId||confirmation" class="confirmation" aria-label="Replace assignment draft"><p>Replace the local assignment draft? Unsaved changes will be discarded.</p><button aria-label="Replace assignment draft" @click="author.requestedAssignmentId ? replaceRequested() : confirm()">Replace draft</button><button aria-label="Keep assignment changes" @click="author.requestedAssignmentId=null;confirmation=null">Keep changes</button></div>
   <template v-if="author.draft">
    <p role="status" aria-label="Assignment save status">Draft: {{author.phase}}<span v-if="author.binding"> · revision {{author.binding.revision}} · {{author.binding.published?'published revision '+author.binding.published_revision:'unpublished'}}</span></p>
    <label>Assignment ID<input aria-label="Assignment ID" :disabled="!!author.binding" :value="author.draft.assignment_id" @change="field('assignment_id',($event.target as HTMLInputElement).value)" /></label>
    <label>Title<input aria-label="Assignment title" maxlength="300" :value="author.draft.title" @input="field('title',($event.target as HTMLInputElement).value)" /></label>
    <label>Assessment policy<select aria-label="Assessment policy" :value="author.draft.assessment_policy" @change="field('assessment_policy',($event.target as HTMLSelectElement).value as AssignmentDefinition['assessment_policy'])"><option>FUNCTIONAL_ONLY</option><option>STRICT_TOPOLOGY</option><option>TOPOLOGY_AND_FUNCTION</option></select></label>
    <label>Component resolution<select aria-label="Component resolution" :value="author.draft.component_resolution_mode||'AUTO_DISCOVERY'" @change="field('component_resolution_mode',($event.target as HTMLSelectElement).value as AssignmentDefinition['component_resolution_mode'])"><option>AUTO_DISCOVERY</option><option>INSTRUCTOR_PROFILE</option><option>HYBRID</option></select></label>
    <fieldset><legend>Logical endpoints</legend><ul><li v-for="(endpoint,index) in author.draft.lab_endpoints" :key="endpoint.endpoint_id">{{endpoint.endpoint_id}} · {{endpoint.role}} · {{endpoint.design_port||endpoint.reference_node_id||endpoint.fixed_node_id||endpoint.node_id||'No binding'}}<button :aria-label="`Remove endpoint ${endpoint.endpoint_id}`" @click="field('lab_endpoints',author.draft.lab_endpoints.filter((_,n)=>n!==index))">Remove</button></li></ul>
     <label>Endpoint ID<input aria-label="Endpoint ID" :value="endpointId" @input="endpointId=($event.target as HTMLInputElement).value" /></label><label>Role<select aria-label="Endpoint role" :value="endpointRole" @change="endpointRole=($event.target as HTMLSelectElement).value as LabEndpoint['role']"><option v-for="role in roles" :key="role">{{role}}</option></select></label>
     <label>Binding<select aria-label="Endpoint binding" :value="endpointBinding" @change="endpointBinding=($event.target as HTMLSelectElement).value as typeof endpointBinding"><option value="design_port">Design port</option><option value="reference_node_id">Reference node</option><option value="fixed_node_id">Fixed node</option><option value="none">Unbound</option></select></label><label v-if="endpointBinding!=='none'">Target<input aria-label="Endpoint target" :value="endpointTarget" @input="endpointTarget=($event.target as HTMLInputElement).value" /></label>
     <label>Channel (optional)<input aria-label="Endpoint channel" inputmode="numeric" :value="endpointChannel" @input="endpointChannel=($event.target as HTMLInputElement).value" /></label><label><input type="checkbox" aria-label="Endpoint required" :checked="endpointRequired" @change="endpointRequired=($event.target as HTMLInputElement).checked" />Required</label><button aria-label="Add assignment endpoint" @click="addEndpoint">Add endpoint</button>
    </fieldset>
    <fieldset><legend>Expected behavior (private)</legend>
     <ul><li v-for="(row,index) in author.draft.expected_behavior?.truth_table" :key="index">{{row.inputs}} → {{row.outputs}}<button :aria-label="`Remove truth row ${index+1}`" @click="removeTruth(index)">Remove</button></li></ul>
     <label>Inputs, e.g. x=0, z=1<input aria-label="Truth row inputs" :value="truthInputs" @input="truthInputs=($event.target as HTMLInputElement).value" /></label><label>Expected outputs, e.g. y=1<input aria-label="Truth row outputs" :value="truthOutputs" @input="truthOutputs=($event.target as HTMLInputElement).value" /></label><button aria-label="Add expected truth row" @click="addTruth">Add truth row</button>
     <ul><li v-for="(signal,index) in author.draft.expected_behavior?.expected_signals" :key="index">{{signal.signal}} @ {{signal.time_ns}} ns = {{signal.value}}<button :aria-label="`Remove expected signal ${index+1}`" @click="removeSignal(index)">Remove</button></li></ul>
     <label>Signal<input aria-label="Expected signal name" :value="signalName" @input="signalName=($event.target as HTMLInputElement).value" /></label><label>Time (ns)<input aria-label="Expected signal time" inputmode="numeric" :value="signalTime" @input="signalTime=($event.target as HTMLInputElement).value" /></label><label>Value<select aria-label="Expected signal value" :value="signalValue" @change="signalValue=($event.target as HTMLSelectElement).value as '0'|'1'"><option>0</option><option>1</option></select></label><button aria-label="Add expected signal" @click="addSignal">Add expected signal</button>
    </fieldset>
    <fieldset><legend>Reference circuit (private)</legend><p>{{author.draft.reference_design_graph?'A saved reference snapshot is attached.':'No reference snapshot attached.'}}</p><button aria-label="Use current circuit as reference" :disabled="!circuit.graph" @click="attempt(()=>update(copyReferenceDesign(author.draft!,circuit.graph!)))">Use current circuit as reference</button></fieldset>
    <details><summary>Advanced public assignment definition</summary><p>Edit topology, component sets, instructor profiles and other contract fields. Apply JSON before saving.</p><textarea aria-label="Assignment definition JSON" rows="14" :value="definitionJson" @input="definitionJson=($event.target as HTMLTextAreaElement).value" /><button aria-label="Apply assignment JSON" @click="applyJson">Apply JSON to draft</button></details>
    <div class="actions"><button aria-label="Save assignment draft" :disabled="author.pending||jsonDirty" @click="author.saveDraft()">Save draft</button><button aria-label="Fork assignment draft" :disabled="author.pending||jsonDirty" @click="forkDraft">Fork draft</button><button aria-label="Reload assignment draft" :disabled="!author.binding||author.pending" @click="confirmation='reload'">Reload saved draft</button></div>
    <p v-if="author.phase==='conflict'" class="confirmation">The server revision changed. Your local draft is preserved. Keep editing, fork it, or explicitly reload the saved draft.<button aria-label="Keep conflicting assignment changes" @click="author.error=null;author.phase='dirty'">Keep changes</button></p>
    <label>Student feedback<select aria-label="Assignment feedback policy" :value="feedback" @change="feedback=($event.target as HTMLSelectElement).value as typeof feedback"><option value="observed_only">Observed results only</option><option value="detailed">Detailed feedback</option></select></label>
    <div class="actions"><button aria-label="Publish saved assignment" :disabled="!author.binding||author.dirty||author.pending||jsonDirty" @click="publish(true)">Publish saved revision</button><button aria-label="Unpublish assignment" :disabled="!author.binding?.published||author.dirty||author.pending||jsonDirty" @click="publish(false)">Unpublish</button></div>
   </template>
  </section>
 </section>
</template>
<style scoped>
.assignment-manager{height:100%;overflow:auto;padding:14px;color:#dbe6f0;font-size:13px}.assignment-manager section+section{border-top:1px solid #516273;margin-top:16px;padding-top:8px}.assignment-manager h3{font-size:15px;margin:8px 0}.assignment-manager ul{padding-left:18px}.assignment-manager li{margin:5px 0}.assignment-manager label{display:grid;gap:4px;margin:8px 0}.assignment-manager input,.assignment-manager select,.assignment-manager textarea{box-sizing:border-box;width:100%;padding:6px;background:#14202c;color:inherit;border:1px solid #516273;border-radius:3px}.assignment-manager input[type=checkbox]{width:auto;justify-self:start}.assignment-manager textarea{font-family:monospace}.assignment-manager button{background:#263b50;color:inherit;border:1px solid #526a80;border-radius:3px;padding:5px 9px;cursor:pointer}.assignment-manager button:disabled{opacity:.45;cursor:default}.assignment-manager button[aria-pressed=true]{background:#315d7c}.assignment-manager fieldset{margin:12px 0;border:1px solid #516273;padding:8px}.actions{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.confirmation{padding:10px;border:1px solid #bd9451;background:#45361f;margin:10px 0}[role=alert]{color:#ffc5b9}
</style>
