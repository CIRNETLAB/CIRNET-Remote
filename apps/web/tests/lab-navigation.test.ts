import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createMemoryHistory,createRouter} from 'vue-router'
import {workspaceRoutes} from '../src/router/routes'
test('assignment and experiment deep links carry selection state inside the existing workspace',async()=>{
 const router=createRouter({history:createMemoryHistory(),routes:workspaceRoutes})
 for(const [path,name] of [['/assignments/public','AssignmentWorkspace'],['/assignment-documents/private','AssignmentAuthoring'],['/experiments/past','ExperimentEvidence']]){await router.push(path);assert.equal(router.currentRoute.value.name,name);assert.equal(router.currentRoute.value.path,path)}
})

import {defineComponent,h,provide} from 'vue'
import {routerKey,routeLocationKey} from 'vue-router'
import {createPinia,setActivePinia} from 'pinia'
import {useLabNavigation} from '../src/composables/useLabNavigation'
import {useAuthStore} from '../src/stores/auth'
import {useExperimentStore} from '../src/stores/experiment'
import {sessionFixture} from './helpers/auth'
import {runningExperiment} from './helpers/station'
import {configureApiClient} from '../src/services/api/client'
import {mountSfc} from './helpers/vueSfc'
const flush=async()=>{for(let n=0;n<8;n++)await new Promise(r=>setTimeout(r,0))}
test('opening a deep-linked CREATED record selects history evidence without granting an owned execution',async()=>{
 const pinia=createPinia();setActivePinia(pinia);useAuthStore().acceptSession(sessionFixture('STUDENT'))
 const router=createRouter({history:createMemoryHistory(),routes:workspaceRoutes});await router.push('/experiments/e1')
 const Child=defineComponent({setup(){useLabNavigation();return()=>null}}),Root=defineComponent({setup(){provide(routerKey,router);provide(routeLocationKey,router.currentRoute.value);return()=>h(Child)}})
 configureApiClient({fetcher:async()=>Response.json({...runningExperiment('CREATED'),state_history:['CREATED'],lease_expires_at:null})})
 const view=mountSfc(Root,pinia)
 try{await flush();const experiment=useExperimentStore();assert.equal(experiment.activeId,'e1');assert.equal(experiment.ownedActiveId,null);assert.equal(experiment.canStop,false)}finally{view.app.unmount()}
})

import {reactive,watch,nextTick} from 'vue'
import {useAssignmentStore} from '../src/stores/assignments'
import {loadSfc,dispatch} from './helpers/vueSfc'
test('real router navigation preserves exact unapplied author JSON until explicit replacement',async()=>{
 const pinia=createPinia();setActivePinia(pinia);useAuthStore().acceptSession(sessionFixture('INSTRUCTOR'))
 const router=createRouter({history:createMemoryHistory(),routes:workspaceRoutes});await router.push('/assignment-documents/a')
 const document=(id:string)=>({schema_version:'1.0',assignment_id:id,title:id,owner_id:'account-user',revision:1,published:false,published_revision:null,feedback_policy:'observed_only',created_at:1,updated_at:1,definition:{schema_version:'1.0',assignment_id:id,title:id,lab_endpoints:[],assessment_policy:'FUNCTIONAL_ONLY'}})
 configureApiClient({fetcher:async url=>Response.json(String(url).endsWith('/a')?document('a'):String(url).endsWith('/b')?document('b'):String(url).includes('assignment-documents')?{schema_version:'1.0',items:[],next_cursor:null}:[])})
 const Window=await loadSfc('components/windows/AssignmentWindow.vue'),Nav=defineComponent({setup(){useLabNavigation();return()=>null}})
 const Root=defineComponent({setup(){const route=reactive({...router.currentRoute.value});watch(router.currentRoute,value=>Object.assign(route,value),{flush:'sync'});provide(routerKey,router);provide(routeLocationKey,route);return()=>h('div',[h(Nav),h(Window)])}})
 const view=mountSfc(Root,pinia)
 try{await flush();const text='{ "private":"Keep exact unapplied source" }';dispatch(view.find('textarea','aria-label','Assignment definition JSON'),'onInput',text);await nextTick();await router.push('/assignment-documents/b');await flush()
 const author=useAssignmentStore();assert.equal(author.binding?.assignment_id,'a');assert.ok(view.find('button','aria-label','Keep assignment changes'));dispatch(view.find('button','aria-label','Keep assignment changes'),'onClick');await nextTick();assert.equal(view.find('textarea','aria-label','Assignment definition JSON').props.value,text)
 await router.push('/assignment-documents/a');await router.push('/assignment-documents/b');await flush();dispatch(view.find('button','aria-label','Replace assignment draft'),'onClick');await flush();assert.equal(author.binding?.assignment_id,'b');assert.equal(author.unappliedDefinition,false)
 }finally{view.app.unmount()}
})
