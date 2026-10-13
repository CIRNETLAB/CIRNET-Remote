import { isRecord } from '../../types/api'
import { isStationDescriptor, type StationDescriptor } from '../../types/station'
import type { Experiment } from '../../types/experiment'
import { parseExperiment } from '../api/experiments'

export type ServerEvent =
  | { type: 'hello'; service: string }
  | { type: 'echo'; payload: string }
  | { type: 'station.updated'; station: StationDescriptor }
  | { type: 'experiment.updated'; experiment: Experiment }

export function parseServerEvent(value: unknown): ServerEvent | null {
  if (!isRecord(value)) return null
  if (value.type === 'hello' && typeof value.service === 'string') return { type: 'hello', service: value.service }
  if (value.type === 'echo' && typeof value.payload === 'string') return { type: 'echo', payload: value.payload }
  if (value.type === 'station.updated' && isStationDescriptor(value.station)) return { type: 'station.updated', station: value.station }
  if(value.type==='experiment.updated') {
    try {return {type:'experiment.updated',experiment:parseExperiment(value.experiment)}} catch {return null}
  }
  return null
}
