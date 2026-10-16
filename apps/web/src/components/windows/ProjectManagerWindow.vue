<script setup lang="ts">
import { ref,watch } from 'vue'
import { useProjectStore } from '../../stores/projects'
import { useCircuitStore } from '../../stores/circuit'
import type { CircuitSummary } from '../../contracts/generated/dto'
const projects=useProjectStore(),circuit=useCircuitStore()
const newName=ref(''),newDescription=ref(''),projectName=ref(''),projectDescription=ref('')
type Confirmation={kind:'project';id:string}|{kind:'circuit';document:CircuitSummary}|{kind:'recover'|'recovery';id:string}|{kind:'reload';id:string}
const confirmation=ref<Confirmation|null>(null)
watch(()=>projects.selectedProject,project=>{projectName.value=project?.name??'';projectDescription.value=project?.description??''},{immediate:true})
watch(()=>projects.saveState.principalId,()=>{confirmation.value=null;newName.value='';newDescription.value='';void projects.loadProjects();void projects.refreshRecovery()},{immediate:true})
async function create(){if(await projects.createProject(newName.value.trim(),newDescription.value)){newName.value='';newDescription.value=''}}
async function replaceRequested(){const id=projects.requestedDocumentId;projects.requestedDocumentId=null;if(id)await projects.openDocument(id,true)}
async function confirm(){
  const intent=confirmation.value;confirmation.value=null
  if(!intent)return
  if(intent.kind==='project'){if(projects.selectedProjectId===intent.id)await projects.deleteProject(true)}
  else if(intent.kind==='circuit')await projects.deleteCircuit(intent.document,true)
  else if(intent.kind==='recover')await projects.recover(intent.id,true)
  else if(intent.kind==='recovery')await projects.removeRecovery(intent.id,true)
  else await projects.openDocument(intent.id,true)
}
function rename(event:Event){circuit.renameCurrent((event.target as HTMLInputElement).value)}
</script>
<template>
  <section class="project-manager" aria-label="Project Manager">
    <p>Server documents are private to this account. Export JSON downloads a separate local file.</p>
    <p class="save-status" role="status" aria-label="Server save status">Server save: <strong>{{ projects.saveState.phase }}</strong><span v-if="projects.saveState.binding"> · revision {{ projects.saveState.binding.serverRevision }}</span></p>
    <p v-if="projects.error || projects.saveState.error" role="alert">{{ projects.error || projects.saveState.error }}</p>
    <p v-if="projects.navigationError" role="alert">{{ projects.navigationError }}</p>
    <p v-if="projects.saveState.recoveryError" role="alert">Local recovery: {{ projects.saveState.recoveryError }}</p>
    <div v-if="projects.requestedDocumentId" class="confirmation" role="group" aria-label="Replace local circuit">
      <p>Replace local circuit with the server document? Keep a recovery copy before replacing changes.</p>
      <button aria-label="Replace local circuit" @click="replaceRequested">Replace local circuit</button>
      <button aria-label="Keep local circuit" @click="projects.requestedDocumentId=null">Keep local circuit</button>
    </div>
    <div v-if="confirmation" class="confirmation" role="group" aria-label="Confirm project action">
      <p>{{ confirmation.kind==='project'?'Delete this project and all its server documents?':confirmation.kind==='circuit'?'Delete this server document?':confirmation.kind==='recovery'?'Delete this local recovery copy?':'Replace the current circuit? Unsaved edits remain in local recovery when available.' }}</p>
      <button aria-label="Confirm project action" @click="confirm">Confirm</button><button @click="confirmation=null">Cancel</button>
    </div>
    <div class="project-columns">
      <section aria-label="Server projects">
        <h3>Projects</h3><button aria-label="Refresh projects" :disabled="projects.projectsLoading" @click="projects.loadProjects()">Refresh</button>
        <p v-if="projects.projectsLoading">Loading projects…</p>
        <ul><li v-for="project in projects.projects" :key="project.project_id"><button :aria-label="`Open project ${project.name}`" :aria-pressed="projects.selectedProjectId===project.project_id" @click="projects.selectProject(project.project_id)">{{ project.name }}</button></li></ul>
        <button v-if="projects.nextProjectCursor" :disabled="projects.projectsLoading" @click="projects.loadProjects(true)">More projects</button>
        <label>New project name<input aria-label="New project name" maxlength="128" :value="newName" @input="newName=($event.target as HTMLInputElement).value" /></label>
        <label>Description<textarea aria-label="New project description" maxlength="2000" :value="newDescription" @input="newDescription=($event.target as HTMLTextAreaElement).value" /></label>
        <button aria-label="Create project" :disabled="projects.pending || !newName.trim() || !projects.saveState.principalId" @click="create">Create project</button>
      </section>
      <section aria-label="Server circuits">
        <h3>{{ projects.selectedProject?.name || 'Select a project' }}</h3>
        <template v-if="projects.selectedProject">
          <label>Project name<input aria-label="Project name" :value="projectName" maxlength="128" @input="projectName=($event.target as HTMLInputElement).value" /></label>
          <label>Project description<textarea aria-label="Project description" :value="projectDescription" maxlength="2000" @input="projectDescription=($event.target as HTMLTextAreaElement).value" /></label>
          <div class="actions"><button :disabled="projects.pending || !projectName.trim()" aria-label="Update project" @click="projects.renameProject(projectName.trim(),projectDescription)">Update project</button><button :disabled="projects.pending" aria-label="Delete project" @click="confirmation={kind:'project',id:projects.selectedProjectId!}">Delete project</button></div>
        </template>
        <p v-if="projects.circuitsLoading">Loading circuits…</p>
        <ul><li v-for="document in projects.circuits" :key="document.document_id" class="document-row"><button :aria-label="`Open circuit ${document.name}`" @click="projects.requestOpen(document.document_id)">{{ document.name }} · r{{ document.revision }}</button><button :aria-label="`Delete circuit ${document.name}`" :disabled="projects.pending" @click="confirmation={kind:'circuit',document}">Delete</button></li></ul>
        <button v-if="projects.nextCircuitCursor" :disabled="projects.circuitsLoading" @click="projects.loadCircuits(true)">More circuits</button>
        <label>Current circuit name<input aria-label="Current circuit name" :value="circuit.current?.name || ''" :disabled="!circuit.current" maxlength="128" @change="rename" /></label>
        <div class="actions"><button aria-label="Save server circuit" :disabled="!projects.saveState.binding || projects.saveState.phase==='saving'" @click="projects.saveCurrent()">Save</button><button aria-label="Save circuit as new server document" :disabled="!projects.selectedProjectId || !circuit.current || projects.saveState.phase==='saving'" @click="projects.saveAs(projects.selectedProjectId!)">Save As</button></div>
        <div v-if="projects.saveState.phase==='conflict'" class="confirmation" aria-label="Server save conflict"><p>The server changed. Your local circuit is preserved. Save As creates another document; Reload replaces it with the server revision.</p><button @click="projects.error=null">Keep local changes</button><button aria-label="Reload server circuit" @click="confirmation={kind:'reload',id:projects.saveState.binding!.documentId}">Reload</button></div>
      </section>
    </div>
    <section aria-label="Local recovery"><h3>Local recovery</h3><p>Recovery copies stay in this browser under the account that created them.</p>
      <div class="actions"><button aria-label="Checkpoint local recovery" @click="projects.checkpoint()">Keep recovery copy</button><button @click="projects.refreshRecovery()">Refresh recovery</button></div>
      <ul><li v-for="draft in projects.recoveries" :key="draft.draftId" class="document-row"><button :aria-label="`Recover ${draft.name}`" :title="draft.draftId" @click="confirmation={kind:'recover',id:draft.draftId}">{{ draft.name }} · {{ new Date(draft.updatedAt).toLocaleString() }}</button><button :aria-label="`Delete recovery ${draft.name}`" @click="confirmation={kind:'recovery',id:draft.draftId}">Delete copy</button></li></ul>
    </section>
  </section>
</template>
<style scoped>
.project-manager{height:100%;overflow:auto;padding:14px;color:#dbe6f0;font-size:13px}.project-manager p{margin:6px 0 10px}.project-columns{display:grid;grid-template-columns:minmax(180px,1fr) minmax(260px,1.5fr);gap:18px}.project-manager h3{font-size:14px;margin:12px 0 8px}.project-manager ul{list-style:none;padding:0;margin:8px 0}.project-manager li{margin:4px 0}.project-manager label{display:grid;gap:4px;margin:8px 0}.project-manager input,.project-manager textarea{width:100%;box-sizing:border-box;background:#14202c;color:inherit;border:1px solid #516273;border-radius:3px;padding:6px}.project-manager button{background:#263b50;color:inherit;border:1px solid #526a80;border-radius:3px;padding:5px 9px;cursor:pointer}.project-manager button:disabled{opacity:.45;cursor:default}.project-manager button[aria-pressed=true]{background:#315d7c}.actions,.document-row{display:flex;gap:6px;flex-wrap:wrap}.document-row>button:first-child{flex:1;text-align:left}.confirmation{padding:10px;border:1px solid #bd9451;background:#45361f;margin:10px 0}.confirmation button{margin-right:6px}.save-status{padding:7px;background:#172d3b}[role=alert]{color:#ffc5b9}@media(max-width:600px){.project-columns{grid-template-columns:1fr}}
</style>
