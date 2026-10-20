import { beforeEach,test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia,setActivePinia } from 'pinia'
import { useAuthStore } from '../src/stores/auth'
import { configureApiClient } from '../src/services/api/client'
import { deferred } from './helpers/capture'
import type {SessionView} from '../src/contracts/generated/dto'

const csrf=(token:string)=>token.padEnd(32,'-')
const session=(authenticated=false,role:'STUDENT'|'INSTRUCTOR'|'ADMIN'='STUDENT',token='guest-csrf'):SessionView=>({schema_version:'1.0',authenticated,
  principal:{principal_id:authenticated?'user-1':'guest-1',kind:authenticated?'USER':'GUEST',role,...(authenticated?{username:'learner',display_name:'Learner'}:{})},
  csrf_token:csrf(token),expires_at:1900000000,guest_enabled:true,claim_available:authenticated})
beforeEach(()=>setActivePinia(createPinia()))

test('session bootstrap is single flight and keeps identity and CSRF only in volatile state',async()=>{
  const response=deferred<Response>();let calls=0
  configureApiClient({fetcher:async()=>{calls++;return response.promise}})
  const auth=useAuthStore(),first=auth.bootstrap(),second=auth.bootstrap()
  response.resolve(Response.json(session()));await Promise.all([first,second])
  assert.equal(calls,1);assert.equal(auth.ready,true);assert.equal(auth.principal?.kind,'GUEST')
  assert.equal(auth.csrfToken,csrf('guest-csrf'));assert.equal(auth.authenticated,false)
  await auth.bootstrap();assert.equal(calls,1)
})

test('tracking proxy action contexts share bootstrap transport and cancel it on principal teardown',async()=>{
  const response=deferred<Response>();let calls=0,signal:AbortSignal|undefined
  configureApiClient({fetcher:async(_url,options)=>{calls++;signal=options?.signal??undefined;return response.promise}})
  const auth=useAuthStore(),first=new Proxy(auth,{}),second=new Proxy(auth,{})
  const bootstrap=auth.bootstrap.call(first),duplicate=auth.bootstrap.call(second)
  assert.equal(calls,1)
  auth.invalidate.call(second)
  assert.equal(signal?.aborted,true)
  response.resolve(Response.json(session(true,'ADMIN')));await Promise.all([bootstrap,duplicate])
  assert.equal(auth.session,null);assert.equal(auth.canAdmin,false)
})

test('login and logout rotate volatile session scope and use its current CSRF without automatic guest claim',async()=>{
  const auth=useAuthStore(),calls:{url:string;csrf:string|null}[]=[]
  configureApiClient({csrfToken:()=>auth.csrfToken,fetcher:async(url,options)=>{
    calls.push({url:String(url),csrf:new Headers(options?.headers).get('X-CSRF-Token')})
    return Response.json(String(url).endsWith('/login')?session(true,'STUDENT','user-csrf'):session())
  }})
  await auth.bootstrap();const guestEpoch=auth.connectionEpoch
  assert.equal(await auth.login('learner','a sufficiently long password'),true)
  assert.equal(auth.authenticated,true);assert.ok(auth.connectionEpoch>guestEpoch)
  assert.equal(await auth.logout(),true);assert.equal(auth.authenticated,false)
  assert.deepEqual(calls,[{url:'/api/auth/session',csrf:null},{url:'/api/auth/login',csrf:csrf('guest-csrf')},{url:'/api/auth/logout',csrf:csrf('user-csrf')}])
})

test('invalid credentials preserve the guest CSRF/session and surface an actionable error',async()=>{
  const auth=useAuthStore()
  configureApiClient({csrfToken:()=>auth.csrfToken,fetcher:async(url)=>String(url).endsWith('/login')
    ?Response.json({code:'INVALID_CREDENTIALS',message:'Username or password is incorrect.',request_id:'invalid-login'},{status:401}):Response.json(session())})
  await auth.bootstrap();assert.equal(await auth.login('learner','wrong password'),false)
  assert.equal(auth.csrfToken,csrf('guest-csrf'));assert.equal(auth.principal?.kind,'GUEST')
  assert.match(auth.error??'',/password/i);assert.equal(auth.pending,false)
})

test('principal teardown aborts pending authentication and cannot adopt its late old session',async()=>{
  const response=deferred<Response>();let signal:AbortSignal|undefined
  configureApiClient({fetcher:async(_url,options)=>{signal=options?.signal??undefined;return response.promise}})
  const auth=useAuthStore(),pending=auth.bootstrap()
  auth.invalidate('Session revoked.');const aborted=signal?.aborted
  response.resolve(Response.json(session(true,'ADMIN','old-admin-csrf')));await pending
  assert.equal(aborted,true);assert.equal(auth.session,null);assert.equal(auth.canAdmin,false)
  assert.equal(auth.error,'Session revoked.');assert.equal(auth.loading,false)
})

test('student and guest account state cannot dispatch administrator user queries',async()=>{
  let calls=0
  configureApiClient({fetcher:async()=>{calls++;return Response.json(session())}})
  const auth=useAuthStore();await auth.bootstrap();const before=calls
  assert.equal(await auth.loadUsers(),false);assert.equal(calls,before);assert.deepEqual(auth.users,[])
  assert.match(auth.error??'',/administrator/i)
})

test('late administrator lists cannot repopulate a signed-out principal cache',async()=>{
  const response=deferred<Response>()
  configureApiClient({fetcher:async(url)=>String(url).endsWith('/users')?response.promise:Response.json(session(true,'ADMIN','admin-csrf'))})
  const auth=useAuthStore();await auth.bootstrap();assert.equal(auth.canAdmin,true)
  const pending=auth.loadUsers();auth.invalidate()
  response.resolve(Response.json([{principal_id:'private-user',username:'private',display_name:'Private User',role:'STUDENT',active:true}]))
  await pending;assert.deepEqual(auth.users,[]);assert.equal(auth.canAdmin,false);assert.equal(auth.usersLoading,false)
})

test('a delayed prior-session HTTP rejection cannot cancel a successful pending session rotation',async()=>{
  const auth=useAuthStore(),response=deferred<Response>(),stale=deferred<Response>();auth.acceptSession(session())
  configureApiClient({csrfToken:()=>auth.csrfToken,onAuthenticationLost:()=>auth.authenticationLost(),fetcher:async url=>String(url).endsWith('/login')?response.promise:stale.promise})
  const {apiClient}=await import('../src/services/api/client')
  const oldRequest=apiClient.request('/old-read').catch(()=>undefined),pending=auth.login('learner','a sufficiently long password')
  stale.resolve(Response.json({code:'SESSION_EXPIRED',message:'Session expired.'},{status:401}));await oldRequest
  response.resolve(Response.json(session(true,'STUDENT','new-csrf')))
  assert.equal(await pending,true);assert.equal(auth.authenticated,true);assert.equal(auth.error,null)
  auth.authenticationLost();assert.equal(auth.session,null)
})

test('a failed rotation verifies the current cookie before restoring any prior session authority',async()=>{
  const auth=useAuthStore();auth.acceptSession(session(true,'STUDENT','old-csrf'));let reads=0
  configureApiClient({csrfToken:()=>auth.csrfToken,onAuthenticationLost:()=>auth.authenticationLost(),fetcher:async url=>{
    if(String(url).endsWith('/login'))throw new TypeError('Acknowledgement lost.')
    reads++;return Response.json({code:'SESSION_EXPIRED',message:'Session expired.'},{status:401})
  }})
  assert.equal(await auth.login('learner','a sufficiently long password'),false)
  assert.equal(reads,1);assert.equal(auth.session,null);assert.equal(auth.pending,false)
})

test('a lost rotation response adopts only a subsequently verified session and never replays the mutation',async()=>{
  const auth=useAuthStore();auth.acceptSession(session());const calls:string[]=[]
  configureApiClient({csrfToken:()=>auth.csrfToken,onAuthenticationLost:()=>auth.authenticationLost(),fetcher:async url=>{
    calls.push(String(url));if(String(url).endsWith('/login'))throw new TypeError('Acknowledgement lost.')
    return Response.json(session(true,'STUDENT','verified-csrf'))
  }})
  assert.equal(await auth.login('learner','a sufficiently long password'),false)
  assert.deepEqual(calls,['/api/auth/login','/api/auth/session']);assert.equal(auth.csrfToken,csrf('verified-csrf'));assert.equal(auth.authenticated,true)
  assert.match(auth.error??'',/Cannot reach/)
})

test('explicit teardown cancels failed-rotation verification and cannot adopt its late private session',async()=>{
  const auth=useAuthStore();auth.acceptSession(session());const verified=deferred<Response>();let reads=0,signal:AbortSignal|undefined
  configureApiClient({csrfToken:()=>auth.csrfToken,onAuthenticationLost:()=>auth.authenticationLost(),fetcher:async(url,options)=>{
    if(String(url).endsWith('/login'))throw new TypeError('Acknowledgement lost.')
    reads++;signal=options?.signal??undefined;return verified.promise
  }})
  const pending=auth.login('learner','a sufficiently long password')
  for(let i=0;i<20&&!reads;i++)await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(reads,1);auth.invalidate('Explicit principal teardown.');assert.equal(signal?.aborted,true)
  verified.resolve(Response.json(session(true,'ADMIN','late-private-csrf')))
  assert.equal(await pending,false);assert.equal(auth.session,null);assert.equal(auth.error,'Explicit principal teardown.')
})

test('a failed forced bootstrap clears the previously authorized role instead of reconnecting it unverified',async()=>{
  const auth=useAuthStore();auth.acceptSession(session(true,'ADMIN','old-admin-csrf'))
  configureApiClient({fetcher:async()=>{throw new TypeError('Session verification unavailable.')}})
  assert.equal(await auth.bootstrap(true),false)
  assert.equal(auth.session,null);assert.equal(auth.canAdmin,false);assert.equal(auth.ready,false)
  assert.equal(auth.loading,false);assert.match(auth.error??'',/Cannot reach/)
})
