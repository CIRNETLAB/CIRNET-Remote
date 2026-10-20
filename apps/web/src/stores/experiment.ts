import type {PreRunConfiguration} from '../application/instruments/configuration'
import { StoreScopeMap } from '../services/session/storeScope'
import { defineStore } from 'pinia'
import type { CircuitGraph } from '../types/circuit'
import type { Experiment, ExperimentInput } from '../types/experiment'
import type { CaptureConfiguration } from '../types/lab'
import type { QueueState } from '../contracts/generated/dto'
import type { AssignmentView } from '../types/assignment'
import type { StationDescriptor } from '../types/station'
import { canStationExecute } from '../types/station'
import { parseExperiment, experimentsApi } from '../services/api/experiments'
import { assignmentsApi } from '../services/api/assignments'
import { historyApi } from '../services/api/history'
import { errorMessage } from '../services/api/client'
import type { ExperimentPresentationPort } from '../application/ports/lab'
import { ExperimentLifecycleController,isReleasedExperiment } from '../application/experimentLifecycle'
import {browserPendingObservations} from '../services/recovery/pendingObservations'
const observationPrincipals=new StoreScopeMap<string>()

const terminal=isReleasedExperiment
const controllers=new StoreScopeMap<ExperimentLifecycleController>()
const presentation=new StoreScopeMap<ExperimentPresentationPort>()
const readScopes=new StoreScopeMap<{controller:AbortController}>()
function readScope(owner:object,signal?:AbortSignal){
  let scope=readScopes.get(owner)
  if(!scope){scope={controller:new AbortController()};readScopes.set(owner,scope)}
  const currentScope=scope,combined=signal?AbortSignal.any([signal,scope.controller.signal]):scope.controller.signal
  return {signal:combined,current:()=>readScopes.get(owner)===currentScope,active:()=>readScopes.get(owner)===currentScope&&!combined.aborted}
}
function invalidateReadScope(owner:object){const previous=readScopes.get(owner);readScopes.set(owner,{controller:new AbortController()});previous?.controller.abort()}

export const useExperimentStore=defineStore('experiment',{
  state:()=>({experiments:[] as Experiment[],activeId:null as string|null,pending:false,error:null as string|null,
    assignments:[] as AssignmentView[],assignmentId:null as string|null,requestVersion:0,
    ownedActiveId:null as string|null,controlledExperimentId:null as string|null,requestStatus:'idle' as 'idle'|'creating'|'starting'|'stopping'|'reconciling'|'unknown',unresolvedOperation:false,
    history:[] as Experiment[],historyLoading:false,historyError:null as string|null,nextHistoryCursor:null as string|null,selectionVersion:0,requestSelectionVersion:0,
    historyVersion:0,activeSnapshotIncomplete:false,remoteStateConfirmed:true,ownedIds:[] as string[],requestedExperimentId:null as string|null,
    queues:{} as Record<string,QueueState>,queueVersions:{} as Record<string,number>}),
  getters:{
    active:(state):Experiment|null=>state.experiments.find(e=>e.experiment_id===state.activeId)??null,
    state():string {return this.active?.state??'idle'},
    currentExecution:(state):Experiment|null=>state.experiments.find(e=>e.experiment_id===state.ownedActiveId)??null,
    executionState():string{return this.currentExecution?.state??(this.requestStatus==='unknown'?'unknown':'idle')},
    busy():boolean {return !this.remoteStateConfirmed||this.pending||this.unresolvedOperation||this.activeSnapshotIncomplete||!terminal(this.currentExecution)},
    canStop():boolean {return this.pending||this.unresolvedOperation||(!terminal(this.currentExecution)&&!['RELEASE','SAFE_STATE'].includes(this.currentExecution!.state))},
  },
  actions:{
    lifecycle():ExperimentLifecycleController {
      const existing=controllers.get(this);if(existing)return existing
      const controller=new ExperimentLifecycleController({
        ...(observationPrincipals.get(this)?{observations:browserPendingObservations.scope(observationPrincipals.get(this)!)}:{}),
        create:(body,signal,key)=>experimentsApi.create(body,signal,key),run:(id,signal,key)=>experimentsApi.run(id,signal,key),
        stop:(id,signal,key)=>experimentsApi.stop(id,signal,key),operation:(key,query,signal)=>experimentsApi.operation(key,query,signal),
        get:(id,signal)=>experimentsApi.get(id,signal),owned:()=>this.currentExecution,key:()=>crypto.randomUUID(),
        receive:(record,select)=>{if(select)this.requestedExperimentId=record.experiment_id;this.receive(record,'request');if(select&&this.selectionVersion===this.requestSelectionVersion){this.activeId=record.experiment_id;presentation.get(this)?.useCapture(this.active?.capture??null)}},
        changed:state=>{this.pending=state.pending;this.requestStatus=state.requestStatus;this.controlledExperimentId=state.controlledExperimentId;this.unresolvedOperation=state.unresolved;if(state.error&&state.error!==this.error)presentation.get(this)?.log(state.error,'error');this.error=state.error},
      })
      controllers.set(this,controller);return controller
    },
    setObservationPrincipal(id:string|null){
      if(observationPrincipals.get(this)===id)return
      controllers.get(this)?.cancel();controllers.delete(this)
      if(id){observationPrincipals.set(this,id);this.lifecycle()}else observationPrincipals.delete(this)
    },
    forgetPendingObservation(){return this.lifecycle().forgetPending()},
    selectExperiment(id:string){const record=this.experiments.find(value=>value.experiment_id===id)??this.history.find(value=>value.experiment_id===id);if(!record)return;this.selectionVersion++;this.activeId=id;this.receive(record,'history');presentation.get(this)?.useCapture(this.active?.capture??record.capture)},
    showCurrentExecution(){if(this.ownedActiveId)this.selectExperiment(this.ownedActiveId)},
    attachPresentation(port:ExperimentPresentationPort) {
      const owner=this
      presentation.set(owner,port)
      return ()=>{if(presentation.get(owner)===port) presentation.delete(owner)}
    },
    receive(value:unknown,source:'event'|'history'|'owned'|'request'='event') {
      const incoming=parseExperiment(value)
      const previous=this.experiments.find(e=>e.experiment_id===incoming.experiment_id)
      const record=previous&&previous.revision>=incoming.revision?previous:incoming,changed=record!==previous
      const values=[...this.experiments.filter(e=>e.experiment_id!==record.experiment_id),record]
      this.experiments=values.filter(value=>!terminal(value)||value.experiment_id===this.activeId).concat(values.filter(value=>terminal(value)&&value.experiment_id!==this.activeId).slice(-20))
      if(source!=='history'&&!terminal(record)&&!this.ownedIds.includes(record.experiment_id))this.ownedIds.push(record.experiment_id)
      if(terminal(record)){this.ownedIds=this.ownedIds.filter(id=>id!==record.experiment_id);if(this.requestedExperimentId===record.experiment_id)this.requestedExperimentId=null}
      const candidates=this.ownedIds.map(id=>this.experiments.find(value=>value.experiment_id===id)).filter((value):value is Experiment=>!!value&&!terminal(value))
      this.ownedActiveId=candidates.find(value=>value.experiment_id===this.requestedExperimentId)?.experiment_id
        ??candidates.find(value=>value.experiment_id===this.ownedActiveId&&value.state!=='CREATED')?.experiment_id
        ??candidates.find(value=>value.state!=='CREATED')?.experiment_id
        ??candidates.find(value=>value.experiment_id===this.ownedActiveId)?.experiment_id??candidates[0]?.experiment_id??null
      controllers.get(this)?.observe(record)
      if(changed)this.history=this.history.map(value=>value.experiment_id===record.experiment_id?record:value)
      if(changed&&this.activeId===record.experiment_id) presentation.get(this)?.useCapture(record.capture)
    },
    async loadAssignments(signal?:AbortSignal) {
      const scope=readScope(this,signal)
      try { const values=await assignmentsApi.list(scope.signal); if(scope.active()) this.assignments=values }
      catch(error) {if(scope.active()) presentation.get(this)?.log(errorMessage(error),'error')}
    },
    async run(graph:CircuitGraph|null,target:StationDescriptor|null,capture?:CaptureConfiguration,savedReference?:{document_id:string;revision:number}|null,configuration?:PreRunConfiguration):Promise<boolean> {
      if(this.busy||!canStationExecute(target)) return false
      if(!target) return false
      if(target.mode==='hardware'&&!this.assignmentId) {this.error='Select an assignment for physical execution.';return false}
      if(target.mode==='simulation'&&!graph) {this.error='Open a circuit before virtual execution.';return false}
      this.error=null;this.activeId=null;this.requestSelectionVersion=this.selectionVersion;presentation.get(this)?.useCapture(null)
      const body=JSON.parse(JSON.stringify({station_id:target.station_id,
        ...(this.assignmentId?{assignment_id:this.assignmentId}:{}),
        ...(target.mode==='simulation'?(savedReference?{circuit_document_id:savedReference.document_id,circuit_revision:savedReference.revision}:{circuit_graph:graph}):{}),
        ...((configuration?.capture_config??capture)?{capture_config:configuration?.capture_config??capture}:{}),
        ...(configuration?.clock_config?{clock_config:configuration.clock_config}:{}),
        ...(configuration?.generator_config?{generator_config:configuration.generator_config}:{}),
        ...(configuration?.test_vectors?{test_vectors:configuration.test_vectors}:{})})) as ExperimentInput
      return this.lifecycle().run(body)
    },
    async stop():Promise<void> {await this.lifecycle().stop()},
    async reconcileOperations(signal?:AbortSignal){await this.lifecycle().reconcile(readScope(this,signal).signal)},
    requireReconciliation(){this.remoteStateConfirmed=false},
    async refreshHistory(append=false,signal?:AbortSignal):Promise<boolean>{
      if(append&&!this.nextHistoryCursor)return false
      const scope=readScope(this,signal);signal=scope.signal
      const version=++this.historyVersion,cursor=append?this.nextHistoryCursor:null
      this.historyLoading=true;this.historyError=null
      try{
        const page=await historyApi.history({limit:50,...(cursor?{cursor}:{})},signal)
        if(!scope.active()||version!==this.historyVersion)return false
        page.items.forEach(record=>this.receive(record,'history'))
        const values=page.items.map(record=>this.experiments.find(current=>current.experiment_id===record.experiment_id)??record)
        this.history=append?[...new Map([...this.history,...values].map(record=>[record.experiment_id,record])).values()].slice(-200):values
        this.nextHistoryCursor=page.next_cursor;return true
      }catch(error){if(scope.active()&&version===this.historyVersion)this.historyError=errorMessage(error);return false}
      finally{if(scope.current()&&version===this.historyVersion)this.historyLoading=false}
    },
    async refreshOwned(signal?:AbortSignal):Promise<boolean>{
      const scope=readScope(this,signal);signal=scope.signal
      const selection=this.selectionVersion
      try{
        let cursor:string|undefined,pages=0
        const seen=new Set<string>()
        do{
          const page=await historyApi.active(signal,cursor)
          if(!scope.active())return false
          this.restoreOwned(page.items,selection)
          cursor=page.next_cursor??undefined
          if(cursor&&seen.has(cursor))throw new Error('The active snapshot returned a repeated page cursor.')
          if(cursor)seen.add(cursor)
        }while(cursor&&++pages<4)
        this.activeSnapshotIncomplete=cursor!==undefined
        this.remoteStateConfirmed=cursor===undefined
        if(cursor)this.historyError='The active snapshot exceeds the current page budget. Run remains disabled until all owned execution state can be confirmed.'
        await this.refreshActive(signal)
        return !cursor
      }catch(error){if(scope.active())this.historyError=errorMessage(error);return false}
    },
    async refreshQueue(stationId:string,signal?:AbortSignal):Promise<boolean>{
      const scope=readScope(this,signal);signal=scope.signal
      const version=(this.queueVersions[stationId]??0)+1;this.queueVersions[stationId]=version
      try{const queue=await historyApi.queue(stationId,signal);if(!scope.active()||this.queueVersions[stationId]!==version)return false;this.queues={...this.queues,[stationId]:queue};return true}
      catch(error){if(scope.active()&&this.queueVersions[stationId]===version)this.historyError=errorMessage(error);return false}
    },
    restoreOwned(records:Experiment[],selectionVersion?:number){
      const version=selectionVersion??this.selectionVersion
      records.forEach(record=>this.receive(record,'owned'))
      if(version===0&&this.selectionVersion===version&&!this.activeId&&this.ownedActiveId){this.activeId=this.ownedActiveId;presentation.get(this)?.useCapture(this.active?.capture??null)}
    },
    async refreshSelectedEvidence(signal?:AbortSignal):Promise<boolean>{
      const id=this.activeId;if(!id)return false
      const scope=readScope(this,signal)
      try{const value=await experimentsApi.get(id,scope.signal);if(!scope.active())return false;this.receive(value,'history');return true}
      catch(error){if(scope.active())this.historyError=errorMessage(error);return false}
    },
    async refreshActive(signal?:AbortSignal) {
      const scope=readScope(this,signal);signal=scope.signal
      await this.lifecycle().reconcile(signal)
      if(!scope.active())return
      const id=this.ownedActiveId
      if(!id||terminal(this.currentExecution)) return
      try {const value=await experimentsApi.get(id,signal); if(scope.active()) this.receive(value)}
      catch(error) {if(scope.active()) this.error=errorMessage(error)}
    },
    cancelPending() {invalidateReadScope(this);++this.requestVersion;controllers.get(this)?.cancel();controllers.delete(this);this.pending=false},
  },
})
