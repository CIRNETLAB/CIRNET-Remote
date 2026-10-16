import type { ApiOperations } from '../../contracts/generated/operations'
import { apiClient,type ApiClient } from './client'
import { callOperation } from './operations'

export function createAuthApi(client:ApiClient) {
  return {
    session(signal?:AbortSignal){return callOperation(client,'getSession',{signal})},
    login(body:ApiOperations['login']['request'],signal?:AbortSignal){return callOperation(client,'login',{body,signal})},
    logout(signal?:AbortSignal){return callOperation(client,'logout',{body:{},signal})},
    claimGuest(signal?:AbortSignal){return callOperation(client,'claimGuest',{body:{confirm:true},signal})},
    listUsers(signal?:AbortSignal){return callOperation(client,'listUsers',{signal})},
    createUser(body:ApiOperations['createUser']['request'],signal?:AbortSignal){return callOperation(client,'createUser',{body,signal})},
    updateUser(principal_id:string,body:ApiOperations['updateUser']['request'],signal?:AbortSignal){return callOperation(client,'updateUser',{path:{principal_id},body,signal})},
  }
}
export const authApi=createAuthApi(apiClient)
