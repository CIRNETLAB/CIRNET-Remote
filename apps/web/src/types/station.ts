import { isRecord } from './api'
import type { ExperimentRecord, GeneratorCapability, GeneratorConfiguration, StationCapabilities } from './lab'
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
export function runtimeGeneratorIssue(target:StationDescriptor|null,active:ExperimentRecord|null,channel:number,connected:boolean):string|null {
  if(!connected||!target?.capabilities?.available||['unavailable','error'].includes(target.state)) return 'Station connection is unavailable.'
  const capability=target.capabilities.instrument_capabilities.generator
  if(capability.channels===0) return 'Generator is unavailable on the selected station.'
  if(!capability.runtime_reconfiguration_supported) return 'Generator configuration belongs to the execution plan; runtime changes are unavailable.'
  if(!active||active.state!=='RUNNING') return 'Live generator configuration requires a running experiment.'
  if(active.station_id!==target.station_id||active.mode!==target.mode) return 'Select the station running the active experiment.'
  if(!Number.isInteger(channel)||channel<1||channel>2||channel>capability.channels) return 'Generator channel is unavailable.'
  return null
}
export function generatorConfigurationIssue(capability:GeneratorCapability,configuration:GeneratorConfiguration):string|null {
  if(capability.supported_waveforms&&!capability.supported_waveforms.includes(configuration.waveform)) return 'Generator waveform is unavailable on the selected station.'
  if(capability.frequency_min_hz!==undefined&&configuration.frequency_hz<capability.frequency_min_hz
    ||capability.frequency_max_hz!==undefined&&configuration.frequency_hz>capability.frequency_max_hz) return 'Generator frequency exceeds the station profile limits.'
  if(capability.amplitude_max_vpp!==undefined&&configuration.amplitude_vpp>capability.amplitude_max_vpp) return 'Generator amplitude exceeds the station profile limit.'
  if(capability.offset_min_v!==undefined&&configuration.offset_v<capability.offset_min_v
    ||capability.offset_max_v!==undefined&&configuration.offset_v>capability.offset_max_v) return 'Generator offset exceeds the station profile limits.'
  return null
}
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
