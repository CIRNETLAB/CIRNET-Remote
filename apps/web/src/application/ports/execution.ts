import type { CircuitGraph } from '../../types/circuit'

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

