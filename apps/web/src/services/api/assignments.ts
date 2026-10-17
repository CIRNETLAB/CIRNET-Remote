import { apiClient,ApiError } from './client'
import { callOperation } from './operations'
async function versionedRead<T,U>(legacy:()=>Promise<T>,supported:()=>Promise<U>):Promise<T|U>{
  try{return await legacy()}catch(error){if(error instanceof ApiError&&error.status===422&&error.code==='UNSUPPORTED_DOCUMENT_VERSION')return supported();throw error}
}

export const assignmentsApi={
  get(id:string,signal?:AbortSignal){return versionedRead(()=>callOperation(apiClient,'getAssignment',{path:{assignment_id:id},signal}),()=>callOperation(apiClient,'getAssignmentV2',{path:{assignment_id:id},signal}))},
  list(signal?:AbortSignal) {
    return versionedRead(()=>callOperation(apiClient,'listAssignments',{signal}),()=>callOperation(apiClient,'listAssignmentsV2',{signal}))
  },
}
