import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {nextTick} from 'vue'
import type {AssignmentAuthoringCreate} from '../src/contracts/generated/dto'
import {useAssignmentStore} from '../src/stores/assignments'
import {useExperimentStore} from '../src/stores/experiment'
import {useCircuitStore} from '../src/stores/circuit'
import {configureApiClient} from '../src/services/api/client'
import {loadSfc,mountSfc,dispatch} from './helpers/vueSfc'
const flush=async()=>{for(let n=0;n<6;n++)await new Promise(r=>setTimeout(r,0));await nextTick()}
test('student assignment view displays only the public exercise and selects it without replacing editor graph',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const author=useAssignmentStore(),experiment=useExperimentStore(),circuit=useCircuitStore()
 author.setScope('student','STUDENT');circuit.createDraft('Keep circuit');const before=circuit.snapshot()
 configureApiClient({fetcher:async()=>Response.json([{schema_version:'1.0',assignment_id:'public-and',title:'Public AND',assessment_policy:'FUNCTIONAL_ONLY',lab_endpoints:[{endpoint_id:'y',role:'OUTPUT_SENSE',channel:1,required:true}],document_kind:'student',published:true,feedback_policy:'observed_only'}])})
 const view=mountSfc(await loadSfc('components/windows/AssignmentWindow.vue'),pinia)
 try{await flush();assert.ok(view.text().includes('Public AND'));assert.equal(view.find('button','aria-label','New assignment draft'),undefined);assert.equal(view.find('textarea','aria-label','Assignment definition JSON'),undefined)
 dispatch(view.find('button','aria-label','Use assignment Public AND'),'onClick');await nextTick();assert.equal(experiment.assignmentId,'public-and');assert.equal(circuit.snapshot(),before)
 }finally{view.app.unmount();author.dispose()}
})
test('instructor form saves reference snapshot and answers while keeping the current project unchanged',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const author=useAssignmentStore(),circuit=useCircuitStore();author.setScope('teacher','INSTRUCTOR');circuit.createDraft('Keep circuit');const before=circuit.snapshot();const bodies:AssignmentAuthoringCreate[]=[]
 configureApiClient({fetcher:async(url,options)=>{if(options?.method==='POST'){const body:AssignmentAuthoringCreate=JSON.parse(String(options.body));bodies.push(body);return Response.json({schema_version:'1.0',assignment_id:body.definition.assignment_id,title:body.definition.title,owner_id:'teacher',revision:1,published:false,published_revision:null,feedback_policy:'observed_only',created_at:1,updated_at:1,definition:body.definition},{status:201})}return Response.json(String(url).includes('assignment-documents')?{schema_version:'1.0',items:[],next_cursor:null}:[])}})
 const view=mountSfc(await loadSfc('components/windows/AssignmentWindow.vue'),pinia)
 try{await flush();dispatch(view.find('button','aria-label','New assignment draft'),'onClick');await nextTick();dispatch(view.find('input','aria-label','Assignment title'),'onInput','AND lesson');await nextTick()
 dispatch(view.find('button','aria-label','Use current circuit as reference'),'onClick');await nextTick()
 dispatch(view.find('input','aria-label','Truth row inputs'),'onInput','x=0');dispatch(view.find('input','aria-label','Truth row outputs'),'onInput','y=1');dispatch(view.find('button','aria-label','Add expected truth row'),'onClick');await nextTick()
 assert.equal(view.find('button','aria-label','Publish saved assignment')?.props.disabled,true)
 dispatch(view.find('select','aria-label','Assignment feedback policy'),'onChange','detailed');dispatch(view.find('button','aria-label','Save assignment draft'),'onClick');await flush();assert.equal(view.find('select','aria-label','Assignment feedback policy').props.value,'detailed')
 assert.equal(author.phase,'saved');const body=bodies[0]!;assert.equal(body.definition.title,'AND lesson');assert.deepEqual(body.definition.expected_behavior?.truth_table,[{inputs:{x:0},outputs:{y:1}}]);assert.deepEqual(body.definition.reference_design_graph,JSON.parse(before).drafts[0].graph);assert.equal(circuit.snapshot(),before)
 }finally{view.app.unmount();author.dispose()}
})

test('account switches clear private unfinished author form fields before another instructor opens a draft',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const author=useAssignmentStore();author.setScope('teacher-one','INSTRUCTOR')
 configureApiClient({fetcher:async url=>Response.json(String(url).includes('assignment-documents')?{schema_version:'1.0',items:[],next_cursor:null}:[])})
 const view=mountSfc(await loadSfc('components/windows/AssignmentWindow.vue'),pinia)
 try{await flush();dispatch(view.find('button','aria-label','New assignment draft'),'onClick');await nextTick();dispatch(view.find('input','aria-label','Truth row outputs'),'onInput','secret=1');dispatch(view.find('input','aria-label','Endpoint target'),'onInput','PRIVATE.OUT');await nextTick()
 author.setScope('teacher-two','INSTRUCTOR');await nextTick();dispatch(view.find('button','aria-label','New assignment draft'),'onClick');await nextTick()
 assert.equal(view.find('input','aria-label','Truth row outputs').props.value,'');assert.equal(view.find('input','aria-label','Endpoint target').props.value,'')
 }finally{view.app.unmount();author.dispose()}
})

test('unapplied advanced JSON is kept until assignment replacement is explicitly confirmed',async()=>{
 const pinia=createPinia();setActivePinia(pinia);const author=useAssignmentStore();author.setScope('teacher','INSTRUCTOR')
 const definition={schema_version:'1.0',assignment_id:'a',title:'First',lab_endpoints:[],assessment_policy:'FUNCTIONAL_ONLY'}
 const first={schema_version:'1.0',assignment_id:'a',title:'First',owner_id:'teacher',revision:1,published:false,published_revision:null,feedback_policy:'observed_only',created_at:1,updated_at:1,definition},second={...first,assignment_id:'b',title:'Second',definition:{...definition,assignment_id:'b',title:'Second'}}
 configureApiClient({fetcher:async url=>Response.json(String(url).endsWith('/a')?first:String(url).endsWith('/b')?second:String(url).includes('assignment-documents')?{schema_version:'1.0',items:[first,second].map(({definition:_,...value})=>value),next_cursor:null}:[])})
 await author.openDocument('a')
 const view=mountSfc(await loadSfc('components/windows/AssignmentWindow.vue'),pinia)
 try{await flush();const text='{ "unapplied":"Keep these exact edits" }';dispatch(view.find('textarea','aria-label','Assignment definition JSON'),'onInput',text);await nextTick();dispatch(view.find('button','aria-label','Edit assignment Second'),'onClick');await flush()
 assert.equal(author.binding?.assignment_id,'a');assert.ok(view.find('button','aria-label','Keep assignment changes'))
 dispatch(view.find('button','aria-label','Keep assignment changes'),'onClick');await nextTick();assert.equal(view.find('textarea','aria-label','Assignment definition JSON').props.value,text)
 dispatch(view.find('button','aria-label','Edit assignment Second'),'onClick');await nextTick();dispatch(view.find('button','aria-label','Replace assignment draft'),'onClick');await flush();assert.equal(author.binding?.assignment_id,'b');assert.ok(String(view.find('textarea','aria-label','Assignment definition JSON').props.value).includes('Second'))
 }finally{view.app.unmount();author.dispose()}
})
