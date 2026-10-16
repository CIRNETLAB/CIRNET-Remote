export type { HealthResponse, CircuitValidationResult as CircuitValidation } from '../contracts/generated/dto'
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
