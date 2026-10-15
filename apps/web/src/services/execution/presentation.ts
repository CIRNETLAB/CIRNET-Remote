import type { CircuitGraph } from '../../types/circuit'
import { isRecord } from '../../types/api'

/** Presentation data from an existing execution boundary, never a circuit solver. */
export interface ExecutionDeviceState {
  state: string
  reason?: string
  model?: string
  currentAmps?: number
  voltage?: number
  resistanceOhms?: number
}
export interface ExecutionPresentationResult {
  device_states: Record<string, ExecutionDeviceState>
  pin_values: Record<string, unknown>
  diagnostics: string[]
}
export type ExecutionPresentationAdapter = (graph: CircuitGraph, signal?: AbortSignal) => Promise<ExecutionPresentationResult>

export function parseExecutionPresentationResult(value: unknown): ExecutionPresentationResult {
  if (!isRecord(value) || !isRecord(value.device_states) || !isRecord(value.pin_values) || !Array.isArray(value.diagnostics)
    || value.diagnostics.some(message => typeof message !== 'string')
    || Object.values(value.device_states).some(state => !isRecord(state) || typeof state.state !== 'string'
      || ['reason', 'model'].some(key => key in state && typeof state[key] !== 'string')
      || ['currentAmps', 'voltage', 'resistanceOhms'].some(key => key in state && (typeof state[key] !== 'number' || !Number.isFinite(state[key]))))) {
    throw new Error('Invalid execution presentation result.')
  }
  return value as unknown as ExecutionPresentationResult
}
