import { StoreScopeMap } from '../services/session/storeScope'
import { defineStore } from 'pinia'
import { effectScope,watch } from 'vue'
import type { Project,CircuitSummary } from '../contracts/generated/dto'
import { ProjectSaveController,type SaveState } from '../application/projects/saveController'
import type { RecoverySummary } from '../application/projects/recovery'
import { createIndexedDbRecoveryRepository } from '../services/recovery/indexedDb'
import { projectsApi } from '../services/api/projects'
import { errorMessage } from '../services/api/client'
import { useCircuitStore } from './circuit'
import { useWorkspaceStore } from './workspace'
const controllers=new StoreScopeMap<ProjectSaveController>(),subscriptions=new StoreScopeMap<()=>void>(),transitions=new StoreScopeMap<Promise<void>>()
const pendingRequests=new StoreScopeMap<Set<AbortController>>()
function request(owner:object) {const controller=new AbortController();const values=pendingRequests.get(owner)??new Set<AbortController>();values.add(controller);pendingRequests.set(owner,values);return controller}
function release(owner:object,controller:AbortController){pendingRequests.get(owner)?.delete(controller)}
function abort(owner:object){for(const controller of pendingRequests.get(owner)??[])controller.abort();pendingRequests.delete(owner)}
export const useProjectStore=defineStore('projects',{
  state:()=>({projects:[] as Project[],selectedProjectId:null as string|null,circuits:[] as CircuitSummary[],projectsLoading:false,circuitsLoading:false,pending:false,error:null as string|null,navigationError:null as string|null,
    nextProjectCursor:null as string|null,nextCircuitCursor:null as string|null,recoveries:[] as RecoverySummary[],requestedDocumentId:null as string|null,generation:0,selectionVersion:0,
    saveState:{principalId:null,phase:'local',dirty:false,binding:null,error:null,recoveryError:null} as SaveState}),
  getters:{
    selectedProject:state=>state.projects.find(project=>project.project_id===state.selectedProjectId)??null,
    needsDiscard():boolean {
      const circuit=useCircuitStore(),current=circuit.current
      const pristine=!!current&&circuit.drafts.length===1&&circuit.past.length<=1&&!circuit.future.length
        &&current.graph.circuit_id===current.id&&current.name.startsWith('Untitled circuit')&&Object.keys(current.graph).length===4
        &&current.graph.modules.length===0&&current.graph.connections.length===0
      return this.saveState.dirty&&!pristine
    },
  },
  actions:{
    controller():ProjectSaveController {
      const existing=controllers.get(this);if(existing)return existing
      const circuit=useCircuitStore()
      const snapshot=(draft:NonNullable<typeof circuit.current>)=>({draftId:draft.id,name:draft.name,revision:circuit.draftRevisions[draft.id]??circuit.documentRevision,graph:draft.graph})
      const controller=new ProjectSaveController({documents:{revisioned:true,read:()=>circuit.current?snapshot(circuit.current):null,readAll:()=>circuit.drafts.map(snapshot),
        replace:value=>circuit.replaceDocument(value),clearForPrincipal:()=>{useWorkspaceStore().clearSelection();circuit.resetForPrincipal()}},
        remote:{get:(id,signal)=>projectsApi.getCircuit(id,signal),create:(id,value,signal)=>projectsApi.createCircuit(id,value,signal),
          save:(id,base_revision,value,signal)=>projectsApi.saveCircuit(id,{base_revision,...value},signal)},
        recovery:createIndexedDbRecoveryRepository(),onChange:state=>{this.saveState=state}})
      controllers.set(this,controller)
      const events=effectScope(true)
      events.run(()=>watch(()=>[circuit.activeId,circuit.documentRevision],()=>controller.documentChanged(),{flush:'post'}))
      subscriptions.set(this,()=>events.stop())
      return controller
    },
    async setPrincipal(id:string|null):Promise<void> {
      const controller=this.controller()
      if(this.saveState.principalId===id&&transitions.has(this)){await transitions.get(this);return}
      if(this.saveState.principalId===id&&controller.state().principalId===id&&useCircuitStore().current)return
      ++this.generation;++this.selectionVersion;abort(this)
      this.projects=[];this.circuits=[];this.recoveries=[];this.selectedProjectId=null;this.requestedDocumentId=null;this.error=null;this.navigationError=null
      this.projectsLoading=false;this.circuitsLoading=false;this.pending=false;this.nextProjectCursor=null;this.nextCircuitCursor=null
      const transition=controller.setPrincipal(id);transitions.set(this,transition)
      if(!useCircuitStore().current)useCircuitStore().createDraft()
      controller.documentChanged()
      await transition
      if(transitions.get(this)===transition){transitions.delete(this);await this.refreshRecovery()}
    },
    async loadProjects(append=false):Promise<boolean> {
      if(!this.saveState.principalId){this.error='Sign in or enable guest access to use server projects.';return false}
      if(this.projectsLoading)return false
      const version=this.generation,controller=request(this);this.projectsLoading=true;this.error=null
      try {
        const page=await projectsApi.list({limit:50,...(append?{cursor:this.nextProjectCursor}:{})},controller.signal)
        if(controller.signal.aborted||version!==this.generation)return false
        this.projects=append?[...new Map([...this.projects,...page.items].map(project=>[project.project_id,project])).values()]:page.items
        this.nextProjectCursor=page.next_cursor;return true
      }catch(error){if(!controller.signal.aborted&&version===this.generation)this.error=errorMessage(error);return false}
      finally{release(this,controller);if(version===this.generation)this.projectsLoading=false}
    },
    async selectProject(id:string):Promise<boolean> {
      const version=this.generation,selection=++this.selectionVersion,controller=request(this);this.error=null
      try {
        const project=await projectsApi.get(id,controller.signal)
        if(controller.signal.aborted||version!==this.generation||selection!==this.selectionVersion)return false
        this.projects=[...this.projects.filter(value=>value.project_id!==id),project];this.selectedProjectId=id;this.circuits=[];this.nextCircuitCursor=null
        return this.loadCircuits()
      }catch(error){if(!controller.signal.aborted&&version===this.generation&&selection===this.selectionVersion)this.error=errorMessage(error);return false}
      finally{release(this,controller)}
    },
    async loadCircuits(append=false):Promise<boolean> {
      const id=this.selectedProjectId;if(!id)return false
      const version=this.generation,selection=this.selectionVersion,controller=request(this);this.circuitsLoading=true
      try {
        const page=await projectsApi.circuits(id,{limit:50,...(append?{cursor:this.nextCircuitCursor}:{})},controller.signal)
        if(controller.signal.aborted||version!==this.generation||selection!==this.selectionVersion||this.selectedProjectId!==id)return false
        this.circuits=append?[...new Map([...this.circuits,...page.items].map(document=>[document.document_id,document])).values()]:page.items
        this.nextCircuitCursor=page.next_cursor;return true
      }catch(error){if(!controller.signal.aborted&&version===this.generation&&selection===this.selectionVersion)this.error=errorMessage(error);return false}
      finally{release(this,controller);if(version===this.generation&&selection===this.selectionVersion)this.circuitsLoading=false}
    },
    async createProject(name:string,description=''):Promise<boolean> {
      if(this.pending||!this.saveState.principalId)return false
      const version=this.generation,controller=request(this);this.pending=true;this.error=null
      try {
        const project=await projectsApi.create({name,description},controller.signal)
        if(controller.signal.aborted||version!==this.generation)return false
        this.projects=[...this.projects,project];this.selectedProjectId=project.project_id;this.circuits=[];this.nextCircuitCursor=null;return true
      }catch(error){if(!controller.signal.aborted&&version===this.generation)this.error=errorMessage(error);return false}
      finally{release(this,controller);if(version===this.generation)this.pending=false}
    },
    async renameProject(name:string,description:string):Promise<boolean> {
      const selected=this.selectedProject;if(!selected||this.pending)return false
      const version=this.generation,controller=request(this);this.pending=true;this.error=null
      try {
        const project=await projectsApi.update(selected.project_id,{base_revision:selected.revision,name,description},controller.signal)
        if(controller.signal.aborted||version!==this.generation)return false
        this.projects=this.projects.map(value=>value.project_id===project.project_id?project:value);return true
      }catch(error){if(!controller.signal.aborted&&version===this.generation)this.error=errorMessage(error);return false}
      finally{release(this,controller);if(version===this.generation)this.pending=false}
    },
    async deleteProject(confirmed:boolean):Promise<boolean> {
      const selected=this.selectedProject;if(!selected||this.pending||confirmed!==true)return false
      const version=this.generation
      await this.controller().checkpoint()
      if(version!==this.generation)return false
      const controller=request(this);this.pending=true;this.error=null
      try {
        await projectsApi.remove(selected.project_id,selected.revision,controller.signal)
        if(controller.signal.aborted||version!==this.generation)return false
        this.projects=this.projects.filter(project=>project.project_id!==selected.project_id)
        if(this.saveState.binding?.projectId===selected.project_id)this.controller().detach()
        this.selectedProjectId=null;this.circuits=[];this.nextCircuitCursor=null;return true
      }catch(error){if(!controller.signal.aborted&&version===this.generation)this.error=errorMessage(error);return false}
      finally{release(this,controller);if(version===this.generation)this.pending=false}
    },
    async deleteCircuit(document:CircuitSummary,confirmed:boolean):Promise<boolean> {
      if(this.pending||confirmed!==true)return false
      const version=this.generation
      await this.controller().checkpoint()
      if(version!==this.generation)return false
      const controller=request(this);this.pending=true;this.error=null
      try {
        await projectsApi.removeCircuit(document.document_id,document.revision,controller.signal)
        if(controller.signal.aborted||version!==this.generation)return false
        this.circuits=this.circuits.filter(value=>value.document_id!==document.document_id)
        if(this.saveState.binding?.documentId===document.document_id)this.controller().detach()
        return true
      }catch(error){if(!controller.signal.aborted&&version===this.generation)this.error=errorMessage(error);return false}
      finally{release(this,controller);if(version===this.generation)this.pending=false}
    },
    async openDocument(id:string,discard=false):Promise<boolean> {
      const result=await this.controller().open(id,(discard||!this.needsDiscard)?{discardLocal:true}:{})
      if(result)this.selectedProjectId=this.saveState.binding?.projectId??null
      return result
    },
    async requestOpen(id:string):Promise<boolean> {
      if(this.needsDiscard){this.requestedDocumentId=id;return false}
      this.requestedDocumentId=null;return this.openDocument(id)
    },
    async saveCurrent():Promise<boolean> {
      this.controller().documentChanged()
      const saved=await this.controller().save()
      if(saved&&this.selectedProject)await this.loadCircuits()
      return saved
    },
    async saveAs(projectId:string):Promise<boolean> {
      this.controller().documentChanged()
      const saved=await this.controller().saveAs(projectId)
      if(saved){this.selectedProjectId=projectId;if(this.selectedProject)await this.loadCircuits()}
      return saved
    },
    async refreshRecovery(){this.recoveries=await this.controller().listRecovery()},
    async checkpoint(){const saved=await this.controller().checkpoint();await this.refreshRecovery();return saved},
    async recover(id:string,discard=false){return this.controller().recover(id,(discard||!this.needsDiscard)?{discardLocal:true}:{})},
    async removeRecovery(id:string,confirmed:boolean){if(confirmed!==true)return false;const removed=await this.controller().removeRecovery(id);await this.refreshRecovery();return removed},
    async claimGuestRecovery(source:string,confirmed:boolean){await transitions.get(this);const claimed=await this.controller().claimGuestRecovery(source,confirmed);await this.refreshRecovery();return claimed},
    dispose(){abort(this);subscriptions.get(this)?.();subscriptions.delete(this);controllers.get(this)?.dispose();controllers.delete(this);transitions.delete(this)},
  },
})
