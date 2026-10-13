import { defineStore } from 'pinia'
import type { CircuitGraph } from '../types/circuit'
import type { Experiment, ExperimentInput } from '../types/experiment'
import type { AssignmentDefinition, CaptureConfiguration } from '../types/lab'
import type { StationDescriptor } from '../types/station'
import { canStationExecute } from '../types/station'
import { parseExperiment, experimentsApi } from '../services/api/experiments'
import { assignmentsApi } from '../services/api/assignments'
import { errorMessage } from '../services/api/client'
import { useInstrumentStore } from './instrument'

const terminal=(e:Experiment|null)=>!e||((e.state==='COMPLETE'||e.state==='FAULT')&&e.lease_expires_at===null)
const controllers=new WeakMap<object,AbortController>()

export const useExperimentStore=defineStore('experiment',{
  state:()=>({experiments:[] as Experiment[],activeId:null as string|null,pending:false,error:null as string|null,
    assignments:[] as AssignmentDefinition[],assignmentId:null as string|null,requestVersion:0}),
  getters:{
    active:(state):Experiment|null=>state.experiments.find(e=>e.experiment_id===state.activeId)??null,
    state():string {return this.active?.state??'idle'},
    busy():boolean {return this.pending||!terminal(this.active)},
    canStop():boolean {return this.pending||(!terminal(this.active)&&!['RELEASE','SAFE_STATE'].includes(this.active!.state))},
  },
  actions:{
    receive(value:unknown) {
      const record=parseExperiment(value)
      const previous=this.experiments.find(e=>e.experiment_id===record.experiment_id)
      if(previous&&previous.revision>=record.revision) return
      this.experiments=[...this.experiments.filter(e=>e.experiment_id!==record.experiment_id),record].slice(-20)
      if(this.activeId===record.experiment_id) useInstrumentStore().useCapture(record.capture)
    },
    async loadAssignments(signal?:AbortSignal) {
      try { const values=await assignmentsApi.list(signal); if(!signal?.aborted) this.assignments=values }
      catch(error) {if(!signal?.aborted) useInstrumentStore().log(errorMessage(error),'error')}
    },
    async run(graph:CircuitGraph|null,target:StationDescriptor|null,capture?:CaptureConfiguration):Promise<boolean> {
      if(this.busy||!canStationExecute(target)) return false
      if(!target) return false
      if(target.mode==='hardware'&&!this.assignmentId) {this.error='Select an assignment for physical execution.';return false}
      if(target.mode==='simulation'&&!graph) {this.error='Open a circuit before virtual execution.';return false}
      const version=++this.requestVersion
      controllers.get(this)?.abort();const controller=new AbortController();controllers.set(this,controller)
      const signal=controller.signal
      this.pending=true; this.error=null
      useInstrumentStore().useCapture(null)
      try {
        const body=JSON.parse(JSON.stringify({station_id:target.station_id,
          ...(this.assignmentId?{assignment_id:this.assignmentId}:{}),
          ...(target.mode==='simulation'?{circuit_graph:graph}:{}),
          ...(capture?{capture_config:capture}:{})})) as ExperimentInput
        const created=await experimentsApi.create(body,signal)
        if(signal.aborted||version!==this.requestVersion) return false
        this.activeId=created.experiment_id; this.receive(created)
        const started=await experimentsApi.run(created.experiment_id,signal)
        if(signal.aborted||version!==this.requestVersion) return false
        this.receive(started)
        return true
      } catch(error) {
        if(!signal.aborted&&version===this.requestVersion) {this.error=errorMessage(error);useInstrumentStore().log(this.error,'error')}
        return false
      } finally {if(version===this.requestVersion) this.pending=false}
    },
    async stop():Promise<void> {
      ++this.requestVersion;controllers.get(this)?.abort();controllers.delete(this);this.pending=false
      const id=this.activeId
      if(!id||terminal(this.active)) return
      try {this.receive(await experimentsApi.stop(id))}
      catch(error) {this.error=errorMessage(error);useInstrumentStore().log(this.error,'error')}
    },
    async refreshActive(signal?:AbortSignal) {
      const id=this.activeId
      if(!id||terminal(this.active)) return
      try {const value=await experimentsApi.get(id,signal); if(!signal?.aborted&&this.activeId===id) this.receive(value)}
      catch(error) {if(!signal?.aborted) this.error=errorMessage(error)}
    },
    cancelPending() {++this.requestVersion;controllers.get(this)?.abort();controllers.delete(this);this.pending=false},
  },
})
