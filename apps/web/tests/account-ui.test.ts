import { beforeEach,test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useAuthStore } from '../src/stores/auth'
import { configureApiClient } from '../src/services/api/client'
import { loadSfc,mountSfc,dispatch } from './helpers/vueSfc'
import { sessionFixture } from './helpers/auth'

beforeEach(()=>{setActivePinia(createPinia());configureApiClient({fetcher:async()=>Response.json([])})})

test('account opens a labelled login dialog and preserves a role-restricted account surface',async()=>{
  const pinia=createPinia();setActivePinia(pinia);const auth=useAuthStore();auth.acceptSession(sessionFixture())
  const view=mountSfc(await loadSfc('components/account/AccountMenu.vue'),pinia)
  try {
    const open=view.find('button','aria-label','Open account');assert.ok(open);dispatch(open,'onClick');await nextTick()
    assert.ok(view.find('section','role','dialog'));assert.ok(view.find('input','aria-label','Username'))
    assert.equal(view.find('input','aria-label','Password').props.type,'password')
    assert.equal(view.find('section','aria-label','User administration'),undefined)
    auth.error='Username or password is incorrect.';await nextTick();assert.match(view.text(),/incorrect/)
    dispatch(view.find('button','aria-label','Close account'),'onClick');await nextTick()
    assert.equal(view.find('section','role','dialog'),undefined)
  } finally {view.app.unmount()}
})

test('administrator user controls disappear when principal authorization is invalidated',async()=>{
  const pinia=createPinia();setActivePinia(pinia);const auth=useAuthStore();auth.acceptSession(sessionFixture('ADMIN'))
  const view=mountSfc(await loadSfc('components/account/AccountMenu.vue'),pinia)
  try {
    const open=view.find('button','aria-label','Open account');assert.ok(open);dispatch(open,'onClick');await nextTick()
    assert.ok(view.find('section','aria-label','User administration'))
    assert.ok(view.find('input','aria-label','New username'))
    auth.invalidate();await nextTick()
    assert.equal(view.find('section','aria-label','User administration'),undefined)
  } finally {view.app.unmount()}
})

test('guest claim is an explicit confirmed action and never fires when the account opens',async()=>{
  const pinia=createPinia();setActivePinia(pinia);const auth=useAuthStore();auth.acceptSession(sessionFixture('STUDENT'))
  let claims=0
  configureApiClient({fetcher:async(url,options)=>{if(String(url).endsWith('/claim-guest')) {claims++;assert.deepEqual(JSON.parse(String(options?.body)),{confirm:true})}return Response.json({...sessionFixture('STUDENT'),claim_available:false})}})
  const view=mountSfc(await loadSfc('components/account/AccountMenu.vue'),pinia)
  try {
    const open=view.find('button','aria-label','Open account');assert.ok(open);dispatch(open,'onClick');await nextTick()
    const claim=view.find('button','aria-label','Claim guest data');assert.ok(claim);assert.equal(Boolean(claim.props.disabled),true);assert.equal(claims,0)
    dispatch(view.find('input','aria-label','Confirm guest data transfer'),'onChange',true);await nextTick()
    assert.equal(Boolean(view.find('button','aria-label','Claim guest data').props.disabled),false)
    dispatch(view.find('button','aria-label','Claim guest data'),'onClick');await new Promise(resolve=>setTimeout(resolve,0));await nextTick()
    assert.equal(claims,1)
  } finally {view.app.unmount()}
})
