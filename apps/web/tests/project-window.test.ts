import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useProjectStore } from '../src/stores/projects'
import { useCircuitStore } from '../src/stores/circuit'
import { configureApiClient } from '../src/services/api/client'
import { loadSfc,mountSfc,dispatch } from './helpers/vueSfc'
import type { Project } from '../src/contracts/generated/dto'
const project:Project={schema_version:'1.0',project_id:'p1',owner_id:'owner',name:'Lab project',description:'',revision:1,created_at:1,updated_at:1,access_scope:'private'}
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));await nextTick()}
test('project window creates a project and saves the authoritative graph as a separate server document',async()=>{
  const pinia=createPinia();setActivePinia(pinia)
  const projects=useProjectStore(),circuit=useCircuitStore();await projects.setPrincipal('owner')
  circuit.renameCurrent('My circuit')
  const bodies:{url:string,body:unknown}[]=[]
  configureApiClient({fetcher:async(url,options)=>{
    if(options?.body)bodies.push({url:String(url),body:JSON.parse(String(options.body))})
    if(String(url)==='/api/projects'&&options?.method==='POST')return Response.json(project,{status:201})
    if(String(url).endsWith('/circuits')&&options?.method==='POST')return Response.json({schema_version:'1.0',document_id:'d1',project_id:'p1',owner_id:'owner',name:circuit.current!.name,graph:circuit.graph,graph_schema_version:'1.0',revision:1,created_at:1,updated_at:1},{status:201})
    return Response.json({schema_version:'1.0',items:[],next_cursor:null})
  }})
  const view=mountSfc(await loadSfc('components/windows/ProjectManagerWindow.vue'),pinia)
  try {
    await flush()
    const name=view.find('input','aria-label','New project name');assert.ok(name,'project creation field missing')
    dispatch(name,'onInput','Lab project')
    dispatch(view.find('button','aria-label','Create project'),'onClick');await flush()
    assert.equal(projects.selectedProjectId,'p1')
    dispatch(view.find('button','aria-label','Save circuit as new server document'),'onClick');await flush()
    assert.equal(projects.saveState.phase,'saved');assert.equal(projects.saveState.binding?.documentId,'d1')
    assert.deepEqual(bodies[0],{url:'/api/projects',body:{name:'Lab project',description:''}})
    assert.deepEqual(bodies[1],{url:'/api/projects/p1/circuits',body:{name:'My circuit',graph:JSON.parse(JSON.stringify(circuit.graph))}})
  }finally{view.app.unmount();projects.dispose()}
})

test('requested dirty navigation requires explicit replacement and Keep local preserves current graph',async()=>{
  const pinia=createPinia();setActivePinia(pinia)
  const projects=useProjectStore(),circuit=useCircuitStore();await projects.setPrincipal('owner');circuit.renameCurrent('Keep local')
  configureApiClient({fetcher:async()=>Response.json({schema_version:'1.0',items:[],next_cursor:null})})
  const view=mountSfc(await loadSfc('components/windows/ProjectManagerWindow.vue'),pinia)
  try{
    const before=circuit.snapshot();await projects.requestOpen('other');await nextTick()
    assert.ok(view.text().includes('Replace local circuit'))
    dispatch(view.find('button','aria-label','Keep local circuit'),'onClick');await nextTick()
    assert.equal(projects.requestedDocumentId,null);assert.equal(circuit.snapshot(),before)
  }finally{view.app.unmount();projects.dispose()}
})

test('changing selection after Delete cannot apply the confirmation to another project',async()=>{
  const pinia=createPinia();setActivePinia(pinia)
  const projects=useProjectStore();await projects.setPrincipal('owner');let deletes=0
  configureApiClient({fetcher:async(_url,options)=>{if(options?.method==='DELETE')deletes++;return Response.json({schema_version:'1.0',items:[],next_cursor:null})}})
  const view=mountSfc(await loadSfc('components/windows/ProjectManagerWindow.vue'),pinia)
  try{
    await flush();projects.projects=[project,{...project,project_id:'p2',name:'Other'}];projects.selectedProjectId='p1';await nextTick()
    dispatch(view.find('button','aria-label','Delete project'),'onClick');await nextTick()
    projects.selectedProjectId='p2';await nextTick()
    dispatch(view.find('button','aria-label','Confirm project action'),'onClick');await flush()
    assert.equal(deletes,0)
  }finally{view.app.unmount();projects.dispose()}
})
