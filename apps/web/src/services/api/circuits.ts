import type { CircuitGraph } from '../../types/circuit'
import { isRecord, type CircuitValidation } from '../../types/api'
import { apiClient, ApiError, type ApiClient } from './client'
import { parseExecutionPresentationResult, type ExecutionPresentationResult } from '../execution/presentation'

/** Compatibility name for the existing preview endpoint. */
export type PhysicalPreview = ExecutionPresentationResult

export function createCircuitsApi(client: ApiClient) {
  return {
    physicalPreview(circuit: CircuitGraph, signal?: AbortSignal): Promise<PhysicalPreview> {
      return client.request('/circuits/physical-preview', {
        method: 'POST', body: circuit, signal,
        parse(value) {
          try { return parseExecutionPresentationResult(value) }
          catch { throw new ApiError(0, 'INVALID_RESPONSE', 'The API returned an invalid execution presentation result.') }
        },
      })
    },
    validate(circuit: CircuitGraph, signal?: AbortSignal): Promise<CircuitValidation> {
      return client.request('/circuits/validate', {
        method: 'POST', body: circuit, signal, acceptStatuses: [422],
        parse(value) {
          if (!isRecord(value) || typeof value.valid !== 'boolean' || typeof value.code !== 'string' || typeof value.message !== 'string') {
            throw new ApiError(0, 'INVALID_RESPONSE', 'The API returned an invalid circuit validation result.')
          }
          return { valid: value.valid, code: value.code, message: value.message }
        },
      })
    },
  }
}
export const circuitsApi = createCircuitsApi(apiClient)
export const validateCircuit = circuitsApi.validate
