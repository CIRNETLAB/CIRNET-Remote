import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createPinia} from 'pinia'
import {defineComponent,nextTick} from 'vue'
import {mountSfc} from './helpers/vueSfc'
import {deferred} from './helpers/capture'
import {sessionFixture} from './helpers/auth'
import type {SocketLike} from '../src/services/websocket/client'

async function connectionRuntime(){
 const outfile=resolve('.test-build',`${process.pid}-auth-rotation-runtime.mjs`)
 await build({stdin:{contents:`export {useLabConnection} from './src/composables/useLabConnection';export {useAuthStore} from './src/stores/auth';export {configureApiClient} from './src/services/api/client'`,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':'{}'}})
 return await import(pathToFileURL(outfile).href) as typeof import('../src/composables/useLabConnection')&typeof import('../src/stores/auth')&typeof import('../src/services/api/client')
}

for(const rotation of ['login','claimGuest'] as const)test(`a revoked old socket during successful ${rotation} cannot abort or invalidate the rotated session`,async()=>{
 const runtime=await connectionRuntime(),pinia=createPinia(),auth=runtime.useAuthStore(pinia),response=deferred<Response>(),sockets:SocketLike[]=[]
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousSocket=globalThis.WebSocket
 Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{protocol:'http:',host:'testserver'}}})
 class Socket implements SocketLike{
  onopen:SocketLike['onopen']=null;onclose:SocketLike['onclose']=null;onerror:SocketLike['onerror']=null;onmessage:SocketLike['onmessage']=null
  constructor(){sockets.push(this)}close(){}send(){}
 }
 globalThis.WebSocket=Socket as unknown as typeof WebSocket
 let loginSignal:AbortSignal|undefined
 const guest={...sessionFixture(),authenticated:false,principal:{principal_id:'guest-1',kind:'GUEST',role:'STUDENT'},claim_available:false}
 runtime.configureApiClient({csrfToken:()=>auth.csrfToken,onAuthenticationLost:()=>auth.authenticationLost(),fetcher:async(url,options)=>{
  if(String(url).endsWith('/login')||String(url).endsWith('/claim-guest')){loginSignal=options?.signal??undefined;return response.promise}
  if(String(url).endsWith('/session'))return Response.json(rotation==='login'?guest:sessionFixture('STUDENT'))
  if(/\/(history|active)(\?|$)/.test(String(url)))return Response.json({schema_version:'1.0',items:[],next_cursor:null})
  return Response.json([])
 }})
 const view=mountSfc(defineComponent({setup(){runtime.useLabConnection();return()=>null}}),pinia)
 try{
  for(let i=0;i<20&&!sockets.length;i++)await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(sockets.length,1)
  const oldClose=sockets[0]!.onclose!
  const pending=rotation==='login'?auth.login('learner','a sufficiently long password'):auth.claimGuest(true)
  oldClose({code:4401} as CloseEvent)
  const abortedBeforeReply=loginSignal?.aborted
  response.resolve(Response.json(sessionFixture('STUDENT')))
  assert.equal(await pending,true)
  assert.equal(abortedBeforeReply,false)
  assert.equal(auth.authenticated,true);assert.equal(auth.error,null)
  assert.equal(sockets.length,2)
  sockets[1]!.onclose!({code:4401} as CloseEvent)
  assert.equal(auth.session,null);assert.match(auth.error??'',/session has ended/)
 }finally{
  response.resolve(Response.json(sessionFixture('STUDENT')));view.app.unmount();await nextTick()
  globalThis.WebSocket=previousSocket
  if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window')
 }
})
