import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import {configureApiClient} from '../src/services/api/client'
import {useAssignmentStore} from '../src/stores/assignments'
import {copyReferenceDesign} from '../src/application/assignments/authoring'
import type {AssignmentDefinition,AssignmentAuthoringDocument} from '../src/contracts/generated/dto'
const definition:AssignmentDefinition={schema_version:'1.0',assignment_id:'author-and',title:'Original',lab_endpoints:[],assessment_policy:'FUNCTIONAL_ONLY'}
const document:AssignmentAuthoringDocument={schema_version:'1.0',assignment_id:'author-and',title:'Original',owner_id:'teacher',revision:1,published:false,published_revision:null,feedback_policy:'observed_only',created_at:1,updated_at:1,definition}
function setup(){setActivePinia(createPinia());const store=useAssignmentStore();store.setScope('teacher','INSTRUCTOR');return store}
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve}}
test('author save ACK pins submitted revision while preserving newer teacher edits',async()=>{
 const store=setup(),ack=deferred<Response>();let body:unknown
 configureApiClient({fetcher:async(_url,options)=>options?.method==='PUT'?(body=JSON.parse(String(options.body)),ack.promise):Response.json(document)})
 assert.equal(await store.openDocument('author-and'),true)
 store.editDefinition({...store.draft!,title:'Submitted'})
 const saving=store.saveDraft();await new Promise(r=>setTimeout(r,0))
 store.editDefinition({...store.draft!,title:'Newer local edit'})
 ack.resolve(Response.json({...document,title:'Submitted',revision:2,definition:{...definition,title:'Submitted'}}))
 assert.equal(await saving,true);assert.equal(store.draft!.title,'Newer local edit');assert.equal(store.dirty,true);assert.equal(store.binding?.revision,2)
 assert.deepEqual(body,{base_revision:1,definition:{...definition,title:'Submitted'}})
 store.dispose()
})
test('assignment conflict keeps local answers and requires explicit discard before reload',async()=>{
 const store=setup();let reads=0
 configureApiClient({fetcher:async(_url,options)=>options?.method==='PUT'?Response.json({schema_version:'1.0',code:'REVISION_CONFLICT',message:'Changed',current_revision:3},{status:409}):Response.json({...document,title:++reads===1?'Original':'Remote',definition:{...definition,title:reads===1?'Original':'Remote'},revision:reads===1?1:3})})
 await store.openDocument('author-and');store.editDefinition({...definition,title:'Keep local',expected_behavior:{truth_table:[{inputs:{x:0},outputs:{y:1}}]}})
 assert.equal(await store.saveDraft(),false);assert.equal(store.phase,'conflict');assert.equal(store.draft!.title,'Keep local')
 assert.equal(await store.openDocument('author-and'),false);assert.equal(reads,1)
 assert.equal(await store.openDocument('author-and',true),true);assert.equal(store.draft!.title,'Remote');assert.equal(store.dirty,false)
 store.dispose()
})
test('publication uses only saved current revision; draft edits never change published pointer',async()=>{
 const store=setup();const bodies:unknown[]=[]
 configureApiClient({fetcher:async(_url,options)=>{if(options?.method==='PATCH'){bodies.push(JSON.parse(String(options.body)));return Response.json({...document,revision:2,published:true,published_revision:2})}return Response.json(document)}})
 await store.openDocument('author-and');store.editDefinition({...definition,title:'Unsaved'})
 assert.equal(await store.publish(true,'detailed'),false);assert.equal(bodies.length,0)
 await store.openDocument('author-and',true);assert.equal(await store.publish(true,'detailed'),true)
 assert.deepEqual(bodies,[{base_revision:1,published:true,feedback_policy:'detailed'}]);assert.equal(store.binding?.published_revision,2)
 store.editDefinition({...definition,title:'Next draft'});assert.equal(store.binding?.published_revision,2)
 store.dispose()
})
test('principal or role change synchronously erases private author data and ignores stale responses',async()=>{
 const store=setup(),late=deferred<Response>()
 configureApiClient({fetcher:async()=>late.promise})
 const opening=store.openDocument('author-and');store.setScope('student','STUDENT')
 assert.equal(store.draft,null);assert.equal(store.binding,null);assert.deepEqual(store.documents,[])
 late.resolve(Response.json(document));assert.equal(await opening,false);assert.equal(store.draft,null);assert.equal(store.canAuthor,false)
 store.setScope('teacher','INSTRUCTOR');store.newDraft('new-and');store.editDefinition({...store.draft!,title:'Unsaved private'})
 store.setScope('teacher','INSTRUCTOR');assert.equal(store.draft!.title,'Unsaved private')
 store.setScope('teacher','STUDENT');assert.equal(store.draft,null)
 store.dispose()
})

test('central authoring guard preserves unapplied source text across every open/save/publish entry point and scope reset',async()=>{
 const store=setup();let gets=0,mutations=0
 configureApiClient({fetcher:async(_url,options)=>{if(options?.method!=='GET')mutations++;else gets++;return Response.json(document)}})
 await store.openDocument('author-and');const text='{ "private":"Exact unapplied JSON" }';store.setDefinitionText(text)
 assert.equal(store.dirty,true);assert.equal(await store.openDocument('other'),false);assert.equal(await store.saveDraft(),false);assert.equal(await store.publish(true,'detailed'),false);assert.equal(gets,1);assert.equal(mutations,0);assert.equal(store.definitionText,text)
 assert.equal(await store.openDocument('author-and'),false);assert.equal(await store.openDocument('author-and',true),true);assert.equal(store.unappliedDefinition,false);assert.equal(JSON.parse(store.definitionText).title,'Original')
 store.setDefinitionText(text);store.setScope('student','STUDENT');assert.equal(store.definitionText,'');assert.equal(store.unappliedDefinition,false)
 store.dispose()
})
test('a new raw source edit made during a confirmed open survives its late response',async()=>{
 const store=setup(),late=deferred<Response>();let loading=false
 configureApiClient({fetcher:async()=>loading?late.promise:Response.json(document)});await store.openDocument('author-and');loading=true
 const opening=store.openDocument('author-and',true);const text='{"private":"Typed during load"}';store.setDefinitionText(text)
 late.resolve(Response.json({...document,title:'Remote',revision:2,definition:{...definition,title:'Remote'}}));assert.equal(await opening,false);assert.equal(store.definitionText,text);assert.equal(store.draft!.title,'Original');assert.equal(store.dirty,true)
 store.dispose()
})

test('flexible authoring selects v2 before mutation and retains its saved reference across reopen',async()=>{
 const store=setup(),paths:string[]=[]
 const flexible=copyReferenceDesign(definition,{schema_version:'1.2',circuit_id:'private-reference',modules:[],connections:[],metadata:{retain:true}})
 let saved={...document,schema_version:'2.0',definition:flexible}
 configureApiClient({fetcher:async(url,options)=>{
  paths.push(`${options?.method} ${String(url)}`)
  if(!String(url).includes('/v2/'))return Response.json({code:'UNSUPPORTED_DOCUMENT_VERSION',message:'Use the supported assignment endpoint.'},{status:422})
  if(options?.method==='PATCH')saved={...saved,revision:2,published:true,published_revision:2}
  return Response.json(saved)
 }})
 store.newDraft('author-and');store.editDefinition(flexible)
 assert.equal(await store.saveDraft(),true);assert.equal(store.binding?.schema_version,'2.0')
 assert.equal(await store.publish(true,'observed_only'),true)
 assert.equal(await store.openDocument('author-and',true),true)
 assert.deepEqual(store.draft,flexible)
 assert.equal(store.binding?.published_revision,2)
 assert.deepEqual(paths.map(value=>value.replace(/^.*?(\/api\/)/,'$1')),['/api/v2/assignment-documents','/api/v2/assignment-documents/author-and/publication','/api/assignment-documents/author-and','/api/v2/assignment-documents/author-and'])
 assert.deepEqual(paths.map(value=>value.split(' ')[0]),['POST','PATCH','GET','GET'])
 store.dispose()
})
