import {defineStore} from 'pinia'
import type {AssignmentDefinition,AssignmentAuthoringDocument,AssignmentAuthoringSummary} from '../types/assignment'
import {assignmentDocumentsApi} from '../services/api/assignmentDocuments'
import {StoreScopeMap} from '../services/session/storeScope'
import {errorMessage} from '../services/api/client'
import {parseAuthoringDefinition} from '../application/assignments/authoring'
type Role='STUDENT'|'INSTRUCTOR'|'ADMIN'
type Phase='local'|'dirty'|'saving'|'saved'|'conflict'|'error'
const requests=new StoreScopeMap<Set<AbortController>>()
function request(owner:object){const controller=new AbortController(),values=requests.get(owner)??new Set<AbortController>();values.add(controller);requests.set(owner,values);return controller}
function release(owner:object,controller:AbortController){requests.get(owner)?.delete(controller)}
function abort(owner:object){for(const controller of requests.get(owner)??[])controller.abort();requests.delete(owner)}
function summary(document:AssignmentAuthoringDocument):AssignmentAuthoringSummary {const {definition:_,...metadata}=document;return metadata}
export const useAssignmentStore=defineStore('assignment-authoring',{
 state:()=>({principalId:null as string|null,role:null as Role|null,documents:[] as AssignmentAuthoringSummary[],nextCursor:null as string|null,loading:false,pending:false,
  draft:null as AssignmentDefinition|null,definitionText:'',unappliedDefinition:false,binding:null as AssignmentAuthoringSummary|null,editRevision:0,savedEditRevision:0,phase:'local' as Phase,error:null as string|null,
  requestedAssignmentId:null as string|null,generation:0,selectionVersion:0}),
 getters:{canAuthor:state=>!!state.principalId&&(state.role==='INSTRUCTOR'||state.role==='ADMIN'),dirty:state=>!!state.draft&&(!state.binding||state.unappliedDefinition||state.editRevision!==state.savedEditRevision)},
 actions:{
  setScope(id:string|null,role:Role|null){
   if(this.principalId===id&&this.role===role)return
   ++this.generation;++this.selectionVersion;abort(this)
   this.principalId=id;this.role=role;this.documents=[];this.nextCursor=null;this.loading=false;this.pending=false;this.draft=null;this.binding=null
   this.definitionText='';this.unappliedDefinition=false;this.editRevision=0;this.savedEditRevision=0;this.phase='local';this.error=null;this.requestedAssignmentId=null
  },
  newDraft(id:string,discard=false){
   if(!this.canAuthor||this.pending)return false
   if(this.dirty&&!discard){this.error='Confirm replacement before discarding assignment edits.';return false}
   ++this.selectionVersion;this.binding=null;this.draft=parseAuthoringDefinition(JSON.stringify({schema_version:'1.0',assignment_id:id,title:'Untitled assignment',lab_endpoints:[],assessment_policy:'FUNCTIONAL_ONLY'}))
   this.definitionText=JSON.stringify(this.draft,null,2);this.unappliedDefinition=false;++this.editRevision;this.savedEditRevision=-1;this.phase='local';this.error=null;this.requestedAssignmentId=null;return true
  },
  setDefinitionText(text:string){
   if(!this.canAuthor||!this.draft)return false
   this.definitionText=text;this.unappliedDefinition=true;++this.editRevision;if(!this.pending)this.phase='dirty';this.error=null;return true
  },
  applyDefinitionText(){
   if(!this.canAuthor||!this.draft)return false
   const value=parseAuthoringDefinition(this.definitionText)
   this.unappliedDefinition=false
   try{return this.editDefinition(value)}catch(error){this.unappliedDefinition=true;throw error}
  },
  editDefinition(value:AssignmentDefinition){
   if(!this.canAuthor)return false
   if(this.unappliedDefinition)throw new Error('Apply the advanced JSON edits before changing assignment fields.')
   const validated=parseAuthoringDefinition(JSON.stringify(value))
   if(this.binding&&validated.assignment_id!==this.binding.assignment_id)throw new Error('A saved assignment ID cannot change. Fork the draft to create another assignment.')
   this.draft=validated;this.definitionText=JSON.stringify(validated,null,2);++this.editRevision;if(!this.pending)this.phase='dirty';this.error=null;return true
  },
  forkDraft(id:string){if(!this.draft||!this.canAuthor||this.pending||this.unappliedDefinition)return false;const value=parseAuthoringDefinition(JSON.stringify({...this.draft,assignment_id:id}));++this.selectionVersion;this.binding=null;this.draft=value;this.definitionText=JSON.stringify(value,null,2);++this.editRevision;this.savedEditRevision=-1;this.phase='local';this.error=null;return true},
  async loadDocuments(append=false){
   if(!this.canAuthor||this.loading)return false
   const generation=this.generation,controller=request(this);this.loading=true;this.error=null
   try{const page=await assignmentDocumentsApi.list({limit:50,...(append?{cursor:this.nextCursor}:{})},controller.signal)
    if(controller.signal.aborted||generation!==this.generation)return false
    this.documents=append?[...new Map([...this.documents,...page.items].map(value=>[value.assignment_id,value])).values()]:page.items;this.nextCursor=page.next_cursor;return true
   }catch(error){if(!controller.signal.aborted&&generation===this.generation)this.error=errorMessage(error);return false}
   finally{release(this,controller);if(generation===this.generation)this.loading=false}
  },
  async openDocument(id:string,discard=false){
   if(!this.canAuthor||this.pending)return false
   if(this.dirty&&!discard){this.requestedAssignmentId=id;return false}
   const generation=this.generation,selection=++this.selectionVersion,edit=this.editRevision,controller=request(this);this.error=null
   try{const document=await assignmentDocumentsApi.get(id,controller.signal)
    if(controller.signal.aborted||generation!==this.generation||selection!==this.selectionVersion)return false
    if(edit!==this.editRevision){this.requestedAssignmentId=id;this.error='The draft changed while loading. Your changes are preserved.';return false}
    this.binding=summary(document);this.draft=document.definition;this.definitionText=JSON.stringify(document.definition,null,2);this.unappliedDefinition=false;++this.editRevision;this.savedEditRevision=this.editRevision;this.phase='saved';this.requestedAssignmentId=null
    this.documents=[...this.documents.filter(value=>value.assignment_id!==id),summary(document)];return true
   }catch(error){if(!controller.signal.aborted&&generation===this.generation&&selection===this.selectionVersion)this.error=errorMessage(error);return false}
   finally{release(this,controller)}
  },
  async saveDraft(){
   if(!this.canAuthor||!this.draft||this.pending)return false
   if(this.unappliedDefinition){this.error='Apply the advanced JSON edits before saving.';return false}
   const definition=parseAuthoringDefinition(JSON.stringify(this.draft)),captured=JSON.stringify(definition),revision=this.editRevision,generation=this.generation,selection=this.selectionVersion,binding=this.binding,controller=request(this)
   this.pending=true;this.phase='saving';this.error=null
   try{const document=binding?await assignmentDocumentsApi.save(binding.assignment_id,{base_revision:binding.revision,definition},controller.signal,binding.schema_version):await assignmentDocumentsApi.create(definition,controller.signal)
    if(controller.signal.aborted||generation!==this.generation||selection!==this.selectionVersion)return false
    this.binding=summary(document);this.documents=[...this.documents.filter(value=>value.assignment_id!==document.assignment_id),summary(document)]
    if(revision===this.editRevision&&captured===JSON.stringify(this.draft)){this.draft=document.definition;this.definitionText=JSON.stringify(document.definition,null,2);this.unappliedDefinition=false;this.savedEditRevision=revision;this.phase='saved'}else this.phase='dirty'
    return true
   }catch(error){if(!controller.signal.aborted&&generation===this.generation&&selection===this.selectionVersion){this.error=errorMessage(error);this.phase=typeof error==='object'&&error!==null&&'status' in error&&error.status===409?'conflict':'error'}return false}
   finally{release(this,controller);if(generation===this.generation&&selection===this.selectionVersion)this.pending=false}
  },
  async publish(published:boolean,feedback_policy:'observed_only'|'detailed'){
   if(!this.canAuthor||!this.binding||!this.draft||this.dirty||this.pending){this.error='Save the current draft before changing publication.';return false}
   const binding=this.binding,generation=this.generation,selection=this.selectionVersion,revision=this.editRevision,controller=request(this);this.pending=true;this.error=null
   try{const document=await assignmentDocumentsApi.publish(binding.assignment_id,{base_revision:binding.revision,published,feedback_policy},controller.signal,binding.schema_version)
    if(controller.signal.aborted||generation!==this.generation||selection!==this.selectionVersion)return false
    this.binding=summary(document);this.documents=[...this.documents.filter(value=>value.assignment_id!==document.assignment_id),summary(document)]
    if(revision===this.editRevision){this.draft=document.definition;this.definitionText=JSON.stringify(document.definition,null,2);this.unappliedDefinition=false;this.savedEditRevision=revision;this.phase='saved'}else this.phase='dirty'
    return true
   }catch(error){if(!controller.signal.aborted&&generation===this.generation&&selection===this.selectionVersion){this.error=errorMessage(error);this.phase=typeof error==='object'&&error!==null&&'status' in error&&error.status===409?'conflict':'error'}return false}
   finally{release(this,controller);if(generation===this.generation&&selection===this.selectionVersion)this.pending=false}
  },
  dispose(){++this.generation;abort(this)},
 },
})
