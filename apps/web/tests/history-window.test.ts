import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {nextTick} from 'vue'
import {useExperimentStore} from '../src/stores/experiment'
import {useCircuitStore} from '../src/stores/circuit'
import {configureApiClient} from '../src/services/api/client'
import {runningExperiment} from './helpers/station'
import {loadSfc,mountSfc,dispatch} from './helpers/vueSfc'
const flush=async()=>{for(let n=0;n<6;n++)await new Promise(r=>setTimeout(r,0));await nextTick()}
test('history shows selected evidence separately and Stop still targets the owned current execution',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const experiment=useExperimentStore(),circuit=useCircuitStore();circuit.createDraft('Preserved editor');const before=circuit.snapshot()
 const live=runningExperiment(),past={...runningExperiment('COMPLETE'),experiment_id:'past',lease_expires_at:null};experiment.receive(live);experiment.receive(past);experiment.selectExperiment('past')
 const calls:string[]=[]
 configureApiClient({fetcher:async(url,options)=>{calls.push(String(url));if(options?.method==='POST')return Response.json({...live,state:'COMPLETE',revision:2,state_history:['CREATED','RUNNING','COMPLETE'],lease_expires_at:null});if(String(url).includes('/document-reference'))return Response.json({schema_version:'1.0',experiment_id:'past',snapshot_id:'snap',source:'INLINE_GRAPH',execution_mode:'simulation',circuit_id:'c1',graph_schema_version:'1.0'});return Response.json({schema_version:'1.0',items:[past,live],next_cursor:null})}})
 const view=mountSfc(await loadSfc('components/windows/ExperimentHistoryWindow.vue'),pinia)
 try{await flush();assert.ok(view.text().includes('Selected evidence'));assert.ok(view.text().includes('Read-only history'));assert.ok(view.text().includes('e1'));assert.ok(view.text().includes('past'))
 dispatch(view.find('button','aria-label','Stop current owned execution'),'onClick');await flush()
 assert.ok(calls.includes('/api/experiments/e1/stop'));assert.ok(!calls.includes('/api/experiments/past/stop'));assert.equal(experiment.activeId,'past');assert.equal(circuit.snapshot(),before)
 }finally{view.app.unmount();experiment.cancelPending()}
})
