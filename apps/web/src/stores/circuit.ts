import { defineStore } from 'pinia'
import { effectScope,toRaw,watch,type WatchStopHandle } from 'vue'
import { StoreScopeMap } from '../services/session/storeScope'
import type { CircuitGraph,CircuitModule,FlexibleMount,Point3,WireIdentity,WireVisual } from '../types/circuit'
import type { MemoryImage } from '../types/memory'
import type { CircuitValidation } from '../types/api'
import { circuitsApi,type PhysicalPreview } from '../services/api/circuits'
import { errorMessage } from '../services/api/client'
import type { ExecutionPresentationAdapter } from '../application/ports/execution'
import type { PasteOptions } from '../editor/batchCommands'
import type { SelectionClipboard } from '../editor/selectionClipboard'
import type { EditorSelection } from '../editor/selection'
import * as document from '../domain/document/editorDocument'
import * as commands from '../domain/document/graphCommands'
export type { CircuitDraft } from '../domain/document/editorDocument'
export { MAX_HISTORY_STORAGE_BYTES } from '../domain/document/editorDocument'
const validationControllers=new StoreScopeMap<AbortController>(),physicalControllers=new StoreScopeMap<AbortController>()
const presentationAdapters=new StoreScopeMap<ExecutionPresentationAdapter>()
interface MutationPort extends document.EditorDocumentState {clearValidation():void;physicalVersion:number;physicalPreviewBusy:boolean}
interface Tracking {batch:number;stop:()=>void}
// HMR and independently compiled consumers can load this adapter more than once.
// The observer belongs to the store; this non-state anchor never owns a graph copy.
const trackingKey=Symbol.for('netcircuit.editorDocument.observer')
const observerFor=(store:object)=>Reflect.get(toRaw(store),trackingKey) as Tracking|undefined
function invalidate(store:MutationPort){store.clearValidation();physicalControllers.get(store)?.abort();physicalControllers.delete(store);store.physicalVersion++;store.physicalPreviewBusy=false}
function mutateDocument<T>(store:MutationPort,call:()=>T):T {
  const tracker=observerFor(store),id=store.activeId,revision=id?store.draftGraphRevisions[id]:undefined
  if(tracker)tracker.batch++
  try{return call()}finally{if(tracker)tracker.batch--;if(!tracker?.batch&&(id!==store.activeId||revision!==(store.activeId?store.draftGraphRevisions[store.activeId]:undefined)))invalidate(store)}
}
const useBaseCircuitStore=defineStore('circuit',{
  state:()=>({...document.createEditorDocumentState(),validationResult:null as CircuitValidation|null,validatedSnapshot:'',validatedDraftId:null as string|null,validatedRevision:-1,
    validating:false,validationError:null as string|null,validationVersion:0,physicalPreview:null as PhysicalPreview|null,physicalSnapshot:'',physicalDraftId:null as string|null,physicalRevision:-1,physicalPreviewBusy:false,physicalVersion:0}),
  getters:{
    current:state=>document.currentDocument(state),
    graph():CircuitGraph|null{return this.current?.graph??null},
    graphRevision:state=>state.activeId?(state.draftGraphRevisions[state.activeId]??-1):-1,
    validation():CircuitValidation|null{return this.activeId===this.validatedDraftId&&this.graphRevision===this.validatedRevision?this.validationResult:null},
    canUndo:state=>state.past.length>0,canRedo:state=>state.future.length>0,
    dirty:state=>document.isDocumentDirty(state),
    physicalStates():PhysicalPreview['device_states']|null{return this.activeId===this.physicalDraftId&&this.graphRevision===this.physicalRevision?this.physicalPreview?.device_states??null:null},
  },
  actions:{
    attachExecutionPresentation(adapter:ExecutionPresentationAdapter){physicalControllers.get(this)?.abort();physicalControllers.delete(this);this.physicalVersion++;this.physicalPreviewBusy=false;this.physicalPreview=null;this.physicalSnapshot='';this.physicalDraftId=null;this.physicalRevision=-1;presentationAdapters.set(this,adapter)},
    async evaluatePhysical(){
      if(!this.graph||this.physicalPreviewBusy)return
      const adapter=presentationAdapters.get(this);if(!adapter)throw new Error('Execution presentation is not connected.')
      const snapshot=JSON.stringify(this.graph),id=this.activeId,revision=this.graphRevision,version=this.physicalVersion,controller=new AbortController()
      physicalControllers.set(this,controller);this.physicalPreviewBusy=true
      try{const preview=await adapter(JSON.parse(snapshot) as CircuitGraph,controller.signal)
        if(!controller.signal.aborted&&version===this.physicalVersion&&id===this.activeId&&revision===this.graphRevision){this.physicalPreview=preview;this.physicalSnapshot=snapshot;this.physicalDraftId=id;this.physicalRevision=revision}
      }finally{if(physicalControllers.get(this)===controller)physicalControllers.delete(this);if(version===this.physicalVersion)this.physicalPreviewBusy=false}
    },
    commitGraph(graph:CircuitGraph){return mutateDocument(this,()=>document.commitGraph(this,graph))},
    setMomentaryModule(id:string,pressed:boolean){return mutateDocument(this,()=>document.setMomentaryModule(this,id,pressed))},
    releaseMomentaryModule(draftId:string|null,id:string){return mutateDocument(this,()=>document.releaseMomentaryModule(this,draftId,id))},
    authoredDocument(draft?:document.CircuitDraft|null){return document.authoredDocument(this,draft===undefined?this.current:draft)},
    captureSelection(selection:EditorSelection):SelectionClipboard|null{return commands.captureSelection(this,selection)},
    deleteSelection(selection:EditorSelection){return mutateDocument(this,()=>commands.deleteSelection(this,selection))},
    pasteSelection(snapshot:SelectionClipboard,options?:PasteOptions){return mutateDocument(this,()=>commands.pasteSelection(this,snapshot,options))},
    moveSelection(selection:EditorSelection,delta:Point3){return mutateDocument(this,()=>commands.moveSelection(this,selection,delta))},
    placeModule(type:string,position:Required<NonNullable<CircuitModule['position']>>,rotation=0,initialProperties?:Record<string,unknown>):string{return mutateDocument(this,()=>commands.placeModule(this,type,position,rotation,initialProperties))},
    placeFlexibleModule(type:string,mount:FlexibleMount,properties?:Record<string,unknown>):string{return mutateDocument(this,()=>commands.placeFlexibleModule(this,type,mount,properties))},
    updateFlexibleMount(id:string,mount:FlexibleMount){return mutateDocument(this,()=>commands.updateFlexibleMount(this,id,mount))},
    previewComponentGeometry(id:string,pinId?:string,contactId?:string){return commands.previewComponentGeometry(this,id,pinId,contactId)},
    rebuildComponentGeometry(id:string,preview:CircuitModule){return mutateDocument(this,()=>commands.rebuildComponentGeometry(this,id,preview))},
    changeComponentDesign(id:string,nextType:string,patch:Record<string,unknown>,pinMap?:Record<string,string>){return mutateDocument(this,()=>commands.changeComponentDesign(this,id,nextType,patch,pinMap))},
    convertModuleToFlexible(id:string){return mutateDocument(this,()=>commands.convertModuleToFlexible(this,id))},
    moveModule(id:string,position:Required<NonNullable<CircuitModule['position']>>){return mutateDocument(this,()=>commands.moveModule(this,id,position))},
    rotateModule(id:string,degrees=90){return mutateDocument(this,()=>commands.rotateModule(this,id,degrees))},
    detachModule(id:string){return mutateDocument(this,()=>commands.detachModule(this,id))},
    removeModule(id:string){return mutateDocument(this,()=>commands.removeModule(this,id))},
    connectPorts(first:string,second:string){return mutateDocument(this,()=>commands.connectPorts(this,first,second))},
    connectEndpoints(first:string,second:string,visual?:WireVisual){return mutateDocument(this,()=>commands.connectEndpoints(this,first,second,visual))},
    updateWireVisual(wire:WireIdentity,visual:WireVisual){return mutateDocument(this,()=>commands.updateWireVisual(this,wire,visual))},
    disconnectPorts(source:string,destination:string){return mutateDocument(this,()=>commands.disconnectPorts(this,source,destination))},
    updateModuleProperties(id:string,patch:Record<string,unknown>){return mutateDocument(this,()=>commands.updateModuleProperties(this,id,patch))},
    setMemoryImage(id:string,image:MemoryImage){return mutateDocument(this,()=>commands.setMemoryImage(this,id,image))},
    snapshot(){return document.snapshotDocument(this)},recordChange(){document.recordChange(this)},trimHistory(){document.trimHistory(this)},pruneSaved(){document.pruneSaved(this)},
    restore(snapshot:string){return mutateDocument(this,()=>document.restoreDocument(this,snapshot))},
    undo(){return mutateDocument(this,()=>document.undoDocument(this))},redo(){return mutateDocument(this,()=>document.redoDocument(this))},markSaved(){document.markSaved(this)},
    importGraph(graph:CircuitGraph){return mutateDocument(this,()=>document.importGraph(this,crypto.randomUUID(),graph))},
    replaceDocument(value:{name:string;graph:CircuitGraph}){return mutateDocument(this,()=>document.replaceDocument(this,crypto.randomUUID(),value))},
    touchDocument(){mutateDocument(this,()=>document.touchDocument(this))},exportGraph(){return document.exportGraph(this)},
    createDraft(name?:string):string{return mutateDocument(this,()=>document.createDraft(this,crypto.randomUUID(),name))},
    openDraft(id:string){return mutateDocument(this,()=>document.openDraft(this,id))},renameCurrent(name:string){return mutateDocument(this,()=>document.renameCurrent(this,name))},
    resetForPrincipal(){
      document.releaseMomentaryInputs(this)
      validationControllers.get(this)?.abort();validationControllers.delete(this);physicalControllers.get(this)?.abort();physicalControllers.delete(this)
      const revision=this.documentRevision+1,validation=this.validationVersion+1,physical=this.physicalVersion+1,tracker=observerFor(this)
      if(tracker)tracker.batch++
      try{this.$reset();this.documentRevision=revision;this.validationVersion=validation;this.physicalVersion=physical}finally{if(tracker)tracker.batch--}
    },
    clearValidation(){validationControllers.get(this)?.abort();validationControllers.delete(this);this.validationVersion++;this.validationResult=null;this.validationError=null;this.validatedSnapshot='';this.validatedDraftId=null;this.validatedRevision=-1;this.validating=false},
    async validateCurrent(){
      if(!this.graph||this.validating)return
      this.clearValidation()
      const version=this.validationVersion,id=this.activeId,revision=this.graphRevision,snapshot=JSON.stringify(this.graph),controller=new AbortController()
      validationControllers.set(this,controller);this.validating=true
      try{const result=await circuitsApi.validate(JSON.parse(snapshot) as CircuitGraph,controller.signal)
        if(!controller.signal.aborted&&version===this.validationVersion&&id===this.activeId&&revision===this.graphRevision){this.validationResult=result;this.validatedSnapshot=snapshot;this.validatedDraftId=id;this.validatedRevision=revision}
      }catch(error){if(!controller.signal.aborted&&version===this.validationVersion&&id===this.activeId&&revision===this.graphRevision)this.validationError=errorMessage(error)}
      finally{if(validationControllers.get(this)===controller)validationControllers.delete(this);if(version===this.validationVersion)this.validating=false}
    },
  },
})
type CircuitStore=ReturnType<typeof useBaseCircuitStore>
function trackDocuments(store:CircuitStore){
  if(observerFor(store))return
  const entries=new Map<string,{draft:document.CircuitDraft;stops:WatchStopHandle[]}>(),tracker:Tracking={batch:0,stop:()=>{}}
  Object.defineProperty(toRaw(store),trackingKey,{value:tracker,configurable:true})
  const observerScope=effectScope(true)
  observerScope.run(()=>{
    const changed=(id:string,graph:boolean)=>{if(!tracker.batch){document.touchDocument(store,id,graph);if(graph&&id===store.activeId)invalidate(store)}}
    let observing=false
    const stopDrafts=watch(()=>store.drafts.map(draft=>draft),drafts=>{
      let removed=false
      for(const [id,entry]of entries)if(!drafts.some(draft=>draft.id===id&&toRaw(draft)===toRaw(entry.draft))){entry.stops.forEach(stop=>stop());entries.delete(id);removed=true}
      for(const draft of drafts)if(!entries.has(draft.id)){
        const stops=observerScope.run(()=>[watch(()=>draft.name,()=>changed(draft.id,false),{flush:'sync'}),watch(()=>draft.graph,()=>changed(draft.id,true),{deep:true,flush:'sync'})])!
        entries.set(draft.id,{draft,stops});if(observing)changed(draft.id,true)
      }
      if(removed&&!tracker.batch){store.documentRevision++;if(!store.current)invalidate(store)}
    },{immediate:true,flush:'sync'})
    observing=true
    const stopActive=watch(()=>store.activeId,()=>{if(!tracker.batch){store.documentRevision++;invalidate(store)}},{flush:'sync'})
    // Preserve the existing explicit snapshot fixture/adapter surface; serialization occurs on assignment, never a getter.
    const stopValidation=watch(()=>store.validatedSnapshot,value=>{store.validatedDraftId=value&&value===JSON.stringify(store.graph)?store.activeId:null;store.validatedRevision=store.validatedDraftId?store.graphRevision:-1},{flush:'sync'})
    tracker.stop=()=>{stopDrafts();stopActive();stopValidation();entries.forEach(entry=>entry.stops.forEach(stop=>stop()));entries.clear();observerScope.stop()}
  })
  const dispose=store.$dispose
  store.$dispose=()=>{tracker.stop();if(observerFor(store)===tracker)Reflect.deleteProperty(toRaw(store),trackingKey);presentationAdapters.delete(store);validationControllers.get(store)?.abort();physicalControllers.get(store)?.abort();dispose()}
}
export const useCircuitStore=Object.assign((...args:Parameters<typeof useBaseCircuitStore>)=>{const store=useBaseCircuitStore(...args);trackDocuments(store);return store},{$id:useBaseCircuitStore.$id})
/** Compatibility helper now targets the current store instance, never a global adapter. */
export function configureExecutionPresentationAdapter(adapter?:ExecutionPresentationAdapter){useCircuitStore().attachExecutionPresentation(adapter??circuitsApi.physicalPreview)}
