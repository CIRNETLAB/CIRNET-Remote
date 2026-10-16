import { apiClient } from './client'
import { callOperation } from './operations'

export const assignmentsApi={
  get(id:string,signal?:AbortSignal){return callOperation(apiClient,'getAssignment',{path:{assignment_id:id},signal})},
  list(signal?:AbortSignal) {
    return callOperation(apiClient,'listAssignments',{signal})
  },
}
