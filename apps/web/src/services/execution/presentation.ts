import { isRecord } from '../../types/api'
import type { ExecutionPresentationResult } from '../../application/ports/execution'
export type { ExecutionDeviceState,ExecutionPresentationResult,ExecutionPresentationAdapter } from '../../application/ports/execution'

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
