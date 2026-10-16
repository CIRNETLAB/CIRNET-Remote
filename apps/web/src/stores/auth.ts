import { StoreScopeMap } from '../services/session/storeScope'
import { defineStore } from 'pinia'
import type { SessionView,UserView } from '../contracts/generated/dto'
import type { ApiOperations } from '../contracts/generated/operations'
import { authApi } from '../services/api/auth'
import { errorMessage } from '../services/api/client'
import { parseLab } from '../contracts/validation'

const requests=new StoreScopeMap<AbortController>(),administration=new StoreScopeMap<AbortController>()
const bootstraps=new StoreScopeMap<Promise<boolean>>()
function cancel(map:WeakMap<object,AbortController>,owner:object) {map.get(owner)?.abort();map.delete(owner)}
export const useAuthStore=defineStore('auth',{
  state:()=>({session:null as SessionView|null,ready:false,loading:false,pending:false,error:null as string|null,connectionEpoch:0,users:[] as UserView[],usersLoading:false}),
  getters:{csrfToken:state=>state.session?.csrf_token??null,principal:state=>state.session?.principal??null,
    authenticated:state=>state.session?.authenticated??false,canAdmin:state=>state.session?.authenticated===true&&state.session.principal?.role==='ADMIN'},
  actions:{
    acceptSession(value:SessionView) {
      const next=parseLab('SessionView',value),previous=this.session
      const changed=!previous||previous.csrf_token!==next.csrf_token||previous.authenticated!==next.authenticated||JSON.stringify(previous.principal)!==JSON.stringify(next.principal)
      this.session=next;this.ready=true
      if(changed) {this.users=[];this.connectionEpoch++}
    },
    async changeSession(call:(signal:AbortSignal)=>Promise<SessionView>,bootstrap=false):Promise<boolean> {
      cancel(requests,this);cancel(administration,this);this.usersLoading=false
      const controller=new AbortController();requests.set(this,controller)
      this.loading=bootstrap;this.pending=!bootstrap;this.error=null
      try {
        const value=await call(controller.signal)
        if(controller.signal.aborted||requests.get(this)!==controller) return false
        this.acceptSession(value);return true
      } catch(error) {
        if(controller.signal.aborted||requests.get(this)!==controller) return false
        const message=errorMessage(error)
        if(bootstrap) {this.invalidate(message);return false}
        if(!bootstrap) {
          // A lost mutation response may still have rotated the cookie. Verify
          // that identity once before reconnecting; never replay the mutation.
          try {
            const verified=await authApi.session(controller.signal)
            if(controller.signal.aborted||requests.get(this)!==controller) return false
            this.acceptSession(verified)
          } catch {
            if(!controller.signal.aborted&&requests.get(this)===controller)
              this.invalidate('Your session could not be verified. Retry the session before continuing.')
            return false
          }
        }
        if(!controller.signal.aborted&&requests.get(this)===controller) this.error=message
        return false
      } finally {if(requests.get(this)===controller) {requests.delete(this);this.loading=false;this.pending=false}}
    },
    bootstrap(force=false):Promise<boolean> {
      const pending=bootstraps.get(this)
      if(pending&&!force) return pending
      if(this.ready&&this.session&&!force) return Promise.resolve(true)
      const promise=this.changeSession(signal=>authApi.session(signal),true)
      bootstraps.set(this,promise)
      void promise.then(()=>{if(bootstraps.get(this)===promise) bootstraps.delete(this)})
      return promise
    },
    async login(username:string,password:string):Promise<boolean> {
      if(!this.session&&!await this.bootstrap()) return false
      return this.changeSession(signal=>authApi.login({username,password},signal))
    },
    async logout():Promise<boolean> {
      if(!this.session&&!await this.bootstrap()) return false
      return this.changeSession(signal=>authApi.logout(signal))
    },
    async claimGuest(confirm:boolean):Promise<boolean> {
      if(confirm!==true||!this.authenticated||!this.session?.claim_available) {this.error='Confirm transfer of this guest session before continuing.';return false}
      return this.changeSession(signal=>authApi.claimGuest(signal))
    },
    async requestUsers(call:(signal:AbortSignal)=>Promise<UserView[]>,replace:boolean):Promise<boolean> {
      if(!this.canAdmin) {this.error='Administrator access is required.';return false}
      if(this.usersLoading) return false
      cancel(administration,this)
      const controller=new AbortController(),epoch=this.connectionEpoch;administration.set(this,controller)
      this.usersLoading=true;this.error=null
      try {
        const users=await call(controller.signal)
        if(controller.signal.aborted||epoch!==this.connectionEpoch||!this.canAdmin) return false
        this.users=replace?users:[...this.users.filter(user=>!users.some(next=>next.principal_id===user.principal_id)),...users]
        return true
      } catch(error) {if(!controller.signal.aborted&&epoch===this.connectionEpoch) this.error=errorMessage(error);return false}
      finally {if(administration.get(this)===controller) {administration.delete(this);this.usersLoading=false}}
    },
    loadUsers():Promise<boolean> {return this.requestUsers(signal=>authApi.listUsers(signal),true)},
    createUser(body:ApiOperations['createUser']['request']):Promise<boolean> {return this.requestUsers(async signal=>[await authApi.createUser(body,signal)],false)},
    async updateUser(id:string,body:ApiOperations['updateUser']['request']):Promise<boolean> {
      const changed=await this.requestUsers(async signal=>[await authApi.updateUser(id,body,signal)],false)
      if(changed&&this.principal?.principal_id===id) await this.bootstrap(true)
      return changed
    },
    authenticationLost(message?:string) {
      // Prior-session HTTP/WS failures can race a successful rotation. Pending
      // rotations keep remote work retired and verify any failed outcome above.
      if(!this.pending) this.invalidate(message)
    },
    invalidate(message='Your session has ended. Sign in to continue.') {
      cancel(requests,this);cancel(administration,this);bootstraps.delete(this)
      this.session=null;this.ready=false;this.loading=false;this.pending=false;this.users=[];this.usersLoading=false;this.error=message;this.connectionEpoch++
    },
  },
})
