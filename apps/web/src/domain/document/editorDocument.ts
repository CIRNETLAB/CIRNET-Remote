import type { CircuitGraph, CircuitModule } from '../../types/circuit'
import { MAX_CIRCUIT_FILE_BYTES,parseCircuitFile } from './circuitFile'
import { validateMountBindings } from '../../electrical/mounting'
import { synchronizeLabelBoardPoses } from '../../geometry/labelBoardPose'
import { getPartForModule } from '../../data/partCatalog'

export interface CircuitDraft {id:string;name:string;graph:CircuitGraph}
/** Functions operate directly on this caller-owned state; no engine keeps a graph mirror. */
export interface EditorDocumentState {
  drafts:CircuitDraft[];activeId:string|null;documentRevision:number
  draftRevisions:Record<string,number>;draftGraphRevisions:Record<string,number>
  past:string[];future:string[];saved:Record<string,string>;savedRevisions:Record<string,number>
}
export const MAX_HISTORY_STORAGE_BYTES=20_000_000
export function createEditorDocumentState():EditorDocumentState {
  return {drafts:[],activeId:null,documentRevision:0,draftRevisions:{},draftGraphRevisions:{},past:[],future:[],saved:{},savedRevisions:{}}
}
export const currentDocument=(state:EditorDocumentState)=>state.drafts.find(draft=>draft.id===state.activeId)??null
export const currentGraph=(state:EditorDocumentState)=>currentDocument(state)?.graph??null
export function touchDocument(state:EditorDocumentState,id=state.activeId,graphChanged=true) {
  state.documentRevision++
  if(id){state.draftRevisions[id]=state.documentRevision;if(graphChanged)state.draftGraphRevisions[id]=state.documentRevision}
}
/** Structural equality skips unchanged immutable branches and treats omitted optional fields consistently with JSON. */
export function equalDocumentValue(left:unknown,right:unknown):boolean {
  if(left===right)return true
  if(left===null||right===null||typeof left!=='object'||typeof right!=='object')return false
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>equalDocumentValue(value,right[index]))
  const a=left as Record<string,unknown>,b=right as Record<string,unknown>
  const keys=Object.keys(a).filter(key=>a[key]!==undefined),other=Object.keys(b).filter(key=>b[key]!==undefined)
  return keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&equalDocumentValue(a[key],b[key]))
}
interface CapturedMomentary {draftId:string;id:string;type:string;originalPressed:boolean|undefined;propertiesAbsent:boolean}
// Input ownership is ephemeral metadata, never a second graph or saved field.
const momentaryInputs=new WeakMap<EditorDocumentState,Map<string,CapturedMomentary>>()
const momentaryKey=(draftId:string,id:string)=>JSON.stringify([draftId,id])
function momentaryField(module:CircuitModule,pressed:boolean|undefined,propertiesAbsent:boolean):CircuitModule {
  const properties={...module.properties}
  if(pressed===undefined)delete properties.pressed;else properties.pressed=pressed
  if(propertiesAbsent&&!Object.keys(properties).length){const {properties:_,...rest}=module;return rest}
  return {...module,properties}
}
export function snapshotDocument(state:EditorDocumentState):string {
  const captures=momentaryInputs.get(state)
  if(!captures?.size)return JSON.stringify({drafts:state.drafts,activeId:state.activeId})
  // An authored edit or tab switch while a pointer is held must not make the
  // temporary press reachable through future Undo/Redo snapshots.
  const drafts=state.drafts.map(draft=>({...draft,graph:{...draft.graph,modules:draft.graph.modules.map(module=>{
    const held=captures.get(momentaryKey(draft.id,module.id))
    return held?.type===module.type?momentaryField(module,held.originalPressed,held.propertiesAbsent):module
  })}}))
  return JSON.stringify({drafts,activeId:state.activeId})
}
export function pruneSaved(state:EditorDocumentState) {
  const reachable=new Set(state.drafts.map(draft=>draft.id)),candidates=Object.keys(state.saved).filter(id=>!reachable.has(id))
  if(!candidates.length)return
  for(const snapshot of [...state.past,...state.future])for(const draft of (JSON.parse(snapshot) as {drafts:CircuitDraft[]}).drafts)reachable.add(draft.id)
  for(const id of candidates)if(!reachable.has(id)){delete state.saved[id];delete state.savedRevisions[id]}
}
export function trimHistory(state:EditorDocumentState) {
  let bytes=[...state.past,...state.future].reduce((total,snapshot)=>total+snapshot.length*2,0)
  // Preserve one immediate Undo/Redo even if its multi-draft snapshot exceeds the budget.
  while(state.past.length+state.future.length>1&&(state.past.length+state.future.length>50||bytes>MAX_HISTORY_STORAGE_BYTES)) {
    const removed=state.past.length?state.past.shift()!:state.future.shift()!;bytes-=removed.length*2
  }
  pruneSaved(state)
}
export function recordChange(state:EditorDocumentState){state.past.push(snapshotDocument(state));state.future=[];trimHistory(state)}
export function restoreDocument(state:EditorDocumentState,snapshot:string) {
  const restored=JSON.parse(snapshot) as {drafts:CircuitDraft[];activeId:string|null}
  state.drafts=restored.drafts;state.activeId=restored.activeId;state.documentRevision++
  state.draftRevisions=Object.fromEntries(state.drafts.map(draft=>[draft.id,state.documentRevision]))
  state.draftGraphRevisions={...state.draftRevisions}
  // Undo/Redo is an explicit snapshot boundary: reconcile the existing immutable save markers here.
  for(const draft of state.drafts)if(state.saved[draft.id]===JSON.stringify(draft))state.savedRevisions[draft.id]=state.documentRevision
}
export function undoDocument(state:EditorDocumentState){const previous=state.past.pop();if(previous){state.future.push(snapshotDocument(state));restoreDocument(state,previous);trimHistory(state)}}
export function redoDocument(state:EditorDocumentState){const next=state.future.pop();if(next){state.past.push(snapshotDocument(state));restoreDocument(state,next);trimHistory(state)}}
export function markSaved(state:EditorDocumentState){const draft=currentDocument(state);if(draft){state.saved[draft.id]=JSON.stringify(draft);state.savedRevisions[draft.id]=state.draftRevisions[draft.id]??0}}
export function isDocumentDirty(state:EditorDocumentState){const draft=currentDocument(state);return !!draft&&state.savedRevisions[draft.id]!==state.draftRevisions[draft.id]}
export function createDraft(state:EditorDocumentState,id:string,name?:string):string {
  recordChange(state)
  state.drafts.push({id,name:(name??`Untitled circuit ${state.drafts.length+1}`).trim()||'Untitled circuit',graph:{schema_version:'1.0',circuit_id:id,modules:[],connections:[]}})
  state.activeId=id;touchDocument(state);return id
}
export function openDraft(state:EditorDocumentState,id:string){if(state.activeId!==id&&state.drafts.some(draft=>draft.id===id)){recordChange(state);state.activeId=id;state.documentRevision++}}
export function renameCurrent(state:EditorDocumentState,name:string){const draft=currentDocument(state);if(draft&&name.trim()&&draft.name!==name.trim()){recordChange(state);draft.name=name.trim();touchDocument(state,draft.id,false)}}
function appendDocument(state:EditorDocumentState,id:string,name:string,graph:CircuitGraph) {
  recordChange(state);state.drafts.push({id,name,graph});state.activeId=id;touchDocument(state);markSaved(state)
}
export function replaceDocument(state:EditorDocumentState,id:string,document:{name:string;graph:CircuitGraph}) {
  appendDocument(state,id,document.name,parseCircuitFile(JSON.stringify(document.graph)))
}
export function importGraph(state:EditorDocumentState,id:string,graph:CircuitGraph) {
  const copy=parseCircuitFile(JSON.stringify(graph)),name=typeof copy.metadata?.name==='string'&&copy.metadata.name.trim()?copy.metadata.name.trim():'Imported circuit'
  appendDocument(state,id,name,copy)
}
export function exportGraph(state:EditorDocumentState):string {
  const draft=currentDocument(state);if(!draft)throw new Error('Create or open a circuit first.')
  const graph={...draft.graph,metadata:{...draft.graph.metadata,name:draft.name}},compact=JSON.stringify(graph)
  parseCircuitFile(compact);const pretty=JSON.stringify(graph,null,2)
  return new TextEncoder().encode(pretty).length<=MAX_CIRCUIT_FILE_BYTES?pretty:compact
}
export function commitGraph(state:EditorDocumentState,graph:CircuitGraph) {
  const draft=currentDocument(state);if(!draft)return
  const modules=synchronizeLabelBoardPoses(draft.graph.modules,graph.modules)
  if(modules!==graph.modules)graph={...graph,modules} as CircuitGraph
  if(equalDocumentValue(graph,draft.graph))return
  validateMountBindings(graph);recordChange(state);draft.graph=graph;touchDocument(state)
}
/** Validated live input changes graph revision for execution/observation, but
 * does not consume or invalidate authored Undo/Redo history. */
export function setMomentaryModule(state:EditorDocumentState,id:string,pressed:boolean) {
  if(typeof pressed!=='boolean')throw Error('Momentary input must be boolean.')
  if(!pressed){releaseMomentaryModule(state,state.activeId,id);return}
  const draft=currentDocument(state),module=draft?.graph.modules.find(item=>item.id===id),part=module&&getPartForModule(module)
  if(!draft||!module)return
  if(part?.package.family!=='switch'||!part.internalConnections?.some(connection=>connection.when?.property==='pressed'))throw Error('Select a supported momentary contact.')
  if(module.properties?.pressed!==undefined&&typeof module.properties.pressed!=='boolean')throw Error('Momentary input must be boolean.')
  const graph=parseCircuitFile(JSON.stringify({...draft.graph,modules:draft.graph.modules.map(item=>item===module?{...item,properties:{...item.properties,pressed:true}}:item)}))
  const captures=momentaryInputs.get(state)??new Map<string,CapturedMomentary>(),key=momentaryKey(draft.id,id)
  if(!captures.has(key))captures.set(key,{draftId:draft.id,id,type:module.type,originalPressed:module.properties?.pressed as boolean|undefined,propertiesAbsent:module.properties===undefined})
  momentaryInputs.set(state,captures)
  if(!equalDocumentValue(graph,draft.graph)){draft.graph=graph;touchDocument(state,draft.id)}
}
/** Release only an input captured through setMomentaryModule, in its original
 * draft. Unrelated imported or explicitly authored persistent values survive. */
export function releaseMomentaryModule(state:EditorDocumentState,draftId:string|null,id:string) {
  if(!draftId)return
  const captures=momentaryInputs.get(state),key=momentaryKey(draftId,id),held=captures?.get(key)
  if(!held)return
  const draft=state.drafts.find(item=>item.id===draftId),module=draft?.graph.modules.find(item=>item.id===id)
  if(!draft||!module||module.type!==held.type){captures!.delete(key);return}
  const graph=parseCircuitFile(JSON.stringify({...draft.graph,modules:draft.graph.modules.map(item=>item===module?momentaryField(item,held.originalPressed===undefined?undefined:false,held.propertiesAbsent):item)}))
  captures!.delete(key)
  if(!equalDocumentValue(graph,draft.graph)){draft.graph=graph;touchDocument(state,draft.id)}
  if(state.saved[draft.id]===JSON.stringify(draft))state.savedRevisions[draft.id]=state.draftRevisions[draft.id]??0
}
