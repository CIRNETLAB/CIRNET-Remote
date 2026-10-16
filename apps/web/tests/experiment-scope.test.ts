import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { configureApiClient } from '../src/services/api/client'
import { useExperimentStore } from '../src/stores/experiment'
import { runningExperiment } from './helpers/station'
import { deferred } from './helpers/capture'

const record=(owner:string,state='COMPLETE')=>({...runningExperiment(),experiment_id:owner,circuit_id:owner,state,state_history:['CREATED',state],revision:5,capture:null,lease_expires_at:state==='RUNNING'?100:null})
const assignment=(owner:string)=>({schema_version:'1.0',assignment_id:owner,title:owner,assessment_policy:'FUNCTIONAL_ONLY',lab_endpoints:[],document_kind:'student',published:true,feedback_policy:'observed_only'})
const queue=(owner:string)=>({schema_version:'1.0',station_id:'v1',busy:true,queued_count:1,own_positions:[{experiment_id:owner,position:1}]})
for(const kind of ['history','active','queue','assignments','selected','activeGet'] as const){
  test(`a late ${kind} read cannot publish prior-principal private evidence after reset and a new read`,async()=>{
    setActivePinia(createPinia());const store=useExperimentStore(),late=deferred<Response>()
    let first=true
    const payload=(owner:string,url:string):unknown=>{
      if(url.includes('/history'))return {schema_version:'1.0',items:[record(owner)],next_cursor:null}
      if(url.includes('/active'))return {schema_version:'1.0',items:owner==='old-private'?[record(owner,'RUNNING')]:[],next_cursor:null}
      if(url.includes('/queue'))return queue(owner)
      if(url.endsWith('/assignments'))return [assignment(owner)]
      return record(owner)
    }
    let oldUrl=''
    configureApiClient({fetcher:async url=>{
      if(first){first=false;oldUrl=String(url);return late.promise}
      return Response.json(payload('new-private',String(url)))
    }})
    async function read(owner:string){
      if(kind==='history')return store.refreshHistory()
      if(kind==='active')return store.refreshOwned()
      if(kind==='queue')return store.refreshQueue('v1')
      if(kind==='assignments')return store.loadAssignments()
      if(kind==='selected'){store.receive(record(owner),'history');store.selectExperiment(owner);return store.refreshSelectedEvidence()}
      store.receive(record(owner,'RUNNING'));return store.refreshActive()
    }
    const old=read('old-private');await Promise.resolve()
    store.cancelPending();store.$reset();await read('new-private')
    late.resolve(Response.json(payload('old-private',oldUrl)));await old
    assert.equal(JSON.stringify(store.$state).includes('old-private'),false)
  })
}
