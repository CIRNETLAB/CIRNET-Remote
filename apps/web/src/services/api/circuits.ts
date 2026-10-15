import type { CircuitGraph } from '../../types/circuit'
import { isRecord, type CircuitValidation } from '../../types/api'
import { apiClient, ApiError, type ApiClient } from './client'

export interface PhysicalPreview {
  device_states: Record<string, { state: string; reason?: string; currentAmps?: number }>
  pin_values: Record<string, unknown>
  diagnostics: unknown[]
}

export function createCircuitsApi(client: ApiClient) {
  return {
    physicalPreview(circuit: CircuitGraph, signal?: AbortSignal): Promise<PhysicalPreview> {
      return client.request('/circuits/physical-preview', {
        method: 'POST', body: circuit, signal,
        parse(value) {
          if (!isRecord(value) || !isRecord(value.device_states) || !isRecord(value.pin_values) || !Array.isArray(value.diagnostics) || Object.values(value.device_states).some(s => !isRecord(s) || typeof s.state !== 'string')) throw new ApiError(0, 'INVALID_RESPONSE', 'The API returned an invalid physical simulation result.')
          return value as unknown as PhysicalPreview
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
