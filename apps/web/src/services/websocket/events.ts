import { isRecord } from '../../types/api'
import { isStationDescriptor } from '../../types/station'
import { parseLab } from '../../contracts/validation'
import type { LegacyServerEvent, ServerEvent as VersionedServerEvent } from '../../contracts/generated/dto'

export type ServerEvent = VersionedServerEvent | LegacyServerEvent
export function isVersionedServerEvent(event: ServerEvent): event is VersionedServerEvent {
  return 'protocol_version' in event && event.protocol_version === '1.0'
}

/** Legacy envelopes are a named compatibility contract, never inferred version coercion. */
export function parseServerEvent(value: unknown): ServerEvent | null {
  try {
    const event = isRecord(value) && 'protocol_version' in value
      ? parseLab('ServerEvent', value)
      : parseLab('LegacyServerEvent', value)
    if (event.type === 'experiment.updated') {
      const experiment = parseLab('ExperimentRecord', event.experiment)
      if (isVersionedServerEvent(event) && (event.aggregate_id !== experiment.experiment_id || event.aggregate_revision !== experiment.revision)) return null
    }
    if (event.type === 'station.updated' && !isStationDescriptor(event.station)) return null
    return event
  } catch { return null }
}
