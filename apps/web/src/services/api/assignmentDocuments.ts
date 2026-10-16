import type {AssignmentAuthoringSave,AssignmentAuthoringPublication,AssignmentDefinition} from '../../contracts/generated/dto'
import {apiClient} from './client'
import {callOperation} from './operations'
export const assignmentDocumentsApi={
 list(query:{limit?:number;cursor?:string|null}={},signal?:AbortSignal){return callOperation(apiClient,'listAssignmentDocuments',{query,signal})},
 get(id:string,signal?:AbortSignal){return callOperation(apiClient,'getAssignmentDocument',{path:{assignment_id:id},signal})},
 create(definition:AssignmentDefinition,signal?:AbortSignal){return callOperation(apiClient,'createAssignmentDocument',{body:{definition},signal})},
 save(id:string,body:AssignmentAuthoringSave,signal?:AbortSignal){return callOperation(apiClient,'saveAssignmentDocument',{path:{assignment_id:id},body,signal})},
 publish(id:string,body:AssignmentAuthoringPublication,signal?:AbortSignal){return callOperation(apiClient,'publishAssignmentDocument',{path:{assignment_id:id},body,signal})},
}
