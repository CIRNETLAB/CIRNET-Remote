import type {AssignmentAuthoringSaveV2,AssignmentAuthoringPublicationV2} from '../../contracts/generated/dto'
import type {AssignmentDefinition} from '../../types/assignment'
import {apiClient,ApiError} from './client'
import {callOperation} from './operations'
async function versionedRead<T,U>(legacy:()=>Promise<T>,supported:()=>Promise<U>):Promise<T|U>{
 try{return await legacy()}catch(error){if(error instanceof ApiError&&error.status===422&&error.code==='UNSUPPORTED_DOCUMENT_VERSION')return supported();throw error}
}
export const assignmentDocumentsApi={
 list(query:{limit?:number;cursor?:string|null}={},signal?:AbortSignal){return versionedRead(()=>callOperation(apiClient,'listAssignmentDocuments',{query,signal}),()=>callOperation(apiClient,'listAssignmentDocumentsV2',{query,signal}))},
 get(id:string,signal?:AbortSignal){return versionedRead(()=>callOperation(apiClient,'getAssignmentDocument',{path:{assignment_id:id},signal}),()=>callOperation(apiClient,'getAssignmentDocumentV2',{path:{assignment_id:id},signal}))},
 create(definition:AssignmentDefinition,signal?:AbortSignal){return definition.schema_version==='2.0'?callOperation(apiClient,'createAssignmentDocumentV2',{body:{definition},signal}):callOperation(apiClient,'createAssignmentDocument',{body:{definition},signal})},
 save(id:string,body:AssignmentAuthoringSaveV2,signal?:AbortSignal,version:'1.0'|'2.0'='1.0'){return version==='2.0'||body.definition.schema_version==='2.0'?callOperation(apiClient,'saveAssignmentDocumentV2',{path:{assignment_id:id},body,signal}):callOperation(apiClient,'saveAssignmentDocument',{path:{assignment_id:id},body:{base_revision:body.base_revision,definition:body.definition},signal})},
 publish(id:string,body:AssignmentAuthoringPublicationV2,signal?:AbortSignal,version:'1.0'|'2.0'='1.0'){return version==='2.0'?callOperation(apiClient,'publishAssignmentDocumentV2',{path:{assignment_id:id},body,signal}):callOperation(apiClient,'publishAssignmentDocument',{path:{assignment_id:id},body,signal})},
}
