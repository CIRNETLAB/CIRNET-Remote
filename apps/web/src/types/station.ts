import { isRecord } from './api'
import type { StationCapabilities } from './lab'
import { parseLab } from './labValidation'

export const LAB_STATUSES = ['SIMULATION', 'HARDWARE_AVAILABLE', 'HARDWARE_BUSY', 'HARDWARE_OFFLINE', 'FAULT'] as const
export type LabStatus = typeof LAB_STATUSES[number]
export type HardwareMode = 'simulation' | 'hardware'
export type HardwareState = 'ready' | 'unavailable' | 'busy' | 'error'
export interface StationDescriptor {
  station_id: string
  mode: HardwareMode
  state: HardwareState
  capabilities?: StationCapabilities
}
export interface Station extends StationDescriptor { status: LabStatus }
export function canStationExecute(target:StationDescriptor|null):boolean {
  const caps=target?.capabilities
  return !!(target&&caps?.available&&target.state!=='unavailable'&&target.state!=='error'
    && (target.mode==='simulation'?caps.virtual_digital:caps.physical_digital&&caps.topology_scan_supported&&caps.safety_gate_supported&&caps.guarded_run_supported&&caps.physical_execution_slots>0))
}
export function isStationDescriptor(value: unknown): value is StationDescriptor {
  const descriptor = isRecord(value) && typeof value.station_id === 'string' && value.station_id.trim().length > 0
    && (value.mode === 'simulation' || value.mode === 'hardware')
    && typeof value.state === 'string' && ['ready', 'unavailable', 'busy', 'error'].includes(value.state)
  if(!descriptor) return false
  if(value.capabilities!==undefined) {
    try {
      const caps=parseLab<StationCapabilities>('StationCapabilities',value.capabilities)
      return caps.station_id===value.station_id && caps.mode===value.mode
    } catch { return false }
  }
  return true
}
export function stationStatus(station: StationDescriptor): LabStatus {
  if (station.state === 'error') return 'FAULT'
  if (station.state === 'unavailable') return 'HARDWARE_OFFLINE'
  if (station.state === 'busy') return 'HARDWARE_BUSY'
  return station.mode === 'simulation' ? 'SIMULATION' : 'HARDWARE_AVAILABLE'
}
