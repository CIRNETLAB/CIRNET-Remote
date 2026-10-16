import type { HealthResponse } from '../types/api'
import { apiClient } from './api/client'
import { callOperation } from './api/operations'
export { circuitsApi, validateCircuit } from './api/circuits'
export { stationsApi } from './api/stations'
export { experimentsApi } from './api/experiments'
export { ApiError } from './api/client'

export function health(signal?: AbortSignal): Promise<HealthResponse> {
  return callOperation(apiClient, 'getHealth', { signal })
}
