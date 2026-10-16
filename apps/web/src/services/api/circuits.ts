import type { CircuitGraph } from '../../types/circuit'
import type { CircuitValidation } from '../../types/api'
import { apiClient, type ApiClient } from './client'
import { parseExecutionPresentationResult, type ExecutionPresentationResult } from '../execution/presentation'
import { callOperation } from './operations'

/** Compatibility name for the existing preview endpoint. */
export type PhysicalPreview = ExecutionPresentationResult

export function createCircuitsApi(client: ApiClient) {
  return {
    async physicalPreview(circuit: CircuitGraph, signal?: AbortSignal): Promise<PhysicalPreview> {
      return parseExecutionPresentationResult(await callOperation(client,'previewCircuit',{body:circuit,signal}))
    },
    validate(circuit: CircuitGraph, signal?: AbortSignal): Promise<CircuitValidation> {
      return callOperation(client,'validateCircuit',{body:circuit,signal,acceptStatuses:[422]})
    },
  }
}
export const circuitsApi = createCircuitsApi(apiClient)
export const validateCircuit = circuitsApi.validate
