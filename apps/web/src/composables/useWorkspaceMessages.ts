import { onScopeDispose,ref,watch } from 'vue'
import { useWorkspaceMessageStore } from '../stores/workspaceMessages'
import { useWorkspaceStore } from '../stores/workspace'
import { useCircuitStore } from '../stores/circuit'
import { useProjectStore } from '../stores/projects'
import { useInstrumentStore,type ConsoleEntry } from '../stores/instrument'
import { useExperimentStore } from '../stores/experiment'
import { useStationStore } from '../stores/station'
import { useAuthStore } from '../stores/auth'
import { useUiStore } from '../stores/ui'
import type { Experiment } from '../types/experiment'

/** Shell-owned, one-way presentation adapter. Actual source state resolves
 * errors; opening a Ribbon or rendering a frame never republishes messages. */
export function useWorkspaceMessages(){
  const messages=useWorkspaceMessageStore(),workspace=useWorkspaceStore(),circuit=useCircuitStore()
  const projects=useProjectStore(),instrument=useInstrumentStore(),experiment=useExperimentStore()
  const station=useStationStore(),auth=useAuthStore(),ui=useUiStore()
  let consoleFloor=instrument.nextEntryId-1,principalKey=''
  let pendingConsole: {entry:ConsoleEntry;principal:string;draft:string|null;owned:boolean}[]=[]
  const consoleVersion=ref(0)
  let executionKey='',executionId:string|null=null
  watch(()=>[auth.principal?.principal_id??null,auth.connectionEpoch,circuit.activeId] as const,([principal,epoch,draft])=>{
    const next=JSON.stringify([principal,epoch])
    if(next!==principalKey){consoleFloor=instrument.nextEntryId-1;principalKey=next;pendingConsole=[];executionKey='';executionId=null}
    messages.setScope(principal,epoch,draft)
  },{immediate:true,flush:'sync'})
  watch(()=>workspace.editError,text=>messages.setHint('editor-error',text,{level:'error'}),{immediate:true,flush:'sync'})
  watch(()=>projects.saveState.error,text=>messages.setHint('project-save',text??'',{level:'error',window:'projects'}),{immediate:true,flush:'sync'})
  watch(()=>projects.saveState.recoveryError,text=>messages.setHint('project-recovery',text??'',{level:'error',scope:'session',window:'projects'}),{immediate:true,flush:'sync'})
  watch(()=>projects.error??projects.navigationError,text=>messages.setHint('project-manager',text??'',{level:'error',scope:'session',window:'projects'}),{immediate:true,flush:'sync'})
  watch(()=>projects.saveState.phase,(phase,previous)=>{
    if(phase==='saved'&&previous==='saving'&&!auth.pending)messages.publish('project-saved','Circuit saved to the project.')
  },{flush:'sync'})
  watch(()=>experiment.error,text=>{
    messages.setHint('execution-error',text??'',{level:'error',scope:'session',window:'history'})
    // Lifecycle logging precedes its state assignment. Remember that this log
    // has a resolving owner even when that error is cleared before Vue flushes.
    for(const pending of pendingConsole)if(pending.entry.source==='execution'&&pending.entry.message===text)pending.owned=true
  },{immediate:true,flush:'sync'})
  watch(()=>station.error,text=>messages.setHint('station-error',text??'',{level:'error',scope:'session',window:'inspector'}),{immediate:true,flush:'sync'})
  watch(()=>instrument.configurationError,text=>messages.setHint('instrument-error',text??'',{level:'error',scope:'session',window:'inspector'}),{immediate:true,flush:'sync'})
  watch(()=>[ui.connectionState,auth.ready,auth.pending] as const,([state,ready,pending])=>{
    if(!ready||pending){messages.clearSource('connection');return}
    const text=state==='connected'?'Event connection established.':state==='reconnecting'?'Event connection lost. Retrying automatically.':state==='closed'?'Event connection closed. Open Inspector to check the connection.':''
    messages.setHint('connection',text,{scope:'session',level:state==='connected'?'info':'warning',window:'inspector'})
  },{immediate:true,flush:'sync'})
  function presentExecution(record:Experiment){
    const key=JSON.stringify([record.experiment_id,record.state,record.error_code])
    if(key===executionKey)return
    executionKey=key;executionId=record.experiment_id
    if(!['QUEUED','RUNNING','CAPTURING','VERIFYING','FUNCTIONAL_VERIFY','STOPPING','COMPLETE','FAULT'].includes(record.state))return
    // A fresh transition is a new event, even when another run had the same
    // state/text. Deactivate the prior state without removing bounded history.
    messages.clearSource('execution-state')
    const detail=record.error_code?` (${record.error_code})`:''
    messages.publish('execution-state',`Experiment ${record.experiment_id}: ${record.state.toLowerCase().replaceAll('_',' ')}${detail}.`,{level:record.state==='FAULT'?'error':'info',scope:'session',window:'history'})
  }
  if(experiment.currentExecution)presentExecution(experiment.currentExecution)
  // receive applies a validated revision and can release ownership before it
  // returns. Observe its result to retain the final COMPLETE/FAULT transition,
  // including polling history for that owner, while excluding unrelated
  // selected historical evidence and stale record revisions.
  const stopExecution=experiment.$onAction(({name,args,after})=>{
    if(name!=='receive')return
    const incoming=args[0] as Experiment
    const id=incoming?.experiment_id,wasOwned=experiment.ownedIds.includes(id)
    const owner=principalKey
    after(()=>{
      if(owner!==principalKey)return
      const applied=experiment.experiments.find(record=>record.experiment_id===id)
      const currentId=experiment.currentExecution?.experiment_id
      if(applied&&(wasOwned||currentId===id||args[1]==='request'||(!currentId&&executionId===id)))presentExecution(applied)
    })
  })
  watch(()=>instrument.entries.map(entry=>entry.id).join(','),()=>{
    for(const entry of instrument.entries){
      if(entry.id<=consoleFloor)continue
      consoleFloor=entry.id
      // These sources have an active-state owner, so resolved failures must
      // not reappear as immortal console events after reconnect or file actions.
      if(['file','connection','remote-snapshot'].includes(entry.source??''))continue
      pendingConsole.push({entry,principal:principalKey,draft:circuit.activeId,owned:entry.source==='execution'&&entry.message===experiment.error})
    }
    consoleVersion.value++
  },{flush:'sync'})
  watch(consoleVersion,()=>{
    const pending=pendingConsole;pendingConsole=[]
    for(const {entry,principal,draft,owned} of pending){
      if(owned||principal!==principalKey||(entry.scope==='draft'&&draft!==circuit.activeId))continue
      messages.publish(entry.source??'console',entry.message,{level:entry.level,scope:entry.scope??'session',window:'inspector'})
    }
  },{flush:'post'})
  onScopeDispose(()=>{stopExecution();pendingConsole=[];messages.$reset()})
  return messages
}
