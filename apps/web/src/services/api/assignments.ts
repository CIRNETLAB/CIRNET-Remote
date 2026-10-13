import type { AssignmentDefinition } from '../../types/lab'
import { parseLab } from '../../types/labValidation'
import { apiClient, ApiError } from './client'

export const assignmentsApi={
  list(signal?:AbortSignal):Promise<AssignmentDefinition[]> {
    return apiClient.request('/assignments',{signal,parse(value) {
      if(!Array.isArray(value)) throw new ApiError(0,'INVALID_RESPONSE','Invalid assignment list.')
      return value.map(item=>parseLab<AssignmentDefinition>('AssignmentDefinition',item))
    }})
  },
}
